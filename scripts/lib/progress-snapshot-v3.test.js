"use strict";

// E5.12 the progress snapshot v3 that `ospec snapshot --schema-version 3`
// exports on demand (openspec/specs/idd/spec.md, REQ-idd-026): the delivery
// stage of each done phase from the changelog, its refusals and the rules of
// the format.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { SnapshotError, buildSnapshot } = require("./progress-snapshot.js");
const { buildSnapshotV2 } = require("./progress-snapshot-v2.js");
const { MAX_VERSION, VERSION, buildSnapshotV3, changelogStages, compareVersions, phaseRelease, serializeSnapshotV3 } = require("./progress-snapshot-v3.js");
const { validateInstance } = require("./kernel-schema-validator.js");

const ROOT = path.resolve(__dirname, "../..");
const SCHEMA_DIR = path.join(ROOT, "schemas", "progress-snapshot");

const ROADMAP = [
  "## S1. Base",
  "",
  "| Change | Content |",
  "| --- | --- |",
  "| S1a. Platform | Scaffold |",
  "| S1b. Access | Sign-in |",
  "| S1c. Clients | Invitations |",
  "| S1d. Billing | Invoices |",
  "",
  "## Milestones",
  "",
  "| Milestone | Content |",
  "| --- | --- |",
  "| M1. Docs | Published docs |",
  "| M2. Launch | Go live |",
  "",
].join("\n");

const CONFIG = "delivery:\n  changelog: CHANGELOG.md\n";

const CHANGELOG = [
  "# Changelog",
  "",
  "Free text before the first version.",
  "",
  "## [Unreleased]",
  "",
  "### Fixed",
  "- Invitations expire after a week (s1c-expiry)",
  "",
  "## [0.10.0] - 2026-02-10",
  "",
  "### Added",
  "* Sign-in with a passkey, from a link that works once and",
  "  expires in ten minutes (s1b-access)",
  "",
  "## v0.9.0 - 2026-02-01",
  "",
  "### Added",
  "+ Clients invite their people (s1c-clients)  ",
  "- Accounts for operators (s1b-operators)",
  "",
  "## [0.2.0-rc.1] - 2026-01-20",
  "",
  "- Docs preview (m1-docs)",
  "",
  "## [0.1.0] - 2026-01-16",
  "",
  "- The platform (s1a-platform)",
  "",
  "## 0.0.1",
  "",
  "- An old entry under a heading without its date (old-change)",
  "",
].join("\n");

function fail(code, fn) {
  assert.throws(fn, (error) => error instanceof SnapshotError && error.code === code);
}

function refused(line, pattern, fn) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof SnapshotError, error.stack);
    assert.strictEqual(error.code, "changelog-invalid", error.message);
    assert.match(error.message, new RegExp(`^CHANGELOG\\.md:${line}: `), error.message);
    if (pattern) assert.match(error.message, pattern);
    return true;
  });
}

function tempProject(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-snapshot-v3-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [file, content] of Object.entries(files)) {
    const full = path.join(root, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    if (content !== null) fs.writeFileSync(full, content);
  }
  return root;
}

// The roadmap with every phase but S1d closed, S1b and S1c by two changes
// each; a file given as null is left out.
function project(t, files = {}) {
  return tempProject(t, {
    "docs/roadmap.md": ROADMAP,
    "idd/config.yaml": CONFIG,
    "CHANGELOG.md": CHANGELOG,
    "idd/archive/2026-01-16-s1a-platform/.keep": "",
    "idd/archive/2026-01-30-s1b-operators/.keep": "",
    "idd/archive/2026-02-09-s1b-access/.keep": "",
    "idd/archive/2026-01-31-s1c-clients/.keep": "",
    "openspec/changes/archive/2026-02-12-s1c-expiry/.keep": "",
    "idd/archive/2026-01-19-m1-docs/.keep": "",
    "idd/archive/2026-02-20-m2-launch/.keep": "",
    "idd/s1d-billing/.keep": "",
    ...files,
  });
}

function releases(snapshot) {
  return Object.fromEntries(snapshot.phases.map((phase) => [phase.id, phase.release ?? null]));
}

// The stages changelogStages finds for `ids` in a changelog of `lines`.
function stages(lines, ids) {
  return Object.fromEntries([...changelogStages(lines.join("\n"), "CHANGELOG.md", new Set(ids))].map(([id, { stage }]) => [id, stage]));
}

test("[REQ-idd-026] buildSnapshotV3 adds the delivery stage of each done phase from the changelog it declares", (t) => {
  const root = project(t);
  const { changelog, snapshot, text } = buildSnapshotV3({ root, roadmap: "docs/roadmap.md" });
  assert.strictEqual(changelog, "CHANGELOG.md");
  assert.deepStrictEqual(releases(snapshot), {
    s1a: { stage: "production", version: "0.1.0", date: "2026-01-16" },
    // The highest version wins, by precedence: 0.10.0 is above 0.9.0.
    s1b: { stage: "production", version: "0.10.0", date: "2026-02-10" },
    // The least advanced wins: one of its changes is still unreleased.
    s1c: { stage: "testing" },
    s1d: null,
    m1: { stage: "testing" },
    // A done phase whose changes have no entry has no release.
    m2: null,
  });
  assert.strictEqual(snapshot.schemaVersion, 3);
  assert.deepStrictEqual(Object.keys(snapshot.phases[0]), ["id", "title", "status", "group", "release"]);
  assert.strictEqual(text, `${JSON.stringify(snapshot, null, 2)}\n`);
  const schema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, "v3.schema.json"), "utf8"));
  assert.deepStrictEqual(validateInstance(schema, snapshot), { valid: true, errors: [] });
  // Apart from release and its version, the v3 is the v2.
  const v2 = buildSnapshotV2({ root, roadmap: "docs/roadmap.md" }).snapshot;
  for (const phase of snapshot.phases) delete phase.release;
  assert.deepStrictEqual({ ...snapshot, schemaVersion: 2 }, v2);
});

test("[REQ-idd-026] without a declared, existing changelog the done phases have no release and nothing is refused", (t) => {
  const cases = [
    { "idd/config.yaml": null },
    { "idd/config.yaml": "checks:\n  test: npm test\n" },
    { "idd/config.yaml": "delivery:\n  changelog: none\n" },
    { "CHANGELOG.md": null },
    { "idd/config.yaml": "delivery:\n  changelog: docs/changes\n", "docs/changes/.keep": "" },
  ];
  for (const files of cases) {
    const root = project(t, files);
    const built = buildSnapshotV3({ root, roadmap: "docs/roadmap.md" });
    assert.strictEqual(built.changelog, null, JSON.stringify(files));
    assert.ok(built.snapshot.phases.every((phase) => phase.release === undefined), JSON.stringify(files));
  }
});

test("[REQ-idd-026] a configuration that does not parse refuses the v3 only", (t) => {
  const root = project(t, { "idd/config.yaml": "delivery:\n  changelog: ../outside.md\n" });
  assert.throws(() => buildSnapshotV3({ root, roadmap: "docs/roadmap.md" }), (error) => error.code === "config-invalid" && /delivery\.changelog/.test(error.message));
  assert.strictEqual(buildSnapshotV2({ root, roadmap: "docs/roadmap.md" }).snapshot.schemaVersion, 2);
  assert.strictEqual(buildSnapshot({ root }).snapshot.schemaVersion, 1);
});

test("[REQ-idd-026] the v1 and the v2 do not read the changelog", (t) => {
  const broken = project(t, { "CHANGELOG.md": "- The platform (s1a-platform)\n" });
  const bare = project(t, { "idd/config.yaml": null });
  fail("changelog-invalid", () => buildSnapshotV3({ root: broken, roadmap: "docs/roadmap.md" }));
  assert.strictEqual(buildSnapshot({ root: broken }).text, buildSnapshot({ root: bare }).text);
  assert.strictEqual(buildSnapshotV2({ root: broken, roadmap: "docs/roadmap.md" }).text, buildSnapshotV2({ root: bare, roadmap: "docs/roadmap.md" }).text);
});

test("[REQ-idd-026] an entry is a list item that ends in its change id, with its indented lines, outside code fences", () => {
  const lines = [
    "## [Unreleased]",
    "",
    "```md",
    "- Inside a fence (fenced)",
    "```",
    "- Ends in a period (period).",
    "- Names two changes (one, two)",
    "  - nested (nested)",
    "-Not an item (tight)",
    "  - An indented item (indented)",
    "Lazy text (lazy)",
    "- The first line",
    "",
    "  after a blank line (blank)",
    "",
    "## [1.0.0] - 2026-01-02",
    "",
    "- Twice under one heading (twice)",
    "- Twice under one heading (twice)",
    "- Kept",
    "\tby a tab (tabbed)",
  ];
  const ids = ["fenced", "period", "one", "two", "nested", "tight", "indented", "lazy", "blank", "twice", "tabbed"];
  assert.deepStrictEqual(stages(lines, ids), {
    twice: { stage: "production", version: "1.0.0", date: "2026-01-02" },
    tabbed: { stage: "production", version: "1.0.0", date: "2026-01-02" },
  });
  // Only the entries of the ids asked for are read.
  assert.deepStrictEqual(stages(lines, ["period"]), {});
});

test("[REQ-idd-026] headings read as the release proposal of close reads them, and a pre-release is in testing", () => {
  const lines = [
    "# Changelog",
    "## [unreleased]",
    "- a (a)",
    "## v2.0.0-beta.2 - 2026-03-01",
    "- b (b)",
    "## [1.10.0]",
    "- c (c) has no date, but no change of a done phase sits there",
    "## 1.9.0 - 2026-02-01",
    "- d (d)",
    "## [1.0.0-rc.1]",
    "- e (e)",
  ];
  assert.deepStrictEqual(stages(lines, ["a", "b", "d", "e"]), {
    a: { stage: "testing" },
    b: { stage: "testing" },
    d: { stage: "production", version: "1.9.0", date: "2026-02-01" },
    e: { stage: "testing" },
  });
});

test("[REQ-idd-026] only what decides a stage is checked, and the first problem is refused at its line", () => {
  const under = (heading, entry = "- x (x)") => ["# Changelog", "", heading, "", entry, ""];
  const cases = [
    [["- x (x)", "## [Unreleased]"], 1, /sits under no '##' heading/],
    [["## [Unreleased]", "# Notes", "- x (x)"], 3, /sits under no '##' heading/],
    [under("## Notes"), 5, /heading of line 3, which is neither/],
    [under("## [1.0.0]"), 3, /version 1\.0\.0 needs its date/],
    [under("## [1.0.0] - 2026-02-30"), 3, /must be YYYY-MM-DD and exist in the calendar, got "2026-02-30"/],
    [under("## [1.0.0] - 2026-2-3"), 3, /got "2026-2-3"/],
    [under("## [1.0.0-rc.1] - 2026-13-01"), 3, /the date of version 1\.0\.0-rc\.1/],
    [under("## [01.0.0] - 2026-01-01"), 3, /leading zero/],
    [under("## [1.0.0+build.5] - 2026-01-01"), 3, /build metadata/],
    [under("## [1.0.0] - 2026-01-01 [YANKED]"), 3, /nothing after the date, got "- 2026-01-01 \[YANKED\]"/],
    [under("## [1.0.0] 2026-01-01"), 3, /nothing after the date/],
    [under(`## [1.0.${"1".repeat(MAX_VERSION)}] - 2026-01-01`), 3, /longer than 64 characters/],
    [["## [Unreleased]", "- x (x)", "## [1.0.0] - 2026-01-01", "- x (x)"], 4, /change x sits under the heading of line 3, and the one of line 2 under the heading of line 1/],
    [["## [1.0.0] - 2026-01-01", "- x (x)", "## [1.0.0] - 2026-01-02", "- y (y)"], 3, /version 1\.0\.0 repeats the heading of line 1/],
  ];
  for (const [lines, line, pattern] of cases) refused(line, pattern, () => changelogStages(lines.join("\n"), "CHANGELOG.md", new Set(["x", "y"])));
  // The same headings are not checked while no entry that counts sits under them.
  for (const [lines] of cases) assert.deepStrictEqual(changelogStages(lines.join("\n"), "CHANGELOG.md", new Set(["other"])), new Map());
});

test("[REQ-idd-026] a changelog with a byte order mark or CRLF lines reads the same", () => {
  const ids = new Set(["s1a-platform", "s1b-access", "s1c-expiry"]);
  const plain = changelogStages(CHANGELOG, "CHANGELOG.md", ids);
  assert.deepStrictEqual(changelogStages(`﻿${CHANGELOG.replace(/\n/g, "\r\n")}`, "CHANGELOG.md", ids), plain);
  assert.strictEqual(plain.size, 3);
});

test("[REQ-idd-026] the least advanced change sets the stage, and in production the highest version", () => {
  const changes = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const production = (version, date) => ({ stage: { stage: "production", version, date } });
  const of = (entries) => phaseRelease(changes, new Map(Object.entries(entries)));
  assert.strictEqual(of({}), undefined);
  assert.deepStrictEqual(of({ a: production("1.2.0", "2026-01-02"), b: production("1.10.0", "2026-03-04") }), { stage: "production", version: "1.10.0", date: "2026-03-04" });
  assert.deepStrictEqual(of({ a: production("1.2.0", "2026-01-02"), c: { stage: { stage: "testing" } } }), { stage: "testing" });
  assert.ok(compareVersions("0.10.0", "0.9.9") > 0);
  assert.ok(compareVersions("2.0.0", "10.0.0") < 0);
  assert.ok(compareVersions(`1.0.${"9".repeat(20)}`, `1.0.1${"0".repeat(20)}`) < 0);
  assert.strictEqual(compareVersions("1.2.3", "1.2.3"), 0);
});

test("[REQ-idd-026] the v3 refuses what would break its format: a release outside a done phase or out of its shape", () => {
  const phase = (extra) => ({ id: "a", title: "A", status: "done", ...extra });
  const invalid = [
    { schemaVersion: 2, phases: [phase({ release: { stage: "testing" } })] },
    { schemaVersion: 3, phases: [phase({ status: "in-progress", release: { stage: "testing" } })] },
    { schemaVersion: 3, phases: [phase({ release: { stage: "testing", version: "1.0.0" } })] },
    { schemaVersion: 3, phases: [phase({ release: { stage: "production", version: "1.0.0" } })] },
    { schemaVersion: 3, phases: [phase({ release: { stage: "production", version: "1.0.0-rc.1", date: "2026-01-01" } })] },
    { schemaVersion: 3, phases: [phase({ release: { stage: "production", version: "1.0.0", date: "2026-02-30" } })] },
    { schemaVersion: 3, phases: [phase({ release: { stage: "staging" } })] },
    { schemaVersion: 3, phases: [phase({ owner: "someone" })] },
  ];
  for (const document of invalid) fail("snapshot-invalid", () => serializeSnapshotV3(document));
  const valid = { schemaVersion: 3, phases: [phase({ release: { stage: "production", version: "1.0.0", date: "2026-01-01" } }), { id: "b", title: "B", status: "pending" }] };
  assert.strictEqual(serializeSnapshotV3(valid), `${JSON.stringify(valid, null, 2)}\n`);
});

test("[REQ-idd-026] the published v3 schema and fixtures carry the same rules as the module", () => {
  const schema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, "v3.schema.json"), "utf8"));
  const v2 = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, "v2.schema.json"), "utf8"));
  assert.strictEqual(schema.$id, "ospec://schemas/progress-snapshot/v3");
  assert.strictEqual(schema.properties.schemaVersion.const, 3);
  assert.strictEqual(schema.$defs.version.pattern, VERSION.source);
  assert.strictEqual(schema.$defs.version.maxLength, MAX_VERSION);
  // The v3 is the v2 plus release: every other rule is the same.
  const { release, ...phaseProperties } = schema.$defs.phase.properties;
  assert.deepStrictEqual(release, { $ref: "#/$defs/release" });
  assert.deepStrictEqual(phaseProperties, v2.$defs.phase.properties);
  for (const name of ["id", "title", "text", "date", "group", "task", "request"]) assert.deepStrictEqual(schema.$defs[name], v2.$defs[name], name);
  assert.deepStrictEqual(schema.properties.groups, v2.properties.groups);
  assert.deepStrictEqual(schema.properties.phases, v2.properties.phases);
  assert.deepStrictEqual(schema.properties.requests, v2.properties.requests);
  const valid = fs.readFileSync(path.join(SCHEMA_DIR, "fixtures", "valid-v3.json"), "utf8");
  assert.strictEqual(serializeSnapshotV3(JSON.parse(valid)), valid);
  assert.deepStrictEqual(validateInstance(schema, JSON.parse(valid)), { valid: true, errors: [] });
  const invalid = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, "fixtures", "invalid-v3.json"), "utf8"));
  fail("snapshot-invalid", () => serializeSnapshotV3(invalid));
  for (const phase of invalid.phases) {
    const alone = { schemaVersion: 3, phases: [phase] };
    fail("snapshot-invalid", () => serializeSnapshotV3(alone));
    assert.strictEqual(validateInstance(schema, alone).valid, false, phase.id);
  }
});
