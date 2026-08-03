"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { check, conditionRequires } = require("./k1-schema-compat.js");

const ROOT = path.resolve(__dirname, "..", "..", "..");

function writeFamily(root, options = {}) {
  const family = options.family || "classification";
  const version = options.version === undefined ? 1 : options.version;
  const schemaDir = path.join(root, "schemas", "kernel", family);
  fs.mkdirSync(schemaDir, { recursive: true });
  const schema = options.schema || {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `ospec://schemas/kernel/${family}/v${version}`,
    schema_version: version,
    type: "object",
    properties: {
      schema_version: { const: version },
      route: { type: "string", enum: ["direct", "planned"] },
    },
    required: ["schema_version", "route"],
    additionalProperties: false,
  };
  const rel = options.manifestPath || `schemas/kernel/${family}/v${version}.schema.json`;
  const manifest = {
    schema_version: 1,
    families: {
      [family]: {
        path: rel,
        $id: options.manifestId || `ospec://schemas/kernel/${family}/v${version}`,
        schema_version: version,
      },
    },
  };
  fs.mkdirSync(path.join(root, "schemas", "kernel"), { recursive: true });
  fs.writeFileSync(path.join(root, "schemas", "kernel", "manifest.json"), JSON.stringify(manifest));
  if (!options.skipSchema) fs.writeFileSync(path.join(schemaDir, `v${version}.schema.json`), JSON.stringify(schema));
  if (options.claims !== undefined) {
    fs.writeFileSync(
      path.join(root, "schemas", "kernel", "contract-claims.json"),
      typeof options.claims === "string" ? options.claims : JSON.stringify(options.claims)
    );
  }
  return { schemaDir, family };
}

test("k1-schema-compat passes against the real kernel manifest", () => {
  assert.deepEqual(check({ root: ROOT }), []);
});

test("schema family missing $id is an offender", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-schema-compat-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const schemaDir = path.join(root, "schemas", "kernel", "classification");
  fs.mkdirSync(schemaDir, { recursive: true });
  fs.writeFileSync(
    path.join(root, "schemas", "kernel", "manifest.json"),
    JSON.stringify({
      families: {
        classification: {
          path: "schemas/kernel/classification/v1.schema.json",
          $id: "ospec://schemas/kernel/classification/v1",
          schema_version: 1,
        },
      },
    })
  );
  fs.writeFileSync(
    path.join(schemaDir, "v1.schema.json"),
    JSON.stringify({ schema_version: 1, type: "object", properties: {} })
  );

  const offenders = check({ root });
  assert.ok(offenders.some((o) => /missing required \$id/i.test(o.message)));
});

test("mandatory contract claims cannot be omitted", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-schema-compat-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  writeFamily(root);
  const offenders = check({ root });
  assert.ok(offenders.some((o) => /contract-claims\.json.*could not be read|required/i.test(o.message)));
});

test("malformed claim JSON is reported as an offender instead of throwing", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-schema-compat-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  writeFamily(root, { claims: "{not-json" });
  let offenders;
  assert.doesNotThrow(() => {
    offenders = check({ root });
  });
  assert.ok(offenders.some((o) => /contract-claims\.json.*could not be read/i.test(o.message)));
});

test("manifest id, version and canonical path must agree with the schema", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-schema-compat-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  writeFamily(root, {
    manifestId: "ospec://schemas/kernel/classification/v2",
    claims: { schema_version: 1, families: {} },
  });
  const offenders = check({ root });
  assert.ok(offenders.some((o) => /\$id.*mismatch|must equal/i.test(o.message)));
});

test("schema paths are confined to schemas/kernel under the repository root", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-schema-compat-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  writeFamily(root, {
    manifestPath: "../outside/v1.schema.json",
    claims: { schema_version: 1, families: {} },
  });
  const offenders = check({ root });
  assert.ok(offenders.some((o) => /confined|canonical path|outside/i.test(o.message)));
});

test("additional manifest families cannot hide an escaping path", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-schema-compat-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  writeFamily(root, { claims: { schema_version: 1, families: {} } });
  const manifestPath = path.join(root, "schemas", "kernel", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.families["future-family"] = {
    path: "../../outside.schema.json",
    $id: "ospec://schemas/kernel/future-family/v1",
    schema_version: 1,
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));

  const offenders = check({ root });
  assert.ok(offenders.some((o) => /future-family.*(?:canonical path|outside|confined)/i.test(o.message)));
});

test("required field, enum and command-shape contradictions are offenders", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-schema-compat-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  writeFamily(root, {
    family: "state-transition",
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "ospec://schemas/kernel/state-transition/v1",
      schema_version: 1,
      type: "object",
      properties: {
        schema_version: { const: 1 },
        kind: { type: "string", enum: ["collect"] },
        operation: { type: "string" },
      },
      required: ["schema_version", "kind", "operation"],
      additionalProperties: false,
    },
    claims: {
      schema_version: 1,
      families: {
        "state-transition": {
          required_fields: ["schema_version", "kind", "operation", "command"],
          enum_values: { kind: ["execute", "collect"] },
          command_shapes: [
            {
              kind: "execute",
              requires: ["command"],
              argument_required_fields: ["token"],
            },
          ],
        },
      },
    },
  });

  const offenders = check({ root });
  assert.ok(offenders.some((o) => /command.*not allowed|required field.*command/i.test(o.message)));
  assert.ok(offenders.some((o) => /execute.*enum|enum.*execute/i.test(o.message)));
  assert.ok(offenders.some((o) => /argument.*token|token.*argument/i.test(o.message)));
});

test("invalid claim field types are offenders", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-schema-compat-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  writeFamily(root, {
    claims: {
      schema_version: "1",
      families: { classification: { required_fields: "route", enum_values: [] } },
    },
  });
  const offenders = check({ root });
  assert.ok(offenders.some((o) => /schema_version.*integer/i.test(o.message)));
  assert.ok(offenders.some((o) => /required_fields.*array/i.test(o.message)));
  assert.ok(offenders.some((o) => /enum_values.*object/i.test(o.message)));
});

test("fixture parse errors and inverted validity declarations are offenders", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-schema-compat-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const claims = {
    schema_version: 1,
    families: {
      classification: {
        required_fields: ["schema_version", "route"],
        enum_values: { route: ["direct"] },
        command_shapes: [],
      },
    },
  };
  const { schemaDir } = writeFamily(root, { claims });
  const validDir = path.join(schemaDir, "fixtures", "valid");
  const invalidDir = path.join(schemaDir, "fixtures", "invalid");
  fs.mkdirSync(validDir, { recursive: true });
  fs.mkdirSync(invalidDir, { recursive: true });
  fs.writeFileSync(path.join(validDir, "malformed.json"), "{bad-json");
  fs.writeFileSync(path.join(validDir, "rejected.json"), JSON.stringify({ schema_version: 1 }));
  fs.writeFileSync(
    path.join(invalidDir, "accepted.json"),
    JSON.stringify({ schema_version: 1, route: "direct" })
  );

  const offenders = check({ root });
  assert.ok(offenders.some((item) => /malformed\.json could not be read/.test(item.message)));
  assert.ok(offenders.some((item) => /rejected\.json is declared valid but was rejected/.test(item.message)));
  assert.ok(offenders.some((item) => /accepted\.json is declared invalid but was accepted/.test(item.message)));
});

test("manifest and claims container types fail closed with actionable offenders", (t) => {
  const roots = [];
  t.after(() => {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  });
  const makeRoot = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-schema-compat-"));
    roots.push(root);
    return root;
  };

  const arrayManifestRoot = makeRoot();
  fs.mkdirSync(path.join(arrayManifestRoot, "schemas", "kernel"), { recursive: true });
  fs.writeFileSync(path.join(arrayManifestRoot, "schemas", "kernel", "manifest.json"), "[]");
  fs.writeFileSync(path.join(arrayManifestRoot, "schemas", "kernel", "contract-claims.json"), "{}");
  assert.ok(check({ root: arrayManifestRoot }).some((item) => /manifest\.json must contain an object/.test(item.message)));

  const badFamiliesRoot = makeRoot();
  fs.mkdirSync(path.join(badFamiliesRoot, "schemas", "kernel"), { recursive: true });
  fs.writeFileSync(
    path.join(badFamiliesRoot, "schemas", "kernel", "manifest.json"),
    JSON.stringify({ schema_version: 2, families: [] })
  );
  fs.writeFileSync(path.join(badFamiliesRoot, "schemas", "kernel", "contract-claims.json"), "{}");
  const badFamilies = check({ root: badFamiliesRoot });
  assert.ok(badFamilies.some((item) => /manifest\.json schema_version must be integer 1/.test(item.message)));
  assert.ok(badFamilies.some((item) => /manifest\.json families must be an object/.test(item.message)));

  const arrayClaimsRoot = makeRoot();
  writeFamily(arrayClaimsRoot, { claims: [] });
  assert.ok(check({ root: arrayClaimsRoot }).some((item) => /contract-claims\.json must contain an object/.test(item.message)));

  const badClaimFamiliesRoot = makeRoot();
  writeFamily(badClaimFamiliesRoot, { claims: { schema_version: 1, families: [] } });
  assert.ok(check({ root: badClaimFamiliesRoot }).some((item) => /contract-claims\.json families must be an object/.test(item.message)));

  const unknownClaimRoot = makeRoot();
  writeFamily(unknownClaimRoot, {
    claims: {
      schema_version: 1,
      families: {
        ghost: { required_fields: ["schema_version"], enum_values: {}, command_shapes: [] },
      },
    },
  });
  const manifestPath = path.join(unknownClaimRoot, "schemas", "kernel", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.families.Bad_Name = manifest.families.classification;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  const unknown = check({ root: unknownClaimRoot });
  assert.ok(unknown.some((item) => /claims unknown family ghost/.test(item.message)));
  assert.ok(unknown.some((item) => /invalid family name Bad_Name/.test(item.message)));
});

test("schema entry, JSON and metadata failures are reported without throwing", (t) => {
  const roots = [];
  t.after(() => {
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  });
  const makeFamily = () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-schema-compat-"));
    roots.push(root);
    return { root, ...writeFamily(root, { claims: { schema_version: 1, families: {} } }) };
  };

  const nonObject = makeFamily();
  const nonObjectManifestPath = path.join(nonObject.root, "schemas", "kernel", "manifest.json");
  const nonObjectManifest = JSON.parse(fs.readFileSync(nonObjectManifestPath, "utf8"));
  nonObjectManifest.families.classification = null;
  fs.writeFileSync(nonObjectManifestPath, JSON.stringify(nonObjectManifest));
  assert.ok(check({ root: nonObject.root }).some((item) => /families\/classification must be an object/.test(item.message)));

  const badVersion = makeFamily();
  const badVersionManifestPath = path.join(badVersion.root, "schemas", "kernel", "manifest.json");
  const badVersionManifest = JSON.parse(fs.readFileSync(badVersionManifestPath, "utf8"));
  badVersionManifest.families.classification.schema_version = 0;
  fs.writeFileSync(badVersionManifestPath, JSON.stringify(badVersionManifest));
  const badVersionOffenders = check({ root: badVersion.root });
  assert.ok(badVersionOffenders.some((item) => /schema_version must be a positive integer/.test(item.message)));
  assert.ok(badVersionOffenders.some((item) => /path must equal canonical path/.test(item.message)));

  const missingSchema = makeFamily();
  fs.rmSync(path.join(missingSchema.schemaDir, "v1.schema.json"));
  assert.ok(check({ root: missingSchema.root }).some((item) => /could not be resolved/.test(item.message)));

  const malformedSchema = makeFamily();
  fs.writeFileSync(path.join(malformedSchema.schemaDir, "v1.schema.json"), "{bad-json");
  assert.ok(check({ root: malformedSchema.root }).some((item) => /could not be read/.test(item.message)));

  const arraySchema = makeFamily();
  fs.writeFileSync(path.join(arraySchema.schemaDir, "v1.schema.json"), "[]");
  assert.ok(check({ root: arraySchema.root }).some((item) => /must contain an object/.test(item.message)));

  const badMetadata = makeFamily();
  fs.writeFileSync(
    path.join(badMetadata.schemaDir, "v1.schema.json"),
    JSON.stringify({
      $schema: "draft-07",
      $id: "",
      schema_version: "1",
      type: "array",
      properties: [],
      required: "route",
    })
  );
  const metadata = check({ root: badMetadata.root });
  for (const expected of [
    /Draft 2020-12/,
    /missing required \$id/,
    /schema_version must be an integer/,
    /top-level type must be object/,
    /properties must be an object/,
    /required must be an array/,
  ]) {
    assert.ok(metadata.some((item) => expected.test(item.message)), `missing offender ${expected}`);
  }
});

test("claim semantics reject optional requirements, absent enums and malformed command shapes", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-schema-compat-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeFamily(root, {
    claims: {
      schema_version: 1,
      families: {
        classification: {
          required_fields: ["schema_version", "route"],
          enum_values: { risk: ["high"] },
          command_shapes: "execute",
        },
      },
    },
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "ospec://schemas/kernel/classification/v1",
      schema_version: 1,
      type: "object",
      properties: {
        schema_version: { const: 1 },
        route: { type: "string" },
        risk: { type: "string" },
      },
      required: ["schema_version"],
      additionalProperties: false,
    },
  });
  const offenders = check({ root });
  assert.ok(offenders.some((item) => /asserts required field route.*does not require it/.test(item.message)));
  assert.ok(offenders.some((item) => /asserts enum values for risk.*has no enum/.test(item.message)));
  assert.ok(offenders.some((item) => /command_shapes must be an array/.test(item.message)));

  const nonObjectClaimRoot = fs.mkdtempSync(path.join(os.tmpdir(), "k1-schema-compat-"));
  t.after(() => fs.rmSync(nonObjectClaimRoot, { recursive: true, force: true }));
  writeFamily(nonObjectClaimRoot, {
    claims: { schema_version: 1, families: { classification: null } },
  });
  assert.ok(check({ root: nonObjectClaimRoot }).some((item) => /families\/classification must be an object/.test(item.message)));
});

test("command conditions support allOf but reject malformed or unenforced shapes", (t) => {
  const allOfSchema = {
    allOf: [
      null,
      { if: { properties: { kind: { const: "execute" } } }, then: { required: ["command"] } },
    ],
  };
  assert.equal(conditionRequires(allOfSchema, "execute", "command"), true);
  assert.equal(conditionRequires({ if: {}, then: {} }, "execute", "command"), false);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-schema-compat-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeFamily(root, {
    family: "state-transition",
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $id: "ospec://schemas/kernel/state-transition/v1",
      schema_version: 1,
      type: "object",
      properties: {
        schema_version: { const: 1 },
        kind: { type: "string", enum: ["execute"] },
        operation: { type: "string" },
        command: { type: "string" },
        arguments: { type: "array", items: { type: "object", properties: { token: { type: "string" } } } },
      },
      required: ["schema_version", "kind", "operation"],
      additionalProperties: false,
    },
    claims: {
      schema_version: 1,
      families: {
        "state-transition": {
          required_fields: ["schema_version", "kind", "operation"],
          enum_values: { kind: ["execute"] },
          command_shapes: [
            null,
            { kind: "execute", requires: ["command"], argument_required_fields: [] },
          ],
        },
      },
    },
  });
  const offenders = check({ root });
  assert.ok(offenders.some((item) => /invalid command shape/.test(item.message)));
  assert.ok(offenders.some((item) => /schema condition does not/.test(item.message)));
});

test("state-transition valid fixtures reject missing tokens and commands on collect or stop", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-schema-compat-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const schema = JSON.parse(
    fs.readFileSync(path.join(ROOT, "schemas", "kernel", "state-transition", "v1.schema.json"), "utf8")
  );
  const claims = {
    schema_version: 1,
    families: {
      "state-transition": {
        required_fields: ["schema_version", "kind", "operation"],
        enum_values: { kind: ["execute", "collect", "decide", "stop"] },
        command_shapes: [
          { kind: "execute", requires: ["command"], argument_required_fields: ["token"] },
        ],
      },
    },
  };
  const { schemaDir } = writeFamily(root, { family: "state-transition", schema, claims });
  const validDir = path.join(schemaDir, "fixtures", "valid");
  const invalidDir = path.join(schemaDir, "fixtures", "invalid");
  fs.mkdirSync(validDir, { recursive: true });
  fs.mkdirSync(invalidDir, { recursive: true });
  fs.writeFileSync(
    path.join(validDir, "execute-missing-token.json"),
    JSON.stringify({
      schema_version: 1,
      kind: "execute",
      operation: "repair",
      command: "tool repair",
      arguments: [{ name: "id" }],
    })
  );
  fs.writeFileSync(
    path.join(validDir, "collect-with-command.json"),
    JSON.stringify({ schema_version: 1, kind: "collect", operation: "collect", command: "tool collect" })
  );
  fs.writeFileSync(
    path.join(validDir, "stop-with-command.json"),
    JSON.stringify({ schema_version: 1, kind: "stop", operation: "stop", command: "tool recover" })
  );
  fs.writeFileSync(
    path.join(invalidDir, "unknown-kind.json"),
    JSON.stringify({ schema_version: 1, kind: "unknown", operation: "none" })
  );

  const offenders = check({ root });
  assert.ok(offenders.some((item) => /execute-missing-token.*require token/.test(item.message)));
  assert.ok(offenders.some((item) => /collect-with-command.*collect forbids command/.test(item.message)));
  assert.ok(offenders.some((item) => /stop-with-command.*stop forbids command/.test(item.message)));
});
