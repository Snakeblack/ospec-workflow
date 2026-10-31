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
  PLAN_MARKERS,
  STATE_FIELDS,
  STATE_FILE,
  validateState,
} = require("./idd-contract.js");
const { recoverOrphanBak, writeFileAtomic } = require("./atomic-write.js");
const { withFileLock } = require("./ospec-state.js");
const { fenceGates, readTurn } = require("./turn-fence.js");

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

// Rewrites only the text between one pair of markers, keeping the file's line
// endings; a document without them stays as it is.
function renderBlock(text, markers, lines, eol) {
  const start = text.indexOf(markers.start);
  const end = text.indexOf(markers.end, start);
  if (start === -1 || end === -1) return text;
  const body = lines.length ? `${eol}${lines.join(eol)}${eol}` : eol;
  return `${text.slice(0, start + markers.start.length)}${body}${text.slice(end)}`;
}

function renderLivingDoc(text, state) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const planned = renderBlock(text, PLAN_MARKERS, planLines(state.plan), eol);
  return renderBlock(planned, DECISIONS_MARKERS, decisionLines(state.plan, eol), eol);
}

function livingDocTemplate(state) {
  const [intentHeading, planHeading, decisionsHeading, evidenceHeading] = LIVING_DOC_SECTIONS;
  const lines = [`# ${state.change}`, "", `## ${intentHeading}`, "", state.intent.summary, "", `Acceptance: ${state.intent.acceptance}`, ""];
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
      const unverified = fenceGates(current, result.state, readTurn(root));
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
  serializeState,
  statePath,
};
