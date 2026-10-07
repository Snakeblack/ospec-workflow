"use strict";

// Blind pairwise review of two deliveries of the same scenario. The judge sees
// the request, the requirements agreed with the user and two scrubbed product
// diffs named only A and B. Every pair is judged twice with the order swapped,
// and the verdicts are mapped back to the arms, so position bias shows up as
// an inconsistent preference instead of a win.

const JUDGE_CRITERIA = Object.freeze(["correctness", "readability", "design", "tests", "scope"]);

const CRITERIA_TEXT = Object.freeze({
  correctness: "correctness: does the code do what the request and the requirements ask, including edge cases, with no visible bug?",
  readability: "readability: is it easy to read, with clear names and no needless complexity?",
  design: "design: does it fit the existing code, with sensible structure and no duplication?",
  tests: "tests: do the tests cover the required behavior and edge cases, and would they catch regressions?",
  scope: "scope: does it change only what the request needs, with docs updated where users rely on them?",
});

const SCORE = { type: "integer", minimum: 1, maximum: 5 };

const JUDGE_SCHEMA = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["scores", "preferred", "rationale"],
  properties: {
    scores: {
      type: "object",
      additionalProperties: false,
      required: [...JUDGE_CRITERIA],
      properties: Object.fromEntries(
        JUDGE_CRITERIA.map((criterion) => [
          criterion,
          { type: "object", additionalProperties: false, required: ["A", "B"], properties: { A: SCORE, B: SCORE } },
        ]),
      ),
    },
    preferred: { type: "string", enum: ["A", "B", "tie"] },
    rationale: { type: "string" },
  },
});

const MAX_DIFF_CHARS = 60000;

function clip(diff) {
  return diff.length > MAX_DIFF_CHARS ? `${diff.slice(0, MAX_DIFF_CHARS)}\n[... diff clipped ...]` : diff;
}

function buildJudgePrompt({ brief, requirements = [], first, second }) {
  const lines = [
    "You review two independent deliveries of the same change to the same repository.",
    "Judge only the code, tests and docs in the diffs. Both already pass the project's acceptance checks.",
    "",
    "## Request",
    brief,
  ];
  if (requirements.length > 0) {
    lines.push("", "## Requirements agreed with the user", ...requirements.map((text) => `- ${text}`));
  }
  lines.push(
    "",
    "## Criteria (score each delivery from 1, poor, to 5, excellent)",
    ...JUDGE_CRITERIA.map((criterion) => `- ${CRITERIA_TEXT[criterion]}`),
    "",
    "Then say which delivery you would merge (A, B or tie) and why, in at most five sentences.",
    "",
    "## Delivery A",
    "```diff",
    clip(first),
    "```",
    "",
    "## Delivery B",
    "```diff",
    clip(second),
    "```",
  );
  return lines.join("\n");
}

function round(value) {
  return Math.round(value * 100) / 100;
}

/**
 * @param {{order: [string, string], verdict: {scores: object, preferred: string}}[]} judgments
 *   order[0] is the arm shown as A, order[1] the arm shown as B.
 */
function aggregateJudgments(judgments) {
  const arms = [...new Set(judgments.flatMap((judgment) => judgment.order))];
  const sums = Object.fromEntries(arms.map((arm) => [arm, Object.fromEntries(JUDGE_CRITERIA.map((c) => [c, 0]))]));
  const preferences = [];
  for (const { order, verdict } of judgments) {
    for (const criterion of JUDGE_CRITERIA) {
      sums[order[0]][criterion] += verdict.scores[criterion].A;
      sums[order[1]][criterion] += verdict.scores[criterion].B;
    }
    preferences.push(verdict.preferred === "tie" ? "tie" : order[verdict.preferred === "A" ? 0 : 1]);
  }
  const scores = Object.fromEntries(
    arms.map((arm) => [arm, Object.fromEntries(JUDGE_CRITERIA.map((c) => [c, round(sums[arm][c] / judgments.length)]))]),
  );
  const preferred = preferences.every((value) => value === preferences[0]) ? preferences[0] : "inconsistent";
  return { scores, preferred, preferences };
}

module.exports = { JUDGE_CRITERIA, JUDGE_SCHEMA, aggregateJudgments, buildJudgePrompt };
