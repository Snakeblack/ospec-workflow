"use strict";

// Decision-record lint (openspec/specs/decision-records/spec.md,
// REQ-decision-records-001 to REQ-decision-records-006). The schema decides
// shape. A warning does not reject the record; unresolved evidence does. This require puts the schema
// on the runtime graph so an installed CLI can read it from disk.

require("../../schemas/foundation/decision-records/v1.schema.json");

const fs = require("node:fs");
const path = require("node:path");
const { validateInstance } = require("./kernel-schema-validator.js");
const { evidenceErrors } = require("./repository-evidence.js");

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
  // With a repository root, every path:line must exist there (REQ-decision-records-006).
  if (options.root !== undefined) {
    const unresolved = evidenceErrors(options.root, record.evidence, "/evidence");
    if (unresolved.length > 0) return { valid: false, errors: unresolved, warnings: [] };
  }
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

// The Markdown ADR of the foundation template (REQ-decision-records-007).
// Parsing is lenient: a missing part stays absent and the schema rejects it.
const SECTIONS = {
  "context and drivers": "context_and_drivers",
  "options considered": "options",
  decision: "decision",
  consequences: "consequences",
  "fitness function": "fitness_function",
  "review trigger": "review_trigger",
};
const DRIVER = /`(scenario|constraint|assumption):([a-z][a-z0-9.-]{0,63})`/g;

function prose(lines) {
  return lines.map((line) => line.trim()).filter((line) => line !== "").join(" ");
}

function listItems(lines) {
  const items = [];
  for (const line of lines) {
    const item = /^\s*[0-9]+\.\s+(.*)$/.exec(line);
    if (item) items.push([item[1]]);
    else if (items.length > 0) items[items.length - 1].push(line);
  }
  return items.map(prose).filter((item) => item !== "");
}

function parseAdrMarkdown(text, options = {}) {
  const record = { schema: "ospec-decision-record/v1", kind: "adr" };
  const sections = {};
  let current = null;
  for (const line of String(text).split(/\r?\n/)) {
    const heading = /^#\s+([0-9]{4})\.\s+(.+?)\s*$/.exec(line);
    if (heading && record.id === undefined) {
      record.id = heading[1];
      record.title = heading[2];
      continue;
    }
    const section = /^##\s+(.+?)\s*$/.exec(line);
    if (section) {
      current = SECTIONS[section[1].toLowerCase()] || null;
      if (current) sections[current] = [];
      continue;
    }
    if (current) {
      sections[current].push(line);
      continue;
    }
    const field = /^-\s+(Status|Date|Evidence):\s*(.*?)\s*$/i.exec(line);
    if (!field) continue;
    const name = field[1].toLowerCase();
    if (name === "status") record.status = field[2].replace(/^superseded\b.*$/i, "superseded").toLowerCase();
    if (name === "date") record.date = field[2];
    if (name === "evidence") record.evidence = field[2].split(",").map((ref) => ref.trim()).filter((ref) => ref !== "");
  }
  for (const [key, lines] of Object.entries(sections)) {
    record[key] = key === "options" ? listItems(lines) : prose(lines);
  }
  const seen = new Set();
  record.drivers = [];
  for (const match of String(record.context_and_drivers || "").matchAll(DRIVER)) {
    const key = `${match[1]}:${match[2]}`;
    if (seen.has(key)) continue;
    seen.add(key);
    record.drivers.push({ kind: match[1], id: match[2] });
  }
  record.stack = Array.isArray(options.stack) ? [...options.stack] : [];
  for (const key of Object.keys(record)) {
    if (record[key] === "") delete record[key];
  }
  return record;
}

module.exports = {
  lintDecisionRecord,
  parseAdrMarkdown,
  loadSchema,
};
