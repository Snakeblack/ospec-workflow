"use strict";

// Pure reducers and the verdict behind `ospec check` and `ospec run`
// (openspec/specs/idd/spec.md, REQ-idd-007, REQ-idd-014, REQ-idd-015).
// Evidence comes only from runs the CLI observed: checks-pass holds while
// every declared check passed on the current tree, repro-test or tdd-red-green
// hold once a run failed and a later run of the same command passed on another
// tree, the migration obligation holds while its test passed on the current
// tree, and the contract obligation while the diff touches a contract document
// and a test with every check passing. No filesystem access: idd-exec.js runs
// the commands, idd-store.js persists.

const { GATES, OBLIGATIONS, RUN_EVIDENCE, isIntentAmbiguous } = require("./idd-contract.js");
const { GATE_QUESTIONS, WORK_ORDER } = require("./idd-next.js");
const { IddRecordError } = require("./idd-record.js");

const EVIDENCE_BY_OBLIGATION = new Map(OBLIGATIONS.map((obligation) => [obligation.id, obligation.evidence]));
const PAIR_OBLIGATIONS = Object.freeze(["repro-test", "tdd-red-green"]);
const PAIR_MOMENT = Object.freeze({ "repro-test": "the fix", "tdd-red-green": "the code" });
const MIGRATION = "migration-compat-and-test";
const CONTRACT = "contract-spec-and-test";
// Obligations `ospec run` proves, and the run purpose it records for each.
const RUN_OBLIGATIONS = Object.freeze({
  "repro-test": "repro-test",
  "tdd-red-green": "tdd-red-green",
  [MIGRATION]: "migration-test",
});

function requireOpen(state) {
  if (state.status === "closed") throw new IddRecordError("change-closed", `change ${state.change} is closed`);
}

function nextEvidenceId(state) {
  return `ev-${state.evidence.length + 1}`;
}

/** Appends CLI-observed runs, numbered after the ones already recorded. */
function recordRuns(state, runs) {
  requireOpen(state);
  const next = structuredClone(state);
  next.runs = next.runs || [];
  const ids = [];
  for (const run of runs) {
    const id = `run-${next.runs.length + 1}`;
    next.runs.push({ id, ...run });
    ids.push(id);
  }
  return { state: next, ids };
}

/**
 * checks-pass is satisfied by this check exactly when every run in `runIds`
 * passed on `tree`, the tree current when the checks finished; otherwise it
 * returns to pending, because older evidence proved an older tree.
 */
function settleChecks(state, { tree, runIds, recordedAt }) {
  requireOpen(state);
  const next = structuredClone(state);
  const target = next.obligations.find((entry) => entry.id === "checks-pass");
  if (!target || target.status === "withdrawn") return { state: next, evidence: null };
  const runs = (next.runs || []).filter((run) => runIds.includes(run.id));
  const passed = runIds.length > 0 && runs.length === runIds.length && runs.every((run) => run.exit_code === 0 && run.tree === tree);
  if (!passed) {
    target.status = "pending";
    target.evidence = [];
    return { state: next, evidence: null };
  }
  const id = nextEvidenceId(next);
  next.evidence.push({
    id,
    kind: "check-run",
    obligation: "checks-pass",
    recorded_at: recordedAt,
    detail: { tree, runs: [...runIds] },
  });
  target.status = "satisfied";
  target.evidence = [id];
  return { state: next, evidence: id };
}

function samePairKey(left, right) {
  return left.purpose === right.purpose && left.command === right.command && (left.unit ?? null) === (right.unit ?? null);
}

/**
 * After a run of a pair obligation: a passing run closes the pair with the
 * latest earlier failing run of the same command (and unit) on another tree.
 */
function settlePair(state, { obligation: obligationId, runId, recordedAt }) {
  requireOpen(state);
  const kind = EVIDENCE_BY_OBLIGATION.get(obligationId);
  const runs = state.runs || [];
  const greenIndex = runs.findIndex((run) => run.id === runId);
  const green = runs[greenIndex];
  if (!green || RUN_EVIDENCE[kind] !== green.purpose || green.exit_code !== 0) return { state, evidence: null };
  const red = runs
    .slice(0, greenIndex)
    .reverse()
    .find((run) => samePairKey(run, green) && run.exit_code !== 0 && run.tree !== green.tree);
  if (!red) return { state, evidence: null };

  const next = structuredClone(state);
  const target = next.obligations.find((entry) => entry.id === obligationId);
  if (!target || target.status === "withdrawn") return { state, evidence: null };
  const id = nextEvidenceId(next);
  next.evidence.push({ id, kind, obligation: obligationId, recorded_at: recordedAt, detail: { red: red.id, green: green.id } });
  target.status = "satisfied";
  target.evidence = [...target.evidence, id];
  return { state: next, evidence: id };
}

function activeObligation(state, id) {
  const target = state.obligations.find((entry) => entry.id === id);
  return target && target.status !== "withdrawn" ? target : null;
}

function reopen(target) {
  target.status = "pending";
  target.evidence = [];
}

/**
 * After a migration test run: a passing run with the declared compatibility or
 * rollback plan satisfies the obligation on its tree; a failing run reopens it.
 */
function settleMigration(state, { runId, plan, recordedAt }) {
  requireOpen(state);
  const next = structuredClone(state);
  const target = activeObligation(next, MIGRATION);
  const run = (next.runs || []).find((entry) => entry.id === runId);
  if (!target || !run) return { state: next, evidence: null };
  if (run.exit_code !== 0) {
    reopen(target);
    return { state: next, evidence: null };
  }
  const id = nextEvidenceId(next);
  next.evidence.push({ id, kind: "migration-test", obligation: MIGRATION, recorded_at: recordedAt, detail: { run: run.id, tree: run.tree, plan } });
  target.status = "satisfied";
  target.evidence = [id];
  return { state: next, evidence: id };
}

/** Tree-bound evidence proves only the tree it ran on: a newer tree reopens it. */
function settleTreeBound(state, { tree }) {
  const next = structuredClone(state);
  const target = activeObligation(next, MIGRATION);
  if (target?.status === "satisfied") {
    const current = next.evidence.find((entry) => entry.id === target.evidence.at(-1));
    if (current?.detail?.tree !== tree) reopen(target);
  }
  return next;
}

/**
 * During a check: the contract obligation holds when the diff touches a
 * contract document and a test and every check passed on this tree.
 */
function settleContract(state, { tree, checkEvidence, documents, tests, recordedAt }) {
  requireOpen(state);
  const next = structuredClone(state);
  const target = activeObligation(next, CONTRACT);
  if (!target) return { state: next, evidence: null, reason: null };
  let reason = null;
  if (!checkEvidence) reason = "every check must pass on the current tree first";
  else if (documents.length === 0) reason = "the diff touches no contract document (contracts.documents in idd/config.yaml)";
  else if (tests.length === 0) reason = "the diff touches no test of the contract (contracts.tests in idd/config.yaml)";
  if (reason) {
    reopen(target);
    return { state: next, evidence: null, reason };
  }
  const id = nextEvidenceId(next);
  next.evidence.push({
    id,
    kind: CONTRACT,
    obligation: CONTRACT,
    recorded_at: recordedAt,
    detail: { tree, check: checkEvidence, documents: [...documents], tests: [...tests] },
  });
  target.status = "satisfied";
  target.evidence = [id];
  return { state: next, evidence: id, reason: null };
}

function pairReason(state, obligationId) {
  const runs = (state.runs || []).filter((run) => run.purpose === obligationId);
  const moment = PAIR_MOMENT[obligationId];
  if (!runs.some((run) => run.exit_code !== 0)) {
    return `no failing run recorded: run the test with ospec run --obligation ${obligationId} before ${moment}`;
  }
  return `a failing run is recorded: run the same command again after ${moment}`;
}

function checksReason({ checks, results, treeChanged }) {
  if (!checks || checks.length === 0) return "no checks declared in idd/config.yaml (checks:)";
  if (treeChanged) return "the tree changed while the checks ran: run ospec check again";
  const failed = (results || []).find((result) => result.exit_code !== 0);
  if (failed) return `check ${failed.name} failed with exit code ${failed.exit_code}`;
  return "no passing run of every check on the current tree: run ospec check";
}

/**
 * The answer of `ospec check`: `missing` while an obligation is pending,
 * `needs-decision` while a gate is open, else `ready` to close.
 */
const DEFAULT_REASONS = Object.freeze({
  [MIGRATION]: `no passing migration test on the current tree: run it with ospec run --obligation ${MIGRATION} --plan <compatibility or rollback>`,
  [CONTRACT]: "needs a contract document and a test in the diff, with every check passing: run ospec check",
});

function checkVerdict(state, { checks = [], results = [], treeChanged = false, reasons = {} } = {}) {
  const openGates = state.gates
    .filter((gate) => gate.status === "open")
    .sort((left, right) => GATES.indexOf(left.id) - GATES.indexOf(right.id));
  const decisionFor = (gate) => ({ gate: gate.id, question: GATE_QUESTIONS[gate.id], ...(gate.reason ? { reason: gate.reason } : {}) });
  if (isIntentAmbiguous(state)) {
    return { verdict: "needs-decision", missing: [], decision: { ...decisionFor({ id: "ambiguous-intent" }), reason: state.intent.request } };
  }
  const missing = state.obligations
    .filter((entry) => entry.status === "pending")
    .sort((left, right) => WORK_ORDER.indexOf(left.id) - WORK_ORDER.indexOf(right.id))
    .map((entry) => {
      const evidence = EVIDENCE_BY_OBLIGATION.get(entry.id);
      let reason = reasons[entry.id] || DEFAULT_REASONS[entry.id] || `needs ${evidence} evidence`;
      if (entry.id === "checks-pass") reason = checksReason({ checks, results, treeChanged });
      else if (PAIR_OBLIGATIONS.includes(entry.id)) reason = pairReason(state, entry.id);
      return { obligation: entry.id, evidence, reason };
    });
  const decision = openGates.length > 0 ? decisionFor(openGates[0]) : null;
  const verdict = missing.length > 0 ? "missing" : decision ? "needs-decision" : "ready";
  return { verdict, missing, decision };
}

module.exports = {
  PAIR_OBLIGATIONS,
  RUN_OBLIGATIONS,
  checkVerdict,
  recordRuns,
  settleChecks,
  settleContract,
  settleMigration,
  settlePair,
  settleTreeBound,
};
