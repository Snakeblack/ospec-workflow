"use strict";

// Private v3 boundary for the Go installer. The plan is a read-only snapshot of
// the targets, the agents of each tier and the user's model for each tier
// (E4.12); installation revalidates the request against a fresh plan and
// delegates to one installer, whose --model flags save the assignment.
const fs = require("node:fs");
const path = require("node:path");
const { PROFILES, parseModels } = require("./cli.js");
const { KNOWN_TIERS, validateSddModelPolicy } = require("../lib/model-resolver.js");
const { ASSIGNABLE_HOSTS, isModelName, readUserModels } = require("../lib/user-models.js");
const { runEngramStep } = require("./engram-setup.js");
const PROTOCOL_VERSION = 3;
const TARGET_INFO = { claude: ["Claude", "Install the Claude marketplace plugin"], vscode: ["VS Code", "Install VS Code settings and prompts"], "github-copilot": ["GitHub Copilot", "Install GitHub Copilot configuration"], opencode: ["OpenCode", "Install OpenCode configuration"], codex: ["Codex", "Install Codex configuration"], cursor: ["Cursor", "Install Cursor configuration"], antigravity: ["Antigravity", "Install Antigravity configuration"] };
// Optional packages (E1.6 d2): each becomes its installer flag. Leaving SDD out
// keeps the installer default, which keeps a previous SDD install.
const PACKAGES = [
  { id: "sdd", flag: "--with-sdd", label: "Modo SDD", description: "Fases SDD (/sdd-*), orquestador y agentes de fase. IDD no lo necesita; una instalación anterior con SDD lo conserva." },
  { id: "extras", flag: "--with-extras", label: "Extras", description: "Skills opcionales de colaboración y de nicho (issue-creation, judgment-day, caveman-compress…)." },
];

function requestError(message) { const err = new Error(`invalid install request: ${message}`); err.exitCode = 2; return err; }
function readModels(sourceDir) { const models = parseModels(fs.readFileSync(path.join(sourceDir, "models.yaml"), "utf8")); const policy = validateSddModelPolicy(models); if (!policy.valid) throw requestError(`invalid models policy: ${JSON.stringify(policy.errors)}`); return models; }
function readAgents(sourceDir) { return fs.readdirSync(path.join(sourceDir, "agents"), { withFileTypes: true }).filter(entry => entry.isFile() && entry.name.endsWith(".agent.md")).map(entry => entry.name.slice(0, -".agent.md".length)).sort(); }
function tierOf(models, agent) { return models.agents?.[agent] ?? models.agents?._default; }
// What an empty tier means: Claude's alias from models.yaml, or "" (inherit).
function fallbackOf(models, tier, target) { const value = models.tiers?.[tier]?.[target]; return typeof value === "string" ? value : ""; }
function makeTarget(id, models, agents, user) {
  const [label, installDescription] = TARGET_INFO[id] || [id, `Install ${id}`];
  const inherited = !ASSIGNABLE_HOSTS.includes(id);
  const tiers = inherited ? [] : KNOWN_TIERS.map(tier => ({ id: tier, agents: agents.filter(agent => tierOf(models, agent) === tier), value: user.models[id]?.[tier] || "", fallback: fallbackOf(models, tier, id) }));
  return { id, label, installDescription, inherited, tiers };
}
function buildPlan({ sourceDir = process.cwd(), userModelsOptions = {} } = {}) {
  const models = readModels(sourceDir), agents = readAgents(sourceDir), user = readUserModels(userModelsOptions);
  return { version: PROTOCOL_VERSION, packages: PACKAGES.map(({ id, label, description }) => ({ id, label, description })), modelsFile: user.file, warning: user.warning, targets: Object.keys(PROFILES).map(id => makeTarget(id, models, agents, user)) };
}
function validateModels(target, models) {
  if (models === undefined) return {};
  if (!models || typeof models !== "object" || Array.isArray(models)) throw requestError("models must be an object");
  if (target.inherited) {
    if (Object.keys(models).length) throw requestError(`${target.id} inherits the session model and takes no models`);
    return {};
  }
  for (const [tier, value] of Object.entries(models)) {
    if (!target.tiers.some(item => item.id === tier)) throw requestError(`unknown tier ${tier}`);
    if (typeof value !== "string" || (value.trim() && !isModelName(value.trim()))) throw requestError(`invalid model for ${tier}`);
  }
  return Object.fromEntries(Object.entries(models).map(([tier, value]) => [tier, value.trim()]));
}
function validateRequest(request, plan) {
  if (!request || typeof request !== "object" || Array.isArray(request)) throw requestError("must be an object");
  const allowed = ["version", "target", "models", "packages"];
  if (Object.keys(request).some(key => !allowed.includes(key)) || request.version !== PROTOCOL_VERSION || typeof request.target !== "string") throw requestError("has an invalid schema");
  const target = plan.targets.find(item => item.id === request.target);
  if (!target) throw requestError("unknown target");
  return { target: target.id, models: validateModels(target, request.models), packages: validatePackages(request.packages) };
}
function validatePackages(packages) { if (packages === undefined) return []; if (!Array.isArray(packages) || new Set(packages).size !== packages.length || packages.some(id => !PACKAGES.some(item => item.id === id))) throw requestError("has invalid packages"); return packages; }
function defaultMain(target) { return require({ claude: "./install-claude.js", vscode: "./install-vscode.js", "github-copilot": "./install-global-copilot.js", opencode: "./install-global-opencode.js", codex: "./install-codex.js", cursor: "./install-cursor.js", antigravity: "./install-antigravity.js" }[target]).main; }
// An empty model clears its tier: `--model <tier>=`.
function modelFlags(models) { return KNOWN_TIERS.filter(tier => Object.prototype.hasOwnProperty.call(models, tier)).flatMap(tier => ["--model", `${tier}=${models[tier]}`]); }
function installPlan(request, { sourceDir = process.cwd(), mains = {}, engramStep = runEngramStep, userModelsOptions } = {}) {
  const { target, models, packages } = validateRequest(request, buildPlan({ sourceDir, userModelsOptions }));
  const installer = mains[target] || defaultMain(target);
  const flags = [...PACKAGES.filter(item => packages.includes(item.id)).map(item => item.flag), ...modelFlags(models)];
  const result = installer(flags, { cwd: sourceDir, engramStep, ...(userModelsOptions ? { userModelsOptions } : {}) });
  if (result && typeof result.then === "function") throw requestError("installer must complete synchronously");
  if (!Number.isInteger(result) || result < 0) throw requestError("installer must return a non-negative integer exit code");
  return result;
}
function main(argv = process.argv.slice(2), deps = {}) { const stdout = deps.stdout || process.stdout, stderr = deps.stderr || process.stderr, sourceDir = deps.sourceDir || process.cwd(); if (argv.length === 1 && argv[0] === "plan") { try { stdout.write(`${JSON.stringify(buildPlan({ sourceDir, userModelsOptions: deps.userModelsOptions }))}\n`); return 0; } catch (err) { stderr.write(`${err.message}\n`); return 2; } } if (argv.length !== 1 || argv[0] !== "install") { stderr.write("usage: installer-adapter <plan|install>\n"); return 2; } try { return installPlan(JSON.parse(deps.stdin === undefined ? fs.readFileSync(0, "utf8") : String(deps.stdin)), { ...deps, sourceDir }); } catch (err) { stderr.write(`${err.message || err}\n`); return err.exitCode || 2; } }
if (require.main === module) process.exitCode = main();
module.exports = { PROTOCOL_VERSION, buildPlan, installPlan, main, validateRequest };
