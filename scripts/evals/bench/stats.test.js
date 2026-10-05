"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { taskInterval } = require("./stats.js");

test("taskInterval is empty without tasks and has no spread with one", () => {
  assert.deepEqual(taskInterval([]), { tasks: 0, mean: null, sd: null, ci95: null });
  assert.deepEqual(taskInterval([0.8]), { tasks: 1, mean: 0.8, sd: null, ci95: null });
});

test("taskInterval uses the t quantile for the number of tasks", () => {
  // n = 2: df 1, t = 12.706; mean 1, sd sqrt(2), half = 12.706 * sqrt(2) / sqrt(2)
  assert.deepEqual(taskInterval([0, 2]), { tasks: 2, mean: 1, sd: 1.414214, ci95: [-11.706, 13.706] });
  // n = 6: df 5, t = 2.571
  const six = taskInterval([1, 1, 1, 1, 1, 1]);
  assert.deepEqual(six, { tasks: 6, mean: 1, sd: 0, ci95: [1, 1] });
});

test("taskInterval falls back to the normal quantile past the table", () => {
  const values = Array.from({ length: 40 }, (_, index) => index % 2);
  const result = taskInterval(values);
  const sd = Math.sqrt(values.reduce((sum, value) => sum + (value - 0.5) ** 2, 0) / 39);
  assert.equal(result.ci95[1], Math.round((0.5 + 1.96 * sd / Math.sqrt(40)) * 1e6) / 1e6);
});
