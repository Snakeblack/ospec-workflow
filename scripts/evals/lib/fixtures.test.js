"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  loadScenario,
  materializeFixture,
  teardown,
  markMaterialized,
  isMaterialized,
} = require("./fixtures.js");

function makeStubScenario(t, manifestOverrides = {}) {
  const scenarioDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "ospec-evals-fixture-"),
  );
  t.after(() => fs.rmSync(scenarioDir, { recursive: true, force: true }));

  const manifest = {
    id: "stub-scenario",
    group: "orchestrator-core",
    input: { command: "/sdd-continue", text: "stub" },
    capture: { gate: false, envelope: false },
    expect: { route: "sdd-spec" },
    ...manifestOverrides,
  };
  fs.writeFileSync(
    path.join(scenarioDir, "scenario.json"),
    JSON.stringify(manifest, null, 2),
  );

  const repoDir = path.join(scenarioDir, "repo");
  fs.mkdirSync(path.join(repoDir, "openspec"), { recursive: true });
  fs.writeFileSync(
    path.join(repoDir, "openspec", "config.yaml"),
    "schema: spec-driven\n",
  );
  fs.writeFileSync(path.join(repoDir, "README.md"), "stub fixture repo\n");

  return scenarioDir;
}

function makeRunsRoot(t) {
  const runsRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-evals-runs-"));
  t.after(() => fs.rmSync(runsRoot, { recursive: true, force: true }));
  return runsRoot;
}

test("loadScenario: parses a valid scenario.json manifest", (t) => {
  const scenarioDir = makeStubScenario(t);

  const manifest = loadScenario(scenarioDir);

  assert.equal(manifest.id, "stub-scenario");
  assert.equal(manifest.group, "orchestrator-core");
  assert.deepEqual(manifest.expect, { route: "sdd-spec" });
});

test("loadScenario: throws a descriptive error when scenario.json is missing", (t) => {
  const emptyDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "ospec-evals-empty-"),
  );
  t.after(() => fs.rmSync(emptyDir, { recursive: true, force: true }));

  assert.throws(
    () => loadScenario(emptyDir),
    /Scenario manifest not found/,
  );
});

test("loadScenario: throws a descriptive error when a required field is missing", (t) => {
  const scenarioDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "ospec-evals-incomplete-"),
  );
  t.after(() => fs.rmSync(scenarioDir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(scenarioDir, "scenario.json"),
    JSON.stringify({ id: "incomplete" }),
  );

  assert.throws(
    () => loadScenario(scenarioDir),
    /missing required field\(s\).*group/,
  );
});

test("materializeFixture: copies repo/ into an isolated <runsRoot>/<scenario>/ workspace", (t) => {
  const scenarioDir = makeStubScenario(t);
  const runsRoot = makeRunsRoot(t);

  const { scenarioName, workspaceRoot } = materializeFixture(
    scenarioDir,
    runsRoot,
  );

  assert.equal(scenarioName, path.basename(scenarioDir));
  assert.ok(fs.existsSync(path.join(workspaceRoot, "README.md")));
  assert.ok(fs.existsSync(path.join(workspaceRoot, "openspec", "config.yaml")));
  assert.equal(
    fs.readFileSync(path.join(workspaceRoot, "README.md"), "utf8"),
    "stub fixture repo\n",
  );
});

test("materializeFixture: repeated setup calls discard prior workspace contents", (t) => {
  const scenarioDir = makeStubScenario(t);
  const runsRoot = makeRunsRoot(t);

  const first = materializeFixture(scenarioDir, runsRoot);
  fs.writeFileSync(path.join(first.workspaceRoot, "stray.txt"), "leftover");

  const second = materializeFixture(scenarioDir, runsRoot);

  assert.equal(second.workspaceRoot, first.workspaceRoot);
  assert.ok(!fs.existsSync(path.join(second.workspaceRoot, "stray.txt")));
  assert.ok(fs.existsSync(path.join(second.workspaceRoot, "README.md")));
});

test("materializeFixture: throws a descriptive error when repo/ is missing", (t) => {
  const scenarioDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "ospec-evals-norepo-"),
  );
  t.after(() => fs.rmSync(scenarioDir, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(scenarioDir, "scenario.json"),
    JSON.stringify({
      id: "norepo",
      group: "orchestrator-core",
      input: {},
      capture: {},
      expect: {},
    }),
  );
  const runsRoot = makeRunsRoot(t);

  assert.throws(
    () => materializeFixture(scenarioDir, runsRoot),
    /missing its repo\/ seed tree/,
  );
});

test("isMaterialized: a freshly materialized workspace is NOT marked materialized yet", (t) => {
  const scenarioDir = makeStubScenario(t);
  const runsRoot = makeRunsRoot(t);

  const { workspaceRoot } = materializeFixture(scenarioDir, runsRoot);

  assert.equal(isMaterialized(workspaceRoot), false);
});

test("markMaterialized + isMaterialized: a workspace is materialized only after explicitly marked", (t) => {
  const scenarioDir = makeStubScenario(t);
  const runsRoot = makeRunsRoot(t);

  const { workspaceRoot } = materializeFixture(scenarioDir, runsRoot);
  markMaterialized(workspaceRoot);

  assert.equal(isMaterialized(workspaceRoot), true);
});

test("isMaterialized: a half-copied/corrupted workspace (dir exists, marker absent) is detected as NOT materialized", (t) => {
  const scenarioDir = makeStubScenario(t);
  const runsRoot = makeRunsRoot(t);

  // Simulate a partial materialization: the workspace directory exists (as
  // fs.existsSync would see it) but the process died before markMaterialized
  // was ever reached — e.g. disk full mid-copy, or a thrown applyGitBaseline.
  const { workspaceRoot } = materializeFixture(scenarioDir, runsRoot);
  fs.rmSync(path.join(workspaceRoot, "openspec", "config.yaml"), { force: true });

  assert.ok(fs.existsSync(workspaceRoot), "corrupted workspace dir still exists");
  assert.equal(
    isMaterialized(workspaceRoot),
    false,
    "a corrupted workspace missing the marker must never read as materialized",
  );
});

test("isMaterialized: rebuilding a corrupted workspace via materializeFixture + markMaterialized recovers it", (t) => {
  const scenarioDir = makeStubScenario(t);
  const runsRoot = makeRunsRoot(t);

  const first = materializeFixture(scenarioDir, runsRoot);
  // Corrupt it: drop the marker's own directory contents and leave a stray file.
  fs.rmSync(path.join(first.workspaceRoot, "README.md"), { force: true });
  fs.writeFileSync(path.join(first.workspaceRoot, "stray-partial.txt"), "corrupt");
  assert.equal(isMaterialized(first.workspaceRoot), false);

  // The recovery path: re-run the full setup (materialize discards stale
  // contents, then mark only once everything succeeded).
  const second = materializeFixture(scenarioDir, runsRoot);
  markMaterialized(second.workspaceRoot);

  assert.equal(isMaterialized(second.workspaceRoot), true);
  assert.ok(!fs.existsSync(path.join(second.workspaceRoot, "stray-partial.txt")));
  assert.ok(fs.existsSync(path.join(second.workspaceRoot, "README.md")));
});

test("isMaterialized: a nonexistent workspace root is safely reported as not materialized", (t) => {
  const runsRoot = makeRunsRoot(t);
  const neverCreated = path.join(runsRoot, "never-created");

  assert.equal(isMaterialized(neverCreated), false);
});

test("teardown: removes the entire runs root", (t) => {
  const scenarioDir = makeStubScenario(t);
  const runsRoot = makeRunsRoot(t);
  materializeFixture(scenarioDir, runsRoot);

  assert.ok(fs.existsSync(runsRoot));

  teardown(runsRoot);

  assert.ok(!fs.existsSync(runsRoot));
});
