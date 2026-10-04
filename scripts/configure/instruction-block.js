"use strict";

// Router block (roadmap E0.4). The always-on router lands in files the user
// also owns (~/.codex/AGENTS.md, a repository's AGENTS.md, ~/.claude/CLAUDE.md),
// so ospec writes it between markers: a reinstall replaces only that block and
// a removal leaves the user's text as it was.

const fs = require("node:fs");
const path = require("node:path");

const BEGIN = "<!-- ospec-workflow:router:begin -->";
const END = "<!-- ospec-workflow:router:end -->";
// Before E0.4, setup:codex copied the whole orchestrator over AGENTS.md.
const LEGACY_HEADING = /^# SDD Orchestrator$/m;

function findBlock(text) {
  const start = text.indexOf(BEGIN);
  if (start === -1) return null;
  const end = text.indexOf(END, start);
  if (end === -1) {
    throw new Error(`the ospec router block has "${BEGIN}" but no end marker; fix the file by hand`);
  }
  return { start, end: end + END.length };
}

function renderBlock(body) {
  return `${BEGIN}\n${String(body).trim()}\n${END}\n`;
}

function upsertBlock(existing, body) {
  const text = String(existing ?? "");
  const block = renderBlock(body);
  const found = findBlock(text);
  if (found) {
    return text.slice(0, found.start) + block + text.slice(found.end).replace(/^\r?\n/, "");
  }
  if (text.trim() === "") return block;
  return text.replace(/\s*$/, "\n\n") + block;
}

function removeBlock(existing) {
  const text = String(existing ?? "");
  const found = findBlock(text);
  if (!found) return text;
  const before = text.slice(0, found.start).replace(/\s*$/, "");
  const after = text.slice(found.end).replace(/^\s*/, "");
  if (!before) return after;
  if (!after) return `${before}\n`;
  return `${before}\n\n${after}`;
}

function isLegacyOrchestratorFile(text) {
  const content = String(text ?? "");
  return !content.includes(BEGIN) && LEGACY_HEADING.test(content);
}

function readIfExists(filePath, fsImpl) {
  return fsImpl.existsSync(filePath) ? fsImpl.readFileSync(filePath, "utf8") : "";
}

// `replaceWhole` is for a file the previous install owned entirely; a legacy
// orchestrator copy is recognised on its own.
function writeRouterBlock(filePath, body, { fs: fsImpl = fs, replaceWhole = false } = {}) {
  const existing = readIfExists(filePath, fsImpl);
  const base = replaceWhole || isLegacyOrchestratorFile(existing) ? "" : existing;
  fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
  fsImpl.writeFileSync(filePath, upsertBlock(base, body), "utf8");
}

// Returns whether a block was removed. A file left empty was ospec's alone.
function removeRouterBlock(filePath, { fs: fsImpl = fs } = {}) {
  const existing = readIfExists(filePath, fsImpl);
  if (!existing.includes(BEGIN)) return false;
  const rest = removeBlock(existing);
  if (rest.trim() === "") fsImpl.rmSync(filePath, { force: true });
  else fsImpl.writeFileSync(filePath, rest, "utf8");
  return true;
}

module.exports = {
  BEGIN,
  END,
  isLegacyOrchestratorFile,
  removeBlock,
  removeRouterBlock,
  upsertBlock,
  writeRouterBlock,
};
