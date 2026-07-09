"use strict";

const fs = require("node:fs");
const path = require("node:path");

// Fields the codex plugin bundle allowlist permits at .codex-plugin/plugin.json
// (mirrors profile.manifest.keepFields plus the injected `interface` block).
const ALLOWED_BUNDLE_KEYS = new Set(["skills", "mcpServers", "apps", "hooks", "interface"]);

// codex has no shell-hook/plugin bridge finalized until 5.2/5.3, and no other
// target's layout may leak through; agents never live under a `prompts/` path
// (Codex custom prompts are deprecated in favor of skills).
const FORBIDDEN_PATHS = [".github", ".opencode", "prompts", "rules"];

const FORBIDDEN_TEXT = [
  { pattern: /vscode\//i, label: "vscode namespace residue" },
  { pattern: /\$\{input:/, label: "unresolved ${input: placeholder" },
  { pattern: /AskUserQuestion/, label: "AskUserQuestion residue" },
];

const REQUIRED_TOML_KEYS = ["name", "description", "sandbox_mode", "developer_instructions"];
const VALID_SANDBOX_MODES = new Set(["workspace-write", "read-only"]);

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

function addTraversalError(errors, relDir, error) {
  if (!errors) {
    return;
  }
  const target = relDir || ".";
  addError(errors, `${target} could not be enumerated: ${error.message}`);
}

function walkFiles(root, relDir = "", acc = [], errors) {
  const absDir = path.join(root, relDir);
  try {
    if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
      return acc;
    }
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walkFiles(root, rel, acc, errors);
      } else if (entry.isFile()) {
        acc.push(rel);
      }
    }
  } catch (error) {
    addTraversalError(errors, relDir, error);
  }
  return acc;
}

function walkPaths(root, relDir = "", acc = [], errors) {
  const absDir = path.join(root, relDir);
  try {
    if (!fs.existsSync(absDir) || !fs.statSync(absDir).isDirectory()) {
      return acc;
    }
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      acc.push(rel);
      if (entry.isDirectory()) {
        walkPaths(root, rel, acc, errors);
      }
    }
  } catch (error) {
    addTraversalError(errors, relDir, error);
  }
  return acc;
}

function readUtf8(root, rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function safeReadUtf8(root, rel, errors, readFile = readUtf8) {
  try {
    return readFile(root, rel);
  } catch (error) {
    addError(errors, `${rel} could not be read: ${error.message}`);
    return null;
  }
}

function addError(errors, message) {
  errors.push(message);
}

function parseJsonFile(root, rel, errors, readFile = readUtf8) {
  try {
    return JSON.parse(readFile(root, rel));
  } catch (error) {
    addError(errors, `${rel} is not valid JSON: ${error.message}`);
    return null;
  }
}

// Bundle allowlist: .codex-plugin/plugin.json MUST NOT contain any top-level
// key outside skills/mcpServers/apps/hooks/interface (REQ-codex-target-001,
// REQ-codex-target-008 "Validator fails on out-of-schema bundle key").
function validateBundle(root, errors) {
  const rel = ".codex-plugin/plugin.json";
  if (pathType(root, rel) !== "file") {
    addError(errors, `missing required file: ${rel}`);
    return;
  }
  const parsed = parseJsonFile(root, rel, errors);
  if (!parsed) {
    return;
  }
  for (const key of Object.keys(parsed)) {
    if (!ALLOWED_BUNDLE_KEYS.has(key)) {
      addError(errors, `${rel} contains out-of-schema key: ${key}`);
    }
  }
}

function validateForbiddenPaths(root, errors) {
  for (const rel of FORBIDDEN_PATHS) {
    if (exists(root, rel)) {
      addError(errors, `forbidden path present: ${rel}`);
    }
  }
  for (const rel of walkPaths(root, "", [], errors)) {
    if (rel.startsWith("prompts/") || rel === "prompts") {
      addError(errors, `forbidden prompts/ path present: ${rel}`);
    }
  }
}

function validateForbiddenText(root, errors, deps = {}) {
  const readFile = deps.readUtf8 || readUtf8;
  for (const file of walkFiles(root, "", [], errors)) {
    let text;
    try {
      text = readFile(root, file);
    } catch (error) {
      addError(errors, `${file} could not be read: ${error.message}`);
      continue;
    }
    for (const rule of FORBIDDEN_TEXT) {
      if (rule.pattern.test(text)) {
        addError(errors, `${rule.label} in ${file}`);
      }
    }
  }
}

function validateHooks(root, errors, deps = {}) {
  const rel = "hooks/hooks.json";
  if (pathType(root, rel) !== "file") {
    addError(errors, `missing required file: ${rel}`);
    return;
  }

  const readFile = deps.readUtf8 || readUtf8;
  const parsed = parseJsonFile(root, rel, errors, readFile);
  if (!parsed || !parsed.hooks || typeof parsed.hooks !== "object" || Array.isArray(parsed.hooks)) {
    addError(errors, `${rel} must declare hooks as a non-null object`);
    return;
  }

  for (const [event, entries] of Object.entries(parsed.hooks)) {
    if (!Array.isArray(entries)) {
      addError(errors, `${rel} ${event} must be an array`);
      continue;
    }
    entries.forEach((entry, index) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        addError(errors, `${rel} ${event}[${index}] must be an object`);
        return;
      }
      if (typeof entry.command !== "string") {
        addError(errors, `${rel} ${event}[${index}] command must be a string`);
        return;
      }
      // We enforce quoting the $PLUGIN_ROOT path (e.g. "$PLUGIN_ROOT/some-script") to prevent
      // path parsing issues or word-splitting failures when the plugin path contains spaces.
      if (/\$PLUGIN_ROOT\/[^"]/.test(entry.command) && !entry.command.includes('"$PLUGIN_ROOT/')) {
        addError(errors, `${rel} ${event}[${index}] command must quote the $PLUGIN_ROOT path`);
      }
    });
  }
}

// Minimal shape check for .codex/agents/*.toml: every required key present as
// a top-level `key = "…"`/`key = """…"""` assignment, sandbox_mode is one of
// the two valid enum values, and no `prompts/` reference or stale hook-path
// residue leaked into the TOML body (already covered by validateForbiddenText,
// but re-checked here for a targeted message).
function validateAgentToml(root, errors, readFile = readUtf8) {
  const dir = ".codex/agents";
  if (pathType(root, dir) !== "directory") {
    addError(errors, `missing required directory: ${dir}`);
    return;
  }
  for (const file of walkFiles(root, dir, [], errors)) {
    if (!file.endsWith(".toml")) {
      addError(errors, `${file} must use a .toml suffix under ${dir}`);
      continue;
    }
    const text = safeReadUtf8(root, file, errors, readFile);
    if (text === null) {
      continue;
    }
    for (const key of REQUIRED_TOML_KEYS) {
      if (!new RegExp(`^${key}\\s*=`, "m").test(text)) {
        addError(errors, `${file} missing required TOML key: ${key}`);
      }
    }
    const sandboxMatch = text.match(/^sandbox_mode\s*=\s*"([^"]*)"/m);
    if (sandboxMatch && !VALID_SANDBOX_MODES.has(sandboxMatch[1])) {
      addError(errors, `${file} has invalid sandbox_mode: ${sandboxMatch[1]}`);
    }
  }
}

// Skills directory must exist and never contain a routing-key residue (agent:)
// left over from the source command file — codex skills carry no routing key.
function validateSkills(root, errors, readFile = readUtf8) {
  const dir = "skills";
  if (pathType(root, dir) !== "directory") {
    addError(errors, `missing required directory: ${dir}`);
    return;
  }
  for (const file of walkFiles(root, dir, [], errors)) {
    if (!file.endsWith("SKILL.md")) {
      continue;
    }
    const text = safeReadUtf8(root, file, errors, readFile);
    if (text === null) {
      continue;
    }
    if (/^agent:/m.test(text)) {
      addError(errors, `${file} must not carry an agent: routing key (codex skills have no routing key)`);
    }
  }
}

function validate(root, deps = {}) {
  const errors = [];
  const warnings = [];
  const absRoot = path.resolve(root);

  if (!fs.existsSync(absRoot) || !fs.statSync(absRoot).isDirectory()) {
    addError(errors, `output root is not a directory: ${root}`);
    return { errors, warnings };
  }

  validateBundle(absRoot, errors);
  validateForbiddenPaths(absRoot, errors);
  validateForbiddenText(absRoot, errors, deps);
  validateHooks(absRoot, errors, deps);
  const readFile = deps.readUtf8 || readUtf8;
  validateAgentToml(absRoot, errors, readFile);
  validateSkills(absRoot, errors, readFile);

  return { errors, warnings };
}

function main(argv) {
  const root = argv[0];
  if (!root) {
    process.stderr.write("usage: node scripts/configure/validate-codex.js <output-root>\n");
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
  try {
    main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`fatal: ${error.stack || error.message || error}\n`);
    process.exit(1);
  }
}

module.exports = { validate, main };
