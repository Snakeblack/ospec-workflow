"use strict";

// E1.4 (b1): where a project keeps its contract documents and tests, for the
// contract-spec-and-test evidence (openspec/specs/idd/spec.md, REQ-idd-015).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const {
  CONTRACT_BASE,
  CONTRACT_KEYS,
  CONTRACT_STACKS,
  classifyContractPaths,
  resolveContractPatterns,
  validateContracts,
} = require("./idd-contracts.js");
const { STACKS } = require("./idd-impact.js");

test("contract documents and tests have base patterns and stack defaults for known stacks only", () => {
  assert.ok(CONTRACT_BASE.documents.includes("**/openapi*.{yaml,yml,json}"));
  assert.ok(CONTRACT_BASE.documents.includes("docs/api/**"));
  assert.ok(CONTRACT_BASE.tests.includes("**/*.test.*"));
  for (const stack of Object.keys(CONTRACT_STACKS)) assert.ok(STACKS.includes(stack), `${stack} is a known stack`);
});

test("resolved patterns add the stack defaults and the project's own lists", () => {
  const patterns = resolveContractPatterns({ stacks: ["go"], contracts: { documents: ["openspec/specs/**"], tests: ["checks/**"] } });
  assert.ok(patterns.documents.includes("openspec/specs/**"));
  assert.ok(patterns.documents.includes("**/*.proto"));
  assert.ok(patterns.tests.includes("**/*_test.go"));
  assert.ok(patterns.tests.includes("checks/**"));

  const only = resolveContractPatterns({ stacks: ["go"], contracts: { defaults: false, documents: ["api.md"] } });
  assert.deepStrictEqual(only, { documents: ["api.md"], tests: [] });
});

test("changed paths split into contract documents and tests, ignoring case", () => {
  const patterns = resolveContractPatterns({ stacks: ["node"], contracts: { documents: ["openspec/specs/**"] } });
  const paths = ["src/api/orders.js", "openspec/specs/idd/spec.md", "API/OpenAPI.yaml", "src/api/orders.test.js", "README.md"];
  assert.deepStrictEqual(classifyContractPaths(paths, patterns), {
    documents: ["API/OpenAPI.yaml", "openspec/specs/idd/spec.md"],
    tests: ["src/api/orders.test.js"],
  });
});

test("REQ-idd-015 names the contracts keys, the migration run and its plan", () => {
  const spec = fs.readFileSync(path.join(__dirname, "..", "..", "openspec", "specs", "idd", "spec.md"), "utf8");
  const start = spec.indexOf("{#REQ-idd-015}");
  assert.ok(start !== -1, "REQ-idd-015 is missing");
  const end = spec.indexOf("### Requirement:", start);
  const section = spec.slice(start, end === -1 ? undefined : end);
  for (const name of ["contracts", ...CONTRACT_KEYS, "contracts.defaults: false", "migration-test", "--plan", "config-invalid", "docs/api/**"]) {
    assert.ok(section.includes(`\`${name}\``), `REQ-idd-015 must name ${name}`);
  }
});

test("the contracts section accepts only defaults, documents and tests", () => {
  assert.deepStrictEqual(validateContracts({ defaults: "false", documents: "openspec/specs/**", tests: [] }), {
    defaults: false,
    documents: ["openspec/specs/**"],
    tests: [],
  });
  assert.throws(() => validateContracts({ docs: [] }), /unknown contracts key: docs/);
  assert.throws(() => validateContracts({ defaults: "maybe" }), /contracts.defaults must be true or false/);
});
