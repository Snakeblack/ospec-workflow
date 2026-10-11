"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { loadCatalog, loadSchema, validateKnowledgeMap } = require("./knowledge-map.js");

const ROOT = path.resolve(__dirname, "../../schemas/foundation/knowledge-map");
const PROFILES = ["prototype", "internal-tool", "product", "regulated", "public-library", "embedded"];
const INVALID = [
  "na-without-reason.json",
  "assumed-without-trigger.json",
  "deferred-without-owner.json",
  "confirmed-without-source.json",
  "unknown-with-source.json",
  "measure-without-source.json",
  "unknown-decision.json",
  "unknown-slot.json",
  "mandatory-left-unknown.json",
  "regulated-missing-trust.json",
];

function readFixture(relative) {
  const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, relative), "utf8"));
  const expected = parsed.expected_error;
  delete parsed.expected_error;
  return { parsed, expected };
}

function mandatoryIds(catalog, profile) {
  return catalog.slots.filter((slot) => slot.mandatory.includes(profile)).map((slot) => slot.id);
}

test("[REQ-knowledge-map-001] the schema lists unknown and n/a as different slot states", () => {
  const schema = loadSchema();
  const states = schema.$defs.slot.oneOf.map((branch) => schema.$defs[branch.$ref.split("/").pop()].properties.state.const);
  assert.deepEqual(states, ["unknown", "confirmed", "assumed", "n/a", "deferred"]);
  assert.equal(schema.$defs.unknownSlot.properties.reason, undefined);
  assert.ok(schema.$defs.notApplicableSlot.required.includes("reason"));
  assert.equal(schema.$defs.unknownSlot.required.includes("reason"), false);
});

test("[REQ-knowledge-map-003] each profile has its own mandatory slots and one valid example", () => {
  const catalog = loadCatalog();
  assert.deepEqual(catalog.profiles, PROFILES);
  const sets = Object.fromEntries(PROFILES.map((profile) => [profile, mandatoryIds(catalog, profile)]));
  assert.equal(new Set(Object.values(sets).map((ids) => ids.join("|"))).size, PROFILES.length);
  assert.ok(sets.regulated.includes("architecture.trust"));
  assert.ok(sets.regulated.includes("operation.backup"));
  assert.ok(sets["public-library"].includes("technology.licenses"));
  assert.ok(sets["public-library"].includes("delivery.versioning"));
  assert.equal(sets["public-library"].includes("operation.backup"), false);
  assert.ok(sets.embedded.includes("business.constraints"));
  assert.ok(sets.embedded.includes("architecture.deployment"));
  assert.equal(sets.prototype.includes("operation.backup"), false);
  for (const slot of catalog.slots) {
    assert.ok(slot.decisions.length >= 1, slot.id);
    assert.ok(slot.mandatory.every((profile) => PROFILES.includes(profile)), slot.id);
  }

  for (const profile of PROFILES) {
    const { parsed } = readFixture(`fixtures/valid/${profile}.json`);
    const result = validateKnowledgeMap(parsed);
    assert.equal(result.valid, true, `${profile}: ${JSON.stringify(result.errors)}`);
    assert.equal(parsed.profile, profile);
    for (const id of sets[profile]) {
      const slot = parsed.slots.find((item) => item.id === id);
      assert.ok(slot, `${profile} missing ${id}`);
      assert.notEqual(slot.state, "unknown", `${profile} left ${id} unknown`);
    }
  }
});

test("[REQ-knowledge-map-001] examples show unknown, assumed, n/a and deferred as different answers", () => {
  const prototype = readFixture("fixtures/valid/prototype.json").parsed;
  assert.ok(prototype.slots.some((slot) => slot.state === "unknown"));
  assert.ok(prototype.slots.some((slot) => slot.state === "assumed" && slot.review_trigger));
  assert.equal(prototype.quality_scenarios[0].measure, undefined);

  const library = readFixture("fixtures/valid/public-library.json").parsed;
  assert.ok(library.slots.some((slot) => slot.state === "n/a" && slot.reason));

  const embedded = readFixture("fixtures/valid/embedded.json").parsed;
  assert.ok(embedded.slots.some((slot) => slot.state === "deferred" && slot.owner));

  const regulated = readFixture("fixtures/valid/regulated.json").parsed;
  assert.ok(regulated.quality_scenarios[0].measure);
  assert.ok(regulated.quality_scenarios[0].measure_source);
});

test("[REQ-knowledge-map-002] invalid fixtures fail for the reason they name", () => {
  for (const name of INVALID) {
    const { parsed, expected } = readFixture(`fixtures/invalid/${name}`);
    const result = validateKnowledgeMap(parsed);
    assert.equal(result.valid, false, name);
    assert.ok(
      result.errors.some((error) => error.message.includes(expected)),
      `${name}: expected ${expected} in ${JSON.stringify(result.errors)}`
    );
  }
});

function withFitness(schema, fitness) {
  const { parsed } = readFixture("fixtures/valid/regulated.json");
  parsed.schema = schema;
  parsed.quality_scenarios[0].fitness = fitness;
  return parsed;
}

test("[REQ-knowledge-map-005] a v2 quality scenario declares its fitness checks and description", () => {
  assert.equal(loadSchema("v2").properties.schema.const, "ospec-knowledge-map/v2");
  const full = withFitness("ospec-knowledge-map/v2", { description: "p95 under 200 ms", checks: ["npm run bench:p95"] });
  assert.deepEqual(validateKnowledgeMap(full), { valid: true, errors: [] });
  assert.equal(validateKnowledgeMap(withFitness("ospec-knowledge-map/v2", { description: "reviewed by hand" })).valid, true);
  const { parsed: plain } = readFixture("fixtures/valid/regulated.json");
  assert.equal(validateKnowledgeMap({ ...plain, schema: "ospec-knowledge-map/v2" }).valid, true);
});

test("[REQ-knowledge-map-005] an empty fitness, an empty check list or fitness in v1 is rejected", () => {
  for (const [schema, fitness] of [
    ["ospec-knowledge-map/v2", {}],
    ["ospec-knowledge-map/v2", { checks: [] }],
    ["ospec-knowledge-map/v2", { checks: [""] }],
    ["ospec-knowledge-map/v1", { checks: ["npm test"] }],
  ]) {
    assert.equal(validateKnowledgeMap(withFitness(schema, fitness)).valid, false, `${schema} ${JSON.stringify(fitness)}`);
  }
});

test("[REQ-knowledge-map-005] an unknown map version is rejected by the schema rule", () => {
  const result = validateKnowledgeMap(withFitness("ospec-knowledge-map/v9", { checks: ["npm test"] }));
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors.map((error) => error.rule), ["schema"]);
});
