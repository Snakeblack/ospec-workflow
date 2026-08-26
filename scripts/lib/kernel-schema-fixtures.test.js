"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { validateInstance, loadSchemaById } = require("./kernel-schema-validator.js");
const { digestFile, K1_SCHEMA_BASELINE } = require("./lifecycle-kernel/k1-compat.js");

const ROOT = path.resolve(__dirname, "..", "..");
const MANIFEST_PATH = path.join(ROOT, "schemas", "kernel", "manifest.json");

const REQUIRED_FAMILIES = [
  "state-transition",
  "classification",
  "contract",
  "graph-node",
  "work-order",
  "candidate",
  "evidence",
  "verification",
  "finding-review",
  "failure-recovery",
  "receipt",
  "event",
];

function loadManifest() {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    // v2-* and k3-frozen fixtures belong to Candidate/WorkOrder v2 publication, not v1 family walks
    .filter((name) => !name.startsWith("v2-") && name !== "k3-frozen.json")
    .map((name) => path.join(dir, name));
}

function loadKernelSchema(family) {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, "schemas", "kernel", family, "v1.schema.json"), "utf8")
  );
}

function loadWorkOrderSchema(version) {
  return JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "work-order", `v${version}.schema.json`),
      "utf8"
    )
  );
}

function assertRequiredErrors(result, fields) {
  assert.equal(result.valid, false);
  const missingPaths = new Set(
    result.errors.filter((error) => error.rule === "required").map((error) => error.path)
  );
  for (const field of fields) {
    assert.ok(missingPaths.has(`/${field}`), `expected required error for /${field}`);
  }
}

test("manifest indexes every required family with $id and schema_version", () => {
  const manifest = loadManifest();
  assert.equal(typeof manifest.families, "object");
  for (const family of REQUIRED_FAMILIES) {
    const entry = manifest.families[family];
    assert.ok(entry, `missing family ${family}`);
    assert.ok(entry.$id && entry.$id.length > 0, `${family} missing $id`);
    assert.equal(entry.$id, `ospec://schemas/kernel/${family}/v1`);
    assert.equal(entry.schema_version, 1);
    assert.ok(entry.path, `${family} missing path`);
    const abs = path.join(ROOT, entry.path);
    assert.ok(fs.existsSync(abs), `schema file missing: ${entry.path}`);
    const schema = JSON.parse(fs.readFileSync(abs, "utf8"));
    assert.equal(schema.$id, entry.$id);
    assert.equal(schema.schema_version, 1);
  }
});

test("loadSchemaById pins by $id without silent substitution", () => {
  const schema = loadSchemaById("ospec://schemas/kernel/classification/v1", { rootDir: ROOT });
  assert.equal(schema.$id, "ospec://schemas/kernel/classification/v1");
  assert.throws(
    () => loadSchemaById("ospec://schemas/kernel/classification/v99", { rootDir: ROOT }),
    /not found/i
  );
});

test("every family valid fixtures pass and invalid fixtures fail with path/rule", () => {
  const manifest = loadManifest();
  for (const family of REQUIRED_FAMILIES) {
    const entry = manifest.families[family];
    const schema = JSON.parse(fs.readFileSync(path.join(ROOT, entry.path), "utf8"));
    const familyDir = path.dirname(path.join(ROOT, entry.path));
    const validFiles = listJsonFiles(path.join(familyDir, "fixtures", "valid"));
    const invalidFiles = listJsonFiles(path.join(familyDir, "fixtures", "invalid"));
    assert.ok(validFiles.length >= 1, `${family} needs >=1 valid fixture`);
    assert.ok(invalidFiles.length >= 1, `${family} needs >=1 invalid fixture`);

    for (const file of validFiles) {
      const instance = JSON.parse(fs.readFileSync(file, "utf8"));
      const result = validateInstance(schema, instance);
      assert.equal(result.valid, true, `${family} valid fixture failed: ${file} ${JSON.stringify(result.errors)}`);
    }

    for (const file of invalidFiles) {
      const instance = JSON.parse(fs.readFileSync(file, "utf8"));
      const result = validateInstance(schema, instance);
      assert.equal(result.valid, false, `${family} invalid fixture unexpectedly passed: ${file}`);
      assert.ok(result.errors.length >= 1);
      assert.ok(
        result.errors.every((e) => typeof e.path === "string" && typeof e.rule === "string"),
        `${family} invalid errors must include path/rule`
      );
    }
  }
});

test("graph-node v1 publishes the canonical semantic-node vocabulary without rejecting legacy v1", () => {
  const schema = loadKernelSchema("graph-node");
  const canonical = {
    schema_version: 1,
    node_id: "repair-auth-session",
    kind: "repair",
    operation: "repair-session-rotation",
    objective: "Admit rotated tokens without breaking existing sessions",
    dependencies: ["localize-auth-flow"],
    ownership: { owner: "worker", mode: "exclusive" },
    allowed_paths: ["src/auth/**", "tests/auth/**"],
    invariants: ["Existing valid sessions remain valid", "Expired tokens remain rejected"],
    required_evidence: ["regression-reproduction", "auth-contract-tests"],
    budget_ref: "repair-default",
    fingerprint: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  };

  assert.equal(validateInstance(schema, canonical).valid, true);
  assert.equal(
    validateInstance(schema, {
      schema_version: 1,
      node_id: "legacy-node",
      kind: "apply",
      operation: "implement-task",
      depends_on: [],
    }).valid,
    true
  );

  const incomplete = validateInstance(schema, {
    schema_version: 1,
    node_id: "partial-canonical-node",
    kind: "repair",
    operation: "repair-session-rotation",
    objective: "Repair session rotation",
  });
  assertRequiredErrors(incomplete, [
    "dependencies",
    "ownership",
    "allowed_paths",
    "invariants",
    "required_evidence",
    "budget_ref",
  ]);
});

test("work-order v1 carries the bounded worker capsule without rejecting legacy v1", () => {
  const schema = loadKernelSchema("work-order");
  const canonical = {
    schema_version: 1,
    work_order_id: "wo-repair-auth-session",
    node_id: "repair-auth-session",
    role: "worker",
    status: "pending",
    operation: "repair-session-rotation",
    objective: "Admit rotated tokens without breaking existing sessions",
    dependencies: ["localize-auth-flow"],
    ownership: { owner: "worker", mode: "exclusive" },
    allowed_paths: ["src/auth/**", "tests/auth/**"],
    invariants: ["Existing valid sessions remain valid", "Expired tokens remain rejected"],
    required_evidence: ["regression-reproduction", "auth-contract-tests"],
    budget: {
      model_turns: 12,
      patches: 2,
      commands: 20,
      wall_time_minutes: 15,
      changed_lines: 150,
    },
  };

  assert.equal(validateInstance(schema, canonical).valid, true);
  assert.equal(
    validateInstance(schema, {
      schema_version: 1,
      work_order_id: "legacy-work-order",
      node_id: "legacy-node",
      role: "worker",
      status: "pending",
    }).valid,
    true
  );

  const incomplete = validateInstance(schema, {
    schema_version: 1,
    work_order_id: "partial-work-order",
    node_id: "repair-auth-session",
    role: "worker",
    status: "pending",
    objective: "Repair session rotation",
  });
  assertRequiredErrors(incomplete, [
    "operation",
    "dependencies",
    "ownership",
    "allowed_paths",
    "invariants",
    "required_evidence",
    "budget",
  ]);
});

test("work-order versions validate only their own fixture families and reject authority", () => {
  const schemaV1 = loadWorkOrderSchema(1);
  const schemaV2 = loadWorkOrderSchema(2);
  const v1 = JSON.parse(
    fs.readFileSync(path.join(ROOT, "schemas", "kernel", "work-order", "fixtures", "valid", "minimal.json"), "utf8")
  );
  const v2 = JSON.parse(
    fs.readFileSync(path.join(ROOT, "schemas", "kernel", "work-order", "fixtures", "valid", "v2-minimal.json"), "utf8")
  );

  assert.equal(validateInstance(schemaV1, v1).valid, true);
  assert.equal(validateInstance(schemaV2, v2).valid, true);
  assert.equal(validateInstance(schemaV1, v2).valid, false, "v2 fixture must not alias v1");
  assert.equal(validateInstance(schemaV2, v1).valid, false, "v1 fixture must not alias v2");

  for (const name of ["v2-missing-source-snapshot.json", "v2-execution-authority.json"]) {
    const fixture = JSON.parse(
      fs.readFileSync(path.join(ROOT, "schemas", "kernel", "work-order", "fixtures", "invalid", name), "utf8")
    );
    assert.equal(validateInstance(schemaV2, fixture).valid, false, `${name} must be rejected`);
  }

  const uppercaseProvenance = { ...v2, source_snapshot_id: `sha256:${"A".repeat(64)}` };
  const sourceSnapshotPattern = new RegExp(schemaV2.properties.source_snapshot_id.pattern);
  assert.equal(sourceSnapshotPattern.test(uppercaseProvenance.source_snapshot_id), false);
});

test("REQ-kernel-contract-schemas-023: WorkOrder v2 requires closed concrete capsule_inputs", () => {
  const schemaV2 = loadWorkOrderSchema(2);
  const valid = JSON.parse(
    fs.readFileSync(path.join(ROOT, "schemas", "kernel", "work-order", "fixtures", "valid", "v2-minimal.json"), "utf8")
  );
  const validResult = validateInstance(schemaV2, valid);
  assert.equal(validResult.valid, true, `valid v2 capsule_inputs must pass: ${JSON.stringify(validResult.errors)}`);
  assert.deepEqual(valid.capsule_inputs, ["src/app.js"]);

  const negatives = [
    ["v2-missing-capsule-inputs.json", "required"],
    ["v2-empty-capsule-inputs.json", "minItems"],
    ["v2-non-array-capsule-inputs.json", "type"],
    ["v2-glob-capsule-inputs.json", "pattern"],
    ["v2-traversal-capsule-inputs.json", "pattern"],
    ["v2-absolute-capsule-inputs.json", "pattern"],
  ];
  for (const [name, expectedRule] of negatives) {
    const fixture = JSON.parse(
      fs.readFileSync(path.join(ROOT, "schemas", "kernel", "work-order", "fixtures", "invalid", name), "utf8")
    );
    const result = validateInstance(schemaV2, fixture);
    assert.equal(result.valid, false, `${name} must fail closed`);
    assert.ok(
      result.errors.some((error) => String(error.path).includes("capsule_inputs") && error.rule === expectedRule),
      `${name} must identify capsule_inputs via ${expectedRule}: ${JSON.stringify(result.errors)}`
    );
  }
});

test("work-order v1 historical schema and fixture snapshot remain pinned", () => {
  const v1Paths = [
    "schemas/kernel/work-order/v1.schema.json",
    "schemas/kernel/work-order/fixtures/valid/minimal.json",
    "schemas/kernel/work-order/fixtures/valid/canonical-bounded-work-order.json",
    "schemas/kernel/work-order/fixtures/invalid/minimal.json",
    "schemas/kernel/work-order/fixtures/invalid/partial-canonical-work-order.json",
  ];
  for (const relativePath of v1Paths) {
    assert.equal(
      digestFile(path.join(ROOT, ...relativePath.split("/"))),
      K1_SCHEMA_BASELINE[relativePath],
      `${relativePath} must retain its frozen K1 digest`
    );
  }
  assert.equal(
    Object.hasOwn(loadWorkOrderSchema(1).properties, "source_snapshot_id"),
    false,
    "frozen work-order/v1 must not absorb v2 provenance"
  );
});

test("receipt v1 binds canonical evaluation outcomes while accepting legacy archive-style receipts", () => {
  const schema = loadKernelSchema("receipt");
  const canonical = {
    schema_version: 1,
    receipt_id: "rc-evaluation-1",
    candidate_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    kind: "delivery",
    digest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    contract_digest: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    graph_digest: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    evidence_digest: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    findings_digest: "sha256:5555555555555555555555555555555555555555555555555555555555555555",
    outcome: "approved",
    valid_for: ["evaluation"],
    issued_at: "2026-08-03T00:00:00Z",
  };

  assert.equal(validateInstance(schema, canonical).valid, true);
  assert.equal(
    validateInstance(schema, {
      schema_version: 1,
      receipt_id: "legacy-archive-receipt",
      candidate_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      kind: "archive",
      digest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    }).valid,
    true
  );

  const unbound = validateInstance(schema, {
    schema_version: 1,
    receipt_id: "rc-unbound-evaluation",
    candidate_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    kind: "delivery",
    digest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    outcome: "approved",
  });
  assertRequiredErrors(unbound, [
    "contract_digest",
    "graph_digest",
    "evidence_digest",
    "findings_digest",
    "valid_for",
  ]);
});
