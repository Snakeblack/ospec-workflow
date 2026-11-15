"use strict";

// End-to-end contract of the ospec CLI, run as a child process against a
// temporary project root: ospec snapshot (E5.10-E5.13), the chaining of what
// the CLI knows (E4.15) and its terse output (E4.16). The helpers the parts
// share are in scripts/lib/test-support/ospec-cli.js.

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const {
  plainRoot,
  tempRoot,
  ospecWith,
  ospec,
  OPEN_BUG,
  FEATURE_COVER,
  openFeature,
  gitInit,
  writeFile,
  VERIFY,
  project,
  stateOf,
  OPEN_DOCS,
  fitnessProject,
  chain,
  chainProject,
  OPEN_PAGES,
  RED_PAGES,
} = require("./lib/test-support/ospec-cli.js");

// E5.10 ospec snapshot (REQ-idd-026): the progress snapshot, on demand only.
const SNAPSHOT_ROADMAP = "| Phase | Content |\n| --- | --- |\n| A1. Alpha | x |\n| B2. Beta | y |\n";

test("[REQ-idd-026] snapshot prints the bare snapshot on stdout, with or without --json, outside git too", (t) => {
  const root = plainRoot(t);
  writeFile(root, "docs/roadmap.md", SNAPSHOT_ROADMAP);
  fs.mkdirSync(path.join(root, "idd", "archive", "2026-01-02-a1-start"), { recursive: true });
  const expected = {
    schemaVersion: 1,
    phases: [
      { id: "a1", title: "Alpha", status: "done" },
      { id: "b2", title: "Beta", status: "pending" },
    ],
  };
  for (const args of [["snapshot"], ["snapshot", "--json"]]) {
    const result = ospec(root, ...args);
    assert.strictEqual(result.code, 0, result.stderr);
    assert.strictEqual(result.stdout, `${JSON.stringify(expected, null, 2)}\n`);
  }
});

test("[REQ-idd-026] snapshot --out writes the file and reports it", (t) => {
  const root = plainRoot(t);
  writeFile(root, "plans/phases.md", SNAPSHOT_ROADMAP);
  const result = ospec(root, "snapshot", "--roadmap", "plans/phases.md", "--out", "out/snapshot.json");
  assert.strictEqual(result.code, 0, result.stderr);
  const text = fs.readFileSync(path.join(root, "out", "snapshot.json"), "utf8");
  assert.strictEqual(JSON.parse(text).phases.length, 2);
  assert.strictEqual(result.stdout, `snapshot: 2 phases from plans/phases.md written to out/snapshot.json (${Buffer.byteLength(text)} bytes)\n`);
  const json = ospec(root, "snapshot", "--roadmap", "plans/phases.md", "--out", "out/snapshot.json", "--json").json;
  assert.deepStrictEqual(json, { ok: true, command: "snapshot", roadmap: "plans/phases.md", out: "out/snapshot.json", phases: 2, bytes: Buffer.byteLength(text) });
});

test("[REQ-idd-026] snapshot refuses an unusable roadmap with exit 1 and writes nothing", (t) => {
  const root = plainRoot(t);
  const missing = ospec(root, "snapshot", "--out", "snapshot.json");
  assert.strictEqual(missing.code, 1);
  assert.strictEqual(missing.stderr, "ospec: roadmap not found: docs/roadmap.md (roadmap-missing)\npass --roadmap <path> to read another roadmap\n");
  writeFile(root, "docs/roadmap.md", "| Phase |\n| --- |\n| A1. Alpha |\n| A1. Again |\n");
  const repeated = ospec(root, "snapshot", "--out", "snapshot.json", "--json");
  assert.strictEqual(repeated.code, 1);
  assert.strictEqual(repeated.json.error.code, "roadmap-invalid");
  assert.match(repeated.json.error.message, /docs\/roadmap\.md:4/);
  assert.ok(!fs.existsSync(path.join(root, "snapshot.json")));
});

// E5.11 the v2: groups from the roadmap and client texts from the progress file.
const SNAPSHOT_V2_ROADMAP = [
  "## S1. Base",
  "| Change | Content |",
  "| --- | --- |",
  "| S1a. Platform | x |",
  "| S1b. Access | y |",
  "## Milestones",
  "| Milestone | Content |",
  "| --- | --- |",
  "| M1. Docs | z |",
  "",
].join("\n");

function snapshotV2Project(t, progress) {
  const root = plainRoot(t);
  writeFile(root, "docs/roadmap.md", SNAPSHOT_V2_ROADMAP);
  if (progress !== undefined) writeFile(root, "docs/progress.md", progress);
  fs.mkdirSync(path.join(root, "idd", "archive", "2026-01-02-s1a-platform"), { recursive: true });
  return root;
}

const SNAPSHOT_V2_PROGRESS = "## S1. The base\n\nWhat every client needs.\n\n### S1a. The platform\n\n- short: Platform\n\n#### Tasks\n\n- [x] domain: Own domain\n";

test("[REQ-idd-026] snapshot --schema-version 2 prints the v2 with groups and client texts", (t) => {
  const root = snapshotV2Project(t, SNAPSHOT_V2_PROGRESS);
  const expected = {
    schemaVersion: 2,
    groups: [
      { id: "s1", title: "The base", summary: "What every client needs." },
      { id: "milestones", title: "Milestones" },
    ],
    phases: [
      { id: "s1a", title: "The platform", status: "done", group: "s1", shortTitle: "Platform", tasks: [{ id: "domain", title: "Own domain", done: true }] },
      { id: "s1b", title: "Access", status: "pending", group: "s1" },
      { id: "m1", title: "Docs", status: "pending", group: "milestones" },
    ],
  };
  for (const args of [["snapshot", "--schema-version", "2"], ["snapshot", "--schema-version", "2", "--json"]]) {
    const result = ospec(root, ...args);
    assert.strictEqual(result.code, 0, result.stderr);
    assert.strictEqual(result.stdout, `${JSON.stringify(expected, null, 2)}\n`);
  }
  // Without the option the v1 is unchanged.
  assert.deepStrictEqual(JSON.parse(ospec(root, "snapshot").stdout), {
    schemaVersion: 1,
    phases: [
      { id: "s1a", title: "Platform", status: "done" },
      { id: "s1b", title: "Access", status: "pending" },
      { id: "m1", title: "Docs", status: "pending" },
    ],
  });
});

test("[REQ-idd-026] snapshot v2 --out reports its version and the progress file it read", (t) => {
  const root = snapshotV2Project(t, SNAPSHOT_V2_PROGRESS);
  const result = ospec(root, "snapshot", "--schema-version", "2", "--out", "snapshot.json");
  assert.strictEqual(result.code, 0, result.stderr);
  const bytes = Buffer.byteLength(fs.readFileSync(path.join(root, "snapshot.json"), "utf8"));
  assert.strictEqual(result.stdout, `snapshot v2: 3 phases from docs/roadmap.md and docs/progress.md written to snapshot.json (${bytes} bytes)\n`);
  writeFile(root, "plans/client.md", "## S1.\n");
  const json = ospec(root, "snapshot", "--schema-version", "2", "--progress", "plans/client.md", "--out", "snapshot.json", "--json").json;
  assert.deepStrictEqual(json, {
    ok: true,
    command: "snapshot",
    schema_version: 2,
    roadmap: "docs/roadmap.md",
    out: "snapshot.json",
    phases: 3,
    bytes: Buffer.byteLength(fs.readFileSync(path.join(root, "snapshot.json"), "utf8")),
    progress: "plans/client.md",
  });
  const bare = snapshotV2Project(t);
  assert.strictEqual(ospec(bare, "snapshot", "--schema-version", "2", "--out", "s.json").stdout.startsWith("snapshot v2: 3 phases from docs/roadmap.md written to s.json"), true);
});

test("[REQ-idd-026] snapshot refuses a bad version, --progress without the v2 and a progress file out of its syntax, writing nothing", (t) => {
  const root = snapshotV2Project(t, SNAPSHOT_V2_PROGRESS.replace("- [x] domain", "- [ ] domain"));
  for (const args of [["--schema-version", "5"], ["--progress", "docs/progress.md"]]) {
    const result = ospec(root, "snapshot", ...args, "--out", "snapshot.json");
    assert.strictEqual(result.code, 2, result.stderr);
    assert.match(result.stderr, /\(usage\)/);
  }
  const unchecked = ospec(root, "snapshot", "--schema-version", "2", "--out", "snapshot.json", "--json");
  assert.strictEqual(unchecked.code, 1);
  assert.strictEqual(unchecked.json.error.code, "progress-invalid");
  assert.strictEqual(unchecked.json.error.message, "docs/progress.md:11: phase s1a is done, so task domain must be checked: '- [x]'");
  const missing = ospec(root, "snapshot", "--schema-version", "2", "--progress", "nope.md", "--out", "snapshot.json");
  assert.strictEqual(missing.code, 1);
  assert.match(missing.stderr, /^ospec: progress file not found: nope\.md \(progress-missing\)\n/);
  assert.ok(!fs.existsSync(path.join(root, "snapshot.json")));
});

// E5.12 the v3: the delivery stage of each done phase, from the changelog.
function snapshotV3Project(t, changelog) {
  const root = snapshotV2Project(t, SNAPSHOT_V2_PROGRESS);
  writeFile(root, "idd/config.yaml", "delivery:\n  changelog: CHANGELOG.md\n");
  if (changelog !== undefined) writeFile(root, "CHANGELOG.md", changelog);
  return root;
}

const SNAPSHOT_V3_CHANGELOG = "# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-03\n\n### Added\n- The platform (s1a-platform)\n";

test("[REQ-idd-026] snapshot --schema-version 3 prints the v2 with the delivery stage of each done phase", (t) => {
  const root = snapshotV3Project(t, SNAPSHOT_V3_CHANGELOG);
  for (const args of [["snapshot", "--schema-version", "3"], ["snapshot", "--schema-version", "3", "--json"]]) {
    const result = ospec(root, ...args);
    assert.strictEqual(result.code, 0, result.stderr);
    const v2 = JSON.parse(ospec(root, "snapshot", "--schema-version", "2").stdout);
    v2.schemaVersion = 3;
    v2.phases[0].release = { stage: "production", version: "1.0.0", date: "2026-01-03" };
    assert.strictEqual(result.stdout, `${JSON.stringify(v2, null, 2)}\n`);
  }
  // Still unreleased, the phase is in testing; without a changelog it has no stage.
  writeFile(root, "CHANGELOG.md", "## [Unreleased]\n\n- The platform (s1a-platform)\n");
  assert.deepStrictEqual(JSON.parse(ospec(root, "snapshot", "--schema-version", "3").stdout).phases[0].release, { stage: "testing" });
  fs.rmSync(path.join(root, "CHANGELOG.md"));
  assert.strictEqual(JSON.parse(ospec(root, "snapshot", "--schema-version", "3").stdout).phases[0].release, undefined);
});

test("[REQ-idd-026] snapshot v3 --out reports the changelog it read", (t) => {
  const root = snapshotV3Project(t, SNAPSHOT_V3_CHANGELOG);
  const result = ospec(root, "snapshot", "--schema-version", "3", "--out", "snapshot.json");
  assert.strictEqual(result.code, 0, result.stderr);
  const bytes = Buffer.byteLength(fs.readFileSync(path.join(root, "snapshot.json"), "utf8"));
  assert.strictEqual(result.stdout, `snapshot v3: 3 phases from docs/roadmap.md, docs/progress.md and CHANGELOG.md written to snapshot.json (${bytes} bytes)\n`);
  const json = ospec(root, "snapshot", "--schema-version", "3", "--out", "snapshot.json", "--json").json;
  assert.deepStrictEqual(json, { ok: true, command: "snapshot", schema_version: 3, roadmap: "docs/roadmap.md", out: "snapshot.json", phases: 3, bytes, progress: "docs/progress.md", changelog: "CHANGELOG.md" });
  fs.rmSync(path.join(root, "CHANGELOG.md"));
  assert.strictEqual(ospec(root, "snapshot", "--schema-version", "3", "--out", "snapshot.json", "--json").json.changelog, null);
});

test("[REQ-idd-026] snapshot v3 refuses a changelog that cannot decide a stage, or an unreadable configuration, writing nothing", (t) => {
  const root = snapshotV3Project(t, SNAPSHOT_V3_CHANGELOG.replace(" - 2026-01-03", ""));
  const undated = ospec(root, "snapshot", "--schema-version", "3", "--out", "snapshot.json", "--json");
  assert.strictEqual(undated.code, 1);
  assert.strictEqual(undated.json.error.code, "changelog-invalid");
  assert.strictEqual(undated.json.error.message, "CHANGELOG.md:5: version 1.0.0 needs its date: '## [1.0.0] - YYYY-MM-DD'");
  assert.match(undated.json.error.how, /## \[Unreleased\]/);
  writeFile(root, "CHANGELOG.md", "## [Unreleased]\n- The platform (s1a-platform)\n## [1.0.0] - 2026-01-03\n- The platform (s1a-platform)\n");
  const twice = ospec(root, "snapshot", "--schema-version", "3", "--out", "snapshot.json");
  assert.strictEqual(twice.code, 1);
  assert.match(twice.stderr, /^ospec: CHANGELOG\.md:4: the entry of change s1a-platform sits under the heading of line 3, and the one of line 2 under the heading of line 1 \(changelog-invalid\)\n/);
  writeFile(root, "idd/config.yaml", "delivery:\n  changelog: /etc/changes.md\n");
  const config = ospec(root, "snapshot", "--schema-version", "3", "--out", "snapshot.json");
  assert.strictEqual(config.code, 1);
  assert.match(config.stderr, /\(config-invalid\)/);
  assert.ok(!fs.existsSync(path.join(root, "snapshot.json")));
  // The v2 reads neither.
  assert.strictEqual(ospec(root, "snapshot", "--schema-version", "2").code, 0);
});

// E5.13 the v4: the documentation of the project, with the decisions of its ADRs.
const SNAPSHOT_V4_PROGRESS = `${SNAPSHOT_V2_PROGRESS}\n## Problem\n\nClients ask how it goes.\n\n## Decisions\n\n### 0001. A web app\n\nNothing to install.\n`;

function snapshotV4Project(t) {
  const root = snapshotV3Project(t, SNAPSHOT_V3_CHANGELOG);
  writeFile(root, "docs/roadmap.md", SNAPSHOT_V2_ROADMAP.replace("| Change | Content |\n| --- | --- |\n| S1a. Platform | x |", "| Change | Content | ADRs |\n| --- | --- | --- |\n| S1a. Platform | x | 0001 |"));
  writeFile(root, "docs/progress.md", SNAPSHOT_V4_PROGRESS);
  writeFile(root, "docs/architecture/decisions/0001-web-app.md", "# 0001. Web application\n\n- Status: accepted\n- Date: 2026-01-02\n");
  writeFile(root, "docs/architecture/decisions/0002-native-app.md", "# 0002. Native application\n\n- Status: rejected\n");
  return root;
}

test("[REQ-idd-026] snapshot --schema-version 4 prints the v3 with the documentation and the decisions", (t) => {
  const root = snapshotV4Project(t);
  const outputs = [["snapshot", "--schema-version", "4"], ["snapshot", "--schema-version", "4", "--json"]].map((args) => ospec(root, ...args));
  for (const result of outputs) assert.strictEqual(result.code, 0, result.stderr);
  assert.strictEqual(outputs[1].stdout, outputs[0].stdout);
  const { problem, decisions, ...rest } = JSON.parse(outputs[0].stdout);
  assert.strictEqual(problem, "Clients ask how it goes.");
  assert.deepStrictEqual(decisions, [{ number: 1, title: "A web app", date: "2026-01-02", status: "accepted", reason: "Nothing to install.", phases: ["s1a"] }]);
  // The v3 refuses the documentation sections; without them it is the rest of the v4.
  assert.strictEqual(ospec(root, "snapshot", "--schema-version", "3").code, 1);
  writeFile(root, "docs/progress.md", SNAPSHOT_V2_PROGRESS);
  assert.deepStrictEqual(rest, { ...JSON.parse(ospec(root, "snapshot", "--schema-version", "3").stdout), schemaVersion: 4 });
});

test("[REQ-idd-026] snapshot v4 --out reports the ADR directory it read, and refuses a decision without its reason, writing nothing", (t) => {
  const root = snapshotV4Project(t);
  const result = ospec(root, "snapshot", "--schema-version", "4", "--out", "snapshot.json");
  assert.strictEqual(result.code, 0, result.stderr);
  const bytes = Buffer.byteLength(fs.readFileSync(path.join(root, "snapshot.json"), "utf8"));
  assert.strictEqual(result.stdout, `snapshot v4: 3 phases from docs/roadmap.md, docs/progress.md, CHANGELOG.md and docs/architecture/decisions written to snapshot.json (${bytes} bytes)\n`);
  const json = ospec(root, "snapshot", "--schema-version", "4", "--out", "snapshot.json", "--json").json;
  assert.deepStrictEqual(json, {
    ok: true,
    command: "snapshot",
    schema_version: 4,
    roadmap: "docs/roadmap.md",
    out: "snapshot.json",
    phases: 3,
    bytes,
    progress: "docs/progress.md",
    changelog: "CHANGELOG.md",
    decisions: "docs/architecture/decisions",
  });
  fs.rmSync(path.join(root, "snapshot.json"));
  writeFile(root, "docs/progress.md", SNAPSHOT_V4_PROGRESS.split("\n## Decisions")[0]);
  const reasonless = ospec(root, "snapshot", "--schema-version", "4", "--out", "snapshot.json", "--json");
  assert.strictEqual(reasonless.code, 1);
  assert.strictEqual(reasonless.json.error.code, "decisions-invalid");
  assert.strictEqual(reasonless.json.error.message, "docs/architecture/decisions/0001-web-app.md:3: ADR 0001 is accepted and has no reason for the client");
  assert.match(reasonless.json.error.how, /'## Decisions' section of docs\/progress\.md, or mark it '- internal'/);
  assert.ok(!fs.existsSync(path.join(root, "snapshot.json")));
});

test("[REQ-idd-026] no IDD step, hook or check runs snapshot", () => {
  for (const file of ["skills/idd/SKILL.md", "hooks/hooks.json", "idd/config.yaml"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), /ospec(\.js)?["']? snapshot/, file);
  }
});

// E4.15 cli-chaining: the CLI chains what it already knows (REQ-idd-011,
// REQ-idd-014).
// ---------------------------------------------------------------------------

// The red run of the reproduction test, the fix and the green run.
function redGreen(root, command = "node --test") {
  const run = () => chain(root, "run", "--change", "fix-pages", "--obligation", "repro-test", "--command", command, "--json");
  fs.appendFileSync(path.join(root, "test/pages.test.js"), RED_PAGES);
  const red = run();
  writeFile(root, "src/pages.js", "module.exports = (items) => Math.ceil(items / 10);\n");
  return { red, green: run() };
}

test("[REQ-idd-011] record intent declares the plan in the same write, as intent then signals would (E4.15)", (t) => {
  const { root } = chainProject(t);
  const plan = ["--path", "src/pages.js", "--path", "test/pages.test.js", "--work-units", "2"];
  const chained = ospec(root, ...OPEN_PAGES, "--work-units", "2", "--json");
  assert.strictEqual(chained.code, 0, chained.stderr);
  assert.deepStrictEqual(chained.json.plan.added, { signals: ["bug-fix", "multi-unit-or-decision"] });
  assert.strictEqual(chained.json.next.next_step.obligation, "repro-test", "the plan is declared");

  const long = OPEN_PAGES.slice(0, OPEN_PAGES.indexOf("--path")).map((arg) => (arg === "fix-pages" ? "fix-twice" : arg));
  ospec(root, ...long);
  ospec(root, "signals", "--change", "fix-twice", ...plan);
  const declared = (change) => {
    const { plan: declaredPlan, signals, gates, obligations } = stateOf(root, change);
    return { declaredPlan, signals, gates, obligations };
  };
  assert.deepStrictEqual(declared("fix-pages"), declared("fix-twice"));

  const text = ospec(root, ...OPEN_PAGES, "--work-units", "2");
  assert.strictEqual(text.code, 0, text.stderr);
  assert.match(text.stdout, /^no change: intent already recorded on fix-pages; the plan and every derived signal were already recorded; floor [a-z]+\nmemory query: .+\nnext \(repro-test\): ospec run --change fix-pages /);
});

test("[REQ-idd-011] record intent writes neither the intent nor the plan when it refuses either (E4.15)", (t) => {
  const { root } = chainProject(t);
  const ambiguous = ospec(root, "record", "intent", "--change", "fix-pages", "--ambiguous", "--request", "pages are off", "--path", "src/pages.js", "--json");
  assert.deepStrictEqual([ambiguous.code, ambiguous.json.error.code], [2, "usage"]);
  assert.match(ambiguous.json.error.message, /an ambiguous intent declares no plan/);

  const unknown = ospec(root, ...OPEN_PAGES, "--adr", "0099", "--json");
  assert.deepStrictEqual([unknown.code, unknown.json.error.code], [1, "unknown-reference"]);
  const undeclared = ospec(root, ...OPEN_PAGES.filter((arg, index, args) => !["--no-open-facts", "--basis"].includes(arg) && args[index - 1] !== "--basis"), "--json");
  assert.deepStrictEqual([undeclared.code, undeclared.json.error.code], [1, "facts-undeclared"]);
  const units = ospec(root, ...OPEN_PAGES, "--work-units", "0", "--json");
  assert.strictEqual(units.code, 2);
  assert.ok(!fs.existsSync(path.join(root, "idd", "fix-pages", "state.yaml")), "nothing is written");
});

test("[REQ-idd-011] every command that writes a change returns the next ospec next gives (E4.15)", (t) => {
  const { root } = project(t, { checks: "checks:\n  test: node verify.js\ndelivery:\n  branching: serial\n" });
  const same = (result, label) => {
    assert.strictEqual(result.code, 0, `${label}: ${result.stderr}`);
    // E4.16: it leaves out the intent, which ospec next keeps.
    const { ok, command, intent, ...next } = ospec(root, "next", "--change", "fix-pagination", "--json").json;
    assert.deepStrictEqual([ok, command, intent.kind], [true, "next", "bug"]);
    assert.deepStrictEqual(result.json.next, next, label);
    return result;
  };
  const opened = same(ospec(root, ...OPEN_BUG), "record intent").json.next;
  assert.deepStrictEqual([opened.next_step.action, opened.delivery.branching], ["declare-plan", "serial"]);
  same(ospec(root, "signals", "--change", "fix-pagination", "--path", "src/pages.txt", "--json"), "signals");
  same(ospec(root, "record", "assumption", "--change", "fix-pagination", "--text", "Pages count from one.", "--json"), "record assumption");
  writeFile(root, "test/pages.js", `${VERIFY}\n`);
  const repro = ["run", "--change", "fix-pagination", "--obligation", "repro-test", "--command", "node test/pages.js", "--json"];
  same(ospec(root, ...repro), "red run");
  writeFile(root, "src/pages.txt", "2");
  same(ospec(root, ...repro), "green run");
  assert.strictEqual(same(ospec(root, "check", "--change", "fix-pagination", "--json"), "check").json.next.next_step.action, "close");
});

test("[REQ-idd-014] a bugfix closes with four calls: intent with its plan, the red and green runs of the check, and close (E4.15)", (t) => {
  const { root } = chainProject(t);
  const opened = ospec(root, ...OPEN_PAGES, "--json");
  assert.strictEqual(opened.json.next.next_step.command, 'ospec run --change fix-pages --obligation repro-test --command "<test>"');
  const { red, green } = redGreen(root);
  assert.deepStrictEqual([red.code, red.json.run.exit_code, red.json.check.name, red.json.check.evidence], [0, 1, "test", undefined]);
  assert.strictEqual(green.code, 0, green.stderr);
  assert.strictEqual(green.json.verdict, "ready", JSON.stringify(green.json.missing));
  assert.deepStrictEqual(green.json.next.next_step, { action: "close", command: "ospec close --change fix-pages" });
  assert.match(chain(root, "run", "--change", "fix-pages", "--obligation", "repro-test", "--command", "node --test").stdout, /^counted as check test \(run-\d+\): recorded evidence ev-\d+$/m);
  const closed = ospec(root, "close", "--change", "fix-pages", "--json");
  assert.strictEqual(closed.code, 0, closed.stderr);
});

test("[REQ-idd-014] a run of the only check leaves the evidence ospec check leaves on the same tree (E4.15)", (t) => {
  const { root } = pagesFeature(t);
  const viaRun = stateOf(root, "add-pages");
  const checked = chain(root, "check", "--change", "add-pages", "--json");
  assert.deepStrictEqual([checked.json.verdict, checked.json.added], ["ready", undefined], "the run recorded what the diff derives");
  const viaCheck = stateOf(root, "add-pages");
  const proof = (state, obligation) => {
    const entry = state.obligations.find((item) => item.id === obligation);
    const evidence = state.evidence.find((item) => item.id === entry.evidence.at(-1));
    const runs = (evidence.detail.runs || [evidence.detail.run]).map((id) => state.runs.find((run) => run.id === id));
    return {
      status: entry.status,
      kind: evidence.kind,
      tree: evidence.detail.tree,
      tests: evidence.detail.tests,
      runs: runs.map((run) => ({ purpose: run.purpose, name: run.name, command: run.command, exit_code: run.exit_code, tree: run.tree, tests: run.tests })),
    };
  };
  assert.deepStrictEqual(proof(viaRun, "checks-pass"), proof(viaCheck, "checks-pass"));
  const statuses = (state) => state.obligations.map(({ id, status }) => `${id} ${status}`);
  assert.deepStrictEqual([statuses(viaRun), viaRun.signals, viaRun.gates], [statuses(viaCheck), viaCheck.signals, viaCheck.gates]);
});

test("[REQ-idd-014] a failing run of the only check returns checks-pass to pending, as a failing check does (E4.15)", (t) => {
  const { root } = project(t, { checks: "checks:\n  test: node gate.js\n" });
  writeFile(root, "gate.js", "process.exit(process.env.OSPEC_GATE_FAIL ? 1 : 0);\n");
  ospec(root, ...OPEN_BUG);
  ospec(root, "signals", "--change", "fix-pagination", "--path", "gate.js");
  const checksPass = () => stateOf(root, "fix-pagination").obligations.find((entry) => entry.id === "checks-pass").status;
  ospec(root, "check", "--change", "fix-pagination");
  assert.strictEqual(checksPass(), "satisfied");

  const run = ["run", "--change", "fix-pagination", "--obligation", "repro-test", "--command", "node gate.js", "--json"];
  const red = ospecWith({ ...process.env, OSPEC_GATE_FAIL: "1" }, root, ...run);
  assert.strictEqual(checksPass(), "pending", "the same tree, failing now");
  assert.deepStrictEqual(red.json.missing.find((entry) => entry.obligation === "checks-pass").reason, "check test failed with exit code 1");
  ospec(root, ...run);
  assert.strictEqual(checksPass(), "satisfied");
});

test("[REQ-idd-014] a run counts as the check only for the exact command of a single declared check (E4.15)", (t) => {
  const { root } = project(t);
  writeFile(root, "src/pages.txt", "2");
  ospec(root, ...OPEN_BUG);
  ospec(root, "signals", "--change", "fix-pagination", "--path", "src/pages.txt");
  const run = (command) => ospec(root, "run", "--change", "fix-pagination", "--obligation", "repro-test", "--command", command, "--json").json;
  assert.strictEqual(run(" node verify.js ").check.name, "test", "spaces at the ends do not count");
  assert.strictEqual(run("node  verify.js").check, undefined);
  writeFile(root, "idd/config.yaml", "checks:\n  test: node verify.js\n  lint: node -e 0\n");
  const runs = stateOf(root, "fix-pagination").runs.length;
  assert.strictEqual(run("node verify.js").check, undefined, "one of several checks");
  assert.strictEqual(stateOf(root, "fix-pagination").runs.length, runs + 1);
});

test("[REQ-idd-014] what check refuses leaves the run of the check a test run, with a warning (E4.15)", (t) => {
  const { root } = project(t);
  const cover = [...FEATURE_COVER];
  cover.splice(cover.indexOf("persistence=fixes every behavior") - 1, 2, "--cite", "persistence=verify.js:1");
  openFeature(root, "record", "intent", "--change", "add-index", "--kind", "feature", "--summary", "Faster search.", "--acceptance", "Search under 50 ms.", ...cover);
  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "db/migrations/004_add_index.sql", "CREATE INDEX customers_name ON customers (name);\n");
  ospec(root, "signals", "--change", "add-index", "--diff");
  const ran = ospec(root, "run", "--change", "add-index", "--obligation", "migration-compat-and-test", "--command", "node verify.js", "--plan", "additive index", "--json");
  assert.strictEqual(ran.code, 0, ran.stderr);
  assert.ok(ran.json.evidence, "the migration test is recorded");
  assert.strictEqual(ran.json.check, undefined);
  assert.match(ran.json.warnings[0], /^not counted as check test: persistence=verify\.js:1 cites a file that is neither in the plan nor in the diff; ospec signals --change add-index --path verify\.js/);
  assert.ok(!stateOf(root, "add-index").runs.some((entry) => entry.purpose === "checks"));
});

test("[REQ-idd-022] a run that counts as the check leaves the fitness checks to ospec check (E4.15)", (t) => {
  const { root } = fitnessProject(t);
  writeFile(root, "db/migrations/004_add_index.sql", "CREATE INDEX orders_placed ON orders (placed_at);\n");
  assert.strictEqual(ospec(root, "check", "--change", "order-events", "--json").json.missing[0].obligation, "migration-compat-and-test");
  const fitnessRuns = () => stateOf(root, "order-events").runs.filter((entry) => entry.purpose === "fitness").length;
  const before = fitnessRuns();
  const migrate = () => ospec(root, "run", "--change", "order-events", "--obligation", "migration-compat-and-test", "--command", "node verify.js", "--plan", "additive index", "--json");

  const sameTree = migrate();
  assert.strictEqual(sameTree.json.check.name, "test");
  assert.ok(!(sameTree.json.missing || []).some((entry) => entry.obligation === "adr-impact-declaration"), "the check of this tree ran its fitness checks");

  writeFile(root, "src/core.js", "module.exports = 3;\n");
  const moved = migrate();
  const impact = moved.json.missing.find((entry) => entry.obligation === "adr-impact-declaration");
  assert.strictEqual(impact.reason, "its fitness checks run only in ospec check: ospec check --change order-events");
  assert.strictEqual(fitnessRuns(), before, "a run runs no fitness check");
  assert.strictEqual(moved.json.next.next_step.command, "ospec check --change order-events --close");

  const checked = ospec(root, "check", "--change", "order-events", "--json");
  assert.ok(!checked.json.missing.some((entry) => entry.obligation === "adr-impact-declaration"), JSON.stringify(checked.json.missing));
  assert.strictEqual(fitnessRuns(), before + 1);
});

test("[REQ-idd-014] check --close closes a ready change in the same call and refuses as close otherwise (E4.15)", (t) => {
  const { root, git } = project(t);
  ospec(root, ...OPEN_DOCS);
  const refused = ospec(root, "check", "--change", "fix-readme", "--close", "--json");
  assert.deepStrictEqual([refused.code, refused.json.ok, refused.json.error], [
    1,
    false,
    { code: "close-refused", message: "close refused: the check answered missing (checks-pass)", how: "ospec check --change fix-readme --close" },
  ]);
  assert.strictEqual(refused.json.check.missing[0].reason, "check test failed with exit code 1");
  assert.deepStrictEqual(stateOf(root, "fix-readme").runs.map((run) => run.exit_code), [1], "the check stays recorded");
  const text = ospec(root, "check", "--change", "fix-readme", "--close");
  assert.strictEqual(text.code, 1);
  assert.match(text.stdout, /^missing checks-pass: check test failed with exit code 1$/m);
  assert.strictEqual(text.stderr, "ospec: close refused: the check answered missing (checks-pass) (close-refused)\nospec check --change fix-readme --close\n");

  writeFile(root, "src/pages.txt", "2");
  writeFile(root, "idd/config.yaml", "checks:\n  test: node verify.js\n  smoke: node -e 0\n");
  const gated = ospec(root, "check", "--change", "fix-readme", "--close", "--json");
  // E1.49: the checks nobody approved yet do not run, so checks-pass waits for the answer too.
  assert.deepStrictEqual([gated.code, gated.json.error.message], [1, "close refused: the check answered missing (checks-pass, gate checks-changed)"]);
  const approved = ospec(root, "record", "gate", "--change", "fix-readme", "--gate", "checks-changed", "--resolve", "--answer", "Yes, add smoke.", "--source", "user");
  assert.strictEqual(approved.code, 0, approved.stderr);

  const closed = ospec(root, "check", "--change", "fix-readme", "--close", "--json");
  assert.strictEqual(closed.code, 0, closed.stderr);
  assert.deepStrictEqual([closed.json.verdict, closed.json.close.status, closed.json.next], ["ready", "closed", undefined]);
  assert.ok(fs.existsSync(path.join(root, closed.json.close.archive.destination, "state.yaml")));
  assert.ok(!fs.existsSync(path.join(root, "idd", "fix-readme")));

  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "smoke");
  ospec(root, ...OPEN_DOCS.map((arg) => (arg === "fix-readme" ? "fix-typo" : arg)));
  writeFile(root, "notes.txt", "typo fixed\n");
  const closedText = ospec(root, "check", "--change", "fix-typo", "--close");
  assert.strictEqual(closedText.code, 0, closedText.stderr);
  assert.match(closedText.stdout, /^ready: fix-typo can close\n[^]*\nfix-typo closed and archived in idd\/archive\/\d{4}-\d{2}-\d{2}-fix-typo /);
});

// A feature of the pages project under strict TDD, answered and built red to
// green with the command of its only check: five calls.
function pagesFeature(t) {
  const { root, git } = chainProject(t);
  writeFile(root, "idd/config.yaml", "strict_tdd: true\nchecks:\n  test: node --test\n");
  git("commit", "-q", "--no-verify", "-am", "strict");
  const opened = ospec(root, "record", "intent", "--change", "add-pages", "--kind", "feature", "--summary", "Count the last partial page.", "--acceptance", "Eleven items need two pages.", ...FEATURE_COVER, "--path", "src/pages.js", "--path", "test/pages.test.js", "--json");
  assert.strictEqual(opened.json.next.next_step.action, "resolve-gate");
  const answered = ospec(root, "record", "gate", "--change", "add-pages", "--gate", "open-facts", "--resolve", "--answer", "Yes, above 100 is refused.", "--source", "user", "--json");
  assert.strictEqual(answered.json.next.next_step.obligation, "tdd-red-green");
  const run = () => chain(root, "run", "--change", "add-pages", "--obligation", "tdd-red-green", "--unit", "pages", "--command", "node --test", "--json");
  fs.appendFileSync(path.join(root, "test/pages.test.js"), RED_PAGES);
  assert.strictEqual(run().json.run.exit_code, 1);
  writeFile(root, "src/pages.js", "module.exports = (items) => Math.ceil(items / 10);\n");
  return { root, green: run() };
}

test("[REQ-idd-014] a feature with one question closes with five calls: intent, the answer, the red and green runs and close (E4.15)", (t) => {
  const { root, green } = pagesFeature(t);
  assert.strictEqual(green.json.verdict, "ready", JSON.stringify(green.json.missing));
  const closed = ospec(root, "close", "--change", "add-pages", "--json");
  assert.strictEqual(closed.code, 0, closed.stderr);
});

// E4.16 cli-terse-output: the next of a new change prints the template of the
// categories the project covers, so the record intent refusals reproduced
// from idd-7 had it before failing; a project with code and no UI covers five.
const CLI_FEATURE = ["record", "intent", "--change", "add-priority", "--kind", "feature", "--summary", "Tasks take a priority.", "--acceptance", "add --priority high stores it.", "--request", "Las tareas tienen prioridad"];
const CORE_ASKED = [
  "inputs:¿Qué prioridad recibe una tarea creada sin --priority?",
  'uniqueness:¿"High" y "high" son la misma prioridad?',
  'persistence:¿Una prioridad desconocida en tasks.json se lee como "normal"?',
  'copy:¿La lista muestra la prioridad como "[alta]"?',
  "errors:¿--priority urgente sale con código 2?",
].flatMap((fact) => ["--open-fact", fact]);

test("[REQ-idd-018] the next of a new change prints the categories of the project's profile (E4.16)", (t) => {
  const root = tempRoot(t);
  const git = gitInit(root);
  writeFile(root, "src/tasks.js", "module.exports = [];\n");
  git("add", "-A");
  git("commit", "-q", "--no-verify", "-m", "base");
  const next = ospec(root, "next", "--json").json.next_step;
  assert.strictEqual(next.action, "open-change");
  assert.deepStrictEqual(next.feature.categories, ["inputs", "uniqueness", "persistence", "copy", "errors"]);
  assert.deepStrictEqual(next.feature.omitted, ["url-state", "accessibility"]);
  assert.match(next.feature.command, /--kind feature [^]*--open-fact inputs:"<question>" --open-fact uniqueness:"<question>"/);
  const text = ospec(root, "next").stdout;
  assert.ok(text.includes(`feature: ${next.feature.command}\n`), text);
  assert.match(text, /left out: url-state, accessibility \(the project has code and no UI file/);

  // The idd-7 refusals: no category, a category of its own, one twice and the
  // plain form; each prints the template next gave before failing.
  for (const facts of [
    ["--open-fact", "¿Qué prioridad recibe una tarea creada sin --priority?"],
    ["--open-fact", "Base del porcentaje:¿se aplica sobre 100 o sobre el subtotal?"],
    ["--open-fact", "inputs:¿Qué prioridad recibe una tarea sin --priority?", "--open-fact", "inputs:¿Se admite --priority 0?"],
    ["--no-open-facts", "--basis", "the request settles it"],
  ]) {
    const refused = ospec(root, ...CLI_FEATURE, ...facts, "--json");
    assert.strictEqual(refused.json.error.code, "facts-undeclared", facts.join(" "));
    assert.ok(refused.json.error.how.startsWith(next.feature.command), refused.json.error.how);
  }
  // The regulated refusal: without url-state and accessibility the change opens.
  const opened = ospec(root, ...CLI_FEATURE, ...CORE_ASKED, "--json");
  assert.strictEqual(opened.code, 0, opened.stdout);
  assert.deepStrictEqual(stateOf(root, "add-priority").facts.coverage.map((entry) => entry.category), ["inputs", "uniqueness", "persistence", "copy", "errors"]);

  // A UI file in the plan, or in the project, asks all seven.
  const withUi = ospec(root, ...CLI_FEATURE.map((arg) => (arg === "add-priority" ? "priority-badge" : arg)), ...CORE_ASKED, "--path", "src/badge.tsx", "--json");
  assert.strictEqual(withUi.json.error.message, "a feature must cover url-state, accessibility");
  const web = tempRoot(t);
  writeFile(web, "src/tasks.js", "module.exports = [];\n");
  writeFile(web, "public/index.html", "<main></main>\n");
  const webNext = ospec(web, "next", "--json").json.next_step.feature;
  assert.deepStrictEqual([webNext.categories.length, webNext.omitted], [7, undefined]);
  assert.strictEqual(ospec(tempRoot(t), "next", "--json").json.next_step.feature.categories.length, 7, "a project without code");
});

// E4.16: the CLI writes the Plan of change.md from --path and its Decisions
// from --decision "<text>", so a change with a decision closes without a hand
// edit; --decision without its text is a usage error.
test("[REQ-idd-004] a change with a decision closes without editing change.md (E4.16)", (t) => {
  const { root } = chainProject(t);
  const bare = ospec(root, ...OPEN_PAGES, "--decision", "--json");
  assert.deepStrictEqual([bare.code, bare.json.error.code], [2, "usage"]);
  assert.strictEqual(ospec(root, ...OPEN_PAGES, "--decision", " ", "--json").code, 2);
  assert.ok(!fs.existsSync(path.join(root, "idd", "fix-pages")), "nothing is written");

  const opened = ospec(root, ...OPEN_PAGES, "--decision", "A partial page counts as a page.", "--json");
  assert.strictEqual(opened.code, 0, opened.stdout);
  assert.deepStrictEqual(stateOf(root, "fix-pages").plan.decisions, ["A partial page counts as a page."]);
  const doc = fs.readFileSync(path.join(root, "idd", "fix-pages", "change.md"), "utf8");
  assert.match(doc, /## Plan\n\n<!-- ospec:plan:start -->\n- Files: `src\/pages\.js`, `test\/pages\.test\.js`\n<!-- ospec:plan:end -->\n/);
  assert.match(doc, /## Decisions\n\n<!-- ospec:decisions:start -->\n- A partial page counts as a page\.\n<!-- ospec:decisions:end -->\n/);
  const { green } = redGreen(root);
  assert.strictEqual(green.json.verdict, "ready", JSON.stringify(green.json.missing));
  const closed = ospec(root, "close", "--change", "fix-pages", "--json");
  assert.strictEqual(closed.code, 0, closed.stdout);
  assert.deepStrictEqual(closed.json.records.map((record) => record.summary), ["A partial page counts as a page."]);
});

test("[REQ-idd-004] a change of several units without a decision closes with empty Decisions (E4.16)", (t) => {
  const { root } = chainProject(t);
  assert.strictEqual(ospec(root, ...OPEN_PAGES, "--work-units", "2").code, 0);
  const { green } = redGreen(root);
  assert.strictEqual(green.json.verdict, "ready", JSON.stringify(green.json.missing));
  assert.strictEqual(ospec(root, "close", "--change", "fix-pages").code, 0);
});

// E4.16: every command that writes prints a status line and the next, with
// what that step needs, within a ceiling of bytes; --json leaves out null, []
// and {} and the intent of the next. The ceilings are about 1.3 times the
// sizes E4.16 measured (190, 180, 124, 872 and 830 bytes of text); v2.161.0
// printed 518, 500, 347, 2380 and 2308.
const TEXT_CEILINGS = Object.freeze({ intent: 256, signals: 256, assumption: 192, green: 1152, check: 1152 });
const JSON_CEILINGS = Object.freeze({ intent: 1600, signals: 1400, assumption: 1024, green: 4608, check: 4736 });

function emptyFields(value, at = "$") {
  if (value === null || typeof value !== "object") return [];
  if (!Array.isArray(value) && Object.keys(value).length === 0) return [at];
  return Object.entries(value).flatMap(([key, entry]) =>
    entry === null || (typeof entry === "object" && Object.keys(entry).length === 0) ? [`${at}.${key}`] : emptyFields(entry, `${at}.${key}`),
  );
}

test("[REQ-idd-011] each command that writes prints a status line and its next within a byte ceiling (E4.16)", (t) => {
  for (const json of [false, true]) {
    const { root } = chainProject(t);
    const flag = json ? ["--json"] : [];
    const runPages = () => chain(root, "run", "--change", "fix-pages", "--obligation", "repro-test", "--command", "node --test", ...flag);
    const outputs = { intent: ospec(root, ...OPEN_PAGES, ...flag) };
    outputs.signals = ospec(root, "signals", "--change", "fix-pages", "--path", "src/pages.js", ...flag);
    outputs.assumption = ospec(root, "record", "assumption", "--change", "fix-pages", "--text", "Pages count from one.", ...flag);
    fs.appendFileSync(path.join(root, "test/pages.test.js"), RED_PAGES);
    const red = runPages();
    writeFile(root, "src/pages.js", "module.exports = (items) => Math.ceil(items / 10);\n");
    outputs.green = runPages();
    outputs.check = ospec(root, "check", "--change", "fix-pages", ...flag);
    for (const [label, result] of Object.entries(outputs)) {
      assert.strictEqual(result.code, 0, `${label}: ${result.stderr}`);
      const bytes = Buffer.byteLength(result.stdout);
      assert.ok(bytes <= (json ? JSON_CEILINGS : TEXT_CEILINGS)[label], `${label}${json ? " --json" : ""}: ${bytes} bytes\n${result.stdout}`);
      if (json) {
        assert.deepStrictEqual(emptyFields(result.json), [], label);
        assert.strictEqual(result.json.next.intent, undefined, `${label}: the next leaves out the intent`);
        assert.ok(result.json.next.next_step.command, label);
      } else {
        assert.match(result.stdout, /^.+\n(?:memory query: .+\n)?(?:.+\n)*?next \(\S+\): ospec /, label);
        assert.doesNotMatch(result.stdout, /^(?:pending|refs|team|branching|changelog|release)(?: rules)?: /m, label);
      }
    }
    if (!json) {
      // A failing run prints its status, its output and the next.
      assert.match(red.stdout, /^run-1: exit 1; no evidence recorded by this run\n {2}/);
      assert.match(red.stdout, /\nnext \(repro-test\): ospec run --change fix-pages --obligation repro-test --command "node --test"\n$/);
      assert.match(outputs.check.stdout, /^ready: fix-pages can close\nran: check test exit 0\nnext \(close\): ospec close --change fix-pages\n/);
    }
  }
});
