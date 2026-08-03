"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { parse, getField } = require("../lib/frontmatter.js");
const { hostBinarySuffix } = require("./install-target.js");

const REQUIRED_PATHS = [
  { rel: "agents", type: "directory" },
  { rel: "commands", type: "directory" },
  { rel: "rules", type: "directory" },
  { rel: "skills", type: "directory" },
  { rel: "scripts/hooks", type: "directory" },
  { rel: "hooks.json", type: "file" },
];

const ALLOWED_HOOK_EVENTS = new Set([
  "beforeSubmitPrompt",
  "beforeShellExecution",
  "beforeReadFile",
  "afterFileEdit",
  "preToolUse",
  "subagentStart",
  "preCompact",
  "stop",
]);

const REVIEW_AGENTS = new Set([
  "review-change",
  "review-correction",
  "review-risk",
  "review-readability",
  "review-reliability",
  "review-resilience",
]);

const ABSTRACT_TOOL_RE = /`(read|edit|search|execute|agent)`/g;

function exists(root, rel, fsImpl = fs) {
  return fsImpl.existsSync(path.join(root, rel));
}

function pathType(root, rel, fsImpl = fs) {
  const abs = path.join(root, rel);
  if (!fsImpl.existsSync(abs)) {
    return "missing";
  }
  const stat = fsImpl.statSync(abs);
  if (stat.isDirectory()) {
    return "directory";
  }
  if (stat.isFile()) {
    return "file";
  }
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

function readUtf8(root, rel, fsImpl = fs) {
  return fsImpl.readFileSync(path.join(root, rel), "utf8");
}

function addError(errors, message) {
  errors.push(message);
}

function validateRequiredPaths(root, errors, fsImpl = fs) {
  for (const { rel, type } of REQUIRED_PATHS) {
    let actual;
    try {
      actual = pathType(root, rel, fsImpl);
    } catch (error) {
      addError(errors, `${rel} could not be inspected: ${error.message}`);
      continue;
    }
    if (actual === "missing") {
      addError(errors, `missing required path: ${rel}`);
    } else if (actual !== type) {
      addError(errors, `required ${type} is not a ${type}: ${rel}`);
    }
  }
}

function validateAgents(root, errors, fsImpl = fs) {
  let files;
  try {
    files = walkFiles(root, "agents", [], fsImpl);
  } catch (error) {
    addError(errors, `agents could not be walked: ${error.message}`);
    return;
  }
  for (const file of files) {
    if (!file.endsWith(".md")) {
      continue;
    }
    let text;
    try {
      text = readUtf8(root, file, fsImpl);
    } catch (error) {
      addError(errors, `${file} could not be read: ${error.message}`);
      continue;
    }
    const fm = parse(text).frontmatter;
    for (const key of ["name", "description", "model"]) {
      const field = getField(fm, key);
      if (!field || !String(field.value || "").trim()) {
        addError(errors, `${file} must include ${key}`);
      }
    }
    const nameField = getField(fm, "name");
    const name = nameField ? nameField.value : path.basename(file, ".md");
    if (REVIEW_AGENTS.has(name) || name.startsWith("review-")) {
      const readonly = getField(fm, "readonly");
      if (!readonly || readonly.value !== "true") {
        addError(errors, `${file} must include readonly: true`);
      }
    }

    if (/vscode\//i.test(text)) {
      addError(errors, `vscode/ namespace residue in ${file}`);
    }
    if (/\bAskUserQuestion\b/.test(text)) {
      addError(errors, `AskUserQuestion residue in ${file}`);
    }
    ABSTRACT_TOOL_RE.lastIndex = 0;
    const abstractHits = text.match(ABSTRACT_TOOL_RE);
    if (abstractHits) {
      for (const hit of new Set(abstractHits)) {
        addError(errors, `unmapped abstract tool ${hit} in ${file}`);
      }
    }
  }
}

function validateRules(root, errors, fsImpl = fs) {
  try {
    if (!exists(root, "rules/agents-protocol.mdc", fsImpl)) {
      addError(errors, "missing required path: rules/agents-protocol.mdc");
    }
  } catch (error) {
    addError(errors, `rules/agents-protocol.mdc could not be inspected: ${error.message}`);
  }

  let files;
  try {
    files = walkFiles(root, "rules", [], fsImpl);
  } catch (error) {
    addError(errors, `rules could not be walked: ${error.message}`);
    return;
  }
  for (const file of files) {
    if (!file.endsWith(".mdc")) {
      continue;
    }
    let text;
    try {
      text = readUtf8(root, file, fsImpl);
    } catch (error) {
      addError(errors, `${file} could not be read: ${error.message}`);
      continue;
    }
    const fm = parse(text).frontmatter;
    for (const key of ["description", "globs", "alwaysApply"]) {
      const field = getField(fm, key);
      if (!field) {
        addError(errors, `${file} must include ${key}`);
      }
    }
  }
}

function validateHooks(root, errors, fsImpl = fs) {
  const rel = "hooks.json";
  let actual;
  try {
    actual = pathType(root, rel, fsImpl);
  } catch (error) {
    addError(errors, `${rel} could not be inspected: ${error.message}`);
    return;
  }
  if (actual !== "file") {
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(readUtf8(root, rel, fsImpl));
  } catch (error) {
    addError(errors, `${rel} is not valid JSON: ${error.message}`);
    return;
  }

  if (parsed.version !== 1) {
    addError(errors, `${rel} must have version: 1`);
  }
  if (!parsed.hooks || typeof parsed.hooks !== "object" || Array.isArray(parsed.hooks)) {
    addError(errors, `${rel} must have a hooks object`);
    return;
  }

  for (const [eventName, actions] of Object.entries(parsed.hooks)) {
    if (eventName === "SubagentStop" || eventName === "subagentStop") {
      addError(errors, `${rel} must not include SubagentStop`);
    }
    if (!ALLOWED_HOOK_EVENTS.has(eventName)) {
      addError(errors, `${rel} has unmapped event: ${eventName}`);
    }
    if (!Array.isArray(actions)) {
      addError(errors, `${rel} event ${eventName} must map to an array`);
      continue;
    }
    for (const [index, action] of actions.entries()) {
      const prefix = `${rel} event ${eventName}[${index}]`;
      if (!action || typeof action !== "object" || Array.isArray(action)) {
        addError(errors, `${prefix} must be an action object`);
        continue;
      }
      if (typeof action.command !== "string" || !action.command.includes("__OSPEC_CURSOR_ROOT__")) {
        addError(errors, `${prefix} command must include __OSPEC_CURSOR_ROOT__`);
      }
    }
  }
}

function validateInstalledHooks(root, errors, fsImpl = fs) {
  const rel = "hooks.json";
  let actual;
  try {
    actual = pathType(root, rel, fsImpl);
  } catch (error) {
    addError(errors, `${rel} could not be inspected: ${error.message}`);
    return;
  }
  if (actual !== "file") {
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(readUtf8(root, rel, fsImpl));
  } catch (error) {
    addError(errors, `${rel} is not valid JSON: ${error.message}`);
    return;
  }

  if (parsed.version !== 1) {
    addError(errors, `${rel} must have version: 1`);
  }
  if (!parsed.hooks || typeof parsed.hooks !== "object" || Array.isArray(parsed.hooks)) {
    addError(errors, `${rel} must have a hooks object`);
    return;
  }

  const rootPrefix = `${path.resolve(root).split(path.sep).join("/")}/scripts/hooks/`
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`");
  for (const [eventName, actions] of Object.entries(parsed.hooks)) {
    if (eventName === "SubagentStop" || eventName === "subagentStop") {
      addError(errors, `${rel} must not include SubagentStop`);
    }
    if (!ALLOWED_HOOK_EVENTS.has(eventName)) {
      addError(errors, `${rel} has unmapped event: ${eventName}`);
    }
    if (!Array.isArray(actions)) {
      addError(errors, `${rel} event ${eventName} must map to an array`);
      continue;
    }
    for (const [index, action] of actions.entries()) {
      const prefix = `${rel} event ${eventName}[${index}]`;
      if (!action || typeof action !== "object" || Array.isArray(action)) {
        addError(errors, `${prefix} must be an action object`);
        continue;
      }
      if (typeof action.command !== "string") {
        addError(errors, `${prefix} command must be a string`);
      } else if (action.command.includes("__OSPEC_CURSOR_ROOT__")) {
        addError(errors, `${prefix} contains an unresolved __OSPEC_CURSOR_ROOT__ placeholder`);
      } else if (!action.command.includes(`"${rootPrefix}`)) {
        addError(errors, `${prefix} command points outside the installed Cursor root`);
      }
    }
  }
}

function validateInstalledBinary(root, errors, deps = {}) {
  const fsImpl = deps.fs || fs;
  const platform = deps.platform || process.platform;
  const { ext } = hostBinarySuffix();
  const rel = `scripts/hooks/ospec-hooks${ext}`;
  const binaryPath = path.join(root, ...rel.split("/"));
  let stat;
  try {
    if (!fsImpl.existsSync(binaryPath)) {
      addError(errors, `required binary missing: ${rel}`);
      return;
    }
    stat = fsImpl.lstatSync(binaryPath);
  } catch (error) {
    addError(errors, `required binary could not be inspected: ${rel}: ${error.message}`);
    return;
  }
  if (!stat.isFile()) {
    addError(errors, `required binary is not a regular file: ${rel}`);
    return;
  }
  if (platform !== "win32" && (stat.mode & 0o111) === 0) {
    addError(errors, `required binary is not executable: ${rel}`);
  }
}

function validate(root, deps = {}) {
  const errors = [];
  const warnings = [];
  const absRoot = path.resolve(root);
  const fsImpl = deps.fs || fs;

  let isDirectory = false;
  try {
    isDirectory = fsImpl.existsSync(absRoot) && fsImpl.statSync(absRoot).isDirectory();
  } catch (error) {
    addError(errors, `output root could not be inspected: ${root}: ${error.message}`);
    return { errors, warnings };
  }
  if (!isDirectory) {
    addError(errors, `output root is not a directory: ${root}`);
    return { errors, warnings };
  }

  validateRequiredPaths(absRoot, errors, fsImpl);
  validateAgents(absRoot, errors, fsImpl);
  validateRules(absRoot, errors, fsImpl);
  validateHooks(absRoot, errors, fsImpl);

  return { errors, warnings };
}

function validateInstalled(root, deps = {}) {
  const errors = [];
  const warnings = [];
  const absRoot = path.resolve(root);
  const fsImpl = deps.fs || fs;

  let isDirectory = false;
  try {
    isDirectory = fsImpl.existsSync(absRoot) && fsImpl.statSync(absRoot).isDirectory();
  } catch (error) {
    addError(errors, `installed Cursor root could not be inspected: ${root}: ${error.message}`);
    return { errors, warnings };
  }
  if (!isDirectory) {
    addError(errors, `installed Cursor root is not a directory: ${root}`);
    return { errors, warnings };
  }

  validateRequiredPaths(absRoot, errors, fsImpl);
  validateAgents(absRoot, errors, fsImpl);
  validateRules(absRoot, errors, fsImpl);
  validateInstalledHooks(absRoot, errors, fsImpl);
  validateInstalledBinary(absRoot, errors, deps);
  return { errors, warnings };
}

function main(argv) {
  const root = argv[0];
  if (!root) {
    process.stderr.write("usage: node scripts/configure/validate-cursor.js <output-root>\n");
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

module.exports = { validate, validateInstalled, main };
