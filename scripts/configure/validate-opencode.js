"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { parse, getField } = require("../lib/frontmatter.js");

const REQUIRED_PATHS = [
  { rel: ".opencode/agents", type: "directory" },
  { rel: ".opencode/instructions", type: "directory" },
  { rel: ".opencode/plugins/ospec.js", type: "file" },
  { rel: "opencode.json", type: "file" },
  { rel: "scripts/hooks", type: "directory" },
  { rel: "scripts/lib", type: "directory" },
  // Skills ship as readable files: every phase agent's "Skills to load before work"
  // section reads skills/<phase>/SKILL.md, so the tree must be present.
  { rel: "skills", type: "directory" },
];

// opencode reads .opencode/ + opencode.json; the Claude/Copilot layouts and the
// standalone .mcp.json (folded into opencode.json) must not leak through.
const FORBIDDEN_PATHS = [".claude-plugin", ".github", "rules", "hooks/hooks.json", ".mcp.json"];

const FORBIDDEN_TEXT = [
  { pattern: /vscode\//i, label: "vscode namespace residue" },
  { pattern: /\$\{PLUGIN_ROOT\}/, label: "literal ${PLUGIN_ROOT}" },
  { pattern: /\$\{CLAUDE_PLUGIN_ROOT\}/, label: "literal ${CLAUDE_PLUGIN_ROOT}" },
];

const VALID_MODES = new Set(["primary", "subagent", "all"]);
// Command fields opencode recognizes; anything else is VS Code/plugin residue.
const FORBIDDEN_COMMAND_KEYS = ["name", "target", "tools", "argument-hint", "user-invocable"];

function exists(root, rel) {
  return fs.existsSync(path.join(root, rel));
}

function pathType(root, rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    return "missing";
  }
  const stat = fs.statSync(abs);
  if (stat.isDirectory()) {
    return "directory";
  }
  if (stat.isFile()) {
    return "file";
  }
  return "other";
}

function walkFiles(root, relDir = "", acc = []) {
  const absDir = path.join(root, relDir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    return acc;
  }
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walkFiles(root, rel, acc);
    } else if (entry.isFile()) {
      acc.push(rel);
    }
  }
  return acc;
}

function walkPaths(root, relDir = "", acc = []) {
  const absDir = path.join(root, relDir);
  if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
    return acc;
  }
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    acc.push(rel);
    if (entry.isDirectory()) {
      walkPaths(root, rel, acc);
    }
  }
  return acc;
}

function readUtf8(root, rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function addError(errors, message) {
  errors.push(message);
}

// INSTALL-026 (FU1): the quality-review attribution behavior must ship through
// this target's runtime scripts and shared gate skill. A stale build (or an
// unmapped kernel tool reference) fails validation.
const ATTRIBUTION_SENTINELS = [
  { rel: "scripts/lib/review-dimensions.js", needles: ["kernel-contract-change", "validateAttributionOverride"] },
  { rel: "scripts/lib/review-gate-state.js", needles: ["attributionOverride", "attribution-override-invalid"] },
  { rel: "scripts/lib/review-lineage.js", needles: ["taxonomy mismatch: a schema v2 predecessor"] },
  { rel: "scripts/route-dispatch-run.js", needles: ["extractAttributionOverride"] },
  { rel: "skills/_shared/gate-4r-review.md", needles: ["attribution_override"] },
];

function validateAttributionSentinels(root, errors) {
  for (const { rel, needles } of ATTRIBUTION_SENTINELS) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      addError(errors, `attribution sentinel missing (unmapped kernel tool reference): ${rel}`);
      continue;
    }
    const content = fs.readFileSync(abs, "utf8");
    for (const needle of needles) {
      if (!content.includes(needle)) addError(errors, `attribution sentinel stale in ${rel}: missing ${needle}`);
    }
  }
}

function validateRequiredPaths(root, errors) {
  for (const { rel, type } of REQUIRED_PATHS) {
    const actual = pathType(root, rel);
    if (actual === "missing") {
      addError(errors, `missing required path: ${rel}`);
    } else if (actual !== type) {
      addError(errors, `required ${type} is not a ${type}: ${rel}`);
    }
  }
}

function validateForbiddenPaths(root, errors) {
  for (const rel of FORBIDDEN_PATHS) {
    if (exists(root, rel)) {
      addError(errors, `forbidden path present: ${rel}`);
    }
  }
  for (const rel of walkPaths(root)) {
    if (rel.toLowerCase().includes("vscode")) {
      addError(errors, `vscode path residue: ${rel}`);
    }
  }
}

function validateForbiddenText(root, errors) {
  for (const file of walkFiles(root)) {
    let text;
    try {
      text = readUtf8(root, file);
    } catch {
      continue;
    }
    for (const rule of FORBIDDEN_TEXT) {
      if (rule.pattern.test(text)) {
        addError(errors, `${rule.label} in ${file}`);
      }
    }
  }
}

function listMarkdown(root, relDir, suffix) {
  return walkFiles(root, relDir).filter((file) => file.endsWith(suffix));
}

// Agents: flat .md (no .agent.md residue), each a subagent/primary/all with no
// VS Code-only keys.
function validateAgents(root, errors) {
  for (const file of walkFiles(root, ".opencode/agents")) {
    if (!file.endsWith(".md")) {
      continue;
    }
    if (file.endsWith(".agent.md")) {
      addError(errors, `${file} must use a flat .md suffix (no .agent.md)`);
    }
    const fm = parse(readUtf8(root, file)).frontmatter;

    const mode = getField(fm, "mode");
    if (!mode || !VALID_MODES.has(mode.value)) {
      addError(errors, `${file} must declare mode: primary|subagent|all`);
    }
    for (const key of ["target", "user-invocable", "agents"]) {
      if (getField(fm, key)) {
        addError(errors, `${file} must not include ${key} frontmatter`);
      }
    }
  }
}

// Commands: flat .md, keep description/agent only — no VS Code/plugin residue.
function validateCommands(root, errors) {
  for (const file of walkFiles(root, ".opencode/commands")) {
    if (!file.endsWith(".md")) {
      continue;
    }
    if (file.endsWith(".prompt.md")) {
      addError(errors, `${file} must use a flat .md suffix (no .prompt.md)`);
    }
    const fm = parse(readUtf8(root, file)).frontmatter;
    for (const key of FORBIDDEN_COMMAND_KEYS) {
      if (getField(fm, key)) {
        addError(errors, `${file} must not include ${key} frontmatter`);
      }
    }
  }
}

// The synthesized opencode.json: valid JSON, $schema set, well-formed mcp and
// instructions if present.
function validateConfig(root, errors) {
  const rel = "opencode.json";
  if (pathType(root, rel) !== "file") {
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(readUtf8(root, rel));
  } catch (error) {
    addError(errors, `${rel} is not valid JSON: ${error.message}`);
    return;
  }

  if (typeof parsed.$schema !== "string" || !parsed.$schema) {
    addError(errors, `${rel} must include a $schema`);
  }

  if (parsed.mcp !== undefined) {
    if (!parsed.mcp || typeof parsed.mcp !== "object" || Array.isArray(parsed.mcp)) {
      addError(errors, `${rel} mcp must be an object`);
    } else {
      for (const [name, server] of Object.entries(parsed.mcp)) {
        if (!server || typeof server !== "object" || Array.isArray(server)) {
          addError(errors, `${rel} mcp server ${name} must be an object`);
          continue;
        }
        if (server.type === "local") {
          if (!Array.isArray(server.command) || server.command.length === 0) {
            addError(errors, `${rel} mcp server ${name} (local) must have a non-empty command array`);
          }
        } else if (server.type === "remote") {
          if (typeof server.url !== "string" || !server.url) {
            addError(errors, `${rel} mcp server ${name} (remote) must have a url`);
          }
        } else {
          addError(errors, `${rel} mcp server ${name} must have type local or remote`);
        }
      }
    }
  }

  if (parsed.instructions !== undefined) {
    if (!Array.isArray(parsed.instructions) || parsed.instructions.some((entry) => typeof entry !== "string")) {
      addError(errors, `${rel} instructions must be an array of strings`);
    }
  }
}

// Scan opencode.json for unresolved ${input:NAME} placeholders. These residuals
// indicate the transformMcpServers/toOpencodeVars path was bypassed or broken.
// Scoped to opencode.json only (.mcp.json is already a forbidden path in opencode output).
function validateMcpResidualPlaceholders(root, errors) {
  const rel = "opencode.json";
  if (pathType(root, rel) !== "file") {
    return;
  }
  let text;
  try {
    text = readUtf8(root, rel);
  } catch {
    return; // read failure already covered by validateRequiredPaths
  }
  if (/\$\{input:/.test(text)) {
    addError(errors, `residual \${input: placeholder found in ${rel} — toOpencodeVars transform must rewrite all VS Code input placeholders`);
  }
}

// The plugin shim bridges opencode events to the ospec-hooks Go binary via
// spawnSync. Validate that the plugin uses spawnSync, references the binary,
// and wires the required subcommands.
function validatePlugin(root, errors) {
  const rel = ".opencode/plugins/ospec.js";
  if (pathType(root, rel) !== "file") {
    return;
  }
  const text = readUtf8(root, rel);
  // Must use spawnSync to invoke the binary (not require() of hook JS files).
  if (!text.includes("spawnSync")) {
    addError(errors, `${rel} must use spawnSync to invoke the ospec-hooks binary`);
  }
  // Must reference the binary by name.
  if (!text.includes("ospec-hooks")) {
    addError(errors, `${rel} must reference the ospec-hooks binary`);
  }
  // Must wire both hooks as subcommands.
  if (!text.includes("pre-tool-use")) {
    addError(errors, `${rel} must bridge the pre-tool-use subcommand`);
  }
  if (!text.includes("session-start")) {
    addError(errors, `${rel} must bridge the session-start subcommand`);
  }
  // E1.49: the end of a turn of the root session runs the Stop hook, which
  // counts it for the gate fence: session.idle on 1.x and the end of the
  // session's execution on 2.x. Without it every answer to a gate is recorded
  // user-unverified.
  if (!text.includes('runHook("stop"') || !text.includes('"session.idle"') || !text.includes('"session.execution.succeeded"') || !text.includes("parentID")) {
    addError(errors, `${rel} must run the stop subcommand at the end of a turn of the root session (session.idle, session.execution.succeeded)`);
  }
  // session-start resolves skills/ from plugin_root; without it the binary
  // falls back to the plugin host's process cwd (the opencode server's) and
  // fails with "no SKILL.md files found in required skills root".
  if (!text.includes("plugin_root")) {
    addError(errors, `${rel} must pass plugin_root so session-start resolves the bundle skills/`);
  }
  // Both hooks must spawn the binary with cwd at the session workspace so
  // relative paths and the git collaboration guard see the right repository.
  if (!text.includes("cwd: directory")) {
    addError(errors, `${rel} must spawn the hooks with cwd at the session workspace`);
  }
  // OpenCode >= 2.0.29 exposes ctx.permission.assert: the guard's ask verdict
  // must become the host's permission prompt, not a hard block.
  if (!text.includes("permission.assert")) {
    addError(errors, `${rel} must bridge the guard's ask verdict to ctx.permission.assert`);
  }
  // The host's base policy allows every action, so the plugin escalates its own
  // action back to ask through the permission evaluate hook.
  if (!text.includes('permission.hook("evaluate"')) {
    addError(errors, `${rel} must escalate the ospec action to ask in the permission evaluate hook`);
  }
  // OpenCode v2 loads a plugin only from a default definition with an id and a
  // setup/effect function; without it the load fails with a
  // PluginModule.LoadError/SchemaError(Missing key at ["default"]) at startup.
  if (!/export\s+default\s*\{/.test(text)) {
    addError(errors, `${rel} must default-export a v2 plugin definition (id plus setup or effect)`);
  } else {
    if (!/\bid\s*:/.test(text)) {
      addError(errors, `${rel} must declare an id in the default plugin definition`);
    }
    if (!/\bserver\s*:/.test(text)) {
      addError(errors, `${rel} must keep the v1 server: entrypoint in the default plugin definition`);
    }
    if (!/\b(?:setup|effect)\s*:/.test(text)) {
      addError(errors, `${rel} must declare setup: or effect: in the default plugin definition`);
    }
  }
}

// Each phase agent's "Skills to load before work" section names skills/<...>.md
// files it reads; a dropped skill leaves a dangling reference.
function validateSkillReferences(root, errors) {
  const refRe = /`(skills\/[^`]+\.md)`/g;
  for (const file of listMarkdown(root, ".opencode/agents", ".md")) {
    const text = readUtf8(root, file);
    for (const match of text.matchAll(refRe)) {
      if (!exists(root, match[1])) {
        addError(errors, `${file} references missing skill: ${match[1]}`);
      }
    }
  }
}

function validate(root) {
  const errors = [];
  const warnings = [];
  const absRoot = path.resolve(root);

  if (!fs.existsSync(absRoot) || !fs.statSync(absRoot).isDirectory()) {
    addError(errors, `output root is not a directory: ${root}`);
    return { errors, warnings };
  }

  validateRequiredPaths(absRoot, errors);
  validateForbiddenPaths(absRoot, errors);
  validateForbiddenText(absRoot, errors);
  validateAgents(absRoot, errors);
  validateCommands(absRoot, errors);
  validateConfig(absRoot, errors);
  validateMcpResidualPlaceholders(absRoot, errors);
  validatePlugin(absRoot, errors);
  validateSkillReferences(absRoot, errors);
  validateAttributionSentinels(absRoot, errors);

  return { errors, warnings };
}

function main(argv) {
  const root = argv[0];
  if (!root) {
    process.stderr.write("usage: node scripts/configure/validate-opencode.js <output-root>\n");
    process.exitCode = 2;
    return;
  }

  const result = validate(root);
  for (const error of result.errors) {
    process.stderr.write(`error: ${error}\n`);
  }
  for (const warning of result.warnings) {
    process.stderr.write(`warning: ${warning}\n`);
  }
  process.stdout.write(`${result.errors.length} errors, ${result.warnings.length} warnings\n`);
  process.exitCode = result.errors.length > 0 ? 1 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2));
}

module.exports = { validate, main };
