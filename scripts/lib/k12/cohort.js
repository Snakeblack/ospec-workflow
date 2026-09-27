"use strict";

const { readdirSync, statSync } = require("node:fs");
const { join, resolve, sep } = require("node:path");

const { catalogDigest, loadOracleCatalog } = require("./obligation-oracle.js");

const STRATA = Object.freeze([
  "local-reversible",
  "behavior-repair",
  "multi-module",
  "adversarial",
]);

class CohortError extends Error {
  constructor(message, code = "INVALID_COHORT") {
    super(message);
    this.name = "CohortError";
    this.code = code;
  }
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach((item) => deepFreeze(item));
    Object.freeze(value);
  }
  return value;
}

function cohortReject(message, code) {
  throw new CohortError(message, code);
}

function isTaskDirectoryName(fixtureId) {
  return typeof fixtureId === "string"
    && fixtureId !== ""
    && fixtureId !== "."
    && fixtureId !== ".."
    && !fixtureId.includes("/")
    && !fixtureId.includes("\\");
}

function readTaskDirectories(tasksDir) {
  let entries;
  try {
    entries = readdirSync(tasksDir, { withFileTypes: true });
  } catch (error) {
    cohortReject(`could not read tasks directory: ${error.message}`, "TASKS_DIRECTORY_READ_FAILED");
  }

  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

function hasTaskMarkdown(taskDir) {
  try {
    return statSync(join(taskDir, "task.md")).isFile();
  } catch {
    return false;
  }
}

/**
 * Loads a K12 catalog and its one-to-one task workspace cohort.
 *
 * @param {string} catalogPath Path to the oracle catalog JSON file.
 * @param {string} tasksDir Directory containing one task directory per fixture.
 * @returns {{ catalog: object, catalog_digest: string, tasks: object[], strata_coverage: object }}
 * @throws {CohortError} When task workspaces do not match the catalog.
 */
function loadCohort(catalogPath, tasksDir) {
  const catalog = loadOracleCatalog(catalogPath);
  if (catalog.fixtures.length === 0) cohortReject("cohort catalog must not be empty", "EMPTY_COHORT");

  const resolvedTasksDir = resolve(tasksDir);
  const taskDirectoryNames = readTaskDirectories(resolvedTasksDir);
  const catalogFixtureIds = new Set();

  for (const fixture of catalog.fixtures) {
    if (!isTaskDirectoryName(fixture.fixture_id)) {
      cohortReject(`fixture_id "${fixture.fixture_id}" cannot name a task directory`, "INVALID_FIXTURE_ID");
    }
    catalogFixtureIds.add(fixture.fixture_id);
  }

  const taskDirectoryIds = new Set(taskDirectoryNames);
  for (const fixtureId of catalogFixtureIds) {
    if (!taskDirectoryIds.has(fixtureId)) {
      cohortReject(`catalog fixture "${fixtureId}" is missing a task directory`, "TASK_DIRECTORY_MISSING");
    }
  }
  for (const fixtureId of taskDirectoryIds) {
    if (!catalogFixtureIds.has(fixtureId)) {
      cohortReject(`task directory "${fixtureId}" has no catalog fixture`, "CATALOG_FIXTURE_MISSING");
    }
  }

  const strataCoverage = Object.fromEntries(STRATA.map((stratum) => [stratum, 0]));
  const tasks = catalog.fixtures.map((fixture) => {
    const taskPath = resolve(resolvedTasksDir, fixture.fixture_id);
    if (!taskPath.startsWith(`${resolvedTasksDir}${sep}`)) {
      cohortReject(`task directory for fixture "${fixture.fixture_id}" escapes tasksDir`, "TASK_PATH_OUT_OF_SCOPE");
    }
    if (!hasTaskMarkdown(taskPath)) {
      cohortReject(`task directory for fixture "${fixture.fixture_id}" is missing task.md`, "TASK_MARKDOWN_MISSING");
    }
    strataCoverage[fixture.stratum] += 1;
    return {
      fixture_id: fixture.fixture_id,
      stratum: fixture.stratum,
      holdout_family: fixture.holdout_family,
      task_path: taskPath,
    };
  });

  return deepFreeze({
    catalog,
    catalog_digest: catalogDigest(catalog),
    tasks,
    strata_coverage: strataCoverage,
  });
}

/**
 * Validates minimum K12 seed cohort coverage without throwing.
 *
 * @param {object} cohort A cohort returned by loadCohort or a synthetic cohort.
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateCohortShape(cohort) {
  const errors = [];
  const fixtures = cohort && cohort.catalog && Array.isArray(cohort.catalog.fixtures)
    ? cohort.catalog.fixtures
    : null;

  if (!fixtures) return { valid: false, errors: ["cohort catalog fixtures must be an array"] };

  const counts = Object.fromEntries(STRATA.map((stratum) => [stratum, 0]));
  const holdoutFamilies = new Set();

  fixtures.forEach((fixture, index) => {
    if (!fixture || typeof fixture !== "object") {
      errors.push(`fixture at index ${index} must be an object`);
      return;
    }
    if (!STRATA.includes(fixture.stratum)) {
      errors.push(`fixture "${fixture.fixture_id || index}" has an invalid stratum`);
    } else {
      counts[fixture.stratum] += 1;
    }
    if (typeof fixture.holdout_family === "string" && fixture.holdout_family.trim() !== "") {
      holdoutFamilies.add(fixture.holdout_family);
    }
    if (!Array.isArray(fixture.obligations)
      || !fixture.obligations.some((obligation) => obligation && obligation.criticality === "must")) {
      errors.push(`fixture "${fixture.fixture_id || index}" must have at least one must obligation`);
    }
  });

  for (const stratum of STRATA) {
    if (counts[stratum] === 0) errors.push(`stratum "${stratum}" is missing`);
    if (counts[stratum] < 2) errors.push(`stratum "${stratum}" must contain at least 2 fixtures`);
  }
  if (holdoutFamilies.size < 3) errors.push("cohort must contain at least 3 distinct holdout families");

  return { valid: errors.length === 0, errors };
}

module.exports = {
  CohortError,
  loadCohort,
  validateCohortShape,
};
