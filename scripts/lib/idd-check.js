"use strict";

// Pure reducers and the verdict behind `ospec check` and `ospec run`
// (openspec/specs/idd/spec.md, REQ-idd-007, REQ-idd-014, REQ-idd-015).
// Evidence comes only from runs the CLI observed: checks-pass holds while
// every declared check passed on the current tree, repro-test or tdd-red-green
// hold once a run failed and a later run of the same command passed on another
// tree, and its counterproof failed on the change's base with the tests of the
// diff (E1.48), the migration obligation holds while its test passed on the
// current tree, and the contract obligation while the diff touches a contract
// document and a test with every check passing. No filesystem access:
// idd-exec.js runs the commands, idd-store.js persists.

const { DECISIONS_ROOT, GATED_IMPACTS, GATES, OBLIGATIONS, RECORDED_IMPACTS, RUN_EVIDENCE, counterproofDetected, isIntentAmbiguous } = require("./idd-contract.js");
const { GATE_QUESTIONS, WORK_ORDER } = require("./idd-next.js");
const { configureChecksStep } = require("./idd-checks-config.js");
const { fitnessReason } = require("./idd-fitness.js");
const { IddRecordError } = require("./idd-record.js");
const { trustReason } = require("./idd-review.js");

const EVIDENCE_BY_OBLIGATION = new Map(OBLIGATIONS.map((obligation) => [obligation.id, obligation.evidence]));
const PAIR_OBLIGATIONS = Object.freeze(["repro-test", "tdd-red-green"]);
const PAIR_MOMENT = Object.freeze({ "repro-test": "the fix", "tdd-red-green": "the code" });
const MIGRATION = "migration-compat-and-test";
const CONTRACT = "contract-spec-and-test";
const COUNTERPROOF = "counterproof";
const IMPACT = "adr-impact-declaration";
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
  const passed =
    runIds.length > 0 &&
    runs.length === runIds.length &&
    runs.every((run) => run.exit_code === 0 && run.tree === tree && run.tests !== 0);
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

/**
 * boundary-tests holds once the diff adds a line to a test (`tests`, the test
 * paths with an added line) and a passing check on `tree` reports more than
 * zero tests, or no count. The suite that passed before the change is not
 * evidence (B3), nor is a deleted test; a recognized count of zero never is
 * (REQ-idd-014). The counterproof of the declared checks on the base with
 * those tests must hold as well (E1.48).
 */
function settleBoundary(state, { tree, runIds, recordedAt, tests = [], counterproof = null }) {
  requireOpen(state);
  const next = structuredClone(state);
  const target = next.obligations.find((entry) => entry.id === "boundary-tests");
  if (!target || target.status === "withdrawn") return { state: next, evidence: null, reason: null };
  const proof = tests.length > 0 && (next.runs || []).find(
    (run) => runIds.includes(run.id) && run.exit_code === 0 && run.tree === tree && (run.tests > 0 || run.tests == null),
  );
  if (!proof || !counterproofHolds(next, counterproof)) {
    target.status = "pending";
    target.evidence = [];
    let reason = null;
    const same = proof && counterproof?.runs?.length ? sameRed(next, counterproof.runs) : null;
    if (tests.length === 0) reason = `the diff adds no line to a test: write the test of the product code, then ospec check --change ${state.change}`;
    else if (same) {
      reason = `the checks fail the same way on the base without the tests the diff adds (${same}): the red does not come from them; make the checks run them, then ospec check --change ${state.change}`;
    } else if (proof && counterproof?.runs?.length) {
      reason = `the tests the diff adds pass against the base product too (counterproof ${counterproof.runs.join(", ")}): they do not detect the change; make them fail on the base, then ospec check --change ${state.change}`;
    }
    return { state: next, evidence: null, reason };
  }
  const id = nextEvidenceId(next);
  const detail = { tree, run: proof.id, tests: [...tests], ...counterproofDetail(counterproof) };
  next.evidence.push({
    id,
    kind: "tested-check",
    obligation: "boundary-tests",
    recorded_at: recordedAt,
    detail,
  });
  target.status = "satisfied";
  target.evidence = [id];
  return { state: next, evidence: id, reason: null };
}

const CHECKS_GATE = "checks-changed";

function describeChecks(checks) {
  return checks.length > 0 ? checks.map(({ name, command }) => `${name}: ${command}`).join("; ") : "no checks";
}

// A list as a set: its order and repeats decide nothing.
function canonicalSection(section) {
  return Object.fromEntries(
    Object.keys(section)
      .sort()
      .map((key) => [key, Array.isArray(section[key]) ? [...new Set(section[key])].sort() : section[key]]),
  );
}

/**
 * The settings of idd/config.yaml besides the checks that decide the derived
 * obligations (E1.53): strict_tdd as the team profile leaves it, and the
 * impact and contracts sections.
 */
function ceremonyConfig({ strictTdd = false, impact = {}, contracts = {} } = {}) {
  return { strict_tdd: strictTdd, impact: canonicalSection(impact), contracts: canonicalSection(contracts) };
}

const NO_CEREMONY = Object.freeze(ceremonyConfig());

function describeSection(section) {
  const entries = Object.entries(section).map(([key, value]) => `${key} ${Array.isArray(value) ? `[${value.join(", ")}]` : value}`);
  return entries.length > 0 ? entries.join(", ") : "nothing";
}

function describeChange({ baseChecks, checks, baseConfig, config }) {
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const parts = [];
  if (!same(checks, baseChecks)) parts.push(`idd/config.yaml declares ${describeChecks(checks)}, and the base declares ${describeChecks(baseChecks)}`);
  if (config.strict_tdd !== baseConfig.strict_tdd) parts.push(`strict_tdd is ${config.strict_tdd}, and ${baseConfig.strict_tdd} at the base`);
  for (const key of ["impact", "contracts"]) {
    if (!same(config[key], baseConfig[key])) parts.push(`${key} declares ${describeSection(config[key])}, and the base declares ${describeSection(baseConfig[key])}`);
  }
  return parts.join("; ");
}

/**
 * During a check: checks or ceremony settings (ceremonyConfig) that differ
 * from the change's base need the user's answer (B7, E1.53). Each set gets its
 * own checks-changed entry with the checks and the settings it approves; an
 * entry recorded before E1.53 approves the base settings. Back to the base or
 * to an approved set, the entry nobody answered is dropped.
 */
function settleChecksChange(state, { baseChecks, checks, baseConfig = NO_CEREMONY, config = baseConfig }) {
  requireOpen(state);
  const next = structuredClone(state);
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const open = next.gates.find((gate) => gate.id === CHECKS_GATE && gate.status === "open");
  const approves = (gate) => gate.id === CHECKS_GATE && gate.status === "resolved" && same(gate.checks, checks) && same(gate.config ?? baseConfig, config);
  const approved = (same(checks, baseChecks) && same(config, baseConfig)) || next.gates.some(approves);
  if (approved) {
    if (open) next.gates = next.gates.filter((gate) => gate !== open);
    return next;
  }
  const reason = describeChange({ baseChecks, checks, baseConfig, config });
  const entry = { id: CHECKS_GATE, status: "open", reason, checks: structuredClone(checks), config: structuredClone(config) };
  if (open) Object.assign(open, entry);
  else next.gates.push(entry);
  return next;
}

function samePairKey(left, right) {
  return left.purpose === right.purpose && left.command === right.command && (left.unit ?? null) === (right.unit ?? null);
}

/**
 * The latest failing run a passing run of a pair would close: the same
 * purpose, command and unit, before it in `runs`, on another tree.
 */
function pairRed(runs, green) {
  const before = runs.includes(green) ? runs.slice(0, runs.indexOf(green)) : [...runs];
  return before.reverse().find((run) => samePairKey(run, green) && run.exit_code !== 0 && run.tree !== green.tree) || null;
}

function proofRuns(state, ids) {
  return (state.runs || []).filter((run) => run.purpose === COUNTERPROOF && (ids || []).includes(run.id));
}

// The counterproof of E1.48 proves a pair or boundary-tests when one of its
// runs failed on the base and its control, without the tests of the diff,
// passed or failed another way, or when it was skipped, which the evidence
// marks.
function counterproofHolds(state, proof) {
  if (proof?.skipped) return true;
  return counterproofDetected(proofRuns(state, proof?.runs));
}

// The runs of a counterproof that failed the same way as their control, as
// "counterproof <ids>, control <ids>", or null when none did.
function sameRed(state, ids) {
  const runs = proofRuns(state, ids);
  const failed = runs.filter((run) => !run.control && run.exit_code !== 0);
  const controls = runs.filter((run) => run.control && failed.some((entry) => entry.command === run.command));
  if (failed.length === 0 || controls.length === 0) return null;
  return `counterproof ${failed.map((run) => run.id).join(", ")}, control ${controls.map((run) => run.id).join(", ")}`;
}

function counterproofDetail(proof) {
  return proof.skipped ? { counterproof_skipped: proof.skipped } : { counterproof: [...proof.runs] };
}

/**
 * The counterproof run already recorded for `command` on the same base with
 * the same mount (E1.48): running it again would observe the same thing.
 */
function priorCounterproof(runs, { base, mount, command }) {
  return (runs || []).filter((run) => run.purpose === COUNTERPROOF && !run.control && run.base === base && run.mount === mount && run.command === command).at(-1) || null;
}

/**
 * The control already recorded for `command` on the same base (E1.48): the
 * base without the tests of the diff does not change while the tests do.
 */
function priorControl(runs, { base, command }) {
  return (runs || []).filter((run) => run.purpose === COUNTERPROOF && run.control === true && run.base === base && run.command === command).at(-1) || null;
}

/**
 * After a run of a pair obligation: a passing run closes the pair with the
 * latest earlier failing run of the same command (and unit) on another tree,
 * while the diff adds code to a test (`tests`) and the counterproof of the
 * green run holds (E1.48).
 */
function settlePair(state, { obligation: obligationId, runId, recordedAt, tests = [], counterproof = null }) {
  requireOpen(state);
  const kind = EVIDENCE_BY_OBLIGATION.get(obligationId);
  const runs = state.runs || [];
  const green = runs.find((run) => run.id === runId);
  if (!green || RUN_EVIDENCE[kind] !== green.purpose || green.exit_code !== 0) return { state, evidence: null };
  const red = pairRed(runs, green);
  if (!red || tests.length === 0 || !counterproofHolds(state, counterproof)) return { state, evidence: null };

  const next = structuredClone(state);
  const target = next.obligations.find((entry) => entry.id === obligationId);
  if (!target || target.status === "withdrawn") return { state, evidence: null };
  const id = nextEvidenceId(next);
  next.evidence.push({ id, kind, obligation: obligationId, recorded_at: recordedAt, detail: { red: red.id, green: green.id, ...counterproofDetail(counterproof) } });
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

// Why the declared impacts do not settle yet, or null (E3.1). `records` maps
// each new ADR path to what the CLI read: whether it exists, its lint errors,
// its id and the ADR ids it cites.
function impactReason(state, records) {
  const label = (entry) => (entry.kind === "adr" ? `ADR ${entry.id}` : `scenario ${entry.id}`);
  const gate = state.gates.find((entry) => entry.id === "adr-amend-or-contradict");
  for (const entry of state.impacts || []) {
    const flag = entry.kind === "adr" ? "--adr" : "--quality";
    if (entry.impact == null) {
      return `declare the impact on ${label(entry)}: ospec record impact --change ${state.change} ${flag} ${entry.id} --impact <none|conforms|amends|supersedes|contradicts> --reason <why>`;
    }
    if (GATED_IMPACTS.includes(entry.impact) && gate?.status !== "resolved") {
      return `${label(entry)} ${entry.impact}: the user answers adr-amend-or-contradict first`;
    }
    if (entry.kind !== "adr" || !RECORDED_IMPACTS.includes(entry.impact)) continue;
    if (!entry.record) {
      return `${label(entry)} ${entry.impact}: write the new ADR under ${DECISIONS_ROOT}/ and attach it with ospec record impact --change ${state.change} --adr ${entry.id} --record <path>`;
    }
    const read = records[entry.record] || { exists: false };
    if (!read.exists) return `${entry.record} does not exist`;
    if (read.errors.length > 0) return `${entry.record} fails the decision-record lint: ${read.errors[0]}`;
    if (read.id === entry.id) return `${entry.record} rewrites ${label(entry)}: an accepted ADR is never rewritten, write a new one`;
    if (!read.cites.includes(entry.id)) return `${entry.record} must cite the ${label(entry)} it ${entry.impact === "amends" ? "amends" : "supersedes"}`;
  }
  return null;
}

// Why this check's fitness runs do not hold on `tree`, or null (E3.3).
function fitnessRunsReason(runs, tree) {
  const failed = fitnessReason(runs);
  if (failed) return failed;
  if (runs.some((run) => run.tree !== tree)) return "the tree changed while the fitness checks ran: run ospec check again";
  return null;
}

/**
 * During a check: the impact declaration holds when every declared reference
 * has its impact, the user answered any amendment, supersession or
 * contradiction, each ADR amended or superseded has a new ADR that exists,
 * passes the decision-record lint and cites it (E3.1, REQ-idd-005), and every
 * fitness run of this check passed on `fitness.tree` (E3.3, REQ-idd-022).
 */
function settleImpacts(state, { records = {}, fitness = null, recordedAt }) {
  requireOpen(state);
  const next = structuredClone(state);
  const target = activeObligation(next, IMPACT);
  if (!target) return { state: next, evidence: null, reason: null };
  const runIds = fitness?.runIds || [];
  const runs = (next.runs || []).filter((run) => runIds.includes(run.id));
  const reason =
    (next.impacts || []).length === 0
      ? "declare the ADRs or quality scenarios the change touches with ospec signals --adr <id> or --quality <id>"
      : fitnessRunsReason(runs, fitness?.tree) || impactReason(next, records);
  if (reason) {
    reopen(target);
    return { state: next, evidence: null, reason };
  }
  const refs = next.impacts.map((entry) => `${entry.kind}:${entry.id} ${entry.impact}`);
  const recorded = next.impacts.filter((entry) => entry.record).map((entry) => entry.record);
  const detail = { refs, records: recorded, ...(runIds.length > 0 ? { tree: fitness.tree, fitness: [...runIds] } : {}) };
  const current = next.evidence.find((entry) => entry.id === target.evidence.at(-1));
  if (target.status === "satisfied" && JSON.stringify(current?.detail) === JSON.stringify(detail)) {
    return { state: next, evidence: current.id, reason: null };
  }
  const id = nextEvidenceId(next);
  next.evidence.push({ id, kind: IMPACT, obligation: IMPACT, recorded_at: recordedAt, detail });
  target.status = "satisfied";
  target.evidence = [id];
  return { state: next, evidence: id, reason: null };
}

/**
 * During a run that counts as the check (E4.15): the fitness checks run only
 * in `ospec check`, so the impact declaration keeps evidence of this tree and
 * otherwise waits for a check.
 */
function deferImpacts(state, { tree }) {
  requireOpen(state);
  const next = structuredClone(state);
  const target = activeObligation(next, IMPACT);
  if (!target) return { state: next, reason: null };
  const current = next.evidence.find((entry) => entry.id === target.evidence.at(-1));
  if (target.status === "satisfied" && current?.detail?.tree === tree) return { state: next, reason: null };
  reopen(target);
  return { state: next, reason: `its fitness checks run only in ospec check: ospec check --change ${state.change}` };
}

// Why a pair is still pending. A passing run that had its failing run and
// recorded no pair was refused by E1.48: its counterproof passed on the base
// or failed the same way as its control, or, without one, the diff added no
// line to a test.
function pairReason(state, obligationId) {
  const all = state.runs || [];
  const runs = all.filter((run) => run.purpose === obligationId);
  const moment = PAIR_MOMENT[obligationId];
  if (!runs.some((run) => run.exit_code !== 0)) {
    return `no failing run recorded: run the test with ospec run --obligation ${obligationId} before ${moment}`;
  }
  const refused = runs.filter((run) => run.exit_code === 0 && pairRed(all, run)).at(-1);
  const same = refused?.counterproof?.length ? sameRed(state, refused.counterproof) : null;
  if (same) {
    return `the test fails the same way on the base without the tests of the diff (${same}): the red does not come from them; make the command run the test the diff adds, then run the same command again`;
  }
  if (refused?.counterproof?.length) {
    return `the test passes against the base product too (counterproof ${refused.counterproof.join(", ")}): it does not detect the change; make it fail on the base, then run the same command again`;
  }
  if (refused) {
    return "the diff adds no line to a test: the counterproof runs the tests of the diff against the base product; write the test in a test file, then run the same command again";
  }
  return `a failing run is recorded: run the same command again after ${moment}`;
}

/**
 * What close warns about the counterproofs behind the current evidence
 * (E1.48): one skipped, with its reason, and one that timed out on the base.
 */
function counterproofWarnings(state) {
  const warnings = [];
  const runs = new Map((state.runs || []).map((run) => [run.id, run]));
  for (const target of state.obligations.filter((entry) => entry.status === "satisfied")) {
    const entry = state.evidence.find((item) => item.id === target.evidence.at(-1));
    const detail = entry?.detail || {};
    if (detail.counterproof_skipped) warnings.push(`counterproof skipped for ${target.id} (${entry.id}): ${detail.counterproof_skipped}`);
    for (const id of detail.counterproof || []) {
      if (runs.get(id)?.timed_out && !runs.get(id).control) warnings.push(`counterproof ${id} of ${target.id} timed out on the base and counts as failing`);
    }
  }
  return warnings;
}

function checksReason({ checks, results, treeChanged, candidateCommand }) {
  if (!checks || checks.length === 0) return `no checks declared in idd/config.yaml (checks:); ${configureChecksStep(candidateCommand).how}`;
  if (treeChanged) return "the tree changed while the checks ran: run ospec check again";
  const failed = (results || []).find((result) => result.exit_code !== 0);
  if (failed) return `check ${failed.name} failed with exit code ${failed.exit_code}`;
  const empty = (results || []).find((result) => result.tests === 0);
  if (empty) return `check ${empty.name} executed 0 tests, which is not evidence: ospec check --change <id> after the suite runs at least one test`;
  return "no passing run of every check on the current tree: run ospec check";
}

/**
 * The answer of `ospec check`: `missing` while an obligation is pending,
 * `needs-decision` while a gate is open, else `ready` to close.
 */
const DEFAULT_REASONS = Object.freeze({
  [MIGRATION]: `no passing migration test on the current tree: run it with ospec run --obligation ${MIGRATION} --plan <compatibility or rollback>`,
  [CONTRACT]: "needs a contract document and a test in the diff, with every check passing: run ospec check",
  [IMPACT]: "needs the declared impact on every ADR or quality scenario the change touches: ospec record impact, then ospec check",
  "boundary-tests": "needs a test the diff adds and a passing check that reports tests greater than 0: ospec check --change <id> after the diff adds a test",
});

// living-doc is satisfied by ospec close itself (REQ-idd-004): a current
// change.md does not hold the verdict back, a stale one says what it lacks.
function checkVerdict(state, { checks = [], results = [], treeChanged = false, reasons = {}, livingDoc = null, candidateCommand } = {}) {
  const openGates = state.gates
    .filter((gate) => gate.status === "open")
    .sort((left, right) => GATES.indexOf(left.id) - GATES.indexOf(right.id));
  const decisionFor = (gate) => ({ gate: gate.id, question: GATE_QUESTIONS[gate.id], ...(gate.reason ? { reason: gate.reason } : {}) });
  if (isIntentAmbiguous(state)) {
    return { verdict: "needs-decision", missing: [], decision: { ...decisionFor({ id: "ambiguous-intent" }), reason: state.intent.request } };
  }
  const missing = state.obligations
    .filter((entry) => entry.status === "pending" && !(entry.id === "living-doc" && livingDoc?.ok))
    .sort((left, right) => WORK_ORDER.indexOf(left.id) - WORK_ORDER.indexOf(right.id))
    .map((entry) => {
      const evidence = EVIDENCE_BY_OBLIGATION.get(entry.id);
      let reason = reasons[entry.id] || DEFAULT_REASONS[entry.id] || `needs ${evidence} evidence`;
      if (entry.id === "checks-pass") reason = checksReason({ checks, results, treeChanged, candidateCommand });
      else if (PAIR_OBLIGATIONS.includes(entry.id)) reason = pairReason(state, entry.id);
      else if (entry.id === "trust-review") reason = trustReason(state);
      else if (entry.id === "living-doc") reason = `${livingDoc?.reason || "change.md was not read"}: ospec close records it once change.md is current`;
      return { obligation: entry.id, evidence, reason };
    });
  const decision = openGates.length > 0 ? decisionFor(openGates[0]) : null;
  const verdict = missing.length > 0 ? "missing" : decision ? "needs-decision" : "ready";
  return { verdict, missing, decision };
}

module.exports = {
  COUNTERPROOF,
  PAIR_OBLIGATIONS,
  RUN_OBLIGATIONS,
  ceremonyConfig,
  checkVerdict,
  counterproofWarnings,
  deferImpacts,
  pairRed,
  priorControl,
  priorCounterproof,
  recordRuns,
  settleBoundary,
  settleChecks,
  settleChecksChange,
  settleContract,
  settleImpacts,
  settleMigration,
  settlePair,
  settleTreeBound,
};
