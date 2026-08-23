"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { check: checkCanonicalContracts } = require("./k6a-canonical-contracts.js");
const { runAllCheckers, DEFAULT_REGISTRY } = require("../contract-lint.js");

const ROOT = path.resolve(__dirname, "..", "..", "..");

test("k6a-canonical-contracts: reports offender if capsule-definition fixture uses file paths in dependencies instead of DAG sha256 IDs", () => {
  const badFixture = {
    schema_version: 1,
    capsule_id: "capsule-bad-deps",
    fingerprint: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    source_snapshot_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    dependencies: ["src/index.js"],
    allowed_paths: ["src/**"],
  };

  const offenders = checkCanonicalContracts({
    root: ROOT,
    payloads: [
      {
        path: "schemas/kernel/capsule-definition/fixtures/valid/bad.json",
        data: badFixture,
      },
    ],
  });

  assert.ok(offenders.length >= 1, "Must report offender for non-sha256 dependencies in capsule-definition");
  assert.ok(offenders.some((o) => o.checker === "k6a-canonical-contracts" && o.message.includes("dependencies")));
});

test("k6a-canonical-contracts: reports offender if work-result fixture contains candidate_id", () => {
  const badWorkResult = {
    schema_version: 1,
    work_result_id: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    candidate_id: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
  };

  const offenders = checkCanonicalContracts({
    root: ROOT,
    payloads: [
      {
        path: "schemas/kernel/work-result-execution-payload/fixtures/valid/bad.json",
        data: badWorkResult,
      },
    ],
  });

  assert.ok(offenders.length >= 1, "Must report candidate_id offender");
  assert.ok(offenders.some((o) => o.checker === "k6a-canonical-contracts" && o.message.includes("candidate_id")));
});

test("k6a-canonical-contracts: reports zero offenders on clean repository", () => {
  const offenders = checkCanonicalContracts({ root: ROOT });
  assert.deepEqual(offenders, []);
});

test("contract-lint aggregator: DEFAULT_REGISTRY includes k6a-canonical-contracts", () => {
  assert.ok(
    DEFAULT_REGISTRY.includes(checkCanonicalContracts),
    "DEFAULT_REGISTRY must include checkCanonicalContracts"
  );
});
