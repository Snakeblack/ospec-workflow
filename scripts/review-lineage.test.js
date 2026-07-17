"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  stableSerialize,
  startReviewLineage,
  beginLens,
  recordLensResult,
  freezeFindings,
  beginCorrection,
  recordCorrection,
  applyTargetedValidation,
  markOperationUnknown,
  reconcilePendingOperation,
  validateLineageForGate,
  createSuccessor,
  nextLineageAction,
  terminateLineage,
} = require("./lib/review-lineage.js");

const candidate = (lines = 9, paths = ["scripts/a.js", "skills/a/SKILL.md"]) => ({
  projection: "workspace",
  base_tree: "base-1",
  candidate_tree: `tree-${lines}`,
  paths,
  diff_hash: `sha256:${"a".repeat(64)}`,
  paths_digest: `sha256:${"b".repeat(64)}`,
  authored_lines: lines,
  original_changed_lines: lines,
});

const genesis = (lines = 9) => ({
  candidate: candidate(lines),
  classification: "normal",
  selected_dimensions: ["reliability", "risk"],
  evidence_fingerprint: `sha256:${"c".repeat(64)}`,
});

const correctedCandidate = (tree = "corrected-tree") => ({
  ...candidate(9),
  candidate_tree: tree,
  diff_hash: `sha256:${"d".repeat(64)}`,
});

function reviewedLineage() {
  let state = startReviewLineage(genesis());
  for (const dimension of ["risk", "reliability"]) {
    state = beginLens(state, { dimension, expected_revision: state.revision, request_id: `start-${dimension}` });
    state = recordLensResult(state, {
      dimension,
      expected_revision: state.revision,
      request_id: `result-${dimension}`,
      result: dimension === "risk" ? {
        findings: [{ severity: "CRITICAL", summary: "unsafe boundary", acceptance_criteria: "reject unsafe input" }],
      } : { findings: [] },
    });
  }
  return freezeFindings(state, { expected_revision: state.revision, request_id: "freeze" });
}

test("start freezes canonical genesis, stable identity, and is idempotent", () => {
  const first = startReviewLineage(genesis());
  const reordered = startReviewLineage({
    evidence_fingerprint: genesis().evidence_fingerprint,
    selected_dimensions: ["risk", "reliability"],
    classification: "normal",
    candidate: { ...candidate(), paths: ["skills/a/SKILL.md", "scripts\\a.js"] },
  }, first);
  assert.equal(reordered.lineage_id, first.lineage_id);
  assert.equal(reordered.revision, 0);
  assert.deepEqual(first.genesis.paths, ["scripts/a.js", "skills/a/SKILL.md"]);
  assert.equal(stableSerialize({ z: 1, a: 2 }), '{"a":2,"z":1}');
  assert.throws(() => startReviewLineage({ ...genesis(), candidate: { ...candidate(), paths: ["../escape"] } }), /path/i);
});

test("budget is fixed as min(200, ceil(original lines / 2)) and invalid counts fail", () => {
  for (const [lines, expected] of [[0, 0], [1, 1], [9, 5], [399, 200], [900, 200]]) {
    assert.equal(startReviewLineage(genesis(lines)).correction_budget.limit_lines, expected);
  }
  for (const lines of [-1, 1.5, Number.NaN]) {
    assert.throws(() => startReviewLineage(genesis(lines)), /changed_lines/i);
  }
  assert.throws(() => startReviewLineage({ ...genesis(), candidate: { paths: [] } }), /candidate/i);
});

test("each selected lens executes once and frozen findings have stable owner-bound IDs", () => {
  const frozen = reviewedLineage();
  assert.equal(frozen.status, "correction-required");
  assert.equal(frozen.findings.length, 1);
  assert.equal(frozen.findings[0].owner, "risk");
  assert.match(frozen.findings[0].id, /^F-[0-9a-f]{16}$/);
  assert.throws(() => beginLens(frozen, { dimension: "risk", expected_revision: frozen.revision, request_id: "again" }), /status|completed|once/i);
  assert.throws(() => beginLens(frozen, { dimension: "readability", expected_revision: frozen.revision, request_id: "new" }), /selected/i);
});

test("selected lenses can be persisted independently before parallel dispatch", () => {
  let state = startReviewLineage(genesis());
  assert.deepEqual(nextLineageAction(state), { type: "run-lenses", dimensions: ["risk", "reliability"] });
  state = beginLens(state, { dimension: "risk", expected_revision: state.revision, request_id: "risk-start" });
  assert.deepEqual(nextLineageAction(state), { type: "run-lenses", dimensions: ["reliability"] });
  state = beginLens(state, { dimension: "reliability", expected_revision: state.revision, request_id: "reliability-start" });
  assert.deepEqual(nextLineageAction(state), { type: "await-lenses", dimensions: ["risk", "reliability"] });
  state = markOperationUnknown(state, { expected_revision: state.revision, request_id: "risk-start" });
  assert.equal(state.status, "reconciliation-required");
  assert.equal(state.lenses.reliability.status, "running");
});

test("exact retries are idempotent while stale or divergent operations fail closed", () => {
  let state = startReviewLineage(genesis());
  state = beginLens(state, { dimension: "risk", expected_revision: state.revision, request_id: "risk-start" });
  const retriedStart = beginLens(state, { dimension: "risk", expected_revision: state.revision, request_id: "risk-start" });
  assert.deepEqual(retriedStart, state);
  assert.throws(() => beginLens(state, { dimension: "risk", expected_revision: state.revision - 1, request_id: "risk-other" }), /stale|once/i);
  state = recordLensResult(state, { dimension: "risk", expected_revision: state.revision, request_id: "risk-result", result: { findings: [] } });
  assert.deepEqual(recordLensResult(state, { dimension: "risk", expected_revision: state.revision, request_id: "risk-result", result: { findings: [] } }), state);
  assert.throws(() => recordLensResult(state, { dimension: "risk", expected_revision: state.revision, request_id: "risk-result", result: { findings: [{ severity: "WARNING", summary: "different", acceptance_criteria: "stay unchanged" }] } }), /immutable/i);
});

test("correction is restricted to unresolved IDs, genesis paths, snapshot, and fixed line budget", () => {
  const frozen = reviewedLineage();
  const finding = frozen.findings[0].id;
  assert.throws(() => beginCorrection(frozen, { expected_revision: frozen.revision, request_id: "bad-id", finding_ids: ["F-missing"], paths: ["scripts/a.js"], base_candidate_id: frozen.current_candidate_id, forecast_lines: 1 }), /finding/i);
  assert.throws(() => beginCorrection(frozen, { expected_revision: frozen.revision, request_id: "escape", finding_ids: [finding], paths: ["outside.js"], base_candidate_id: frozen.current_candidate_id, forecast_lines: 1 }), /genesis/i);
  assert.throws(() => beginCorrection(frozen, { expected_revision: frozen.revision, request_id: "overflow", finding_ids: [finding], paths: ["scripts/a.js"], base_candidate_id: frozen.current_candidate_id, forecast_lines: 6 }), /budget/i);
  let state = beginCorrection(frozen, { expected_revision: frozen.revision, request_id: "fix-1", finding_ids: [finding], paths: ["scripts/a.js"], base_candidate_id: frozen.current_candidate_id, forecast_lines: 2 });
  assert.deepEqual(beginCorrection(state, { expected_revision: state.revision, request_id: "fix-1", finding_ids: [finding], paths: ["scripts/a.js"], base_candidate_id: frozen.current_candidate_id, forecast_lines: 2 }), state);
  assert.throws(() => beginCorrection(state, { expected_revision: state.revision, request_id: "fix-concurrent", finding_ids: [finding], paths: ["scripts/a.js"], base_candidate_id: frozen.current_candidate_id, forecast_lines: 1 }), /status|pending|correcting/i);
  assert.throws(() => beginCorrection(state, { expected_revision: state.revision - 1, request_id: "fix-1", finding_ids: [finding], paths: ["scripts/a.js"], base_candidate_id: frozen.current_candidate_id, forecast_lines: 2 }), /stale/i);
  assert.throws(() => recordCorrection(state, { expected_revision: state.revision, request_id: "record-bad", base_candidate_id: frozen.current_candidate_id, paths: ["scripts/a.js"], actual_changed_lines: 3, corrected_candidate: correctedCandidate() }), /forecast/i);
  assert.throws(() => recordCorrection(state, { expected_revision: state.revision, request_id: "record-expanded", base_candidate_id: frozen.current_candidate_id, paths: ["scripts/a.js"], actual_changed_lines: 2, corrected_candidate: { ...correctedCandidate(), paths: [...candidate().paths, "outside.js"] } }), /candidate|genesis/i);
  assert.throws(() => recordCorrection(state, { expected_revision: state.revision, request_id: "record-rebudget", base_candidate_id: frozen.current_candidate_id, paths: ["scripts/a.js"], actual_changed_lines: 2, corrected_candidate: { ...correctedCandidate(), original_changed_lines: 100 } }), /immutable|changed_lines/i);
  state = recordCorrection(state, { expected_revision: state.revision, request_id: "record-1", base_candidate_id: frozen.current_candidate_id, paths: ["scripts/a.js"], actual_changed_lines: 2, corrected_candidate: correctedCandidate() });
  assert.deepEqual(recordCorrection(state, { expected_revision: state.revision, request_id: "record-1", base_candidate_id: frozen.current_candidate_id, paths: ["scripts/a.js"], actual_changed_lines: 2, corrected_candidate: correctedCandidate() }), state);
  assert.equal(state.correction_budget.used_lines, 2);
  assert.equal(state.status, "validating");
});

test("three failed validations exhaust lineage even when correction delta is zero", () => {
  let state = reviewedLineage();
  const finding = state.findings[0].id;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    state = beginCorrection(state, { expected_revision: state.revision, request_id: `fix-${attempt}`, finding_ids: [finding], paths: ["scripts/a.js"], base_candidate_id: state.current_candidate_id, forecast_lines: 0 });
    state = recordCorrection(state, { expected_revision: state.revision, request_id: `record-${attempt}`, base_candidate_id: state.pending_correction.base_candidate_id, paths: ["scripts/a.js"], actual_changed_lines: 0, corrected_candidate: correctedCandidate(`tree-${attempt}`) });
    state = applyTargetedValidation(state, {
      expected_revision: state.revision,
      request_id: `validate-${attempt}`,
      outcomes: [{ id: finding, status: "unresolved" }],
      regression: { detected: false, evidence: ["node --test focused: pass"] },
      follow_ups: [],
    });
  }
  assert.equal(state.status, "exhausted");
  assert.equal(state.correction_budget.failed_attempts, 3);
  assert.equal(nextLineageAction(state).type, "stop");
  assert.throws(() => beginCorrection(state, { expected_revision: state.revision, request_id: "fourth", finding_ids: [finding], paths: ["scripts/a.js"], base_candidate_id: state.current_candidate_id, forecast_lines: 0 }), /terminal|status/i);
});

test("targeted validation cannot add blockers and late observations are append-only follow-ups", () => {
  let state = reviewedLineage();
  const finding = state.findings[0].id;
  state = beginCorrection(state, { expected_revision: state.revision, request_id: "fix", finding_ids: [finding], paths: ["scripts/a.js"], base_candidate_id: state.current_candidate_id, forecast_lines: 1 });
  state = recordCorrection(state, { expected_revision: state.revision, request_id: "record", base_candidate_id: state.pending_correction.base_candidate_id, paths: ["scripts/a.js"], actual_changed_lines: 1, corrected_candidate: correctedCandidate() });
  assert.throws(() => applyTargetedValidation(state, { expected_revision: state.revision, request_id: "extra", outcomes: [{ id: finding, status: "resolved" }, { id: "F-new", status: "unresolved" }], regression: { detected: false, evidence: ["pass"] }, follow_ups: [] }), /exact|frozen|outcome/i);
  const validation = {
    expected_revision: state.revision,
    request_id: "valid",
    outcomes: [{ id: finding, status: "resolved" }],
    regression: { detected: false, evidence: ["node --test focused: pass"] },
    follow_ups: [{ owner: "reliability", summary: "Consider a separate cache hardening change" }],
  };
  state = applyTargetedValidation(state, validation);
  assert.equal(state.status, "approved");
  assert.equal(state.follow_ups.length, 1);
  assert.equal(state.findings.length, 1);
  assert.equal(state.findings[0].resolution, "resolved");
  assert.deepEqual(applyTargetedValidation(state, { ...validation, expected_revision: state.revision }), state);
  assert.throws(() => applyTargetedValidation(state, { ...validation, expected_revision: state.revision, follow_ups: [] }), /divergent|terminal/i);
});

test("unknown mutation outcome allows only exact reconciliation", () => {
  let state = startReviewLineage(genesis());
  state = beginLens(state, { dimension: "risk", expected_revision: state.revision, request_id: "risk-start" });
  const running = structuredClone(state);
  state = markOperationUnknown(state, { expected_revision: state.revision, request_id: "risk-start" });
  assert.equal(state.status, "reconciliation-required");
  assert.deepEqual(nextLineageAction(state), { type: "reconcile", request_id: "risk-start" });
  assert.throws(() => beginLens(state, { dimension: "reliability", expected_revision: state.revision, request_id: "other" }), /reconciliation/i);
  assert.equal(reconcilePendingOperation(state, { expected_revision: state.revision, request_id: "risk-start", outcome: "unknown" }).status, "reconciliation-required");
  assert.throws(() => reconcilePendingOperation(state, { expected_revision: state.revision, request_id: "risk-start", outcome: "committed", committed_state: { ...startReviewLineage(genesis()), revision: 99 } }), /exact|request/i);
  const committed = recordLensResult(running, { dimension: "risk", expected_revision: running.revision, request_id: "risk-result", result: { findings: [] } });
  const reconciled = reconcilePendingOperation(state, { expected_revision: state.revision, request_id: "risk-start", outcome: "committed", committed_state: committed });
  assert.equal(reconciled.lenses.risk.status, "completed");
  state = reconcilePendingOperation(state, { expected_revision: state.revision, request_id: "risk-start", outcome: "not_started" });
  assert.equal(state.status, "reviewing");
  assert.equal(state.lenses.risk.status, "pending");
});

test("downstream gate validation is read-only and explicit successor never resets predecessor", () => {
  let approved = startReviewLineage({ ...genesis(), selected_dimensions: [] });
  approved = freezeFindings(approved, { expected_revision: approved.revision, request_id: "freeze-empty" });
  const before = structuredClone(approved);
  assert.deepEqual(validateLineageForGate(approved, { candidate_id: approved.current_candidate_id, gate: "archive" }), { valid: true, code: "lineage-approved" });
  assert.deepEqual(approved, before);
  assert.deepEqual(validateLineageForGate(approved, { candidate_id: "sha256:drift", gate: "verify" }), { valid: false, code: "candidate-drift" });
  const approvals = [{ id: "architecture-bounded-review-001", applies_to: ["sdd-verify"] }];
  const successor = createSuccessor(approved, {
    candidate: candidate(11),
    classification: "normal",
    selected_dimensions: ["risk"],
    evidence_fingerprint: `sha256:${"d".repeat(64)}`,
    reason: "approved late follow-up",
    approval_reference: "architecture-bounded-review-001",
    approvals,
  });
  assert.notEqual(successor.lineage_id, approved.lineage_id);
  assert.equal(successor.predecessor_lineage_id, approved.lineage_id);
  assert.equal(successor.generation, approved.generation + 1);
  assert.equal(approved.status, "approved");
  assert.throws(() => createSuccessor(startReviewLineage(genesis()), { ...genesis(), reason: "implicit", approval_reference: "x", approvals }), /terminal/i);
});

test("explicit invalidation and escalation are terminal and cannot reset authority", () => {
  for (const status of ["invalidated", "escalated"]) {
    const initial = startReviewLineage(genesis());
    const terminal = terminateLineage(initial, { expected_revision: initial.revision, request_id: `stop-${status}`, status, reason: `explicit ${status}` });
    assert.equal(terminal.status, status);
    assert.equal(nextLineageAction(terminal).type, "stop");
    assert.throws(() => beginLens(terminal, { dimension: "risk", expected_revision: terminal.revision, request_id: "rerun" }), /terminal/i);
  }
});

test("assertLineage rejects modified or incomplete lineage structures and forged lineage IDs", () => {
  const state = reviewedLineage();
  // Test missing/wrong schema version
  const badSchema = { ...state, schema_version: 2 };
  assert.throws(() => validateLineageForGate(badSchema, { candidate_id: state.current_candidate_id, gate: "archive" }), /schema_version/i);
  
  // Test incorrect/manipulated findings_digest
  const badDigest = { ...state, findings_digest: "sha256:forged" };
  assert.throws(() => validateLineageForGate(badDigest, { candidate_id: state.current_candidate_id, gate: "archive" }), /findings_digest|mismatch/i);
  
  // Test forged lineage ID (doesn't match genesis/generation hash)
  const forgedLineageId = { ...state, lineage_id: "sha256:forged_id" };
  assert.throws(() => validateLineageForGate(forgedLineageId, { candidate_id: state.current_candidate_id, gate: "archive" }), /lineage_id/i);
});

test("reconcilePendingOperation validates committed state invariants deeply", () => {
  let state = startReviewLineage(genesis());
  state = beginLens(state, { dimension: "risk", expected_revision: state.revision, request_id: "risk-start" });
  const running = structuredClone(state);
  state = markOperationUnknown(state, { expected_revision: state.revision, request_id: "risk-start" });
  
  // Try to reconcile with a forged committed state where the genesis is manipulated (paths changed but candidate_id matches lineage_id)
  const forgedCommitted = recordLensResult(running, { dimension: "risk", expected_revision: running.revision, request_id: "risk-result", result: { findings: [] } });
  const manipulatedCommitted = { ...forgedCommitted };
  manipulatedCommitted.genesis = {
    ...manipulatedCommitted.genesis,
    candidate: { ...manipulatedCommitted.genesis.candidate, paths: ["scripts/forged.js"] }
  };
  
  assert.throws(() => reconcilePendingOperation(state, { expected_revision: state.revision, request_id: "risk-start", outcome: "committed", committed_state: manipulatedCommitted }), /genesis|mismatch/i);
});

test("createSuccessor requires structured format, resolution, scope, and reuse check on approval_reference", () => {
  let approved = startReviewLineage({ ...genesis(), selected_dimensions: [] });
  approved = freezeFindings(approved, { expected_revision: approved.revision, request_id: "freeze-empty" });
  
  const approvals = [{ id: "architecture-bounded-review-001", applies_to: ["sdd-verify"] }];
  approved.approvals = approvals;
  
  // Rejects arbitrary non-empty string
  assert.throws(() => createSuccessor(approved, { ...genesis(), reason: "test", approval_reference: "arbitrary-string", approvals }), /format|approval_reference/i);
  
  // Rejects non-persisted reference
  assert.throws(() => createSuccessor(approved, { ...genesis(), reason: "test", approval_reference: "architecture-bounded-review-999", approvals }), /resolve/i);
  
  // Rejects out of scope reference (e.g. applies_to has no SDD phases)
  const outOfScopeApprovals = [{ id: "architecture-bounded-review-002", applies_to: ["some-other-phase"] }];
  assert.throws(() => createSuccessor(approved, { ...genesis(), reason: "test", approval_reference: "architecture-bounded-review-002", approvals: outOfScopeApprovals }), /scope/i);
  
  // Rejects reuse of the same predecessor reference
  const predecessorWithRecovery = {
    ...approved,
    recovery: { reason: "prior", approval_reference: "architecture-bounded-review-001" }
  };
  assert.throws(() => createSuccessor(predecessorWithRecovery, { ...genesis(), reason: "test", approval_reference: "architecture-bounded-review-001", approvals }), /already been used/i);
  
  // Accepts valid reference
  const successor = createSuccessor(approved, {
    candidate: candidate(11),
    classification: "normal",
    selected_dimensions: ["risk"],
    evidence_fingerprint: `sha256:${"d".repeat(64)}`,
    reason: "approved late follow-up",
    approval_reference: "architecture-bounded-review-001",
    approvals,
  });
  assert.equal(successor.recovery.approval_reference, "architecture-bounded-review-001");
});

test("applyTargetedValidation does not produce a dead state with zero unresolved IDs when regression is detected", () => {
  let state = reviewedLineage();
  const finding = state.findings[0].id;
  state = beginCorrection(state, { expected_revision: state.revision, request_id: "fix", finding_ids: [finding], paths: ["scripts/a.js"], base_candidate_id: state.current_candidate_id, forecast_lines: 1 });
  state = recordCorrection(state, { expected_revision: state.revision, request_id: "record", base_candidate_id: state.pending_correction.base_candidate_id, paths: ["scripts/a.js"], actual_changed_lines: 1, corrected_candidate: correctedCandidate() });
  
  // Regression is detected but finding outcome is marked resolved
  state = applyTargetedValidation(state, {
    expected_revision: state.revision,
    request_id: "validate",
    outcomes: [{ id: finding, status: "resolved" }],
    regression: { detected: true, evidence: ["regression found"] },
    follow_ups: [],
  });
  
  // Lineage should not be in approved state, it must remain correction-required
  assert.equal(state.status, "correction-required");
  // nextLineageAction must return the finding to correct again (not empty)
  const action = nextLineageAction(state);
  assert.equal(action.type, "correct");
  assert.deepEqual(action.finding_ids, [finding]);
});
