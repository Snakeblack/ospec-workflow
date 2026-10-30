"use strict";

// The turn fence of the IDD gates (E1.49): the end-of-turn hook of each host
// counts the turns that ended in the workspace, a gate keeps the count of its
// opening, and an answer declared `--source user` before another turn ended is
// recorded `user-unverified`. The count is shared by every session of the
// workspace, and the main agent has the same disk access as the hook: it says
// that some turn ended, not that the user answered.

const fs = require("node:fs");
const path = require("node:path");

const { writeFileAtomic } = require("./atomic-write.js");
const { mkdirOspec } = require("./ospec-gitignore.js");

// A repository path, like the review receipts: the IDD workspace keeps it out
// of every diff it reads and the PreToolUse guard keeps write tools off it.
const TURNS_FILE = ".ospec/turns";
const COUNT = /^\d+$/;

function turnsPath(root) {
  return path.join(root, ...TURNS_FILE.split("/"));
}

/** The turns that ended in `root`, or null when the count is missing or unreadable. */
function readTurn(root) {
  let text;
  try {
    text = fs.readFileSync(turnsPath(root), "utf8").trim();
  } catch {
    return null;
  }
  const turn = Number(text);
  return COUNT.test(text) && Number.isSafeInteger(turn) ? turn : null;
}

/** Counts one more turn end in `workspace`; an unreadable count starts again. */
async function countTurnEnd(workspace) {
  const file = turnsPath(workspace);
  mkdirOspec(path.dirname(file));
  const turn = (readTurn(workspace) ?? 0) + 1;
  await writeFileAtomic(file, `${turn}\n`);
  return turn;
}

// A gate entry without its turns: an entry the command left as it was keeps
// this key.
function gateKey(gate) {
  const { opened_turn: _opened, resolved_turn: _resolved, ...rest } = gate;
  return JSON.stringify(rest);
}

function unverifiedReason(gate, turn) {
  if (turn === null) return `no turn count in ${TURNS_FILE}: no end-of-turn hook ran in this workspace`;
  if (gate.opened_turn === null) return `no turn count in ${TURNS_FILE} when the gate opened`;
  return "no turn ended between the gate's opening and the answer";
}

// The answer stays user-unverified (resolving it again changes nothing), so
// the remedy is for the next gates.
function unverifiedRemedy(gate, turn) {
  if (turn === null) return "install or repair the host's ospec hooks so the next answers can be verified";
  if (gate.opened_turn === null) return "the turns are counted now, so the next answers can be verified";
  return "ask the next gate by ending your turn with its questions, and record its answer after the user replies";
}

/**
 * Stamps, in `after`, the turn of each gate the command opened or changed
 * while open, and of each one it resolved. An answer declared `user` without
 * a turn end after the gate opened is recorded `user-unverified`, keeping the
 * declared source and the reason. A gate opened before E1.49 has no turn and
 * keeps the source it is answered with. Returns the gates it recorded so,
 * with the reason and its remedy.
 */
function fenceGates(before, after, turn) {
  const previous = (before?.gates || []).map(gateKey);
  const unverified = [];
  for (const gate of after.gates) {
    const index = previous.indexOf(gateKey(gate));
    if (index !== -1) {
      previous.splice(index, 1);
      continue;
    }
    if (gate.status === "open") {
      gate.opened_turn = turn;
      continue;
    }
    if (!Object.hasOwn(gate, "opened_turn")) continue;
    gate.resolved_turn = turn;
    // Any other count is a turn end: one that started again (.ospec/turns
    // lost) only counts up from 1 through Stop.
    const fenced = turn === null || gate.opened_turn === null || turn === gate.opened_turn;
    if (gate.source === "user" && fenced) {
      gate.declared_source = gate.source;
      gate.source = "user-unverified";
      gate.unverified_reason = unverifiedReason(gate, turn);
      unverified.push({ gate: gate.id, reason: gate.unverified_reason, remedy: unverifiedRemedy(gate, turn) });
    }
  }
  return unverified;
}

/** What close says of each gate answered `user-unverified`, relayed or fenced. */
function unverifiedGateWarnings(state) {
  return state.gates
    .filter((gate) => gate.status === "resolved" && gate.source === "user-unverified")
    .map((gate) => `gate ${gate.id} was answered user-unverified: ${gate.unverified_reason ?? "the answer was relayed"}`);
}

module.exports = {
  TURNS_FILE,
  countTurnEnd,
  fenceGates,
  readTurn,
  unverifiedGateWarnings,
};
