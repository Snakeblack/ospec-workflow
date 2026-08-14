"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { parse, getField } = require("../lib/frontmatter.js");
const { MANIFEST_FILENAME } = require("./install-engine.js");

const REQUIRED_PATHS = [
  { rel: "agents", type: "directory" },
  { rel: "commands", type: "directory" },
  { rel: "rules", type: "directory" },
  { rel: "skills", type: "directory" },
  { rel: "scripts/hooks", type: "directory" },
  { rel: "hooks.json", type: "file" },
];

const FORBIDDEN_PATHS = [
  ".claude-plugin",
  ".codex-plugin",
  ".github",
  ".opencode",
];

const REQUIRED_HOOK_GROUPS = [
  "ospec-session-start",
  "ospec-pre-tool-use",
  "ospec-pre-compact",
  "ospec-subagent-stop",
  "ospec-stop",
];

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
}

function validateAgents(root, errors, fsImpl = fs) {
  const agentFiles = walkFiles(root, "agents", [], fsImpl).filter((f) => f.endsWith(".md") || f.endsWith(".agent.md"));
  if (agentFiles.length === 0) {
    errors.push("agents directory contains no agent files");
    return;
  }

  for (const rel of agentFiles) {
    const content = fsImpl.readFileSync(path.join(root, rel), "utf8");
    if (content.includes("vscode/askQuestions")) {
      errors.push(`${rel} contains unmapped vscode/askQuestions reference`);
    }
  }
}

function validate(root, deps = {}) {
  const fsImpl = deps.fs || fs;
  const errors = [];
  const warnings = [];

  validateRequiredPaths(root, errors, fsImpl);
  validateForbiddenPaths(root, errors, fsImpl);
  validateHooksJson(root, errors, fsImpl);
  validateAgents(root, errors, fsImpl);

  return { errors, warnings };
}

function validateInstalled(targetRoot, deps = {}) {
  const fsImpl = deps.fs || fs;
  const errors = [];
  const warnings = [];

  validateRequiredPaths(targetRoot, errors, fsImpl);
  validateForbiddenPaths(targetRoot, errors, fsImpl);
  validateHooksJson(targetRoot, errors, fsImpl);
  validateAgents(targetRoot, errors, fsImpl);

  const manifestPath = path.join(targetRoot, MANIFEST_FILENAME);
  if (!fsImpl.existsSync(manifestPath)) {
    errors.push(`missing installation manifest at ${manifestPath}`);
  } else {
    try {
      const manifest = JSON.parse(fsImpl.readFileSync(manifestPath, "utf8"));
      if (manifest.target !== "antigravity" || !Array.isArray(manifest.files)) {
        errors.push("installed manifest is invalid or has incorrect target");
      }
    } catch (error) {
      errors.push(`installed manifest is unparseable: ${error.message}`);
    }
  }

  return { errors, warnings };
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
