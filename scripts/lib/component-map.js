"use strict";

// Component map recovered from a brownfield repository
// (openspec/specs/component-map/spec.md, REQ-component-map-001 to
// REQ-component-map-003). The schema decides shape; this module checks ids,
// references between entries and, given a root, that every path:line exists.
// The require puts the schema on the runtime graph.

require("../../schemas/foundation/component-map/v1.schema.json");

const fs = require("node:fs");
const path = require("node:path");
const { validateInstance } = require("./kernel-schema-validator.js");
const { evidenceErrors } = require("./repository-evidence.js");

const MAP_DIR = path.resolve(__dirname, "../../schemas/foundation/component-map");

function loadSchema() {
  return JSON.parse(fs.readFileSync(path.join(MAP_DIR, "v1.schema.json"), "utf8"));
}

function duplicateErrors(entries, list) {
  const errors = [];
  const seen = new Set();
  entries.forEach((entry, index) => {
    if (seen.has(entry.id)) {
      errors.push({ path: `/${list}/${index}/id`, rule: "unique", message: `duplicate ${list} id "${entry.id}"` });
    }
    seen.add(entry.id);
  });
  return errors;
}

function semanticErrors(map) {
  const errors = [];
  for (const list of ["components", "boundaries", "divergences"]) {
    errors.push(...duplicateErrors(map[list], list));
  }
  const known = new Set(map.components.map((component) => component.id));
  const unknown = (where, id) => ({ path: where, rule: "reference", message: `unknown component "${id}"` });
  map.boundaries.forEach((boundary, index) => {
    boundary.components.forEach((id, member) => {
      if (!known.has(id)) errors.push(unknown(`/boundaries/${index}/components/${member}`, id));
    });
  });
  map.dependencies.forEach((dependency, index) => {
    for (const end of ["from", "to"]) {
      if (!known.has(dependency[end])) errors.push(unknown(`/dependencies/${index}/${end}`, dependency[end]));
    }
    if (dependency.from === dependency.to) {
      errors.push({ path: `/dependencies/${index}`, rule: "reference", message: "a component does not depend on itself" });
    }
  });
  return errors;
}

function resolutionErrors(map, root) {
  const errors = [];
  for (const list of ["components", "boundaries", "dependencies", "divergences"]) {
    map[list].forEach((entry, index) => {
      errors.push(...evidenceErrors(root, entry.evidence, `/${list}/${index}/evidence`));
    });
  }
  map.divergences.forEach((divergence, index) => {
    if (divergence.documented === undefined) return;
    for (const error of evidenceErrors(root, [divergence.documented], `/divergences/${index}/documented`)) {
      errors.push({ ...error, path: `/divergences/${index}/documented` });
    }
  });
  return errors;
}

function validateComponentMap(map, options = {}) {
  const structural = validateInstance(loadSchema(), map);
  if (!structural.valid) return { valid: false, errors: structural.errors };
  const errors = semanticErrors(map);
  if (options.root !== undefined) errors.push(...resolutionErrors(map, options.root));
  return { valid: errors.length === 0, errors };
}

module.exports = {
  loadSchema,
  validateComponentMap,
};
