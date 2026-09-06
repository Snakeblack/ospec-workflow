"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildPlan, installPlan, main } = require("./installer-adapter.js");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "installer-adapter-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "agents"));
  for (const agent of ["alpha", "beta"]) fs.writeFileSync(path.join(root, "agents", `${agent}.agent.md`), "---\nname: test\n---\n");
  fs.writeFileSync(path.join(root, "models.yaml"), `agents:
  alpha: premium
  beta: default
  _default: cheap
tiers:
  premium:
    claude: opus
    vscode: [VS Premium]
    opencode: open/premium
    codex:
      model: gpt-premium
      model_reasoning_effort: high
      model_verbosity: medium
    cursor: cursor-premium
  default:
    claude: sonnet
    vscode: [VS Default]
    opencode: open/default
    codex:
      model: gpt-default
      model_reasoning_effort: medium
      model_verbosity: low
    cursor: cursor-default
  cheap:
    claude: haiku
    vscode: [VS Cheap]
    opencode: open/cheap
    codex:
      model: gpt-cheap
      model_reasoning_effort: low
      model_verbosity: low
    cursor: cursor-cheap
`);
  return root;
}

function target(plan, id) { return plan.targets.find(item => item.id === id); }
function agent(planTarget, id) { return planTarget.agents.find(item => item.id === id); }

test("plan is read-only and exposes seven profiles with native model forms", t => {
  const sourceDir = fixture(t);
  const before = fs.readFileSync(path.join(sourceDir, "models.yaml"), "utf8");
  const plan = buildPlan({ sourceDir });
  assert.equal(plan.version, 1);
  assert.deepEqual(plan.targets.map(item => item.id), ["claude", "vscode", "github-copilot", "opencode", "codex", "cursor", "antigravity"]);
  assert.equal(fs.readFileSync(path.join(sourceDir, "models.yaml"), "utf8"), before);
  assert.deepEqual(agent(target(plan, "vscode"), "alpha").effective, ["VS Premium"]);
  assert.deepEqual(agent(target(plan, "codex"), "alpha").effective, { model: "gpt-premium", model_reasoning_effort: "high", model_verbosity: "medium" });
  assert.equal(agent(target(plan, "github-copilot"), "alpha").inherited, true);
  assert.equal(agent(target(plan, "antigravity"), "alpha").selectable, false);
});

test("install accepts every reviewed default once and injects only native overrides", t => {
  const sourceDir = fixture(t);
  const plan = buildPlan({ sourceDir });
  const selected = target(plan, "claude");
  const selections = Object.fromEntries(selected.agents.filter(item => item.selectable).map(item => [item.id, item.choices.find(choice => JSON.stringify(choice.value) === JSON.stringify(item.effective)).id]));
  let calls = 0;
  let received;
  const result = installPlan({ version: 1, target: "claude", selections }, {
    sourceDir,
    mains: { claude: (argv, deps) => {
      calls += 1;
      assert.deepEqual(argv, []);
      received = deps.runConfigure({ target: "claude", sourceDir, outDir: path.join(sourceDir, "out"), validate: false });
      return 7;
    } },
    runConfigure: options => options,
  });
  assert.equal(result, 7);
  assert.equal(calls, 1);
  assert.deepEqual(received.modelOverrides, { alpha: "opus", beta: "sonnet" });
});

test("each target dispatches only its own injected main, preserving Codex objects", t => {
  const sourceDir = fixture(t);
  const plan = buildPlan({ sourceDir });
  for (const current of plan.targets) {
    const selections = Object.fromEntries(current.agents.filter(item => item.selectable).map(item => [item.id, item.choices.find(choice => JSON.stringify(choice.value) === JSON.stringify(item.effective)).id]));
    const calls = [];
    let configured;
    const mains = Object.fromEntries(plan.targets.map(item => [item.id, (argv, deps) => {
      calls.push(item.id);
      configured = deps.runConfigure({ target: item.id });
      assert.deepEqual(argv, []);
      return 0;
    }]));
    assert.equal(installPlan({ version: 1, target: current.id, selections }, { sourceDir, mains, runConfigure: options => options }), 0);
    assert.deepEqual(calls, [current.id]);
    if (current.id === "codex") assert.deepEqual(configured.modelOverrides.alpha, { model: "gpt-premium", model_reasoning_effort: "high", model_verbosity: "medium" });
  }
});

test("real installer mains synchronously receive the source and override wrapper", t => {
  const sourceDir = fixture(t);
  const plan = buildPlan({ sourceDir });
  const previousCwd = process.cwd();
  process.chdir(sourceDir);
  try {
    for (const current of plan.targets) {
      const selections = Object.fromEntries(current.agents.filter(item => item.selectable).map(item => [item.id, item.choices.find(choice => JSON.stringify(choice.value) === JSON.stringify(item.effective)).id]));
      const calls = [];
      const result = installPlan({ version: 1, target: current.id, selections }, {
        sourceDir,
        runConfigure: options => { calls.push(options); return { exitCode: 23, validation: { stdout: "", stderr: "" } }; },
      });
      assert.equal(result, 23, current.id);
      assert.equal(calls.length, 1, current.id);
      assert.equal(calls[0].sourceDir, sourceDir, current.id);
      assert.equal(calls[0].target, current.id, current.id);
    }
  } finally {
    process.chdir(previousCwd);
  }
});

test("a promise or failure object from an installer cannot become success", t => {
  const sourceDir = fixture(t);
  const plan = buildPlan({ sourceDir });
  const claude = target(plan, "claude");
  const selections = Object.fromEntries(claude.agents.filter(item => item.selectable).map(item => [item.id, item.choices.find(choice => JSON.stringify(choice.value) === JSON.stringify(item.effective)).id]));
  const request = { version: 1, target: "claude", selections };
  assert.throws(() => installPlan(request, { sourceDir, mains: { claude: () => Promise.resolve(0) } }), /synchronously/i);
  assert.throws(() => installPlan(request, { sourceDir, mains: { claude: () => ({ exitCode: 19 }) } }), /integer exit code/i);
});

test("install rejects stale, inherited, unknown, and incomplete selections before dispatch", t => {
  const sourceDir = fixture(t);
  const plan = buildPlan({ sourceDir });
  const claude = target(plan, "claude");
  const valid = Object.fromEntries(claude.agents.filter(item => item.selectable).map(item => [item.id, item.choices.find(choice => JSON.stringify(choice.value) === JSON.stringify(item.effective)).id]));
  let calls = 0;
  const deps = { sourceDir, mains: { claude: () => { calls += 1; return 0; } } };
  assert.throws(() => installPlan({ version: 1, target: "claude", selections: { ...valid, alpha: "stale" } }, deps), /choice/i);
  assert.throws(() => installPlan({ version: 1, target: "claude", selections: { alpha: valid.alpha } }, deps), /missing selection/i);
  assert.throws(() => installPlan({ version: 1, target: "github-copilot", selections: { alpha: valid.alpha } }, deps), /inherited|unknown agent/i);
  assert.throws(() => installPlan({ version: 1, target: "claude", selections: { ...valid, unknown: valid.alpha } }, deps), /unknown agent/i);
  assert.equal(calls, 0);
});

test("CLI plan emits only JSON and invalid install returns status two", t => {
  const sourceDir = fixture(t);
  const stdout = []; const stderr = [];
  assert.equal(main(["plan"], { sourceDir, stdout: { write: text => stdout.push(text) }, stderr: { write: text => stderr.push(text) } }), 0);
  assert.equal(stderr.join(""), "");
  assert.deepEqual(JSON.parse(stdout.join("")), buildPlan({ sourceDir }));
  assert.equal(main(["install"], { sourceDir, stdin: "{}", stdout: { write() {} }, stderr: { write: text => stderr.push(text) } }), 2);
});
