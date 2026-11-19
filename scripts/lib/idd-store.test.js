"use strict";

// E1.2 ospec-cli-core: filesystem adapter for idd/<change-id>/state.yaml
// (openspec/specs/idd/spec.md, REQ-idd-002, REQ-idd-003, REQ-idd-011).
// Writes are locked, atomic and idempotent; an interrupted write never
// corrupts the committed state.

const test = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { DECISIONS_MARKERS, EVIDENCE_MARKERS, LIVING_DOC_SECTIONS, LOG_MARKERS, PLAN_MARKERS } = require("./idd-contract.js");
const { livingDocStatus } = require("./idd-close.js");
const { recordGate, recordIntent, recordPlan, recordRetract, recordSignal } = require("./idd-record.js");
const { listChanges, mutateChange, readChange, renderLivingDoc, serializeState, statePath } = require("./idd-store.js");

const BUG = { change: "fix-pagination", kind: "bug", summary: "Fix the last page.", acceptance: "Two full pages.", noOpenFacts: true, basis: "The request fixes every behavior." };

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "idd-store-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

const openBug = (state) => recordIntent(state, BUG);
const addBugFix = (state) => recordSignal(state, { id: "bug-fix", reason: "intent kind bug", source: "declaration" });

test("the state lives in idd/<change-id>/state.yaml as canonical JSON", async (t) => {
  const root = tempRoot(t);
  const { state, changed } = await mutateChange(root, "fix-pagination", openBug);
  assert.strictEqual(changed, true);
  assert.strictEqual(statePath(root, "fix-pagination"), path.join(root, "idd", "fix-pagination", "state.yaml"));

  const raw = fs.readFileSync(statePath(root, "fix-pagination"), "utf8");
  assert.strictEqual(raw, serializeState(state));
  assert.ok(raw.endsWith("\n"));
  assert.deepStrictEqual(Object.keys(JSON.parse(raw)), [
    "schema",
    "change",
    "mode",
    "status",
    "intent",
    "facts",
    "signals",
    "obligations",
    "gates",
    "evidence",
  ]);
  assert.deepStrictEqual(await readChange(root, "fix-pagination"), state);
});

test("repeating a record leaves the file byte-identical and untouched", async (t) => {
  const root = tempRoot(t);
  await mutateChange(root, "fix-pagination", openBug);
  await mutateChange(root, "fix-pagination", addBugFix);
  const file = statePath(root, "fix-pagination");
  const before = fs.readFileSync(file, "utf8");
  const mtime = fs.statSync(file).mtimeMs;

  const again = await mutateChange(root, "fix-pagination", addBugFix);
  assert.strictEqual(again.changed, false);
  assert.strictEqual(fs.readFileSync(file, "utf8"), before);
  assert.strictEqual(fs.statSync(file).mtimeMs, mtime);
  assert.strictEqual(JSON.parse(before).signals.filter((s) => s.id === "bug-fix").length, 1);
});

test("an interrupted write keeps the committed state and the next record succeeds", async (t) => {
  const root = tempRoot(t);
  const committed = (await mutateChange(root, "fix-pagination", openBug)).state;
  const file = statePath(root, "fix-pagination");

  const crashingWriter = async (target, content) => {
    await fsp.writeFile(`${target}.tmp`, content.slice(0, 20), "utf8");
    throw new Error("simulated crash before rename");
  };
  await assert.rejects(mutateChange(root, "fix-pagination", addBugFix, { writeFile: crashingWriter }), /simulated crash/);

  assert.deepStrictEqual(await readChange(root, "fix-pagination"), committed);
  assert.ok(!fs.existsSync(`${file}.lock`), "the lock is released after a failed write");

  // A crashed writer's temporary file goes away once it is older than 5 s.
  const past = new Date(Date.now() - 60000);
  fs.utimesSync(`${file}.tmp`, past, past);
  const { state } = await mutateChange(root, "fix-pagination", addBugFix);
  assert.deepStrictEqual(state.signals.map((s) => s.id), ["always", "bug-fix"]);
  assert.ok(!fs.existsSync(`${file}.tmp`));
});

test("an orphaned backup left by a crash on rename is restored on read", async (t) => {
  const root = tempRoot(t);
  const committed = (await mutateChange(root, "fix-pagination", openBug)).state;
  const file = statePath(root, "fix-pagination");
  fs.renameSync(file, `${file}.bak`);

  assert.deepStrictEqual(await readChange(root, "fix-pagination"), committed);
  assert.ok(fs.existsSync(file));
});

test("concurrent identical records produce one entry", async (t) => {
  const root = tempRoot(t);
  await mutateChange(root, "fix-pagination", openBug);
  const results = await Promise.all([1, 2, 3].map(() => mutateChange(root, "fix-pagination", addBugFix)));
  assert.deepStrictEqual(results.map((r) => r.changed).sort(), [false, false, true]);
  const state = await readChange(root, "fix-pagination");
  assert.deepStrictEqual(state.obligations.map((o) => o.id), ["checks-pass", "repro-test"]);
});

test("an invalid result is never written", async (t) => {
  const root = tempRoot(t);
  await mutateChange(root, "fix-pagination", openBug);
  const before = fs.readFileSync(statePath(root, "fix-pagination"), "utf8");
  const corrupting = (state) => ({ state: { ...state, route: "standard" }, changed: true });
  await assert.rejects(mutateChange(root, "fix-pagination", corrupting), /unknown field: route/);
  assert.strictEqual(fs.readFileSync(statePath(root, "fix-pagination"), "utf8"), before);
});

test("a reducer must keep the change id of its directory", async (t) => {
  const root = tempRoot(t);
  await assert.rejects(mutateChange(root, "other-change", openBug), /does not match/);
  assert.ok(!fs.existsSync(statePath(root, "other-change")));
});

test("a change id that is not kebab-case never reaches the filesystem", async (t) => {
  const root = tempRoot(t);
  for (const id of ["../escape", "a/b", "Fix", ""]) {
    await assert.rejects(mutateChange(root, id, openBug), (error) => error.code === "invalid-change-id", id);
    await assert.rejects(readChange(root, id), (error) => error.code === "invalid-change-id", id);
  }
  assert.ok(!fs.existsSync(path.join(root, "escape")));
  assert.ok(!fs.existsSync(path.join(root, "idd")));
});

test("unreadable or invalid state is reported, never silently replaced", async (t) => {
  const root = tempRoot(t);
  const file = statePath(root, "broken");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "schema: idd-state/v1\nchange: broken\n");
  await assert.rejects(readChange(root, "broken"), (error) => error.code === "state-unreadable");
  await assert.rejects(mutateChange(root, "broken", openBug), (error) => error.code === "state-unreadable");
  assert.strictEqual(fs.readFileSync(file, "utf8"), "schema: idd-state/v1\nchange: broken\n");
});

// E1.46 state-durability: a write whose lock another process took over is
// refused, and two processes recording at once lose nothing.
test("a write whose lock was taken over is refused with lock-lost and leaves the state as it was", async (t) => {
  const root = tempRoot(t);
  await mutateChange(root, "fix-pagination", openBug);
  const file = statePath(root, "fix-pagination");
  const before = fs.readFileSync(file, "utf8");

  await assert.rejects(
    mutateChange(root, "fix-pagination", (state) => {
      fs.writeFileSync(`${file}.lock`, "4242:another-owner");
      return addBugFix(state);
    }),
    (error) => error.code === "lock-lost",
  );

  assert.strictEqual(fs.readFileSync(file, "utf8"), before);
  assert.strictEqual(fs.readFileSync(`${file}.lock`, "utf8"), "4242:another-owner");
});

test("two processes recording on one change at once lose no write", async (t) => {
  const root = tempRoot(t);
  await mutateChange(root, "fix-pagination", openBug);
  const writer = `
    const { mutateChange } = require(${JSON.stringify(path.join(__dirname, "idd-store.js"))});
    const { recordAssumption } = require(${JSON.stringify(path.join(__dirname, "idd-record.js"))});
    (async () => {
      for (let index = 0; index < 15; index += 1) {
        await mutateChange(process.argv[1], "fix-pagination", (state) => recordAssumption(state, { text: process.argv[2] + "-" + index }));
      }
    })().catch((error) => { console.error(error); process.exit(1); });
  `;
  const run = (name) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, ["-e", writer, root, name], { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk) => (stderr += chunk));
      child.on("close", (code) => resolve({ code, stderr }));
    });

  const results = await Promise.all([run("first"), run("second")]);

  for (const result of results) assert.strictEqual(result.code, 0, result.stderr);
  const { assumptions } = await readChange(root, "fix-pagination");
  const expected = ["first", "second"].flatMap((name) => Array.from({ length: 15 }, (_, index) => `${name}-${index}`));
  assert.deepStrictEqual([...assumptions].sort(), expected.sort());
});

// The turn fence of retractions adds recorded_turn to signals and the fence of
// the answer to retractions: a state written before keeps working.
test("[REQ-idd-008] a state written before the retraction fence keeps working, and every write stamps what it records", async (t) => {
  const root = tempRoot(t);
  const reason = "persistent data: src/a.js uses writeFile";
  const answer = { id: "persistent-data", reason: "no stored data", confirmedBy: reason, answerable: true, hits: ["src/a.js uses writeFile: w()"], answer: "No stored data.", source: "user" };
  // As the previous version wrote it: no turn on its signals.
  const previous = recordSignal(addBugFix(openBug(null).state).state, { id: "persistent-data", reason, source: "diff" }).state;
  fs.mkdirSync(path.dirname(statePath(root, "fix-pagination")), { recursive: true });
  fs.writeFileSync(statePath(root, "fix-pagination"), serializeState(previous));
  fs.mkdirSync(path.join(root, ".ospec"));
  fs.writeFileSync(path.join(root, ".ospec", "turns"), "4\n");

  assert.deepStrictEqual((await readChange(root, "fix-pagination")).signals.map((signal) => signal.recorded_turn), [undefined, undefined, undefined]);
  const { state, unverified } = await mutateChange(root, "fix-pagination", (current) => recordRetract(current, answer));
  assert.strictEqual(unverified, undefined, "a signal recorded before the fence keeps the source of its answer");
  assert.deepStrictEqual(state.retracted.at(-1).answer_source, "user");
  assert.ok(!["recorded_turn", "resolved_turn", "declared_source"].some((key) => key in state.retracted.at(-1)));

  // A signal recorded now takes the turn, and its retraction in the same turn is fenced.
  const again = await mutateChange(root, "fix-pagination", (current) => recordSignal(current, { id: "security-boundary", reason: "security boundary: src/a.js adds code evaluation (CWE-94)", source: "diff" }));
  assert.strictEqual(again.state.signals.find((signal) => signal.id === "security-boundary").recorded_turn, 4);
  const sink = { ...answer, id: "security-boundary", confirmedBy: "security boundary: src/a.js adds code evaluation (CWE-94)", hits: ["src/a.js adds code evaluation (CWE-94): eval(F)"], answer: "F is a constant." };
  const fenced = await mutateChange(root, "fix-pagination", (current) => recordRetract(current, sink));
  assert.deepStrictEqual(fenced.unverified.map(({ retract, obligation }) => [retract, obligation]), [["security-boundary", "trust-review"]]);
  assert.deepStrictEqual((await readChange(root, "fix-pagination")).retracted.at(-1).answer_source, "user-unverified");
});

test("listChanges returns open and closed changes in id order, skipping the archive", async (t) => {
  const root = tempRoot(t);
  for (const change of ["b-change", "a-change"]) {
    await mutateChange(root, change, (state) => recordIntent(state, { ...BUG, change }));
  }
  fs.mkdirSync(path.join(root, "idd", "archive", "2026-10-05-old"), { recursive: true });
  fs.mkdirSync(path.join(root, "idd", "empty-dir"), { recursive: true });
  assert.deepStrictEqual((await listChanges(root)).map((s) => s.change), ["a-change", "b-change"]);
  assert.deepStrictEqual(await listChanges(tempRoot(t)), []);
  assert.strictEqual(await readChange(root, "missing"), null);
});

test("the living document is created from the template only when living-doc is active, and never overwritten", async (t) => {
  const root = tempRoot(t);
  const doc = path.join(root, "idd", "fix-pagination", "change.md");
  await mutateChange(root, "fix-pagination", openBug);
  assert.ok(!fs.existsSync(doc));

  const addDoc = (state) => recordSignal(state, { id: "multi-unit-or-decision", reason: "two units", source: "declaration" });
  await mutateChange(root, "fix-pagination", addDoc);
  const template = fs.readFileSync(doc, "utf8");
  let cursor = 0;
  for (const heading of LIVING_DOC_SECTIONS) {
    const at = template.indexOf(`## ${heading}`, cursor);
    assert.ok(at >= cursor, `section ${heading} in order`);
    cursor = at;
  }
  assert.ok(template.indexOf(EVIDENCE_MARKERS.start) > template.indexOf("## Evidence"));
  assert.ok(template.indexOf(EVIDENCE_MARKERS.end) > template.indexOf(EVIDENCE_MARKERS.start));
  assert.ok(template.includes("Fix the last page."));

  fs.writeFileSync(doc, "edited by the model\n");
  await mutateChange(root, "fix-pagination", addDoc);
  assert.strictEqual(fs.readFileSync(doc, "utf8"), "edited by the model\n");
});

// E4.16: the CLI writes the declared plan and decisions between its markers in
// change.md, after every write; the rest of the document stays the model's.
test("the CLI writes the declared plan and decisions of change.md between its markers", async (t) => {
  const root = tempRoot(t);
  const doc = path.join(root, "idd", "fix-pagination", "change.md");
  const declare = (plan) => (state) => {
    const planned = recordPlan(state, plan);
    return planned.state.signals.some((signal) => signal.id === "multi-unit-or-decision")
      ? planned
      : { state: recordSignal(planned.state, { id: "multi-unit-or-decision", reason: "declared a non-obvious decision", source: "declaration" }).state, changed: true };
  };
  await mutateChange(root, "fix-pagination", openBug);
  await mutateChange(root, "fix-pagination", declare({ paths: ["src/pages.js"], workUnits: 2, decisions: ["Round up a partial page."] }));
  const created = fs.readFileSync(doc, "utf8");
  assert.ok(created.includes(`${PLAN_MARKERS.start}\n- Files: \`src/pages.js\`\n- Work units: 2\n${PLAN_MARKERS.end}`), created);
  assert.ok(created.includes(`${DECISIONS_MARKERS.start}\n- Round up a partial page.\n${DECISIONS_MARKERS.end}`), created);

  // Hand text outside the markers and CRLF line endings stay; a repeated
  // decision is written once; a multi-line one keeps its lines.
  fs.writeFileSync(doc, created.replace(PLAN_MARKERS.start, `1. Count pages.\n${PLAN_MARKERS.start}`).replace(/\n/g, "\r\n"));
  await mutateChange(root, "fix-pagination", declare({ paths: ["test/pages.test.js"], decisions: [" Round up a partial page. ", "Empty lists have zero pages.\nNot one."] }));
  const updated = fs.readFileSync(doc, "utf8");
  assert.ok(updated.includes("1. Count pages.\r\n<!-- ospec:plan:start -->\r\n- Files: `src/pages.js`, `test/pages.test.js`\r\n"), updated);
  assert.ok(updated.includes("- Round up a partial page.\r\n- Empty lists have zero pages.\r\n  Not one.\r\n<!-- ospec:decisions:end -->"), updated);
  assert.ok(!/[^\r]\n/.test(updated), "CRLF kept");
  const state = await readChange(root, "fix-pagination");
  assert.deepStrictEqual(state.plan.decisions, ["Round up a partial page.", "Empty lists have zero pages.\nNot one."]);

  // A document without the markers, as older changes have, is left alone.
  fs.writeFileSync(doc, "edited by the model\n");
  await mutateChange(root, "fix-pagination", declare({ decisions: ["Another one."] }));
  assert.strictEqual(fs.readFileSync(doc, "utf8"), "edited by the model\n");
});

// E1.77: the CLI writes the user's request and every answer the state keeps
// between the log markers, oldest first, each text literal and quoted.
const LOG_STATE = Object.freeze({
  change: "fix-pagination",
  intent: { request: "the last page is short", requested_at: "2026-11-17T10:00:00.000Z" },
  plan: { paths: ["src/pages.js"], work_units: 1, operations: [], decisions: ["Round up a partial page."] },
  gates: [
    { id: "checks-changed", status: "resolved", answer: "approve the new test command", source: "user", resolved_at: "2026-11-17T12:00:00.000Z" },
    { id: "open-facts", status: "resolved", answer: "round up\n\nand never show page zero", source: "user", resolved_at: "2026-11-17T11:00:00.000Z" },
    { id: "review-limit", status: "resolved", answer: "one more", source: "user-unverified" },
    { id: "irreversible-operation", status: "open", reason: "drop the cache" },
  ],
  retracted: [
    { id: "multi-unit-or-decision", reason: "two units", source: "declaration", retract_reason: "one unit" },
    { id: "persistent-data", reason: "r", source: "diff", retract_reason: "build output", answer: "only dist/ is written", answer_source: "user", resolved_at: "2026-11-17T11:30:00.000Z" },
  ],
});

const LOG_DOC = [
  "# fix-pagination", "", "## Intent and acceptance", "", "Fix the last page.", "",
  "## Request and answers", "", LOG_MARKERS.start, LOG_MARKERS.end, "",
  "## Plan", "", PLAN_MARKERS.start, PLAN_MARKERS.end, "",
  "## Decisions", "", DECISIONS_MARKERS.start, DECISIONS_MARKERS.end, "",
  "## Evidence", "", EVIDENCE_MARKERS.start, EVIDENCE_MARKERS.end, "",
].join("\n");

function logOf(text) {
  return text.slice(text.indexOf(LOG_MARKERS.start) + LOG_MARKERS.start.length + 1, text.lastIndexOf(LOG_MARKERS.end));
}

test("the log holds the request and every answer of the user, numbered by the time of the answer", () => {
  const rendered = renderLivingDoc(LOG_DOC, LOG_STATE);
  assert.strictEqual(logOf(rendered), [
    "Request (2026-11-17T10:00:00.000Z):", "", "> the last page is short", "",
    "Answer 1 — review-limit, user-unverified, no date:", "", "> one more", "",
    "Answer 2 — open-facts, user, 2026-11-17T11:00:00.000Z:", "", "> round up", ">", "> and never show page zero", "",
    "Answer 3 — retract persistent-data, user, 2026-11-17T11:30:00.000Z:", "", "> only dist/ is written", "",
    "Answer 4 — checks-changed, user, 2026-11-17T12:00:00.000Z:", "", "> approve the new test command", "",
  ].join("\n"));
  assert.strictEqual(renderLivingDoc(rendered, LOG_STATE), rendered, "rendering twice changes nothing");
  assert.deepStrictEqual(livingDocStatus(rendered), { ok: true, reason: null });

  // A later answer takes the next number and leaves the others as they were.
  const later = structuredClone(LOG_STATE);
  Object.assign(later.gates[3], { status: "resolved", answer: "yes", source: "user", resolved_at: "2026-11-17T13:00:00.000Z" });
  const next = logOf(renderLivingDoc(rendered, later));
  assert.ok(next.startsWith(logOf(rendered)), next);
  assert.ok(next.endsWith("Answer 5 — irreversible-operation, user, 2026-11-17T13:00:00.000Z:\n\n> yes\n"), next);

  // Without a request or an answer the block stays empty.
  const silent = renderLivingDoc(LOG_DOC, { ...LOG_STATE, intent: {}, gates: [], retracted: [] });
  assert.ok(silent.includes(`${LOG_MARKERS.start}\n${LOG_MARKERS.end}`), silent);
});

test("an answer that holds a marker or a heading stays quoted inside the log", () => {
  const hostile = structuredClone(LOG_STATE);
  hostile.intent.request = [LOG_MARKERS.end, "## Plan", PLAN_MARKERS.start, "- Files: `evil.js`", PLAN_MARKERS.end, EVIDENCE_MARKERS.start].join("\r\n");
  const rendered = renderLivingDoc(LOG_DOC, hostile);
  assert.ok(rendered.includes(`${PLAN_MARKERS.start}\n- Files: \`src/pages.js\`\n${PLAN_MARKERS.end}`), rendered);
  assert.ok(rendered.includes(`> ${LOG_MARKERS.end}\n> ## Plan\n> ${PLAN_MARKERS.start}`), rendered);
  assert.deepStrictEqual(livingDocStatus(rendered), { ok: true, reason: null });
  assert.strictEqual(renderLivingDoc(rendered, hostile), rendered);
});

test("a document opened before the log gets the section before its Plan, keeping its line endings and its text", () => {
  const legacy = LOG_DOC.replace(`## Request and answers\n\n${LOG_MARKERS.start}\n${LOG_MARKERS.end}\n\n`, "").replace(/\n/g, "\r\n");
  const rendered = renderLivingDoc(legacy, LOG_STATE);
  assert.ok(!/[^\r]\n/.test(rendered), "CRLF kept");
  const lf = rendered.replace(/\r\n/g, "\n");
  assert.strictEqual(lf, renderLivingDoc(LOG_DOC, LOG_STATE), "the same document a new change writes");
  assert.deepStrictEqual(livingDocStatus(rendered), { ok: true, reason: null });

  // A heading without its markers keeps its text, and close refuses it.
  const unmarked = LOG_DOC.replace(`${LOG_MARKERS.start}\n${LOG_MARKERS.end}\n`, "Edited by hand.\n");
  const kept = renderLivingDoc(unmarked, LOG_STATE);
  assert.ok(kept.includes("## Request and answers\n\nEdited by hand.\n"), kept);
  assert.match(livingDocStatus(kept).reason, /log markers/);
});

test("the template carries the log, and every write of the state renders it", async (t) => {
  const root = tempRoot(t);
  const doc = path.join(root, "idd", "fix-pagination", "change.md");
  const AT = "2026-11-17T10:00:00.000Z";
  await mutateChange(root, "fix-pagination", () => recordIntent(null, { ...BUG, request: "the last page is short", recordedAt: AT }));
  await mutateChange(root, "fix-pagination", (state) => recordSignal(state, { id: "multi-unit-or-decision", reason: "two units", source: "declaration" }));
  assert.ok(fs.readFileSync(doc, "utf8").includes(`${LOG_MARKERS.start}\nRequest (${AT}):\n\n> the last page is short\n${LOG_MARKERS.end}`));
  await mutateChange(root, "fix-pagination", (state) => recordGate(state, { id: "irreversible-operation", action: "open", reason: "drop the cache" }));
  await mutateChange(root, "fix-pagination", (state) => recordGate(state, { id: "irreversible-operation", action: "resolve", answer: "yes", source: "user-unverified", recordedAt: "2026-11-17T11:00:00.000Z" }));
  assert.ok(fs.readFileSync(doc, "utf8").includes("Answer 1 — irreversible-operation, user-unverified, 2026-11-17T11:00:00.000Z:\n\n> yes\n<!-- ospec:log:end -->"));
});
