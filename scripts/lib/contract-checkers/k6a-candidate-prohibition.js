"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CHECKER_NAME = "k6a-candidate-prohibition";

const FORBIDDEN_TERMS = [
  "freezeCandidate",
  "RepairShadow",
  "CandidateEvaluationAttestation",
];

/**
 * Validates zero CandidateId emission/usage in K6a execution primitives, schemas, and fixtures.
 *
 * @param {Object} ctx
 * @param {string} ctx.root
 * @param {Array<{ path: string, data: Object }>} [ctx.payloads]
 * @returns {Array<Object>}
 */
function check(ctx) {
  const root = ctx.root || process.cwd();
  const offenders = [];

  if (Array.isArray(ctx.payloads)) {
    for (const item of ctx.payloads) {
      if (item && item.data && typeof item.data === "object") {
        if ("candidate_id" in item.data || "candidateId" in item.data) {
          offenders.push({
            checker: CHECKER_NAME,
            path: item.path || "custom-payload.json",
            expected: "zero CandidateId properties in K6a execution payloads",
            actual: "found candidate_id property",
            message: `K6a artifact '${item.path || "custom-payload.json"}' contains forbidden candidate_id property, violating K3 identity boundary`,
          });
        }
      }
    }
    return offenders;
  }

  // Scan K6a schemas and valid fixtures
  const k6aSchemaDirs = [
    "schemas/kernel/workspace-descriptor",
    "schemas/kernel/capsule-definition",
    "schemas/kernel/work-result-execution-payload",
    "schemas/kernel/containment-violation",
  ];

  for (const relDir of k6aSchemaDirs) {
    const fullDir = path.join(root, relDir);
    if (!fs.existsSync(fullDir)) continue;

    // Check schema file
    const schemaFile = path.join(fullDir, "v1.schema.json");
    if (fs.existsSync(schemaFile)) {
      try {
        const schema = JSON.parse(fs.readFileSync(schemaFile, "utf8"));
        if (schema.properties && ("candidate_id" in schema.properties || "candidateId" in schema.properties)) {
          offenders.push({
            checker: CHECKER_NAME,
            path: path.join(relDir, "v1.schema.json").replace(/\\/g, "/"),
            expected: "schema must not declare candidate_id property",
            actual: "declared candidate_id property in properties",
            message: `K6a schema '${relDir}/v1.schema.json' declares forbidden candidate_id property`,
          });
        }
      } catch {
        offenders.push({
          checker: CHECKER_NAME,
          path: path.join(relDir, "v1.schema.json").replace(/\\/g, "/"),
          expected: "readable JSON document",
          actual: "malformed JSON document",
          message: `K6a schema file '${relDir}/v1.schema.json' could not be parsed`,
        });
      }
    }

    // Check valid fixtures
    const validDir = path.join(fullDir, "fixtures", "valid");
    if (fs.existsSync(validDir)) {
      const files = fs.readdirSync(validDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const filePath = path.join(validDir, file);
        try {
          const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
          if (content && typeof content === "object" && ("candidate_id" in content || "candidateId" in content)) {
            offenders.push({
              checker: CHECKER_NAME,
              path: path.join(relDir, "fixtures", "valid", file).replace(/\\/g, "/"),
              expected: "valid fixtures must not declare candidate_id property",
              actual: "declared candidate_id property",
              message: `K6a valid fixture '${relDir}/fixtures/valid/${file}' contains forbidden candidate_id property`,
            });
          }
        } catch {
          offenders.push({
            checker: CHECKER_NAME,
            path: path.join(relDir, "fixtures", "valid", file).replace(/\\/g, "/"),
            expected: "readable JSON document",
            actual: "malformed JSON document",
            message: `K6a fixture '${relDir}/fixtures/valid/${file}' could not be parsed`,
          });
        }
      }
    }
  }

  // Scan K6a source scripts for forbidden domain terms
  const k6aSourceFiles = [
    "scripts/lib/allowed-paths-validator.js",
    "scripts/lib/worker-workspace.js",
    "scripts/lib/worker-executor.js",
  ];

  for (const relFile of k6aSourceFiles) {
    const fullFile = path.join(root, relFile);
    if (!fs.existsSync(fullFile)) continue;
    const text = fs.readFileSync(fullFile, "utf8");
    for (const term of FORBIDDEN_TERMS) {
      if (text.includes(term)) {
        offenders.push({
          checker: CHECKER_NAME,
          path: relFile.replace(/\\/g, "/"),
          expected: `source file must not reference '${term}'`,
          actual: `found term '${term}'`,
          message: `K6a source file '${relFile}' leaks forbidden domain term '${term}' into public API`,
        });
      }
    }
  }

  return offenders;
}

module.exports = { check };
