"use strict";

// Deterministic executor for the Adaptive Repair pilot, slices P2a and P2b
// (docs/analysis/2026-10-02-adaptive-pilot-scoping.md). Each fixture carries a
// scripted worker output (`pilot.json`): base files, one patch, the obligations
// the executor declares, the allowed paths, the checks that observe behavior,
// and optional seeded-defect variants. Both arms consume the SAME scripted
// output, so the comparison isolates the mechanism: each arm compiles its own
// execution graph under its own PolicySnapshot, then every output runs through
// reproduction (acceptance checks must fail on the base), the real K4b pure
// stages (patch integration and K3 Candidate freeze), runtime observation of
// the checks against the candidate files, the K6b independent verifier, and the
// K12 obligations oracle.
//
// Seeded defects (P2b) are scripted variants that the pipeline must reject at a
// declared stage. A variant the pipeline accepts escaped; a variant rejected at
// another stage marks the fixture as misattributed. Both arms share every
// detection stage (the control routes run sdd-apply under TDD, so they also
// reproduce first), so detection parity is the expected result: it shows the
// Repair recipe compresses phases without dropping a detection stage.
//
// What this does NOT measure: worker isolation (K6a proves it; the scripted
// patch replaces the isolated worker) and model quality (no model runs). The
// phase plan per arm is declared, so phase counts are a recorded hypothesis,
// not an observation. Checks run in a node:vm context over the fixture's own
// in-memory files: repository-owned fixtures, not a sandbox for untrusted code.
// Only passing checks yield runtime evidence through the K6b test runner
// authority (collector `node-test`).
//
// Injected kernel faults (P2c) wrap the clean pipeline as the effect of the
// lifecycle `complete` operation, run through the public K2 harness. Each fault
// has one correct kernel behavior: an interruption at the pre-effect barrier
// resumes and runs the effect exactly once; an interruption mid-executor leaves
// an unknown outcome that must fail closed (`reconciliation-required`) without
// re-running the effect; a `complete` without an operation permit is blocked
// (`unauthorized`) and the authorized retry completes. A fault whose behavior
// differs escapes and fails the run.
//
// This is measurement tooling: it grants no authority, writes no store, and
// changes no route or default.

const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const { sha256Fingerprint } = require("../canonical-json.js");
const { computeTreeDigest } = require("../worker-workspace.js");
const { computeSourceSnapshotId } = require("../execution-identities/index.js");
const { compileExecutionGraph, createPolicySnapshot } = require("../execution-graph/index.js");
const { integrateWorkResultPatches } = require("../repair-shadow/index.js");
const { verifyCandidate } = require("../independent-verifier/index.js");
const { createTestRunnerReceiptChannel } = require("../test-support/k6b-runner-receipt.js");
const { interruptError } = require("../lifecycle-kernel/index.js");
const { runHarnessScenario } = require("../minimal-kernel-harness.js");
const { compareObligations } = require("./obligation-oracle.js");
const { PAIRED_ARMS } = require("./runner.js");

const PILOT_SCRIPT_FILE = "pilot.json";
const PILOT_SCRIPT_SCHEMA_VERSION = 2;
const PILOT_SCRIPT_KEYS = Object.freeze([
  "schema_version", "files", "patch", "allowed_paths", "obligations", "checks", "defects", "faults",
]);
const FAULT_KINDS = Object.freeze(["interrupt-pre-effect", "interrupt-mid-executor", "bypass-without-permit"]);
const LIFECYCLE_BUDGETS = Object.freeze({ attempts: 2, corrections: 1 });
const NODE_ID = "repair";
const EVIDENCE_ROLES = Object.freeze(["acceptance", "invariants", "contract", "negative"]);
const COLLECTOR = Object.freeze({ id: "node-test", transport: "tool-execution-transport" });
const CHECK_TIMEOUT_MS = 1000;
// The live route each pilot stratum takes under the fixed control policy. Other
// strata are outside the pilot and are recorded as excluded, never silently passed.
// Adversarial fixtures script a small repair under injected faults, so their
// control is the bugfix route too.
const FIXED_ROUTE_BY_STRATUM = Object.freeze({
  "local-reversible": "lite",
  "behavior-repair": "bugfix",
  adversarial: "bugfix",
});
// Repair recipe under test (roadmap K10: "Repair conserva reproducción y
// Candidate-bound verify"). It compresses phases only: it inherits every gate
// of the control route, so no composition drops a review the control requires.
const REPAIR_RECIPE_PHASES = Object.freeze(["reproduce", "repair", "verify"]);
// Seeded-defect kinds and the stage that must reject each one:
// - wrong-patch: applies but breaks a checked behavior, so a role loses its evidence;
// - complacent-test: a weakened acceptance check that already passes on the base;
// - scope-drift: the patch also touches a path outside the allowed paths;
// - stale-receipt: evidence observed on an earlier candidate, reused after the patch changed.
const DEFECT_STAGE_BY_KIND = Object.freeze({
  "wrong-patch": "verify",
  "complacent-test": "reproduction",
  "scope-drift": "integration",
  "stale-receipt": "verify",
});

class PilotExecutorError extends Error {
  constructor(message, code = "INVALID_PILOT_EXECUTOR") {
    super(message);
    this.name = "PilotExecutorError";
    this.code = code;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function hasOnlyKeys(value, keys) {
  return Object.keys(value).every((key) => keys.includes(key));
}

/**
 * Resolves both arms' phase plans per pilot stratum from the live routing table.
 * @param {object[]} routes Entries from route-dispatcher parseRoutingTable.
 * @returns {object} `{ [stratum]: { fixed: plan, "adaptive-repair-v1": plan } }`.
 * @throws {PilotExecutorError} When a control route is missing or malformed.
 */
function resolveArmPlans(routes) {
  if (!Array.isArray(routes)) throw new PilotExecutorError("routes must be the parsed routing table");
  const plans = {};
  for (const [stratum, routeName] of Object.entries(FIXED_ROUTE_BY_STRATUM)) {
    const route = routes.find((entry) => entry && entry.name === routeName);
    if (!route || !Array.isArray(route.phases) || route.phases.length === 0) {
      throw new PilotExecutorError(`routing table has no usable "${routeName}" route for stratum ${stratum}`, "CONTROL_ROUTE_MISSING");
    }
    const gates = Array.isArray(route.gates) ? [...route.gates] : [];
    plans[stratum] = Object.freeze({
      [PAIRED_ARMS[0]]: Object.freeze({ route: routeName, phases: Object.freeze([...route.phases]), gates: Object.freeze(gates) }),
      [PAIRED_ARMS[1]]: Object.freeze({ route: "repair-recipe", phases: REPAIR_RECIPE_PHASES, gates: Object.freeze([...gates]) }),
    });
  }
  return Object.freeze(plans);
}

function validateObligation(obligation, index) {
  return isPlainObject(obligation)
    && hasOnlyKeys(obligation, ["id", "criticality", "required_evidence"])
    && isNonEmptyString(obligation.id)
    && ["must", "should"].includes(obligation.criticality)
    && Array.isArray(obligation.required_evidence)
    && obligation.required_evidence.length > 0
    && obligation.required_evidence.every(isNonEmptyString)
    ? null
    : `pilot script obligation ${index} must have id, criticality must|should, and non-empty required_evidence`;
}

function isValidCheck(check) {
  return isPlainObject(check)
    && hasOnlyKeys(check, ["id", "role", "source"])
    && isNonEmptyString(check.id)
    && EVIDENCE_ROLES.includes(check.role)
    && isNonEmptyString(check.source);
}

function validateChecks(checks) {
  if (!Array.isArray(checks) || checks.length === 0) return ["pilot script checks must be a non-empty array"];
  const errors = [];
  checks.forEach((check, index) => {
    if (!isValidCheck(check)) {
      errors.push(`pilot script check ${index} must have id, role (${EVIDENCE_ROLES.join("|")}), and source`);
    }
  });
  if (errors.length > 0) return errors;
  if (new Set(checks.map((check) => check.id)).size !== checks.length) errors.push("pilot script check ids must be unique");
  if (!checks.some((check) => check.role === "acceptance")) {
    errors.push("pilot script needs at least one acceptance check to reproduce the defect on the base");
  }
  return errors;
}

function validateDefect(defect, index, checkIds) {
  const prefix = `pilot script defect ${index}`;
  if (!isPlainObject(defect) || !hasOnlyKeys(defect, ["id", "kind", "patch", "checks"])
    || !isNonEmptyString(defect.id) || !Object.hasOwn(DEFECT_STAGE_BY_KIND, defect.kind)
    || !isNonEmptyString(defect.patch)) {
    return `${prefix} must have id, kind (${Object.keys(DEFECT_STAGE_BY_KIND).join("|")}), and patch`;
  }
  if (defect.kind !== "complacent-test") {
    return defect.checks === undefined ? null : `${prefix} (${defect.id}) may carry checks only for complacent-test`;
  }
  if (!Array.isArray(defect.checks) || defect.checks.length === 0 || !defect.checks.every(isValidCheck)) {
    return `${prefix} (${defect.id}): complacent-test requires checks that weaken existing ones`;
  }
  return defect.checks.every((check) => checkIds.includes(check.id))
    ? null
    : `${prefix} (${defect.id}): complacent-test checks must override existing check ids`;
}

function validateDefects(defects, checks) {
  if (defects === undefined) return [];
  if (!Array.isArray(defects)) return ["pilot script defects must be an array"];
  const checkIds = Array.isArray(checks) ? checks.map((check) => check && check.id) : [];
  const errors = defects.map((defect, index) => validateDefect(defect, index, checkIds)).filter(Boolean);
  if (errors.length === 0 && new Set(defects.map((defect) => defect.id)).size !== defects.length) {
    errors.push("pilot script defect ids must be unique");
  }
  return errors;
}

/**
 * Loads and strictly validates a fixture's scripted worker output.
 * @param {string} taskPath Fixture task directory.
 * @returns {{ script: object|null, error: string|null }} `script: null, error: null` when absent.
 */
function loadPilotScript(taskPath) {
  const scriptPath = join(taskPath, PILOT_SCRIPT_FILE);
  if (!existsSync(scriptPath)) return { script: null, error: null };
  let script;
  try {
    script = JSON.parse(readFileSync(scriptPath, "utf8"));
  } catch (error) {
    return { script: null, error: `pilot script is not valid JSON: ${error.message}` };
  }
  const errors = [];
  if (!isPlainObject(script)) return { script: null, error: "pilot script must be an object" };
  const unknown = Object.keys(script).filter((key) => !PILOT_SCRIPT_KEYS.includes(key));
  if (unknown.length > 0) errors.push(`pilot script has unknown keys: ${unknown.join(", ")}`);
  if (script.schema_version !== PILOT_SCRIPT_SCHEMA_VERSION) {
    errors.push(`pilot script schema_version must be ${PILOT_SCRIPT_SCHEMA_VERSION}`);
  }
  if (!isPlainObject(script.files) || Object.keys(script.files).length === 0
    || !Object.values(script.files).every((content) => typeof content === "string")) {
    errors.push("pilot script files must map paths to string contents");
  }
  if (!isNonEmptyString(script.patch)) errors.push("pilot script patch must be a non-empty unified diff");
  if (!Array.isArray(script.allowed_paths) || script.allowed_paths.length === 0
    || !script.allowed_paths.every(isNonEmptyString)) {
    errors.push("pilot script allowed_paths must be a non-empty string array");
  }
  if (!Array.isArray(script.obligations) || script.obligations.length === 0) {
    errors.push("pilot script obligations must be a non-empty array");
  } else {
    script.obligations.forEach((obligation, index) => {
      const error = validateObligation(obligation, index);
      if (error) errors.push(error);
    });
  }
  errors.push(...validateChecks(script.checks), ...validateDefects(script.defects, script.checks));
  if (script.faults !== undefined && (!Array.isArray(script.faults) || script.faults.length === 0
    || !script.faults.every((fault) => FAULT_KINDS.includes(fault))
    || new Set(script.faults).size !== script.faults.length)) {
    errors.push(`pilot script faults must be unique entries of ${FAULT_KINDS.join("|")}`);
  }
  return errors.length > 0 ? { script: null, error: errors.join("; ") } : { script, error: null };
}

/**
 * Runs one check against in-memory files in a fresh vm context. Modules and the
 * check share the context, so values compare without cross-realm surprises.
 * @returns {boolean} Whether the check passed.
 */
function checkPasses(files, check) {
  const context = vm.createContext({ assert });
  const modules = new Map();
  const requireFile = (specifier) => {
    const path = String(specifier).replace(/^\.\//, "");
    if (!Object.hasOwn(files, path)) throw new Error(`module not found: ${specifier}`);
    if (!modules.has(path)) {
      const module = { exports: {} };
      modules.set(path, module);
      const factory = vm.runInContext(`(function (module, exports, require) {\n${files[path]}\n})`, context, {
        filename: path,
        timeout: CHECK_TIMEOUT_MS,
      });
      factory(module, module.exports, requireFile);
    }
    return modules.get(path).exports;
  };
  context.require = requireFile;
  try {
    vm.runInContext(check.source, context, { filename: `check:${check.id}`, timeout: CHECK_TIMEOUT_MS });
    return true;
  } catch {
    return false;
  }
}

function measurements(plan, effectsExecuted, wallMs, faults = { interruptions: 0, recoveries: 0 }) {
  return {
    phases_executed: plan ? plan.phases.length : 0,
    effects_executed: effectsExecuted,
    events_recorded: plan ? plan.phases.length + plan.gates.length : 0,
    wall_ms: wallMs,
    interruptions: faults.interruptions,
    recoveries: faults.recoveries,
  };
}

function oracleRecord(comparison, reasonWhenUnapplied) {
  if (!comparison) return { applied: false, reason: reasonWhenUnapplied };
  const missingMust = comparison.missing.filter((entry) => entry.criticality === "must").map((entry) => entry.id);
  return {
    applied: true,
    reason: `catalog compared: matched ${comparison.matched.length}/${comparison.expected_count}; `
      + (missingMust.length > 0 ? `missing must: ${missingMust.join(", ")}` : "no must obligation missing"),
  };
}

function buildArm(fixtureId, policy, script) {
  const files = { ...script.files };
  const sourceSnapshot = {
    schema_version: 1,
    kind: "source-snapshot/v1",
    repository_id: `k12-pilot:${fixtureId}`,
    base_tree_digest: computeTreeDigest(files),
    projection: "workspace",
    dependency_digests: [],
  };
  sourceSnapshot.source_snapshot_id = computeSourceSnapshotId(sourceSnapshot);
  const policySnapshot = createPolicySnapshot({ effectiveRules: [`k12-pilot/v1:policy=${policy}`] });
  const requiredEvidence = [...new Set(script.obligations.flatMap((obligation) => obligation.required_evidence))];
  const node = {
    node_id: NODE_ID,
    kind: "repair-action/v1",
    operation: "apply_repair_patch",
    objective: `Apply the scripted repair for ${fixtureId}`,
    dependencies: [],
    ownership: { owner: "agent:repair", mode: "exclusive" },
    allowed_paths: [...script.allowed_paths],
    invariants: [],
    required_evidence: requiredEvidence,
    budget_ref: "budget:default",
  };
  const obligations = script.obligations.map((obligation) => ({ ...obligation, implemented_by: [NODE_ID] }));
  const contractBody = {
    contract_id: `contract:k12-pilot:${fixtureId}`,
    family: "repair",
    source_snapshot_id: sourceSnapshot.source_snapshot_id,
    obligations,
  };
  const contract = {
    schema_version: 1,
    ...contractBody,
    version: 1,
    contract_digest: sha256Fingerprint("k12-pilot-contract/v1", contractBody),
  };
  const executionGraph = compileExecutionGraph({
    contract,
    policySnapshot,
    sourceSnapshot,
    nodes: [node],
    obligations,
  });
  const workOrderId = sha256Fingerprint("k12-pilot-work-order/v1", {
    graph_id: executionGraph.graph_id,
    node_id: NODE_ID,
  });
  return { files, sourceSnapshot, policySnapshot, node, contract, executionGraph, workOrderId };
}

/**
 * Observes the checks against one candidate's files. Only passing checks yield
 * runtime evidence and a runner receipt bound to that candidate.
 */
function observeChecks(arm, candidate, candidateFiles, checks) {
  const passed = checks.filter((check) => checkPasses(candidateFiles, check));
  const rawEvidence = passed.map((check) => ({
    bytes: `${check.role}:${check.id}: passed`,
    provenance: "runtime-observed",
    origin: `check:${check.id}`,
    node_id: NODE_ID,
    candidate_id: candidate.candidate_id,
  }));
  const runnerReceiptChannel = createTestRunnerReceiptChannel({
    candidate,
    executionGraph: arm.executionGraph,
    rawEvidence,
    receiptSpecs: passed.map((check) => ({
      role: check.role,
      node_id: NODE_ID,
      evidence_requirements_satisfied: arm.node.required_evidence,
    })),
    collector: COLLECTOR,
  });
  return { rawEvidence, runnerReceiptChannel };
}

/**
 * Evidence observed on an earlier candidate, replayed after the patch changed.
 * The worker strips the evidence's subject claim, so only the runner receipt
 * binding (which the worker cannot re-mint) can expose the replay.
 */
function replayStaleObservation(arm, earlier, checks) {
  const stale = observeChecks(arm, earlier.candidate, earlier.candidateFiles, checks);
  return {
    rawEvidence: stale.rawEvidence.map(({ candidate_id: _replayedSubject, ...raw }) => raw),
    runnerReceiptChannel: stale.runnerReceiptChannel,
  };
}

/**
 * Runs one worker output through reproduction, K4b integration, observation, and
 * K6b verify. `staleFrom` replays evidence observed on an earlier candidate.
 * @returns {Promise<{ stage: string|null, reason?: string, effects: number, candidate?: object, candidateFiles?: object }>}
 */
async function runPipeline(arm, output) {
  const reproducing = output.checks.filter((check) => check.role === "acceptance");
  const passingOnBase = reproducing.filter((check) => checkPasses(arm.files, check)).map((check) => check.id);
  if (passingOnBase.length > 0) {
    return { stage: "reproduction", reason: `acceptance-passes-on-base ${passingOnBase.join(", ")}`, effects: 0 };
  }

  const integrated = await integrateWorkResultPatches(arm.sourceSnapshot, [{
    work_order_id: arm.workOrderId,
    source_snapshot_id: arm.sourceSnapshot.source_snapshot_id,
    patch: output.patch,
    commands: [],
    logs: [],
    exit_code: 0,
    filesystem_inventory: [],
  }], { files: arm.files, workOrders: [{ work_order_id: arm.workOrderId, allowed_paths: arm.node.allowed_paths }] });
  if (!integrated.ok) return { stage: "integration", reason: integrated.reason_code || "failed", effects: 0 };

  const candidateFiles = Object.fromEntries(integrated.candidateFiles);
  const observation = output.staleFrom
    ? replayStaleObservation(arm, output.staleFrom, output.checks)
    : observeChecks(arm, integrated.candidate, candidateFiles, output.checks);
  const verified = verifyCandidate({
    candidate: integrated.candidate,
    executionGraph: arm.executionGraph,
    policySnapshot: arm.policySnapshot,
    contract: arm.contract,
    sourceSnapshot: arm.sourceSnapshot,
    repository: { files: candidateFiles },
    collector: COLLECTOR,
    declaredStrategy: "feature",
    rawEvidence: observation.rawEvidence,
    runnerReceiptChannel: observation.runnerReceiptChannel,
  });
  const verdict = verified && verified.verification ? verified.verification.verdict : null;
  if (!verified || verified.ok !== true || verdict !== "PASS") {
    return { stage: "verify", reason: (verified && verified.reason_code) || verdict || "failed", effects: 1 };
  }
  return { stage: null, effects: 1, candidate: integrated.candidate, candidateFiles };
}

function defectOutput(script, defect, clean) {
  const overrides = new Map((defect.checks || []).map((check) => [check.id, check]));
  return {
    patch: defect.patch,
    checks: script.checks.map((check) => overrides.get(check.id) || check),
    staleFrom: defect.kind === "stale-receipt" ? clean : null,
  };
}

/**
 * Runs every seeded defect variant; each must be rejected at its declared stage.
 * @returns {Promise<{ defects: object, misattributed: string[] }>}
 */
async function runSeededDefects(arm, script, clean) {
  const tally = { seeded: 0, detected: 0, escaped: [] };
  const misattributed = [];
  for (const defect of script.defects || []) {
    tally.seeded += 1;
    const result = await runPipeline(arm, defectOutput(script, defect, clean));
    if (!result.stage) {
      tally.escaped.push(defect.id);
      continue;
    }
    tally.detected += 1;
    const expected = DEFECT_STAGE_BY_KIND[defect.kind];
    if (result.stage !== expected) misattributed.push(`${defect.id} expected ${expected}, rejected at ${result.stage}`);
  }
  return { defects: tally, misattributed };
}

function lifecycleOperation(operation, extra = {}) {
  return { operation, arguments: { node_id: NODE_ID }, ...extra };
}

function completeOperation(scenario) {
  return scenario.operations.find((entry) => entry.operation === "complete") || null;
}

function nodeCompleted(scenario) {
  const node = scenario.snapshot.state.nodes[NODE_ID];
  return Boolean(node) && node.phase === "completed";
}

/**
 * Runs the clean pipeline as the `complete` effect of a one-node lifecycle with
 * one injected fault, and checks the kernel's response against the only correct
 * one for that fault. `runScenario` is the K2 harness (injectable for tests).
 * @returns {Promise<{ contained: boolean, interruptions: number, recoveries: number, detail: string }>}
 */
async function runInjectedFault(arm, output, fault, runScenario) {
  let executions = 0;
  let lastPipeline = null;
  const effectExecutor = async (effect) => {
    if (!effect.payload || effect.payload.phase !== "completed") return { ok: true, usage: {} };
    executions += 1;
    lastPipeline = await runPipeline(arm, output);
    if (fault === "interrupt-mid-executor" && executions === 1) throw interruptError("mid-executor");
    return { ok: lastPipeline.stage === null, usage: {} };
  };
  const subjectId = `k12-pilot:${arm.sourceSnapshot.source_snapshot_id}:${fault}`;
  const continueFrom = (previous, operations, extra = {}) => runScenario({
    id: `${fault}:${previous.scenario_id}+`,
    subjectId,
    initialState: previous.snapshot.state,
    initialJournal: previous.snapshot.journal,
    initialAuthority: previous.snapshot.authority,
    budgets: previous.budgets,
    operations,
    effectExecutor,
    ...extra,
  });
  const started = await runScenario({
    id: fault,
    subjectId,
    initialState: { schema_version: 1, status: "ready", nodes: { [NODE_ID]: { id: NODE_ID, phase: "pending", attempt: 0 } } },
    operations: [lifecycleOperation("start")],
    effectExecutor,
    budgets: { ...LIFECYCLE_BUDGETS },
  });
  const pipelinePassed = () => Boolean(lastPipeline) && lastPipeline.stage === null;
  const verdict = (contained, interruptions, recoveries, observed) => ({
    contained,
    interruptions,
    recoveries: contained ? recoveries : 0,
    detail: `${fault}: ${observed}, effect executions ${executions}`,
  });

  if (fault === "interrupt-pre-effect") {
    const interrupted = await continueFrom(started, [lifecycleOperation("complete")], { checkpointInterrupt: "after-journal" });
    const executionsBeforeResume = executions;
    const resumed = await continueFrom(interrupted, [lifecycleOperation("complete")]);
    const contained = interrupted.outcome === "interrupt" && executionsBeforeResume === 0
      && executions === 1 && nodeCompleted(resumed) && pipelinePassed();
    return verdict(contained, 1, 1, nodeCompleted(resumed) ? "resumed to completed" : `resume ${resumed.outcome}`);
  }
  if (fault === "interrupt-mid-executor") {
    const interrupted = await continueFrom(started, [lifecycleOperation("complete")]);
    const resumed = await continueFrom(interrupted, [lifecycleOperation("complete")]);
    const resumeCode = completeOperation(resumed) && completeOperation(resumed).code;
    const contained = interrupted.outcome === "interrupt" && resumeCode === "reconciliation-required" && executions === 1;
    return verdict(contained, 1, 0, `resume ${resumeCode || resumed.outcome}`);
  }
  // bypass-without-permit: the unpermitted complete must be blocked before any
  // effect runs; the authorized complete then finishes the task.
  const bypass = await continueFrom(started, [lifecycleOperation("complete", { omitPermit: true })]);
  const bypassCode = completeOperation(bypass) && completeOperation(bypass).code;
  const executionsAfterBypass = executions;
  const authorized = await continueFrom(bypass, [lifecycleOperation("complete")]);
  const contained = bypassCode === "unauthorized" && executionsAfterBypass === 0
    && executions === 1 && nodeCompleted(authorized) && pipelinePassed();
  return verdict(contained, 0, 0, `bypass ${bypassCode || bypass.outcome}`);
}

/**
 * Runs every injected fault declared by the script.
 * @returns {Promise<{ total: number, contained: number, interruptions: number, recoveries: number, escaped: string[] }>}
 */
async function runInjectedFaults(arm, script, runScenario) {
  const summary = { total: 0, contained: 0, interruptions: 0, recoveries: 0, escaped: [] };
  const output = { patch: script.patch, checks: script.checks, staleFrom: null };
  for (const fault of script.faults || []) {
    const result = await runInjectedFault(arm, output, fault, runScenario);
    summary.total += 1;
    summary.interruptions += result.interruptions;
    summary.recoveries += result.recoveries;
    if (result.contained) summary.contained += 1;
    else summary.escaped.push(result.detail);
  }
  return summary;
}

/**
 * Creates the deterministic paired-pilot executor for runner.executePlan.
 * @param {{ catalog: object, routes: object[], now?: () => number, runScenario?: Function }} options
 *   `runScenario` defaults to the K2 harness `runHarnessScenario`.
 * @returns {(manifest: object, task: object) => Promise<object>}
 * @throws {PilotExecutorError} When the catalog or routing table is unusable.
 */
function createDeterministicPilotExecutor(options = {}) {
  if (!isPlainObject(options) || !isPlainObject(options.catalog) || !Array.isArray(options.catalog.fixtures)) {
    throw new PilotExecutorError("options.catalog must be the loaded oracle catalog");
  }
  const plans = resolveArmPlans(options.routes);
  const now = options.now || (() => Date.now());
  const runScenario = options.runScenario || runHarnessScenario;
  const catalogById = new Map(options.catalog.fixtures.map((fixture) => [fixture.fixture_id, fixture]));

  return async function executePilotRun(manifest, task) {
    const startedAt = now();
    const elapsed = () => Math.max(0, now() - startedAt);
    const fixtureId = manifest && manifest.fixture_id ? manifest.fixture_id : "unknown";
    const plan = plans[manifest && manifest.stratum] ? plans[manifest.stratum][manifest.policy] : null;
    const result = (status, note, comparison, effects = 0, extra = {}) => ({
      status,
      note,
      measurements: measurements(status === "excluded" ? null : plan, effects, elapsed(), extra.faults),
      oracle: oracleRecord(comparison, extra.unappliedReason || note),
    });

    if (!manifest || !task || !PAIRED_ARMS.includes(manifest.policy) || !isNonEmptyString(task.task_path)) {
      return result("fail", "invalid-run", null);
    }
    if (!plans[manifest.stratum]) {
      return result("excluded", `stratum ${manifest.stratum} is outside the pilot strata`, null);
    }
    const catalogFixture = catalogById.get(fixtureId);
    if (!catalogFixture) return result("fail", "fixture-not-in-catalog", null);
    const loaded = loadPilotScript(task.task_path);
    if (loaded.error) return result("fail", `invalid-pilot-script: ${loaded.error}`, null);
    if (!loaded.script) return result("excluded", "no pilot script for fixture", null);

    try {
      const arm = buildArm(fixtureId, manifest.policy, loaded.script);
      const comparison = compareObligations(catalogFixture, arm.executionGraph.obligations);
      const planNote = `${plan.route}: ${plan.phases.length} phases, ${plan.gates.length} gates`;
      const clean = await runPipeline(arm, { patch: loaded.script.patch, checks: loaded.script.checks, staleFrom: null });
      if (clean.stage) {
        return result("fail", `${clean.stage}:${clean.reason} (${planNote})`, comparison, clean.effects);
      }
      if (comparison.verdict !== "pass") return result("fail", `oracle:missing-must (${planNote})`, comparison, clean.effects);

      const seeded = loaded.script.defects ? await runSeededDefects(arm, loaded.script, clean) : null;
      const faults = await runInjectedFaults(arm, loaded.script, runScenario);
      const failures = [];
      if (seeded && seeded.misattributed.length > 0) failures.push(`defect-misattributed: ${seeded.misattributed.join("; ")}`);
      if (faults.escaped.length > 0) failures.push(`fault-escaped: ${faults.escaped.join("; ")}`);
      const findings = ["verify PASS"];
      if (seeded) findings.push(`defects detected ${seeded.defects.detected}/${seeded.defects.seeded}`);
      if (faults.total > 0) findings.push(`faults contained ${faults.contained}/${faults.total}, recoveries ${faults.recoveries}`);
      const outcome = failures.length > 0
        ? result("fail", `${failures.join("; ")} (${planNote})`, comparison, clean.effects, { faults })
        : result("pass", `${findings.join("; ")} (${planNote})`, comparison, clean.effects, { faults });
      return seeded ? { ...outcome, defects: seeded.defects } : outcome;
    } catch (error) {
      const code = error && error.code ? error.code : "executor-error";
      return result("fail", `${code}: ${error && error.message}`, null, 0, {
        unappliedReason: `pipeline aborted before the oracle (${code})`,
      });
    }
  };
}

module.exports = {
  DEFECT_STAGE_BY_KIND,
  FAULT_KINDS,
  FIXED_ROUTE_BY_STRATUM,
  PILOT_SCRIPT_FILE,
  PilotExecutorError,
  REPAIR_RECIPE_PHASES,
  createDeterministicPilotExecutor,
  loadPilotScript,
  resolveArmPlans,
};
