"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { check: checkCandidateProhibition } = require("./k6a-candidate-prohibition.js");
const { check: checkCapsulePathContainment } = require("./k6a-capsule-path-containment.js");
const { runAllCheckers, DEFAULT_REGISTRY } = require("../contract-lint.js");

const ROOT = path.resolve(__dirname, "..", "..", "..");

test("k6a-candidate-prohibition checker: reports offenders for candidate_id in K6a artifacts", () => {
  const badFixture = {
    schema_version: 1,
    work_result_id: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    candidate_id: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
  };

  const offenders = checkCandidateProhibition({
    root: ROOT,
    payloads: [{ path: "schemas/kernel/work-result-execution-payload/fixtures/valid/bad.json", data: badFixture }],
  });

  assert.ok(offenders.length >= 1, "Must report candidate_id offender");
  assert.ok(offenders.some((o) => o.checker === "k6a-candidate-prohibition" && o.message.includes("candidate_id")));
});

test("k6a-candidate-prohibition checker: reports zero offenders on clean repository", () => {
  const offenders = checkCandidateProhibition({ root: ROOT });
  assert.deepEqual(offenders, []);
});

test("k6a-capsule-path-containment checker: reports offenders for missing, empty, or traversing allowed_paths", () => {
  const missingAllowed = {
    schema_version: 1,
    capsule_id: "capsule-1",
  };

  const emptyAllowed = {
    schema_version: 1,
    capsule_id: "capsule-2",
    allowed_paths: [],
  };

  const traversingAllowed = {
    schema_version: 1,
    capsule_id: "capsule-3",
    allowed_paths: ["../outside/**"],
  };

  const offenders = checkCapsulePathContainment({
    root: ROOT,
    payloads: [
      { path: "capsule-missing.json", data: missingAllowed },
      { path: "capsule-empty.json", data: emptyAllowed },
      { path: "capsule-traversal.json", data: traversingAllowed },
    ],
  });

  assert.ok(offenders.length >= 3, "Must report missing, empty, and traversal allowed_paths");
  assert.ok(offenders.some((o) => o.message.includes("missing")));
  assert.ok(offenders.some((o) => o.message.includes("empty")));
  assert.ok(offenders.some((o) => o.message.includes("traversal")));
});

test("k6a-capsule-path-containment checker: reports zero offenders on clean repository", () => {
  const offenders = checkCapsulePathContainment({ root: ROOT });
  assert.deepEqual(offenders, []);
});

test("contract-lint aggregator: DEFAULT_REGISTRY includes both K6a checkers", () => {
  assert.ok(DEFAULT_REGISTRY.includes(checkCandidateProhibition), "DEFAULT_REGISTRY must include checkCandidateProhibition");
  assert.ok(DEFAULT_REGISTRY.includes(checkCapsulePathContainment), "DEFAULT_REGISTRY must include checkCapsulePathContainment");

  const offenders = runAllCheckers({ root: ROOT });
  assert.deepEqual(offenders, [], `Clean repository must have 0 contract-lint offenders: ${JSON.stringify(offenders)}`);
});
