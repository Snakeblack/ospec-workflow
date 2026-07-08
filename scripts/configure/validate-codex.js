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

// hooks/hooks.json is intentionally excluded: 5.1 passes it through unmodified
// (the hooks bridge itself is finalized in 5.2/5.3), so its literal
// ${CLAUDE_PLUGIN_ROOT} path variable is expected, not residue.
const FORBIDDEN_TEXT_EXEMPT = new Set(["hooks/hooks.json"]);

const FORBIDDEN_TEXT = [
  { pattern: /vscode\//i, label: "vscode namespace residue" },
  { pattern: /\$\{input:/, label: "unresolved ${input: placeholder" },
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

// Bundle allowlist: .codex-plugin/plugin.json MUST NOT contain any top-level
// key outside skills/mcpServers/apps/hooks/interface (REQ-codex-target-001,
// REQ-codex-target-008 "Validator fails on out-of-schema bundle key").
function validateBundle(root, errors) {
  const rel = ".codex-plugin/plugin.json";
  if (pathType(root, rel) !== "file") {
    addError(errors, `missing required file: ${rel}`);
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(readUtf8(root, rel));
  } catch (error) {
    addError(errors, `${rel} is not valid JSON: ${error.message}`);
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
  for (const rel of walkPaths(root)) {
    if (rel.startsWith("prompts/") || rel === "prompts") {
      addError(errors, `forbidden prompts/ path present: ${rel}`);
    }
  }
}

function validateForbiddenText(root, errors) {
  for (const file of walkFiles(root)) {
    if (FORBIDDEN_TEXT_EXEMPT.has(file)) {
      continue;
    }
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

// Minimal shape check for .codex/agents/*.toml: every required key present as
// a top-level `key = "…"`/`key = """…"""` assignment, sandbox_mode is one of
// the two valid enum values, and no `prompts/` reference or CLAUDE_PLUGIN_ROOT
// residue leaked into the TOML body (already covered by validateForbiddenText,
// but re-checked here for a targeted message).
function validateAgentToml(root, errors) {
  const dir = ".codex/agents";
  if (pathType(root, dir) !== "directory") {
    addError(errors, `missing required directory: ${dir}`);
    return;
  }
  for (const file of walkFiles(root, dir)) {
    if (!file.endsWith(".toml")) {
      addError(errors, `${file} must use a .toml suffix under ${dir}`);
      continue;
    }
    const text = readUtf8(root, file);
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
function validateSkills(root, errors) {
  const dir = "skills";
  if (pathType(root, dir) !== "directory") {
    addError(errors, `missing required directory: ${dir}`);
    return;
  }
  for (const file of walkFiles(root, dir)) {
    if (!file.endsWith("SKILL.md")) {
      continue;
    }
    const text = readUtf8(root, file);
    if (/^agent:/m.test(text)) {
      addError(errors, `${file} must not carry an agent: routing key (codex skills have no routing key)`);
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

  validateBundle(absRoot, errors);
  validateForbiddenPaths(absRoot, errors);
  validateForbiddenText(absRoot, errors);
  validateAgentToml(absRoot, errors);
  validateSkills(absRoot, errors);

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
  main(process.argv.slice(2));
}

module.exports = { validate, main };
