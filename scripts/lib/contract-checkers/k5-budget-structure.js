"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CHECKER = "k5-budget-structure";

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
 * Contract-lint checker: validates budget structure, quotas, and monotonicity hierarchy (REQ-contract-lint-015).
 * @param {{root: string, budgets?: Object[], graphs?: Object[], workOrders?: Object[], budgetFiles?: string[]}} ctx
 * @returns {import("../contract-lint.js").Offender[]}
 */
function check(ctx) {
  const root = path.resolve(ctx.root);
  const offenders = [];

  // Check explicit budget objects
  if (Array.isArray(ctx.budgets)) {
    for (let i = 0; i < ctx.budgets.length; i += 1) {
      checkBudgetObject(ctx.budgets[i], `budgets[${i}]`, offenders);
    }
  }

  // Check explicit graph objects
  if (Array.isArray(ctx.graphs)) {
    for (let i = 0; i < ctx.graphs.length; i += 1) {
      checkGraphBudgets(ctx.graphs[i], `graphs[${i}]`, offenders);
    }
  }

  // Check explicit work orders
  if (Array.isArray(ctx.workOrders)) {
    for (let i = 0; i < ctx.workOrders.length; i += 1) {
      checkWorkOrderBudget(ctx.workOrders[i], `workOrders[${i}]`, offenders);
    }
  }

  // Scan fixture and change files
  const targetDirs = [
    path.join(root, "schemas", "kernel", "execution-budget", "fixtures", "valid"),
    path.join(root, "schemas", "kernel", "authority-effect-budget", "fixtures", "valid"),
    path.join(root, "schemas", "kernel", "work-order", "fixtures", "valid"),
    path.join(root, "openspec", "changes"),
  ];

  const candidateFiles = ctx.budgetFiles || targetDirs.flatMap((dir) => findJsonFiles(dir));

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
      if (content.turns !== undefined || content.effect_attempts !== undefined) {
        checkBudgetObject(content, relPath, offenders);
      }
      if (content.budget && typeof content.budget === "object") {
        checkBudgetObject(content.budget, `${relPath}#budget`, offenders);
      }
      if (Array.isArray(content.nodes)) {
        checkGraphBudgets(content, relPath, offenders);
      }
    }
  }

  return offenders;
}

function checkBudgetObject(budget, pathLabel, offenders) {
  if (!budget || typeof budget !== "object") return;

  // Node budget fields
  if (budget.turns !== undefined) {
    checkPositiveInteger(budget.turns, "turns", pathLabel, offenders);
  }
  if (budget.model_turns !== undefined) {
    checkNonNegativeInteger(budget.model_turns, "model_turns", pathLabel, offenders);
  }
  if (budget.patches !== undefined) {
    checkNonNegativeInteger(budget.patches, "patches", pathLabel, offenders);
  }
  if (budget.commands !== undefined) {
    checkNonNegativeInteger(budget.commands, "commands", pathLabel, offenders);
  }
  if (budget.wall_time_minutes !== undefined) {
    checkPositiveNumber(budget.wall_time_minutes, "wall_time_minutes", pathLabel, offenders);
  }
  if (budget.changed_lines !== undefined) {
    checkPositiveInteger(budget.changed_lines, "changed_lines", pathLabel, offenders);
  }

  // Authority budget fields
  if (budget.effect_attempts !== undefined) {
    checkPositiveInteger(budget.effect_attempts, "effect_attempts", pathLabel, offenders);
  }
  if (budget.authority_mutations !== undefined) {
    checkNonNegativeInteger(budget.authority_mutations, "authority_mutations", pathLabel, offenders);
  }
  if (budget.evidence_runs !== undefined) {
    checkNonNegativeInteger(budget.evidence_runs, "evidence_runs", pathLabel, offenders);
  }
  if (budget.review_sweeps !== undefined) {
    checkNonNegativeInteger(budget.review_sweeps, "review_sweeps", pathLabel, offenders);
  }

  // Parent/child hierarchy inflation check
  if (budget.parent_budget && typeof budget.parent_budget === "object") {
    checkBudgetHierarchy(budget, budget.parent_budget, pathLabel, offenders);
  }
}

function checkBudgetHierarchy(childBudget, parentBudget, pathLabel, offenders) {
  const dimensions = [
    "turns",
    "effect_attempts",
    "patches",
    "commands",
    "changed_lines",
    "authority_mutations",
  ];

  for (const dim of dimensions) {
    if (childBudget[dim] !== undefined && parentBudget[dim] !== undefined) {
      if (childBudget[dim] > parentBudget[dim]) {
        offenders.push({
          checker: CHECKER,
          path: pathLabel,
          expected: `Child budget '${dim}' <= parent budget (${parentBudget[dim]})`,
          actual: `Child budget '${dim}' is ${childBudget[dim]}`,
          message: `Child repair budget in ${pathLabel} inflates parent budget dimension '${dim}': ${childBudget[dim]} > ${parentBudget[dim]}`,
        });
      }
    }
  }
}

function checkGraphBudgets(graph, pathLabel, offenders) {
  if (!graph || !Array.isArray(graph.nodes)) return;

  for (const node of graph.nodes) {
    if (!node || typeof node !== "object") continue;
    const nodeId = String(node.node_id || "<unknown>");
    if (node.budget && typeof node.budget === "object") {
      checkBudgetObject(node.budget, `${pathLabel}#node(${nodeId})`, offenders);
    }
  }
}

function checkWorkOrderBudget(wo, pathLabel, offenders) {
  if (!wo || typeof wo !== "object") return;
  if (wo.budget && typeof wo.budget === "object") {
    checkBudgetObject(wo.budget, `${pathLabel}#wo(${wo.work_order_id || ""})`, offenders);
  }
  if (wo.parent_budget && typeof wo.parent_budget === "object") {
    checkBudgetHierarchy(wo.budget || wo, wo.parent_budget, pathLabel, offenders);
  }
}

function checkPositiveInteger(value, fieldName, pathLabel, offenders) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    offenders.push({
      checker: CHECKER,
      path: pathLabel,
      expected: `Positive integer >= 1 for '${fieldName}'`,
      actual: typeof value === "number" ? String(value) : `${typeof value} (${JSON.stringify(value)})`,
      message: `Budget declaration ${pathLabel} field '${fieldName}' must be a positive integer >= 1, got ${JSON.stringify(value)}`,
    });
  }
}

function checkNonNegativeInteger(value, fieldName, pathLabel, offenders) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    offenders.push({
      checker: CHECKER,
      path: pathLabel,
      expected: `Non-negative integer >= 0 for '${fieldName}'`,
      actual: typeof value === "number" ? String(value) : `${typeof value} (${JSON.stringify(value)})`,
      message: `Budget declaration ${pathLabel} field '${fieldName}' must be a non-negative integer >= 0, got ${JSON.stringify(value)}`,
    });
  }
}

function checkPositiveNumber(value, fieldName, pathLabel, offenders) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    offenders.push({
      checker: CHECKER,
      path: pathLabel,
      expected: `Positive number > 0 for '${fieldName}'`,
      actual: typeof value === "number" ? String(value) : `${typeof value} (${JSON.stringify(value)})`,
      message: `Budget declaration ${pathLabel} field '${fieldName}' must be a positive number > 0, got ${JSON.stringify(value)}`,
    });
  }
}

module.exports = {
  CHECKER,
  check,
};
