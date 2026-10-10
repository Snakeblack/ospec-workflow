"use strict";

// Decision-record lint (openspec/specs/decision-records/spec.md,
// REQ-decision-records-001 to REQ-decision-records-005). The schema decides
// shape. A warning does not reject the record. This require puts the schema
// on the runtime graph so an installed CLI can read it from disk.

require("../../schemas/foundation/decision-records/v1.schema.json");

const fs = require("node:fs");
const path = require("node:path");
const { validateInstance } = require("./kernel-schema-validator.js");

const RECORD_DIR = path.resolve(__dirname, "../../schemas/foundation/decision-records");
const DATE = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

function loadSchema() {
  return JSON.parse(fs.readFileSync(path.join(RECORD_DIR, "v1.schema.json"), "utf8"));
}

function structuralResult(record) {
  const schema = loadSchema();
  const structural = validateInstance(schema, record);
  if (structural.valid) return structural;
  const kind = record && typeof record === "object" ? record.kind : undefined;
  const branch = kind && schema.$defs ? schema.$defs[kind] : undefined;
  if (!branch) return structural;
  const explained = validateInstance(branch, record, { rootSchema: schema });
  return { valid: false, errors: explained.errors };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Whole phrase, case-insensitive. "Go" matches "go", not "goal" or "algorithm".
function stackHits(decision, stack) {
  if (typeof decision !== "string" || !Array.isArray(stack)) return [];
  const hits = [];
  for (const entry of stack) {
    if (typeof entry !== "string") continue;
    const name = entry.trim();
    if (name === "") continue;
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(name)}(?![\\p{L}\\p{N}_])`, "iu");
    if (pattern.test(decision)) hits.push(name);
  }
  return hits;
}

function hasDatedSource(sources) {
  return Array.isArray(sources) && sources.some((source) => source && DATE.test(source.date || ""));
}

function warning(code, message) {
  return { code, message };
}

function lintDecisionRecord(record, options = {}) {
  const structural = structuralResult(record);
  if (!structural.valid) return { valid: false, errors: structural.errors, warnings: [] };
  const warnings = [];
  const classifiedAs = record.as || record.kind;
  if (record.kind === "dc" && classifiedAs === "adr") {
    warnings.push(warning("misclassified-development-decision", "a development decision (kind dc) is classified as an ADR"));
  }
  if (record.kind === "adr") {
    if (record.drivers.length === 0) {
      warnings.push(warning("missing-driver", "an ADR cites no quality scenario, constraint or assumption"));
    }
    const stack = Object.prototype.hasOwnProperty.call(options, "stack") ? options.stack : record.stack;
    const hits = stackHits(record.decision, stack);
    if (hits.length > 0) {
      warnings.push(warning("technology-in-decision", `the Decision section names ${hits.join(", ")}`));
    }
  }
  if (record.kind === "tsr") {
    if (record.implements.length === 0) {
      warnings.push(warning("missing-adr", "a TSR implements no ADR"));
    }
    if (!hasDatedSource(record.sources)) {
      warnings.push(warning("missing-dated-source", "a TSR has no dated source"));
    }
  }
  return { valid: true, errors: [], warnings };
}

module.exports = {
  lintDecisionRecord,
  loadSchema,
};
