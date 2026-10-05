"use strict";

// Per-task statistics for the bench. Repetitions of a task are correlated, so
// the task (scenario) is the statistical unit. Moved from the retired K12
// runner (v2.105.0).

// Two-sided 95% Student t quantiles for 1..30 degrees of freedom.
const T_975 = Object.freeze([
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228,
  2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086,
  2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042,
]);

function round(value) {
  return Math.round(value * 1e6) / 1e6;
}

/**
 * Mean, sample standard deviation, and a two-sided 95% t interval over
 * per-task values. With fewer than two tasks the spread is undefined (null).
 */
function taskInterval(values) {
  const n = values.length;
  if (n === 0) return { tasks: 0, mean: null, sd: null, ci95: null };
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  if (n < 2) return { tasks: n, mean: round(mean), sd: null, ci95: null };
  const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1));
  const quantile = n - 1 <= T_975.length ? T_975[n - 2] : 1.96;
  const half = quantile * (sd / Math.sqrt(n));
  return { tasks: n, mean: round(mean), sd: round(sd), ci95: [round(mean - half), round(mean + half)] };
}

module.exports = { taskInterval };
