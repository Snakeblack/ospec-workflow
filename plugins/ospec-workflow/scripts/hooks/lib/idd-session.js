"use strict";

// E1.12 session-hook-idd: what the Stop and PreCompact hooks know about the
// open IDD changes (openspec/specs/hooks/spec.md §4.7, §6.4). The next step
// comes from ospec next (idd-next.nextForChange) over the state the CLI wrote;
// the session files stay derived views and never become a second cursor.
// Read-only over idd/: a hook never recovers, locks or rewrites a state, so an
// unreadable one is skipped. internal/iddsession is the Go port, kept
// byte-identical by the golden cases of internal/testdata/idd-session/.

const fs = require("node:fs/promises");
const path = require("node:path");

const { ARCHIVE_ROOT, CHANGE_ID_PATTERN, CHANGE_ROOT, GATES, STATE_FILE, validateState } = require("../../lib/idd-contract.js");
const { nextForChange } = require("../../lib/idd-next.js");

const CONFIG_FILE = path.posix.join(CHANGE_ROOT, "config.yaml");
const ARCHIVE_DIR = path.posix.basename(ARCHIVE_ROOT);

// A file the hooks cannot read (missing, a directory, no permission) reads as
// absent: one bad entry under idd/ must not take the session trace down (§4.7).
async function readText(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
}

async function readOpenState(workspace, id) {
  if (!CHANGE_ID_PATTERN.test(id)) return null;
  const raw = await readText(path.join(workspace, CHANGE_ROOT, id, STATE_FILE));
  if (raw === null) return null;
  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    return null;
  }
  return isOpenState(state, id) ? state : null;
}

// validateState assumes list elements are objects; a malformed state that
// makes it throw is as invalid as one it rejects (§4.7).
function isOpenState(state, id) {
  try {
    return validateState(state).ok && state.change === id && state.status === "open";
  } catch {
    return false;
  }
}

/** The open IDD changes of a workspace, by id. */
async function openIddChanges(workspace) {
  let entries;
  try {
    entries = await fs.readdir(path.join(workspace, CHANGE_ROOT), { withFileTypes: true });
  } catch {
    return [];
  }
  const ids = entries
    .filter((entry) => entry.isDirectory() && entry.name !== ARCHIVE_DIR)
    .map((entry) => entry.name)
    .sort();
  const states = [];
  for (const id of ids) {
    const state = await readOpenState(workspace, id);
    if (state) states.push(state);
  }
  return states;
}

// Whether idd/config.yaml declares at least one check: a `name: command` line
// under a top-level `checks:` section. The hooks only need this answer, so
// they count instead of validating the whole configuration.
function countDeclaredChecks(text) {
  let inChecks = false;
  let count = 0;
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (line.trim() === "" || /^\s*#/.test(line)) continue;
    if (!/^\s/.test(line)) {
      inChecks = /^checks:\s*$/.test(line);
      continue;
    }
    if (inChecks && /^\s+[A-Za-z0-9_-]+:\s*[^\s#]/.test(line)) count += 1;
  }
  return count;
}

async function checksDeclared(workspace) {
  return countDeclaredChecks(await readText(path.join(workspace, ...CONFIG_FILE.split("/")))) > 0;
}

/** The next step of an open change, as one line of the session files. */
function describeStep(state, { hasChecks }) {
  const { change } = state;
  const step = nextForChange(state, hasChecks ? {} : { checks: [] }).next_step;
  switch (step.action) {
    case "resolve-gate":
      return `Resolve the \`${step.gate}\` gate with the user: \`ospec next --change ${change}\` shows what to ask.`;
    case "declare-plan":
      return `Declare the plan: \`${step.how}\`.`;
    case "configure-checks":
      return `Configure the project checks before \`checks-pass\`: \`ospec next --change ${change}\` proposes the command, which needs the user's approval.`;
    case "satisfy-obligation":
      return `Satisfy \`${step.obligation}\` with ${step.evidence} evidence: ${step.how}.`;
    case "close":
      return `Close it: \`ospec close --change ${change}\`.`;
    default:
      return `Run \`ospec next --change ${change}\`.`;
  }
}

function renderList(values) {
  return values.length ? values.map((value) => `- ${value}`).join("\n") : "- None";
}

/** The detailed session summary PreCompact writes for an open IDD change. */
function renderIddSummary(state, nextAction) {
  const next = nextForChange(state);
  const intent = state.intent.kind ? `${state.intent.kind}: ${state.intent.summary}` : `ambiguous: ${state.intent.request}`;
  const openGates = state.gates
    .filter((gate) => gate.status === "open")
    .map((gate) => gate.id)
    .sort((left, right) => GATES.indexOf(left) - GATES.indexOf(right));
  return [
    "# Session Summary",
    "",
    "## Active change",
    `\`${state.change}\` (IDD)`,
    "",
    "## Intent",
    intent,
    "",
    "## Pending obligations",
    renderList(next.pending_obligations.map((obligation) => obligation.id)),
    "",
    "## Open gates",
    renderList(openGates),
    "",
    "## Next recommended action",
    nextAction,
    "",
  ].join("\n");
}

/** The open IDD changes with their next step, ready for the session files. */
async function readIddSession(workspace) {
  const states = await openIddChanges(workspace);
  if (states.length === 0) return [];
  const hasChecks = await checksDeclared(workspace);
  return states.map((state) => ({ change: state.change, state, nextAction: describeStep(state, { hasChecks }) }));
}

module.exports = {
  countDeclaredChecks,
  describeStep,
  openIddChanges,
  readIddSession,
  renderIddSummary,
};
