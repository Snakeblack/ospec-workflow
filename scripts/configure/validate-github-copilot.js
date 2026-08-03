"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { TextDecoder } = require("node:util");

const { parse, getField } = require("../lib/frontmatter.js");

const REQUIRED_PATHS = [
  { rel: ".github/agents", type: "directory" },
  { rel: ".github/prompts", type: "directory" },
  { rel: ".github/instructions", type: "directory" },
  { rel: ".github/hooks/hooks.json", type: "file" },
  { rel: ".mcp.json", type: "file" },
  { rel: "scripts/hooks", type: "directory" },
  { rel: "scripts/lib", type: "directory" },
  // Skills ship as readable files: every phase agent's "Skills to load before work"
  // section reads skills/<phase>/SKILL.md, so the tree must be present.
  { rel: "skills", type: "directory" },
];

const FORBIDDEN_PATHS = [".claude-plugin", "rules", "hooks/hooks.json"];

const FORBIDDEN_TEXT = [
  { pattern: /vscode\//i, label: "vscode namespace residue" },
  { pattern: /\$\{PLUGIN_ROOT\}/, label: "literal ${PLUGIN_ROOT}" },
  { pattern: /\$\{CLAUDE_PLUGIN_ROOT\}/, label: "literal ${CLAUDE_PLUGIN_ROOT}" },
  { pattern: /\b[A-Za-z]:\\/, label: "absolute Windows path residue" },
  { pattern: /\/Users\//, label: "absolute macOS user path residue" },
];

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

function walkPaths(root, relDir = "", acc = [], fsImpl = fs) {
  const absDir = path.join(root, relDir);
  if (!fsImpl.existsSync(absDir) || !fsImpl.statSync(absDir).isDirectory()) {
    return acc;
  }

  for (const entry of fsImpl.readdirSync(absDir, { withFileTypes: true })) {
    const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
    acc.push(rel);
    if (entry.isDirectory()) {
      walkPaths(root, rel, acc, fsImpl);
    }
  }
  return acc;
}

function readUtf8(root, rel, fsImpl = fs) {
  return fsImpl.readFileSync(path.join(root, rel), "utf8");
}

const BINARY_MAGIC = [
  Buffer.from([0x4d, 0x5a]), // PE/COFF
  Buffer.from([0x7f, 0x45, 0x4c, 0x46]), // ELF
  Buffer.from([0xfe, 0xed, 0xfa, 0xce]), // Mach-O 32-bit
  Buffer.from([0xfe, 0xed, 0xfa, 0xcf]), // Mach-O 64-bit
  Buffer.from([0xce, 0xfa, 0xed, 0xfe]), // Mach-O 32-bit, reversed
  Buffer.from([0xcf, 0xfa, 0xed, 0xfe]), // Mach-O 64-bit, reversed
  Buffer.from([0xca, 0xfe, 0xba, 0xbe]), // Mach-O universal
  Buffer.from([0xbe, 0xba, 0xfe, 0xca]), // Mach-O universal, reversed
];

function startsWith(buffer, prefix) {
  return buffer.length >= prefix.length && buffer.subarray(0, prefix.length).equals(prefix);
}

function decodeTextContent(buffer) {
  if (BINARY_MAGIC.some((magic) => startsWith(buffer, magic)) || buffer.includes(0x00)) {
    return null;
  }

  for (const byte of buffer) {
    if ((byte < 0x20 && byte !== 0x09 && byte !== 0x0a && byte !== 0x0d) || byte === 0x7f) {
      return null;
    }
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return null;
  }
}

function addError(errors, message) {
  errors.push(message);
}

function runValidation(errors, label, check) {
  try {
    check();
  } catch (error) {
    addError(errors, `unable to validate ${label}: ${error.message}`);
  }
}

function validateRequiredPaths(root, errors, fsImpl) {
  for (const { rel, type } of REQUIRED_PATHS) {
    const actual = pathType(root, rel, fsImpl);
    if (actual === "missing") {
      addError(errors, `missing required path: ${rel}`);
    } else if (actual !== type) {
      addError(errors, `required ${type} is not a ${type}: ${rel}`);
    }
  }
}

function validateForbiddenPaths(root, errors, fsImpl) {
  for (const rel of FORBIDDEN_PATHS) {
    if (exists(root, rel, fsImpl)) {
      addError(errors, `forbidden path present: ${rel}`);
    }
  }

  for (const rel of walkPaths(root, "", [], fsImpl)) {
    if (rel.toLowerCase().includes("vscode")) {
      addError(errors, `vscode path residue: ${rel}`);
    }
  }
}

function validateForbiddenText(root, errors, fsImpl) {
  for (const file of walkFiles(root, "", [], fsImpl)) {
    let content;
    try {
      content = fsImpl.readFileSync(path.join(root, file));
    } catch (error) {
      addError(errors, `unable to inspect forbidden text in ${file}: ${error.message}`);
      continue;
    }

    const text = decodeTextContent(Buffer.isBuffer(content) ? content : Buffer.from(content));
    if (text === null) {
      continue;
    }

    for (const rule of FORBIDDEN_TEXT) {
      if (rule.pattern.test(text)) {
        addError(errors, `${rule.label} in ${file}`);
      }
    }
  }
}

function listMarkdown(root, relDir, suffix, fsImpl) {
  return walkFiles(root, relDir, [], fsImpl).filter((file) => file.endsWith(suffix));
}

function validateMarkdown(root, errors, fsImpl) {
  for (const file of walkFiles(root, ".github/agents", [], fsImpl)) {
    if (file.endsWith(".md") && !file.endsWith(".agent.md")) {
      addError(errors, `${file} must use .agent.md suffix`);
    }
  }

  for (const file of listMarkdown(root, ".github/agents", ".agent.md", fsImpl)) {
    const fm = parse(readUtf8(root, file, fsImpl)).frontmatter;
    const target = getField(fm, "target");
    if (!target || target.value !== "github-copilot") {
      addError(errors, `${file} must include target: github-copilot`);
    }
  }

  for (const file of walkFiles(root, ".github/prompts", [], fsImpl)) {
    if (file.endsWith(".md") && !file.endsWith(".prompt.md")) {
      addError(errors, `${file} must use .prompt.md suffix`);
    }
  }

  for (const file of listMarkdown(root, ".github/prompts", ".prompt.md", fsImpl)) {
    const fm = parse(readUtf8(root, file, fsImpl)).frontmatter;
    if (getField(fm, "target")) {
      addError(errors, `${file} must not include target frontmatter`);
    }
  }

  for (const file of walkFiles(root, ".github/instructions", [], fsImpl)) {
    if (file.endsWith(".md") && !file.endsWith(".instructions.md")) {
      addError(errors, `${file} must use .instructions.md suffix`);
    }
  }

  for (const file of listMarkdown(root, ".github/instructions", ".instructions.md", fsImpl)) {
    const fm = parse(readUtf8(root, file, fsImpl)).frontmatter;
    const applyTo = getField(fm, "applyTo");
    if (!applyTo || applyTo.value !== "**") {
      addError(errors, `${file} must include applyTo: "**"`);
    }
  }
}

function validateHooks(root, errors, fsImpl) {
  const rel = ".github/hooks/hooks.json";
  if (pathType(root, rel, fsImpl) !== "file") {
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
      if (typeof action.type !== "string" || action.type.length === 0) {
        addError(errors, `${prefix} must include type`);
      }
      if (typeof action.bash !== "string" && typeof action.powershell !== "string") {
        addError(errors, `${prefix} must include bash or powershell`);
      }
      if ("timeoutSec" in action && typeof action.timeoutSec !== "number") {
        addError(errors, `${prefix} timeoutSec must be a number`);
      }
    }
  }
}

// Each phase agent's "Skills to load before work" section names skills/<...>.md
// files it will read. If the generator drops one, the reference dangles, so every
// referenced skill must ship in the output.
function validateSkillReferences(root, errors, fsImpl) {
  const refRe = /`(skills\/[^`]+\.md)`/g;
  for (const file of listMarkdown(root, ".github/agents", ".agent.md", fsImpl)) {
    const text = readUtf8(root, file, fsImpl);
    for (const match of text.matchAll(refRe)) {
      if (!exists(root, match[1], fsImpl)) {
        addError(errors, `${file} references missing skill: ${match[1]}`);
      }
    }
  }
}

// Copilot hook commands invoke repo-relative node scripts (the ${CLAUDE_PLUGIN_ROOT}
// prefix is stripped at generation). Every referenced script must be present, or
// the hook fails at runtime.
function validateHookScripts(root, errors, fsImpl) {
  const rel = ".github/hooks/hooks.json";
  if (pathType(root, rel, fsImpl) !== "file") {
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(readUtf8(root, rel, fsImpl));
  } catch {
    return; // JSON shape already reported by validateHooks
  }

  const scriptRe = /(scripts\/[^\s"']+\.js)/g;
  for (const actions of Object.values(parsed.hooks || {})) {
    if (!Array.isArray(actions)) {
      continue;
    }
    for (const action of actions) {
      for (const command of [action && action.bash, action && action.powershell]) {
        if (typeof command !== "string") {
          continue;
        }
        for (const match of command.matchAll(scriptRe)) {
          if (!exists(root, match[1], fsImpl)) {
            addError(errors, `${rel} references missing script: ${match[1]}`);
          }
        }
      }
    }
  }
}

// Scan .mcp.json for unresolved ${input:NAME} placeholders. These residuals
// indicate the profile forgot to opt in to mcpPlaceholders normalization.
// Mirrors the FORBIDDEN_TEXT walk but scoped to a single file.
function validateMcpResidualPlaceholders(root, errors, fsImpl) {
  const rel = ".mcp.json";
  if (pathType(root, rel, fsImpl) !== "file") {
    return;
  }
  let text;
  try {
    text = readUtf8(root, rel, fsImpl);
  } catch (error) {
    addError(errors, `unable to inspect residual placeholders in ${rel}: ${error.message}`);
    return;
  }
  if (/\$\{input:/.test(text)) {
    addError(errors, `residual \${input: placeholder found in ${rel} — profile must opt in to mcpPlaceholders normalization`);
  }
}

// .mcp.json passes through unchanged; confirm it is a usable Copilot MCP config:
// an mcpServers object whose entries each define a command (stdio) or url (http/sse).
function validateMcp(root, errors, fsImpl) {
  const rel = ".mcp.json";
  if (pathType(root, rel, fsImpl) !== "file") {
    return;
  }
  let parsed;
  try {
    parsed = JSON.parse(readUtf8(root, rel, fsImpl));
  } catch (error) {
    addError(errors, `${rel} is not valid JSON: ${error.message}`);
    return;
  }

  const servers = parsed.mcpServers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    addError(errors, `${rel} must have an mcpServers object`);
    return;
  }

  for (const [name, server] of Object.entries(servers)) {
    if (!server || typeof server !== "object" || Array.isArray(server)) {
      addError(errors, `${rel} server ${name} must be an object`);
      continue;
    }
    const hasCommand = typeof server.command === "string" && server.command.length > 0;
    const hasUrl = typeof server.url === "string" && server.url.length > 0;
    if (!hasCommand && !hasUrl) {
      addError(errors, `${rel} server ${name} must define a command (stdio) or url (http/sse)`);
    }
  }
}

function validate(root, deps = {}) {
  const errors = [];
  const warnings = [];
  const absRoot = path.resolve(root);
  let fsImpl = deps.fs || fs;
  if (!deps.fs && deps.readFileSync) {
    fsImpl = Object.create(fs);
    fsImpl.readFileSync = deps.readFileSync;
  }

  let rootIsDirectory;
  try {
    rootIsDirectory = fsImpl.existsSync(absRoot) && fsImpl.statSync(absRoot).isDirectory();
  } catch (error) {
    addError(errors, `unable to inspect output root ${root}: ${error.message}`);
    return { errors, warnings };
  }
  if (!rootIsDirectory) {
    addError(errors, `output root is not a directory: ${root}`);
    return { errors, warnings };
  }

  const checks = [
    ["required paths", () => validateRequiredPaths(absRoot, errors, fsImpl)],
    ["forbidden paths", () => validateForbiddenPaths(absRoot, errors, fsImpl)],
    ["forbidden text", () => validateForbiddenText(absRoot, errors, fsImpl)],
    ["markdown", () => validateMarkdown(absRoot, errors, fsImpl)],
    ["hooks", () => validateHooks(absRoot, errors, fsImpl)],
    ["skill references", () => validateSkillReferences(absRoot, errors, fsImpl)],
    ["hook scripts", () => validateHookScripts(absRoot, errors, fsImpl)],
    ["MCP", () => validateMcp(absRoot, errors, fsImpl)],
    ["MCP residual placeholders", () => validateMcpResidualPlaceholders(absRoot, errors, fsImpl)],
  ];
  for (const [label, check] of checks) {
    runValidation(errors, label, check);
  }

  return { errors, warnings };
}

function main(argv) {
  const root = argv[0];
  if (!root) {
    process.stderr.write("usage: node scripts/configure/validate-github-copilot.js <output-root>\n");
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
