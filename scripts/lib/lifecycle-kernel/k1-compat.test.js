"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  K1_SCHEMA_BASELINE,
  digestFile,
  listK1SchemaFiles,
  assertK1SchemasUnchanged,
} = require("./k1-compat.js");

const ROOT = path.resolve(__dirname, "..", "..", "..");

test("K1_SCHEMA_BASELINE pins aliases and every schema family", () => {
  assert.equal(typeof K1_SCHEMA_BASELINE, "object");
  assert.ok(K1_SCHEMA_BASELINE["schemas/kernel/aliases/v1.json"]);
  assert.ok(K1_SCHEMA_BASELINE["schemas/kernel/state-transition/v1.schema.json"]);
  assert.ok(K1_SCHEMA_BASELINE["schemas/kernel/event/v1.schema.json"]);
  assert.ok(K1_SCHEMA_BASELINE["schemas/kernel/candidate/v1.schema.json"]);
  assert.match(K1_SCHEMA_BASELINE["schemas/kernel/aliases/v1.json"], /^sha256:[a-f0-9]{64}$/);
});

test("listK1SchemaFiles enumerates schemas/kernel JSON artifacts", () => {
  const files = listK1SchemaFiles(ROOT);
  assert.ok(files.includes("schemas/kernel/aliases/v1.json"));
  assert.ok(files.some((f) => f.endsWith("v1.schema.json")));
  assert.equal(files.length, Object.keys(K1_SCHEMA_BASELINE).length);
});

test("digestFile is stable for aliases document", () => {
  const relative = "schemas/kernel/aliases/v1.json";
  const digest = digestFile(path.join(ROOT, ...relative.split("/")));
  assert.equal(digest, K1_SCHEMA_BASELINE[relative]);
});

test("digestFile is invariant to CRLF vs LF working-tree newlines", () => {
  const fixtureDir = path.join(ROOT, "scripts", "lib", "lifecycle-kernel", "__k1-compat-eol");
  fs.mkdirSync(fixtureDir, { recursive: true });
  const lfPath = path.join(fixtureDir, "lf.json");
  const crlfPath = path.join(fixtureDir, "crlf.json");
  const payload = '{\n  "schema_version": 1\n}\n';
  fs.writeFileSync(lfPath, payload, "utf8");
  fs.writeFileSync(crlfPath, payload.replace(/\n/g, "\r\n"), "utf8");
  assert.equal(digestFile(lfPath), digestFile(crlfPath));
  fs.rmSync(fixtureDir, { recursive: true, force: true });
});

test("assertK1SchemasUnchanged passes against current tree", () => {
  const result = assertK1SchemasUnchanged(ROOT);
  assert.equal(result.ok, true);
  assert.equal(result.checked, Object.keys(K1_SCHEMA_BASELINE).length);
  assert.deepEqual(result.changed, []);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.unexpected, []);
});

test("assertK1SchemasUnchanged detects a digest drift", () => {
  const fakeRoot = path.join(ROOT, "scripts", "lib", "lifecycle-kernel", "__k1-compat-fixture");
  fs.mkdirSync(path.join(fakeRoot, "schemas", "kernel"), { recursive: true });
  const relative = "schemas/kernel/aliases/v1.json";
  const target = path.join(fakeRoot, ...relative.split("/"));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, '{"schema_version":1,"aliases":{},"known_consumer_tags":[]}\n', "utf8");

  // Build a tiny baseline with only this file so the assertion is local.
  const baseline = { [relative]: "sha256:deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef" };
  const result = assertK1SchemasUnchanged(fakeRoot, baseline);
  assert.equal(result.ok, false);
  assert.ok(result.changed.includes(relative));

  fs.rmSync(fakeRoot, { recursive: true, force: true });
});
