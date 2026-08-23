"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CHECKER_NAME = "k6a-capsule-path-containment";

/**
 * Validates non-empty allowed_paths and rejects traversal sequences in capsule definitions and fixtures.
 *
 * @param {Object} ctx
 * @param {string} ctx.root
 * @param {Array<{ path: string, data: Object }>} [ctx.payloads]
 * @returns {Array<Object>}
 */
function check(ctx) {
  const root = ctx.root || process.cwd();
  const offenders = [];

  function validatePayloadAllowedPaths(relPath, payload) {
    if (!payload || typeof payload !== "object") return;

    if (!("allowed_paths" in payload)) {
      offenders.push({
        checker: CHECKER_NAME,
        path: relPath,
        expected: "payload must declare allowed_paths property",
        actual: "allowed_paths property is missing",
        message: `Capsule/work-order artifact '${relPath}' is missing required 'allowed_paths' property`,
      });
      return;
    }

    const allowed = payload.allowed_paths;
    if (!Array.isArray(allowed) || allowed.length === 0) {
      offenders.push({
        checker: CHECKER_NAME,
        path: relPath,
        expected: "allowed_paths must be a non-empty array",
        actual: `allowed_paths is ${Array.isArray(allowed) ? "empty array" : typeof allowed}`,
        message: `Capsule/work-order artifact '${relPath}' declares empty or non-array 'allowed_paths'`,
      });
      return;
    }

    for (const p of allowed) {
      if (typeof p !== "string" || p.includes("..") || p.includes("\0")) {
        offenders.push({
          checker: CHECKER_NAME,
          path: relPath,
          expected: "allowed_paths entries must not contain traversal sequences ('../', '..\\\\')",
          actual: `found traversal sequence in entry '${p}'`,
          message: `Capsule/work-order artifact '${relPath}' contains path traversal in allowed_paths entry '${p}'`,
        });
      }
    }
  }

  if (Array.isArray(ctx.payloads)) {
    for (const item of ctx.payloads) {
      validatePayloadAllowedPaths(item.path || "custom-payload.json", item.data);
    }
    return offenders;
  }

  // Scan capsule-definition valid fixtures
  const validCapsuleDir = path.join(root, "schemas", "kernel", "capsule-definition", "fixtures", "valid");
  if (fs.existsSync(validCapsuleDir)) {
    const files = fs.readdirSync(validCapsuleDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      const relPath = `schemas/kernel/capsule-definition/fixtures/valid/${file}`;
      try {
        const content = JSON.parse(fs.readFileSync(path.join(validCapsuleDir, file), "utf8"));
        validatePayloadAllowedPaths(relPath, content);
      } catch {
        offenders.push({
          checker: CHECKER_NAME,
          path: relPath,
          expected: "readable JSON document",
          actual: "malformed JSON document",
          message: `Capsule fixture '${relPath}' could not be parsed`,
        });
      }
    }
  }

  return offenders;
}

module.exports = { check };
