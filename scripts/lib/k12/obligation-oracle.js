"use strict";

const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");

const STRATA = new Set(["local-reversible", "behavior-repair", "multi-module", "adversarial"]);
const CRITICALITIES = new Set(["must", "should", "may"]);

class ObligationOracleError extends Error {
  constructor(message, code = "INVALID_CATALOG") {
    super(message);
    this.name = "ObligationOracleError";
    this.code = code;
  }
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function reject(message, code) {
  throw new ObligationOracleError(message, code);
}

function requireOnlyKnownKeys(value, allowedKeys, context) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) reject(`${context} contains unknown field "${key}"`);
  }
}

function validateStringArray(value, context) {
  if (!Array.isArray(value) || value.some((entry) => !isNonEmptyString(entry))) {
    reject(`${context} must be an array of non-empty strings`);
  }
}

function validateObligation(obligation, fixtureId, index) {
  const context = `fixture "${fixtureId}" obligation at index ${index}`;
  if (!isPlainObject(obligation)) reject(`${context} must be an object`);
  requireOnlyKnownKeys(obligation, new Set(["id", "criticality", "required_evidence", "note"]), context);
  if (!isNonEmptyString(obligation.id)) reject(`${context} id is required`);
  if (!CRITICALITIES.has(obligation.criticality)) {
    reject(`${context} criticality must be must, should, or may`);
  }
  if (obligation.required_evidence !== undefined) {
    validateStringArray(obligation.required_evidence, `${context} required_evidence`);
  }
  if (obligation.note !== undefined && typeof obligation.note !== "string") {
    reject(`${context} note must be a string`);
  }
}

function validateFixture(fixture, index) {
  const context = `fixture at index ${index}`;
  if (!isPlainObject(fixture)) reject(`${context} must be an object`);
  requireOnlyKnownKeys(
    fixture,
    new Set(["fixture_id", "stratum", "holdout_family", "obligations"]),
    context,
  );
  if (!isNonEmptyString(fixture.fixture_id)) reject(`${context} fixture_id is required`);
  if (!STRATA.has(fixture.stratum)) reject(`${context} has an invalid stratum`);
  if (fixture.holdout_family !== undefined && !isNonEmptyString(fixture.holdout_family)) {
    reject(`${context} holdout_family must be a non-empty string`);
  }
  if (!Array.isArray(fixture.obligations)) reject(`${context} obligations must be an array`);

  const obligationIds = new Set();
  fixture.obligations.forEach((obligation, obligationIndex) => {
    validateObligation(obligation, fixture.fixture_id, obligationIndex);
    if (obligationIds.has(obligation.id)) {
      reject(`fixture "${fixture.fixture_id}" has duplicate obligation id "${obligation.id}"`);
    }
    obligationIds.add(obligation.id);
  });
}

function validateCatalog(catalog) {
  if (!isPlainObject(catalog)) reject("catalog must be an object");
  requireOnlyKnownKeys(catalog, new Set(["schema_version", "catalog_version", "fixtures"]), "catalog");
  if (catalog.schema_version !== 1) reject("catalog schema_version must be 1", "UNKNOWN_SCHEMA_VERSION");
  if (!isNonEmptyString(catalog.catalog_version)) reject("catalog catalog_version must be a non-empty string");
  if (!Array.isArray(catalog.fixtures)) reject("catalog fixtures must be an array");

  const fixtureIds = new Set();
  catalog.fixtures.forEach((fixture, index) => {
    validateFixture(fixture, index);
    if (fixtureIds.has(fixture.fixture_id)) {
      reject(`catalog has duplicate fixture_id "${fixture.fixture_id}"`);
    }
    fixtureIds.add(fixture.fixture_id);
  });

  return catalog;
}

function parseCatalogFile(filePath) {
  if (!isNonEmptyString(filePath)) reject("catalog file path must be a non-empty string");

  let contents;
  try {
    contents = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new ObligationOracleError(`could not read catalog file: ${error.message}`, "CATALOG_READ_FAILED");
  }

  try {
    return JSON.parse(contents);
  } catch (error) {
    throw new ObligationOracleError(`could not parse catalog file: ${error.message}`, "CATALOG_PARSE_FAILED");
  }
}

/**
 * Loads and validates the independent, versioned K12 obligations catalog.
 *
 * @param {object|string} source Catalog object or JSON catalog file path.
 * @returns {object} The validated catalog.
 * @throws {ObligationOracleError} When the catalog is malformed or unsupported.
 */
function loadOracleCatalog(source) {
  const catalog = typeof source === "string" ? parseCatalogFile(source) : source;
  return validateCatalog(catalog);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Produces a content-stable digest for a validated K12 catalog.
 *
 * @param {object} catalog K12 obligations catalog.
 * @returns {string} Lowercase hexadecimal SHA-256 digest.
 */
function catalogDigest(catalog) {
  return createHash("sha256").update(canonicalJson(loadOracleCatalog(catalog))).digest("hex");
}

function validateCatalogFixture(catalogFixture) {
  validateFixture(catalogFixture, 0);
  return catalogFixture;
}

function observedObligations(observed) {
  if (Array.isArray(observed)) return observed;
  if (isPlainObject(observed) && Array.isArray(observed.obligations)) return observed.obligations;
  throw new TypeError("observed must be an obligation array or an object with an obligations array");
}

/**
 * Compares catalog obligations with the executor-declared manifest obligations.
 * Observed criticality is informational and does not affect matching.
 *
 * @param {object} catalogFixture Validated catalog fixture.
 * @param {{ obligations: object[] }|object[]} observed Executor-observed obligations.
 * @returns {{ fixture_id: string, expected_count: number, observed_count: number, matched: string[], missing: object[], unexpected: string[], missing_must: boolean, verdict: "pass"|"fail" }}
 */
function compareObligations(catalogFixture, observed) {
  const fixture = validateCatalogFixture(catalogFixture);
  const observedEntries = observedObligations(observed);
  const observedIds = new Set(
    observedEntries
      .filter((entry) => isPlainObject(entry) && typeof entry.id === "string")
      .map((entry) => entry.id),
  );
  const expectedIds = new Set(fixture.obligations.map((obligation) => obligation.id));
  const matched = fixture.obligations
    .filter((obligation) => observedIds.has(obligation.id))
    .map((obligation) => obligation.id);
  const missing = fixture.obligations
    .filter((obligation) => !observedIds.has(obligation.id))
    .map((obligation) => ({
      id: obligation.id,
      criticality: obligation.criticality,
      required_evidence: obligation.required_evidence || [],
    }));
  const unexpected = [...new Set(
    observedEntries
      .filter((entry) => isPlainObject(entry) && typeof entry.id === "string" && !expectedIds.has(entry.id))
      .map((entry) => entry.id),
  )];
  const missingMust = missing.some((obligation) => obligation.criticality === "must");

  return {
    fixture_id: fixture.fixture_id,
    expected_count: fixture.obligations.length,
    observed_count: observedEntries.length,
    matched,
    missing,
    unexpected,
    missing_must: missingMust,
    verdict: missingMust ? "fail" : "pass",
  };
}

module.exports = {
  ObligationOracleError,
  catalogDigest,
  compareObligations,
  loadOracleCatalog,
};
