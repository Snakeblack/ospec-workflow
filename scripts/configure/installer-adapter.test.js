"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildPlan, installPlan, validateRequest, PROTOCOL_VERSION } = require("./installer-adapter.js");
const { userModelsPath, writeUserModels } = require("../lib/user-models.js");

function tempDir(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function fixture(t) {
  const root = tempDir(t, "installer-v3-");
  fs.mkdirSync(path.join(root, "agents"));
  for (const name of ["alpha", "beta"]) fs.writeFileSync(path.join(root, "agents", `${name}.agent.md`), `---\nname: ${name}\n---\n`);
  const agents = ["sdd-apply", "sdd-archive", "sdd-baseline", "sdd-clarify", "sdd-design", "sdd-document", "sdd-explore", "foundation", "sdd-init", "sdd-onboard", "sdd-orchestrator", "sdd-propose", "sdd-reconcile", "sdd-spec", "sdd-tasks", "sdd-verify", "sdd-workspace", "review-change", "review-correction", "review-trust", "review-runtime", "review-evolution", "review-efficiency"];
  fs.writeFileSync(path.join(root, "models.yaml"), `agents:\n  alpha: premium\n${agents.map(name => `  ${name}: cheap\n`).join("")}  _default: default\ntiers:\n  premium:\n    claude: opus\n    codex:\n      model_reasoning_effort: high\n  default:\n    claude: sonnet\n  cheap:\n    claude: haiku\n`);
  return root;
}
function userOptions(t) {
  const dir = tempDir(t, "installer-v3-home-");
  return { homedir: () => dir, env: {}, platform: process.platform };
}
function target(plan, id) { return plan.targets.find(item => item.id === id); }

test("v3 plan lists the agents of each tier, the user's models and what an empty tier does", t => {
  const root = fixture(t), options = userOptions(t);
  writeUserModels("codex", { premium: "gpt-sol" }, options);
  const before = fs.readFileSync(path.join(root, "models.yaml"), "utf8");
  const plan = buildPlan({ sourceDir: root, userModelsOptions: options });
  assert.equal(plan.version, 3);
  assert.equal(plan.modelsFile, userModelsPath(options));
  assert.equal(plan.warning, null);
  assert.deepEqual(target(plan, "codex").tiers, [
    { id: "premium", agents: ["alpha"], value: "gpt-sol", fallback: "" },
    { id: "default", agents: ["beta"], value: "", fallback: "" },
    { id: "cheap", agents: [], value: "", fallback: "" },
  ]);
  assert.deepEqual(target(plan, "claude").tiers.map(tier => tier.fallback), ["opus", "sonnet", "haiku"]);
  assert.equal(target(plan, "antigravity").inherited, true);
  assert.deepEqual(target(plan, "antigravity").tiers, []);
  assert.equal(fs.readFileSync(path.join(root, "models.yaml"), "utf8"), before, "the plan never writes models.yaml");
});

test("a broken assignment file reaches the plan as a warning", t => {
  const root = fixture(t), options = userOptions(t);
  fs.mkdirSync(path.dirname(userModelsPath(options)), { recursive: true });
  fs.writeFileSync(userModelsPath(options), "codex:\n  ultra: x\n");
  const plan = buildPlan({ sourceDir: root, userModelsOptions: options });
  assert.match(plan.warning, /se ignora/);
  assert.ok(target(plan, "codex").tiers.every(tier => tier.value === ""));
});

test("v3 validation accepts free-text models and rejects unknown tiers, bad text and inherited models", t => {
  const root = fixture(t), plan = buildPlan({ sourceDir: root, userModelsOptions: userOptions(t) });
  const request = { version: PROTOCOL_VERSION, target: "vscode", models: { premium: " gpt-6 Sol (copilot) ", cheap: "" } };
  assert.deepEqual(validateRequest(request, plan), { target: "vscode", models: { premium: "gpt-6 Sol (copilot)", cheap: "" }, packages: [] });
  assert.throws(() => validateRequest({ ...request, models: { ultra: "x" } }, plan), /unknown tier/);
  assert.throws(() => validateRequest({ ...request, models: { premium: "a\nb" } }, plan), /invalid model/);
  assert.throws(() => validateRequest({ ...request, models: { premium: 3 } }, plan), /invalid model/);
  assert.throws(() => validateRequest({ ...request, models: ["premium"] }, plan), /object/);
  assert.throws(() => validateRequest({ version: PROTOCOL_VERSION, target: "antigravity", models: { premium: "x" } }, plan), /inherits/);
  assert.throws(() => validateRequest({ ...request, version: 2 }, plan), /schema/);
  assert.throws(() => validateRequest({ ...request, selections: {} }, plan), /schema/);
});

test("install delegates once and turns the models into --model flags, an empty one clearing its tier", t => {
  const root = fixture(t), options = userOptions(t);
  const seen = [];
  const request = { version: PROTOCOL_VERSION, target: "cursor", models: { cheap: "composer", premium: "" } };
  assert.equal(installPlan(request, { sourceDir: root, userModelsOptions: options, mains: { cursor: (argv, deps) => { seen.push([argv, deps.userModelsOptions]); return 0; } } }), 0);
  assert.deepEqual(seen, [[["--model", "premium=", "--model", "cheap=composer"], options]]);
});

// Roadmap E1.6 (d2): the plan offers the optional packages, and a request's
// packages reach the installer as its own flags.
test("the plan offers the SDD and extras packages, and the request forwards them as installer flags", t => {
  const root = fixture(t), plan = buildPlan({ sourceDir: root, userModelsOptions: userOptions(t) });
  assert.deepEqual(plan.packages.map(x => x.id), ["sdd", "extras"]);
  for (const item of plan.packages) assert.ok(item.label && item.description, item.id);
  const seen = [];
  const run = (packages) => installPlan({ version: PROTOCOL_VERSION, target: "antigravity", ...(packages ? { packages } : {}) }, { sourceDir: root, mains: { antigravity: (argv) => { seen.push(argv); return 0; } } });
  assert.equal(run(["sdd", "extras"]), 0);
  assert.equal(run(undefined), 0);
  assert.deepEqual(seen, [["--with-sdd", "--with-extras"], []], "no package keeps the installer default, which keeps a previous SDD install");
  for (const packages of [["forged"], ["sdd", "sdd"], "sdd"]) assert.throws(() => validateRequest({ version: PROTOCOL_VERSION, target: "vscode", packages }, plan), /packages/);
});
