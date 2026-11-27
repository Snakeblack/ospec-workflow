"use strict";

// Filesystem adapter for IDD change state (openspec/specs/idd/spec.md,
// REQ-idd-002, REQ-idd-003, REQ-idd-011). state.yaml is written as canonical
// JSON, which is valid YAML 1.2, so no YAML parser or line-oriented escaping is
// needed for model-controlled text. Every write runs under the state file's
// lock, validates the result and replaces the file atomically and durably; a
// repeated record that changes nothing never touches the file, and a write
// whose lock another process took over is refused with lock-lost (E1.46).
// Every write also fences the gates it opens or answers with the turn count
// of the Stop hook (E1.49).

const fs = require("node:fs/promises");
const path = require("node:path");

const {
  ARCHIVE_ROOT,
  CHANGE_ID_PATTERN,
  CHANGE_ROOT,
  DECISIONS_MARKERS,
  EVIDENCE_MARKERS,
  LIVING_DOC_FILE,
  LIVING_DOC_SECTIONS,
  LOG_MARKERS,
  PLAN_MARKERS,
  STATE_FIELDS,
  STATE_FILE,
  userLog,
  validateState,
} = require("./idd-contract.js");
const { recoverOrphanBak, writeFileAtomic } = require("./atomic-write.js");
const { withFileLock } = require("./ospec-state.js");
const { fenceGates, fenceSignals, workspaceTurn } = require("./turn-fence.js");

class IddStoreError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IddStoreError";
    this.code = code;
  }
}

function changeDir(root, changeId) {
  // The id becomes a path segment: only kebab-case ids reach the filesystem.
  if (typeof changeId !== "string" || !CHANGE_ID_PATTERN.test(changeId)) {
    throw new IddStoreError("invalid-change-id", `change id must be kebab-case, got ${JSON.stringify(changeId)}`);
  }
  return path.join(root, CHANGE_ROOT, changeId);
}

function statePath(root, changeId) {
  return path.join(changeDir(root, changeId), STATE_FILE);
}

function serializeState(state) {
  const ordered = {};
  for (const field of STATE_FIELDS) {
    if (field in state) ordered[field] = state[field];
  }
  for (const [key, value] of Object.entries(state)) {
    if (!(key in ordered)) ordered[key] = value;
  }
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

async function readChange(root, changeId) {
  const file = statePath(root, changeId);
  await recoverOrphanBak(file);
  let raw;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  let state;
  try {
    state = JSON.parse(raw);
  } catch (error) {
    throw new IddStoreError("state-unreadable", `${file} is not readable idd-state: ${error.message}`);
  }
  const { ok, errors } = validateState(state);
  if (!ok) throw new IddStoreError("state-invalid", `${file}: ${errors.join("; ")}`);
  if (state.change !== changeId) {
    throw new IddStoreError("change-mismatch", `${file} declares change ${state.change}`);
  }
  return state;
}

async function listChanges(root) {
  const base = path.join(root, CHANGE_ROOT);
  const archiveName = path.basename(ARCHIVE_ROOT);
  let entries;
  try {
    entries = await fs.readdir(base, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const ids = entries
    .filter((entry) => entry.isDirectory() && entry.name !== archiveName)
    .map((entry) => entry.name)
    .sort();
  const states = [];
  for (const id of ids) {
    const state = await readChange(root, id);
    if (state) states.push(state);
  }
  return states;
}

// The declared plan and decisions as the CLI writes them (E4.16).
function planLines(plan) {
  if (!plan) return [];
  const lines = [];
  if (plan.paths.length > 0) lines.push(`- Files: ${plan.paths.map((file) => `\`${file}\``).join(", ")}`);
  if (plan.work_units > 1) lines.push(`- Work units: ${plan.work_units}`);
  if (plan.operations.length > 0) lines.push(`- Operations: ${plan.operations.join(", ")}`);
  return lines;
}

function decisionLines(plan, eol) {
  return (plan?.decisions || []).map((text) => `- ${text.replace(/\r?\n/g, `${eol}  `)}`);
}

// Each line of the text with the offset it starts at, without its line end.
function linesWithOffsets(text) {
  const lines = [];
  let offset = 0;
  for (const raw of text.split("\n")) {
    lines.push({ offset, content: raw.replace(/\r$/, "") });
    offset += raw.length + 1;
  }
  return lines;
}

// The lines of one pair of markers. A marker counts only as a whole line,
// which a quoted answer of the log never is (E1.77), so a marker inside the
// user's words cannot take the place of the CLI's.
function markerLines(lines, markers) {
  const start = lines.findIndex((line) => line.content.trim() === markers.start);
  const end = start === -1 ? -1 : lines.findIndex((line, index) => index > start && line.content.trim() === markers.end);
  return end === -1 ? null : { start: lines[start], end: lines[end] };
}

// Rewrites only the text between one pair of markers, keeping the file's line
// endings; a document without them stays as it is.
function renderBlock(text, markers, body, eol) {
  const found = markerLines(linesWithOffsets(text), markers);
  if (!found) return text;
  const inner = body.length ? `${eol}${body.join(eol)}${eol}` : eol;
  return `${text.slice(0, found.start.offset + found.start.content.length)}${inner}${text.slice(found.end.offset)}`;
}

// The user's request and answers as the CLI writes them (E1.77): each text
// literal, every line quoted, so no answer opens a section or holds a marker
// line; a time recorded before resolved_at existed reads "no date".
const NO_DATE = "no date";
const LOG_HEADING = LIVING_DOC_SECTIONS[1];

function quoted(text) {
  return String(text).split(/\r?\n/).map((line) => (line === "" ? ">" : `> ${line}`));
}

function logLines(state) {
  const { request, answers } = userLog(state);
  const lines = [];
  if (request) lines.push(`Request (${request.at ?? NO_DATE}):`, "", ...quoted(request.text), "");
  answers.forEach((answer, index) => {
    lines.push(`Answer ${index + 1} — ${answer.label}, ${answer.source}, ${answer.at ?? NO_DATE}:`, "", ...quoted(answer.text), "");
  });
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

// A document without the log, from a change opened before it, gets the
// section before its Plan; one that keeps the heading without the markers
// stays as it is, and close refuses it.
function renderLog(text, state, eol) {
  const body = logLines(state);
  const lines = linesWithOffsets(text);
  if (markerLines(lines, LOG_MARKERS)) return renderBlock(text, LOG_MARKERS, body, eol);
  const heading = (line) => /^## (.+?)\s*$/.exec(line.content)?.[1];
  if (lines.some((line) => line.content.trim() === LOG_MARKERS.start || heading(line) === LOG_HEADING)) return text;
  const plan = lines.find((line) => heading(line) === LIVING_DOC_SECTIONS[2]);
  if (!plan) return text;
  const section = [`## ${LOG_HEADING}`, "", LOG_MARKERS.start, ...body, LOG_MARKERS.end, "", ""].join(eol);
  return `${text.slice(0, plan.offset)}${section}${text.slice(plan.offset)}`;
}

function renderLivingDoc(text, state) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const planned = renderBlock(text, PLAN_MARKERS, planLines(state.plan), eol);
  return renderLog(renderBlock(planned, DECISIONS_MARKERS, decisionLines(state.plan, eol), eol), state, eol);
}

function livingDocTemplate(state) {
  const [intentHeading, logHeading, planHeading, decisionsHeading, evidenceHeading] = LIVING_DOC_SECTIONS;
  const lines = [`# ${state.change}`, "", `## ${intentHeading}`, "", state.intent.summary, "", `Acceptance: ${state.intent.acceptance}`, ""];
  lines.push(`## ${logHeading}`, "", LOG_MARKERS.start, LOG_MARKERS.end, "");
  lines.push(`## ${planHeading}`, "", PLAN_MARKERS.start, PLAN_MARKERS.end, "");
  lines.push(`## ${decisionsHeading}`, "", DECISIONS_MARKERS.start, DECISIONS_MARKERS.end, "");
  lines.push(`## ${evidenceHeading}`, "", EVIDENCE_MARKERS.start, EVIDENCE_MARKERS.end, "");
  return renderLivingDoc(lines.join("\n"), state);
}

// The living document exists only while living-doc is active (REQ-idd-002)
// and is created once from the template. The model owns its sections; after
// each write the CLI rewrites the plan and decisions between its markers.
async function ensureLivingDoc(root, state, writeFile) {
  const active = state.obligations.some((o) => o.id === "living-doc" && o.status !== "withdrawn");
  if (!active) return;
  const file = path.join(changeDir(root, state.change), LIVING_DOC_FILE);
  let text;
  try {
    text = await fs.readFile(file, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    try {
      await fs.writeFile(file, livingDocTemplate(state), { encoding: "utf8", flag: "wx" });
    } catch (created) {
      if (created.code !== "EEXIST") throw created;
    }
    return;
  }
  const rendered = renderLivingDoc(text, state);
  if (rendered !== text) await writeFile(file, rendered);
}

async function mutateChange(root, changeId, reducer, { writeFile = writeFileAtomic } = {}) {
  const file = statePath(root, changeId);
  await fs.mkdir(path.dirname(file), { recursive: true });
  return withFileLock(file, async (assertOwned) => {
    const current = await readChange(root, changeId);
    const result = reducer(current);
    if (result.state.change !== changeId) {
      throw new IddStoreError("change-mismatch", `state for ${result.state.change} does not match ${changeId}`);
    }
    if (result.changed) {
      const turn = workspaceTurn(root);
      const unverified = [...fenceGates(current, result.state, turn), ...fenceSignals(current, result.state, turn)];
      if (unverified.length) result.unverified = unverified;
      const { ok, errors } = validateState(result.state);
      if (!ok) throw new IddStoreError("state-invalid", errors.join("; "));
      await assertOwned().catch((error) => {
        throw error.code === "lock-lost" ? new IddStoreError("lock-lost", error.message) : error;
      });
      await writeFile(file, serializeState(result.state));
    }
    await ensureLivingDoc(root, result.state, writeFile);
    return result;
  });
}

module.exports = {
  IddStoreError,
  changeDir,
  listChanges,
  mutateChange,
  readChange,
  renderBlock,
  renderLivingDoc,
  serializeState,
  statePath,
};
