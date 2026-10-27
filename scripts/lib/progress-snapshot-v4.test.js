"use strict";

// E5.13 the progress snapshot v4 that `ospec snapshot --schema-version 4`
// exports on demand (openspec/specs/idd/spec.md, REQ-idd-026): the
// documentation of the project from the progress file, the decisions from
// the ADRs and the `ADRs` column of the roadmap, its refusals and the rules of
// the format.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { SnapshotError } = require("./progress-snapshot.js");
const { buildSnapshotV2 } = require("./progress-snapshot-v2.js");
const { buildSnapshotV3 } = require("./progress-snapshot-v3.js");
const { MAX_DECISIONS, MAX_INCLUDES, MAX_OBJECTIVES, buildSnapshotV4, serializeSnapshotV4 } = require("./progress-snapshot-v4.js");
const { validateInstance } = require("./kernel-schema-validator.js");

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA_DIR = path.join(ROOT, "schemas", "progress-snapshot");
const DECISIONS = "docs/architecture/decisions";

const ROADMAP = [
  "## S1. Base",
  "",
  "| Change | Content | ADRs |",
  "| --- | --- | --- |",
  "| S1a. Platform | Scaffold | 0001, 0003 |",
  "| S1b. Access | Sign-in | — |",
  "| S1c. Clients | Invitations | 0003, 0001, 0003 |",
  "",
  "## Milestones",
  "",
  "| Milestone | Content |",
  "| --- | --- |",
  "| M1. Docs | Published docs |",
  "",
  "| Milestone | **ADRs** |",
  "| --- | --- |",
  "| M2. Launch | 0005 |",
  "| M3. Support | - |",
  "",
].join("\n");

function adr(number, title, status, date, extra = []) {
  return [`# ${number}. ${title}`, "", `- Status: ${status}`, ...(date ? [`- Date: ${date}`] : []), ...extra, "", "## Context and drivers", "- Status: ignored below the header", ""].join("\n");
}

const ADRS = {
  [`${DECISIONS}/0001-web-app.md`]: adr("0001", "A `web` app, not a store app", "accepted", "2026-01-05"),
  [`${DECISIONS}/0002-orders-by-email.md`]: adr("0002", "Orders by email", "superseded by 0005", "2026-01-09"),
  [`${DECISIONS}/0003-tenant-isolation.md`]: adr("0003", "Tenant isolation", "Accepted", "2026-01-05"),
  [`${DECISIONS}/0004-preview-storage.md`]: adr("0004", "One database per preview", "superseded by 0006", "2026-01-12"),
  [`${DECISIONS}/0005-orders-to-erp.md`]: adr("0005", "Orders to the ERP", "accepted", "2026-02-01", ["- Amends: 0002"]),
  [`${DECISIONS}/0006-shared-previews.md`]: adr("0006", "Shared synthetic previews", "accepted", "2026-02-02"),
  [`${DECISIONS}/0007-graphql.md`]: adr("0007", "GraphQL", "proposed", null),
  [`${DECISIONS}/0008-native-app.md`]: adr("0008", "A native app", "rejected", null),
  [`${DECISIONS}/0009-old-hosting.md`]: adr("0009", "Old hosting", "deprecated", "not a date"),
  [`${DECISIONS}/0010-inferred.md`]: adr("0010", "Inferred layering", "inferred", null),
  [`${DECISIONS}/README.md`]: "# Decisions\n\nNot an ADR.\n",
  [`${DECISIONS}/0011-notes.txt`]: "Not an ADR either.\n",
};

const PROGRESS = [
  "# Progress",
  "",
  "Free introduction.",
  "",
  "## S1. The base",
  "",
  "What every client needs.",
  "",
  "## Problem",
  "",
  "Clients follow their projects",
  "through *scattered* emails.",
  "",
  "## Objectives",
  "",
  "### Clients see how it goes",
  "",
  "The emails that ask, every month.",
  "",
  "### Every decision: with its reason",
  "",
  "No target yet.",
  "",
  "## Includes",
  "",
  "- Sign-in by invitation only",
  "- The progress of every project",
  "",
  "## Excludes",
  "",
  "### Online payments",
  "",
  "They keep their usual channels.",
  "",
  "## Deliverables",
  "",
  "### The client area",
  "",
  "- phase: S1a",
  "- url: https://clients.example.com/",
  "",
  "On your own domain.",
  "",
  "### The docs",
  "",
  "- phase: m1",
  "",
  "## Decisions",
  "",
  "### 0001",
  "",
  "Nothing to install.",
  "",
  "### 0002. Orders by email, for now",
  "",
  "The whole path worked at once.",
  "",
  "### 0003. Each client sees only their own",
  "",
  "Asking for another one answers as if it did not exist.",
  "",
  "### 0004.",
  "",
  "Previews used their own database.",
  "",
  "### 0005",
  "",
  "Nobody types an order twice.",
  "",
  "### 0006",
  "",
  "- internal",
  "",
  "## Requests",
  "",
  "### logo. Send us the logo",
  "",
].join("\n");

function tempProject(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-snapshot-v4-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    if (content === null) continue;
    const full = path.join(root, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return root;
}

// The roadmap, the ADRs and the progress file above, with S1a and M1 done and
// S1b in progress; a file given as null is left out.
function project(t, files = {}) {
  return tempProject(t, {
    "docs/roadmap.md": ROADMAP,
    "docs/progress.md": PROGRESS,
    "idd/archive/2026-01-16-s1a-platform/.keep": "",
    "idd/archive/2026-01-30-m1-docs/.keep": "",
    "idd/s1b-access/.keep": "",
    ...ADRS,
    ...files,
  });
}

// The progress file with `from` replaced by `to`, which must be there.
function edit(from, to, text = PROGRESS) {
  assert.ok(text.includes(from), from);
  return text.replace(from, to);
}

function lineOf(text, needle) {
  const index = text.split("\n").indexOf(needle);
  assert.notStrictEqual(index, -1, needle);
  return index + 1;
}

function refused(t, files, code, file, line, pattern) {
  const root = project(t, files);
  assert.throws(
    () => buildSnapshotV4({ root, roadmap: "docs/roadmap.md" }),
    (error) => {
      assert.ok(error instanceof SnapshotError, error.stack);
      assert.strictEqual(error.code, code, error.message);
      if (file !== null) assert.ok(error.message.startsWith(`${file}:${line}: `), error.message);
      assert.match(error.message, pattern);
      return true;
    },
    JSON.stringify(Object.keys(files)),
  );
}

test("[REQ-idd-026] buildSnapshotV4 adds the documentation from the progress file and the decisions from the ADRs", (t) => {
  const root = project(t);
  const built = buildSnapshotV4({ root, roadmap: "docs/roadmap.md" });
  const { snapshot, text } = built;
  assert.strictEqual(built.decisions, DECISIONS);
  assert.strictEqual(built.progress, "docs/progress.md");
  assert.strictEqual(built.changelog, null);
  assert.strictEqual(snapshot.schemaVersion, 4);
  assert.deepStrictEqual(Object.keys(snapshot), ["schemaVersion", "groups", "phases", "requests", "problem", "objectives", "includes", "excludes", "deliverables", "decisions"]);
  assert.strictEqual(snapshot.problem, "Clients follow their projects through scattered emails.");
  assert.deepStrictEqual(snapshot.objectives, [
    { title: "Clients see how it goes", measure: "The emails that ask, every month." },
    { title: "Every decision: with its reason", measure: "No target yet." },
  ]);
  assert.deepStrictEqual(snapshot.includes, ["Sign-in by invitation only", "The progress of every project"]);
  assert.deepStrictEqual(snapshot.excludes, [{ title: "Online payments", reason: "They keep their usual channels." }]);
  assert.deepStrictEqual(snapshot.deliverables, [
    { title: "The client area", summary: "On your own domain.", phase: "s1a", url: "https://clients.example.com/" },
    { title: "The docs", phase: "m1" },
  ]);
  assert.deepStrictEqual(snapshot.decisions, [
    // Without a client title the ADR's clean title stays; the cell order and
    // repeats of the roadmap do not change the order of its phases.
    { number: 1, title: "A web app, not a store app", date: "2026-01-05", status: "accepted", reason: "Nothing to install.", phases: ["s1a", "s1c"] },
    { number: 2, title: "Orders by email, for now", date: "2026-01-09", status: "superseded", supersededBy: 5, reason: "The whole path worked at once." },
    { number: 3, title: "Each client sees only their own", date: "2026-01-05", status: "accepted", reason: "Asking for another one answers as if it did not exist.", phases: ["s1a", "s1c"] },
    // Its substitute is internal, so it is superseded without supersededBy.
    { number: 4, title: "One database per preview", date: "2026-01-12", status: "superseded", reason: "Previews used their own database." },
    // An Amends line changes nothing: it is one more decision in force.
    { number: 5, title: "Orders to the ERP", date: "2026-02-01", status: "accepted", reason: "Nobody types an order twice.", phases: ["m2"] },
  ]);
  assert.strictEqual(text, `${JSON.stringify(snapshot, null, 2)}\n`);
  const schema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, "v4.schema.json"), "utf8"));
  assert.deepStrictEqual(validateInstance(schema, snapshot), { valid: true, errors: [] });
});

test("[REQ-idd-026] without the ADR directory or the documentation sections the v4 is the v3 under its version", (t) => {
  const v3Progress = PROGRESS.split("\n## Problem")[0] + "\n## Requests\n\n### logo. Send us the logo\n";
  const bare = Object.fromEntries(Object.keys(ADRS).map((file) => [file, null]));
  const root = project(t, { ...bare, "docs/progress.md": v3Progress, "docs/roadmap.md": ROADMAP.replace(/\| 0005 \|/, "| — |").replace(/0001, 0003|0003, 0001, 0003/g, "") });
  const built = buildSnapshotV4({ root, roadmap: "docs/roadmap.md" });
  assert.strictEqual(built.decisions, null);
  const v3 = buildSnapshotV3({ root, roadmap: "docs/roadmap.md" }).snapshot;
  assert.deepStrictEqual(built.snapshot, { ...v3, schemaVersion: 4 });
  // A directory without published ADRs gives no decisions either, and is read.
  const proposed = project(t, { ...bare, "docs/progress.md": v3Progress, [`${DECISIONS}/0001-web-app.md`]: adr("0001", "A web app", "proposed", null), "docs/roadmap.md": ROADMAP.replace(/0003, |, 0003|0005/g, "") });
  const read = buildSnapshotV4({ root: proposed, roadmap: "docs/roadmap.md" });
  assert.strictEqual(read.decisions, DECISIONS);
  assert.strictEqual(read.snapshot.decisions, undefined);
});

test("[REQ-idd-026] the v2 and the v3 refuse the documentation sections as before", (t) => {
  const root = project(t);
  for (const build of [buildSnapshotV2, buildSnapshotV3]) {
    assert.throws(
      () => build({ root, roadmap: "docs/roadmap.md" }),
      (error) => error.code === "progress-invalid" && error.message === `docs/progress.md:${lineOf(PROGRESS, "## Problem")}: a '##' heading reads '<ID>. <title>' for a group of the roadmap, or 'Requests'`,
    );
  }
});

test("[REQ-idd-026] an ADR out of its header format, or whose substitute does not follow it, is refused at its line", (t) => {
  const file = (name) => `${DECISIONS}/${name}`;
  const cases = [
    [{ [file("0012-x.md")]: "Just notes.\n" }, file("0012-x.md"), 1, /starts with its heading '# 0012\. <title>'/],
    [{ [file("0012-x.md")]: "Intro\n\n## 0012. Two hashes\n" }, file("0012-x.md"), 3, /starts with its heading/],
    [{ [file("0012-x.md")]: adr("0013", "X", "accepted", "2026-01-01") }, file("0012-x.md"), 1, /heading names ADR 0013, but the file name says 0012/],
    [{ [file("0001-a-copy.md")]: adr("0001", "Copy", "proposed", null) }, file("0001-web-app.md"), 1, /ADR 0001 repeats the number of docs\/architecture\/decisions\/0001-a-copy\.md/],
    [{ [file("0012-x.md")]: "# 0012. X\n\n- Date: 2026-01-01\n" }, file("0012-x.md"), 1, /has no '- Status:' line/],
    [{ [file("0012-x.md")]: adr("0012", "X", "superseded", "2026-01-01") }, file("0012-x.md"), 3, /status of ADR 0012 is inferred, proposed, accepted, superseded by NNNN, rejected or deprecated, got "superseded"/],
    [{ [file("0012-x.md")]: adr("0012", "X", "approved", "2026-01-01") }, file("0012-x.md"), 3, /got "approved"/],
    [{ [file("0012-x.md")]: adr("0012", "X", "proposed", null, ["- status: accepted"]) }, file("0012-x.md"), 4, /'- status:' repeats the one of line 3/],
    [{ [file("0012-x.md")]: adr("0012", "X", "superseded by 0042", "2026-01-01") }, file("0012-x.md"), 3, /superseded by 0042, which is not an ADR/],
    [{ [file("0012-x.md")]: adr("0012", "X", "superseded by 0005", "2026-01-01") }, file("0012-x.md"), 3, /superseded by 0005, whose number is not greater/],
    // Only a published ADR needs its date and a reason for the client.
    [{ [file("0005-orders-to-erp.md")]: adr("0005", "Orders to the ERP", "accepted", null) }, file("0005-orders-to-erp.md"), 1, /ADR 0005 has no '- Date:' line/],
    [{ [file("0005-orders-to-erp.md")]: adr("0005", "Orders to the ERP", "accepted", "2026-02-30") }, file("0005-orders-to-erp.md"), 4, /date of ADR 0005 must be YYYY-MM-DD and exist in the calendar, got "2026-02-30"/],
    [{ [file("0012-x.md")]: adr("0012", "X", "accepted", "2026-01-01") }, file("0012-x.md"), 3, /ADR 0012 is accepted and has no reason for the client/],
    [{ [file("0001-web-app.md")]: adr("0001", "x".repeat(201), "accepted", "2026-01-05") }, file("0001-web-app.md"), 1, /title of ADR 0001 must hold 1 to 200 characters; give its decision a title/],
    [{ [file("0000-zero.md")]: adr("0000", "Zero", "accepted", "2026-01-01") }, file("0000-zero.md"), 1, /cannot be published: a decision number goes from 0001 to 9999/],
  ];
  for (const [files, at, line, pattern] of cases) refused(t, files, "decisions-invalid", at, line, pattern);
  // A missing reason says where to write it.
  const root = project(t, { [file("0012-x.md")]: adr("0012", "X", "accepted", "2026-01-01") });
  assert.throws(() => buildSnapshotV4({ root, roadmap: "docs/roadmap.md" }), (error) => /under '### 0012' in the '## Decisions' section of docs\/progress\.md, or mark it '- internal'/.test(error.how));
});

test("[REQ-idd-026] the ADRs column names ADRs on disk, as '—' or numbers separated by commas", (t) => {
  const row = (cell) => ROADMAP.replace("| S1b. Access | Sign-in | — |", `| S1b. Access | Sign-in | ${cell} |`);
  const line = lineOf(ROADMAP, "| S1b. Access | Sign-in | — |");
  refused(t, { "docs/roadmap.md": row("ADR-0001") }, "roadmap-invalid", "docs/roadmap.md", line, /the ADRs cell of phase s1b reads "ADR-0001"/);
  refused(t, { "docs/roadmap.md": row("0001; 0003") }, "roadmap-invalid", "docs/roadmap.md", line, /reads "0001; 0003"/);
  refused(t, { "docs/roadmap.md": row("0042") }, "roadmap-invalid", "docs/roadmap.md", line, /phase s1b names ADR 0042, which is not an ADR of docs\/architecture\/decisions\//);
  // A proposed ADR exists, so a phase may name it; it is not published.
  const root = project(t, { "docs/roadmap.md": row("0007, `0001`") });
  const decisions = buildSnapshotV4({ root, roadmap: "docs/roadmap.md" }).snapshot.decisions;
  assert.deepStrictEqual(decisions[0].phases, ["s1a", "s1b", "s1c"]);
  // Without the directory a named ADR does not exist either.
  const bare = Object.fromEntries(Object.keys(ADRS).map((file) => [file, null]));
  refused(t, { ...bare, "docs/progress.md": PROGRESS.split("\n## Decisions")[0] }, "roadmap-invalid", "docs/roadmap.md", lineOf(ROADMAP, "| S1a. Platform | Scaffold | 0001, 0003 |"), /names ADR 0001/);
});

test("[REQ-idd-026] the documentation sections out of their syntax are refused at the line of the first problem", (t) => {
  const at = (needle, text) => lineOf(text, needle);
  const cases = [
    // Decisions of the progress file name published ADRs, with a reason or internal.
    [edit("### 0005\n", "### 0042\n"), "### 0042", /decision 0042 names no ADR of docs\/architecture\/decisions\//],
    [edit("### 0006\n", "### 0007\n"), "### 0007", /ADR 0007 is proposed, so it is not published; leave its decision out/],
    [edit("### 0005\n\nNobody types an order twice.\n", "### 0005\n"), "### 0005", /decision 0005 needs its reason for the client: a paragraph under its heading, or '- internal'/],
    [edit("### 0006\n\n- internal\n", "### 0006\n\n- internal\n\nA reason.\n"), "### 0006", /decision 0006 is internal, so it is not published: drop its title and its reason/],
    [edit("### 0006\n", "### 0006. A title\n"), "### 0006. A title", /decision 0006 is internal/],
    [edit("### 0006\n\n- internal\n", "### 0006\n\n- internal\n- internal\n"), "- internal", /'- internal' repeats the one of line/, 1],
    [edit("### 0006\n\n- internal\n", "### 0006\n\n- secret\n"), "- secret", /an item of decision 0006 reads '- internal'/],
    [edit("### 0005\n", "### ADR 5\n"), "### ADR 5", /a decision reads '### NNNN\. <title>' or '### NNNN'/],
    [edit("### 0005\n", "### 0001\n"), "### 0001", /decision 0001 repeats the one of line/, 1],
    // Deliverables name a phase of the roadmap and may hold a URL.
    [edit("- phase: m1\n", ""), "### The docs", /deliverable "The docs" needs its phase: '- phase: <ID>'/],
    [edit("- phase: m1\n", "- phase: m9\n"), "- phase: m9", /deliverable "The docs" names phase "m9", which is not a phase of the roadmap/],
    [edit("- url: https://clients.example.com/\n", "- url: http://clients.example.com/\n"), "- url: http://clients.example.com/", /the URL of deliverable "The client area" must be a bare https:\/\/ URL/],
    [edit("- phase: m1\n", "- phase: m1\n- owner: us\n"), "- owner: us", /deliverable "The docs" holds the items '- phase: <ID>' and '- url: <https URL>' and a paragraph/],
    [edit("- phase: m1\n", "- phase: m1\n- phase: s1a\n"), "- phase: s1a", /key phase repeats the one of line/, 1],
    // Objectives and exclusions need their paragraph, one each.
    [edit("The emails that ask, every month.\n", ""), "### Clients see how it goes", /objective "Clients see how it goes" needs its measure/],
    [edit("They keep their usual channels.\n", ""), "### Online payments", /exclusion "Online payments" needs its reason/],
    [edit("No target yet.\n", "No target yet.\n\nA second one.\n"), "A second one.", /the measure of objective "Every decision: with its reason" is one paragraph/],
    [edit("### Clients see how it goes\n", "- Clients see how it goes\n"), "- Clients see how it goes", /'## Objectives' holds one '### ' heading per objective/],
    [edit("### Clients see how it goes\n", "#### Clients see how it goes\n"), "#### Clients see how it goes", /a '####' heading is out of the format in '## Objectives'/],
    [edit("### Clients see how it goes\n", `### ${"x".repeat(201)}\n`), `### ${"x".repeat(201)}`, /the title of a objective must hold 1 to 200 characters/],
    [edit("The emails that ask, every month.\n", `${"x".repeat(1001)}\n`), "x".repeat(1001), /the measure of objective "Clients see how it goes" must hold 1 to 1000 characters/],
    // The problem is one paragraph, and the includes plain items.
    [edit("through *scattered* emails.\n", "through *scattered* emails.\n\nAnd more.\n"), "And more.", /the problem is one paragraph; a second one starts here/],
    [edit("Clients follow their projects\n", "- Clients follow their projects\n"), "- Clients follow their projects", /'## Problem' holds one paragraph/],
    [edit("- Sign-in by invitation only\n", "- [x] Sign-in by invitation only\n"), "- [x] Sign-in by invitation only", /without a checkbox/],
    [edit("- Sign-in by invitation only\n", "Sign-in by invitation only\n"), "Sign-in by invitation only", /'## Includes' holds only '- <text>' items/],
    // A section is not empty and comes once.
    [edit("## Excludes\n\n### Online payments\n\nThey keep their usual channels.\n", "## Excludes\n"), "## Excludes", /'## Excludes' holds no exclusions; leave the heading out/],
    [edit("## Includes\n\n- Sign-in by invitation only\n- The progress of every project\n", "## Includes\n"), "## Includes", /'## Includes' holds no items/],
    [edit("## Problem\n\nClients follow their projects\nthrough *scattered* emails.\n", "## Problem\n"), "## Problem", /'## Problem' holds no paragraph/],
    [edit("## Requests\n", "## Includes\n\n- Again\n\n## Requests\n"), "## Includes", /'## Includes' repeats the one of line/, 1],
    // Any other '##' still names a group or a keyword.
    [edit("## Requests\n", "## Glossary\n\n## Requests\n"), "## Glossary", /for a group of the roadmap, or 'Requests', 'Problem', 'Objectives', 'Includes', 'Excludes', 'Deliverables', 'Decisions'/],
  ];
  for (const [text, needle, pattern, nth] of cases) {
    const lines = text.split("\n");
    const line = nth === undefined ? at(needle, text) : lines.lastIndexOf(needle) + 1;
    refused(t, { "docs/progress.md": text }, "progress-invalid", "docs/progress.md", line, pattern);
  }
});

test("[REQ-idd-026] the lists keep the limits of the format, and nothing is cut", (t) => {
  const objectives = Array.from({ length: MAX_OBJECTIVES + 1 }, (_, index) => `### Objective ${index}\n\nMeasured.\n`).join("\n");
  const many = edit("## Objectives\n\n### Clients see how it goes\n\nThe emails that ask, every month.\n\n### Every decision: with its reason\n\nNo target yet.\n", `## Objectives\n\n${objectives}`);
  refused(t, { "docs/progress.md": many }, "progress-invalid", "docs/progress.md", lineOf(many, `### Objective ${MAX_OBJECTIVES}`), /more than 10 objectives/);
  const includes = Array.from({ length: MAX_INCLUDES + 1 }, (_, index) => `- Include ${index}`).join("\n");
  const wide = edit("- Sign-in by invitation only\n- The progress of every project\n", `${includes}\n`);
  refused(t, { "docs/progress.md": wide }, "progress-invalid", "docs/progress.md", lineOf(wide, `- Include ${MAX_INCLUDES}`), /more than 30 includes/);
  // More published decisions than the format holds is a limit of the snapshot.
  const adrs = {};
  const entries = [];
  for (let number = 101; number <= 101 + MAX_DECISIONS; number += 1) {
    const id = String(number).padStart(4, "0");
    adrs[`${DECISIONS}/${id}-many.md`] = adr(id, "Many", "accepted", "2026-01-01");
    entries.push(`### ${id}\n\nA reason.\n`);
  }
  const progress = edit("## Requests\n", `${entries.join("\n")}\n## Requests\n`);
  refused(t, { ...adrs, "docs/progress.md": progress }, "snapshot-limit", null, 0, /would hold 106 decisions; the limit is 100/);
});

test("[REQ-idd-026] an ADR with a byte order mark or CRLF lines reads the same", (t) => {
  const plain = buildSnapshotV4({ root: project(t), roadmap: "docs/roadmap.md" }).text;
  const crlf = Object.fromEntries(Object.entries(ADRS).map(([file, text]) => [file, `﻿${text.replace(/\n/g, "\r\n")}`]));
  assert.strictEqual(buildSnapshotV4({ root: project(t, crlf), roadmap: "docs/roadmap.md" }).text, plain);
});

test("[REQ-idd-026] the v4 refuses what would break its format", () => {
  const phases = [
    { id: "a", title: "A", status: "done" },
    { id: "b", title: "B", status: "pending" },
  ];
  const decision = (extra) => ({ number: 1, title: "One", date: "2026-01-01", status: "accepted", reason: "Why.", ...extra });
  const invalid = [
    { schemaVersion: 3, phases, problem: "A problem." },
    { schemaVersion: 4, phases, problem: " padded " },
    { schemaVersion: 4, phases, objectives: [] },
    { schemaVersion: 4, phases, includes: Array.from({ length: 31 }, () => "x") },
    { schemaVersion: 4, phases, excludes: [{ title: "x" }] },
    { schemaVersion: 4, phases, deliverables: [{ title: "x", phase: "z" }] },
    { schemaVersion: 4, phases, deliverables: [{ title: "x", phase: "a", url: "https://user:secret@example.com/" }] },
    { schemaVersion: 4, phases, decisions: [decision({ number: 10000 })] },
    { schemaVersion: 4, phases, decisions: [decision(), decision()] },
    { schemaVersion: 4, phases, decisions: [decision({ date: "2026-02-30" })] },
    { schemaVersion: 4, phases, decisions: [decision({ phases: ["z"] })] },
    { schemaVersion: 4, phases, decisions: [decision({ status: "superseded", supersededBy: 2 })] },
    { schemaVersion: 4, phases, decisions: [decision({ number: 2 }), decision({ status: "superseded", supersededBy: 2, number: 3 })] },
    { schemaVersion: 4, phases, decisions: [decision({ supersededBy: 2 }), decision({ number: 2 })] },
    { schemaVersion: 4, phases, owner: "someone" },
  ];
  for (const document of invalid) assert.throws(() => serializeSnapshotV4(document), (error) => error.code === "snapshot-invalid", JSON.stringify(document));
  const valid = { schemaVersion: 4, phases, decisions: [decision({ status: "superseded", supersededBy: 2 }), decision({ number: 2, phases: ["b", "a"] })] };
  assert.strictEqual(serializeSnapshotV4(valid), `${JSON.stringify(valid, null, 2)}\n`);
});

test("[REQ-idd-026] the published v4 schema and fixtures carry the same rules as the module", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, "v4.schema.json"), "utf8"));
  const v3 = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, "v3.schema.json"), "utf8"));
  assert.strictEqual(schema.$id, "ospec://schemas/progress-snapshot/v4");
  assert.strictEqual(schema.properties.schemaVersion.const, 4);
  // The v4 is the v3 plus the documentation fields: every other rule is the same.
  const { schemaVersion, problem, objectives, includes, excludes, deliverables, decisions, ...rest } = schema.properties;
  assert.deepStrictEqual(rest, { groups: v3.properties.groups, phases: v3.properties.phases, requests: v3.properties.requests });
  for (const name of Object.keys(v3.$defs)) assert.deepStrictEqual(schema.$defs[name], v3.$defs[name], name);
  assert.strictEqual(objectives.maxItems, MAX_OBJECTIVES);
  assert.strictEqual(includes.maxItems, MAX_INCLUDES);
  assert.strictEqual(decisions.maxItems, MAX_DECISIONS);
  const valid = fs.readFileSync(path.join(SCHEMA_DIR, "fixtures", "valid-v4.json"), "utf8");
  assert.strictEqual(serializeSnapshotV4(JSON.parse(valid)), valid);
  assert.deepStrictEqual(validateInstance(schema, JSON.parse(valid)), { valid: true, errors: [] });
  const invalid = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, "fixtures", "invalid-v4.json"), "utf8"));
  assert.throws(() => serializeSnapshotV4(invalid), (error) => error.code === "snapshot-invalid");
  // Each documentation field of the invalid fixture breaks both on its own.
  for (const field of ["problem", "objectives", "includes", "excludes", "deliverables", "decisions"]) {
    const values = Array.isArray(invalid[field]) ? invalid[field].map((item) => [item]) : [invalid[field]];
    for (const value of values) {
      const alone = { schemaVersion: 4, phases: invalid.phases, [field]: value };
      assert.throws(() => serializeSnapshotV4(alone), (error) => error.code === "snapshot-invalid", JSON.stringify(value));
      assert.strictEqual(validateInstance(schema, alone).valid, false, JSON.stringify(value));
    }
  }
});
