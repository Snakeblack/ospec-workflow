"use strict";

// Declarative structural matcher for the golden eval suite (REQ-orchestrator-evals-002).
//
// `assertScenario(expect, captured)` compares ONLY structural fields captured from a
// live orchestrator run: the resolved route, blocker_type, state.yaml field values,
// artifact presence/absence in the workspace file tree, and question_gate shape
// (question count, per-question minimum option count, recommended-flag presence).
// It never reads or compares free-text prose (executive_summary, question/option
// wording, rationale) — see design.md's "Declarative structural matcher" ADR.
//
// Every divergence is named in `failures[]` (dotted-path style, e.g. "state.status:
// expected X, got Y") so a failing scenario report is attributable to the exact
// field that diverged (REQ-orchestrator-evals-003's attributability scenario).

function describe(value) {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  return JSON.stringify(value);
}

/**
 * Resolves the actual route taken from a captured state.yaml, tolerating either
 * shape the orchestrator may persist: a flat `next_recommended` field, or a
 * nested `route.actual_route` map.
 */
function resolveActualRoute(state) {
  if (!state) {
    return undefined;
  }
  if (state.next_recommended !== undefined) {
    return state.next_recommended;
  }
  if (state.route && typeof state.route === "object") {
    return state.route.actual_route;
  }
  return undefined;
}

function checkRoute(expect, captured, failures) {
  if (expect.route === undefined) {
    return;
  }

  const actual = resolveActualRoute(captured.state);

  if (actual !== expect.route) {
    failures.push(
      `route: expected ${describe(expect.route)}, got ${describe(actual)}`,
    );
  }
}

function checkBlockerType(expect, captured, failures) {
  if (expect.blocker_type === undefined) {
    return;
  }

  const actual = captured.envelope ? captured.envelope.blocker_type : undefined;

  if (actual !== expect.blocker_type) {
    failures.push(
      `blocker_type: expected ${describe(expect.blocker_type)}, got ${describe(actual)}`,
    );
  }
}

function checkStateFields(expect, captured, failures) {
  if (expect.state === undefined) {
    return;
  }

  const state = captured.state || {};

  for (const [key, expectedValue] of Object.entries(expect.state)) {
    if (key === "blocking_questions_nonempty") {
      const list = Array.isArray(state.blocking_questions)
        ? state.blocking_questions
        : [];
      const actual = list.length > 0;

      if (actual !== expectedValue) {
        failures.push(
          `state.blocking_questions_nonempty: expected ${describe(expectedValue)}, got ${describe(actual)}`,
        );
      }
      continue;
    }

    const actual = state[key];

    if (actual !== expectedValue) {
      failures.push(
        `state.${key}: expected ${describe(expectedValue)}, got ${describe(actual)}`,
      );
    }
  }
}

function checkArtifactsPresent(expect, captured, failures) {
  if (!Array.isArray(expect.artifacts_present)) {
    return;
  }

  const fileTree = captured.fileTree || [];

  for (const artifactPath of expect.artifacts_present) {
    if (!fileTree.includes(artifactPath)) {
      failures.push(
        `artifacts_present: expected ${describe(artifactPath)} to exist, but it was not found in the workspace`,
      );
    }
  }
}

function checkArtifactsAbsent(expect, captured, failures) {
  if (!Array.isArray(expect.artifacts_absent)) {
    return;
  }

  const fileTree = captured.fileTree || [];

  for (const forbiddenPath of expect.artifacts_absent) {
    const found = fileTree.some(
      (entry) => entry === forbiddenPath || entry.startsWith(`${forbiddenPath}/`),
    );

    if (found) {
      failures.push(
        `artifacts_absent: expected ${describe(forbiddenPath)} to be absent, but it was found in the workspace`,
      );
    }
  }
}

function checkQuestionGate(expect, captured, failures) {
  if (expect.question_gate === undefined) {
    return;
  }

  if (expect.question_gate === null) {
    if (captured.gate) {
      failures.push(
        "question_gate: expected no gate to be captured, but a gate.json was present",
      );
    }
    return;
  }

  const { questions, options_min: optionsMin, recommended_present: recommendedPresent } =
    expect.question_gate;
  const gate = captured.gate;
  const gateQuestions = gate && Array.isArray(gate.questions) ? gate.questions : [];

  if (typeof questions === "number" && gateQuestions.length !== questions) {
    failures.push(
      `question_gate.questions: expected ${describe(questions)}, got ${describe(gateQuestions.length)}`,
    );
  }

  if (optionsMin && typeof optionsMin === "object") {
    for (const [index, minCount] of Object.entries(optionsMin)) {
      const question = gateQuestions[Number(index)];
      const optionCount = question && Array.isArray(question.options) ? question.options.length : 0;

      if (optionCount < minCount) {
        failures.push(
          `question_gate.options_min[${index}]: expected at least ${describe(minCount)}, got ${describe(optionCount)}`,
        );
      }
    }
  }

  if (recommendedPresent && typeof recommendedPresent === "object") {
    for (const [index, expected] of Object.entries(recommendedPresent)) {
      const question = gateQuestions[Number(index)];
      const options = question && Array.isArray(question.options) ? question.options : [];
      const actual = options.some((option) => option && option.recommended === true);

      if (actual !== expected) {
        failures.push(
          `question_gate.recommended_present[${index}]: expected ${describe(expected)}, got ${describe(actual)}`,
        );
      }
    }
  }
}

// Harness-only paths that the live driver protocol (or the fixture setup
// step) writes into a workspace but that are never part of the orchestrator's
// own output — these must never count as "new files" for fileTreeUnchanged.
// `.eval-capture/**` is the gate/envelope/done/materialized side-channel;
// `.gitignore` is injected by run.js's applyGitBaseline (git-baselined
// fixtures only) purely so that same side-channel doesn't show up as
// untracked inside the fixture's own nested git repo — see
// scripts/evals/README.md's GIT-BASELINE.json contract.
const HARNESS_ONLY_PREFIX = ".eval-capture/";
const HARNESS_ONLY_EXACT_PATHS = new Set([".gitignore"]);

function isHarnessOnlyPath(entry) {
  return entry.startsWith(HARNESS_ONLY_PREFIX) || HARNESS_ONLY_EXACT_PATHS.has(entry);
}

/**
 * Compares the captured workspace file tree against a scenario's pre-recorded
 * `baselineFileTree` (the exact set of files its `repo/` seed ships), so a
 * no-op scenario (REQ-orchestrator-evals-001's "doc update no-op") can prove
 * NO new output files appeared — not merely that one proxy field (like
 * `state.yaml.last_updated`) was left unchanged. Every unexpected extra file
 * and every missing expected file is named individually in `failures[]`.
 */
function checkFileTreeUnchanged(expect, captured, failures) {
  if (expect.fileTreeUnchanged !== true) {
    return;
  }

  if (!Array.isArray(expect.baselineFileTree)) {
    failures.push(
      "fileTreeUnchanged: expect.baselineFileTree must be an array when " +
        "fileTreeUnchanged is true",
    );
    return;
  }

  const actualTree = (captured.fileTree || []).filter(
    (entry) => !isHarnessOnlyPath(entry),
  );
  const baseline = expect.baselineFileTree;

  const unexpectedNew = actualTree.filter((entry) => !baseline.includes(entry));
  const unexpectedMissing = baseline.filter((entry) => !actualTree.includes(entry));

  for (const extraPath of unexpectedNew) {
    failures.push(
      `fileTreeUnchanged: unexpected new file ${describe(extraPath)} was not in the recorded baseline`,
    );
  }

  for (const missingPath of unexpectedMissing) {
    failures.push(
      `fileTreeUnchanged: expected baseline file ${describe(missingPath)} is missing`,
    );
  }
}

/**
 * Evaluates a scenario's `expect` shape (see design.md's scenario.json manifest
 * contract) against a `captured` workspace snapshot (see lib/capture.js).
 *
 * @param {object} expect - the scenario's `expect` block
 * @param {{ workspaceRoot: string, state: object|null, fileTree: string[],
 *   gate: object|null, envelope: object|null }} captured
 * @returns {{ pass: boolean, failures: string[] }}
 */
function assertScenario(expect, captured) {
  const failures = [];

  checkRoute(expect, captured, failures);
  checkBlockerType(expect, captured, failures);
  checkStateFields(expect, captured, failures);
  checkArtifactsPresent(expect, captured, failures);
  checkArtifactsAbsent(expect, captured, failures);
  checkFileTreeUnchanged(expect, captured, failures);
  checkQuestionGate(expect, captured, failures);

  return { pass: failures.length === 0, failures };
}

module.exports = { assertScenario, resolveActualRoute };
