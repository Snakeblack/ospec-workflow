"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { parse, getField } = require("../lib/frontmatter.js");
const { MANIFEST_FILENAME } = require("./install-engine.js");

const REQUIRED_PATHS = [
  { rel: "agents", type: "directory" },
  { rel: "rules", type: "directory" },
  { rel: "skills", type: "directory" },
  { rel: "scripts/hooks", type: "directory" },
  { rel: "hooks.json", type: "file" },
];

const FORBIDDEN_PATHS = [".claude-plugin", ".codex-plugin", ".github", ".opencode", "commands", ".mcp.json"];
const ALLOWED_TOOLS = new Set(["read_file", "write_file", "edit_file", "run_command", "invoke_subagent", "ask_question", "search_web", "manage_task"]);
const ALLOWED_MODELS = new Set(["pro", "flash", "flash_lite"]);
const REVIEW_AGENTS = new Set(["review-change", "review-correction", "review-trust", "review-runtime", "review-evolution", "review-efficiency"]);
const REVIEW_REQUIRED = [["mainAgent", "false"], ["subagent", "true"], ["inheritMcp", "false"], ["commandExecutionPolicy", "off"]];
const ALLOWED_TRIGGERS = new Set(["always_on", "glob"]);
const GLOB_PREFIX = /^(?:\*\*\/|\/|[A-Za-z]:\/)/;
const INSTALLED_PLACEHOLDERS = [["__OSPEC_", "ANTIGRAVITY_ROOT__"], ["__OSPEC_", "RUNTIME_DIR__"], ["__OSPEC_", "SHARED_DIR__"], ["{{ospec", "-cli}}"]].map((p) => p.join(""));

const REQUIRED_HOOK_GROUPS = [
  "ospec-session-start",
  "ospec-pre-tool-use",
  "ospec-stop",
];

// agy 1.4.2 wraps only its tool events in matcher groups; the rest take
// handlers directly, and one malformed handler discards the whole file.
const TOOL_HOOK_EVENTS = new Set(["PreToolUse", "PostToolUse"]);
const FLAT_HOOK_EVENTS = new Set(["SessionStart", "PreInvocation", "PostInvocation", "Stop"]);

function isHandler(entry) {
  return Boolean(entry) && typeof entry === "object" && typeof entry.command === "string";
}

function pathType(root, rel, fsImpl = fs) {
  const abs = path.join(root, rel);
  if (!fsImpl.existsSync(abs)) {
    return "missing";
  }
  const stat = fsImpl.statSync(abs);
  if (stat.isDirectory()) return "directory";
  if (stat.isFile()) return "file";
  return "other";
}

function walkFiles(root, relDir = "", acc = [], fsImpl = fs) {
  const absDir = path.join(root, relDir);
  if (!fsImpl.existsSync(absDir) || !fsImpl.statSync(absDir).isDirectory()) {
    return acc;
  }
  for (const entry of fsImpl.readdirSync(absDir, { withFileTypes: true })) {
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      walkFiles(root, rel, acc, fsImpl);
    } else if (entry.isFile()) {
      acc.push(rel);
    }
  }
  return acc;
}

function validateRequiredPaths(root, errors, fsImpl = fs) {
  for (const { rel, type } of REQUIRED_PATHS) {
    const actual = pathType(root, rel, fsImpl);
    if (actual === "missing") {
      errors.push(`missing required path: ${rel}`);
    } else if (actual !== type) {
      errors.push(`required ${type} is not a ${type}: ${rel}`);
    }
  }
}

function validateForbiddenPaths(root, errors, fsImpl = fs) {
  for (const rel of FORBIDDEN_PATHS) {
    if (fsImpl.existsSync(path.join(root, rel))) {
      errors.push(`forbidden target residue present: ${rel}`);
    }
  }
}

function validateHooksJson(root, errors, fsImpl = fs) {
  const hooksPath = path.join(root, "hooks.json");
  if (!fsImpl.existsSync(hooksPath)) return;

  let parsed;
  try {
    parsed = JSON.parse(fsImpl.readFileSync(hooksPath, "utf8"));
  } catch (error) {
    errors.push(`hooks.json is not valid JSON: ${error.message}`);
    return;
  }

  for (const group of REQUIRED_HOOK_GROUPS) {
    if (!parsed[group] || typeof parsed[group] !== "object") {
      errors.push(`hooks.json missing required hook group: ${group}`);
    }
  }
  // E1.51: the wrapper marks the host, so the launcher asks to continue with
  // decision "continue" and injects the open IDD changes through injectSteps.
  for (const [group, event] of [["ospec-stop", "Stop"], ["ospec-session-start", "SessionStart"]]) {
    const entries = Array.isArray(parsed[group]?.[event]) ? parsed[group][event] : [];
    if (entries.length === 0 || !entries.every((entry) => isHandler(entry) && entry.command.includes("scripts/hooks/ospec-antigravity-hook.js"))) {
      errors.push(`hooks.json ${group}.${event} must run scripts/hooks/ospec-antigravity-hook.js`);
    }
  }

  for (const [group, spec] of Object.entries(parsed)) {
    if (!spec || typeof spec !== "object") continue;
    for (const [event, entries] of Object.entries(spec)) {
      if (!Array.isArray(entries)) continue;
      entries.forEach((entry, index) => {
        if (TOOL_HOOK_EVENTS.has(event) && !(Array.isArray(entry?.hooks) && entry.hooks.every(isHandler))) {
          errors.push(`hooks.json ${group}.${event}[${index}] must be a matcher group with hooks`);
        } else if (FLAT_HOOK_EVENTS.has(event) && !isHandler(entry)) {
          errors.push(`hooks.json ${group}.${event}[${index}] must be a handler with a string command`);
        }
      });
    }
  }
}

function filterOwned(files, owned) {
  return owned && owned.size > 0 ? files.filter((rel) => owned.has(rel)) : files;
}

function validateAgents(root, errors, fsImpl = fs, owned = null) {
  const agentFiles = filterOwned(
    walkFiles(root, "agents", [], fsImpl).filter((f) => f.endsWith(".md") || f.endsWith(".agent.md")),
    owned,
  );
  if (agentFiles.length === 0) {
    errors.push("agents directory contains no agent files");
    return;
  }

  for (const rel of agentFiles) {
    const content = fsImpl.readFileSync(path.join(root, rel), "utf8");
    if (content.includes("vscode/askQuestions")) {
      errors.push(`${rel} contains unmapped vscode/askQuestions reference`);
    }
    const { frontmatter: fm } = parse(content);
    const name = getField(fm, "name")?.value;
    if (!name) errors.push(`${rel} missing required frontmatter field: name`);
    if (!getField(fm, "description")?.value) errors.push(`${rel} missing required frontmatter field: description`);
    const toolsField = getField(fm, "tools");
    if (toolsField) {
      if (!Array.isArray(toolsField.value)) {
        errors.push(`${rel} tools field must be a YAML list`);
      } else {
        for (const tool of toolsField.value) {
          if (!ALLOWED_TOOLS.has(tool)) errors.push(`${rel} contains unsupported Antigravity tool: ${tool}`);
        }
      }
    }
    const modelField = getField(fm, "model");
    if (modelField && !ALLOWED_MODELS.has(String(modelField.value))) {
      errors.push(`${rel} contains invalid Antigravity model tier: ${modelField.value} (allowed: pro, flash, flash_lite; inherit must be omitted)`);
    }
    if (REVIEW_AGENTS.has(name)) {
      for (const [k, v] of REVIEW_REQUIRED) {
        if (getField(fm, k)?.value !== v) errors.push(`${rel} review agent must set ${k}: ${v}`);
      }
      if (!Array.isArray(toolsField?.value) || toolsField.value.length !== 1 || toolsField.value[0] !== "read_file") {
        errors.push(`${rel} review agent must declare tools: ['read_file']`);
      }
    }
  }
}

function validateRules(root, errors, fsImpl = fs, owned = null) {
  for (const rel of filterOwned(walkFiles(root, "rules", [], fsImpl).filter((f) => f.endsWith(".md")), owned)) {
    const { frontmatter: fm } = parse(fsImpl.readFileSync(path.join(root, rel), "utf8"));
    const trigger = getField(fm, "trigger")?.value;
    if (!ALLOWED_TRIGGERS.has(trigger)) {
      errors.push(`${rel} must declare trigger: always_on or trigger: glob`);
    } else if (trigger === "glob") {
      const globs = String(getField(fm, "globs")?.value || "").split(",").map((g) => g.trim()).filter(Boolean);
      if (globs.length === 0) errors.push(`${rel} with trigger: glob must declare non-empty globs`);
      for (const glob of globs) {
        if (!GLOB_PREFIX.test(glob)) errors.push(`${rel} glob "${glob}" must be prefixed with **/ or an absolute path`);
      }
    }
  }
}

function validatePlaceholders(root, errors, fsImpl = fs, { installed = false, owned = null } = {}) {
  const mdFiles = filterOwned(["agents", "rules", "skills"].flatMap((d) => walkFiles(root, d, [], fsImpl).filter((f) => f.endsWith(".md"))), owned);
  const files = [...mdFiles, ...(fsImpl.existsSync(path.join(root, "hooks.json")) ? ["hooks.json"] : [])];
  for (const rel of files) {
    const content = fsImpl.readFileSync(path.join(root, rel), "utf8");
    if (content.includes("${input:")) errors.push(`${rel} contains unmapped VS Code \${input:...} placeholder`);
    if (installed) {
      for (const marker of INSTALLED_PLACEHOLDERS) {
        if (content.includes(marker)) errors.push(`${rel} contains unrendered placeholder: ${marker}`);
      }
    }
  }
}

function validateTree(root, errors, fsImpl, { installed = false, owned = null } = {}) {
  validateRequiredPaths(root, errors, fsImpl);
  validateForbiddenPaths(root, errors, fsImpl);
  validateHooksJson(root, errors, fsImpl);
  validateAgents(root, errors, fsImpl, owned);
  validateRules(root, errors, fsImpl, owned);
  validatePlaceholders(root, errors, fsImpl, { installed, owned });
}

function validate(root, deps = {}) {
  const errors = [];
  validateTree(root, errors, deps.fs || fs, { installed: false });
  return { errors, warnings: [] };
}

function validateInstalled(targetRoot, deps = {}) {
  const fsImpl = deps.fs || fs;
  const errors = [];
  let owned = null;
  const manifestPath = path.join(targetRoot, MANIFEST_FILENAME);
  if (!fsImpl.existsSync(manifestPath)) {
    errors.push(`missing installation manifest at ${manifestPath}`);
  } else {
    try {
      const manifest = JSON.parse(fsImpl.readFileSync(manifestPath, "utf8"));
      if (manifest.target !== "antigravity" || !Array.isArray(manifest.files)) errors.push("installed manifest is invalid or has incorrect target");
      else if (manifest.files.length > 0) owned = new Set(manifest.files.map((f) => String(f).replace(/\\/g, "/")));
    } catch (error) {
      errors.push(`installed manifest is unparseable: ${error.message}`);
    }
  }
  validateTree(targetRoot, errors, fsImpl, { installed: true, owned });
  return { errors, warnings: [] };
}

function main(argv) {
  const outDir = argv[0];
  if (!outDir) {
    process.stderr.write("usage: validate-antigravity <outDir>\n");
    return 2;
  }

  const { errors, warnings } = validate(path.resolve(outDir));
  for (const w of warnings) process.stderr.write(`[warn] ${w}\n`);
  for (const e of errors) process.stderr.write(`[error] ${e}\n`);

  if (errors.length > 0) {
    process.stderr.write(`\nvalidate-antigravity: failed with ${errors.length} error(s)\n`);
    return 1;
  }
  process.stdout.write("validate-antigravity: target output is valid\n");
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`fatal: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  validate,
  validateInstalled,
  main,
};
