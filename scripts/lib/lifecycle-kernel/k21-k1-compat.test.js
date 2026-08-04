"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { validateInstance, loadSchemaById } = require("../kernel-schema-validator.js");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const RECEIPT_SCHEMA = path.join(ROOT, "schemas", "kernel", "receipt", "v1.schema.json");
const RECEIPT_VALID = path.join(
  ROOT,
  "schemas",
  "kernel",
  "receipt",
  "fixtures",
  "valid",
  "minimal.json"
);
const BASELINE_RECEIPT_SHA =
  "sha256:40f9a7566101c5efb13e2a51b78b8782975d85f6c59c27db25093362ea04a9cf";

function fileSha(p) {
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex")}`;
}

test("K1 receipt/v1 schema bytes remain unchanged under K2.1", () => {
  assert.ok(fs.existsSync(RECEIPT_SCHEMA));
  assert.equal(fileSha(RECEIPT_SCHEMA), BASELINE_RECEIPT_SHA);
  const schema = JSON.parse(fs.readFileSync(RECEIPT_SCHEMA, "utf8"));
  assert.equal(schema.$id, "ospec://schemas/kernel/receipt/v1");
  assert.equal(schema.schema_version, 1);
});

test("K1 receipt/v1 still validates its fixtures and is not OperationReceipt", () => {
  const schema = loadSchemaById("ospec://schemas/kernel/receipt/v1", { rootDir: ROOT });
  const instance = JSON.parse(fs.readFileSync(RECEIPT_VALID, "utf8"));
  const result = validateInstance(schema, instance);
  assert.equal(result.valid, true);
  assert.notEqual(instance.kind, "operation-receipt/v1");
  assert.notEqual(schema.$id, "ospec://schemas/kernel/operation-receipt/v1");
});
