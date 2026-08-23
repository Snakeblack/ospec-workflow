"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { computeWorkResultId } = require("../execution-identities/index.js");

const CHECKER_NAME = "k6a-canonical-contracts";
const SHA256_REGEX = /^sha256:[a-f0-9]{64}$/;

/**
 * Validates canonical contracts:
 * 1. capsule-definition decouples file paths into capsule_inputs and uses sha256 DAG node IDs in dependencies.
 * 2. work-result and work-result-execution-payload artifacts prohibit candidate_id and have valid deterministic work_result_id.
 *
 * @param {Object} ctx
 * @param {string} [ctx.root]
 * @param {Array<{ path: string, data: Object }>} [ctx.payloads]
 * @returns {Array<Object>}
 */
function check(ctx) {
  const root = ctx.root || process.cwd();
  const offenders = [];

  if (Array.isArray(ctx.payloads)) {
    for (const item of ctx.payloads) {
      if (!item || !item.data || typeof item.data !== "object") continue;
      const data = item.data;
      const itemPath = item.path || "custom-payload.json";

      // Check source-snapshot synthetic .files prohibition
      if (
        "source_snapshot_id" in data ||
        itemPath.includes("source-snapshot")
      ) {
        if ("files" in data) {
          offenders.push({
            checker: CHECKER_NAME,
            path: itemPath,
            expected: "SourceSnapshot v1 artifacts must not define synthetic .files property",
            actual: "found .files property",
            message: `SourceSnapshot artifact '${itemPath}' contains non-canonical synthetic .files property`,
          });
        }
      }

      // Check work-order dependencies (WorkOrder v2)
      if (
        (data.schema_version === 2 || data.kind === "work-order/v2" || itemPath.includes("work-order/v2") || (data.work_order_id && String(data.work_order_id).startsWith("sha256:"))) &&
        Array.isArray(data.dependencies)
      ) {
        const nonShaDeps = data.dependencies.filter(
          (d) => typeof d !== "string" || !SHA256_REGEX.test(d)
        );
        if (nonShaDeps.length > 0) {
          offenders.push({
            checker: CHECKER_NAME,
            path: itemPath,
            expected: "dependencies in WorkOrder v2 must contain only SHA-256 DAG node IDs",
            actual: `found non-sha256 items: ${nonShaDeps.join(", ")}`,
            message: `WorkOrder '${itemPath}' uses non-SHA-256 dependencies: ${nonShaDeps.join(", ")}`,
          });
        }
      }

      // Check capsule-definition dependencies
      if ("capsule_id" in data || itemPath.includes("capsule-definition")) {
        if (Array.isArray(data.dependencies)) {
          const nonShaDeps = data.dependencies.filter(
            (d) => typeof d !== "string" || !SHA256_REGEX.test(d)
          );
          if (nonShaDeps.length > 0) {
            offenders.push({
              checker: CHECKER_NAME,
              path: itemPath,
              expected: "dependencies in capsule-definition must contain only SHA-256 DAG node IDs",
              actual: `found non-sha256 items: ${nonShaDeps.join(", ")}`,
              message: `Capsule definition '${itemPath}' uses file paths in dependencies instead of decoupled capsule_inputs`,
            });
          }
        }
      }

      // Check work-result candidate_id prohibition
      if (
        "work_result_id" in data ||
        itemPath.includes("work-result") ||
        itemPath.includes("work-result-execution-payload")
      ) {
        if ("candidate_id" in data || "candidateId" in data) {
          offenders.push({
            checker: CHECKER_NAME,
            path: itemPath,
            expected: "work-result artifacts must not contain candidate_id",
            actual: "found candidate_id property",
            message: `WorkResult artifact '${itemPath}' contains forbidden candidate_id property`,
          });
        }
      }
    }
    return offenders;
  }

  // 1. Check schemas/kernel/capsule-definition
  const capsuleSchemaPath = path.join(root, "schemas/kernel/capsule-definition/v1.schema.json");
  if (fs.existsSync(capsuleSchemaPath)) {
    try {
      const schema = JSON.parse(fs.readFileSync(capsuleSchemaPath, "utf8"));
      if (!schema.properties || !schema.properties.capsule_inputs) {
        offenders.push({
          checker: CHECKER_NAME,
          path: "schemas/kernel/capsule-definition/v1.schema.json",
          expected: "capsule-definition schema must declare capsule_inputs property",
          actual: "capsule_inputs property missing from properties",
          message: "Capsule definition schema does not declare capsule_inputs for file projection",
        });
      }
      if (
        !schema.properties ||
        !schema.properties.dependencies ||
        !schema.properties.dependencies.items ||
        schema.properties.dependencies.items.pattern !== "^sha256:[a-f0-9]{64}$"
      ) {
        offenders.push({
          checker: CHECKER_NAME,
          path: "schemas/kernel/capsule-definition/v1.schema.json",
          expected: "capsule-definition dependencies items must enforce SHA-256 pattern",
          actual: "dependencies pattern missing or invalid",
          message: "Capsule definition schema dependencies items do not require SHA-256 DAG node IDs",
        });
      }
    } catch {
      offenders.push({
        checker: CHECKER_NAME,
        path: "schemas/kernel/capsule-definition/v1.schema.json",
        expected: "readable JSON",
        actual: "unparseable JSON",
        message: "Failed to parse capsule-definition/v1.schema.json",
      });
    }
  }

  // Check capsule-definition valid fixtures
  const capsuleFixturesDir = path.join(
    root,
    "schemas/kernel/capsule-definition/fixtures/valid"
  );
  if (fs.existsSync(capsuleFixturesDir)) {
    const files = fs.readdirSync(capsuleFixturesDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const fixturePath = path.join(capsuleFixturesDir, file);
      try {
        const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
        if (Array.isArray(fixture.dependencies)) {
          const nonSha = fixture.dependencies.filter(
            (d) => typeof d !== "string" || !SHA256_REGEX.test(d)
          );
          if (nonSha.length > 0) {
            offenders.push({
              checker: CHECKER_NAME,
              path: `schemas/kernel/capsule-definition/fixtures/valid/${file}`,
              expected: "all dependencies in valid fixtures must be SHA-256 DAG node IDs",
              actual: `found non-sha dependencies: ${nonSha.join(", ")}`,
              message: `Capsule definition valid fixture '${file}' contains non-SHA-256 dependencies`,
            });
          }
        }
      } catch {
        offenders.push({
          checker: CHECKER_NAME,
          path: `schemas/kernel/capsule-definition/fixtures/valid/${file}`,
          expected: "readable JSON",
          actual: "unparseable JSON",
          message: `Failed to parse capsule-definition fixture '${file}'`,
        });
      }
    }
  }

  // 2. Check work-result and work-result-execution-payload fixtures
  const workResultDirs = [
    "schemas/kernel/work-result-execution-payload",
    "schemas/kernel/work-result",
  ];

  for (const relDir of workResultDirs) {
    const validDir = path.join(root, relDir, "fixtures/valid");
    if (fs.existsSync(validDir)) {
      const files = fs.readdirSync(validDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const fixturePath = path.join(validDir, file);
        try {
          const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
          if ("candidate_id" in fixture || "candidateId" in fixture) {
            offenders.push({
              checker: CHECKER_NAME,
              path: `${relDir}/fixtures/valid/${file}`,
              expected: "zero candidate_id in work-result valid fixtures",
              actual: "found candidate_id",
              message: `WorkResult valid fixture '${file}' contains forbidden candidate_id`,
            });
          }
          if (relDir === "schemas/kernel/work-result-execution-payload") {
            const expectedId = computeWorkResultId(fixture);
            if (fixture.work_result_id !== expectedId) {
              offenders.push({
                checker: CHECKER_NAME,
                path: `${relDir}/fixtures/valid/${file}`,
                expected: `work_result_id matching computeWorkResultId: ${expectedId}`,
                actual: fixture.work_result_id,
                message: `WorkResult fixture '${file}' has mismatched work_result_id`,
              });
            }
          }
        } catch {
          offenders.push({
            checker: CHECKER_NAME,
            path: `${relDir}/fixtures/valid/${file}`,
            expected: "readable JSON",
            actual: "unparseable JSON",
            message: `Failed to parse work-result fixture '${file}'`,
          });
        }
      }
    }
  }

  // 3. Check source-snapshot fixtures
  const sourceSnapshotDir = path.join(root, "schemas/kernel/source-snapshot/fixtures/valid");
  if (fs.existsSync(sourceSnapshotDir)) {
    const files = fs.readdirSync(sourceSnapshotDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const fixturePath = path.join(sourceSnapshotDir, file);
      try {
        const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
        if ("files" in fixture) {
          offenders.push({
            checker: CHECKER_NAME,
            path: `schemas/kernel/source-snapshot/fixtures/valid/${file}`,
            expected: "zero .files in source-snapshot valid fixtures",
            actual: "found .files property",
            message: `SourceSnapshot valid fixture '${file}' contains forbidden synthetic .files property`,
          });
        }
      } catch {
        offenders.push({
          checker: CHECKER_NAME,
          path: `schemas/kernel/source-snapshot/fixtures/valid/${file}`,
          expected: "readable JSON",
          actual: "unparseable JSON",
          message: `Failed to parse source-snapshot fixture '${file}'`,
        });
      }
    }
  }

  // 4. Check work-order fixtures
  const workOrderDir = path.join(root, "schemas/kernel/work-order/fixtures/valid");
  if (fs.existsSync(workOrderDir)) {
    const files = fs.readdirSync(workOrderDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const fixturePath = path.join(workOrderDir, file);
      try {
        const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));
        if (fixture.schema_version === 2 || fixture.kind === "work-order/v2") {
          if (Array.isArray(fixture.dependencies)) {
            const nonSha = fixture.dependencies.filter(
              (d) => typeof d !== "string" || !SHA256_REGEX.test(d)
            );
            if (nonSha.length > 0) {
              offenders.push({
                checker: CHECKER_NAME,
                path: `schemas/kernel/work-order/fixtures/valid/${file}`,
                expected: "all dependencies in work-order v2 valid fixtures must be SHA-256 DAG node IDs",
                actual: `found non-sha dependencies: ${nonSha.join(", ")}`,
                message: `WorkOrder valid fixture '${file}' contains non-SHA-256 dependencies`,
              });
            }
          }
        }
      } catch {
        offenders.push({
          checker: CHECKER_NAME,
          path: `schemas/kernel/work-order/fixtures/valid/${file}`,
          expected: "readable JSON",
          actual: "unparseable JSON",
          message: `Failed to parse work-order fixture '${file}'`,
        });
      }
    }
  }

  // 5. Check runtime JS sources for non-canonical .files references
  const runtimeFiles = ["scripts/lib/worker-workspace.js", "scripts/lib/worker-executor.js"];
  for (const relPath of runtimeFiles) {
    const absPath = path.join(root, relPath);
    if (fs.existsSync(absPath)) {
      const code = fs.readFileSync(absPath, "utf8");
      if (/sourceSnapshot\.files|source_snapshot\.files/.test(code)) {
        offenders.push({
          checker: CHECKER_NAME,
          path: relPath,
          expected: "runtime code must not access non-canonical sourceSnapshot.files",
          actual: "found sourceSnapshot.files access",
          message: `Runtime file '${relPath}' contains legacy non-canonical sourceSnapshot.files fallback`,
        });
      }
    }
  }

  return offenders;
}

module.exports = { check };
