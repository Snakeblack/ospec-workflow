"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { classifyEvidence, validateRequirementEvidence } = require("./verify-evidence-classification.js");

test("Phase 7: textual fixture check is static-lint and cannot overclaim runtime-test", () => {
  const textualObservation = {
    checksFileTextOnly: true,
    testTitle: "check apply-progress contains [x]",
    level: "runtime-test", // overclaim attempt!
  };

  const level = classifyEvidence(textualObservation);
  assert.equal(level, "static-lint");

  const val = validateRequirementEvidence({
    requirementId: "REQ-VL-FINAL-006",
    strength: "MUST",
    describesRuntimeBehavior: true,
    evidenceLevel: level,
  });

  assert.equal(val.valid, false);
  assert.equal(val.downgraded, true);
  assert.match(val.reason, /cannot be satisfied by static-lint/);
});

test("Phase 7: real runtime invocation classifies as runtime-test and satisfies MUST requirement", () => {
  const runtimeObservation = {
    invokedRuntime: true,
    executesCode: true,
  };

  const level = classifyEvidence(runtimeObservation);
  assert.equal(level, "runtime-test");

  const val = validateRequirementEvidence({
    requirementId: "REQ-VL-FINAL-001",
    strength: "MUST",
    describesRuntimeBehavior: true,
    evidenceLevel: level,
  });

  assert.equal(val.valid, true);
  assert.equal(val.effectiveLevel, "runtime-test");
});
