"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { resolveAlias, listKnownConsumerTags } = require("./kernel-aliases.js");

test("resolveAlias maps legacy tag to canonical code", () => {
  assert.equal(resolveAlias("auth-security"), "hard_floor.auth_security");
  assert.equal(resolveAlias("hard_floor.auth_security"), "hard_floor.auth_security");
});

test("resolveAlias non-strict returns tag unchanged when unmapped", () => {
  assert.equal(resolveAlias("totally-unknown-tag"), "totally-unknown-tag");
  assert.equal(resolveAlias("totally-unknown-tag", { strict: false }), "totally-unknown-tag");
});

test("resolveAlias strict fails closed on known consumer tag without mapping", () => {
  assert.throws(
    () => resolveAlias("KNOWN_UNMAPPED_CONSUMER_TAG", { strict: true }),
    /unmapped|fail.?closed|no alias/i
  );
});

test("resolveAlias never silently drops a mapped tag", () => {
  const tags = listKnownConsumerTags();
  assert.ok(tags.length >= 5);
  for (const tag of tags) {
    if (tag === "KNOWN_UNMAPPED_CONSUMER_TAG") continue;
    const resolved = resolveAlias(tag, { strict: true });
    assert.ok(typeof resolved === "string" && resolved.length > 0, `dropped ${tag}`);
  }
});

test("strict coverage matrix resolves every seeded consumer-facing tag", () => {
  const expected = {
    direct: "route.direct",
    repair: "route.repair",
    bounded: "route.bounded",
    planned: "route.planned",
    critical: "route.critical",
    "auth-security": "hard_floor.auth_security",
    "data-migration": "hard_floor.data_migration",
    "public-api": "hard_floor.public_api",
    "contract-remediation": "failure.contract_remediation",
    "graph-ir-override-rejected": "authority.graph_ir_override_rejected",
    "missing-structured-authority-field": "authority.missing_structured_field",
    "missing-openspec-authority": "authority.missing_openspec_authority",
    "verification-fail": "failure.verification_fail",
  };
  for (const [legacy, canonical] of Object.entries(expected)) {
    assert.equal(resolveAlias(legacy, { strict: true }), canonical);
  }
});

test("resolveAlias rejects missing or mistyped tags", () => {
  for (const tag of ["", "   ", null, 42]) {
    assert.throws(
      () => resolveAlias(tag),
      { name: "TypeError", message: "alias tag must be a non-empty string" }
    );
  }
});

test("resolveAlias rejects malformed options and alias documents", () => {
  assert.throws(
    () => resolveAlias("direct", null),
    { name: "TypeError", message: "alias options must be an object" }
  );
  assert.throws(
    () => resolveAlias("direct", { strict: "yes" }),
    { name: "TypeError", message: "alias strict option must be a boolean" }
  );
  assert.throws(
    () => resolveAlias("direct", { doc: 42 }),
    { name: "TypeError", message: "alias document source must be an object or file path" }
  );
  assert.throws(
    () => resolveAlias("direct", { doc: { schema_version: 1, aliases: [] } }),
    /alias document invalid: aliases must be an object/
  );
  assert.throws(
    () =>
      resolveAlias("direct", {
        doc: {
          schema_version: 1,
          aliases: { direct: "route.direct" },
          known_consumer_tags: "direct",
        },
      }),
    /alias document invalid: known_consumer_tags must be an array/
  );
});

test("resolveAlias reports controlled file I/O and JSON errors", (t) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kernel-aliases-"));
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));
  const missingPath = path.join(tempDir, "missing.json");
  const corruptPath = path.join(tempDir, "corrupt.json");
  fs.writeFileSync(corruptPath, "{ invalid");

  assert.throws(
    () => resolveAlias("direct", { doc: missingPath }),
    /^Error: alias document read failed$/
  );
  assert.throws(
    () => resolveAlias("direct", { doc: corruptPath }),
    /^Error: alias document JSON invalid$/
  );
});
