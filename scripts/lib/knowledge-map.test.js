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
