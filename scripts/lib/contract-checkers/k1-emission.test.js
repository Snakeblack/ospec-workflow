"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { check } = require("./k1-emission.js");

const ROOT = path.resolve(__dirname, "..", "..", "..");

test("k1-emission passes when every claim is observed from a productive builder", () => {
  assert.deepEqual(check({ root: ROOT }), []);
});

function writeFixture(root, { catalog, claims, source }) {
  fs.mkdirSync(path.join(root, "scripts", "lib", "emission-catalogs"), { recursive: true });
  fs.mkdirSync(path.join(root, "scripts", "lib", "productive"), { recursive: true });
  fs.mkdirSync(path.join(root, "schemas", "kernel"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "scripts", "lib", "emission-catalogs", "k1-emitted.json"),
    JSON.stringify(catalog)
  );
  fs.writeFileSync(
    path.join(root, "schemas", "kernel", "emission-claims.json"),
    JSON.stringify(claims)
  );
  if (source) {
    fs.writeFileSync(path.join(root, "scripts", "lib", "productive", "builder.js"), source);
  }
}

test("matching declaration files cannot manufacture an emitted command or field", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-emission-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  writeFixture(root, {
    catalog: {
      schema_version: 1,
      fields: ["route", "invented_field"],
      commands: ["ospec kernel repair-node"],
      sources: [],
    },
    claims: {
      schema_version: 1,
      claimed_fields: [{ source: "invented", path: "/invented_field" }],
      claimed_commands: [{ source: "invented", command: "ospec kernel repair-node" }],
    },
  });

  const offenders = check({ root });
  assert.ok(offenders.some((o) => /invented_field/.test(o.message)));
  assert.ok(offenders.some((o) => /repair-node/.test(o.message)));
});

test("observes real classifyChange fields through the allowlisted source id", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-emission-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  writeFixture(root, {
    catalog: {
      schema_version: 1,
      sources: ["change-classification"],
    },
    claims: {
      schema_version: 1,
      claimed_fields: [
        { source: "change-classification", path: "/route" },
        { source: "change-classification", path: "/fingerprint" },
      ],
      claimed_commands: [],
    },
  });

  assert.deepEqual(check({ root }), []);
});

test("rejects an arbitrary module/export/probe before require or invocation", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-emission-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const libDir = path.join(root, "scripts", "lib");
  const requiredMarker = path.join(libDir, "required.txt");
  const invokedMarker = path.join(root, "invoked.txt");

  writeFixture(root, {
    catalog: {
      schema_version: 1,
      sources: [
        "change-classification",
        {
          id: "atomic-write",
          module: "scripts/lib/atomic-write.js",
          export: "writeFileAtomic",
          probes: [{ arguments: [invokedMarker, "attacker-controlled"] }],
        },
      ],
    },
    claims: { schema_version: 1, claimed_fields: [], claimed_commands: [] },
  });
  fs.writeFileSync(
    path.join(libDir, "atomic-write.js"),
    [
      '"use strict";',
      'const fs = require("node:fs");',
      'const path = require("node:path");',
      'fs.writeFileSync(path.join(__dirname, "required.txt"), "required");',
      'module.exports.writeFileAtomic = (target) => { fs.writeFileSync(target, "invoked"); return {}; };',
      "",
    ].join("\n")
  );

  const offenders = check({ root });
  assert.equal(fs.existsSync(requiredMarker), false, "unallowlisted module must not be required");
  assert.equal(fs.existsSync(invokedMarker), false, "declarative probe arguments must not be invoked");
  assert.ok(offenders.some((o) => /allowlist|source id|declarative source/i.test(o.message)));
});

test("missing or malformed emission contracts fail closed", (t) => {
  const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "k1-emission-"));
  t.after(() => fs.rmSync(missingRoot, { recursive: true, force: true }));
  const missing = check({ root: missingRoot });
  assert.equal(missing.length, 2);
  assert.ok(missing.every((item) => /could not be read/.test(item.message)));

  const malformedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "k1-emission-"));
  t.after(() => fs.rmSync(malformedRoot, { recursive: true, force: true }));
  writeFixture(malformedRoot, { catalog: [], claims: [] });
  const malformed = check({ root: malformedRoot });
  assert.ok(malformed.some((item) => /must contain an object/.test(item.message)));
});

test("a fictitious command cannot be claimed by the command-free K1 source", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-emission-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeFixture(root, {
    catalog: { schema_version: 1, sources: ["change-classification"] },
    claims: {
      schema_version: 1,
      claimed_fields: [],
      claimed_commands: [
        { source: "change-classification", command: "ospec kernel repair-node" },
      ],
    },
  });
  const offenders = check({ root });
  assert.ok(offenders.some((item) => /repair-node/.test(item.message)));
});

test("invalid catalog source and claim shapes are reported without throwing", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "k1-emission-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeFixture(root, {
    catalog: {
      schema_version: 2,
      sources: [null, "", "unknown", "unknown"],
    },
    claims: {
      schema_version: 2,
      claimed_fields: ["route", { source: "unknown", path: "/route" }],
      claimed_commands: ["tool run", { source: "unknown", command: "tool run" }],
    },
  });

  let offenders;
  assert.doesNotThrow(() => {
    offenders = check({ root });
  });
  assert.ok(offenders.length >= 6);
  assert.ok(offenders.some((item) => /schema_version/.test(item.message)));
  assert.ok(offenders.some((item) => /allowlist|source id/i.test(item.message)));
  assert.ok(offenders.some((item) => /invalid field claim shape/.test(item.message)));
  assert.ok(offenders.some((item) => /invalid command claim shape/.test(item.message)));
});
