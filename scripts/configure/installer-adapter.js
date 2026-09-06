"use strict";

// Private boundary for the Go installer: plans are pure snapshots and install
// revalidates opaque choice ids before delegating to the existing installer.
const fs = require("node:fs");
const path = require("node:path");
const { PROFILES, parseModels, runConfigure: configure } = require("./cli.js");

const SELECTABLE_TARGETS = new Set(["claude", "vscode", "opencode", "codex", "cursor"]);
const ALLOW_CUSTOM_TARGETS = new Set(["claude", "cursor", "codex", "opencode"]);
const TARGET_INFO = {
  claude: ["Claude", "Install the Claude marketplace plugin"],
  vscode: ["VS Code", "Install VS Code settings and prompts"],
  "github-copilot": ["GitHub Copilot", "Install GitHub Copilot configuration"],
  opencode: ["OpenCode", "Install OpenCode configuration"],
  codex: ["Codex", "Install Codex configuration"],
  cursor: ["Cursor", "Install Cursor configuration"],
  antigravity: ["Antigravity", "Install Antigravity configuration"],
};

// Presentation only. Adapted from the legacy TUI catalog:
// internal/tui/views/models/picker.go#MasterModelCatalog; keys are existing
// models.yaml values or aliases, never a selectable catalog.
const FRIENDLY_MODEL_LABELS = Object.freeze({
  fable: "Claude Fable (Claude Code alias)",
  opus: "Claude Opus (Claude Code alias)",
  sonnet: "Claude Sonnet (Claude Code alias)",
  haiku: "Claude Haiku (Claude Code alias)",
  "claude-fable-5-1": "Claude Fable 5.1",
  "claude-opus-5": "Claude Opus 5",
  "claude-sonnet-5": "Claude Sonnet 5",
  "claude-haiku-4-5": "Claude Haiku 4.5",
  "claude-opus-4-8": "Claude Opus 4.8",
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "gpt-6-astra": "GPT-6 Astra",
  "gpt-5.6-sol": "GPT-5.6 Sol",
  "gpt-5.6-terra": "GPT-5.6 Terra",
  "gpt-5.6-luna": "GPT-5.6 Luna",
  "gpt-5.3-codex": "GPT-5.3 Codex",
  "o4-mini": "o4-mini",
  o3: "o3",
  "GPT-6 Astra (copilot)": "GPT-6 Astra (Copilot)",
  "GPT-5.6 Sol (copilot)": "GPT-5.6 Sol (Copilot)",
  "GPT-5.6 Terra (copilot)": "GPT-5.6 Terra (Copilot)",
  "GPT-5.6 Luna (copilot)": "GPT-5.6 Luna (Copilot)",
  "Claude Fable 5 (copilot)": "Claude Fable 5 (Copilot)",
  "Claude Opus 5 (copilot)": "Claude Opus 5 (Copilot)",
  "Claude Sonnet 5 (copilot)": "Claude Sonnet 5 (Copilot)",
  "Gemini 3.8 Flash (copilot)": "Gemini 3.8 Flash (Copilot)",
  "grok-4.6[fast=false]": "Grok 4.6 (Cursor)",
  "grok-4.6[fast=true]": "Grok 4.6 Fast (Cursor)",
  "grok-4.5": "Grok 4.5 (Cursor)",
  "composer-2.5[fast=false]": "Composer 2.5 (Cursor)",
  "composer-2.5[fast=true]": "Composer 2.5 Fast (Cursor)",
  "gemini-3.8-flash": "Gemini 3.8 Flash",
  "gemini-3.1-pro": "Gemini 3.1 Pro",
  "zai-coding-plan/glm-5.3": "GLM-5.3 (Zhipu AI)",
  "zai-coding-plan/glm-5.3-flash": "GLM-5.3 Flash (Zhipu AI)",
  "zai-coding-plan/glm-5.2": "GLM-5.2 (Zhipu AI)",
  "zai-coding-plan/glm-5.1": "GLM-5.1 (Zhipu AI)",
  "anthropic/claude-fable-5-1": "Claude Fable 5.1 (OpenCode)",
  "anthropic/claude-opus-5": "Claude Opus 5 (OpenCode)",
  "anthropic/claude-sonnet-5": "Claude Sonnet 5 (OpenCode)",
  "anthropic/claude-haiku-4-5": "Claude Haiku 4.5 (OpenCode)",
  "openai/gpt-6-astra": "GPT-6 Astra (OpenCode)",
  "openai/gpt-5.6-sol": "GPT-5.6 Sol (OpenCode)",
  "openai/gpt-5.6-terra": "GPT-5.6 Terra (OpenCode)",
  "openai/gpt-5.6-luna": "GPT-5.6 Luna (OpenCode)",
});

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
  const catalogEntries = models.catalog?.[target];
  if (Array.isArray(catalogEntries)) {
    for (const item of catalogEntries) {
      if (!isValue(item)) continue;
      if (target === "vscode") {
        values.push(Array.isArray(item) ? item : [item]);
      } else {
        values.push(item);
      }
    }
  } else if (catalogEntries && typeof catalogEntries === "object") {
    for (const item of Object.values(catalogEntries)) {
      if (isValue(item)) values.push(item);
    }
  }
  if (isValue(effective) && !values.some(value => equal(value, effective))) values.push(effective);
  return values.filter((value, index) => values.findIndex(other => equal(other, value)) === index);
}

function label(value) {
  if (Array.isArray(value)) return value.map(friendlyLabel).join(", ");
  if (value && typeof value === "object") {
    return [friendlyLabel(value.model), value.model_reasoning_effort, value.model_verbosity].filter(Boolean).join(" · ") || stableJson(value);
  }
  return friendlyLabel(value);
}

function friendlyLabel(value) {
  if (value === undefined || value === null) return value;
  return FRIENDLY_MODEL_LABELS[String(value)] || String(value);
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
      return {
        id,
        label,
        installDescription,
        allowCustom: ALLOW_CUSTOM_TARGETS.has(id),
        agents: agents.map(agent => makeAgent(models, id, agent)),
      };
    }),
  };
}

function requestError(message) {
  const error = new Error(`invalid install request: ${message}`);
  error.exitCode = 2;
  return error;
}

function isCustomModel(value) {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0 && value.every(item => typeof item === "string" && item.trim().length > 0);
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof value.model === "string" && value.model.trim().length > 0);
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
    let choice = item.choices.find(candidate => candidate.id === request.selections[item.id]);
    if (!choice && target.allowCustom) {
      const selectionStr = request.selections[item.id];
      if (typeof selectionStr === "string") {
        try {
          const decoded = JSON.parse(Buffer.from(selectionStr, "base64url").toString("utf8"));
          if (choiceId(decoded) === selectionStr && isCustomModel(decoded)) {
            choice = { id: selectionStr, value: decoded };
          }
        } catch {}
      }
    }
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

function invalidInstallerResult(target, reason) {
  const error = new Error(`installer ${target} ${reason}`);
  error.exitCode = 1;
  return error;
}

function installerExitCode(target, result) {
  if (result && typeof result.then === "function") throw invalidInstallerResult(target, "must complete synchronously");
  if (!Number.isInteger(result) || result < 0) throw invalidInstallerResult(target, "must return a non-negative integer exit code");
  return result;
}

function installPlan(request, { sourceDir = process.cwd(), mains = {}, runConfigure: runConfigureImpl = configure } = {}) {
  const { target, modelOverrides } = validateRequest(request, buildPlan({ sourceDir }));
  const installer = mains[target] || defaultMain(target);
  const runConfigure = options => runConfigureImpl({ ...options, sourceDir, modelOverrides });
  const result = installer([], { cwd: sourceDir, runConfigure });
  return installerExitCode(target, result);
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
