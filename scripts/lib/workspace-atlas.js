"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

// Dependency-free parser for the constrained workspace.yaml subset:
// top-level scalars, a `members` list of maps, and a `contracts` list of maps
// (with an inline `consumers: [a, b]` list). Anything deeper is ignored.
// Mirrors the hand-rolled parsers in ospec-state.js — the repo forbids npm deps.

function parseScalar(value) {
  const trimmed = String(value).trim();
  const quoted = trimmed.match(/^(["'])([\s\S]*)\1$/);

  if (quoted) {
    return quoted[2];
  }

  return trimmed.replace(/\s+#.*$/, "").trim();
}

function parseInlineList(value) {
  const match = String(value).trim().match(/^\[(.*)\]$/);

  if (!match) {
    return null;
  }

  const inner = match[1].trim();

  if (!inner) {
    return [];
  }

  return inner
    .split(",")
    .map((item) => parseScalar(item))
    .filter(Boolean);
}

function assignField(target, key, rawValue) {
  const inlineList = parseInlineList(rawValue);

  target[key] = inlineList !== null ? inlineList : parseScalar(rawValue);
}

function topLevelSectionLines(content, sectionName) {
  const lines = content.split(/\r?\n/);
  const section = [];
  let collecting = false;

  for (const raw of lines) {
    const trimmed = raw.trim();
    const indent = raw.match(/^\s*/)[0].length;

    if (!collecting) {
      if (indent === 0 && new RegExp(`^${sectionName}:\\s*$`).test(trimmed)) {
        collecting = true;
      }

      continue;
    }

    if (trimmed && indent === 0) {
      break;
    }

    section.push(raw);
  }

  return section;
}

function parseListOfMaps(content, sectionName) {
  const items = [];
  let current = null;
  let itemIndent = null;

  for (const raw of topLevelSectionLines(content, sectionName)) {
    const trimmed = raw.trim();
    const indent = raw.match(/^\s*/)[0].length;

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    if (trimmed.startsWith("- ")) {
      if (itemIndent === null) {
        itemIndent = indent;
      }

      if (indent !== itemIndent) {
        continue;
      }

      current = {};
      items.push(current);

      const field = trimmed.slice(2).trim().match(/^([^:]+):\s*(.*)$/);

      if (field) {
        assignField(current, field[1].trim(), field[2]);
      }

      continue;
    }

    // Map fields live exactly one indent step below the list item. Deeper
    // (unsupported) nesting is ignored rather than mis-parsed.
    if (current && itemIndent !== null && indent === itemIndent + 2) {
      const field = trimmed.match(/^([^:]+):\s*(.*)$/);

      if (field) {
        assignField(current, field[1].trim(), field[2]);
      }
    }
  }

  return items;
}

function parseAtlas(content) {
  if (typeof content !== "string" || !content.trim()) {
    return { members: [], contracts: [] };
  }

  const members = parseListOfMaps(content, "members").filter(
    (member) => member.id,
  );
  const contracts = parseListOfMaps(content, "contracts")
    .filter((contract) => contract.id)
    .map((contract) => ({
      ...contract,
      consumers: Array.isArray(contract.consumers) ? contract.consumers : [],
    }));

  return { members, contracts };
}

async function isReachable(memberRoot) {
  try {
    return (await fs.stat(path.join(memberRoot, "changes"))).isDirectory();
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function resolveMembers(workspace, atlas) {
  const base = path.resolve(workspace);
  const resolved = [];

  for (const member of atlas.members) {
    const root = path.resolve(
      base,
      member.path || "",
      member.openspec_root || "openspec",
    );

    resolved.push({
      id: member.id,
      root,
      reachable: await isReachable(root),
    });
  }

  return resolved;
}

function computeImpact(atlas, memberId) {
  const affected = new Set([memberId]);

  for (const contract of atlas.contracts) {
    if (contract.provider === memberId) {
      for (const consumer of contract.consumers || []) {
        affected.add(consumer);
      }
    }
  }

  return affected;
}

module.exports = {
  computeImpact,
  parseAtlas,
  resolveMembers,
};
