"use strict";

// E1.4 (c) ospec close: settle the living document, refuse while anything is
// pending and archive the change transactionally (openspec/specs/idd/spec.md,
// REQ-idd-004, REQ-idd-009, REQ-idd-017), and derive the knowledge records a
// cross-session memory may keep (REQ-idd-024).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { EVIDENCE_MARKERS, validateState } = require("./idd-contract.js");
const { archiveChange, archiveName, closeChange, knowledgeRecords, livingDocStatus, renderEvidence } = require("./idd-close.js");
const { IddRecordError, recordIntent, recordSignal } = require("./idd-record.js");
const { serializeState } = require("./idd-store.js");

const TREE = `sha256:${"a".repeat(64)}`;
const AT = "2026-10-05T08:00:00.000Z";

function openTypo() {
  return recordIntent(null, { change: "fix-typo", kind: "docs", summary: "Fix a typo.", acceptance: "No typo.", noOpenFacts: true, basis: "The request fixes every behavior." }).state;
}

function satisfyChecks(state) {
  const next = structuredClone(state);
  next.runs = [{ id: "run-1", purpose: "checks", name: "test", command: "npm test", exit_code: 0, output_sha256: TREE, tree: TREE, recorded_at: AT }];
  next.evidence.push({ id: "ev-1", kind: "check-run", obligation: "checks-pass", recorded_at: AT, detail: { tree: TREE, runs: ["run-1"] } });
  next.obligations[0] = { ...next.obligations[0], status: "satisfied", evidence: ["ev-1"] };
  return next;
}

function assertCode(fn, code) {
  assert.throws(fn, (error) => error instanceof IddRecordError && error.code === code);
}

const DOC = [
  "# add-paging",
  "",
  "## Intent and acceptance",
  "",
  "Page the list.",
  "",
  "## Plan",
  "",
  "1. Count pages.",
  "",
  "## Decisions",
  "",
  "- Round up.",
  "",
  "## Evidence",
  "",
  EVIDENCE_MARKERS.start,
  EVIDENCE_MARKERS.end,
  "",
].join("\n");

test("close settles the change and names its archive by the close date", () => {
  const { state } = closeChange(satisfyChecks(openTypo()), { closedAt: AT });
  assert.strictEqual(state.status, "closed");
  assert.strictEqual(state.closed_at, AT);
  assert.strictEqual(archiveName(state), "2026-10-05-fix-typo");
  assert.ok(validateState(state).ok, validateState(state).errors.join("; "));
});

test("close is refused while an obligation is pending or a gate is open", () => {
  assertCode(() => closeChange(openTypo(), { closedAt: AT }), "close-refused");
  const gated = satisfyChecks(openTypo());
  gated.gates.push({ id: "irreversible-operation", status: "open" });
  assert.throws(() => closeChange(gated, { closedAt: AT }), /gate:irreversible-operation/);
  let bug = recordSignal(satisfyChecks(openTypo()), { id: "bug-fix", reason: "bug", source: "declaration" }).state;
  assert.throws(() => closeChange(bug, { closedAt: AT }), /repro-test/);
  bug = { ...bug, status: "closed" };
  assertCode(() => closeChange(bug, { closedAt: AT }), "change-closed");
});

test("the living document must keep its sections with a plan and decisions", () => {
  assert.deepStrictEqual(livingDocStatus(DOC), { ok: true, reason: null });
  assert.match(livingDocStatus(DOC.replace("1. Count pages.", "")).reason, /Plan is empty/);
  assert.match(livingDocStatus(DOC.replace("- Round up.", "  ")).reason, /Decisions is empty/);
  assert.match(livingDocStatus(DOC.replace("## Plan", "## Steps")).reason, /sections .* in that order/);
  assert.match(livingDocStatus(DOC.replace(EVIDENCE_MARKERS.end, "")).reason, /evidence markers/);
  assert.match(livingDocStatus(null).reason, /change.md is missing/);
});

test("closing with living-doc records its evidence and writes only between the markers", () => {
  let state = satisfyChecks(openTypo());
  state = recordSignal(state, { id: "multi-unit-or-decision", reason: "declared 2 work units", source: "declaration" }).state;
  assertCode(() => closeChange(state, { closedAt: AT, livingDoc: livingDocStatus(DOC.replace("1. Count pages.", "")) }), "close-refused");

  const { state: closed } = closeChange(state, { closedAt: AT, livingDoc: livingDocStatus(DOC) });
  const entry = closed.evidence.find((item) => item.kind === "living-doc-current");
  assert.strictEqual(entry.obligation, "living-doc");
  assert.ok(validateState(closed).ok, validateState(closed).errors.join("; "));

  const rendered = renderEvidence(DOC, closed);
  assert.strictEqual(rendered.slice(0, rendered.indexOf(EVIDENCE_MARKERS.start)), DOC.slice(0, DOC.indexOf(EVIDENCE_MARKERS.start)));
  assert.match(rendered, /- ev-1: check-run for checks-pass/);
  assert.match(rendered, /- ev-2: living-doc-current for living-doc/);
  assert.strictEqual(renderEvidence(rendered, closed), rendered, "rendering twice changes nothing");
});

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "idd-close-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function writeChange(root, state, extra = {}) {
  const dir = path.join(root, "idd", state.change);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "state.yaml"), serializeState(state));
  for (const [name, content] of Object.entries(extra)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
}

test("archiving moves the closed change with the same inventory and is resumable", async (t) => {
  const root = tempRoot(t);
  const { state } = closeChange(satisfyChecks(openTypo()), { closedAt: AT });
  const origin = writeChange(root, state, { "change.md": DOC });

  const receipt = await archiveChange(root, state);
  assert.strictEqual(receipt.destination, "idd/archive/2026-10-05-fix-typo");
  assert.strictEqual(receipt.already_complete, false);
  assert.match(receipt.inventory_sha256, /^sha256:/);
  assert.strictEqual(receipt.files, 2);
  assert.ok(!fs.existsSync(origin));
  assert.strictEqual(fs.readFileSync(path.join(root, receipt.destination, "change.md"), "utf8"), DOC);

  const again = await archiveChange(root, state);
  assert.strictEqual(again.already_complete, true);
  assert.strictEqual(again.inventory_sha256, receipt.inventory_sha256);
});

test("an interrupted copy finishes by removing an identical origin and refuses a different one", async (t) => {
  const root = tempRoot(t);
  const { state } = closeChange(satisfyChecks(openTypo()), { closedAt: AT });
  writeChange(root, state);
  const destination = path.join(root, "idd", "archive", "2026-10-05-fix-typo");
  fs.mkdirSync(destination, { recursive: true });
  fs.copyFileSync(path.join(root, "idd", "fix-typo", "state.yaml"), path.join(destination, "state.yaml"));

  const resumed = await archiveChange(root, state);
  assert.strictEqual(resumed.already_complete, false);
  assert.ok(!fs.existsSync(path.join(root, "idd", "fix-typo")));

  writeChange(root, state, { "extra.txt": "different" });
  await assert.rejects(() => archiveChange(root, state), (error) => error.code === "archive-conflict");
});

test("REQ-idd-017 names the refusals, the resume marker and the archive layout", () => {
  const spec = fs.readFileSync(path.join(__dirname, "..", "..", "openspec", "specs", "idd", "spec.md"), "utf8");
  const start = spec.indexOf("{#REQ-idd-017}");
  assert.ok(start !== -1, "REQ-idd-017 is missing");
  const end = spec.indexOf("### Requirement:", start);
  const section = spec.slice(start, end === -1 ? undefined : end);
  for (const name of ["evidence-stale", "close-refused", "archive-conflict", "already_complete", "closed_at", "status: closed", "idd/archive/<YYYY-MM-DD>-<change-id>/"]) {
    assert.ok(section.includes(`\`${name}\``), `REQ-idd-017 must name ${name}`);
  }
});

test("only a closed change is archived", async (t) => {
  const root = tempRoot(t);
  const open = satisfyChecks(openTypo());
  writeChange(root, open);
  await assert.rejects(() => archiveChange(root, open), (error) => error.code === "change-open");
});

// E3.5 knowledge records (REQ-idd-024).

const DESTINATION = "idd/archive/2026-10-05-add-paging";

function decisionsDoc(lines) {
  return DOC.replace("- Round up.", lines.join("\n"));
}

test("each decision of change.md is a record with its provenance and stable topic", () => {
  const livingDoc = decisionsDoc([
    "- **Pages round up:** a partial page counts as a page.",
    "  The last page may hold one item.",
    "",
    "* Empty lists have zero pages. Not one.",
    "- A plain decision whose first sentence is far too long to be a title, because it keeps going well beyond eighty characters",
  ]);
  const state = { change: "add-paging", closed_at: AT };
  const records = knowledgeRecords({ state, livingDoc, destination: DESTINATION });
  assert.deepStrictEqual(records[0], {
    kind: "dc",
    topic: "knowledge/dc/add-paging/1",
    title: "Pages round up",
    summary: "**Pages round up:** a partial page counts as a page. The last page may hold one item.",
    source: `${DESTINATION}/change.md`,
    change: "add-paging",
    date: "2026-10-05",
  });
  assert.strictEqual(records[1].title, "Empty lists have zero pages.");
  assert.strictEqual(records[1].topic, "knowledge/dc/add-paging/2");
  assert.strictEqual(records[2].title.length, 80);
  assert.ok(records[2].title.endsWith("…"));
  assert.strictEqual(records.length, 3);
});

test("impacts other than none and the new ADRs they attach are records; nothing else is", () => {
  const state = {
    change: "async-events",
    closed_at: AT,
    impacts: [
      { kind: "adr", id: "0002", impact: "none", reason: "No state change." },
      { kind: "scenario", id: "offline-operation", impact: "conforms", reason: "Works offline." },
      { kind: "adr", id: "0004", impact: null },
      { kind: "adr", id: "0003", impact: "amends", reason: "Events cross modules.", record: "docs/architecture/decisions/0012-async-events.md" },
    ],
  };
  const adrTitles = new Map([["docs/architecture/decisions/0012-async-events.md", "0012. Async events between modules"]]);
  const records = knowledgeRecords({ state, livingDoc: null, destination: "idd/archive/2026-10-05-async-events", adrTitles });
  assert.deepStrictEqual(
    records.map(({ kind, topic, title, source }) => ({ kind, topic, title, source })),
    [
      { kind: "impact", topic: "knowledge/impact/async-events/scenario-offline-operation", title: "conforms quality scenario offline-operation", source: "idd/archive/2026-10-05-async-events/state.yaml" },
      { kind: "impact", topic: "knowledge/impact/async-events/adr-0003", title: "amends ADR 0003", source: "idd/archive/2026-10-05-async-events/state.yaml" },
      { kind: "adr", topic: "knowledge/adr/0012", title: "0012. Async events between modules", source: "docs/architecture/decisions/0012-async-events.md" },
    ],
  );
  assert.strictEqual(records[2].summary, "amends ADR 0003: Events cross modules.");
  const untitled = knowledgeRecords({ state, livingDoc: null, destination: "x" });
  assert.strictEqual(untitled[2].title, "0012");
});

test("a change without decisions or impacts has no records", () => {
  const state = { change: "fix-typo", closed_at: AT };
  assert.deepStrictEqual(knowledgeRecords({ state, livingDoc: DOC.replace("- Round up.", ""), destination: DESTINATION }), []);
  assert.deepStrictEqual(knowledgeRecords({ state, livingDoc: null, destination: DESTINATION }), []);
});
