"use strict";

// Router block markers and the pure edits on them (roadmap E0.4). The router
// lands in files the user also owns, so ospec writes it between markers: a
// reinstall replaces only that block and a removal leaves the user's text as
// it was. The file operations live in scripts/configure/instruction-block.js;
// these pure helpers sit in scripts/lib so the shipped runtime (the Claude
// router of claude-router.js) can migrate an old block too.

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

module.exports = {
  BEGIN,
  END,
  findBlock,
  isLegacyOrchestratorFile,
  removeBlock,
  upsertBlock,
};
