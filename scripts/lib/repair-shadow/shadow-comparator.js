"use strict";

const ALL_EVALUATED_DIMENSIONS = Object.freeze([
  "steps",
  "diffs",
  "obligations",
  "invariants",
  "inventory",
]);

function extractSteps(route) {
  if (!route) return [];
  if (Array.isArray(route.steps)) return route.steps;
  if (Array.isArray(route.nodes)) return route.nodes.map((n) => n.operation);
  if (Array.isArray(route.workResults)) {
    return route.workResults.map((wr) => wr.work_order_id);
  }
  return [];
}

function extractDiffHash(route) {
  if (!route) return null;
  if (route.diff_hash) return route.diff_hash;
  if (route.candidate && route.candidate.diff_hash) return route.candidate.diff_hash;
  if (typeof route.combinedDiffText === "string") return route.combinedDiffText;
  if (typeof route.patch === "string") return route.patch;
  return null;
}

function extractObligations(route) {
  if (!route) return [];
  if (Array.isArray(route.obligations)) {
    return route.obligations.map((o) => (typeof o === "string" ? o : o.id || o.name || JSON.stringify(o))).sort();
  }
  return [];
}

function extractInvariants(route) {
  if (!route) return [];
  if (Array.isArray(route.invariants)) {
    return [...route.invariants].sort();
  }
  return [];
}

function extractInventory(route) {
  if (!route) return [];
  if (Array.isArray(route.inventory)) return [...route.inventory].sort();
  if (route.candidate && Array.isArray(route.candidate.paths)) return [...route.candidate.paths].sort();
  if (Array.isArray(route.paths)) return [...route.paths].sort();
  if (Array.isArray(route.filesystem_inventory)) {
    return route.filesystem_inventory.map((item) => (typeof item === "string" ? item : item.path)).sort();
  }
  return [];
}

function areArraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Compares shadow execution outcome against fixed baseline route in a non-mutating, read-only manner.
 * Evaluates steps, diffs, obligations, invariants, and inventory.
 *
 * @param {Object} shadowResult
 * @param {Object} baselineResult
 * @returns {{
 *   match: boolean,
 *   discrepancy_classification: "full-match" | "partial-match" | "diverged",
 *   evaluated_dimensions: string[],
 *   skipped_dimensions: string[],
 *   dimension_match_rates: Record<string, number>,
 *   telemetryDiff: Object | null,
 *   shadowSummary: Object,
 *   baselineSummary: Object
 * }}
 */
function compareShadowExecution(shadowResult, baselineResult) {
  const shadow = shadowResult || {};
  const baseline = baselineResult || {};

  const evaluated_dimensions = [];
  const skipped_dimensions = [];
  const dimension_match_rates = {};
  const divergences = [];

  // 1. Steps
  const shadowSteps = extractSteps(shadow);
  const baselineSteps = extractSteps(baseline);
  if (shadowSteps.length > 0 || baselineSteps.length > 0) {
    evaluated_dimensions.push("steps");
    const isMatch = areArraysEqual(shadowSteps, baselineSteps);
    dimension_match_rates.steps = isMatch ? 1 : 0;
    if (!isMatch) {
      divergences.push({
        dimension: "steps",
        shadow: shadowSteps,
        baseline: baselineSteps,
      });
    }
  } else {
    skipped_dimensions.push("steps");
  }

  // 2. Diffs
  const shadowDiff = extractDiffHash(shadow);
  const baselineDiff = extractDiffHash(baseline);
  if (shadowDiff !== null || baselineDiff !== null) {
    evaluated_dimensions.push("diffs");
    const isMatch = shadowDiff === baselineDiff;
    dimension_match_rates.diffs = isMatch ? 1 : 0;
    if (!isMatch) {
      divergences.push({
        dimension: "diffs",
        shadow: shadowDiff,
        baseline: baselineDiff,
      });
    }
  } else {
    skipped_dimensions.push("diffs");
  }

  // 3. Obligations
  const shadowObligations = extractObligations(shadow);
  const baselineObligations = extractObligations(baseline);
  if (shadowObligations.length > 0 || baselineObligations.length > 0) {
    evaluated_dimensions.push("obligations");
    const isMatch = areArraysEqual(shadowObligations, baselineObligations);
    dimension_match_rates.obligations = isMatch ? 1 : 0;
    if (!isMatch) {
      divergences.push({
        dimension: "obligations",
        shadow: shadowObligations,
        baseline: baselineObligations,
      });
    }
  } else {
    skipped_dimensions.push("obligations");
  }

  // 4. Invariants
  const shadowInvariants = extractInvariants(shadow);
  const baselineInvariants = extractInvariants(baseline);
  if (shadowInvariants.length > 0 || baselineInvariants.length > 0) {
    evaluated_dimensions.push("invariants");
    const isMatch = areArraysEqual(shadowInvariants, baselineInvariants);
    dimension_match_rates.invariants = isMatch ? 1 : 0;
    if (!isMatch) {
      divergences.push({
        dimension: "invariants",
        shadow: shadowInvariants,
        baseline: baselineInvariants,
      });
    }
  } else {
    skipped_dimensions.push("invariants");
  }

  // 5. Inventory
  const shadowInventory = extractInventory(shadow);
  const baselineInventory = extractInventory(baseline);
  if (shadowInventory.length > 0 || baselineInventory.length > 0) {
    evaluated_dimensions.push("inventory");
    const isMatch = areArraysEqual(shadowInventory, baselineInventory);
    dimension_match_rates.inventory = isMatch ? 1 : 0;
    if (!isMatch) {
      divergences.push({
        dimension: "inventory",
        shadow: shadowInventory,
        baseline: baselineInventory,
      });
    }
  } else {
    skipped_dimensions.push("inventory");
  }

  // Compute overall match and classification
  const totalEvaluated = evaluated_dimensions.length;
  const matchCount = Object.values(dimension_match_rates).filter((rate) => rate === 1).length;
  const match = totalEvaluated > 0 && matchCount === totalEvaluated;

  let discrepancy_classification;
  if (match) {
    discrepancy_classification = "full-match";
  } else if (matchCount > 0) {
    discrepancy_classification = "partial-match";
  } else {
    discrepancy_classification = "diverged";
  }

  const telemetryDiff = match
    ? null
    : {
        divergences,
        dimension_match_rates,
        divergence_count: divergences.length,
      };

  return {
    match,
    discrepancy_classification,
    evaluated_dimensions,
    skipped_dimensions,
    dimension_match_rates,
    telemetryDiff,
    shadowSummary: {
      steps_count: shadowSteps.length,
      has_diff: !!shadowDiff,
      obligations_count: shadowObligations.length,
      inventory_count: shadowInventory.length,
    },
    baselineSummary: {
      steps_count: baselineSteps.length,
      has_diff: !!baselineDiff,
      obligations_count: baselineObligations.length,
      inventory_count: baselineInventory.length,
    },
  };
}

module.exports = {
  compareShadowExecution,
  ALL_EVALUATED_DIMENSIONS,
};
