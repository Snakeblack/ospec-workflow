"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { classifyChange } = require("./change-classification.js");

test("auth/security evidence floors to critical despite tiny LOC", () => {
  const profile = classifyChange({
    impact: { auth_security: true },
    execution: { loc: 3, files: 1 },
  });
  assert.equal(profile.route, "critical");
  assert.ok(profile.reasons.includes("hard_floor.auth_security"));
  assert.ok(profile.risk && profile.uncertainty && profile.execution);
  assert.match(profile.fingerprint, /^sha256:[a-f0-9]{64}$/);
});

test("data migration evidence floors to critical", () => {
  const profile = classifyChange({
    impact: { data_migration: true },
    execution: { loc: 8 },
  });
  assert.equal(profile.route, "critical");
  assert.ok(profile.reasons.includes("hard_floor.data_migration"));
});

test("public API evidence floors to at least planned", () => {
  const profile = classifyChange({
    impact: { public_api: true },
    execution: { loc: 20 },
  });
  assert.equal(profile.route, "planned");
  assert.ok(profile.reasons.includes("hard_floor.public_api"));
});

test("repair evidence selects repair floor when no higher floor", () => {
  const profile = classifyChange({
    impact: { localized_reproducible_bug: true },
    execution: { loc: 15 },
  });
  assert.equal(profile.route, "repair");
  assert.ok(profile.reasons.includes("hard_floor.repair"));
});

test("direct evidence selects direct floor when no higher floor", () => {
  const profile = classifyChange({
    impact: { mechanical_no_behavior: true },
    execution: { loc: 5 },
  });
  assert.equal(profile.route, "direct");
  assert.ok(profile.reasons.includes("hard_floor.direct"));
});

test("large docs-only change does not invent critical floor", () => {
  const profile = classifyChange({
    impact: { docs_only: true },
    execution: { loc: 5000, files: 40 },
  });
  assert.notEqual(profile.route, "critical");
  assert.ok(!profile.reasons.some((r) => r.includes("critical") || r.includes("auth") || r.includes("migration")));
});

test("LOC never lowers an established hard floor", () => {
  const profile = classifyChange({
    impact: { auth_security: true },
    execution: { loc: 1, files: 1 },
    candidate_route: "direct",
  });
  assert.equal(profile.route, "critical");
});

test("identical normalized inputs produce identical fingerprint and reasons", () => {
  const input = {
    impact: { public_api: true },
    uncertainty: { level: "medium" },
    execution: { loc: 40, files: 3 },
  };
  const a = classifyChange(input);
  const b = classifyChange(input);
  assert.equal(a.fingerprint, b.fingerprint);
  assert.deepEqual(a.reasons, b.reasons);
  assert.equal(a.route, b.route);
});

test("material field change alters fingerprint", () => {
  const a = classifyChange({
    impact: { public_api: true },
    execution: { loc: 10 },
  });
  const b = classifyChange({
    impact: { public_api: true, auth_security: true },
    execution: { loc: 10 },
  });
  assert.notEqual(a.fingerprint, b.fingerprint);
});

test("classifyChange has no routing side effects on input object", () => {
  const input = { impact: { auth_security: true }, execution: { loc: 2 } };
  const frozen = JSON.stringify(input);
  classifyChange(input);
  assert.equal(JSON.stringify(input), frozen);
});

test("hard floors activate only for boolean true evidence", () => {
  for (const malformed of ["true", 1, {}, []]) {
    const profile = classifyChange({ impact: { auth_security: malformed } });
    assert.equal(profile.route, "bounded");
    assert.ok(!profile.reasons.includes("hard_floor.auth_security"));
  }

  assert.throws(
    () => classifyChange({ impact: Object.create({ data_migration: true }) }),
    { name: "TypeError", message: "classification impact must be an object when provided" }
  );
});

test("classifyChange rejects malformed structured evidence inputs", () => {
  for (const malformed of [null, "auth", 42, []]) {
    assert.throws(
      () => classifyChange(malformed),
      { name: "TypeError", message: "classification evidence must be an object" }
    );
  }

  for (const field of ["impact", "uncertainty", "execution"]) {
    for (const malformed of [null, "invalid", 1, []]) {
      assert.throws(
        () => classifyChange({ [field]: malformed }),
        {
          name: "TypeError",
          message: `classification ${field} must be an object when provided`,
        }
      );
    }
  }

  assert.throws(
    () => classifyChange({ candidate_route: 5 }),
    { name: "TypeError", message: "classification candidate_route must be a known route" }
  );
  assert.throws(
    () => classifyChange({ candidate_route: "unknown" }),
    { name: "TypeError", message: "classification candidate_route must be a known route" }
  );
});

test("classifyChange preserves optional-input normalization", () => {
  const profile = classifyChange();
  assert.equal(profile.route, "bounded");
  assert.deepEqual(profile.uncertainty, {});
  assert.deepEqual(profile.execution, {});
});
