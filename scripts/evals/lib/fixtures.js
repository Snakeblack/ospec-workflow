"use strict";

const fs = require("node:fs");
const path = require("node:path");

const REQUIRED_MANIFEST_FIELDS = ["id", "group", "input", "capture", "expect"];

/**
 * Reads and parses a scenario's `scenario.json` manifest, validating that the
 * required top-level fields (per design.md's Interfaces/Contracts manifest
 * shape) are present. Throws a descriptive Error (never a bare JSON.parse
 * failure) so a missing/invalid fixture fails loudly with a fixable next
 * step, instead of surfacing an opaque stack trace.
 *
 * @param {string} scenarioDir - absolute or relative path to a
 *   `scripts/evals/__fixtures__/<scenario>/` directory
 * @returns {object} the parsed manifest
 */
function loadScenario(scenarioDir) {
  const manifestPath = path.join(scenarioDir, "scenario.json");
  let raw;

  try {
    raw = fs.readFileSync(manifestPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error(
        `Scenario manifest not found at ${manifestPath}. Every fixture under ` +
          `scripts/evals/__fixtures__/ must have a scenario.json — see ` +
          `scripts/evals/README.md for the manifest shape.`,
      );
    }

    throw error;
  }

  let manifest;

  try {
    manifest = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Scenario manifest at ${manifestPath} is not valid JSON: ${error.message}`,
    );
  }

  const missing = REQUIRED_MANIFEST_FIELDS.filter(
    (field) => !(field in manifest),
  );

  if (missing.length > 0) {
    throw new Error(
      `Scenario manifest at ${manifestPath} is missing required field(s): ` +
        `${missing.join(", ")}. Required fields: ${REQUIRED_MANIFEST_FIELDS.join(", ")}.`,
    );
  }

  return manifest;
}

/**
 * Copies a scenario's `repo/` seed tree into an isolated
 * `<runsRoot>/<scenario-name>/` workspace, discarding any previous contents
 * of that workspace first so repeated `setup` calls always start clean.
 *
 * @param {string} scenarioDir - `scripts/evals/__fixtures__/<scenario>/`
 * @param {string} runsRoot - root directory for ephemeral run workspaces
 *   (e.g. `scripts/evals/.runs/`)
 * @returns {{ scenarioName: string, workspaceRoot: string }}
 */
function materializeFixture(scenarioDir, runsRoot) {
  const resolvedScenarioDir = path.resolve(scenarioDir);
  const scenarioName = path.basename(resolvedScenarioDir);
  const sourceRepo = path.join(resolvedScenarioDir, "repo");

  if (!fs.existsSync(sourceRepo)) {
    throw new Error(
      `Fixture scenario "${scenarioName}" is missing its repo/ seed tree at ` +
        `${sourceRepo}. Every scenario directory must contain both scenario.json ` +
        `and a repo/ tree.`,
    );
  }

  const workspaceRoot = path.join(path.resolve(runsRoot), scenarioName);

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.cpSync(sourceRepo, workspaceRoot, { recursive: true });

  return { scenarioName, workspaceRoot };
}

/**
 * Removes an entire runs root (all materialized workspaces under it).
 *
 * @param {string} runsRoot
 */
function teardown(runsRoot) {
  fs.rmSync(path.resolve(runsRoot), { recursive: true, force: true });
}

// ─── Materialization completion marker ──────────────────────────────────────
//
// `materializeFixture` (above) can be interrupted partway through its
// rmSync/mkdirSync/cpSync sequence (disk full, EACCES mid-copy), and a
// caller-side follow-up step (e.g. run.js's applyGitBaseline, which consumes
// a workspace AFTER materializeFixture returns) can itself throw partway
// through its own git init/commit sequence. Either failure mode leaves a
// workspace directory that `fs.existsSync` sees as "present" even though it
// is only half-built or half-baselined. A completion marker — written ONLY
// once every step of setup has fully succeeded — lets callers tell "present"
// apart from "actually ready to reuse", mirroring the existing
// `.eval-capture/done.json` convention this suite already uses for a live
// turn's own completion signal.

const MATERIALIZED_MARKER_REL_PATH = path.join(".eval-capture", "materialized.json");

/**
 * Marks a workspace as fully, successfully materialized. Callers MUST only
 * call this after every step of setup for that workspace has succeeded
 * (fixture copy, plus any post-processing such as a git baseline) — never
 * before, and never on a path that might still fail.
 *
 * @param {string} workspaceRoot
 */
function markMaterialized(workspaceRoot) {
  const markerPath = path.join(workspaceRoot, MATERIALIZED_MARKER_REL_PATH);
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(
    markerPath,
    JSON.stringify({ materialized_at: new Date().toISOString() }, null, 2),
  );
}

/**
 * Reports whether a workspace has a completed materialization marker. A
 * workspace directory that exists but was never (or not yet fully) marked —
 * e.g. a half-copied fixture or one whose git baseline step threw partway —
 * MUST read as `false` here, so callers do not silently reuse corrupt state.
 *
 * @param {string} workspaceRoot
 * @returns {boolean}
 */
function isMaterialized(workspaceRoot) {
  return fs.existsSync(path.join(workspaceRoot, MATERIALIZED_MARKER_REL_PATH));
}

module.exports = {
  loadScenario,
  materializeFixture,
  teardown,
  markMaterialized,
  isMaterialized,
  MATERIALIZED_MARKER_REL_PATH,
};
