"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { assertScenario } = require("./assertions.js");

function baseCaptured(overrides = {}) {
  return {
    workspaceRoot: "/tmp/workspace",
    state: null,
    fileTree: [],
    gate: null,
    envelope: null,
    ...overrides,
  };
}

test("assertScenario: route match via state.next_recommended passes", () => {
  const expect = { route: "sdd-spec" };
  const captured = baseCaptured({ state: { next_recommended: "sdd-spec" } });

  const result = assertScenario(expect, captured);

  assert.equal(result.pass, true);
  assert.deepEqual(result.failures, []);
});

test("assertScenario: route mismatch names the diverged field", () => {
  const expect = { route: "sdd-spec" };
  const captured = baseCaptured({ state: { next_recommended: "sdd-apply" } });

  const result = assertScenario(expect, captured);

  assert.equal(result.pass, false);
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /^route:/);
});

test("assertScenario: route matches via state.route.actual_route fallback", () => {
  const expect = { route: "high-risk" };
  const captured = baseCaptured({
    state: { route: { actual_route: "high-risk" } },
  });

  const result = assertScenario(expect, captured);

  assert.equal(result.pass, true);
});

test("assertScenario: blocker_type match against captured envelope", () => {
  const expect = { blocker_type: "design-mismatch" };
  const captured = baseCaptured({ envelope: { blocker_type: "design-mismatch" } });

  const result = assertScenario(expect, captured);

  assert.equal(result.pass, true);
});

test("assertScenario: blocker_type divergence is named in failures", () => {
  const expect = { blocker_type: "design-mismatch" };
  const captured = baseCaptured({ envelope: { blocker_type: "spec-change-required" } });

  const result = assertScenario(expect, captured);

  assert.equal(result.pass, false);
  assert.ok(result.failures.some((failure) => failure.startsWith("blocker_type:")));
});

test("assertScenario: state.status field match", () => {
  const expect = { state: { status: "blocked" } };
  const captured = baseCaptured({ state: { status: "blocked" } });

  const result = assertScenario(expect, captured);

  assert.equal(result.pass, true);
});

test("assertScenario: state.status divergence fails and names state.status", () => {
  const expect = { state: { status: "blocked" } };
  const captured = baseCaptured({ state: { status: "planning" } });

  const result = assertScenario(expect, captured);

  assert.equal(result.pass, false);
  assert.ok(result.failures.some((failure) => failure.startsWith("state.status:")));
});

test("assertScenario: state.blocking_questions_nonempty derives from the blocking_questions list", () => {
  const expect = { state: { blocking_questions_nonempty: true } };
  const captured = baseCaptured({
    state: { blocking_questions: ["Which model tier?"] },
  });

  const result = assertScenario(expect, captured);

  assert.equal(result.pass, true);
});

test("assertScenario: state.blocking_questions_nonempty fails against an empty list", () => {
  const expect = { state: { blocking_questions_nonempty: true } };
  const captured = baseCaptured({ state: { blocking_questions: [] } });

  const result = assertScenario(expect, captured);

  assert.equal(result.pass, false);
  assert.ok(
    result.failures.some((failure) =>
      failure.startsWith("state.blocking_questions_nonempty:"),
    ),
  );
});

test("assertScenario: artifacts_present fails when an expected path is missing", () => {
  const expect = {
    artifacts_present: ["openspec/changes/foo/design.md"],
  };
  const captured = baseCaptured({ fileTree: ["openspec/changes/foo/tasks.md"] });

  const result = assertScenario(expect, captured);

  assert.equal(result.pass, false);
  assert.ok(
    result.failures.some((failure) =>
      failure.includes("openspec/changes/foo/design.md"),
    ),
  );
});

test("assertScenario: artifacts_absent fails when a forbidden path is present", () => {
  const expect = { artifacts_absent: ["openspec/changes"] };
  const captured = baseCaptured({
    fileTree: ["openspec/changes/foo/proposal.md"],
  });

  const result = assertScenario(expect, captured);

  assert.equal(result.pass, false);
  assert.ok(result.failures.some((failure) => failure.startsWith("artifacts_absent:")));
});

test("assertScenario: artifacts_absent passes when the forbidden path never appears", () => {
  const expect = { artifacts_absent: ["openspec/changes"] };
  const captured = baseCaptured({ fileTree: ["README.md"] });

  const result = assertScenario(expect, captured);

  assert.equal(result.pass, true);
});

test("assertScenario: question_gate shape — question count, option count, recommended flags", () => {
  const expect = {
    question_gate: {
      questions: 2,
      options_min: { 0: 2, 1: 4 },
      recommended_present: { 0: true, 1: true },
    },
  };
  const captured = baseCaptured({
    gate: {
      questions: [
        {
          options: [
            { label: "English", recommended: true },
            { label: "Spanish" },
          ],
        },
        {
          options: [
            { label: "A" },
            { label: "B" },
            { label: "C" },
            { label: "D", recommended: true },
          ],
        },
      ],
    },
  });

  const result = assertScenario(expect, captured);

  assert.equal(result.pass, true);
});

test("assertScenario: question_gate fails and names the diverged sub-field on option-count shortfall", () => {
  const expect = {
    question_gate: {
      questions: 2,
      options_min: { 0: 2, 1: 4 },
      recommended_present: { 0: true, 1: true },
    },
  };
  const captured = baseCaptured({
    gate: {
      questions: [
        { options: [{ label: "English", recommended: true }, { label: "Spanish" }] },
        { options: [{ label: "A" }, { label: "B" }] },
      ],
    },
  });

  const result = assertScenario(expect, captured);

  assert.equal(result.pass, false);
  assert.ok(
    result.failures.some((failure) => failure.startsWith("question_gate.options_min[1]:")),
  );
});

test("assertScenario: question_gate expected null fails when a gate was captured anyway", () => {
  const expect = { question_gate: null };
  const captured = baseCaptured({ gate: { questions: [] } });

  const result = assertScenario(expect, captured);

  assert.equal(result.pass, false);
  assert.ok(result.failures.some((failure) => failure.startsWith("question_gate:")));
});

test("assertScenario: fileTreeUnchanged passes when the captured tree matches the recorded baseline exactly", () => {
  const expect = {
    fileTreeUnchanged: true,
    baselineFileTree: ["README.md", "openwiki/.last-update.json", "openwiki/quickstart.md"],
  };
  const captured = baseCaptured({
    fileTree: ["README.md", "openwiki/.last-update.json", "openwiki/quickstart.md"],
  });

  const result = assertScenario(expect, captured);

  assert.equal(result.pass, true);
  assert.deepEqual(result.failures, []);
});

test("assertScenario: fileTreeUnchanged fails and names an unexpected new file", () => {
  const expect = {
    fileTreeUnchanged: true,
    baselineFileTree: ["README.md", "openwiki/.last-update.json"],
  };
  const captured = baseCaptured({
    fileTree: ["README.md", "openwiki/.last-update.json", "openwiki/quickstart-v2.md"],
  });

  const result = assertScenario(expect, captured);

  assert.equal(result.pass, false);
  assert.ok(
    result.failures.some(
      (failure) =>
        failure.startsWith("fileTreeUnchanged:") &&
        failure.includes("openwiki/quickstart-v2.md"),
    ),
  );
});

test("assertScenario: fileTreeUnchanged fails and names a missing expected file", () => {
  const expect = {
    fileTreeUnchanged: true,
    baselineFileTree: ["README.md", "openwiki/.last-update.json"],
  };
  const captured = baseCaptured({ fileTree: ["README.md"] });

  const result = assertScenario(expect, captured);

  assert.equal(result.pass, false);
  assert.ok(
    result.failures.some(
      (failure) =>
        failure.startsWith("fileTreeUnchanged:") &&
        failure.includes("openwiki/.last-update.json"),
    ),
  );
});

test("assertScenario: fileTreeUnchanged ignores harness-only .eval-capture/ paths", () => {
  const expect = {
    fileTreeUnchanged: true,
    baselineFileTree: ["README.md"],
  };
  const captured = baseCaptured({
    fileTree: [
      "README.md",
      ".eval-capture/done.json",
      ".eval-capture/materialized.json",
    ],
  });

  const result = assertScenario(expect, captured);

  assert.equal(result.pass, true);
});

test("assertScenario: fileTreeUnchanged ignores the harness-injected .gitignore (git-baselined fixtures)", () => {
  const expect = {
    fileTreeUnchanged: true,
    baselineFileTree: ["README.md"],
  };
  const captured = baseCaptured({
    fileTree: ["README.md", ".gitignore"],
  });

  const result = assertScenario(expect, captured);

  assert.equal(result.pass, true);
});

test("assertScenario: fileTreeUnchanged is a no-op when the expect block doesn't set it", () => {
  const expect = { state: { status: "blocked" } };
  const captured = baseCaptured({
    state: { status: "blocked" },
    fileTree: ["anything.md", "another/one.txt"],
  });

  const result = assertScenario(expect, captured);

  assert.equal(result.pass, true);
});

test("assertScenario: differing prose in state/envelope/gate never fails a scenario", () => {
  const expect = {
    route: "sdd-design",
    blocker_type: "design-mismatch",
    state: { status: "blocked" },
  };
  const capturedModelA = baseCaptured({
    state: {
      next_recommended: "sdd-design",
      status: "blocked",
      executive_summary: "El modelo A explica esto con sus propias palabras.",
    },
    envelope: {
      blocker_type: "design-mismatch",
      executive_summary: "Motivo narrado de forma distinta por el modelo A.",
    },
  });
  const capturedModelB = baseCaptured({
    state: {
      next_recommended: "sdd-design",
      status: "blocked",
      executive_summary: "Model B phrases the very same outcome differently.",
    },
    envelope: {
      blocker_type: "design-mismatch",
      executive_summary: "A completely different rationale wording from model B.",
    },
  });

  assert.equal(assertScenario(expect, capturedModelA).pass, true);
  assert.equal(assertScenario(expect, capturedModelB).pass, true);
});
