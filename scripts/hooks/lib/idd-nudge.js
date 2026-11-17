"use strict";

// E1.51 open-change-nudge: SessionStart tells the model which IDD changes are
// open, and Stop asks it once to continue a change the session moved that
// still has a step needing no answer from the user. internal/iddsession
// (nudge.go) is the Go port; the shared cases of
// internal/testdata/idd-nudge/ keep both identical.
//
// The fingerprint covers the work tree (HEAD, the binary diff of tracked
// files and every untracked file, without idd/<change>/ or .ospec/) and the
// state of each open change, so resolving a gate or recording evidence moves
// it too. Its record, .ospec/idd-nudge.json, holds the fingerprint each
// session started from and the fingerprints already asked about: a session
// that never moved asks nothing, and no fingerprint is asked about twice.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { writeFileAtomic } = require("../../lib/atomic-write.js");
const { mkdirOspec } = require("../../lib/ospec-gitignore.js");

const NUDGE_FILE = ".ospec/idd-nudge.json";
const DISABLE_ENV = "DISABLE_IDD_NUDGE";
const MAX_SESSIONS = 32;
const MAX_ASKED = 32;
// The steps the agent can take without the user: resolve-gate waits for an
// answer and configure-checks for the approval of a check command.
const NUDGE_ACTIONS = new Set(["satisfy-obligation", "declare-plan", "close"]);
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const EXCLUDES = [":(exclude,glob)idd/*/**", ":(exclude).ospec"];
const GIT_TIMEOUT_MS = 3000;
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

function disabled(env) {
  return env?.[DISABLE_ENV] === "true";
}

/** The session a hook payload belongs to; Cursor names it conversation_id. */
function sessionKey(input) {
  for (const key of ["sessionId", "session_id", "conversation_id"]) {
    const value = typeof input?.[key] === "string" ? input[key].trim() : "";
    if (value) return value;
  }
  return "unknown";
}

/** Whether the host says this turn already continues one a hook asked for. */
function continuationActive(input) {
  return input?.stop_hook_active === true ||
    input?.continuationActive === true ||
    input?.continuation_active === true ||
    (Number.isInteger(input?.loop_count) && input.loop_count > 0);
}

function runGit(root, args) {
  return execFileSync("git", ["-C", root, "-c", "core.quotePath=false", ...args], {
    maxBuffer: GIT_MAX_BUFFER,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: GIT_TIMEOUT_MS,
  });
}

function sha256Hex(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function splitNul(bytes) {
  const parts = [];
  let start = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === 0) {
      if (index > start) parts.push(bytes.subarray(start, index));
      start = index + 1;
    }
  }
  if (start < bytes.length) parts.push(bytes.subarray(start));
  return parts;
}

function untrackedEntry(root, file) {
  const full = path.join(root, file.toString("utf8"));
  try {
    if (fs.lstatSync(full).isSymbolicLink()) {
      return ["untracked-symlink", sha256Hex(fs.readlinkSync(full, { encoding: "buffer" }))];
    }
    return ["untracked", sha256Hex(fs.readFileSync(full))];
  } catch {
    return ["unreadable", sha256Hex(Buffer.alloc(0))];
  }
}

/**
 * The fingerprint of the work tree and the open changes `ids` (by id). Throws
 * when git cannot read the tree.
 */
function nudgeFingerprint(root, ids, run = runGit) {
  // Outside a work tree git diff falls back to --no-index.
  run(root, ["rev-parse", "--is-inside-work-tree"]);
  let head = null;
  try {
    head = run(root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]).toString("utf8").trim() || null;
  } catch {
    head = null;
  }
  const hash = crypto.createHash("sha256");
  hash.update(`ospec-nudge/v1\0head\0${head ?? "none"}\0`);
  hash.update(run(root, ["diff", "--binary", "--no-color", "--no-ext-diff", "--no-renames", head ?? EMPTY_TREE, "--", ".", ...EXCLUDES]));
  const untracked = splitNul(run(root, ["ls-files", "--others", "--exclude-standard", "-z", "--", ".", ...EXCLUDES]))
    .sort(Buffer.compare);
  for (const file of untracked) {
    const [kind, digest] = untrackedEntry(root, file);
    hash.update(`\0${kind}\0`);
    hash.update(file);
    hash.update(`\0${digest}`);
  }
  for (const id of [...ids].sort()) {
    let state;
    try {
      state = fs.readFileSync(path.join(root, "idd", id, "state.yaml"));
    } catch {
      state = Buffer.alloc(0);
    }
    hash.update(`\0state\0${id}\0${sha256Hex(state)}`);
  }
  return `sha256:${hash.digest("hex")}`;
}

function isText(value) {
  return typeof value === "string" && value.length > 0;
}

/** The record, or an empty one when it is missing or unreadable. */
function readRecord(workspace) {
  const empty = { sessions: [], asked: [] };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(path.join(workspace, ...NUDGE_FILE.split("/")), "utf8"));
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return empty;
  const list = (value) => (Array.isArray(value) ? value : []);
  return {
    sessions: list(parsed.sessions)
      .filter((entry) => entry && isText(entry.id) && isText(entry.base))
      .map(({ id, base }) => ({ id, base })),
    asked: list(parsed.asked)
      .filter((entry) => entry && isText(entry.change) && isText(entry.fingerprint))
      .map(({ change, fingerprint }) => ({ change, fingerprint })),
  };
}

async function writeRecord(workspace, record) {
  const file = path.join(workspace, ...NUDGE_FILE.split("/"));
  mkdirOspec(path.dirname(file));
  await writeFileAtomic(file, `${JSON.stringify({
    sessions: record.sessions.slice(-MAX_SESSIONS),
    asked: record.asked.slice(-MAX_ASKED),
  }, null, 2)}\n`);
}

function isIddProject(workspace) {
  try {
    return fs.statSync(path.join(workspace, "idd")).isDirectory();
  } catch {
    return false;
  }
}

function renderSteps(entries) {
  return entries.map(({ change, nextAction }) => `- \`${change}\`: ${nextAction}`).join("\n");
}

function renderContext(entries) {
  return [
    "ospec: these IDD changes are open; their state is on disk and `ospec next --change <id>` gives each one's full next step:",
    renderSteps(entries),
    "A change is done only after `ospec close`.",
  ].join("\n");
}

function renderReason(entries) {
  return [
    "ospec: these open IDD changes have a next step that needs no answer from the user:",
    renderSteps(entries),
    "Continue with them; a change is done only after `ospec close`. If you stopped to wait for the user's answer, say so and end your turn again. If a change was superseded or discarded, ask the user whether to abandon it with `ospec abandon --change <id> --reason \"<why>\"`.",
  ].join("\n");
}

/**
 * SessionStart: records the fingerprint the session starts from in an IDD
 * project and returns the open changes for the model and the user. On Cursor
 * the hook runs before every prompt, so only the first one of a conversation
 * gets them.
 */
async function sessionStartNudge({ workspace, input, entries, target, env = process.env, run = runGit }) {
  if (disabled(env) || !isIddProject(workspace)) return null;
  const session = sessionKey(input);
  const record = readRecord(workspace);
  const known = record.sessions.some(({ id }) => id === session);
  if (!known) {
    try {
      const base = nudgeFingerprint(workspace, entries.map(({ change }) => change), run);
      await writeRecord(workspace, { ...record, sessions: [...record.sessions, { id: session, base }] });
    } catch {
      // Without a base the first Stop of the session records one.
    }
  }
  if (entries.length === 0 || (target === "cursor" && known)) return null;
  return {
    additionalContext: renderContext(entries),
    systemMessage: `ospec: open IDD changes: ${entries.map(({ change }) => `\`${change}\``).join(", ")}.`,
  };
}

/**
 * Stop: `{ reason }` asks the agent to continue, `{ warning }` says why it
 * could not decide, null asks nothing.
 */
async function stopNudge({ workspace, input, entries, env = process.env, run = runGit }) {
  if (disabled(env) || entries.length === 0 || continuationActive(input)) return null;
  if (entries.some(({ gateOpen }) => gateOpen)) return null;
  const pending = entries.filter(({ action }) => NUDGE_ACTIONS.has(action));
  if (pending.length === 0) return null;
  let fingerprint;
  try {
    fingerprint = nudgeFingerprint(workspace, entries.map(({ change }) => change), run);
  } catch (error) {
    return { warning: `ospec did not ask to continue the open IDD changes: it could not read the work tree (${firstLine(error)})` };
  }
  const record = readRecord(workspace);
  const session = sessionKey(input);
  const start = record.sessions.find(({ id }) => id === session);
  try {
    if (!start) {
      await writeRecord(workspace, { ...record, sessions: [...record.sessions, { id: session, base: fingerprint }] });
      return null;
    }
    if (start.base === fingerprint) return null;
    const asked = new Set(record.asked.map(({ change, fingerprint: seen }) => `${change}\0${seen}`));
    const toAsk = pending.filter(({ change }) => !asked.has(`${change}\0${fingerprint}`));
    if (toAsk.length === 0) return null;
    await writeRecord(workspace, { ...record, asked: [...record.asked, ...toAsk.map(({ change }) => ({ change, fingerprint }))] });
    return { reason: renderReason(toAsk) };
  } catch (error) {
    return { warning: `ospec did not ask to continue the open IDD changes: it could not write ${NUDGE_FILE} (${firstLine(error)})` };
  }
}

function firstLine(error) {
  const text = String(error?.stderr?.length ? error.stderr : error?.message ?? error).trim();
  return text.split(/\r?\n/)[0] || "unknown error";
}

module.exports = {
  DISABLE_ENV,
  NUDGE_ACTIONS,
  NUDGE_FILE,
  continuationActive,
  nudgeFingerprint,
  readRecord,
  sessionKey,
  sessionStartNudge,
  stopNudge,
};
