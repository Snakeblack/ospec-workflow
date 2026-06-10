"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");

const TERMINAL_STATUSES = new Set([
  "archived",
  "closed",
  "complete",
  "completed",
  "done",
]);
const RUNTIME_EVENT_RELATIVE_PATH =
  ".ospec/runtime/subagent-events.jsonl";

function compareStrings(left, right) {
  if (left < right) {
    return -1;
  }

  return left > right ? 1 : 0;
}

function toPortablePath(filePath) {
  return filePath.split(path.sep).join("/");
}

function parseScalar(value) {
  const trimmed = value.trim();
  const quoted = trimmed.match(/^(["'])([\s\S]*)\1$/);

  if (quoted) {
    return quoted[2];
  }

  return trimmed.replace(/\s+#.*$/, "").trim();
}

function readStatus(content) {
  const lines = content.split(/\r?\n/);
  let inChange = false;
  let topLevelStatus = "";

  for (const raw of lines) {
    const trimmed = raw.trim();
    const indent = raw.match(/^\s*/)[0].length;

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    if (indent === 0) {
      inChange = trimmed === "change:";

      const match = trimmed.match(/^status:\s*(.+)$/);

      if (match) {
        topLevelStatus = parseScalar(match[1]).toLowerCase();
      }

      continue;
    }

    if (inChange) {
      const nestedStatus = trimmed.match(/^status:\s*(.+)$/);

      if (nestedStatus) {
        return parseScalar(nestedStatus[1]).toLowerCase();
      }
    }
  }

  return topLevelStatus;
}

function resolveWorkspaceFromChange(changePath) {
  const absoluteChangePath = path.resolve(changePath);
  const changesPath = path.dirname(absoluteChangePath);
  const openspecRoot = path.dirname(changesPath);

  if (
    path.basename(changesPath) !== "changes" ||
    path.basename(openspecRoot) !== "openspec"
  ) {
    throw new Error(
      `Change path must match <workspace>/openspec/changes/<change>: ${changePath}`,
    );
  }

  return path.dirname(openspecRoot);
}

async function findOpenSpecRoot(workspace) {
  const openspecRoot = path.join(path.resolve(workspace), "openspec");

  try {
    const stats = await fs.stat(openspecRoot);
    return stats.isDirectory() ? openspecRoot : null;
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function readState(changePath) {
  const resolvedPath = path.resolve(changePath);
  const statePath =
    path.basename(resolvedPath).toLowerCase() === "state.yaml"
      ? resolvedPath
      : path.join(resolvedPath, "state.yaml");

  try {
    const [content, stats] = await Promise.all([
      fs.readFile(statePath, "utf8"),
      fs.stat(statePath),
    ]);
    const changeDirectory = path.dirname(statePath);

    return {
      changePath: changeDirectory,
      changeDirectory,
      directoryName: path.basename(changeDirectory),
      statePath,
      content,
      status: readStatus(content),
      modifiedAt: stats.mtimeMs,
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function findActiveChanges(openspecRoot) {
  if (!openspecRoot) {
    return [];
  }

  const changesRoot = path.join(path.resolve(openspecRoot), "changes");
  let entries;

  try {
    entries = await fs.readdir(changesRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const states = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name !== "archive")
      .map((entry) => readState(path.join(changesRoot, entry.name))),
  );

  return states
    .filter(
      (state) => state && !TERMINAL_STATUSES.has(state.status.toLowerCase()),
    )
    .sort(
      (left, right) =>
        right.modifiedAt - left.modifiedAt ||
        compareStrings(left.directoryName, right.directoryName),
    );
}

async function writeSessionSummary(changePath, summary) {
  const absoluteChangePath = path.resolve(changePath);
  const workspace = resolveWorkspaceFromChange(absoluteChangePath);
  const summaryPath = path.join(
    workspace,
    ".ospec",
    "session",
    path.basename(absoluteChangePath),
    "session-summary.md",
  );

  try {
    if ((await fs.readFile(summaryPath, "utf8")) === summary) {
      return {
        status: "fresh",
        path: toPortablePath(path.relative(workspace, summaryPath)),
        absolutePath: summaryPath,
      };
    }
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  await fs.mkdir(path.dirname(summaryPath), { recursive: true });

  const temporaryPath = `${summaryPath}.${process.pid}.${crypto.randomUUID()}.tmp`;

  try {
    await fs.writeFile(temporaryPath, summary, "utf8");
    await fs.rename(temporaryPath, summaryPath);
  } finally {
    try {
      await fs.rm(temporaryPath, { force: true });
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  return {
    status: "written",
    path: toPortablePath(path.relative(workspace, summaryPath)),
    absolutePath: summaryPath,
  };
}

async function appendRuntimeEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new TypeError("Runtime event must be an object.");
  }

  const workspace = path.resolve(event.workspace || event.cwd || process.cwd());
  const eventPath = path.join(
    workspace,
    ...RUNTIME_EVENT_RELATIVE_PATH.split("/"),
  );
  const serializedEvent = { ...event };

  delete serializedEvent.workspace;
  delete serializedEvent.cwd;

  await fs.mkdir(path.dirname(eventPath), { recursive: true });
  await fs.appendFile(
    eventPath,
    `${JSON.stringify(serializedEvent)}\n`,
    "utf8",
  );

  return {
    path: RUNTIME_EVENT_RELATIVE_PATH,
    absolutePath: eventPath,
    event: serializedEvent,
  };
}

module.exports = {
  RUNTIME_EVENT_RELATIVE_PATH,
  appendRuntimeEvent,
  findActiveChanges,
  findOpenSpecRoot,
  readState,
  writeSessionSummary,
};
