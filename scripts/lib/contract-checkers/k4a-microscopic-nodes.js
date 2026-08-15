"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CHECKER = "k4a-microscopic-nodes";
const FORBIDDEN_OPERATIONS = new Set([
  "read",
  "edit",
  "test",
  "file_edit",
  "bash_run",
  "grep",
]);

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
 * Contract-lint checker: rejects microscopic operations in execution graph nodes (REQ-contract-lint-012).
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
      checkGraphObject(graph, `graphs[${i}]`, offenders);
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

    if (content && typeof content === "object" && Array.isArray(content.nodes)) {
      checkGraphObject(content, relPath, offenders);
    }
  }

  return offenders;
}

function checkGraphObject(graph, pathLabel, offenders) {
  if (!graph || typeof graph !== "object" || !Array.isArray(graph.nodes)) return;

  for (const node of graph.nodes) {
    if (!node || typeof node !== "object") continue;
    const op = String(node.operation || "").toLowerCase();
    const nodeId = String(node.node_id || "<unknown>");

    if (FORBIDDEN_OPERATIONS.has(op)) {
      offenders.push({
        checker: CHECKER,
        path: pathLabel,
        expected: `Coarse semantic operation (not microscopic action '${op}')`,
        actual: `Microscopic operation '${op}' on node '${nodeId}'`,
        message: `Execution graph ${pathLabel} node '${nodeId}' contains forbidden microscopic operation '${op}'`,
      });
    }
  }
}

module.exports = {
  CHECKER,
  FORBIDDEN_OPERATIONS,
  check,
};
