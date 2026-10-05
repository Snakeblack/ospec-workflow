"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  PROFILES,
  BenchScenarioError,
  loadScenario,
  loadScenarios,
  materializeRepo,
  scenariosDigest,
} = require("./scenarios.js");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bench-scenarios-"));
}

function writeScenario(root, id, overrides = {}) {
  const dir = path.join(root, id);
  fs.mkdirSync(path.join(dir, "repo", "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "repo", "src", "a.js"), "module.exports = 1;\n");
  const scenario = {
    schema_version: 1,
    id,
    profile: overrides.profile || id,
    title: "t",
    brief: "b",
    facts: [{ id: "F1", text: "f" }],
    ...overrides.scenario,
  };
  fs.writeFileSync(path.join(dir, "scenario.json"), JSON.stringify(scenario));
  const checks = overrides.checks
    || "module.exports = [{ id: 'a', kind: 'acceptance', describe: 'd', run() {} }, { id: 'b', kind: 'fact', fact: 'F1', describe: 'd', run() {} }];";
  fs.writeFileSync(path.join(dir, "checks.js"), checks);
  return dir;
}

test("the committed corpus covers the six profiles with valid scenarios", () => {
  const scenarios = loadScenarios();
  assert.deepEqual(scenarios.map((scenario) => scenario.profile), PROFILES);
  for (const scenario of scenarios) {
    assert.ok(scenario.facts.length > 0, scenario.id);
    assert.ok(scenario.checks.some((check) => check.kind === "acceptance"), scenario.id);
    assert.ok(scenario.checks.some((check) => check.id === "suite"), scenario.id);
    for (const fact of scenario.facts) {
      assert.ok(scenario.checks.some((check) => check.fact === fact.id), `${scenario.id} ${fact.id} has no check`);
    }
  }
});

test("a scenario must declare exactly the known keys", () => {
  const root = tempDir();
  const dir = writeScenario(root, "cli-local", { scenario: { extra: true } });
  assert.throws(() => loadScenario(dir), BenchScenarioError);
});

test("a check must reference a declared fact", () => {
  const root = tempDir();
  const dir = writeScenario(root, "cli-local", {
    checks: "module.exports = [{ id: 'a', kind: 'acceptance', describe: 'd', run() {} }, { id: 'b', kind: 'fact', fact: 'F9', describe: 'd', run() {} }];",
  });
  assert.throws(() => loadScenario(dir), /unknown fact F9/);
});

test("check ids are unique and kinds are known", () => {
  const root = tempDir();
  const duplicate = writeScenario(root, "dup", {
    profile: "cli-local",
    checks: "module.exports = [{ id: 'a', kind: 'acceptance', describe: 'd', run() {} }, { id: 'a', kind: 'regression', describe: 'd', run() {} }];",
  });
  assert.throws(() => loadScenario(duplicate), /duplicate check id a/);
  const kind = writeScenario(root, "kind", {
    profile: "cli-local",
    checks: "module.exports = [{ id: 'a', kind: 'smoke', describe: 'd', run() {} }];",
  });
  assert.throws(() => loadScenario(kind), /kind/);
});

test("a corpus missing a profile is rejected", () => {
  const root = tempDir();
  writeScenario(root, "cli-local");
  assert.throws(() => loadScenarios(root), /missing profiles/);
});

test("the digest is stable across line endings and changes with content", () => {
  const root = tempDir();
  const dir = writeScenario(root, "cli-local");
  const before = scenariosDigest([loadScenario(dir)]);
  fs.writeFileSync(path.join(dir, "repo", "src", "a.js"), "module.exports = 1;\r\n");
  assert.equal(scenariosDigest([loadScenario(dir)]), before);
  fs.writeFileSync(path.join(dir, "repo", "src", "a.js"), "module.exports = 2;\n");
  assert.notEqual(scenariosDigest([loadScenario(dir)]), before);
  assert.match(before, /^[a-f0-9]{64}$/);
});

test("materializeRepo copies the seed repository only", () => {
  const root = tempDir();
  const scenario = loadScenario(writeScenario(root, "cli-local"));
  const dest = path.join(tempDir(), "ws");
  materializeRepo(scenario, dest);
  assert.equal(fs.readFileSync(path.join(dest, "src", "a.js"), "utf8"), "module.exports = 1;\n");
  assert.ok(!fs.existsSync(path.join(dest, "checks.js")));
  assert.ok(!fs.existsSync(path.join(dest, "scenario.json")));
});
