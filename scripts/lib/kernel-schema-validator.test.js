"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  validateInstance,
  loadSchemaById,
  validateSchemaDocument,
} = require("./kernel-schema-validator.js");

test("validateInstance accepts matching type/properties/required", () => {
  const schema = {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["execute", "collect"] },
      operation: { type: "string" },
    },
    required: ["kind", "operation"],
    additionalProperties: false,
  };
  const result = validateInstance(schema, { kind: "execute", operation: "repair-node" });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("validateInstance rejects missing required and wrong type", () => {
  const schema = {
    type: "object",
    properties: { kind: { type: "string" }, n: { type: "number" } },
    required: ["kind", "n"],
  };
  const missing = validateInstance(schema, { kind: "execute" });
  assert.equal(missing.valid, false);
  assert.ok(missing.errors.some((e) => e.rule === "required" && e.path.includes("n")));

  const wrongType = validateInstance(schema, { kind: "execute", n: "nope" });
  assert.equal(wrongType.valid, false);
  assert.ok(wrongType.errors.some((e) => e.rule === "type"));
});

test("validateInstance enforces enum, const, and additionalProperties:false", () => {
  const schema = {
    type: "object",
    properties: {
      schema_version: { const: 1 },
      route: { type: "string", enum: ["direct", "repair", "planned", "critical"] },
    },
    required: ["schema_version", "route"],
    additionalProperties: false,
  };
  assert.equal(validateInstance(schema, { schema_version: 1, route: "planned" }).valid, true);
  assert.equal(validateInstance(schema, { schema_version: 2, route: "planned" }).valid, false);
  assert.equal(validateInstance(schema, { schema_version: 1, route: "unknown" }).valid, false);
  assert.equal(
    validateInstance(schema, { schema_version: 1, route: "planned", extra: true }).valid,
    false
  );
});

test("validateInstance supports oneOf and local $ref", () => {
  const schema = {
    $defs: {
      tokenArg: {
        type: "object",
        properties: {
          name: { type: "string" },
          token: { type: "string" },
        },
        required: ["name", "token"],
        additionalProperties: false,
      },
    },
    oneOf: [
      {
        type: "object",
        properties: {
          kind: { const: "execute" },
          arguments: { type: "array", items: { $ref: "#/$defs/tokenArg" } },
        },
        required: ["kind", "arguments"],
      },
      {
        type: "object",
        properties: { kind: { const: "stop" } },
        required: ["kind"],
      },
    ],
  };
  assert.equal(
    validateInstance(schema, {
      kind: "execute",
      arguments: [{ name: "node_id", token: "--node-id=x" }],
    }).valid,
    true
  );
  assert.equal(validateInstance(schema, { kind: "stop" }).valid, true);
  assert.equal(validateInstance(schema, { kind: "collect" }).valid, false);
  assert.equal(
    validateInstance(schema, {
      kind: "execute",
      arguments: [{ name: "node_id" }],
    }).valid,
    false
  );
});

test("validateInstance supports if/then discrimination", () => {
  const schema = {
    type: "object",
    properties: {
      kind: { type: "string" },
      command: { type: "string" },
    },
    required: ["kind"],
    if: { properties: { kind: { const: "execute" } }, required: ["kind"] },
    then: { required: ["command"] },
  };
  assert.equal(validateInstance(schema, { kind: "decide" }).valid, true);
  assert.equal(validateInstance(schema, { kind: "execute", command: "ospec x" }).valid, true);
  const fail = validateInstance(schema, { kind: "execute" });
  assert.equal(fail.valid, false);
  assert.ok(fail.errors.some((e) => e.rule === "required" || e.rule === "then"));
});

test("boolean false schema rejects all instances", () => {
  const result = validateInstance(false, { anything: true });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "false"));
});

test("boolean true schema accepts all instances", () => {
  assert.equal(validateInstance(true, { anything: true }).valid, true);
  assert.equal(validateInstance(true, null).valid, true);
});

test("non-object schemas are rejected as invalid schemas", () => {
  for (const bad of [null, undefined, "not-a-schema", 42]) {
    const result = validateInstance(bad, { kind: "execute" });
    assert.equal(result.valid, false, `expected invalid for schema=${String(bad)}`);
    assert.ok(result.errors.some((e) => e.rule === "schema"));
  }
});

test("validateInstance normalizes non-object options to deterministic defaults", () => {
  const schema = { type: "string" };
  const expected = { valid: true, errors: [] };

  for (const opts of [undefined, null, false, 0, "", [], () => {}]) {
    assert.deepEqual(validateInstance(schema, "value", opts), expected);
  }

  const rootSchema = { $defs: { value: schema } };
  assert.deepEqual(validateInstance({ $ref: "#/$defs/value" }, "value", { rootSchema }), expected);
});

test("unresolved local \$ref reports an error", () => {
  const schema = {
    type: "object",
    properties: {
      node: { $ref: "#/\$defs/missing" },
    },
  };
  const result = validateInstance(schema, { node: {} });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.rule === "\$ref"));
});

test("validateInstance covers nested schemas, else branches, and compound equality", () => {
  const additionalPropertySchema = {
    type: "object",
    additionalProperties: { type: "string" },
  };
  assert.equal(validateInstance(additionalPropertySchema, { label: "ok" }).valid, true);
  assert.equal(validateInstance(additionalPropertySchema, { label: 2 }).valid, false);

  const conditionalSchema = {
    if: { type: "string" },
    then: { const: "accepted" },
    else: { type: "number" },
  };
  assert.equal(validateInstance(conditionalSchema, 3).valid, true);
  assert.equal(validateInstance(conditionalSchema, false).valid, false);

  assert.equal(validateInstance({ type: ["null", "string"] }, null).valid, true);
  assert.equal(validateInstance({ type: "unsupported" }, "value").valid, false);
  assert.equal(validateInstance({ enum: [[1, 2], { a: true }] }, [1, 2]).valid, true);
  assert.equal(validateInstance({ enum: [[1, 2], { a: true }] }, [1]).valid, false);
  assert.equal(validateInstance({ const: { a: true } }, { a: true }).valid, true);
  assert.equal(validateInstance({ const: { a: true } }, { b: true }).valid, false);
});

test("loadSchemaById resolves from manifest and refuses silent version substitution", () => {
  const manifest = {
    families: {
      "state-transition": {
        path: "schemas/kernel/state-transition/v1.schema.json",
        $id: "ospec://schemas/kernel/state-transition/v1",
        schema_version: 1,
      },
    },
  };
  const schemas = {
    "ospec://schemas/kernel/state-transition/v1": {
      $id: "ospec://schemas/kernel/state-transition/v1",
      schema_version: 1,
      type: "object",
    },
  };
  const loaded = loadSchemaById("ospec://schemas/kernel/state-transition/v1", {
    manifest,
    schemas,
  });
  assert.equal(loaded.$id, "ospec://schemas/kernel/state-transition/v1");
  assert.equal(loaded.schema_version, 1);

  assert.throws(
    () =>
      loadSchemaById("ospec://schemas/kernel/state-transition/v2", {
        manifest,
        schemas,
      }),
    /not found|unresolved|unknown/i
  );
});

test("loadSchemaById validates the exact $id and version of an in-memory schema", () => {
  const id = "ospec://schemas/kernel/state-transition/v1";

  assert.throws(
    () =>
      loadSchemaById(id, {
        schemas: {
          [id]: {
            $id: "ospec://schemas/kernel/state-transition/v2",
            schema_version: 1,
          },
        },
      }),
    /schema \$id mismatch.*expected.*\/v1.*got.*\/v2/i
  );

  assert.throws(
    () =>
      loadSchemaById(id, {
        schemas: {
          [id]: {
            $id: id,
            schema_version: 2,
          },
        },
      }),
    /schema version mismatch.*expected 1.*got 2/i
  );
});

test("loadSchemaById rejects traversal and absolute schema paths outside rootDir", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kernel-schema-paths-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const rootDir = path.join(tempDir, "root");
  fs.mkdirSync(rootDir);
  const outsidePath = path.join(tempDir, "outside.schema.json");
  fs.writeFileSync(
    outsidePath,
    JSON.stringify({
      $id: "ospec://schemas/kernel/state-transition/v1",
      schema_version: 1,
    })
  );

  for (const schemaPath of ["../outside.schema.json", outsidePath]) {
    assert.throws(
      () =>
        loadSchemaById("ospec://schemas/kernel/state-transition/v1", {
          rootDir,
          manifest: {
            families: {
              transition: {
                path: schemaPath,
                $id: "ospec://schemas/kernel/state-transition/v1",
                schema_version: 1,
              },
            },
          },
        }),
      /schema path must stay within rootDir/i
    );
  }
});

test("loadSchemaById reports controlled manifest I/O and JSON errors", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kernel-schema-manifest-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  assert.throws(
    () => loadSchemaById("ospec://schemas/kernel/state-transition/v1", { rootDir: tempDir }),
    /^Error: schema manifest read failed$/
  );

  const manifestDir = path.join(tempDir, "schemas", "kernel");
  fs.mkdirSync(manifestDir, { recursive: true });
  fs.writeFileSync(path.join(manifestDir, "manifest.json"), "{ not-json");
  assert.throws(
    () => loadSchemaById("ospec://schemas/kernel/state-transition/v1", { rootDir: tempDir }),
    /^Error: schema manifest JSON invalid$/
  );
});

test("loadSchemaById reports controlled schema I/O and JSON errors", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kernel-schema-document-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const id = "ospec://schemas/kernel/state-transition/v1";
  const relativePath = "schemas/kernel/state-transition/v1.schema.json";
  const manifest = {
    families: {
      transition: { path: relativePath, $id: id, schema_version: 1 },
    },
  };

  assert.throws(
    () => loadSchemaById(id, { rootDir: tempDir, manifest }),
    /^Error: schema document read failed: ospec:\/\/schemas\/kernel\/state-transition\/v1$/
  );

  const schemaDir = path.join(tempDir, "schemas", "kernel", "state-transition");
  fs.mkdirSync(schemaDir, { recursive: true });
  fs.writeFileSync(path.join(schemaDir, "v1.schema.json"), "[ broken");
  assert.throws(
    () => loadSchemaById(id, { rootDir: tempDir, manifest }),
    /^Error: schema document JSON invalid: ospec:\/\/schemas\/kernel\/state-transition\/v1$/
  );
});

test("loadSchemaById rejects malformed public loader inputs deterministically", () => {
  const id = "ospec://schemas/kernel/state-transition/v1";
  const family = { $id: id, schema_version: 1 };

  assert.throws(() => loadSchemaById("", {}), /schema \$id is required/);
  assert.throws(() => loadSchemaById(id, null), {
    name: "TypeError",
    message: "schema loader options must be an object",
  });
  assert.throws(() => loadSchemaById("ospec://schemas/kernel/state-transition/latest"), /positive version/);
  assert.throws(() => loadSchemaById(id, { schemas: [] }), /schemas map must be an object/);
  assert.throws(() => loadSchemaById(id, { manifest: [] }), /schema manifest must be an object/);
  assert.throws(
    () => loadSchemaById(id, { schemas: { [id]: null } }),
    /schema document invalid.*expected an object/
  );
  assert.throws(
    () =>
      loadSchemaById(id, {
        manifest: { families: { transition: { ...family, schema_version: 2 } } },
      }),
    /schema manifest version mismatch.*expected 1.*got 2/
  );
  assert.throws(
    () => loadSchemaById(id, { manifest: { families: { transition: family } } }),
    /unresolved \(no rootDir\)/
  );
  assert.throws(
    () =>
      loadSchemaById(id, {
        manifest: { families: { transition: family } },
        schemas: {},
      }),
    /not found in schemas map/
  );
});

test("REQ-kernel-contract-schemas-029: validateSchemaDocument rejects duplicate required even with Draft 2020-12 URI", () => {
  const fixtureSchema = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "ospec://schemas/test/duplicate-required/v1",
    type: "object",
    properties: {
      a: { type: "string" },
      nested: {
        type: "object",
        properties: { x: { type: "string" } },
        required: ["x", "x"],
      },
    },
    required: ["a", "a"],
  };
  const result = validateSchemaDocument(fixtureSchema);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.rule === "uniqueItems"));
  assert.equal(fixtureSchema.$schema, "https://json-schema.org/draft/2020-12/schema");

  const unique = validateSchemaDocument({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    required: ["a", "b"],
    properties: { nested: { type: "object", required: ["x"] } },
  });
  assert.equal(unique.valid, true);
});
