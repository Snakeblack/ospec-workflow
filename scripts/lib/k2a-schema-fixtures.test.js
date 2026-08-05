"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const test = require("node:test");

const { validateInstance, loadSchemaById } = require("./kernel-schema-validator.js");

const ROOT = path.resolve(__dirname, "..", "..");
const MANIFEST = path.join(ROOT, "schemas", "kernel", "manifest.json");

const K2A_FAMILIES = [
  "host-capabilities",
  "host-adapter",
  "execution-transport",
  "question-transport",
  "worker-transport",
  "tool-execution-transport",
  "delivery-gate-transport",
  "capability-proof",
];

const K2A1_TRANSPORT_ENVELOPE_FAMILIES = [
  "transport-request",
  "transport-outcome",
  "transport-failure",
];

const K21_FAMILIES = ["operation-permit", "operation-receipt", "effect-class"];

/** Pre-change content pins for the five transport port schemas (LF-normalized). */
const TRANSPORT_V1_CONTENT_PINS = Object.freeze({
  "schemas/kernel/execution-transport/v1.schema.json":
    "c31ee709e34f155f64db05448fc45b5f8cc4f08fe4ce1ef15b4a6a36638fd786",
  "schemas/kernel/question-transport/v1.schema.json":
    "5c6e6073d826d8893aee903eb3ee3b2e765eb4bcd224c3bc1c6bac5dced644ff",
  "schemas/kernel/worker-transport/v1.schema.json":
    "bf9e79362ca1f4c5127099ae73712b3c8da44dd6841c1ab75bee36696db0c128",
  "schemas/kernel/tool-execution-transport/v1.schema.json":
    "eb1f399f9c47bbd2e678997f85234b4285c317594b17c36523fc856d707b0c3e",
  "schemas/kernel/delivery-gate-transport/v1.schema.json":
    "a792a5c858133ea6823f2ab84a46cc509fb8a78d7ed0984e961dcab7326d966a",
});

const TRANSPORT_V1_IDS = Object.freeze([
  "ospec://schemas/kernel/execution-transport/v1",
  "ospec://schemas/kernel/question-transport/v1",
  "ospec://schemas/kernel/worker-transport/v1",
  "ospec://schemas/kernel/tool-execution-transport/v1",
  "ospec://schemas/kernel/delivery-gate-transport/v1",
]);

function familyDir(family) {
  return path.join(ROOT, "schemas", "kernel", family);
}

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(".json"))
    .map((n) => path.join(dir, n));
}

function sha256File(rel) {
  // Canonicalize newlines so autocrlf/working-tree CRLF does not drift the pin.
  const text = fs
    .readFileSync(path.join(ROOT, rel), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

test("K2a host-capabilities schema exists with stable $id, closed state enum, fixtures", () => {
  const schemaPath = path.join(familyDir("host-capabilities"), "v1.schema.json");
  assert.ok(fs.existsSync(schemaPath), "host-capabilities schema missing");
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  assert.equal(schema.$id, "ospec://schemas/kernel/host-capabilities/v1");
  assert.equal(schema.schema_version, 1);

  const valid = listJson(path.join(familyDir("host-capabilities"), "fixtures", "valid"));
  const invalid = listJson(path.join(familyDir("host-capabilities"), "fixtures", "invalid"));
  assert.ok(valid.length >= 1);
  assert.ok(invalid.length >= 1);

  for (const file of valid) {
    assert.equal(validateInstance(schema, JSON.parse(fs.readFileSync(file, "utf8"))).valid, true, file);
  }
  for (const file of invalid) {
    const result = validateInstance(schema, JSON.parse(fs.readFileSync(file, "utf8")));
    assert.equal(result.valid, false, file);
    assert.ok(result.errors.some((e) => typeof e.path === "string"));
  }

  const unknown = validateInstance(schema, {
    schema_version: 1,
    kind: "host-capabilities/v1",
    capabilities: { ExecutionTransport: "enabled" },
  });
  assert.equal(unknown.valid, false);
  assert.ok(unknown.errors.some((e) => e.path.includes("ExecutionTransport")));
});

test("K2a host-adapter and five transport schemas exist with fixtures", () => {
  for (const family of [
    "host-adapter",
    "execution-transport",
    "question-transport",
    "worker-transport",
    "tool-execution-transport",
    "delivery-gate-transport",
  ]) {
    const schemaPath = path.join(familyDir(family), "v1.schema.json");
    assert.ok(fs.existsSync(schemaPath), `${family} schema missing`);
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    assert.equal(schema.$id, `ospec://schemas/kernel/${family}/v1`);
    assert.equal(schema.schema_version, 1);
    const valid = listJson(path.join(familyDir(family), "fixtures", "valid"));
    const invalid = listJson(path.join(familyDir(family), "fixtures", "invalid"));
    assert.ok(valid.length >= 1, family);
    assert.ok(invalid.length >= 1, family);
    for (const file of valid) {
      assert.equal(validateInstance(schema, JSON.parse(fs.readFileSync(file, "utf8"))).valid, true, file);
    }
    for (const file of invalid) {
      assert.equal(validateInstance(schema, JSON.parse(fs.readFileSync(file, "utf8"))).valid, false, file);
    }
  }
});

test("K2a CapabilityProof schema requires fields and is distinct from receipt/v1 and OperationReceipt", () => {
  const schemaPath = path.join(familyDir("capability-proof"), "v1.schema.json");
  assert.ok(fs.existsSync(schemaPath));
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  assert.equal(schema.$id, "ospec://schemas/kernel/capability-proof/v1");
  assert.notEqual(schema.$id, "ospec://schemas/kernel/receipt/v1");
  assert.notEqual(schema.$id, "ospec://schemas/kernel/operation-receipt/v1");

  const valid = JSON.parse(
    fs.readFileSync(path.join(familyDir("capability-proof"), "fixtures", "valid", "minimal.json"), "utf8")
  );
  assert.equal(valid.kind, "capability-proof/v1");
  assert.equal(validateInstance(schema, valid).valid, true);

  const missingFixture = validateInstance(schema, {
    schema_version: 1,
    kind: "capability-proof/v1",
    adapter_version: "1.0.0",
    host_version: "k2a-host/1",
    evidence_digest: "sha256:aa",
  });
  assert.equal(missingFixture.valid, false);
  assert.ok(missingFixture.errors.some((e) => e.path === "/fixture" && e.rule === "required"));

  const receiptV1 = JSON.parse(
    fs.readFileSync(path.join(ROOT, "schemas/kernel/receipt/fixtures/valid/minimal.json"), "utf8")
  );
  assert.equal(validateInstance(schema, receiptV1).valid, false);

  const opReceipt = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas/kernel/operation-receipt/fixtures/valid/minimal.json"),
      "utf8"
    )
  );
  assert.equal(validateInstance(schema, opReceipt).valid, false);
});

test("K2a families are registered in schemas/kernel/manifest.json", () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  for (const family of K2A_FAMILIES) {
    const entry = manifest.families[family];
    assert.ok(entry, `missing ${family}`);
    assert.equal(entry.$id, `ospec://schemas/kernel/${family}/v1`);
    assert.equal(entry.schema_version, 1);
    assert.ok(fs.existsSync(path.join(ROOT, entry.path)));
    const loaded = loadSchemaById(entry.$id, { rootDir: ROOT });
    assert.equal(loaded.$id, entry.$id);
  }
});

test("K2.1 OperationPermit/CAS/effect-class and receipt/v1 remain unchanged (additive only)", () => {
  // Pin content digests so K2a does not mutate K2.1 families.
  const pins = {
    "schemas/kernel/receipt/v1.schema.json":
      "4193db3029274e06880a5b2c178e15916cd574841d3d9bd6691ce00151558b46",
    "schemas/kernel/operation-permit/v1.schema.json":
      "f8604ed66a64013ab7912ea425a752409430e2741f946f9e2b76dab331ef0adf",
    "schemas/kernel/operation-receipt/v1.schema.json":
      "6d040cf1826cb67ed4932de028bd039d72d9ddbc81a3f6d7e5dc1bdcce029ca0",
    "schemas/kernel/effect-class/v1.schema.json":
      "48e60ed54af27f06eb99708d535670cb9cea9e4a748709d8f9da95e798a8716e",
  };
  for (const [rel, expected] of Object.entries(pins)) {
    assert.equal(sha256File(rel), expected, rel);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  for (const family of K21_FAMILIES) {
    assert.ok(manifest.families[family], family);
  }
});

test("k2a-1: five existing transport v1 $ids and content pins remain unchanged", () => {
  for (const [rel, expected] of Object.entries(TRANSPORT_V1_CONTENT_PINS)) {
    assert.equal(sha256File(rel), expected, rel);
  }
  for (const family of [
    "execution-transport",
    "question-transport",
    "worker-transport",
    "tool-execution-transport",
    "delivery-gate-transport",
  ]) {
    const schema = JSON.parse(fs.readFileSync(path.join(familyDir(family), "v1.schema.json"), "utf8"));
    assert.equal(schema.$id, `ospec://schemas/kernel/${family}/v1`);
    assert.ok(TRANSPORT_V1_IDS.includes(schema.$id));
  }
});

test("k2a-1: additive transport-request/outcome/failure families exist with fixtures and distinct $ids", () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  for (const family of K2A1_TRANSPORT_ENVELOPE_FAMILIES) {
    const schemaPath = path.join(familyDir(family), "v1.schema.json");
    assert.ok(fs.existsSync(schemaPath), `${family} schema missing`);
    const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
    assert.equal(schema.$id, `ospec://schemas/kernel/${family}/v1`);
    assert.equal(schema.schema_version, 1);
    assert.ok(!TRANSPORT_V1_IDS.includes(schema.$id), `${family} must not alias transport port $id`);

    const valid = listJson(path.join(familyDir(family), "fixtures", "valid"));
    const invalid = listJson(path.join(familyDir(family), "fixtures", "invalid"));
    assert.ok(valid.length >= 1, family);
    assert.ok(invalid.length >= 1, family);
    for (const file of valid) {
      assert.equal(validateInstance(schema, JSON.parse(fs.readFileSync(file, "utf8"))).valid, true, file);
    }
    for (const file of invalid) {
      assert.equal(validateInstance(schema, JSON.parse(fs.readFileSync(file, "utf8"))).valid, false, file);
    }

    const entry = manifest.families[family];
    assert.ok(entry, `missing ${family} in manifest`);
    assert.equal(entry.$id, schema.$id);
  }

  const failureSchema = JSON.parse(
    fs.readFileSync(path.join(familyDir("transport-failure"), "v1.schema.json"), "utf8")
  );
  assert.deepEqual(failureSchema.properties.ok, { const: false });
  assert.ok(failureSchema.required.includes("failure_class"));
});

test("k2a-1: CapabilityProof schema requires adapter_id and probe_digest", () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(familyDir("capability-proof"), "v1.schema.json"), "utf8")
  );
  assert.equal(schema.$id, "ospec://schemas/kernel/capability-proof/v1");
  assert.ok(schema.required.includes("adapter_id"));
  assert.ok(schema.required.includes("probe_digest"));
  assert.ok(schema.properties.adapter_id);
  assert.ok(schema.properties.probe_digest);

  const missingProbe = validateInstance(schema, {
    schema_version: 1,
    kind: "capability-proof/v1",
    adapter_id: "claude",
    adapter_version: "1.0.0",
    host_version: "k2a-host/1",
    fixture: "f.json",
    evidence_digest: "sha256:aa",
  });
  assert.equal(missingProbe.valid, false);
  assert.ok(missingProbe.errors.some((e) => e.path === "/probe_digest"));
});
