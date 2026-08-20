"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { validateInstance, loadSchemaById } = require("./kernel-schema-validator.js");

const ROOT = path.resolve(__dirname, "..", "..");
const MANIFEST_PATH = path.join(ROOT, "schemas", "kernel", "manifest.json");
const CLAIMS_PATH = path.join(ROOT, "schemas", "kernel", "contract-claims.json");

test("K5 schema registration: manifest.json includes execution-budget, authority-effect-budget, causal-failure, and failure-recovery-transition", () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));

  assert.ok(manifest.families["execution-budget"], "execution-budget must be registered in manifest");
  assert.equal(manifest.families["execution-budget"].schema_version, 1);
  assert.equal(manifest.families["execution-budget"].$id, "ospec://schemas/kernel/execution-budget/v1");

  assert.ok(manifest.families["authority-effect-budget"], "authority-effect-budget must be registered in manifest");
  assert.equal(manifest.families["authority-effect-budget"].schema_version, 1);
  assert.equal(manifest.families["authority-effect-budget"].$id, "ospec://schemas/kernel/authority-effect-budget/v1");

  assert.ok(manifest.families["causal-failure"], "causal-failure must be registered in manifest");
  assert.equal(manifest.families["causal-failure"].schema_version, 1);
  assert.equal(manifest.families["causal-failure"].$id, "ospec://schemas/kernel/causal-failure/v1");

  assert.ok(manifest.families["failure-recovery-transition"], "failure-recovery-transition must be registered in manifest");
  assert.equal(manifest.families["failure-recovery-transition"].schema_version, 1);
  assert.equal(manifest.families["failure-recovery-transition"].$id, "ospec://schemas/kernel/failure-recovery-transition/v1");
});

test("K5 contract claims: contract-claims.json specifies required fields for K5 families", () => {
  const claims = JSON.parse(fs.readFileSync(CLAIMS_PATH, "utf8"));

  assert.ok(claims.families["execution-budget"]);
  assert.deepEqual(claims.families["execution-budget"].required_fields, [
    "schema_version",
    "turns",
    "patches",
    "commands",
    "wall_time_minutes",
    "changed_lines",
    "allowed_paths",
  ]);

  assert.ok(claims.families["authority-effect-budget"]);
  assert.deepEqual(claims.families["authority-effect-budget"].required_fields, [
    "schema_version",
    "effect_attempts",
    "authority_mutations",
    "evidence_runs",
    "review_sweeps",
  ]);

  assert.ok(claims.families["causal-failure"]);
  assert.deepEqual(claims.families["causal-failure"].required_fields, [
    "schema_version",
    "failure_id",
    "category",
    "code",
    "priority",
    "blocking_fingerprint",
    "details",
  ]);
  assert.deepEqual(claims.families["causal-failure"].enum_values.category, [
    "environment_tooling",
    "cas_conflict",
    "ambiguous_effect",
    "validation_gap",
    "code_defect",
  ]);

  assert.ok(claims.families["failure-recovery-transition"]);
  assert.deepEqual(claims.families["failure-recovery-transition"].required_fields, [
    "schema_version",
    "transition_id",
    "failure_code",
    "target_operation",
    "scope",
    "expected_advancement",
  ]);
  assert.deepEqual(claims.families["failure-recovery-transition"].enum_values.target_operation, [
    "repair",
    "replan",
    "escalate",
    "stop",
  ]);
});

test("K5 execution-budget schema: validates valid and rejects invalid fixtures", () => {
  const schema = loadSchemaById("ospec://schemas/kernel/execution-budget/v1", { rootDir: ROOT });

  const minimal = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "execution-budget", "fixtures", "valid", "valid-minimal.json"),
      "utf8"
    )
  );
  const minRes = validateInstance(schema, minimal);
  assert.equal(minRes.valid, true, `valid-minimal must pass: ${JSON.stringify(minRes.errors)}`);

  const full = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "execution-budget", "fixtures", "valid", "valid-full.json"),
      "utf8"
    )
  );
  const fullRes = validateInstance(schema, full);
  assert.equal(fullRes.valid, true, `valid-full must pass: ${JSON.stringify(fullRes.errors)}`);

  const negTurns = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "execution-budget", "fixtures", "invalid", "invalid-negative-turns.json"),
      "utf8"
    )
  );
  const negRes = validateInstance(schema, negTurns);
  assert.equal(negRes.valid, false, "Negative turns must fail schema validation");

  const missingLines = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "execution-budget", "fixtures", "invalid", "invalid-missing-changed-lines.json"),
      "utf8"
    )
  );
  const missRes = validateInstance(schema, missingLines);
  assert.equal(missRes.valid, false, "Missing changed_lines must fail schema validation");

  const extraProp = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "execution-budget", "fixtures", "invalid", "invalid-extra-prop.json"),
      "utf8"
    )
  );
  const extraRes = validateInstance(schema, extraProp);
  assert.equal(extraRes.valid, false, "Extra property must fail schema validation");
});

test("K5 authority-effect-budget schema: validates valid and rejects invalid fixtures", () => {
  const schema = loadSchemaById("ospec://schemas/kernel/authority-effect-budget/v1", { rootDir: ROOT });

  const minimal = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "authority-effect-budget", "fixtures", "valid", "valid-minimal.json"),
      "utf8"
    )
  );
  const minRes = validateInstance(schema, minimal);
  assert.equal(minRes.valid, true, `valid-minimal must pass: ${JSON.stringify(minRes.errors)}`);

  const full = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "authority-effect-budget", "fixtures", "valid", "valid-full.json"),
      "utf8"
    )
  );
  const fullRes = validateInstance(schema, full);
  assert.equal(fullRes.valid, true, `valid-full must pass: ${JSON.stringify(fullRes.errors)}`);

  const negAttempts = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "authority-effect-budget", "fixtures", "invalid", "invalid-negative-attempts.json"),
      "utf8"
    )
  );
  const negRes = validateInstance(schema, negAttempts);
  assert.equal(negRes.valid, false, "Negative effect_attempts must fail schema validation");

  const missingMutations = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "authority-effect-budget", "fixtures", "invalid", "invalid-missing-mutations.json"),
      "utf8"
    )
  );
  const missRes = validateInstance(schema, missingMutations);
  assert.equal(missRes.valid, false, "Missing authority_mutations must fail schema validation");

  const extraProp = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "authority-effect-budget", "fixtures", "invalid", "invalid-extra-prop.json"),
      "utf8"
    )
  );
  const extraRes = validateInstance(schema, extraProp);
  assert.equal(extraRes.valid, false, "Extra property must fail schema validation");
});

test("K5 causal-failure schema: validates valid and rejects invalid fixtures", () => {
  const schema = loadSchemaById("ospec://schemas/kernel/causal-failure/v1", { rootDir: ROOT });

  const envFault = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "causal-failure", "fixtures", "valid", "valid-environment-fault.json"),
      "utf8"
    )
  );
  const envRes = validateInstance(schema, envFault);
  assert.equal(envRes.valid, true, `valid-environment-fault must pass: ${JSON.stringify(envRes.errors)}`);

  const codeDefect = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "causal-failure", "fixtures", "valid", "valid-code-defect.json"),
      "utf8"
    )
  );
  const codeRes = validateInstance(schema, codeDefect);
  assert.equal(codeRes.valid, true, `valid-code-defect must pass: ${JSON.stringify(codeRes.errors)}`);

  const casConflict = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "causal-failure", "fixtures", "valid", "valid-cas-conflict.json"),
      "utf8"
    )
  );
  const casRes = validateInstance(schema, casConflict);
  assert.equal(casRes.valid, true, `valid-cas-conflict must pass: ${JSON.stringify(casRes.errors)}`);

  const invalidCat = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "causal-failure", "fixtures", "invalid", "invalid-category-enum.json"),
      "utf8"
    )
  );
  const catRes = validateInstance(schema, invalidCat);
  assert.equal(catRes.valid, false, "Invalid category enum must fail schema validation");

  const invalidPriority = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "causal-failure", "fixtures", "invalid", "invalid-priority-range.json"),
      "utf8"
    )
  );
  const prioRes = validateInstance(schema, invalidPriority);
  assert.equal(prioRes.valid, false, "Invalid priority out of range must fail schema validation");

  const missingFp = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "causal-failure", "fixtures", "invalid", "invalid-missing-fingerprint.json"),
      "utf8"
    )
  );
  const fpRes = validateInstance(schema, missingFp);
  assert.equal(fpRes.valid, false, "Missing blocking_fingerprint must fail schema validation");
});

test("K5 failure-recovery-transition schema: validates valid and rejects invalid fixtures", () => {
  const schema = loadSchemaById("ospec://schemas/kernel/failure-recovery-transition/v1", { rootDir: ROOT });

  const repairTrans = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "failure-recovery-transition", "fixtures", "valid", "valid-repair-transition.json"),
      "utf8"
    )
  );
  const repRes = validateInstance(schema, repairTrans);
  assert.equal(repRes.valid, true, `valid-repair-transition must pass: ${JSON.stringify(repRes.errors)}`);

  const escTrans = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "failure-recovery-transition", "fixtures", "valid", "valid-escalate-transition.json"),
      "utf8"
    )
  );
  const escRes = validateInstance(schema, escTrans);
  assert.equal(escRes.valid, true, `valid-escalate-transition must pass: ${JSON.stringify(escRes.errors)}`);

  const invOp = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "failure-recovery-transition", "fixtures", "invalid", "invalid-operation-enum.json"),
      "utf8"
    )
  );
  const opRes = validateInstance(schema, invOp);
  assert.equal(opRes.valid, false, "Invalid operation enum must fail schema validation");

  const missingScope = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "failure-recovery-transition", "fixtures", "invalid", "invalid-missing-scope.json"),
      "utf8"
    )
  );
  const scopeRes = validateInstance(schema, missingScope);
  assert.equal(scopeRes.valid, false, "Missing scope must fail schema validation");

  const extraProp = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "failure-recovery-transition", "fixtures", "invalid", "invalid-extra-prop.json"),
      "utf8"
    )
  );
  const extraRes = validateInstance(schema, extraProp);
  assert.equal(extraRes.valid, false, "Extra property must fail schema validation");
});
