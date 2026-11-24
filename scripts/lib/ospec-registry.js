"use strict";

// `ospec registry` (openspec/specs/skill-registry/spec.md §6): builds the
// skill registry cache with the builder the SessionStart hook uses, so a
// project gets the same cache when the hook did not run. It also says which
// entries give a delegation nothing to work with.

const os = require("node:os");
const path = require("node:path");

const { createArtifactStoreFromConfig } = require("./artifact-store.js");
const { refreshRegistryCache, registryGaps, resolveSkillsRoot } = require("./skill-registry.js");

const GAP_LINES = Object.freeze({
  rules: "no rules for sub-agents",
  trigger: "matched by name only",
});

class RegistryError extends Error {
  constructor(message) {
    super(message);
    this.name = "RegistryError";
    this.code = "registry-skills-missing";
  }
}

async function runRegistry({
  root,
  pluginRoot = path.resolve(__dirname, "../.."),
  // The CLI has no host flag: the installed path alone tells a global Codex
  // install, as resolveSkillsRoot checks.
  target = process.env.OSPEC_TARGET || "codex",
  homeDir = os.homedir(),
  codexHome = process.env.CODEX_HOME,
  now,
} = {}) {
  const store = await createArtifactStoreFromConfig({ workspace: root });
  if (!(await store.isInitialized())) {
    return { status: "skipped", path: store.cacheRelativePath, reason: "openspec-not-initialized" };
  }

  let refreshed;
  try {
    refreshed = await refreshRegistryCache({
      cachePath: store.cachePath(),
      pluginRoot,
      skillsRoot: resolveSkillsRoot({ pluginRoot, target, homeDir, codexHome }),
      ...(now ? { now } : {}),
      describeWorkspace: () => store.describeWorkspace(),
    });
  } catch (error) {
    if (/^No (?:SKILL\.md files|OSpec identity anchors) found/.test(error.message)) throw new RegistryError(error.message);
    throw error;
  }

  const warnings = registryGaps(refreshed.skills);
  return {
    status: refreshed.status,
    path: store.cacheRelativePath,
    skills: refreshed.skills.length,
    with_rules: refreshed.skills.filter((skill) => skill.compact_rules.length > 0).length,
    ...(warnings.length > 0 ? { warnings } : {}),
  };
}

function renderRegistry(result) {
  if (result.status === "skipped") {
    return [
      "registry: skipped (OpenSpec is not initialized in this project)",
      "IDD does not use the skill registry; it serves SDD delegations, and sdd-init sets up OpenSpec",
    ].join("\n");
  }
  const lines = [`registry: ${result.status} (${result.path})`, `skills: ${result.skills}, ${result.with_rules} with rules`];
  for (const [gap, label] of Object.entries(GAP_LINES)) {
    const ids = (result.warnings || []).filter((warning) => warning.missing.includes(gap)).map((warning) => warning.id);
    if (ids.length > 0) lines.push(`${label}: ${ids.join(", ")}`);
  }
  return lines.join("\n");
}

module.exports = { RegistryError, renderRegistry, runRegistry };
