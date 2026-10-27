"use strict";

// E5.11 the progress snapshot v2 that `ospec snapshot --schema-version 2`
// exports on demand (openspec/specs/idd/spec.md, REQ-idd-026): the groups of
// the roadmap, the client texts of the progress file, its refusals and the
// rules of the format.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { MAX_PHASES, MAX_TITLE, PHASE_ID_PATTERN, SnapshotError, buildSnapshot, roadmapPhases } = require("./progress-snapshot.js");
const {
  MAX_GROUPS,
  MAX_OUTCOMES,
  MAX_REQUESTS,
  MAX_SHORT,
  MAX_TASKS,
  MAX_TEXT,
  MAX_URL,
  buildSnapshotV2,
  derivedId,
  parseProgress,
  roadmapGroups,
  serializeSnapshotV2,
} = require("./progress-snapshot-v2.js");
const { validateInstance } = require("./kernel-schema-validator.js");

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA_DIR = path.join(ROOT, "schemas", "progress-snapshot");

const ROADMAP = [
  "# Roadmap",
  "",
  "## S1. Base",
  "",
  "| Change | Content |",
  "| --- | --- |",
  "| S1a. Platform | Scaffold |",
  "| S1b. Access | Sign-in |",
  "",
  "### Notes",
  "",
  "| Change | Content |",
  "| --- | --- |",
  "| S1c. Clients | Invitations |",
  "",
  "## Milestones",
  "",
  "| Milestone | Content |",
  "| --- | --- |",
  "| M1. Docs | Published docs |",
  "",
  "## Deferred decisions",
  "",
  "| Decision | Owner |",
  "| --- | --- |",
  "| Billing provider | Operator |",
  "",
].join("\n");

const PROGRESS = [
  "# Progress",
  "",
  "Free notes before the first section are ignored.",
  "",
  "```md",
  "## S9. Not a group: inside a fence",
  "```",
  "",
  "## S1. The base",
  "",
  "What every client needs to sign in",
  "and see their **project**.",
  "",
  "### S1a. The platform",
  "",
  "- short: Platform",
  "- start: 2026-01-05",
  "- end: 2026-01-16",
  "- preview: https://preview.example.com/a_b",
  "",
  "The project lives online, with a [preview](https://example.com) of",
  "  every change.",
  "",
  "#### Tasks",
  "",
  "- [x] domain: Own domain: with its certificate",
  "- [X] Previews: A preview of every change",
  "",
  "#### Outcomes",
  "",
  "- Open the preview",
  "  from any browser",
  "",
  "### S1b.",
  "",
  "#### Tasks",
  "",
  "- [ ] invite: Invite a person",
  "",
  "## Milestones.",
  "",
  "Later work.",
  "",
  "## Requests",
  "",
  "### logo. Send the logo",
  "",
  "- due: 2026-01-30",
  "- phase: S1B",
  "",
  "An SVG file works best.",
  "",
  "### colors. Pick the colors",
  "",
].join("\n");

function fail(code, fn) {
  assert.throws(fn, (error) => error instanceof SnapshotError && error.code === code);
}

function refused(code, line, pattern, fn) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof SnapshotError, error.stack);
    assert.strictEqual(error.code, code, error.message);
    assert.match(error.message, new RegExp(`:${line}: `), error.message);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

function tempProject(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-snapshot-v2-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    const full = path.join(root, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

function groupsOf(text) {
  return roadmapGroups(roadmapPhases(text, "r.md"), "r.md");
}

// The roadmap context parseProgress checks the progress file against.
function context(statuses = {}) {
  const { groups, groupOf } = groupsOf(ROADMAP);
  const phases = new Map(["s1a", "s1b", "s1c", "m1"].map((id) => [id, { status: statuses[id] ?? "pending", group: groupOf.get(id) }]));
  return { groups: new Set(groups.map((group) => group.id)), phases };
}

// A progress file with one phase S1a under its group, plus `lines` inside it.
function phaseFile(...lines) {
  return ["## S1.", "", "### S1a. The platform", "", ...lines, ""].join("\n");
}

test("[REQ-idd-026] groups are the '##' headings of phase tables, in order, until the next '#' or '##'", () => {
  const { groups, groupOf } = groupsOf(ROADMAP);
  assert.deepStrictEqual(groups, [
    { id: "s1", title: "Base", line: 3 },
    { id: "milestones", title: "Milestones", line: 16 },
  ]);
  assert.deepStrictEqual([...groupOf], [
    ["s1a", "s1"],
    ["s1b", "s1"],
    ["s1c", "s1"],
    ["m1", "milestones"],
  ]);
  assert.deepStrictEqual(groupsOf("| P |\n| --- |\n| A1. Alpha |\n"), { groups: [], groupOf: new Map() });
  // A '#' heading closes the group: a phase after it sits outside every group.
  refused("roadmap-invalid", 8, /phase b1 sits outside every '##' group/, () => groupsOf("## A\n| P |\n| --- |\n| A1. Alpha |\n# Next\n| P |\n| --- |\n| B1. Beta |\n"));
});

test("[REQ-idd-026] a heading without '<ID>.' derives its id; an unusable or repeated group is refused", () => {
  assert.strictEqual(derivedId("Hitos"), "hitos");
  assert.strictEqual(derivedId("Fase 2: Diseño y UX"), "fase-2-diseno-y-ux");
  assert.strictEqual(derivedId("  Ñandú — ¿Qué? "), "nandu-que");
  assert.deepStrictEqual(groupsOf("## **E5.** Platform\n| P |\n| --- |\n| A1. Alpha |\n").groups, [{ id: "e5", title: "Platform", line: 1 }]);
  const table = "| P |\n| --- |\n";
  refused("roadmap-invalid", 1, /must match/, () => groupsOf(`## ¿?\n${table}| A1. Alpha |\n`));
  refused("roadmap-invalid", 1, /write it as '<ID>\. <title>'/, () => groupsOf(`## ${"word ".repeat(14)}\n${table}| A1. Alpha |\n`));
  refused("roadmap-invalid", 1, /title of group a/, () => groupsOf(`## A.\n${table}| A1. Alpha |\n`));
  refused("roadmap-invalid", 1, /title of group a/, () => groupsOf(`## A. ${"x".repeat(MAX_TITLE + 1)}\n${table}| A1. Alpha |\n`));
  refused("roadmap-invalid", 5, /group id hitos repeats the group of line 1/, () => groupsOf(`## Hitos\n${table}| A1. Alpha |\n## HITOS\n${table}| B1. Beta |\n`));
});

test("[REQ-idd-026] the progress file gives each group and phase its client texts, and the requests", () => {
  const texts = parseProgress(PROGRESS, "docs/progress.md", context({ s1a: "done" }));
  assert.deepStrictEqual([...texts.groups.values()], [
    { id: "s1", line: 9, title: "The base", summary: "What every client needs to sign in and see their project." },
    { id: "milestones", line: 40, summary: "Later work." },
  ]);
  const s1a = texts.phases.get("s1a");
  assert.strictEqual(s1a.title, "The platform");
  assert.strictEqual(s1a.shortTitle, "Platform");
  assert.strictEqual(s1a.start, "2026-01-05");
  assert.strictEqual(s1a.end, "2026-01-16");
  // The URL is kept as written; the paragraph joins its lines and loses its Markdown.
  assert.strictEqual(s1a.previewUrl, "https://preview.example.com/a_b");
  assert.strictEqual(s1a.summary, "The project lives online, with a preview of every change.");
  assert.deepStrictEqual(s1a.tasks.map(({ id, title, done }) => ({ id, title, done })), [
    { id: "domain", title: "Own domain: with its certificate", done: true },
    { id: "previews", title: "A preview of every change", done: true },
  ]);
  assert.deepStrictEqual(s1a.outcomes, ["Open the preview from any browser"]);
  const s1b = texts.phases.get("s1b");
  assert.strictEqual(s1b.title, undefined);
  assert.deepStrictEqual(s1b.tasks.map(({ id, done }) => [id, done]), [["invite", false]]);
  assert.deepStrictEqual(texts.requests.map(({ id, title, phase, due, body }) => ({ id, title, phase, due, body })), [
    { id: "logo", title: "Send the logo", phase: "s1b", due: "2026-01-30", body: "An SVG file works best." },
    { id: "colors", title: "Pick the colors", phase: undefined, due: undefined, body: undefined },
  ]);
});

test("[REQ-idd-026] buildSnapshotV2 joins the roadmap, the changes and the progress file in the order of the schema", (t) => {
  const root = tempProject(t, {
    "docs/roadmap.md": ROADMAP,
    "docs/progress.md": PROGRESS,
    "idd/archive/2026-01-02-s1a-platform/.keep": "",
    "idd/s1b-access/.keep": "",
  });
  const { progress, snapshot, text } = buildSnapshotV2({ root, roadmap: "docs/roadmap.md" });
  assert.strictEqual(progress, "docs/progress.md");
  assert.deepStrictEqual(snapshot, {
    schemaVersion: 2,
    groups: [
      { id: "s1", title: "The base", summary: "What every client needs to sign in and see their project." },
      { id: "milestones", title: "Milestones", summary: "Later work." },
    ],
    phases: [
      {
        id: "s1a",
        title: "The platform",
        status: "done",
        group: "s1",
        shortTitle: "Platform",
        start: "2026-01-05",
        end: "2026-01-16",
        summary: "The project lives online, with a preview of every change.",
        tasks: [
          { id: "domain", title: "Own domain: with its certificate", done: true },
          { id: "previews", title: "A preview of every change", done: true },
        ],
        outcomes: ["Open the preview from any browser"],
        previewUrl: "https://preview.example.com/a_b",
      },
      { id: "s1b", title: "Access", status: "in-progress", group: "s1", tasks: [{ id: "invite", title: "Invite a person", done: false }] },
      { id: "s1c", title: "Clients", status: "pending", group: "s1" },
      { id: "m1", title: "Docs", status: "pending", group: "milestones" },
    ],
    requests: [
      { id: "logo", phase: "s1b", title: "Send the logo", body: "An SVG file works best.", due: "2026-01-30" },
      { id: "colors", title: "Pick the colors" },
    ],
  });
  assert.strictEqual(text, `${JSON.stringify(snapshot, null, 2)}\n`);
  assert.deepStrictEqual(validateInstance(JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, "v2.schema.json"), "utf8")), snapshot), { valid: true, errors: [] });
});

test("[REQ-idd-026] without a progress file the v2 holds only groups and phases; a named one must exist", (t) => {
  const root = tempProject(t, { "plans/roadmap.md": "| P |\n| --- |\n| A1. Alpha |\n" });
  const built = buildSnapshotV2({ root, roadmap: "plans/roadmap.md" });
  assert.strictEqual(built.progress, null);
  assert.deepStrictEqual(built.snapshot, { schemaVersion: 2, phases: [{ id: "a1", title: "Alpha", status: "pending" }] });
  assert.throws(
    () => buildSnapshotV2({ root, roadmap: "plans/roadmap.md", progress: "plans/progress.md" }),
    (error) => error.code === "progress-missing" && /plans\/progress\.md/.test(error.message) && /--progress/.test(error.how),
  );
  fail("roadmap-missing", () => buildSnapshotV2({ root, roadmap: "docs/roadmap.md" }));
});

test("[REQ-idd-026] the v1 ignores groups and the progress file", (t) => {
  const plain = ROADMAP.split("\n").filter((line) => !line.startsWith("#")).join("\n");
  const grouped = tempProject(t, { "docs/roadmap.md": ROADMAP, "docs/progress.md": PROGRESS });
  const bare = tempProject(t, { "docs/roadmap.md": plain });
  assert.strictEqual(buildSnapshot({ root: grouped }).text, buildSnapshot({ root: bare }).text);
});

test("[REQ-idd-026] a progress file out of its syntax is refused at the line of its first problem", () => {
  const cases = [
    ["a phase the roadmap lacks", phaseFile().replace("S1a.", "S9."), 3, /phase s9 is not a phase of the roadmap/],
    ["a group the roadmap lacks", "## S9. Other\n", 1, /group s9 is not a group of the roadmap/],
    ["a phase under another group", "## Milestones.\n\n### S1a.\n", 3, /phase s1a goes under the '##' heading of group s1/],
    ["a phase outside every group", "### S1a.\n", 1, /phase s1a goes under the '##' heading of group s1/],
    ["a repeated phase", `${phaseFile()}\n### S1a.\n`, 6, /phase s1a repeats the one of line 3/],
    ["a repeated group", "## S1.\n\n## s1.\n", 3, /group s1 repeats/],
    ["an unknown key", phaseFile("- owner: someone"), 5, /with the key short, start, end, preview/],
    ["a repeated key", phaseFile("- short: A", "- short: B"), 6, /key short repeats the one of line 5/],
    ["a short title over 40", phaseFile(`- short: ${"x".repeat(MAX_SHORT + 1)}`), 5, /short title of phase s1a must hold 1 to 40/],
    ["an empty short title", phaseFile("- short:"), 5, /must hold 1 to 40/],
    ["a date out of the calendar", phaseFile("- start: 2026-02-30"), 5, /start must be a date YYYY-MM-DD that exists in the calendar/],
    ["a date out of the format", phaseFile("- end: 26-01-05"), 5, /end must be a date/],
    ["a start after its end", phaseFile("- end: 2026-01-01", "- start: 2026-01-02"), 6, /start 2026-01-02 is after end 2026-01-01/],
    ["an http preview", phaseFile("- preview: http://example.com"), 5, /must be a bare https:\/\/ URL/],
    ["a preview link", phaseFile("- preview: [preview](https://example.com)"), 5, /must be a bare https:\/\/ URL/],
    ["a preview in brackets", phaseFile("- preview: <https://example.com>"), 5, /must be a bare https:\/\/ URL/],
    ["a preview with a user", phaseFile("- preview: https://user:secret@example.com/"), 5, /no user or password/],
    ["a preview with an empty user", phaseFile("- preview: https://@example.com/"), 5, /no user or password/],
    ["a preview with spaces", phaseFile("- preview: https://example.com/a b"), 5, /no whitespace/],
    ["a preview over 2048", phaseFile(`- preview: https://example.com/${"a".repeat(MAX_URL)}`), 5, /at most 2048/],
    ["a preview without a URL", phaseFile("- preview: https://"), 5, /is not a URL|needs a host/],
    ["a second paragraph", phaseFile("One.", "", "Two."), 7, /summary of phase s1a is one paragraph; a second one starts here/],
    ["a summary over 1000", phaseFile("x".repeat(MAX_TEXT + 1)), 5, /must hold 1 to 1000/],
    ["a control character", phaseFile("Bell \u0007 here."), 5, /control characters/],
    ["a paragraph among the tasks", phaseFile("#### Tasks", "", "- [x] a: A", "", "Note."), 9, /'#### Tasks' holds only items/],
    ["a task without its id", phaseFile("#### Tasks", "", "- [x] Own domain"), 7, /a task reads '- \[ \] <id>: <title>'/],
    ["a task without a checkbox", phaseFile("#### Tasks", "", "- domain: Own domain"), 7, /a task reads/],
    ["a task id out of the pattern", phaseFile("#### Tasks", "", "- [x] own_domain: Own domain"), 7, /task id "own_domain" must match/],
    ["a repeated task id", phaseFile("#### Tasks", "", "- [x] a: A", "- [x] A: B"), 8, /task a repeats the one of line 7/],
    ["an outcome with a checkbox", phaseFile("#### Outcomes", "", "- [x] Done"), 7, /an outcome reads '- <text>'/],
    ["an outcome over 200", phaseFile("#### Outcomes", "", `- ${"x".repeat(MAX_TITLE + 1)}`), 7, /an outcome must hold 1 to 200/],
    ["an empty section", phaseFile("#### Tasks", "", "#### Outcomes", "", "- A"), 5, /'#### Tasks' holds no items/],
    ["an empty last section", phaseFile("#### Outcomes"), 5, /'#### Outcomes' holds no items/],
    ["a repeated section", phaseFile("#### Outcomes", "", "- A", "", "#### Outcomes"), 9, /repeats the one of line 5/],
    ["an unknown section", phaseFile("#### Notes"), 5, /is 'Tasks' or 'Outcomes'/],
    ["a section outside a phase", "## S1.\n\n#### Tasks\n", 3, /a '####' heading goes inside a phase/],
    ["a deeper heading", phaseFile("##### Detail"), 5, /a '#####' heading is out of the format/],
    ["a title heading after the start", `${phaseFile()}\n# Again\n`, 6, /a '#' heading is out of the format/],
    ["an unknown '##' heading", "## Notes\n", 1, /reads '<ID>\. <title>' for a group of the roadmap, or 'Requests'/],
    ["a '###' heading without an id", "## S1.\n\n### The platform\n", 3, /a '###' heading reads '<ID>\. <title>' for a phase/],
    ["an item of a group", "## S1.\n\n- short: Base\n", 3, /group s1 holds only its title and a paragraph/],
    ["a nested list", phaseFile("#### Outcomes", "", "- A", "  - B"), 8, /nested lists are out of the format/],
    ["a code fence", phaseFile("```", "code", "```"), 5, /out of the format/],
    ["a table", phaseFile("| a | b |"), 5, /out of the format/],
    ["a quote", phaseFile("> quoted"), 5, /out of the format/],
    ["an ordered list", phaseFile("1. First"), 5, /out of the format/],
    ["a thematic break", phaseFile("---"), 5, /out of the format/],
    ["a repeated requests section", "## Requests\n\n## Requests\n", 3, /'## Requests' repeats/],
    ["a paragraph of the requests section", "## Requests\n\nPlease.\n", 3, /holds only '### <id>\. <title>' requests/],
    ["an item of the requests section", "## Requests\n\n- due: 2026-01-01\n", 3, /holds only '### <id>\. <title>' requests/],
    ["a request without its title", "## Requests\n\n### logo.\n", 3, /request logo needs a title/],
    ["a request id out of the pattern", "## Requests\n\n### logo_1. Logo\n", 3, /does not read|must match|'<ID>\. <title>'/],
    ["a repeated request id", "## Requests\n\n### logo. A\n\n### LOGO. B\n", 5, /request logo repeats the one of line 3/],
    ["a request for an unknown phase", "## Requests\n\n### logo. A\n\n- phase: s9\n", 5, /names phase "s9", which is not a phase of the roadmap/],
    ["a request key of a phase", "## Requests\n\n### logo. A\n\n- short: Logo\n", 5, /with the key phase, due/],
    ["a second request body", "## Requests\n\n### logo. A\n\nOne.\n\nTwo.\n", 7, /the body of request logo is one paragraph/],
  ];
  for (const [name, text, line, pattern] of cases) {
    try {
      refused("progress-invalid", line, pattern, () => parseProgress(text, "docs/progress.md", context()));
    } catch (error) {
      error.message = `${name}: ${error.message}`;
      throw error;
    }
  }
});

test("[REQ-idd-026] a done phase refuses a task left unchecked, at the line of that task", () => {
  const text = phaseFile("#### Tasks", "", "- [x] a: A", "- [ ] b: B");
  refused("progress-invalid", 8, /phase s1a is done, so task b must be checked: '- \[x\]'/, () => parseProgress(text, "docs/progress.md", context({ s1a: "done" })));
  assert.strictEqual(parseProgress(text, "docs/progress.md", context({ s1a: "in-progress" })).phases.get("s1a").tasks.length, 2);
});

test("[REQ-idd-026] lists are capped, never cut: tasks, outcomes and requests", () => {
  const tasks = Array.from({ length: MAX_TASKS + 1 }, (_, index) => `- [ ] t${index}: Task ${index}`);
  refused("progress-invalid", 5 + 2 + MAX_TASKS, new RegExp(`more than ${MAX_TASKS} tasks`), () => parseProgress(phaseFile("#### Tasks", "", ...tasks), "p.md", context()));
  const outcomes = Array.from({ length: MAX_OUTCOMES + 1 }, (_, index) => `- Outcome ${index}`);
  refused("progress-invalid", 5 + 2 + MAX_OUTCOMES, new RegExp(`more than ${MAX_OUTCOMES} outcomes`), () => parseProgress(phaseFile("#### Outcomes", "", ...outcomes), "p.md", context()));
  const requests = Array.from({ length: MAX_REQUESTS + 1 }, (_, index) => `### r${index}. Request ${index}\n`);
  refused("progress-invalid", 3 + 2 * MAX_REQUESTS, new RegExp(`more than ${MAX_REQUESTS} requests`), () => parseProgress(`## Requests\n\n${requests.join("\n")}`, "p.md", context()));
});

test("[REQ-idd-026] a progress file with a byte order mark or CRLF lines reads the same", () => {
  const plain = parseProgress(PROGRESS, "p.md", context());
  const crlf = parseProgress(`﻿${PROGRESS.replace(/\n/g, "\r\n")}`, "p.md", context());
  assert.deepStrictEqual(crlf, plain);
});

test("[REQ-idd-026] the v2 refuses what would break its format: limits, groups and the rules the schema cannot express", () => {
  const phase = (id, group, extra = {}) => ({ id, title: id.toUpperCase(), status: "pending", group, ...extra });
  const groups = [{ id: "g1", title: "One" }, { id: "g2", title: "Two" }];
  const many = Array.from({ length: MAX_GROUPS + 1 }, (_, index) => ({ id: `g${index}`, title: "G" }));
  fail("snapshot-limit", () => serializeSnapshotV2({ schemaVersion: 2, groups: many, phases: many.map((group) => phase(`p${group.id}`, group.id)) }));
  fail("snapshot-limit", () => serializeSnapshotV2({ schemaVersion: 2, phases: Array.from({ length: MAX_PHASES + 1 }, (_, index) => phase(`a${index}`)) }));
  const invalid = [
    { schemaVersion: 2, groups, phases: [phase("a", "g1"), phase("b", "g2"), phase("c", "g1")] },
    { schemaVersion: 2, groups, phases: [phase("a", "g1")] },
    { schemaVersion: 2, phases: [phase("a", "g1")] },
    { schemaVersion: 2, groups: [], phases: [phase("a")] },
    { schemaVersion: 2, phases: [phase("a", undefined, { status: "done", tasks: [{ id: "t", title: "T", done: false }] })] },
    { schemaVersion: 2, phases: [phase("a", undefined, { start: "2026-02-01", end: "2026-01-01" })] },
    { schemaVersion: 2, phases: [phase("a", undefined, { tasks: [] })] },
    { schemaVersion: 2, phases: [phase("a", undefined, { outcomes: [" padded "] })] },
    { schemaVersion: 2, phases: [phase("a", undefined, { previewUrl: "https://u@example.com" })] },
    { schemaVersion: 2, phases: [phase("a")], requests: [{ id: "r", phase: "zz", title: "R" }] },
    { schemaVersion: 2, phases: [phase("a")], requests: [{ id: "r", title: "R" }, { id: "r", title: "S" }] },
    { schemaVersion: 1, phases: [phase("a")] },
  ];
  for (const document of invalid) {
    for (const item of document.phases) if (item.group === undefined) delete item.group;
    fail("snapshot-invalid", () => serializeSnapshotV2(document));
  }
  const heavy = { schemaVersion: 2, phases: Array.from({ length: MAX_PHASES }, (_, index) => phase(`a${index}`, undefined, { summary: "\u{1F600}".repeat(MAX_TEXT) })) };
  for (const item of heavy.phases) delete item.group;
  fail("snapshot-limit", () => serializeSnapshotV2(heavy));
});

test("[REQ-idd-026] the published v2 schema and fixtures carry the same rules as the module", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, "v2.schema.json"), "utf8"));
  assert.strictEqual(schema.$id, "ospec://schemas/progress-snapshot/v2");
  assert.strictEqual(schema.properties.schemaVersion.const, 2);
  assert.strictEqual(schema.properties.groups.maxItems, MAX_GROUPS);
  assert.strictEqual(schema.properties.phases.maxItems, MAX_PHASES);
  assert.strictEqual(schema.properties.requests.maxItems, MAX_REQUESTS);
  assert.strictEqual(schema.$defs.id.pattern, PHASE_ID_PATTERN.source);
  assert.strictEqual(schema.$defs.title.maxLength, MAX_TITLE);
  assert.strictEqual(schema.$defs.text.maxLength, MAX_TEXT);
  assert.strictEqual(schema.$defs.phase.properties.shortTitle.maxLength, MAX_SHORT);
  assert.strictEqual(schema.$defs.phase.properties.tasks.maxItems, MAX_TASKS);
  assert.strictEqual(schema.$defs.phase.properties.outcomes.maxItems, MAX_OUTCOMES);
  assert.strictEqual(schema.$defs.phase.properties.previewUrl.maxLength, MAX_URL);
  const valid = fs.readFileSync(path.join(SCHEMA_DIR, "fixtures", "valid-v2.json"), "utf8");
  assert.strictEqual(serializeSnapshotV2(JSON.parse(valid)), valid);
  assert.deepStrictEqual(validateInstance(schema, JSON.parse(valid)), { valid: true, errors: [] });
  const invalid = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, "fixtures", "invalid-v2.json"), "utf8"));
  fail("snapshot-invalid", () => serializeSnapshotV2(invalid));
  assert.strictEqual(validateInstance(schema, invalid).valid, false);
});
