"use strict";

// Knowledge-map contract for foundation (openspec/specs/knowledge-map/spec.md,
// REQ-knowledge-map-001 to REQ-knowledge-map-004). The schema decides shape;
// the catalog decides which slots each profile must answer and which
// decisions a slot feeds.

const fs = require("node:fs");
const path = require("node:path");
const { validateInstance } = require("./kernel-schema-validator.js");

const MAP_DIR = path.resolve(__dirname, "../../schemas/foundation/knowledge-map");

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(MAP_DIR, fileName), "utf8"));
}

function loadSchema() {
  return readJson("v1.schema.json");
}

function loadCatalog() {
  return readJson("catalog.json");
}

function explainSlots(schema, slots) {
  const branches = schema.$defs.slot.oneOf;
  const errors = [];
  const explained = new Set();
  slots.forEach((slot, index) => {
    if (!slot || typeof slot !== "object" || Array.isArray(slot)) return;
    const resolved = branches
      .map((item) => (item.$ref ? resolveBranch(schema, item.$ref) : item))
      .find((item) => item?.properties?.state?.const === slot.state);
    if (!resolved) return;
    const result = validateInstance(resolved, slot, { rootSchema: schema });
    if (result.valid) return;
    explained.add(`/slots/${index}`);
    for (const error of result.errors) {
      const suffix = error.path === "/" ? "" : error.path;
      errors.push({ ...error, path: `/slots/${index}${suffix}` });
    }
  });
  return { errors, explained };
}

function resolveBranch(schema, ref) {
  const name = ref.split("/").pop();
  return schema.$defs[name];
}

function semanticErrors(map, catalog) {
  const errors = [];
  const byId = new Map(catalog.slots.map((slot) => [slot.id, slot]));
  const seen = new Set();
  map.slots.forEach((slot, index) => {
    const defined = byId.get(slot.id);
    if (!defined) {
      errors.push({ path: `/slots/${index}/id`, rule: "catalog", message: `unknown slot "${slot.id}"` });
      return;
    }
    if (slot.dimension !== defined.dimension) {
      errors.push({
        path: `/slots/${index}/dimension`,
        rule: "catalog",
        message: `slot "${slot.id}" belongs to ${defined.dimension}`,
      });
    }
    for (const decision of slot.decisions || []) {
      if (!defined.decisions.includes(decision)) {
        errors.push({
          path: `/slots/${index}/decisions`,
          rule: "catalog",
          message: `slot "${slot.id}" does not feed "${decision}"`,
        });
      }
    }
    if (seen.has(slot.id)) {
      errors.push({ path: `/slots/${index}/id`, rule: "unique", message: `duplicate slot "${slot.id}"` });
    }
    seen.add(slot.id);
    if (defined.mandatory.includes(map.profile) && slot.state === "unknown") {
      errors.push({
        path: `/slots/${index}/state`,
        rule: "mandatory",
        message: `mandatory slot "${slot.id}" cannot be unknown`,
      });
    }
  });
  for (const defined of catalog.slots) {
    if (defined.mandatory.includes(map.profile) && !seen.has(defined.id)) {
      errors.push({
        path: "/slots",
        rule: "mandatory",
        message: `missing mandatory slot "${defined.id}"`,
      });
    }
  }
  return errors;
}

function validateKnowledgeMap(instance) {
  const schema = loadSchema();
  const structural = validateInstance(schema, instance);
  const slots = instance && typeof instance === "object" && Array.isArray(instance.slots) ? instance.slots : [];
  const explained = explainSlots(schema, slots);
  const errors = structural.errors.filter((error) => error.rule !== "oneOf" || !explained.explained.has(error.path));
  errors.push(...explained.errors);
  if (errors.length > 0) return { valid: false, errors };
  const semantic = semanticErrors(instance, loadCatalog());
  return { valid: semantic.length === 0, errors: semantic };
}

module.exports = {
  loadCatalog,
  loadSchema,
  validateKnowledgeMap,
};
