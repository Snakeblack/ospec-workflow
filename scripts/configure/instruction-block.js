"use strict";

// Router block (roadmap E0.4). The always-on router lands in files the user
// also owns (~/.codex/AGENTS.md, a repository's AGENTS.md), so ospec writes it
// between markers: a reinstall replaces only that block and a removal leaves
// the user's text as it was. The markers and the pure edits live in
// scripts/lib/router-block.js; this module adds the file operations.

const fs = require("node:fs");
const path = require("node:path");
const { BEGIN, END, isLegacyOrchestratorFile, removeBlock, upsertBlock } = require("../lib/router-block.js");

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
