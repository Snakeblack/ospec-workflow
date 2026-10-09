#!/usr/bin/env node

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const {
  extractFirstScalar,
  formatNextAction,
} = require("./pre-compact.js");
const {
  ARTIFACT_STORE_RELATIVE_PATHS,
  createArtifactStoreFromConfig,
} = require("../lib/artifact-store.js");
const { writeFileAtomic } = require("../lib/atomic-write.js");
const { resolveWorkspaceCwd } = require("../lib/pathsafe.js");
const { readIddSession } = require("./lib/idd-session.js");

const LATEST_RELATIVE_PATH = ARTIFACT_STORE_RELATIVE_PATHS.latestSession;

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
  return (
    extractFirstScalar(change.content, [["change", "name"]]) ||
    change.directoryName
  );
}

async function writeLatestTrace(filePath, content) {
  // Atomic temp+rename so a crash mid-write never leaves the next session
  // reading a partially written latest.md.
  await writeFileAtomic(filePath, content);
}

async function runStop({
  input = {},
  fallbackCwd = process.cwd(),
  mode,
  now = () => new Date(),
} = {}) {
  const workspace = resolveWorkspaceCwd(input.cwd, fallbackCwd);
  const store = await createArtifactStoreFromConfig({ mode, workspace });
  const sddChanges = await store.findActiveChanges();
  const iddSession = await readIddSession(workspace);

  if (iddSession.length > 0) {
    return writeWithIdd({ input, now, store, sddChanges, iddSession });
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
    path: LATEST_RELATIVE_PATH,
    activeChange: changeName || null,
  };
}

// E1.12 (§6.4): with open IDD changes, one change in total is the active
// change; several are listed, SDD first and then IDD by id.
async function writeWithIdd({ input, now, store, sddChanges, iddSession }) {
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

  return { status: "written", path: LATEST_RELATIVE_PATH, ...result };
}

async function readJsonInput(stream = process.stdin) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const input = Buffer.concat(chunks).toString("utf8").trim();
  return input ? JSON.parse(input) : {};
}

async function main() {
  try {
    await runStop({ input: await readJsonInput() });
    process.stdout.write('{"continue":true}\n');
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        continue: true,
        systemMessage: `Stop hook could not write the session trace: ${error.message}`,
      })}\n`,
    );
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  LATEST_RELATIVE_PATH,
  renderLatestSummary,
  runStop,
};
