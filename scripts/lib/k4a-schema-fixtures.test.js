"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { validateInstance, loadSchemaById } = require("./kernel-schema-validator.js");

const ROOT = path.resolve(__dirname, "..", "..");
const MANIFEST_PATH = path.join(ROOT, "schemas", "kernel", "manifest.json");
const CLAIMS_PATH = path.join(ROOT, "schemas", "kernel", "contract-claims.json");

test("K4a schema registration: manifest.json includes execution-graph, policy-snapshot, and clarify-event", () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  assert.ok(manifest.families["execution-graph"], "execution-graph must be registered in manifest");
  assert.equal(manifest.families["execution-graph"].schema_version, 1);
  assert.equal(manifest.families["execution-graph"].$id, "ospec://schemas/kernel/execution-graph/v1");

  assert.ok(manifest.families["policy-snapshot"], "policy-snapshot must be registered in manifest");
  assert.equal(manifest.families["policy-snapshot"].schema_version, 1);
  assert.equal(manifest.families["policy-snapshot"].$id, "ospec://schemas/kernel/policy-snapshot/v1");

  assert.ok(manifest.families["clarify-event"], "clarify-event must be registered in manifest");
  assert.equal(manifest.families["clarify-event"].schema_version, 1);
  assert.equal(manifest.families["clarify-event"].$id, "ospec://schemas/kernel/clarify-event/v1");
});

test("K4a contract claims: contract-claims.json specifies required fields for K4a families", () => {
  const claims = JSON.parse(fs.readFileSync(CLAIMS_PATH, "utf8"));

  assert.ok(claims.families["execution-graph"]);
  assert.deepEqual(claims.families["execution-graph"].required_fields, [
    "schema_version",
    "graph_id",
    "contract_digest",
    "policy_bundle_digest",
    "policy_snapshot_id",
    "source_snapshot_id",
    "nodes",
    "obligations",
  ]);

  assert.ok(claims.families["policy-snapshot"]);
  assert.deepEqual(claims.families["policy-snapshot"].required_fields, [
    "schema_version",
    "snapshot_id",
    "policy_bundle_digest",
    "compiler_version",
    "classifier_version",
    "runtime_version",
    "effective_rules",
  ]);

  assert.ok(claims.families["clarify-event"]);
  assert.deepEqual(claims.families["clarify-event"].required_fields, [
    "schema_version",
    "event_id",
    "question_id",
    "answer",
    "timestamp",
    "affected_nodes",
  ]);
});

test("K4a execution-graph schema: validates valid and rejects invalid fixtures", () => {
  const schema = loadSchemaById("ospec://schemas/kernel/execution-graph/v1", { rootDir: ROOT });

  const validFixture = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "execution-graph", "fixtures", "valid", "repair-route.json"),
      "utf8"
    )
  );
  const validRes = validateInstance(schema, validFixture);
  assert.equal(validRes.valid, true, `Valid repair-route fixture must pass schema: ${JSON.stringify(validRes.errors)}`);

  const microscopicFixture = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "execution-graph", "fixtures", "invalid", "microscopic-node.json"),
      "utf8"
    )
  );
  const microRes = validateInstance(schema, microscopicFixture);
  assert.equal(microRes.valid, false, "Microscopic node fixture must fail validation");

  const unmappedFixture = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "execution-graph", "fixtures", "invalid", "unmapped-must-obligation.json"),
      "utf8"
    )
  );
  const unmappedRes = validateInstance(schema, unmappedFixture);
  assert.equal(unmappedRes.valid, false, "Missing obligations fixture must fail validation");

  const missingSnapshotFixture = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "execution-graph", "fixtures", "invalid", "missing-source-snapshot.json"),
      "utf8"
    )
  );
  const missingSnapRes = validateInstance(schema, missingSnapshotFixture);
  assert.equal(missingSnapRes.valid, false, "Missing source_snapshot_id fixture must fail validation");

  const malformedSnapshotFixture = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "execution-graph", "fixtures", "invalid", "malformed-source-snapshot.json"),
      "utf8"
    )
  );
  const malformedRes = validateInstance(schema, malformedSnapshotFixture);
  assert.equal(malformedRes.valid, false, "Malformed source_snapshot_id fixture must fail validation");

  const missingPolicyFixture = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "execution-graph", "fixtures", "invalid", "missing-policy-snapshot.json"),
      "utf8"
    )
  );
  const missingPolicyRes = validateInstance(schema, missingPolicyFixture);
  assert.equal(missingPolicyRes.valid, false, "Missing policy_snapshot_id fixture must fail validation");

  const malformedPolicyFixture = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "execution-graph", "fixtures", "invalid", "malformed-policy-snapshot.json"),
      "utf8"
    )
  );
  const malformedPolicyRes = validateInstance(schema, malformedPolicyFixture);
  assert.equal(malformedPolicyRes.valid, false, "Malformed policy_snapshot_id fixture must fail validation");

  const pattern = new RegExp(schema.properties.source_snapshot_id.pattern);
  assert.equal(pattern.test("sha256:UPPERCASE-ID"), false, "Schema pattern must reject malformed uppercase source_snapshot_id");
  const policyPattern = new RegExp(schema.properties.policy_snapshot_id.pattern);
  assert.equal(policyPattern.test("sha256:UPPERCASE-ID"), false, "Schema pattern must reject malformed uppercase policy_snapshot_id");
});

test("K4a policy-snapshot schema: validates valid and rejects invalid fixtures", () => {
  const schema = loadSchemaById("ospec://schemas/kernel/policy-snapshot/v1", { rootDir: ROOT });

  const validFixture = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "policy-snapshot", "fixtures", "valid", "default-snapshot.json"),
      "utf8"
    )
  );
  const validRes = validateInstance(schema, validFixture);
  assert.equal(validRes.valid, true, `Valid default-snapshot fixture must pass: ${JSON.stringify(validRes.errors)}`);

  const invalidFixture = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "policy-snapshot", "fixtures", "invalid", "missing-rules.json"),
      "utf8"
    )
  );
  const invalidRes = validateInstance(schema, invalidFixture);
  assert.equal(invalidRes.valid, false, "Missing rules snapshot must fail validation");
});

test("K4a clarify-event schema: validates valid and rejects invalid fixtures", () => {
  const schema = loadSchemaById("ospec://schemas/kernel/clarify-event/v1", { rootDir: ROOT });

  const validFixture = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "clarify-event", "fixtures", "valid", "clarify-node.json"),
      "utf8"
    )
  );
  const validRes = validateInstance(schema, validFixture);
  assert.equal(validRes.valid, true, `Valid clarify-node fixture must pass: ${JSON.stringify(validRes.errors)}`);

  const invalidFixture = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "clarify-event", "fixtures", "invalid", "missing-affected-nodes.json"),
      "utf8"
    )
  );
  const invalidRes = validateInstance(schema, invalidFixture);
  assert.equal(invalidRes.valid, false, "Missing affected-nodes fixture must fail validation");
});

test("K4a work-order/v2 schema: validates valid fixtures and rejects invalid dependencies pattern", () => {
  const schema = loadSchemaById("ospec://schemas/kernel/work-order/v2", { rootDir: ROOT });

  const validFixture = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "work-order", "fixtures", "valid", "v2-minimal.json"),
      "utf8"
    )
  );
  const validRes = validateInstance(schema, validFixture);
  assert.equal(validRes.valid, true, `Valid v2-minimal fixture must pass schema: ${JSON.stringify(validRes.errors)}`);

  const malformedDepFixture = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "work-order", "fixtures", "invalid", "malformed-dependencies-digest.json"),
      "utf8"
    )
  );
  const malformedDepRes = validateInstance(schema, malformedDepFixture);
  assert.equal(malformedDepRes.valid, false, "Malformed dependencies digest fixture must fail validation");

  const depPattern = new RegExp(schema.properties.dependencies.items.pattern);
  assert.equal(depPattern.test("raw-node-id-without-prefix"), false, "Schema pattern must reject non-sha256 dependency items");
  assert.equal(depPattern.test("sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"), true, "Schema pattern must accept sha256 dependency item");
});
