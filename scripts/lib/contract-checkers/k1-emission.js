"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CHECKER = "k1-emission";
const CATALOG_REL = "scripts/lib/emission-catalogs/k1-emitted.json";
const CLAIMS_REL = "schemas/kernel/emission-claims.json";
const CATALOG_KEYS = new Set(["schema_version", "sources"]);

const CLASSIFICATION_PROBES = Object.freeze([
  Object.freeze({
    impact: Object.freeze({ localized_reproducible_bug: true }),
    uncertainty: Object.freeze({ requirements: "known" }),
    execution: Object.freeze({ mode: "fixed" }),
  }),
]);

// Security boundary: only code-owned observers belong here. The JSON catalog
// selects an id from this closed registry; it never supplies module paths,
// exports, functions, probes, or arguments.
const SOURCE_REGISTRY = Object.freeze({
  "change-classification": Object.freeze({
    observe() {
      const { classifyChange } = require("../change-classification.js");
      return CLASSIFICATION_PROBES.map((probe) =>
        classifyChange({
          impact: { ...probe.impact },
          uncertainty: { ...probe.uncertainty },
          execution: { ...probe.execution },
        })
      );
    },
  }),
});

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function offender(relativePath, expected, actual, message) {
  return { checker: CHECKER, path: toPosix(relativePath), expected, actual, message };
}

function readJson(root, relativePath, offenders) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
  } catch (err) {
    offenders.push(
      offender(
        relativePath,
        "readable JSON contract",
        err.message,
        `${relativePath} could not be read: ${err.message}`
      )
    );
    return null;
  }
}

function escapePointerToken(token) {
  return token.replace(/~/g, "~0").replace(/\//g, "~1");
}

function collectObserved(value, pointer, paths, commands, seen = new Set()) {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) throw new Error("builder output must not contain cycles");
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) collectObserved(item, `${pointer}/*`, paths, commands, seen);
    seen.delete(value);
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPointer = `${pointer}/${escapePointerToken(key)}`;
    paths.add(childPointer);
    if (key === "command" && typeof child === "string" && child.trim() !== "") {
      commands.add(child);
    }
    collectObserved(child, childPointer, paths, commands, seen);
  }
  seen.delete(value);
}

function validateCatalog(catalog, offenders) {
  if (!isRecord(catalog)) {
    offenders.push(offender(CATALOG_REL, "catalog object", typeof catalog, `${CATALOG_REL} must contain an object`));
    return null;
  }

  let valid = true;
  if (catalog.schema_version !== 1) {
    valid = false;
    offenders.push(
      offender(
        CATALOG_REL,
        "schema_version integer 1",
        JSON.stringify(catalog.schema_version),
        `${CATALOG_REL} schema_version must be integer 1`
      )
    );
  }
  for (const key of Object.keys(catalog)) {
    if (!CATALOG_KEYS.has(key)) {
      valid = false;
      offenders.push(
        offender(
          CATALOG_REL,
          "only schema_version and allowlisted source ids",
          key,
          `${CATALOG_REL} must not self-declare ${key}; builders and probes are code-owned`
        )
      );
    }
  }
  if (!Array.isArray(catalog.sources) || catalog.sources.length === 0) {
    offenders.push(
      offender(CATALOG_REL, "non-empty sources array", JSON.stringify(catalog.sources), `${CATALOG_REL} requires at least one allowlisted source id`)
    );
    return null;
  }

  const sourceIds = [];
  const seen = new Set();
  for (let index = 0; index < catalog.sources.length; index += 1) {
    const sourceId = catalog.sources[index];
    const sourcePath = `${CATALOG_REL}#sources/${index}`;
    if (typeof sourceId !== "string" || sourceId.trim() === "") {
      valid = false;
      offenders.push(
        offender(
          sourcePath,
          "non-empty allowlisted source id string",
          JSON.stringify(sourceId),
          `${sourcePath} must be an allowlisted source id string; declarative source objects are forbidden`
        )
      );
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(SOURCE_REGISTRY, sourceId)) {
      valid = false;
      offenders.push(
        offender(sourcePath, "source id in code-owned allowlist", sourceId, `${sourcePath} source id ${sourceId} is not allowlisted`)
      );
      continue;
    }
    if (seen.has(sourceId)) {
      valid = false;
      offenders.push(offender(sourcePath, "unique source id", sourceId, `${sourcePath} duplicates source id ${sourceId}`));
      continue;
    }
    seen.add(sourceId);
    sourceIds.push(sourceId);
  }

  // Validate the complete catalog before loading or invoking any observer.
  return valid ? sourceIds : null;
}

function observeAllowlistedSources(sourceIds, offenders) {
  const observations = new Map();
  if (sourceIds === null) return observations;

  for (const sourceId of sourceIds) {
    const observed = { paths: new Set(), commands: new Set() };
    observations.set(sourceId, observed);
    try {
      const outputs = SOURCE_REGISTRY[sourceId].observe();
      if (!Array.isArray(outputs) || outputs.length === 0) {
        throw new Error("allowlisted observer must return a non-empty output array");
      }
      for (const output of outputs) {
        if (!isRecord(output) && !Array.isArray(output)) {
          throw new Error("allowlisted observer output must be an object or array");
        }
        collectObserved(output, "", observed.paths, observed.commands);
      }
    } catch (err) {
      offenders.push(
        offender(
          CATALOG_REL,
          `successful code-owned observer ${sourceId}`,
          err.message,
          `allowlisted emission source ${sourceId} failed: ${err.message}`
        )
      );
    }
  }
  return observations;
}

function validateClaims(claims, observations, offenders) {
  if (!isRecord(claims)) {
    offenders.push(offender(CLAIMS_REL, "claims object", typeof claims, `${CLAIMS_REL} must contain an object`));
    return;
  }
  if (claims.schema_version !== 1) {
    offenders.push(
      offender(CLAIMS_REL, "schema_version integer 1", JSON.stringify(claims.schema_version), `${CLAIMS_REL} schema_version must be integer 1`)
    );
  }

  for (const key of ["claimed_fields", "claimed_commands"]) {
    if (!Array.isArray(claims[key])) {
      offenders.push(offender(CLAIMS_REL, `${key} array`, JSON.stringify(claims[key]), `${CLAIMS_REL} ${key} must be an array`));
    }
  }

  const fields = Array.isArray(claims.claimed_fields) ? claims.claimed_fields : [];
  for (let index = 0; index < fields.length; index += 1) {
    const claim = fields[index];
    const claimPath = `${CLAIMS_REL}#claimed_fields/${index}`;
    if (!isRecord(claim) || typeof claim.source !== "string" || typeof claim.path !== "string" || !/^\/(?:[^/]+(?:\/[^/]+)*)?$/.test(claim.path)) {
      offenders.push(offender(claimPath, "{source, path} with JSON Pointer path", JSON.stringify(claim), `${claimPath} has an invalid field claim shape`));
      continue;
    }
    const observed = observations.get(claim.source);
    if (!observed || !observed.paths.has(claim.path)) {
      offenders.push(
        offender(claimPath, `field ${claim.path} observed from source ${claim.source}`, "not observed", `claimed emitted field ${claim.path} was not produced by source ${claim.source}`)
      );
    }
  }

  const commands = Array.isArray(claims.claimed_commands) ? claims.claimed_commands : [];
  for (let index = 0; index < commands.length; index += 1) {
    const claim = commands[index];
    const claimPath = `${CLAIMS_REL}#claimed_commands/${index}`;
    if (!isRecord(claim) || typeof claim.source !== "string" || typeof claim.command !== "string" || claim.command.trim() === "") {
      offenders.push(offender(claimPath, "{source, command} with non-empty strings", JSON.stringify(claim), `${claimPath} has an invalid command claim shape`));
      continue;
    }
    const observed = observations.get(claim.source);
    if (!observed || !observed.commands.has(claim.command)) {
      offenders.push(
        offender(claimPath, `command observed from source ${claim.source}`, "not observed", `claimed emitted command "${claim.command}" was not produced by source ${claim.source}`)
      );
    }
  }
}

/**
 * REQ-contract-lint-009: every emission claim must be observed from a
 * code-owned pure builder. The catalog can only enable allowlisted ids; an
 * invalid entry aborts observation before any module is loaded or invoked.
 *
 * @param {{root: string}} ctx
 */
function check(ctx) {
  const root = path.resolve(ctx.root);
  const offenders = [];
  const catalog = readJson(root, CATALOG_REL, offenders);
  const claims = readJson(root, CLAIMS_REL, offenders);
  if (catalog === null || claims === null) return offenders;

  const sourceIds = validateCatalog(catalog, offenders);
  const observations = observeAllowlistedSources(sourceIds, offenders);
  validateClaims(claims, observations, offenders);
  return offenders;
}

module.exports = {
  check,
  collectObserved,
  observeAllowlistedSources,
  validateCatalog,
  SOURCE_REGISTRY,
  toPosix,
};
