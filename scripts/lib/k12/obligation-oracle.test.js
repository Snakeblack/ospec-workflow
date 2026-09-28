"use strict";

const assert = require("node:assert/strict");
const { mkdtemp, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const {
  ObligationOracleError,
  catalogDigest,
  compareObligations,
  loadOracleCatalog,
} = require("./obligation-oracle.js");

function validCatalog() {
  return {
    schema_version: 1,
    catalog_version: "2026-04-01",
    fixtures: [
      {
        fixture_id: "K12-local-001",
        stratum: "local-reversible",
        holdout_family: "local",
        obligations: [
          {
            id: "preserve-input",
            criticality: "must",
            required_evidence: ["unit-test"],
          },
          { id: "document-behavior", criticality: "should" },
        ],
      },
    ],
  };
}

test("loads a valid catalog and produces a stable digest across key order", () => {
  const catalog = validCatalog();
  const reordered = {
    fixtures: [
      {
        obligations: [
          {
            required_evidence: ["unit-test"],
            criticality: "must",
            id: "preserve-input",
          },
          { criticality: "should", id: "document-behavior" },
        ],
        holdout_family: "local",
        stratum: "local-reversible",
        fixture_id: "K12-local-001",
      },
    ],
    catalog_version: "2026-04-01",
    schema_version: 1,
  };

  const loaded = loadOracleCatalog(catalog);
  assert.deepEqual(loaded, catalog);
  assert.equal(catalogDigest(catalog), catalogDigest(reordered));
});

test("rejects malformed catalogs with typed errors", () => {
  const cases = [
    (() => {
      const catalog = validCatalog();
      delete catalog.schema_version;
      return catalog;
    })(),
    {
      ...validCatalog(),
      fixtures: [validCatalog().fixtures[0], { ...validCatalog().fixtures[0] }],
    },
    {
      ...validCatalog(),
      fixtures: [
        {
          ...validCatalog().fixtures[0],
          obligations: [{ criticality: "must" }],
        },
      ],
    },
  ];

  for (const catalog of cases) {
    assert.throws(() => loadOracleCatalog(catalog), ObligationOracleError);
  }
});

test("fails when a manifest omits a must obligation", () => {
  const fixture = loadOracleCatalog(validCatalog()).fixtures[0];

  const result = compareObligations(fixture, {
    obligations: [{ id: "document-behavior", criticality: "should" }],
  });

  assert.equal(result.verdict, "fail");
  assert.equal(result.missing_must, true);
  assert.deepEqual(result.missing, [
    {
      id: "preserve-input",
      criticality: "must",
      required_evidence: ["unit-test"],
    },
  ]);
});

test("passes when all catalog obligations are observed", () => {
  const fixture = loadOracleCatalog(validCatalog()).fixtures[0];

  const result = compareObligations(fixture, [
    { id: "preserve-input", criticality: "may", implemented_by: ["node-a"] },
    { id: "document-behavior", criticality: "must" },
  ]);

  assert.deepEqual(result.matched, ["preserve-input", "document-behavior"]);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.unexpected, []);
  assert.equal(result.missing_must, false);
  assert.equal(result.verdict, "pass");
});

test("reports unexpected observed obligations without failing", () => {
  const fixture = loadOracleCatalog(validCatalog()).fixtures[0];

  const result = compareObligations(fixture, {
    obligations: [
      { id: "preserve-input", criticality: "must" },
      { id: "document-behavior", criticality: "should" },
      { id: "extra-telemetry", criticality: "may" },
    ],
  });

  assert.deepEqual(result.unexpected, ["extra-telemetry"]);
  assert.equal(result.verdict, "pass");
});

test("loads a catalog from a file path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "k12-obligation-oracle-"));
  const filePath = join(directory, "catalog.json");

  try {
    await writeFile(filePath, JSON.stringify(validCatalog()), "utf8");
    assert.deepEqual(loadOracleCatalog(filePath), validCatalog());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
