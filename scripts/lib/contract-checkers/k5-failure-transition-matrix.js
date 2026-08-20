"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CHECKER = "k5-failure-transition-matrix";

const ALLOWED_CATEGORIES = new Set([
  "environment_tooling",
  "cas_conflict",
  "ambiguous_effect",
  "validation_gap",
  "code_defect",
]);

const ALLOWLISTED_OPERATIONS = Object.freeze({
  environment_tooling: new Set(["replan", "escalate", "stop"]),
  cas_conflict: new Set(["replan", "escalate", "stop"]),
  ambiguous_effect: new Set(["escalate", "stop"]),
  validation_gap: new Set(["replan", "escalate", "stop"]),
  code_defect: new Set(["repair", "replan", "escalate", "stop"]),
});

const REQUIRED_FAILURE_FIELDS = ["category", "code", "priority", "blocking_fingerprint"];

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function findJsonFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".git" && entry.name !== "invalid") {
        findJsonFiles(fullPath, files);
      }
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Contract-lint checker: validates causal failure descriptors and recovery transitions (REQ-contract-lint-014).
 * @param {{root: string, failures?: Object[], transitions?: Object[], failureFiles?: string[], transitionFiles?: string[]}} ctx
 * @returns {import("../contract-lint.js").Offender[]}
 */
function check(ctx) {
  const root = path.resolve(ctx.root);
  const offenders = [];

  // Check explicit failure objects
  if (Array.isArray(ctx.failures)) {
    for (let i = 0; i < ctx.failures.length; i += 1) {
      checkFailureObject(ctx.failures[i], `failures[${i}]`, offenders);
    }
  }

  // Check explicit transition objects
  if (Array.isArray(ctx.transitions)) {
    for (let i = 0; i < ctx.transitions.length; i += 1) {
      checkTransitionObject(ctx.transitions[i], `transitions[${i}]`, offenders);
    }
  }

  // Scan fixture and change files
  const targetDirs = [
    path.join(root, "schemas", "kernel", "causal-failure", "fixtures", "valid"),
    path.join(root, "schemas", "kernel", "failure-recovery-transition", "fixtures", "valid"),
    path.join(root, "openspec", "changes"),
  ];

  const candidateFiles = ctx.failureFiles || ctx.transitionFiles || targetDirs.flatMap((dir) => findJsonFiles(dir));

  for (const filePath of candidateFiles) {
    const relPath = toPosix(path.relative(root, filePath));
    let content;
    try {
      content = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (err) {
      offenders.push({
        checker: CHECKER,
        path: relPath,
        expected: "readable JSON document",
        actual: err.message,
        message: `${relPath} could not be read: ${err.message}`,
      });
      continue;
    }

    if (content && typeof content === "object") {
      // Discriminate failure descriptors
      if (content.category !== undefined || content.failure_id !== undefined) {
        checkFailureObject(content, relPath, offenders);
      }
      // Discriminate recovery transitions
      if (content.target_operation !== undefined || content.transition_id !== undefined) {
        checkTransitionObject(content, relPath, offenders);
      }
    }
  }

  return offenders;
}

function checkFailureObject(failure, pathLabel, offenders) {
  if (!failure || typeof failure !== "object") return;

  for (const field of REQUIRED_FAILURE_FIELDS) {
    if (failure[field] === undefined || failure[field] === null || failure[field] === "") {
      offenders.push({
        checker: CHECKER,
        path: pathLabel,
        expected: `Non-empty required taxonomy field '${field}'`,
        actual: failure[field] === undefined ? "missing" : JSON.stringify(failure[field]),
        message: `Failure descriptor ${pathLabel} is missing required taxonomy field '${field}'`,
      });
    }
  }

  if (failure.category && !ALLOWED_CATEGORIES.has(failure.category)) {
    offenders.push({
      checker: CHECKER,
      path: pathLabel,
      expected: `Category in [${Array.from(ALLOWED_CATEGORIES).join(", ")}]`,
      actual: String(failure.category),
      message: `Failure descriptor ${pathLabel} has invalid category '${failure.category}'`,
    });
  }

  if (failure.priority !== undefined) {
    const p = failure.priority;
    if (!Number.isInteger(p) || p < 1 || p > 5) {
      offenders.push({
        checker: CHECKER,
        path: pathLabel,
        expected: "Integer priority between 1 and 5",
        actual: String(p),
        message: `Failure descriptor ${pathLabel} has invalid priority ${p}`,
      });
    }
  }
}

function checkTransitionObject(transition, pathLabel, offenders) {
  if (!transition || typeof transition !== "object") return;

  const category = transition.category || (transition.failure_code ? inferCategoryFromCode(transition.failure_code) : null);
  const targetOp = String(transition.target_operation || "");

  if (category && ALLOWLISTED_OPERATIONS[category]) {
    const allowed = ALLOWLISTED_OPERATIONS[category];
    if (!allowed.has(targetOp)) {
      offenders.push({
        checker: CHECKER,
        path: pathLabel,
        expected: `Allowlisted operation for '${category}' in [${Array.from(allowed).join(", ")}]`,
        actual: `Target operation '${targetOp}'`,
        message: `Recovery transition ${pathLabel} specifies unallowlisted operation '${targetOp}' for category '${category}'`,
      });
    }
  }
}

function inferCategoryFromCode(code) {
  const c = String(code).toUpperCase();
  if (c.includes("TIMEOUT") || c.includes("TOOL") || c.includes("PROCESS") || c.includes("HOST")) return "environment_tooling";
  if (c.includes("CAS") || c.includes("REVISION") || c.includes("CONCURRENCY")) return "cas_conflict";
  if (c.includes("AMBIGUOUS") || c.includes("UNKNOWN_OUTCOME")) return "ambiguous_effect";
  if (c.includes("SPEC") || c.includes("DESIGN") || c.includes("FORMAT") || c.includes("GAP") || c.includes("SCHEMA")) return "validation_gap";
  if (c.includes("DEFECT") || c.includes("ASSERT") || c.includes("TEST") || c.includes("SYNTAX")) return "code_defect";
  return null;
}

module.exports = {
  CHECKER,
  ALLOWED_CATEGORIES,
  ALLOWLISTED_OPERATIONS,
  check,
};
