"use strict";

const assert = require("node:assert/strict");
const { mkdir, mkdtemp, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const {
  CohortError,
  loadCohort,
  validateCohortShape,
  validatePilotCohortShape,
} = require("./cohort.js");

const seedRoot = join(__dirname, "../../evals/__fixtures__/k12");
const seedCatalogPath = join(seedRoot, "oracle-catalog.json");
const seedTasksDir = join(seedRoot, "tasks");

function fixture(fixtureId, stratum = "local-reversible", holdoutFamily = "family-a") {
  return {
    fixture_id: fixtureId,
    stratum,
    holdout_family: holdoutFamily,
    obligations: [
      {
        id: "tests-pass",
        criticality: "must",
        required_evidence: ["test-output"],
      },
    ],
  };
}

async function writeCatalog(root, fixtures) {
  const catalogPath = join(root, "catalog.json");
  await writeFile(
    catalogPath,
    JSON.stringify({ schema_version: 1, catalog_version: "test-1", fixtures }),
    "utf8",
  );
  return catalogPath;
}

async function writeTask(tasksDir, fixtureId, contents = "# Task\n") {
  const taskDir = join(tasksDir, fixtureId);
  await mkdir(taskDir, { recursive: true });
  if (contents !== null) await writeFile(join(taskDir, "task.md"), contents, "utf8");
}

test("loads the real seed cohort and validates its shape", () => {
  const cohort = loadCohort(seedCatalogPath, seedTasksDir);

  assert.equal(Object.isFrozen(cohort), true);
  assert.deepEqual(validateCohortShape(cohort), { valid: true, errors: [] });
});

test("rejects bidirectional catalog and task directory mismatches", async () => {
  const root = await mkdtemp(join(tmpdir(), "k12-cohort-mismatch-"));
  const tasksDir = join(root, "tasks");

  try {
    const catalogPath = await writeCatalog(root, [fixture("catalog-only")]);
    await writeTask(tasksDir, "task-only");

    assert.throws(() => loadCohort(catalogPath, tasksDir), CohortError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects task directories without task.md", async () => {
  const root = await mkdtemp(join(tmpdir(), "k12-cohort-missing-task-"));
  const tasksDir = join(root, "tasks");

  try {
    const catalogPath = await writeCatalog(root, [fixture("missing-task")]);
    await writeTask(tasksDir, "missing-task", null);

    assert.throws(() => loadCohort(catalogPath, tasksDir), CohortError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reports under-covered synthetic cohorts without throwing", () => {
  const cohort = {
    catalog: {
      fixtures: [
        fixture("local-one", "local-reversible", "family-a"),
        fixture("repair-one", "behavior-repair", "family-a"),
        fixture("repair-two", "behavior-repair", "family-b"),
        fixture("module-one", "multi-module", "family-b"),
        fixture("module-two", "multi-module", "family-c"),
        fixture("adversarial-one", "adversarial", "family-c"),
        fixture("adversarial-two", "adversarial", "family-a"),
      ],
    },
  };

  const result = validateCohortShape(cohort);

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('local-reversible')));
});

test("reports strata coverage counts that match the catalog", () => {
  const cohort = loadCohort(seedCatalogPath, seedTasksDir);
  const expected = Object.fromEntries(
    ["local-reversible", "behavior-repair", "multi-module", "adversarial"].map((stratum) => [
      stratum,
      cohort.catalog.fixtures.filter((fixtureEntry) => fixtureEntry.stratum === stratum).length,
    ]),
  );

  assert.deepEqual(cohort.strata_coverage, expected);
});

test("the real cohort satisfies the Adaptive Repair pilot shape", () => {
  const cohort = loadCohort(seedCatalogPath, seedTasksDir);

  assert.deepEqual(validatePilotCohortShape(cohort), { valid: true, errors: [] });
  assert.deepEqual(cohort.strata_coverage, {
    "local-reversible": 6,
    "behavior-repair": 7,
    "multi-module": 5,
    adversarial: 4,
  });
});

function pilotCohort(counts, familiesPerStratum = 2) {
  const fixtures = Object.entries(counts).flatMap(([stratum, count]) => Array.from({ length: count }, (_, index) => (
    fixture(`${stratum}-${index}`, stratum, `${stratum}-family-${index % familiesPerStratum}`)
  )));
  return { catalog: { fixtures } };
}

test("reports pilot cohorts that are undersized, unweighted, or without a reservable holdout family", () => {
  const balanced = { "local-reversible": 6, "behavior-repair": 6, "multi-module": 5, adversarial: 4 };
  assert.deepEqual(validatePilotCohortShape(pilotCohort(balanced)), { valid: true, errors: [] });

  const cases = [
    [pilotCohort({ "local-reversible": 4, "behavior-repair": 4, "multi-module": 3, adversarial: 3 }), /must contain 20-24 fixtures, found 14/],
    [pilotCohort({ "local-reversible": 7, "behavior-repair": 7, "multi-module": 7, adversarial: 4 }), /must contain 20-24 fixtures, found 25/],
    [pilotCohort({ "local-reversible": 4, "behavior-repair": 8, "multi-module": 6, adversarial: 4 }), /"local-reversible" must not have fewer fixtures than "multi-module"/],
    [pilotCohort(balanced, 1), /"adversarial" needs at least 2 holdout families/],
  ];
  for (const [cohort, pattern] of cases) {
    const result = validatePilotCohortShape(cohort);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => pattern.test(error)), result.errors.join("; "));
  }
  // The seed shape still gates first: a missing stratum is reported by validateCohortShape.
  const missingStratum = validatePilotCohortShape(pilotCohort({ "local-reversible": 10, "behavior-repair": 10 }));
  assert.ok(missingStratum.errors.some((error) => error.includes('stratum "multi-module" is missing')));
});
