"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CHECKER = "k4a-obligation-completeness";

function toPosix(relativePath) {
  return relativePath.split(path.sep).join("/");
}

function findGraphFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".git" && entry.name !== "invalid") {
        findGraphFiles(fullPath, files);
      }
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Contract-lint checker: verifies complete MUST obligation coverage in execution graphs (REQ-contract-lint-013).
 * @param {{root: string, graphs?: Object[], graphFiles?: string[]}} ctx
 * @returns {import("../contract-lint.js").Offender[]}
 */
function check(ctx) {
  const root = path.resolve(ctx.root);
  const offenders = [];

  // Check explicit graph objects passed in ctx
  if (Array.isArray(ctx.graphs)) {
    for (let i = 0; i < ctx.graphs.length; i += 1) {
      const graph = ctx.graphs[i];
      checkGraphObligations(graph, `graphs[${i}]`, offenders);
    }
  }

  // Scan graph files in schemas/kernel/execution-graph/fixtures/valid and openspec/changes
  const targetDirs = [
    path.join(root, "schemas", "kernel", "execution-graph", "fixtures", "valid"),
    path.join(root, "openspec", "changes"),
  ];

  const candidateFiles = ctx.graphFiles || targetDirs.flatMap((dir) => findGraphFiles(dir));

  for (const filePath of candidateFiles) {
    const relPath = toPosix(path.relative(root, filePath));
    let content;
    try {
      content = JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (err) {
      offenders.push({
        checker: CHECKER,
        path: relPath,
        expected: "readable execution graph JSON",
        actual: err.message,
        message: `${relPath} could not be read: ${err.message}`,
      });
      continue;
    }

    if (content && typeof content === "object" && Array.isArray(content.obligations)) {
      checkGraphObligations(content, relPath, offenders);
    }
  }

  return offenders;
}

function checkGraphObligations(graph, pathLabel, offenders) {
  if (!graph || typeof graph !== "object" || !Array.isArray(graph.obligations)) return;

  const nodeIds = new Set();
  if (Array.isArray(graph.nodes)) {
    for (const n of graph.nodes) {
      if (n && typeof n.node_id === "string") nodeIds.add(n.node_id);
    }
  }

  for (const obligation of graph.obligations) {
    if (!obligation || typeof obligation !== "object") continue;

    const id = String(obligation.id || "<unknown>");
    const criticality = String(obligation.criticality || "must").toLowerCase();

    if (criticality !== "must") continue;

    const hasDeferral =
      obligation.deferred &&
      typeof obligation.deferred === "object" &&
      typeof obligation.deferred.reason === "string" &&
      obligation.deferred.reason.trim() !== "" &&
      typeof obligation.deferred.approved_by === "string" &&
      obligation.deferred.approved_by.trim() !== "";

    if (hasDeferral) continue;

    const implementedBy = Array.isArray(obligation.implemented_by) ? obligation.implemented_by : [];
    const requiredEvidence = Array.isArray(obligation.required_evidence) ? obligation.required_evidence : [];

    if (implementedBy.length === 0 || requiredEvidence.length === 0) {
      offenders.push({
        checker: CHECKER,
        path: pathLabel,
        expected: `MUST obligation '${id}' to have non-empty implemented_by and required_evidence (or approved deferral)`,
        actual: `implemented_by: ${JSON.stringify(implementedBy)}, required_evidence: ${JSON.stringify(requiredEvidence)}`,
        message: `Execution graph ${pathLabel} contains unmapped or evidence-lacking MUST obligation '${id}'`,
      });
    }
  }
}

module.exports = {
  CHECKER,
  check,
};
