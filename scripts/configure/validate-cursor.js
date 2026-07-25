"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { parse, getField } = require("../lib/frontmatter.js");

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

function readUtf8(root, rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function addError(errors, message) {
  errors.push(message);
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

function validateAgents(root, errors) {
  for (const file of walkFiles(root, "agents")) {
    if (!file.endsWith(".md")) {
      continue;
    }
    let text;
    try {
      text = readUtf8(root, file);
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

function validateRules(root, errors) {
  if (!exists(root, "rules/agents-protocol.mdc")) {
    addError(errors, "missing required path: rules/agents-protocol.mdc");
  }

  for (const file of walkFiles(root, "rules")) {
    if (!file.endsWith(".mdc")) {
      continue;
    }
    let text;
    try {
      text = readUtf8(root, file);
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

function validateHooks(root, errors) {
  const rel = "hooks.json";
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

function validate(root, _deps = {}) {
  const errors = [];
  const warnings = [];
  const absRoot = path.resolve(root);

  if (!fs.existsSync(absRoot) || !fs.statSync(absRoot).isDirectory()) {
    addError(errors, `output root is not a directory: ${root}`);
    return { errors, warnings };
  }

  validateRequiredPaths(absRoot, errors);
  validateAgents(absRoot, errors);
  validateRules(absRoot, errors);
  validateHooks(absRoot, errors);

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

module.exports = { validate, main };
