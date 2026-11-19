#!/usr/bin/env node

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

// E1.49: counting the turn end loads only these modules. The trace loads the
// rest of the hook's graph (some forty files) after the count, so a loaded
// host counts the turn within the launcher's deadline and a trace module that
// cannot load still counts it.
const { writeFileAtomic } = require("../lib/atomic-write.js");
const { mkdirOspec } = require("../lib/ospec-gitignore.js");
const { resolveWorkspaceCwd } = require("../lib/pathsafe.js");
const { countTurnEnd, turnsRoot, uncountTurnEnd } = require("../lib/turn-fence.js");

let traceModules = null;

function trace() {
  if (!traceModules) {
    const { extractFirstScalar, formatNextAction } = require("./pre-compact.js");
    const { ARTIFACT_STORE_RELATIVE_PATHS, createArtifactStoreFromConfig } = require("../lib/artifact-store.js");
    const { readIddSession } = require("./lib/idd-session.js");
    const { stopNudge } = require("./lib/idd-nudge.js");
    traceModules = {
      createArtifactStoreFromConfig,
      extractFirstScalar,
      formatNextAction,
      latestRelativePath: ARTIFACT_STORE_RELATIVE_PATHS.latestSession,
      readIddSession,
      stopNudge,
    };
  }
  return traceModules;
}

function toPortablePath(filePath) {
  return filePath.split(path.sep).join("/");
}

async function pathIsFile(filePath) {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function resolveTimestamp(input, now) {
  const timestamp =
    typeof input?.timestamp === "string" ? input.timestamp.trim() : "";

  return timestamp || now().toISOString();
}

function resolveSessionId(input) {
  const sessionId =
    typeof input?.sessionId === "string"
      ? input.sessionId.trim()
      : typeof input?.session_id === "string"
        ? input.session_id.trim()
        : "";

  return sessionId || "unknown";
}

async function resolveDetailedSummary(store, activeChange) {
  if (!activeChange) {
    return "None";
  }

  const summaryPath = store.sessionSummaryPath(activeChange.directoryName);

  return (await pathIsFile(summaryPath))
    ? toPortablePath(path.relative(store.workspace, summaryPath))
    : "None";
}

function renderLatestDocument({
  activeChange,
  currentPhase,
  detailedSummary,
  endedAt,
  nextAction,
  sessionId,
  status,
}) {
  return [
    "# Latest Session",
    "",
    `- Ended at: \`${endedAt}\``,
    `- Session: \`${sessionId}\``,
    `- Active change: ${activeChange}`,
    `- Current phase: \`${currentPhase}\``,
    `- Change status: \`${status}\``,
    `- Detailed summary: \`${detailedSummary}\``,
    "",
    "## Next recommended action",
    nextAction,
    "",
  ].join("\n");
}

function renderLatestSummary({
  activeChange,
  changeName,
  currentPhase,
  detailedSummary,
  endedAt,
  nextAction,
  sessionId,
  status,
}) {
  return renderLatestDocument({
    activeChange: `\`${activeChange ? changeName : "None"}\``,
    currentPhase: activeChange ? currentPhase || "unknown" : "None",
    detailedSummary,
    endedAt,
    nextAction,
    sessionId,
    status: activeChange ? status || "active" : "None",
  });
}

// E1.12 (§6.4): several open changes, IDD among them, are listed without
// choosing one; each line carries that change's own next step.
function renderOpenChanges({ endedAt, sessionId, openChanges }) {
  return renderLatestDocument({
    activeChange: `${openChanges.map(({ name }) => `\`${name}\``).join(", ")} (ambiguous: ${openChanges.length} open changes)`,
    currentPhase: "multiple",
    detailedSummary: "None",
    endedAt,
    nextAction: [
      "Several changes are open; choose the one to resume:",
      ...openChanges.map(({ name, mode, nextAction }) => `- \`${name}\` (${mode}): ${nextAction}`),
    ].join("\n"),
    sessionId,
    status: "multiple",
  });
}

function sddChangeName(change) {
  const { extractFirstScalar } = trace();
  return (
    extractFirstScalar(change.content, [["change", "name"]]) ||
    change.directoryName
  );
}

async function writeLatestTrace(filePath, content) {
  // Atomic temp+rename so a crash mid-write never leaves the next session
  // reading a partially written latest.md.
  mkdirOspec(path.dirname(filePath));
  await writeFileAtomic(filePath, content);
}

async function runStop({
  input = {},
  fallbackCwd = process.cwd(),
  mode,
  now = () => new Date(),
  env = process.env,
} = {}) {
  const { createArtifactStoreFromConfig, extractFirstScalar, formatNextAction, latestRelativePath, readIddSession, stopNudge } = trace();
  const workspace = resolveWorkspaceCwd(input.cwd, fallbackCwd);
  const store = await createArtifactStoreFromConfig({ mode, workspace });
  const sddChanges = await store.findActiveChanges();
  const iddSession = await readIddSession(workspace);

  if (iddSession.length > 0) {
    const result = await writeWithIdd({ input, now, store, sddChanges, iddSession });
    // E1.51: after the trace, so a trace that cannot be written asks nothing.
    const nudge = await stopNudge({ workspace, input, entries: iddSession, env });
    return nudge ? { ...result, nudge } : result;
  }

  const activeChange = sddChanges[0] || null;
  const changeName = activeChange
    ? extractFirstScalar(activeChange.content, [["change", "name"]]) ||
      activeChange.directoryName
    : "";
  const currentPhase = activeChange
    ? extractFirstScalar(activeChange.content, [
        ["change", "current_phase"],
        ["current_phase"],
        ["phase"],
      ])
    : "";
  const status = activeChange
    ? extractFirstScalar(activeChange.content, [
        ["change", "status"],
        ["status"],
      ])
    : "";
  const nextRecommended = activeChange
    ? extractFirstScalar(activeChange.content, [["next_recommended"]])
    : "";
  const latestPath = store.latestSessionPath();
  const latestSummary = renderLatestSummary({
    activeChange,
    changeName,
    currentPhase,
    detailedSummary: await resolveDetailedSummary(store, activeChange),
    endedAt: resolveTimestamp(input, now),
    nextAction: activeChange
      ? formatNextAction(nextRecommended, changeName)
      : "Start a new session when more work is needed.",
    sessionId: resolveSessionId(input),
    status,
  });

  await writeLatestTrace(latestPath, latestSummary);

  return {
    status: "written",
    path: latestRelativePath,
    activeChange: changeName || null,
  };
}

// E1.12 (§6.4): with open IDD changes, one change in total is the active
// change; several are listed, SDD first and then IDD by id.
async function writeWithIdd({ input, now, store, sddChanges, iddSession }) {
  const { extractFirstScalar, formatNextAction, latestRelativePath } = trace();
  const endedAt = resolveTimestamp(input, now);
  const sessionId = resolveSessionId(input);
  const openChanges = [
    ...sddChanges.map((change) => {
      const name = sddChangeName(change);
      return {
        name,
        mode: "sdd",
        nextAction: formatNextAction(
          extractFirstScalar(change.content, [["next_recommended"]]),
          name,
        ),
      };
    }),
    ...iddSession.map(({ change, nextAction }) => ({
      name: change,
      mode: "idd",
      nextAction,
    })),
  ];
  let content;
  let result;

  if (openChanges.length === 1) {
    const [{ change, state, nextAction }] = iddSession;

    content = renderLatestSummary({
      activeChange: true,
      changeName: change,
      currentPhase: "idd",
      detailedSummary: await resolveDetailedSummary(store, {
        directoryName: change,
      }),
      endedAt,
      nextAction,
      sessionId,
      status: state.status,
    });
    result = { activeChange: change };
  } else {
    content = renderOpenChanges({ endedAt, sessionId, openChanges });
    result = {
      activeChange: null,
      openChanges: openChanges.map(({ name }) => name),
    };
  }

  await writeLatestTrace(store.latestSessionPath(), content);

  return { status: "written", path: latestRelativePath, ...result };
}

async function readJsonInput(stream = process.stdin) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const input = Buffer.concat(chunks).toString("utf8").trim();
  return input ? JSON.parse(input) : {};
}

// E1.49: every turn end is counted in .ospec/turns of the project before the
// trace loads, so a trace that cannot load or a deadline that stops the hook
// still counts it.
async function countTurn(input, fallbackCwd = process.cwd()) {
  try {
    await countTurnEnd(turnsRoot(resolveWorkspaceCwd(input?.cwd, fallbackCwd)));
    return null;
  } catch (error) {
    return `Stop hook could not count the turn end: ${error.message}`;
  }
}

// A Stop that asks the agent to continue (E1.51) ended no turn, so it takes
// back the one it counted.
async function uncountTurn(input, fallbackCwd = process.cwd()) {
  try {
    await uncountTurnEnd(turnsRoot(resolveWorkspaceCwd(input?.cwd, fallbackCwd)));
    return null;
  } catch (error) {
    return `Stop hook could not take back the turn end: ${error.message}`;
  }
}

// The hook's answer: `decision: "block"` with the reason asks the agent to
// continue (E1.51), which the launcher translates for each host; otherwise
// `continue: true`. Every failure and warning rides on systemMessage.
function stopOutput({ failure = null, nudge = null } = {}) {
  const systemMessage = [failure, nudge?.warning].filter(Boolean).join("\n");
  const answer = nudge?.reason ? { decision: "block", reason: nudge.reason } : { continue: true };
  return systemMessage ? { ...answer, systemMessage } : answer;
}

async function main() {
  let failure = null;
  let nudge = null;
  try {
    const input = await readJsonInput();
    failure = await countTurn(input);
    nudge = (await runStop({ input })).nudge ?? null;
    if (nudge?.reason) {
      // A count that failed may have landed (an error after its rename), and
      // a turn end it cannot take back stays counted: the Stop then lets the
      // turn end rather than ask to continue with the count one turn ahead.
      if (failure === null) failure = await uncountTurn(input);
      if (failure) nudge = nudge.warning ? { warning: nudge.warning } : null;
    }
  } catch (error) {
    failure = `Stop hook could not write the session trace: ${error.message}`;
  }
  process.stdout.write(`${JSON.stringify(stopOutput({ failure, nudge }))}\n`);
}

if (require.main === module) {
  void main();
}

module.exports = {
  get LATEST_RELATIVE_PATH() {
    return trace().latestRelativePath;
  },
  countTurn,
  renderLatestSummary,
  runStop,
  stopOutput,
};
