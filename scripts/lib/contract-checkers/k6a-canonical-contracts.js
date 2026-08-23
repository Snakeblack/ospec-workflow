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

  return offenders;
}

module.exports = { check };
