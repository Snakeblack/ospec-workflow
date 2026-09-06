"use strict";

// Private boundary for the Go installer: plans are pure snapshots and install
// revalidates opaque choice ids before delegating to the existing installer.
const fs = require("node:fs");
const path = require("node:path");
const { PROFILES, parseModels, runConfigure: configure } = require("./cli.js");

const SELECTABLE_TARGETS = new Set(["claude", "vscode", "opencode", "codex", "cursor"]);
const TARGET_INFO = {
  claude: ["Claude", "Install the Claude marketplace plugin"],
  vscode: ["VS Code", "Install VS Code settings and prompts"],
  "github-copilot": ["GitHub Copilot", "Install GitHub Copilot configuration"],
  opencode: ["OpenCode", "Install OpenCode configuration"],
  codex: ["Codex", "Install Codex configuration"],
  cursor: ["Cursor", "Install Cursor configuration"],
  antigravity: ["Antigravity", "Install Antigravity configuration"],
};

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function clone(value) { return JSON.parse(stableJson(value)); }
function choiceId(value) { return Buffer.from(stableJson(value)).toString("base64url"); }
function equal(left, right) { return stableJson(left) === stableJson(right); }
function isValue(value) { return value !== undefined && value !== null && value !== "inherit"; }

function readAgents(sourceDir) {
  const dir = path.join(sourceDir, "agents");
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith(".agent.md"))
    .map(entry => entry.name.slice(0, -".agent.md".length))
    .sort();
}

function readModels(sourceDir) {
  return parseModels(fs.readFileSync(path.join(sourceDir, "models.yaml"), "utf8"));
}

function agentValue(models, agentId, target) {
  const tier = models.agents?.[agentId] ?? models.agents?._default;
  return models.tiers?.[tier]?.[target];
}

function valuesForTarget(models, target, effective) {
  const values = [];
  for (const tier of Object.values(models.tiers || {})) {
    const candidate = tier && tier[target];
    if (!isValue(candidate)) continue;
    if (Array.isArray(candidate)) {
      for (const item of candidate) values.push([item]);
    } else values.push(candidate);
  }
  if (isValue(effective) && !values.some(value => equal(value, effective))) values.push(effective);
  return values.filter((value, index) => values.findIndex(other => equal(other, value)) === index);
}

function label(value) {
  if (Array.isArray(value)) return value.join(", ");
  if (value && typeof value === "object") {
    return [value.model, value.model_reasoning_effort, value.model_verbosity].filter(Boolean).join(" · ") || stableJson(value);
  }
  return String(value);
}

function makeAgent(models, target, id) {
  const effective = agentValue(models, id, target);
  const selectable = SELECTABLE_TARGETS.has(target) && isValue(effective);
  const choices = selectable ? valuesForTarget(models, target, effective).map(value => ({ id: choiceId(value), label: label(value), value: clone(value) })) : [];
  return { id, selectable, inherited: !selectable, effective: selectable ? clone(effective) : null, choices };
}

function buildPlan({ sourceDir = process.cwd() } = {}) {
  const models = readModels(sourceDir);
  const agents = readAgents(sourceDir);
  return {
    version: 1,
    targets: Object.keys(PROFILES).map(id => {
      const [label, installDescription] = TARGET_INFO[id] || [id, `Install ${id}`];
      return { id, label, installDescription, agents: agents.map(agent => makeAgent(models, id, agent)) };
    }),
  };
}

function requestError(message) {
  const error = new Error(`invalid install request: ${message}`);
  error.exitCode = 2;
  return error;
}

function validateRequest(request, plan) {
  if (!request || typeof request !== "object" || Array.isArray(request)) throw requestError("must be an object");
  if (Object.keys(request).length !== 3 || !Object.hasOwn(request, "version") || !Object.hasOwn(request, "target") || !Object.hasOwn(request, "selections")) throw requestError("must contain version, target, and selections only");
  if (request.version !== 1 || typeof request.target !== "string" || !request.selections || typeof request.selections !== "object" || Array.isArray(request.selections)) throw requestError("has an invalid schema");
  const target = plan.targets.find(item => item.id === request.target);
  if (!target) throw requestError("unknown target");
  const expected = target.agents.filter(item => item.selectable);
  const supplied = Object.keys(request.selections).sort();
  const required = expected.map(item => item.id).sort();
  if (supplied.some(id => !required.includes(id))) throw requestError("unknown agent or inherited selection");
  if (supplied.length !== required.length || supplied.some((id, index) => id !== required[index])) throw requestError("missing selection");
  const modelOverrides = {};
  for (const item of expected) {
    const choice = item.choices.find(candidate => candidate.id === request.selections[item.id]);
    if (!choice) throw requestError(`unknown choice for ${item.id}`);
    modelOverrides[item.id] = clone(choice.value);
  }
  return { target: target.id, modelOverrides };
}

function defaultMain(target) {
  const modules = {
    claude: "./install-claude.js", vscode: "./install-vscode.js", "github-copilot": "./install-global-copilot.js",
    opencode: "./install-global-opencode.js", codex: "./install-codex.js", cursor: "./install-cursor.js", antigravity: "./install-antigravity.js",
  };
  return require(modules[target]).main;
}

function installPlan(request, { sourceDir = process.cwd(), mains = {}, runConfigure: runConfigureImpl = configure } = {}) {
  const { target, modelOverrides } = validateRequest(request, buildPlan({ sourceDir }));
  const installer = mains[target] || defaultMain(target);
  const runConfigure = options => runConfigureImpl({ ...options, sourceDir, modelOverrides });
  const result = installer([], { cwd: sourceDir, runConfigure });
  return Number.isInteger(result) ? result : 0;
}

function readStdin(deps) {
  return deps.stdin === undefined ? fs.readFileSync(0, "utf8") : String(deps.stdin);
}

function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout || process.stdout;
  const stderr = deps.stderr || process.stderr;
  const sourceDir = deps.sourceDir || process.cwd();
  if (argv.length === 1 && argv[0] === "plan") {
    try { stdout.write(`${JSON.stringify(buildPlan({ sourceDir }))}\n`); return 0; } catch (error) { stderr.write(`${error.message}\n`); return 2; }
  }
  if (argv.length !== 1 || argv[0] !== "install") {
    stderr.write("usage: installer-adapter <plan|install>\n");
    return 2;
  }
  try { return installPlan(JSON.parse(readStdin(deps)), { ...deps, sourceDir }); } catch (error) { stderr.write(`${error.message || error}\n`); return error.exitCode || 2; }
}

if (require.main === module) process.exitCode = main();

module.exports = { buildPlan, installPlan, main, stableJson, validateRequest };
