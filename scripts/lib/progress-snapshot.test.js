"use strict";

// E5.10 the progress snapshot v1 that `ospec snapshot` exports on demand
// (openspec/specs/idd/spec.md, REQ-idd-026): roadmap phases, their status
// from the IDD and SDD changes on disk, and the rules of the format.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  MAX_BYTES,
  MAX_PHASES,
  MAX_TITLE,
  PHASE_ID_PATTERN,
  STATUSES,
  SnapshotError,
  buildSnapshot,
  parseRoadmap,
  phaseStatuses,
  plainText,
  serializeSnapshot,
} = require("./progress-snapshot.js");

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA_DIR = path.join(ROOT, "schemas", "progress-snapshot");

const ROADMAP = [
  "# Roadmap",
  "",
  "| Change | Content | ADRs |",
  "| --- | --- | --- |",
  "| P1a. Platform | Scaffold and CI | 0001 |",
  "| P1b. **Operator** | Sign-in | 0002 |",
  "| P1b.1. Access `revocation` | Revoke a person | 0002 |",
  "",
  "## Milestones",
  "",
  "| Milestone | Content |",
  "|:--|--:|",
  "| M1. [Docs](https://example.test/docs) | Published docs |",
  "",
  "## Deferred decisions",
  "",
  "| Decision | Owner |",
  "| --- | --- |",
  "| Billing provider | Operator |",
  "",
].join("\n");

function fail(code, fn) {
  assert.throws(fn, (error) => error instanceof SnapshotError && error.code === code);
}

function tempProject(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-snapshot-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    const full = path.join(root, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (content !== null) fs.writeFileSync(full, content);
  }
  return root;
}

test("[REQ-idd-026] each row whose first cell is '<ID>. <title>' is a phase, in roadmap order", () => {
  assert.deepStrictEqual(parseRoadmap(ROADMAP, "docs/roadmap.md"), [
    { id: "p1a", title: "Platform", line: 5 },
    { id: "p1b", title: "Operator", line: 6 },
    { id: "p1b.1", title: "Access revocation", line: 7 },
    { id: "m1", title: "Docs", line: 13 },
  ]);
});

test("[REQ-idd-026] tables inside code fences and tables without phase rows are ignored", () => {
  const fenced = ["```md", "| Change | Content |", "| --- | --- |", "| X1. Example | Not a phase |", "```", "", ROADMAP].join("\n");
  assert.deepStrictEqual(
    parseRoadmap(fenced, "r.md").map((phase) => phase.id),
    ["p1a", "p1b", "p1b.1", "m1"],
  );
  // Rows without a leading pipe are table rows too.
  assert.deepStrictEqual(parseRoadmap("Phase | Content\n--- | ---\nA1. Alpha | x\n", "r.md"), [{ id: "a1", title: "Alpha", line: 3 }]);
});

test("[REQ-idd-026] a roadmap without any phase is unrecognized, and a table that mixes rows is invalid", () => {
  fail("roadmap-unrecognized", () => parseRoadmap("# Roadmap\n\nNothing planned yet.\n", "r.md"));
  fail("roadmap-unrecognized", () => parseRoadmap("| Decision | Owner |\n| --- | --- |\n| Billing | Operator |\n", "r.md"));
  assert.throws(
    () => parseRoadmap("| Phase | Content |\n| --- | --- |\n| A1. Alpha | x |\n| Beta without id | y |\n", "docs/roadmap.md"),
    (error) => error.code === "roadmap-invalid" && /docs\/roadmap\.md:4/.test(error.message),
  );
});

test("[REQ-idd-026] the title loses inline Markdown, collapses spaces and is NFC; an invalid one is refused, never cut", () => {
  assert.strictEqual(plainText("  **Bold**  _em_ `code` ~~gone~~ [link](u) ![img](i) a\\|b  "), "Bold em code gone link img a|b");
  assert.strictEqual(plainText("snake_case_name"), "snake_case_name");
  assert.strictEqual(plainText("Café"), "Café");
  const row = (title) => `| Phase |\n| --- |\n| A1. ${title} |\n`;
  assert.strictEqual(parseRoadmap(row("x".repeat(MAX_TITLE)), "r.md")[0].title.length, MAX_TITLE);
  assert.throws(() => parseRoadmap(row("x".repeat(MAX_TITLE + 1)), "r.md"), (error) => error.code === "roadmap-invalid" && /r\.md:3/.test(error.message));
  fail("roadmap-invalid", () => parseRoadmap(row("Bell\u0007"), "r.md"));
  // A title that is empty once clean leaves the row without '<ID>. <title>'.
  fail("roadmap-invalid", () => parseRoadmap("| P |\n| --- |\n| A1. Alpha |\n| A2. [](x) |\n", "r.md"));
});

test("[REQ-idd-026] phase ids are unique by id and by link key, and at most 64 characters", () => {
  fail("roadmap-invalid", () => parseRoadmap("| P |\n| --- |\n| A1. One |\n| a1. Two |\n", "r.md"));
  // s1.2 and s12 would claim the same changes.
  fail("roadmap-invalid", () => parseRoadmap("| P |\n| --- |\n| S1.2. One |\n| S12. Two |\n", "r.md"));
  assert.strictEqual(parseRoadmap(`| P |\n| --- |\n| ${"a".repeat(64)}. Long |\n`, "r.md")[0].id.length, 64);
  fail("roadmap-invalid", () => parseRoadmap(`| P |\n| --- |\n| ${"a".repeat(65)}. Too long |\n`, "r.md"));
});

test("[REQ-idd-026] an active change wins, then an archived one; the longest key owns a change", () => {
  const phases = [
    { id: "p1", title: "One" },
    { id: "p1-a", title: "One A" },
    { id: "p1b.1", title: "Revocation" },
    { id: "m1", title: "Docs" },
    { id: "m2", title: "Billing" },
  ];
  const changes = [
    { id: "p1-setup", archived: true },
    { id: "p1-a-fix", archived: false },
    { id: "p1b1-revocation", archived: true },
    { id: "p1b1-follow-up", archived: false },
    { id: "m1", archived: true },
    { id: "m10-later", archived: false },
    { id: "unrelated", archived: false },
  ];
  assert.deepStrictEqual(
    phaseStatuses(phases, changes).map(({ id, status }) => [id, status]),
    [
      ["p1", "done"],
      ["p1-a", "in-progress"],
      ["p1b.1", "in-progress"],
      ["m1", "done"],
      ["m2", "pending"],
    ],
  );
});

test("[REQ-idd-026] the snapshot holds only schemaVersion and phases, and refuses more than 100 phases or 64 KiB", () => {
  const phases = [{ id: "a1", title: "Alpha", status: "done" }];
  const text = serializeSnapshot(phases);
  assert.deepStrictEqual(JSON.parse(text), { schemaVersion: 1, phases });
  assert.ok(text.endsWith("}\n"));
  const many = Array.from({ length: MAX_PHASES + 1 }, (_, index) => ({ id: `a${index}`, title: "T", status: "pending" }));
  fail("snapshot-limit", () => serializeSnapshot(many));
  // A title counts characters, the limit counts UTF-8 bytes.
  const heavy = Array.from({ length: MAX_PHASES }, (_, index) => ({ id: `a${index}`, title: "\u{1F600}".repeat(MAX_TITLE), status: "pending" }));
  assert.ok(Buffer.byteLength(JSON.stringify({ schemaVersion: 1, phases: heavy })) > MAX_BYTES);
  fail("snapshot-limit", () => serializeSnapshot(heavy));
});

test("[REQ-idd-026] buildSnapshot reads the roadmap and the IDD and SDD trees by directory name only", (t) => {
  const root = tempProject(t, {
    "docs/roadmap.md": ROADMAP,
    // IDD: P1a archived; P1b archived and P1b.1 active. No state is read.
    "idd/config.yaml": "checks:\n  test: npm test\n",
    "idd/archive/2026-01-02-p1a-platform/state.yaml": "not json",
    "idd/archive/2026-01-03-p1b-operator/.keep": "",
    "idd/p1b1-revocation/state.yaml": "{}",
    "idd/archive/not-dated/.keep": "",
    // SDD: M1 active.
    "openspec/changes/m1-docs/.keep": "",
    "openspec/changes/archive/2026-01-04-other/.keep": "",
  });
  const { snapshot, text } = buildSnapshot({ root });
  assert.deepStrictEqual(snapshot, {
    schemaVersion: 1,
    phases: [
      { id: "p1a", title: "Platform", status: "done" },
      { id: "p1b", title: "Operator", status: "done" },
      { id: "p1b.1", title: "Access revocation", status: "in-progress" },
      { id: "m1", title: "Docs", status: "in-progress" },
    ],
  });
  assert.strictEqual(text, `${JSON.stringify(snapshot, null, 2)}\n`);
});

test("[REQ-idd-026] a missing roadmap is refused, and another roadmap is read with roadmap", (t) => {
  const root = tempProject(t, { "plans/phases.md": "| P |\n| --- |\n| Z9. Last |\n" });
  assert.throws(() => buildSnapshot({ root }), (error) => error.code === "roadmap-missing" && /docs\/roadmap\.md/.test(error.message));
  assert.deepStrictEqual(buildSnapshot({ root, roadmap: "plans/phases.md" }).snapshot.phases, [{ id: "z9", title: "Last", status: "pending" }]);
});

test("[REQ-idd-026] the published schema and fixtures carry the same rules as the module", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, "v1.schema.json"), "utf8"));
  const { $id, title, description, ...rules } = schema;
  assert.strictEqual($id, "ospec://schemas/progress-snapshot/v1");
  assert.deepStrictEqual(rules, {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    required: ["schemaVersion", "phases"],
    properties: {
      schemaVersion: { const: 1 },
      phases: {
        type: "array",
        minItems: 1,
        maxItems: MAX_PHASES,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "title", "status"],
          properties: {
            id: { type: "string", pattern: PHASE_ID_PATTERN.source },
            title: { type: "string", minLength: 1, maxLength: MAX_TITLE },
            status: { enum: STATUSES },
          },
        },
      },
    },
  });
  const valid = fs.readFileSync(path.join(SCHEMA_DIR, "fixtures", "valid.json"), "utf8");
  assert.strictEqual(serializeSnapshot(JSON.parse(valid).phases), valid);
  const invalid = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, "fixtures", "invalid.json"), "utf8"));
  fail("snapshot-invalid", () => serializeSnapshot(invalid.phases));
});
