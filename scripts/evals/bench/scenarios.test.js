"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  CORPORA,
  PROFILES,
  BenchScenarioError,
  harnessDigest,
  loadCorpus,
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

function writeSessionScenario(root, id, overrides = {}) {
  const dir = path.join(root, id);
  fs.mkdirSync(path.join(dir, "repo"), { recursive: true });
  fs.writeFileSync(path.join(dir, "repo", "a.js"), "module.exports = 1;\n");
  const scenario = {
    schema_version: 2,
    id,
    profile: "two-sessions",
    title: "t",
    sessions: [{ brief: "b1", facts: [{ id: "F1", text: "f1" }] }, { brief: "b2", facts: [{ id: "F2", text: "f2" }] }],
    memory: { seeded: { title: "m", content: "said" }, contradictory: { title: "m", content: "unsaid" } },
    ...overrides.scenario,
  };
  fs.writeFileSync(path.join(dir, "scenario.json"), JSON.stringify(scenario));
  const checks = overrides.checks
    || "module.exports = [{ id: 'a', kind: 'acceptance', session: 1, describe: 'd', run() {} }, { id: 'b', kind: 'fact', fact: 'F1', session: 2, describe: 'd', run() {} }, { id: 'c', kind: 'fact', fact: 'F2', session: 2, describe: 'd', run() {} }];";
  fs.writeFileSync(path.join(dir, "checks.js"), checks);
  return dir;
}

const KNOWLEDGE_PROFILES = CORPORA.knowledge.profiles;

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

test("a scenario of an unknown schema version is rejected", () => {
  const root = tempDir();
  const dir = writeScenario(root, "cli-local", { scenario: { schema_version: 3 } });
  assert.throws(() => loadScenario(dir), /schema_version must be one of 1, 2/);
});

test("a two-session scenario loads both sessions, its memory and the session each check judges", () => {
  const scenario = loadScenario(writeSessionScenario(tempDir(), "two"), KNOWLEDGE_PROFILES);
  assert.deepEqual(scenario.sessions.map((session) => session.brief), ["b1", "b2"]);
  assert.deepEqual(scenario.facts.map((fact) => fact.id), ["F1", "F2"]);
  assert.deepEqual(scenario.memory, { seeded: { title: "m", content: "said" }, contradictory: { title: "m", content: "unsaid" } });
  assert.deepEqual(scenario.checks.map((check) => [check.id, check.session]), [["a", 1], ["b", 2], ["c", 2]]);
  assert.equal(scenario.brief, undefined);
});

test("a two-session scenario is rejected when its sessions, memory or check sessions do not hold", () => {
  const root = tempDir();
  const sessions = [{ brief: "b1", facts: [{ id: "F1", text: "f1" }] }, { brief: "b2", facts: [{ id: "F2", text: "f2" }] }];
  const cases = [
    [{ checks: "module.exports = [{ id: 'a', kind: 'acceptance', describe: 'd', run() {} }];" }, /must declare the session it judges, 1 to 2/],
    [{ checks: "module.exports = [{ id: 'a', kind: 'acceptance', session: 3, describe: 'd', run() {} }];" }, /must declare the session it judges/],
    [{ checks: "module.exports = [{ id: 'a', kind: 'fact', fact: 'F2', session: 1, describe: 'd', run() {} }];" }, /judges fact F2 before the session that discloses it/],
    [{ scenario: { sessions: sessions.slice(0, 1) } }, /sessions must be 2 entries/],
    [{ scenario: { sessions: [sessions[0], { brief: "b2", facts: [{ id: "F1", text: "again" }] }] } }, /fact ids must be unique across sessions/],
    [{ scenario: { memory: { seeded: { title: "m", content: "said" } } } }, /memory must declare seeded and contradictory/],
    [{ scenario: { memory: { seeded: { title: "m", content: "said" }, contradictory: { title: "m", content: "" } } } }, /memory must declare/],
    [{ scenario: { brief: "b" } }, /must declare exactly schema_version, id, profile, title, sessions, memory/],
  ];
  cases.forEach(([overrides, error], index) => {
    assert.throws(() => loadScenario(writeSessionScenario(root, `two-${index}`, overrides), KNOWLEDGE_PROFILES), error, String(error));
  });
});

test("a check of a one-session scenario declares no session", () => {
  const dir = writeScenario(tempDir(), "cli-local", {
    checks: "module.exports = [{ id: 'a', kind: 'acceptance', session: 1, describe: 'd', run() {} }];",
  });
  assert.throws(() => loadScenario(dir), /only a scenario with sessions gives a check its session/);
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

test("the harness digest covers the bench code but not scenarios, fixtures, records, or tests", () => {
  const root = tempDir();
  fs.mkdirSync(path.join(root, "scenarios", "x"), { recursive: true });
  fs.mkdirSync(path.join(root, "hosts"), { recursive: true });
  fs.writeFileSync(path.join(root, "driver.js"), "a\n");
  fs.writeFileSync(path.join(root, "hosts", "claude.js"), "b\n");
  const before = harnessDigest(root);
  fs.writeFileSync(path.join(root, "scenarios", "x", "checks.js"), "c\n");
  for (const corpus of ["scenarios-greenfield", "scenarios-reserved", "scenarios-knowledge"]) {
    fs.mkdirSync(path.join(root, corpus, "y", "repo", "scripts"), { recursive: true });
    fs.writeFileSync(path.join(root, corpus, "y", "checks.js"), "e\n");
    fs.writeFileSync(path.join(root, corpus, "y", "repo", "scripts", "check.js"), "f\n");
  }
  fs.writeFileSync(path.join(root, "driver.test.js"), "d\n");
  assert.equal(harnessDigest(root), before);
  fs.writeFileSync(path.join(root, "hosts", "claude.js"), "b2\n");
  assert.notEqual(harnessDigest(root), before);
  assert.match(harnessDigest(), /^[a-f0-9]{64}$/);
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

test("the six default briefs ask both arms to commit and todo-spa does not", () => {
  for (const scenario of loadCorpus()) assert.match(scenario.brief, /Deja el trabajo commiteado\.$/, scenario.id);
  for (const scenario of loadCorpus("greenfield")) assert.doesNotMatch(scenario.brief, /commiteado/, scenario.id);
});

test("the greenfield corpus is apart from the default one and does not change its digest", () => {
  const greenfield = loadCorpus("greenfield");
  assert.deepEqual(greenfield.map((scenario) => scenario.id), ["receta-spa", "todo-spa"]);
  assert.ok(greenfield.every((scenario) => scenario.profile === "greenfield"));
  for (const scenario of greenfield) {
    assert.equal(scenario.facts.length, 9, scenario.id);
    assert.ok(scenario.checks.some((check) => check.kind === "acceptance"), scenario.id);
    assert.ok(scenario.checks.some((check) => check.id === "suite"), scenario.id);
    for (const fact of scenario.facts) {
      assert.ok(scenario.checks.some((check) => check.fact === fact.id), `${scenario.id} ${fact.id}`);
    }
  }
  assert.equal(scenariosDigest(loadCorpus()), "3eed3740a0d60661b6724c7884225f575189723fb75b334d8c7377bfe93ad8b4");
  assert.equal(scenariosDigest(greenfield), "7ce1db3ed2ba5500ec3d60506e5bfac9595afb49929e731089c03a4114224a62");
  assert.deepEqual(loadCorpus().map((scenario) => scenario.id), loadScenarios().map((scenario) => scenario.id));
  assert.ok(!loadCorpus().some((scenario) => scenario.profile === "greenfield"));
  assert.throws(() => loadCorpus("nope"), /unknown corpus nope/);
});

test("the reserved corpus is frozen apart from the default one, with ids of its own (OSP-011)", () => {
  const reserved = loadCorpus("reserved");
  assert.deepEqual(reserved.map((scenario) => scenario.id), ["salas"]);
  assert.ok(reserved.every((scenario) => scenario.profile === "saas-small"));
  const defaultIds = new Set(loadCorpus().map((scenario) => scenario.id));
  assert.ok(reserved.every((scenario) => !defaultIds.has(scenario.id)), "reserved ids must differ from the default corpus");
  for (const scenario of reserved) {
    assert.match(scenario.brief, /Deja el trabajo commiteado\.$/, scenario.id);
    assert.ok(scenario.checks.some((check) => check.kind === "acceptance"), scenario.id);
    assert.ok(scenario.checks.some((check) => check.id === "suite"), scenario.id);
    for (const fact of scenario.facts) {
      assert.ok(scenario.checks.some((check) => check.fact === fact.id), `${scenario.id} ${fact.id}`);
    }
  }
  // Frozen: changing the reserved scenario changes this digest.
  assert.equal(scenariosDigest(reserved), "bba3c8d0b72e6e2a339f100784270ff138a4763f7d6c7c828d2d878e9d585ff3");
  assert.equal(scenariosDigest(loadCorpus()), "3eed3740a0d60661b6724c7884225f575189723fb75b334d8c7377bfe93ad8b4");
});

test("the knowledge corpus is frozen apart from the others, with ids of its own, and is not runnable (E4.17)", () => {
  const knowledge = loadCorpus("knowledge");
  assert.deepEqual(knowledge.map((scenario) => [scenario.id, scenario.profile]), [["reparto", "two-sessions"], ["pedidos", "architecture"], ["adjuntos", "security"]]);
  assert.equal(CORPORA.knowledge.runnable, false);
  const others = new Set(["default", "greenfield", "reserved"].flatMap((name) => loadCorpus(name).map((scenario) => scenario.id)));
  assert.ok(knowledge.every((scenario) => !others.has(scenario.id)), "knowledge ids must differ from every other corpus");
  for (const scenario of knowledge) {
    const sessions = scenario.sessions || [scenario];
    sessions.forEach((session, index) => {
      const where = `${scenario.id} session ${index + 1}`;
      const judged = scenario.checks.filter((check) => !scenario.sessions || check.session === index + 1);
      assert.match(session.brief, /Deja el trabajo commiteado\.$/, where);
      assert.ok(judged.some((check) => check.kind === "acceptance"), where);
      assert.ok(judged.some((check) => check.kind === "regression" && check.id.startsWith("suite")), where);
    });
    for (const fact of scenario.facts) {
      assert.ok(scenario.checks.some((check) => check.fact === fact.id), `${scenario.id} ${fact.id}`);
    }
  }
  const { memory } = knowledge[0];
  assert.equal(memory.seeded.title, memory.contradictory.title);
  assert.notEqual(memory.seeded.content, memory.contradictory.content);
  // Frozen: changing a knowledge scenario changes this digest; the other corpora keep theirs.
  assert.equal(scenariosDigest(knowledge), "e76b7dd75ec3b8a9668f1b8e5082743430fb58b7c480fc7054ffb94c7ea74af0");
  assert.equal(scenariosDigest(loadCorpus()), "3eed3740a0d60661b6724c7884225f575189723fb75b334d8c7377bfe93ad8b4");
  assert.equal(scenariosDigest(loadCorpus("greenfield")), "7ce1db3ed2ba5500ec3d60506e5bfac9595afb49929e731089c03a4114224a62");
  assert.equal(scenariosDigest(loadCorpus("reserved")), "bba3c8d0b72e6e2a339f100784270ff138a4763f7d6c7c828d2d878e9d585ff3");
});
