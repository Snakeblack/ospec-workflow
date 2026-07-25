"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { migrateReviewLineage, stableSerialize, validateLineageForGate } = require("./lib/review-lineage.js");

const ROOT = path.resolve(__dirname, "..");
const STATE = path.join(ROOT, "openspec", "changes", "strict-tdd-evidence-remediation-fast-path", "state.yaml");
const FIXTURE = path.join(ROOT, "scripts", "fixtures", "review-lineage", "o4-2-gen4-v1.json");
const PREFIX = "  4r-review-gate: ";

function readGate(content) {
  const line = content.split(/\r?\n/).find((candidate) => candidate.startsWith(PREFIX));
  assert.ok(line, "O4.2 state must retain the serialized review gate");
  return JSON.parse(line.slice(PREFIX.length));
}

test("O4.2 v1 lineage migrates atomically in memory to four idempotent slices without rewriting history", () => {
  const before = fs.readFileSync(STATE, "utf8");
  const beforeHash = crypto.createHash("sha256").update(before).digest("hex");
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  const gate = readGate(before);
  const lineage = structuredClone(gate.lineage);
  for (const field of ["remediation_schema_version", "remediation_migration", "slice_order", "active_slice_id", "correction_slices"]) delete lineage[field];
  const lineageHash = crypto.createHash("sha256").update(stableSerialize(lineage)).digest("hex");
  assert.equal(lineageHash, fixture.legacy_lineage_stable_sha256, "fixture must start from the pinned genuine v1 O4.2 authority");
  const migrated = migrateReviewLineage(lineage, fixture.manifest);

  assert.equal(migrated.remediation_schema_version, 2);
  assert.equal(migrated.slice_order.length, fixture.expected.slice_count);
  assert.deepEqual(migrated.findings, lineage.findings, "frozen findings remain unchanged");
  assert.deepEqual(migrated.successor_history, lineage.successor_history, "successor history remains unchanged");
  assert.deepEqual(migrateReviewLineage(migrated, fixture.manifest), migrated, "second migration has zero delta");
  assert.equal(beforeHash, fixture.post_migration_sha256, "live persisted state must be the pinned O4.2 migration target");
  assert.equal(migrated.remediation_migration.legacy_used_lines, fixture.expected.legacy_used_lines);
  const roots = Object.values(migrated.correction_slices).reduce((acc, slice) => ({ ...acc, [slice.root_cause_key]: slice }), {});
  assert.equal(roots[fixture.expected.ready_root_cause].status, "ready");
  assert.equal(roots[fixture.expected.ready_root_cause].failed_attempts, fixture.expected.ready_failed_attempts);
  for (const root of fixture.expected.passed_root_causes) assert.equal(roots[root].status, "passed");
});

test("O4.2 live persisted lineage (not just the in-memory fixture clone) satisfies the hardened remediation-v2 gate validator", () => {
  const before = fs.readFileSync(STATE, "utf8");
  const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8"));
  const gate = readGate(before);
  assert.equal(gate.lineage.remediation_schema_version, 2, "live gate must already carry the migrated remediation schema");
  assert.equal(
    typeof (gate.lineage.remediation_migration && gate.lineage.remediation_migration.legacy_failed_attempts),
    "number",
    "live persisted remediation_migration must seed legacy_failed_attempts, not only legacy_used_lines",
  );
  assert.deepEqual(
    validateLineageForGate(gate.lineage, { candidate_id: gate.lineage.current_candidate_id, gate: "archive" }),
    { valid: false, code: "lineage-not-terminal" },
    "the exact object persisted on disk must pass integrity checks (not throw) without any in-memory re-migration; remediation for the ready slice is still outstanding",
  );
  const roots = Object.values(gate.lineage.correction_slices).reduce((acc, slice) => ({ ...acc, [slice.root_cause_key]: slice }), {});
  assert.equal(roots[fixture.expected.ready_root_cause].status, "ready");
  assert.equal(roots[fixture.expected.ready_root_cause].failed_attempts, fixture.expected.ready_failed_attempts);
  for (const root of fixture.expected.passed_root_causes) assert.equal(roots[root].status, "passed");
});
