"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const ospec = require("./ospec-state.js");

const DEFAULT_ARTIFACT_STORE_MODE = "openspec";
const ARTIFACT_STORE_MODES = ["openspec", "workspace-federated"];

// Single source of truth for the on-disk layout. Hooks MUST resolve every path
// through a store instead of hardcoding these literals, so a second backend
// (e.g. workspace-federated) only has to provide its own layout + resolvers.
const DERIVED_LAYOUT = {
  cache: ".ospec/cache/skill-registry.cache.json",
  sessionDir: ".ospec/session",
  latest: ".ospec/session/latest.md",
  // Owned by the openspec backend; referenced here so there is one source.
  runtimeEvents: ospec.RUNTIME_EVENT_RELATIVE_PATH,
  sessionSummaryFile: "session-summary.md",
};

// Mode-independent derived relative paths. Hooks re-export these so the harness
// never hardcodes the .ospec/ layout in more than one place.
const ARTIFACT_STORE_RELATIVE_PATHS = Object.freeze({
  cache: DERIVED_LAYOUT.cache,
  latestSession: DERIVED_LAYOUT.latest,
  runtimeEvents: DERIVED_LAYOUT.runtimeEvents,
});

const CANONICAL_LAYOUT = {
  root: "openspec",
  config: "openspec/config.yaml",
  changesDir: "openspec/changes",
};

function toRelativeSegments(relativePath) {
  return relativePath.split("/");
}

function notImplemented(mode, operation) {
  return new Error(
    `Artifact store mode "${mode}" does not implement ${operation} yet. ` +
      "Multi-repo canonical resolution is on the workspace-federated roadmap.",
  );
}

async function pathExists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

// Operations that only touch the workspace-local derived layout (.ospec/...).
// These are identical across every mode, so both adapters share them.
function createDerivedSurface(workspace) {
  const resolveDerived = (relativePath) =>
    path.join(workspace, ...toRelativeSegments(relativePath));

  return {
    cacheRelativePath: DERIVED_LAYOUT.cache,
    latestSessionRelativePath: DERIVED_LAYOUT.latest,
    runtimeEventRelativePath: DERIVED_LAYOUT.runtimeEvents,
    cachePath: () => resolveDerived(DERIVED_LAYOUT.cache),
    latestSessionPath: () => resolveDerived(DERIVED_LAYOUT.latest),
    runtimeEventPath: () => resolveDerived(DERIVED_LAYOUT.runtimeEvents),
    sessionSummaryPath: (changeName) =>
      path.join(
        workspace,
        ...toRelativeSegments(DERIVED_LAYOUT.sessionDir),
        changeName,
        DERIVED_LAYOUT.sessionSummaryFile,
      ),
    appendRuntimeEvent: (event) =>
      ospec.appendRuntimeEvent({ workspace, ...event }),
  };
}

function createOpenSpecStore(workspace) {
  const derived = createDerivedSurface(workspace);
  const configPath = () =>
    path.join(workspace, ...toRelativeSegments(CANONICAL_LAYOUT.config));
  const changeDirectory = (changeName) =>
    path.join(
      workspace,
      ...toRelativeSegments(CANONICAL_LAYOUT.changesDir),
      changeName,
    );

  return {
    mode: "openspec",
    workspace,
    ...derived,
    configPath,
    changeDirectory,
    isInitialized: () => pathExists(configPath()),
    async readConfig() {
      try {
        return await fs.readFile(configPath(), "utf8");
      } catch (error) {
        if (error.code === "ENOENT") {
          return null;
        }

        throw error;
      }
    },
    async findActiveChanges() {
      const openspecRoot = await ospec.findOpenSpecRoot(workspace);
      return ospec.findActiveChanges(openspecRoot);
    },
    writeSessionSummary: (changeName, content) =>
      ospec.writeSessionSummary(changeDirectory(changeName), content),
  };
}

function createWorkspaceFederatedStore(workspace) {
  const derived = createDerivedSurface(workspace);
  const defer = (operation) => () =>
    Promise.reject(notImplemented("workspace-federated", operation));

  return {
    mode: "workspace-federated",
    workspace,
    ...derived,
    configPath: () => {
      throw notImplemented("workspace-federated", "configPath");
    },
    changeDirectory: () => {
      throw notImplemented("workspace-federated", "changeDirectory");
    },
    isInitialized: defer("isInitialized"),
    readConfig: defer("readConfig"),
    findActiveChanges: defer("findActiveChanges"),
    writeSessionSummary: defer("writeSessionSummary"),
  };
}

function createArtifactStore({
  mode = DEFAULT_ARTIFACT_STORE_MODE,
  workspace = process.cwd(),
} = {}) {
  if (!ARTIFACT_STORE_MODES.includes(mode)) {
    throw new Error(
      `Unknown artifact store mode "${mode}". ` +
        `Expected one of: ${ARTIFACT_STORE_MODES.join(", ")}.`,
    );
  }

  const resolvedWorkspace = path.resolve(workspace);

  if (mode === "workspace-federated") {
    return createWorkspaceFederatedStore(resolvedWorkspace);
  }

  return createOpenSpecStore(resolvedWorkspace);
}

module.exports = {
  ARTIFACT_STORE_MODES,
  ARTIFACT_STORE_RELATIVE_PATHS,
  DEFAULT_ARTIFACT_STORE_MODE,
  createArtifactStore,
};
