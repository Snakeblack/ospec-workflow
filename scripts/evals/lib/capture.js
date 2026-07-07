"use strict";

const fs = require("node:fs");
const path = require("node:path");

const IGNORED_DIR_NAMES = new Set([".git", "node_modules"]);

// ─── Generic YAML-lite parser ────────────────────────────────────────────────
//
// state.yaml's shape varies per scenario (top-level scalars, nested `phases:`
// maps, `route:` maps, `blocking_questions:`/`assumptions:` lists of scalars
// or maps). Rather than cherry-pick a fixed set of fields (as the surgical,
// write-path helpers in scripts/lib/ospec-state.js and
// scripts/hooks/pre-compact.js do), captureWorkspace needs the FULL structure
// so assertions.js can compare arbitrary dotted paths from a scenario's
// `expect.state`. This parser supports the 2-space-indented subset of YAML
// this project's own tooling emits: nested maps, lists of scalars, and lists
// of maps (`- key: value` followed by sibling `key: value` continuation
// lines at indent+2) — it is not a general-purpose YAML parser.

function parseScalarValue(raw) {
  const trimmed = raw.trim();

  if (trimmed === "") {
    return "";
  }

  const quoted = trimmed.match(/^(["'])([\s\S]*)\1$/);

  if (quoted) {
    return quoted[2];
  }

  const stripped = trimmed.replace(/\s+#.*$/, "").trim();

  if (stripped === "null" || stripped === "~") {
    return null;
  }
  if (stripped === "true") {
    return true;
  }
  if (stripped === "false") {
    return false;
  }
  if (stripped === "[]") {
    return [];
  }
  if (stripped === "{}") {
    return {};
  }
  if (/^-?\d+(\.\d+)?$/.test(stripped)) {
    return Number(stripped);
  }

  return stripped;
}

function toLines(content) {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith("#"))
    .map((line) => ({
      indent: line.match(/^\s*/)[0].length,
      text: line.trim(),
    }));
}

function parseYamlLite(content) {
  const lines = toLines(content);
  let cursor = 0;

  function parseBlock(indent) {
    if (
      cursor < lines.length &&
      lines[cursor].indent === indent &&
      lines[cursor].text.startsWith("- ")
    ) {
      return parseList(indent);
    }

    return parseMap(indent);
  }

  function parseMapItemFields(startIndent) {
    const fields = {};

    while (cursor < lines.length && lines[cursor].indent === startIndent) {
      const match = lines[cursor].text.match(/^([^:]+):\s*(.*)$/);

      if (!match) {
        break;
      }

      const key = match[1].trim();
      const rawValue = match[2];
      cursor += 1;

      if (rawValue.trim() === "") {
        fields[key] =
          cursor < lines.length && lines[cursor].indent > startIndent
            ? parseBlock(lines[cursor].indent)
            : null;
      } else {
        fields[key] = parseScalarValue(rawValue);
      }
    }

    return fields;
  }

  function parseList(indent) {
    const result = [];

    while (
      cursor < lines.length &&
      lines[cursor].indent === indent &&
      lines[cursor].text.startsWith("- ")
    ) {
      const itemText = lines[cursor].text.slice(2).trim();
      cursor += 1;

      const kv = itemText.match(/^([^:]+):\s*(.*)$/);

      if (!kv) {
        result.push(parseScalarValue(itemText));
        continue;
      }

      const key = kv[1].trim();
      const rawValue = kv[2];
      const item = {};

      if (rawValue.trim() === "") {
        item[key] =
          cursor < lines.length && lines[cursor].indent > indent
            ? parseBlock(lines[cursor].indent)
            : null;
      } else {
        item[key] = parseScalarValue(rawValue);
      }

      Object.assign(item, parseMapItemFields(indent + 2));
      result.push(item);
    }

    return result;
  }

  function parseMap(indent) {
    const result = {};

    while (cursor < lines.length && lines[cursor].indent === indent) {
      const match = lines[cursor].text.match(/^([^:]+):\s*(.*)$/);

      if (!match) {
        cursor += 1;
        continue;
      }

      const key = match[1].trim();
      const rawValue = match[2];
      cursor += 1;

      if (rawValue.trim() === "") {
        result[key] =
          cursor < lines.length && lines[cursor].indent > indent
            ? parseBlock(lines[cursor].indent)
            : null;
      } else {
        result[key] = parseScalarValue(rawValue);
      }
    }

    return result;
  }

  return parseMap(0);
}

// ─── Workspace capture ───────────────────────────────────────────────────────

function walk(root, current, out) {
  let entries;

  try {
    entries = fs.readdirSync(current, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }

    throw error;
  }

  for (const entry of entries) {
    if (IGNORED_DIR_NAMES.has(entry.name)) {
      continue;
    }

    const absolutePath = path.join(current, entry.name);

    if (entry.isDirectory()) {
      walk(root, absolutePath, out);
    } else if (entry.isFile()) {
      out.push(path.relative(root, absolutePath).split(path.sep).join("/"));
    }
  }
}

function fileTreeOf(workspaceRoot) {
  const out = [];
  walk(workspaceRoot, workspaceRoot, out);
  return out.sort();
}

/**
 * Locates the active (non-archived) change's `state.yaml` under
 * `<workspaceRoot>/openspec/changes/`. Returns null when no change directory
 * (or no state.yaml within it) exists — a valid capture outcome for the
 * vague-request scenario, whose whole point is that no artifact is created.
 */
function findActiveStateFile(workspaceRoot) {
  const changesRoot = path.join(workspaceRoot, "openspec", "changes");
  let entries;

  try {
    entries = fs.readdirSync(changesRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "archive") {
      continue;
    }

    const candidate = path.join(changesRoot, entry.name, "state.yaml");

    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

/**
 * Snapshots a materialized fixture workspace after a live orchestrator run:
 * the parsed `state.yaml` (full structure, see parseYamlLite above), the
 * relative-path file tree, and the two `.eval-capture/` side-channel files
 * (`gate.json`/`envelope.json`) a scenario's driver protocol may have
 * written, per ADR sdd-design-001's `.eval-capture/` contract.
 *
 * @param {string} workspaceRoot
 * @returns {{ workspaceRoot: string, state: object|null, fileTree: string[],
 *   gate: object|null, envelope: object|null }}
 */
function captureWorkspace(workspaceRoot) {
  const resolvedRoot = path.resolve(workspaceRoot);
  const stateFilePath = findActiveStateFile(resolvedRoot);
  const stateContent = stateFilePath
    ? fs.readFileSync(stateFilePath, "utf8")
    : null;

  return {
    workspaceRoot: resolvedRoot,
    state: stateContent ? parseYamlLite(stateContent) : null,
    fileTree: fileTreeOf(resolvedRoot),
    gate: readJsonIfExists(path.join(resolvedRoot, ".eval-capture", "gate.json")),
    envelope: readJsonIfExists(
      path.join(resolvedRoot, ".eval-capture", "envelope.json"),
    ),
  };
}

module.exports = {
  captureWorkspace,
  parseYamlLite,
};
