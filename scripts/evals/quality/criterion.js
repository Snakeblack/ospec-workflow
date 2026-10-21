"use strict";

// The quality criterion the bench margins declare (E4.5), apart from
// quality.js so the bench checkpoint can apply it (OSP-026) without loading
// the analysis tooling, which itself loads the checkpoint's margins.

const { taskInterval } = require("../bench/stats.js");

// A delivery's mutation score for the quality criterion: a suite that fails
// before any mutant protects nothing and counts as 0; a delivery with no code
// to mutate has no score and is left out.
function criterionScore(arm) {
  if (arm.mutation.suite_passes === false) return 0;
  return typeof arm.mutation.score === "number" ? arm.mutation.score : null;
}

/**
 * The quality criterion the margins declare (E4.5): the candidate's mean
 * mutation score may trail the baseline's by at most
 * `max_mutation_score_deficit` points, and the blind review may prefer the
 * baseline in both orders in at most `max_consistent_baseline_preferences`
 * pairs. Every pair must be judged.
 */
function evaluateQuality(results, criterion) {
  const entries = Object.values(results.scenarios);
  const scores = (arm) => entries.map((entry) => criterionScore(entry[arm])).filter((value) => value !== null);
  const mutation = { baseline: taskInterval(scores("baseline")), candidate: taskInterval(scores("candidate")) };
  const reasons = [];
  if (mutation.baseline.mean === null || mutation.candidate.mean === null) {
    reasons.push("a record has no mutation score to compare");
  } else {
    const deficit = Math.round((mutation.baseline.mean - mutation.candidate.mean) * 100) / 100;
    if (deficit > criterion.max_mutation_score_deficit) {
      reasons.push(`the candidate's mean mutation score trails the baseline's by ${deficit} points (margin ${criterion.max_mutation_score_deficit})`);
    }
  }
  const judged = entries.filter((entry) => entry.judge);
  if (judged.length < entries.length) reasons.push(`${entries.length - judged.length} of ${entries.length} pairs are not judged`);
  const baselinePreferences = judged.filter((entry) => entry.judge.preferred === "baseline").length;
  if (baselinePreferences > criterion.max_consistent_baseline_preferences) {
    reasons.push(`the blind review prefers the baseline in both orders in ${baselinePreferences} pairs (margin ${criterion.max_consistent_baseline_preferences})`);
  }
  return { decision: reasons.length === 0 ? "continue" : "revise", mutation, pairs: judged.length, baseline_preferences: baselinePreferences, reasons };
}

module.exports = { criterionScore, evaluateQuality };
