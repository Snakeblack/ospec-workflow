"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { validateInstance, loadSchemaById } = require("./kernel-schema-validator.js");

const ROOT = path.resolve(__dirname, "..", "..");
const MANIFEST = path.join(ROOT, "schemas", "kernel", "manifest.json");

const K21_FAMILIES = ["operation-permit", "operation-receipt", "effect-class"];

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

test("K2.1 operation-permit schema exists with stable $id and fixtures", () => {
  const schemaPath = path.join(familyDir("operation-permit"), "v1.schema.json");
  assert.ok(fs.existsSync(schemaPath), "operation-permit schema missing");
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  assert.equal(schema.$id, "ospec://schemas/kernel/operation-permit/v1");
  assert.equal(schema.schema_version, 1);

  const validFiles = listJson(path.join(familyDir("operation-permit"), "fixtures", "valid"));
  const invalidFiles = listJson(path.join(familyDir("operation-permit"), "fixtures", "invalid"));
  assert.ok(validFiles.length >= 1);
  assert.ok(invalidFiles.length >= 1);

  for (const file of validFiles) {
    const instance = JSON.parse(fs.readFileSync(file, "utf8"));
    const result = validateInstance(schema, instance);
    assert.equal(result.valid, true, `${file}: ${JSON.stringify(result.errors)}`);
    assert.equal(instance.single_use, true);
  }
  for (const file of invalidFiles) {
    const instance = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(validateInstance(schema, instance).valid, false);
  }

  const byId = loadSchemaById("ospec://schemas/kernel/operation-permit/v1", { rootDir: ROOT });
  assert.equal(byId.$id, schema.$id);
});

test("K2.1 operation-receipt schema is distinct from receipt/v1", () => {
  const schemaPath = path.join(familyDir("operation-receipt"), "v1.schema.json");
  assert.ok(fs.existsSync(schemaPath), "operation-receipt schema missing");
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  assert.equal(schema.$id, "ospec://schemas/kernel/operation-receipt/v1");
  assert.notEqual(schema.$id, "ospec://schemas/kernel/receipt/v1");

  const valid = JSON.parse(
    fs.readFileSync(path.join(familyDir("operation-receipt"), "fixtures", "valid", "minimal.json"), "utf8")
  );
  assert.equal(valid.kind, "operation-receipt/v1");
  assert.equal(validateInstance(schema, valid).valid, true);

  const receiptV1 = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, "schemas", "kernel", "receipt", "fixtures", "valid", "minimal.json"),
      "utf8"
    )
  );
  const asOpReceipt = validateInstance(schema, receiptV1);
  assert.equal(asOpReceipt.valid, false, "receipt/v1 payload must not validate as OperationReceipt");
});

test("K2.1 effect-class schema accepts closed enum only", () => {
  const schemaPath = path.join(familyDir("effect-class"), "v1.schema.json");
  assert.ok(fs.existsSync(schemaPath), "effect-class schema missing");
  const schema = JSON.parse(fs.readFileSync(schemaPath, "utf8"));
  assert.equal(schema.$id, "ospec://schemas/kernel/effect-class/v1");

  const allowed = ["pure", "idempotent-keyed", "probeable", "compensatable", "irreversible"];
  for (const value of allowed) {
    assert.equal(
      validateInstance(schema, { schema_version: 1, effect_class: value }).valid,
      true,
      value
    );
  }
  assert.equal(
    validateInstance(schema, { schema_version: 1, effect_class: "exactly-once" }).valid,
    false
  );
  assert.equal(
    validateInstance(schema, { schema_version: 1, effect_class: "unknown-class" }).valid,
    false
  );
  assert.equal(validateInstance(schema, { schema_version: 1 }).valid, false);
});

test("K2.1 families are registered in schemas/kernel/manifest.json", () => {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  for (const family of K21_FAMILIES) {
    const entry = manifest.families[family];
    assert.ok(entry, `missing manifest family ${family}`);
    assert.equal(entry.$id, `ospec://schemas/kernel/${family}/v1`);
    assert.equal(entry.schema_version, 1);
    assert.ok(fs.existsSync(path.join(ROOT, entry.path)));
  }
});
