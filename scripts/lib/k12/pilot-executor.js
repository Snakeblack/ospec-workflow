"use strict";

// Deterministic executor for the Adaptive Repair pilot, slice P2a
// (docs/analysis/2026-10-02-adaptive-pilot-scoping.md). Each fixture carries a
// scripted worker output (`pilot.json`): base files, one patch, the obligations
// the executor declares, and the allowed paths. Both arms consume the SAME
// scripted output, so the comparison isolates the mechanism: each arm compiles
// its own execution graph under its own PolicySnapshot, then the patch runs
// through the real K4b pure stages (patch integration and K3 Candidate freeze),
// the K6b independent verifier, and the K12 obligations oracle.
//
// What this does NOT measure: worker isolation (K6a proves it; the scripted
// patch replaces the isolated worker) and model quality (no model runs). The
// phase plan per arm is declared, so phase counts are a recorded hypothesis,
// not an observation. Evidence is scripted through the K6b test runner
// authority (collector `node-test`), never presented as a real test run.
//
// This is measurement tooling: it grants no authority, writes no store, and
// changes no route or default.

const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const { sha256Fingerprint } = require("../canonical-json.js");
const { computeTreeDigest } = require("../worker-workspace.js");
const { computeSourceSnapshotId } = require("../execution-identities/index.js");
const { compileExecutionGraph, createPolicySnapshot } = require("../execution-graph/index.js");
const { integrateWorkResultPatches } = require("../repair-shadow/index.js");
const { verifyCandidate } = require("../independent-verifier/index.js");
const { createTestRunnerReceiptChannel } = require("../test-support/k6b-runner-receipt.js");
const { compareObligations } = require("./obligation-oracle.js");
const { PAIRED_ARMS } = require("./runner.js");

const PILOT_SCRIPT_FILE = "pilot.json";
const PILOT_SCRIPT_KEYS = Object.freeze(["schema_version", "files", "patch", "allowed_paths", "obligations"]);
const NODE_ID = "repair";
const EVIDENCE_ROLES = Object.freeze(["acceptance", "invariants", "contract", "negative"]);
const COLLECTOR = Object.freeze({ id: "node-test", transport: "tool-execution-transport" });
// The live route each P2a stratum takes under the fixed control policy. Other
// strata are outside P2a and are recorded as excluded, never silently passed.
const FIXED_ROUTE_BY_STRATUM = Object.freeze({
  "local-reversible": "lite",
  "behavior-repair": "bugfix",
});
// Repair recipe under test (roadmap K10: "Repair conserva reproducción y
// Candidate-bound verify"). It compresses phases only: it inherits every gate
// of the control route, so no composition drops a review the control requires.
const REPAIR_RECIPE_PHASES = Object.freeze(["reproduce", "repair", "verify"]);

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

/**
 * Resolves both arms' phase plans per P2a stratum from the live routing table.
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
    && Object.keys(obligation).every((key) => ["id", "criticality", "required_evidence"].includes(key))
    && isNonEmptyString(obligation.id)
    && ["must", "should"].includes(obligation.criticality)
    && Array.isArray(obligation.required_evidence)
    && obligation.required_evidence.length > 0
    && obligation.required_evidence.every(isNonEmptyString)
    ? null
    : `pilot script obligation ${index} must have id, criticality must|should, and non-empty required_evidence`;
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
  if (script.schema_version !== 1) errors.push("pilot script schema_version must be 1");
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
  return errors.length > 0 ? { script: null, error: errors.join("; ") } : { script, error: null };
}

function measurements(plan, effectsExecuted, wallMs) {
  return {
    phases_executed: plan ? plan.phases.length : 0,
    effects_executed: effectsExecuted,
    events_recorded: plan ? plan.phases.length + plan.gates.length : 0,
    wall_ms: wallMs,
    interruptions: 0,
    recoveries: 0,
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

function buildArmPipeline(fixtureId, policy, script) {
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
  return { files, sourceSnapshot, policySnapshot, node, obligations, contract };
}

async function runArm(fixtureId, policy, script, catalogFixture) {
  const arm = buildArmPipeline(fixtureId, policy, script);
  const executionGraph = compileExecutionGraph({
    contract: arm.contract,
    policySnapshot: arm.policySnapshot,
    sourceSnapshot: arm.sourceSnapshot,
    nodes: [arm.node],
    obligations: arm.obligations,
  });
  const comparison = compareObligations(catalogFixture, executionGraph.obligations);

  const workOrderId = sha256Fingerprint("k12-pilot-work-order/v1", {
    graph_id: executionGraph.graph_id,
    node_id: NODE_ID,
  });
  const integrated = await integrateWorkResultPatches(arm.sourceSnapshot, [{
    work_order_id: workOrderId,
    source_snapshot_id: arm.sourceSnapshot.source_snapshot_id,
    patch: script.patch,
    commands: [],
    logs: [],
    exit_code: 0,
    filesystem_inventory: [],
  }], { files: arm.files, workOrders: [{ work_order_id: workOrderId, allowed_paths: arm.node.allowed_paths }] });
  if (!integrated.ok) {
    return { comparison, effects: 0, failure: `integration:${integrated.reason_code || "failed"}` };
  }

  const rawEvidence = EVIDENCE_ROLES.map((role) => ({
    bytes: `${role}: scripted pilot evidence for ${fixtureId}`,
    provenance: "runtime-observed",
    origin: `role:${role}`,
    node_id: NODE_ID,
  }));
  const runnerReceiptChannel = createTestRunnerReceiptChannel({
    candidate: integrated.candidate,
    executionGraph,
    rawEvidence,
    receiptSpecs: EVIDENCE_ROLES.map((role) => ({
      role,
      node_id: NODE_ID,
      evidence_requirements_satisfied: arm.node.required_evidence,
    })),
    collector: COLLECTOR,
  });
  const verified = verifyCandidate({
    candidate: integrated.candidate,
    executionGraph,
    policySnapshot: arm.policySnapshot,
    contract: arm.contract,
    sourceSnapshot: arm.sourceSnapshot,
    repository: { files: Object.fromEntries(integrated.candidateFiles) },
    collector: COLLECTOR,
    declaredStrategy: "feature",
    rawEvidence,
    runnerReceiptChannel,
  });
  const verdict = verified && verified.verification ? verified.verification.verdict : null;
  if (!verified || verified.ok !== true || verdict !== "PASS") {
    return { comparison, effects: 1, failure: `verify:${(verified && verified.reason_code) || verdict || "failed"}` };
  }
  if (comparison.verdict !== "pass") return { comparison, effects: 1, failure: "oracle:missing-must" };
  return { comparison, effects: 1, failure: null, candidateId: integrated.candidate.candidate_id };
}

/**
 * Creates the deterministic paired-pilot executor for runner.executePlan.
 * @param {{ catalog: object, routes: object[], now?: () => number }} options
 * @returns {(manifest: object, task: object) => Promise<object>}
 * @throws {PilotExecutorError} When the catalog or routing table is unusable.
 */
function createDeterministicPilotExecutor(options = {}) {
  if (!isPlainObject(options) || !isPlainObject(options.catalog) || !Array.isArray(options.catalog.fixtures)) {
    throw new PilotExecutorError("options.catalog must be the loaded oracle catalog");
  }
  const plans = resolveArmPlans(options.routes);
  const now = options.now || (() => Date.now());
  const catalogById = new Map(options.catalog.fixtures.map((fixture) => [fixture.fixture_id, fixture]));

  return async function executePilotRun(manifest, task) {
    const startedAt = now();
    const elapsed = () => Math.max(0, now() - startedAt);
    const fixtureId = manifest && manifest.fixture_id ? manifest.fixture_id : "unknown";
    const plan = plans[manifest && manifest.stratum] ? plans[manifest.stratum][manifest.policy] : null;
    const result = (status, note, comparison, effects = 0, unappliedReason = note) => ({
      status,
      note,
      measurements: measurements(status === "excluded" ? null : plan, effects, elapsed()),
      oracle: oracleRecord(comparison, unappliedReason),
    });

    if (!manifest || !task || !PAIRED_ARMS.includes(manifest.policy) || !isNonEmptyString(task.task_path)) {
      return result("fail", "invalid-run", null);
    }
    if (!plans[manifest.stratum]) {
      return result("excluded", `stratum ${manifest.stratum} is outside pilot slice P2a`, null);
    }
    const catalogFixture = catalogById.get(fixtureId);
    if (!catalogFixture) return result("fail", "fixture-not-in-catalog", null);
    const loaded = loadPilotScript(task.task_path);
    if (loaded.error) return result("fail", `invalid-pilot-script: ${loaded.error}`, null);
    if (!loaded.script) return result("excluded", "no pilot script for fixture", null);

    try {
      const outcome = await runArm(fixtureId, manifest.policy, loaded.script, catalogFixture);
      const planNote = `${plan.route}: ${plan.phases.length} phases, ${plan.gates.length} gates`;
      if (outcome.failure) {
        return result("fail", `${outcome.failure} (${planNote})`, outcome.comparison, outcome.effects);
      }
      return result("pass", `verify PASS (${planNote})`, outcome.comparison, outcome.effects);
    } catch (error) {
      const code = error && error.code ? error.code : "executor-error";
      return result("fail", `${code}: ${error && error.message}`, null, 0, `pipeline aborted before the oracle (${code})`);
    }
  };
}

module.exports = {
  FIXED_ROUTE_BY_STRATUM,
  PILOT_SCRIPT_FILE,
  PilotExecutorError,
  REPAIR_RECIPE_PHASES,
  createDeterministicPilotExecutor,
  loadPilotScript,
  resolveArmPlans,
};
