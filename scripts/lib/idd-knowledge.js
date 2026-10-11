"use strict";

// Knowledge by reference for IDD changes (openspec/specs/idd/spec.md,
// REQ-idd-021). A v2 component map gives each component the paths it owns and
// the ids of the knowledge that governs it: ADRs, quality scenarios, glossary
// terms and knowledge-map slots as constraints. A change receives the ids of
// the components it touches, never the documents, each with its currency:
// current, stale or absent. Only current ADRs and scenarios feed the
// architecture signal; a stale or absent reference is a warning. Pure:
// idd-workspace.js reads the map and the sources.

const { DECISIONS_ROOT } = require("./idd-contract.js");
const { MAP_RELATIVE } = require("./decision-gap.js");
const { globToRegExp, normalizePath } = require("./idd-impact.js");

const COMPONENT_MAP_RELATIVE = "docs/architecture/component-map.yaml";
const GLOSSARY_RELATIVE = "docs/product/glossary.md";
const KINDS = Object.freeze(["adr", "scenario", "term", "constraint"]);
const LIST_BY_KIND = Object.freeze({ adr: "adrs", scenario: "scenarios", term: "terms", constraint: "constraints" });
const LABELS = Object.freeze({ adr: "ADR", scenario: "quality scenario", term: "term", constraint: "constraint" });
const CURRENT_SLOT_STATES = Object.freeze(["confirmed", "n/a"]);

function componentPaths(component) {
  return (component.paths || []).map((glob) => globToRegExp(glob));
}

/** The ids of the components of a v2 map whose paths match any of `paths`, sorted. */
function touchedComponents(map, paths) {
  if (map?.schema !== "ospec-component-map/v2") return [];
  const files = [...new Set((paths || []).map(normalizePath))];
  return map.components
    .filter((component) => {
      const globs = componentPaths(component);
      return files.some((file) => globs.some((glob) => glob.test(file)));
    })
    .map((component) => component.id)
    .sort();
}

function currency(kind, id, sources) {
  if (kind === "adr") {
    const adr = sources.adrs?.get(id);
    if (!adr) return { status: "absent", reason: `no ADR ${id} under ${DECISIONS_ROOT}/` };
    if (adr.status === "superseded") return { status: "stale", path: adr.path, reason: `ADR ${id} is superseded` };
    if (adr.evidence?.length) return { status: "stale", path: adr.path, reason: `its evidence no longer resolves: ${adr.evidence.join("; ")}` };
    return { status: "current", path: adr.path };
  }
  if (kind === "scenario") {
    return sources.scenarios?.has(id)
      ? { status: "current", path: MAP_RELATIVE }
      : { status: "absent", reason: `no quality scenario ${id} in ${MAP_RELATIVE}` };
  }
  if (kind === "term") {
    if (!sources.terms) return { status: "absent", reason: `${GLOSSARY_RELATIVE} does not exist` };
    return sources.terms.has(id.trim().toLowerCase())
      ? { status: "current", path: GLOSSARY_RELATIVE }
      : { status: "absent", reason: `no term ${id} in ${GLOSSARY_RELATIVE}` };
  }
  const state = sources.slots?.get(id);
  if (state === undefined) return { status: "absent", reason: `no slot ${id} in ${MAP_RELATIVE}` };
  if (CURRENT_SLOT_STATES.includes(state)) return { status: "current", path: MAP_RELATIVE };
  if (state === "assumed") return { status: "stale", path: MAP_RELATIVE, reason: `slot ${id} is assumed, not confirmed` };
  return { status: "absent", path: MAP_RELATIVE, reason: `slot ${id} is ${state}` };
}

/**
 * @param {{map: object|null, paths: string[], sources: {adrs?: Map, scenarios?: Set, terms?: Set|null, slots?: Map}}} input
 * @returns {{references: object[], warnings: string[]}} references sorted by kind then id
 */
function resolveReferences({ map, paths, sources }) {
  const touched = new Set(touchedComponents(map, paths));
  const byKey = new Map();
  for (const component of touched.size ? map.components : []) {
    if (!touched.has(component.id)) continue;
    for (const kind of KINDS) {
      for (const id of component.knowledge?.[LIST_BY_KIND[kind]] || []) {
        const key = `${kind}:${id}`;
        if (!byKey.has(key)) byKey.set(key, { kind, id, components: [] });
        byKey.get(key).components.push(component.id);
      }
    }
  }
  const references = [...byKey.values()]
    .sort((left, right) => KINDS.indexOf(left.kind) - KINDS.indexOf(right.kind) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .map((ref) => {
      const { status, path, reason } = currency(ref.kind, ref.id, sources);
      const entry = { kind: ref.kind, id: ref.id, status, components: ref.components.sort() };
      if (path) entry.path = path;
      if (reason) entry.reason = reason;
      return entry;
    });
  const warnings = references
    .filter((ref) => ref.status !== "current")
    .map((ref) => `${ref.status} ${LABELS[ref.kind]} ${ref.id} (${ref.components.join(", ")}): ${ref.reason}`);
  return { references, warnings };
}

/** The current ADRs and quality scenarios, as the declared references of REQ-idd-020. */
function derivedReferences(references) {
  return references
    .filter((ref) => ref.status === "current" && (ref.kind === "adr" || ref.kind === "scenario"))
    .map(({ kind, id }) => ({ kind, id }));
}

function plainCell(text) {
  return text
    .replace(/[*_`]/g, "")
    .trim()
    .toLowerCase();
}

/** The terms of a Markdown glossary: its headings and the first cell of each table body row, lower-cased. */
function parseGlossaryTerms(text) {
  const terms = new Set();
  const lines = String(text).split(/\r?\n/);
  const separator = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);
  lines.forEach((line, index) => {
    const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      terms.add(plainCell(heading[1]));
      return;
    }
    const row = /^\s*\|([^|]*)\|/.exec(line);
    if (!row || separator(line) || separator(lines[index + 1] || "")) return;
    const term = plainCell(row[1]);
    if (term) terms.add(term);
  });
  return terms;
}

module.exports = {
  COMPONENT_MAP_RELATIVE,
  GLOSSARY_RELATIVE,
  derivedReferences,
  parseGlossaryTerms,
  resolveReferences,
  touchedComponents,
};
