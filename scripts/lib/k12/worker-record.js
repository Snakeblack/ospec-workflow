"use strict";

// Recorded worker outputs for the Adaptive Repair pilot calibration with real
// agents. Each arm's agent works once in an isolated workspace under its arm's
// phase protocol; its patch, phase artifacts, and usage are recorded here, and
// the record replays through the same deterministic pipeline as the scripted
// pilot (reproduction, K4b integration, hidden checks, K6b verify, oracle).
// Recording once and replaying keeps the agent run out of the test suite while
// the judgment stays reproducible byte for byte.
//
// Measurement tooling only: it grants no authority and promotes nothing.

const { readFileSync } = require("node:fs");

const { PAIRED_ARMS, taskInterval } = require("./runner.js");

const WORKER_RECORD_SCHEMA_VERSION = 1;
const USAGE_FIELDS = Object.freeze(["tokens", "tool_uses", "duration_ms"]);

class WorkerRecordError extends Error {
  constructor(message, code = "INVALID_WORKER_RECORD") {
    super(message);
    this.name = "WorkerRecordError";
    this.code = code;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && [...keys].sort().every((key, index) => key === actual[index]);
}

function validateArmOutput(output, where) {
  if (!isPlainObject(output) || !hasExactKeys(output, ["patch", "artifacts", "usage"])) {
    return `${where} must declare exactly patch, artifacts, usage`;
  }
  if (typeof output.patch !== "string") return `${where} patch must be a string (empty when the agent changed nothing)`;
  if (!Array.isArray(output.artifacts) || !output.artifacts.every(isNonEmptyString)) {
    return `${where} artifacts must be a string array`;
  }
  if (!isPlainObject(output.usage) || !hasExactKeys(output.usage, USAGE_FIELDS)
    || !USAGE_FIELDS.every((field) => Number.isInteger(output.usage[field]) && output.usage[field] >= 0)) {
    return `${where} usage must declare non-negative integers ${USAGE_FIELDS.join(", ")}`;
  }
  return null;
}

/**
 * Validates a worker record against the cohort it replays on.
 * @param {object} record Parsed worker record.
 * @param {object} cohort A cohort from loadCohort.
 * @returns {object} The record, unchanged.
 * @throws {WorkerRecordError} When the record is malformed or names unknown fixtures.
 */
function validateWorkerRecord(record, cohort) {
  const fail = (message) => { throw new WorkerRecordError(message); };
  if (!isPlainObject(record) || !hasExactKeys(record, [
    "schema_version", "record_version", "recorded_at", "worker", "protocols", "outputs",
  ])) {
    fail("worker record must declare exactly schema_version, record_version, recorded_at, worker, protocols, outputs");
  }
  if (record.schema_version !== WORKER_RECORD_SCHEMA_VERSION) fail(`worker record schema_version must be ${WORKER_RECORD_SCHEMA_VERSION}`);
  if (!isNonEmptyString(record.record_version) || !isNonEmptyString(record.recorded_at)) {
    fail("record_version and recorded_at must be non-empty strings");
  }
  if (!isPlainObject(record.worker) || !hasExactKeys(record.worker, ["model", "effort", "host"])
    || !Object.values(record.worker).every(isNonEmptyString)) {
    fail("worker must declare model, effort, and host (a versioned worker is the point of the calibration)");
  }
  if (!isPlainObject(record.protocols) || !hasExactKeys(record.protocols, PAIRED_ARMS)
    || !PAIRED_ARMS.every((arm) => Array.isArray(record.protocols[arm]) && record.protocols[arm].length > 0
      && record.protocols[arm].every(isNonEmptyString))) {
    fail(`protocols must list the phases each arm's agent followed: ${PAIRED_ARMS.join(", ")}`);
  }
  if (!isPlainObject(record.outputs) || Object.keys(record.outputs).length === 0) fail("outputs must not be empty");
  const known = new Set(cohort.tasks.map((task) => task.fixture_id));
  for (const [fixtureId, entry] of Object.entries(record.outputs)) {
    if (!known.has(fixtureId)) fail(`outputs name a fixture outside the cohort: ${fixtureId}`);
    if (!isPlainObject(entry) || !hasExactKeys(entry, ["brief", "arms"]) || !isNonEmptyString(entry.brief)
      || !isPlainObject(entry.arms) || !hasExactKeys(entry.arms, PAIRED_ARMS)) {
      fail(`outputs.${fixtureId} must declare a brief and one output per arm (${PAIRED_ARMS.join(", ")})`);
    }
    for (const arm of PAIRED_ARMS) {
      const error = validateArmOutput(entry.arms[arm], `outputs.${fixtureId}.arms.${arm}`);
      if (error) fail(error);
    }
  }
  return record;
}

/** Loads and validates a worker record file. */
function loadWorkerRecord(recordPath, cohort) {
  let record;
  try {
    record = JSON.parse(readFileSync(recordPath, "utf8"));
  } catch (error) {
    throw new WorkerRecordError(`could not read worker record: ${error.message}`, "WORKER_RECORD_READ_FAILED");
  }
  return validateWorkerRecord(record, cohort);
}

/**
 * Narrows a cohort to the fixtures a worker record covers, keeping the catalog
 * digest so every manifest still binds the full versioned catalog.
 */
function recordCohort(cohort, record) {
  const covered = new Set(Object.keys(record.outputs));
  const tasks = cohort.tasks.filter((task) => covered.has(task.fixture_id));
  return Object.freeze({
    ...cohort,
    catalog: Object.freeze({ ...cohort.catalog, fixtures: cohort.catalog.fixtures.filter((fixture) => covered.has(fixture.fixture_id)) }),
    tasks: Object.freeze(tasks),
  });
}

/**
 * Per-task usage deltas (adaptive − fixed) with the task as the statistical unit.
 * @returns {{ tasks: number, totals: object, delta: object }}
 */
function summarizeWorkerUsage(record) {
  const entries = Object.values(record.outputs);
  const totals = Object.fromEntries(PAIRED_ARMS.map((arm) => [arm, Object.fromEntries(USAGE_FIELDS.map((field) => [
    field,
    entries.reduce((sum, entry) => sum + entry.arms[arm].usage[field], 0),
  ]))]));
  const delta = Object.fromEntries(USAGE_FIELDS.map((field) => [
    field,
    taskInterval(entries.map((entry) => entry.arms[PAIRED_ARMS[1]].usage[field] - entry.arms[PAIRED_ARMS[0]].usage[field])),
  ]));
  return { tasks: entries.length, totals, delta };
}

module.exports = {
  USAGE_FIELDS,
  WorkerRecordError,
  loadWorkerRecord,
  recordCohort,
  summarizeWorkerUsage,
  validateWorkerRecord,
};
