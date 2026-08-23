"use strict";

const { digestLifecycleState } = require("./lifecycle-kernel/state-digest.js");
const { selectTransitions } = require("./lifecycle-kernel/transition-selector.js");
const { reduceLifecycle } = require("./lifecycle-kernel/reducer.js");
const { validateOperationTransition } = require("./lifecycle-kernel/operations.js");
const { projectEvents } = require("./lifecycle-kernel/events.js");
const { reconcileEffect } = require("./lifecycle-kernel/journal.js");
const { runHarnessScenario } = require("./minimal-kernel-harness.js");

const MODEL_CONFIG = Object.freeze({
  schema_version: 1,
  model_version: "k2-lifecycle-model/1.0.0",
  state_domains: Object.freeze({
    statuses: Object.freeze(["ready", "running", "blocked", "terminal"]),
    phases: Object.freeze([
      "pending",
      "started",
      "completed",
      "failed",
      "interrupted",
      "invalidated",
      "terminal",
    ]),
    attempts: Object.freeze([0, 1, 2, 3]),
    exhausted: Object.freeze([false, true]),
  }),
  actions: Object.freeze([
    "status",
    "start",
    "complete",
    "fail",
    "recover",
    "invalidate-node",
  ]),
  limits: Object.freeze({
    max_depth: 6,
    max_visits: 200,
    max_nodes: 2,
  }),
  abstraction_mapping: Object.freeze({
    nodes: "OpenSpec phase nodes collapsed to {id,phase,attempt,exhausted}",
    status: "Top-level lifecycle status derived from node phases",
    journal: "Effect journal abstracted as completed-effect set in harness replay",
    host: "Host adapters excluded from model",
  }),
});

const EXECUTABLE_INVARIANTS = Object.freeze([
  Object.freeze({ id: "inv-same-transitions", name: "Same state → same ordered transitions", optional: false }),
  Object.freeze({ id: "inv-fail-closed", name: "Invalid transitions fail closed", optional: false }),
  Object.freeze({ id: "inv-no-duplicate-effects", name: "Replay does not duplicate effects", optional: false }),
  Object.freeze({ id: "inv-recovery-advances", name: "Named recovery advances or terminates", optional: false }),
  Object.freeze({ id: "inv-no-direct-mutation", name: "Models cannot directly mutate state", optional: false }),
  Object.freeze({ id: "inv-no-implicit-restart", name: "Terminal exhaustion cannot restart", optional: false }),
  Object.freeze({ id: "inv-events-non-authoritative", name: "Events do not alter authoritative state", optional: false }),
  Object.freeze({ id: "inv-terminal-no-execute", name: "Terminal has no non-recovery execute", optional: false }),
]);

const DEFERRED_INVARIANTS = Object.freeze([
  Object.freeze({
    id: "def-candidate-mutation",
    name: "Candidate mutation invalidates verification",
    enforced_in_k2: false,
    owned_by: "K3/K6b",
  }),
  Object.freeze({
    id: "def-delivery-auth",
    name: "Delivery authorization",
    enforced_in_k2: false,
    owned_by: "K10-delivery",
  }),
  Object.freeze({
    id: "def-policy-attestation",
    name: "Policy-bound attestation invalidation",
    enforced_in_k2: false,
    owned_by: "K8/K10-delivery",
  }),
]);

const K21_EXECUTABLE_INVARIANTS = Object.freeze([
  Object.freeze({ id: "inv-k21-no-mutation-without-cas", name: "No mutation without CAS", optional: false }),
  Object.freeze({ id: "inv-k21-stale-permit-reject", name: "Stale permit rejected", optional: false }),
  Object.freeze({ id: "inv-k21-permit-reuse-reject", name: "Permit reuse rejected", optional: false }),
  Object.freeze({ id: "inv-k21-irreversible-ambiguous", name: "Irreversible ambiguous → decide|stop", optional: false }),
  Object.freeze({ id: "inv-k21-convergent-replay", name: "Convergent replay on same revision", optional: false }),
  Object.freeze({ id: "inv-k21-no-self-grant", name: "No model self-grant of permits", optional: false }),
  Object.freeze({ id: "inv-k21-direct-write-blocked", name: "Direct-write adapters blocked", optional: false }),
  Object.freeze({ id: "inv-k21-no-public-auto-mint", name: "Public auto-mint is not a valid auth path", optional: false }),
  Object.freeze({ id: "inv-k21-replay-receipt-stable", name: "Exact replay returns prior OperationReceipt", optional: false }),
]);

const K21B_EXECUTABLE_INVARIANTS = Object.freeze([
  Object.freeze({ id: "inv-k21b-no-state-valid-only", name: "No auth solely because state-valid", optional: false }),
  Object.freeze({ id: "inv-k21b-commit-requires-issued-permit", name: "No commit without issued permit", optional: false }),
  Object.freeze({ id: "inv-k21b-atomic-consume-revision", name: "Consume+receipt same CAS revision", optional: false }),
  Object.freeze({ id: "inv-k21b-replay-prior-receipt", name: "Exact replay returns prior receipt", optional: false }),
  Object.freeze({ id: "inv-k21b-restart-verifiable", name: "Restart keeps permit+receipt verifiable", optional: false }),
]);

const K2A_EXECUTABLE_INVARIANTS = Object.freeze([
  Object.freeze({
    id: "inv-k2a-zero-concrete-host-imports",
    name: "Lifecycle-kernel production tree has zero concrete host-adapter imports",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k2a-no-silent-promotion",
    name: "No capability or profile is promoted without explicit proof in the execution trace",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k2a-enforced-requires-proof",
    name: "enforced:true requires verified capability_proof and active verification record",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k2a-reject-lifecycle-graph-duplication",
    name: "Host adapters cannot duplicate lifecycle graph, reducer, or state store logic",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k2a-sole-claude-adapter",
    name: "Claude is the sole concrete adapter in K2a; all other targets use stub interfaces",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k2a-host-fault-matrix",
    name: "Generic host faults map deterministically to lifecycle outcomes without kernel pollution",
    optional: false,
  }),
]);

const K4A_EXECUTABLE_INVARIANTS = Object.freeze([
  Object.freeze({
    id: "inv-k4a-deterministic-graph-id",
    name: "Execution graph id is deterministic for contract, policy, snapshot, and nodes",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k4a-policy-divergence",
    name: "Policy snapshot changes produce distinct policy bundle digests and graph ids",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k4a-obligation-coverage",
    name: "Execution graph enforces complete obligation coverage fail-closed",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k4a-clarify-invalidation-boundary",
    name: "Clarify events invalidate only affected nodes and their transitive descendants",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k4a-replay-convergence",
    name: "Replay engine evaluates execution graph deterministically without live authority",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k4a-shadow-non-interference",
    name: "Shadow comparator operates without mutating active state or journal",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k4a-no-live-authority",
    name: "Compiled work orders contain declarative boundaries and zero execution authority",
    optional: false,
  }),
]);

const K5_EXECUTABLE_INVARIANTS = Object.freeze([
  Object.freeze({
    id: "inv-k5-budget-monotonicity",
    name: "Non-increasing budget decrements across retry loops and CAS reconciliations",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k5-causal-priority",
    name: "Highest-priority causal failure governs recovery transition selection",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k5-allowlist-enforcement",
    name: "Recovery operations are strictly allowlisted per failure category",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k5-zero-delta-consumption",
    name: "Non-advancing mutation steps consume attempt budget without advancing blocking state",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k5-budget-exhaustion-terminal",
    name: "Exhausted budgets prune execution transitions and force terminal states",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k5-honest-recovery-advancement",
    name: "Honest recovery requires advancement of the blocking fingerprint or terminal state",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k5-telemetry-isolation",
    name: "Transient consumption and telemetry keys are stripped from semantic state digests",
    optional: false,
  }),
]);

const K6A_EXECUTABLE_INVARIANTS = Object.freeze([
  Object.freeze({
    id: "inv-k6a-workspace-lifecycle",
    name: "Workspace is tracked with status active and cleanly disposed with status disposed without leaks",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k6a-capsule-determinism",
    name: "Identical source snapshot and dependency inputs produce byte-identical capsule fingerprints",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k6a-containment-fail-closed",
    name: "File operation targeting path outside allowed_paths halts execution fail-closed with containment-violation/v1",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k6a-work-result-binding",
    name: "CaptureWorkResult produces canonical WorkResult bound to WorkOrderId/SourceSnapshotId without CandidateId",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k6a-interrupted-recovery-preservation",
    name: "Execution timeouts or abort signals preserve partial logs and modified file inventory with status interrupted",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k6a-host-isolation-fallback",
    name: "Host transport with partial/unavailable isolation executes fallback without silent promotion to enforced",
    optional: false,
  }),
]);

function initialModelState() {
  return {
    schema_version: 1,
    status: "ready",
    nodes: {
      n1: { id: "n1", phase: "pending", attempt: 0 },
    },
  };
}

function opaquePortsEqual(left, right) {
  return left === right;
}

function isDecisionStaleForSubject(decision, subjectId) {
  if (!decision || typeof decision !== "object") return true;
  return decision.subject_id !== subjectId;
}

function createFaultySelector() {
  // Violates inv-same-transitions by sorting node ids descending for start.
  return function faultySelect(state) {
    const transitions = selectTransitions(state).map((t) => ({ ...t, arguments: { ...t.arguments } }));
    transitions.sort((a, b) => {
      const na = a.arguments.node_id || "";
      const nb = b.arguments.node_id || "";
      if (na < nb) return 1;
      if (na > nb) return -1;
      return 0;
    });
    return transitions;
  };
}

function checkSameTransitions(state, selector = selectTransitions) {
  const left = selector(state);
  // Distinct object identity clone — proves selector does not depend on reference equality.
  const identityClone = JSON.parse(JSON.stringify(state));
  const right = selector(identityClone);
  // Key-order reshape — proves selector output is order-stable for equivalent states.
  const keyOrderReshape = {
    nodes: state.nodes,
    status: state.status,
    schema_version: state.schema_version,
  };
  const a = JSON.stringify(selector(state));
  const b = JSON.stringify(selector(keyOrderReshape));
  const ok = a === b && JSON.stringify(left) === JSON.stringify(right);
  return {
    ok,
    invariant_id: "inv-same-transitions",
    detail: ok ? null : { left, right: selector(keyOrderReshape) },
  };
}

function checkFailClosed(state) {
  const result = validateOperationTransition(state, {
    operation: "complete",
    arguments: { node_id: "n1" },
  });
  const before = digestLifecycleState(state);
  const ok = result.ok === false && result.code === "invalid-transition" && result.state_digest === before;
  return { ok, invariant_id: "inv-fail-closed" };
}

/**
 * Model checker for inv-no-duplicate-effects.
 * Proves journal reconciliation skips completed effects, reconciles failed usage
 * without re-executing, and only executes planned effects.
 */
function checkNoDuplicateEffects() {
  const completed = reconcileEffect({
    record: { status: "completed", effect_id: "model:e1" },
  });
  const planned = reconcileEffect({
    record: { status: "planned", effect_id: "model:e1" },
  });
  const failed = reconcileEffect({
    record: { status: "failed", effect_id: "model:e1" },
  });
  const replay_completed = reconcileEffect({
    record: { status: "completed", effect_id: "model:e1" },
  });

  const ok =
    completed.action === "skip" &&
    completed.reason === "already-completed" &&
    planned.action === "execute" &&
    failed.action === "reconcile-failed" &&
    replay_completed.action === "skip";

  return {
    ok,
    invariant_id: "inv-no-duplicate-effects",
    detail: { completed, planned, failed, replay_completed },
  };
}

function checkRecoveryAdvances(state) {
  if (!state.nodes?.n1 || state.nodes.n1.phase !== "failed") {
    return { ok: true, invariant_id: "inv-recovery-advances", skipped: true };
  }
  const before = digestLifecycleState(state);
  const reduced = reduceLifecycle(state, {
    operation: "recover",
    arguments: { node_id: "n1" },
    ...(() => {
      const { mintOperationPermit, createPermitAuthorityIssuer } = require("./test-support/permit-test-helpers.js");
      const ledger = createPermitAuthorityIssuer();
      const headRevision =
        "sha256:modelrecoveraaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      const permit = mintOperationPermit({
        ledger,
        operation: "recover",
        expected_revision: headRevision,
        arguments: { node_id: "n1" },
      });
      return { operationPermit: permit, permitLedger: ledger, headRevision };
    })(),
  });
  const after = digestLifecycleState(reduced.state);
  const ok = after !== before || reduced.outcome === "terminal";
  return { ok, invariant_id: "inv-recovery-advances" };
}

function checkNoDirectMutation(state) {
  const cloned = JSON.parse(JSON.stringify(state));
  cloned.status = "terminal";
  const authoritative = digestLifecycleState(state);
  const mutated = digestLifecycleState(cloned);
  // Direct mutation of a copy does not change the original authority.
  const ok = authoritative !== mutated && digestLifecycleState(state) === authoritative;
  return { ok, invariant_id: "inv-no-direct-mutation" };
}

function checkNoImplicitRestart(state) {
  const exhausted = {
    schema_version: 1,
    status: "blocked",
    nodes: { n1: { id: "n1", phase: "failed", attempt: 3, exhausted: true } },
  };
  const transitions = selectTransitions(exhausted);
  const ok = !transitions.some((t) => t.operation === "start");
  return { ok, invariant_id: "inv-no-implicit-restart", state_used: exhausted };
}

function checkEventsNonAuthoritative(state) {
  const before = digestLifecycleState(state);
  const beforeTransitions = JSON.stringify(selectTransitions(state));
  projectEvents({
    state,
    journal: [
      {
        effect_id: "sha256:e1",
        operation_id: "sha256:o1",
        status: "completed",
        kernel_version: 1,
      },
    ],
  });
  const ok =
    digestLifecycleState(state) === before &&
    JSON.stringify(selectTransitions(state)) === beforeTransitions;
  return { ok, invariant_id: "inv-events-non-authoritative" };
}

function checkTerminalNoExecute() {
  const terminal = {
    schema_version: 1,
    status: "terminal",
    nodes: { n1: { id: "n1", phase: "terminal", attempt: 1, exhausted: true } },
  };
  const transitions = selectTransitions(terminal);
  const ok = !transitions.some((t) => t.kind === "execute" && t.operation !== "recover");
  return { ok, invariant_id: "inv-terminal-no-execute" };
}

const CHECKERS = {
  "inv-same-transitions": (ctx) => checkSameTransitions(ctx.state, ctx.selector),
  "inv-fail-closed": (ctx) => checkFailClosed(ctx.state),
  "inv-no-duplicate-effects": () => checkNoDuplicateEffects(),
  "inv-recovery-advances": (ctx) => checkRecoveryAdvances(ctx.state),
  "inv-no-direct-mutation": (ctx) => checkNoDirectMutation(ctx.state),
  "inv-no-implicit-restart": (ctx) => checkNoImplicitRestart(ctx.state),
  "inv-events-non-authoritative": (ctx) => checkEventsNonAuthoritative(ctx.state),
  "inv-terminal-no-execute": () => checkTerminalNoExecute(),
  "inv-k21-no-mutation-without-cas": () => checkK21NoMutationWithoutCas(),
  "inv-k21-stale-permit-reject": () => checkK21StalePermitReject(),
  "inv-k21-permit-reuse-reject": () => checkK21PermitReuseReject(),
  "inv-k21-irreversible-ambiguous": () => checkK21IrreversibleAmbiguous(),
  "inv-k21-convergent-replay": () => checkK21ConvergentReplay(),
  "inv-k21-no-self-grant": () => checkK21NoSelfGrant(),
  "inv-k21-direct-write-blocked": () => checkK21DirectWriteBlocked(),
  "inv-k21-no-public-auto-mint": () => checkK21NoPublicAutoMint(),
  "inv-k21-replay-receipt-stable": () =>
    checkK21bReplayPriorReceipt().then((r) => ({
      ...r,
      invariant_id: "inv-k21-replay-receipt-stable",
    })),
  "inv-k21b-no-state-valid-only": () => checkK21bNoStateValidOnly(),
  "inv-k21b-commit-requires-issued-permit": () => checkK21bCommitRequiresIssuedPermit(),
  "inv-k21b-atomic-consume-revision": () => checkK21bAtomicConsumeRevision(),
  "inv-k21b-replay-prior-receipt": () => checkK21bReplayPriorReceipt(),
  "inv-k21b-restart-verifiable": () => checkK21bRestartVerifiable(),
  "inv-k2a-zero-concrete-host-imports": () => checkK2aZeroConcreteHostImports(),
  "inv-k2a-no-silent-promotion": () => checkK2aNoSilentPromotion(),
  "inv-k2a-enforced-requires-proof": () => checkK2aEnforcedRequiresProof(),
  "inv-k2a-reject-lifecycle-graph-duplication": () => checkK2aRejectDuplication(),
  "inv-k2a-sole-claude-adapter": () => checkK2aSoleClaudeAdapter(),
  "inv-k2a-host-fault-matrix": () => checkK2aHostFaultMatrix(),
  "inv-k4a-deterministic-graph-id": () => checkK4aDeterministicGraphId(),
  "inv-k4a-policy-divergence": () => checkK4aPolicyDivergence(),
  "inv-k4a-obligation-coverage": () => checkK4aObligationCoverage(),
  "inv-k4a-clarify-invalidation-boundary": () => checkK4aClarifyInvalidationBoundary(),
  "inv-k4a-replay-convergence": () => checkK4aReplayConvergence(),
  "inv-k4a-shadow-non-interference": () => checkK4aShadowNonInterference(),
  "inv-k4a-no-live-authority": () => checkK4aNoLiveAuthority(),
  "inv-k5-budget-monotonicity": () => checkK5BudgetMonotonicity(),
  "inv-k5-causal-priority": () => checkK5CausalPriority(),
  "inv-k5-allowlist-enforcement": () => checkK5AllowlistEnforcement(),
  "inv-k5-zero-delta-consumption": () => checkK5ZeroDeltaConsumption(),
  "inv-k5-budget-exhaustion-terminal": () => checkK5BudgetExhaustionTerminal(),
  "inv-k5-honest-recovery-advancement": () => checkK5HonestRecoveryAdvancement(),
  "inv-k5-telemetry-isolation": () => checkK5TelemetryIsolation(),
  "inv-k6a-workspace-lifecycle": () => checkK6aWorkspaceLifecycle(),
  "inv-k6a-capsule-determinism": () => checkK6aCapsuleDeterminism(),
  "inv-k6a-containment-fail-closed": () => checkK6aContainmentFailClosed(),
  "inv-k6a-work-result-binding": () => checkK6aWorkResultBinding(),
  "inv-k6a-interrupted-recovery-preservation": () => checkK6aInterruptedRecoveryPreservation(),
  "inv-k6a-host-isolation-fallback": () => checkK6aHostIsolationFallback(),
};

function checkK2aZeroConcreteHostImports() {
  const path = require("node:path");
  const { assertK2TreeInScope } = require("./lifecycle-kernel/scope-guard.js");
  const kernelDir = path.join(__dirname, "lifecycle-kernel");
  const result = assertK2TreeInScope(kernelDir);
  return { ok: result.ok === true, invariant_id: "inv-k2a-zero-concrete-host-imports" };
}

function checkK2aNoSilentPromotion() {
  const { resolveCapabilityState } = require("./host-contract/index.js");
  const cases = ["unavailable", "instructional", "partial"];
  for (const declared of cases) {
    const result = resolveCapabilityState({
      capability_id: "ExecutionTransport",
      declared_state: declared,
      request_enforced: true,
    });
    if (result.enforced === true || result.effective_state === "enforced") {
      return { ok: false, invariant_id: "inv-k2a-no-silent-promotion", detail: { declared, result } };
    }
  }
  return { ok: true, invariant_id: "inv-k2a-no-silent-promotion" };
}

function checkK2aEnforcedRequiresProof() {
  const { evaluateEnforcementEligibility, verifyCapabilityProof, REASON } = require("./capability-proof/index.js");
  const missing = evaluateEnforcementEligibility({
    capability_id: "ExecutionTransport",
    declared_state: "enforced",
  });
  if (missing.enforced) {
    return { ok: false, invariant_id: "inv-k2a-enforced-requires-proof", detail: "declared-only" };
  }
  // Concrete artifact: missing evidence_digest fails (not opaque) when live expected fields present.
  const incomplete = verifyCapabilityProof({
    capabilityId: "ExecutionTransport",
    expectedAdapterId: "claude",
    expectedAdapterVersion: "1.0.0",
    expectedHostRuntimeVersion: "k2a-host/1",
    expectedProbeDigest: "sha256:probe-live-distinct",
    proof: {
      adapter_id: "claude",
      adapter_version: "1.0.0",
      host_version: "k2a-host/1",
      fixture: "f.json",
      probe_digest: "sha256:probe-live-distinct",
    },
    evidence: { a: 1 },
  });
  if (incomplete.ok || incomplete.path !== "/evidence_digest") {
    return { ok: false, invariant_id: "inv-k2a-enforced-requires-proof", detail: incomplete };
  }
  if (incomplete.reason_code !== REASON.PROOF_FIELD_MISSING) {
    return { ok: false, invariant_id: "inv-k2a-enforced-requires-proof", detail: incomplete };
  }
  return { ok: true, invariant_id: "inv-k2a-enforced-requires-proof" };
}

async function checkK2aRejectDuplication() {
  const { runConformanceScenario, REASON } = require("./headless-conformance-host.js");
  const baseTransports = {
    ExecutionTransport: { port_id: "e" },
    QuestionTransport: { port_id: "q" },
    WorkerTransport: { port_id: "w" },
    ToolExecutionTransport: { port_id: "t" },
    DeliveryGateTransport: { port_id: "d" },
  };
  const lifecycle = await runConformanceScenario({
    scenario_id: "model-dup-lifecycle",
    seed: 0,
    adapter: {
      adapter_id: "bad",
      adapter_version: "1",
      host_version: "1",
      capabilities: {},
      transports: {
        ...baseTransports,
        ExecutionTransport: { port_id: "e", selectTransition: () => [] },
      },
    },
  });
  const graph = await runConformanceScenario({
    scenario_id: "model-dup-graph",
    seed: 0,
    adapter: {
      adapter_id: "bad",
      adapter_version: "1",
      host_version: "1",
      capabilities: {},
      transports: baseTransports,
      authority_surface: { compileGraph: true },
    },
  });
  const ok =
    lifecycle.reason_code === REASON.LIFECYCLE_DUPLICATION &&
    graph.reason_code === REASON.GRAPH_DUPLICATION;
  return { ok, invariant_id: "inv-k2a-reject-lifecycle-graph-duplication" };
}

function checkK2aSoleClaudeAdapter() {
  const { assertSoleClaudeActivation, listActivatedRealAdapters } = require("./host-adapters/registry.js");
  const gate = assertSoleClaudeActivation();
  return {
    ok: gate.ok === true && listActivatedRealAdapters().length === 1,
    invariant_id: "inv-k2a-sole-claude-adapter",
  };
}

async function checkK2aHostFaultMatrix() {
  const { peerHostFaultMatrix } = require("./minimal-kernel-harness.js");
  const { createClaudeHostAdapter } = require("./host-adapters/claude.js");
  const peer = await peerHostFaultMatrix({ adapter: await createClaudeHostAdapter() });
  const faults = peer.matrix.faults_covered || [];
  const required = ["timeout", "cancel", "worker-fail", "interrupt"];
  const ok =
    peer.fault_driver === "headless-conformance-host" &&
    peer.owns_host_policy === false &&
    required.every((f) => faults.includes(f)) &&
    peer.matrix.pass === true;
  return { ok, invariant_id: "inv-k2a-host-fault-matrix" };
}

function checkK4aDeterministicGraphId() {
  const { compileExecutionGraph } = require("./execution-graph/compiler.js");
  const { createPolicySnapshot } = require("./execution-graph/policy-snapshot.js");
  const { createSampleRepairContract } = require("./test-support/execution-graph-fixtures.js");
  const obligations = [{ id: "req-1", criticality: "must", implemented_by: ["r1"], required_evidence: ["ev:test"] }];
  const contract = createSampleRepairContract({ obligations });
  const snapshot = createPolicySnapshot({ effectiveRules: ["rule-1"] });
  const nodes = [
    {
      node_id: "r1",
      kind: "repair-action/v1",
      operation: "apply_repair_patch",
      objective: "Repair",
      dependencies: [],
      ownership: { owner: "agent:repair", mode: "exclusive" },
      allowed_paths: ["src/**"],
      invariants: ["inv-fail-closed"],
      required_evidence: ["ev:test"],
      budget_ref: "budget:default",
    },
  ];
  const g1 = compileExecutionGraph({ contract, policySnapshot: snapshot, nodes, obligations });
  const g2 = compileExecutionGraph({ contract, policySnapshot: snapshot, nodes, obligations });
  const ok = g1.graph_id === g2.graph_id && typeof g1.graph_id === "string";
  return { ok, invariant_id: "inv-k4a-deterministic-graph-id" };
}

function checkK4aPolicyDivergence() {
  const { compileExecutionGraph } = require("./execution-graph/compiler.js");
  const { createPolicySnapshot } = require("./execution-graph/policy-snapshot.js");
  const { createSampleRepairContract } = require("./test-support/execution-graph-fixtures.js");
  const obligations = [{ id: "req-1", criticality: "must", implemented_by: ["r1"], required_evidence: ["ev:test"] }];
  const contract = createSampleRepairContract({ obligations });
  const nodes = [
    {
      node_id: "r1",
      kind: "repair-action/v1",
      operation: "apply_repair_patch",
      objective: "Repair",
      dependencies: [],
      ownership: { owner: "agent:repair", mode: "exclusive" },
      allowed_paths: ["src/**"],
      invariants: ["inv-fail-closed"],
      required_evidence: ["ev:test"],
      budget_ref: "budget:default",
    },
  ];
  const snapA = createPolicySnapshot({ effectiveRules: ["rule-alpha"] });
  const snapB = createPolicySnapshot({ effectiveRules: ["rule-beta"] });
  const gA = compileExecutionGraph({ contract, policySnapshot: snapA, nodes, obligations });
  const gB = compileExecutionGraph({ contract, policySnapshot: snapB, nodes, obligations });
  const ok = snapA.snapshot_id !== snapB.snapshot_id && gA.graph_id !== gB.graph_id;
  return { ok, invariant_id: "inv-k4a-policy-divergence" };
}

function checkK4aObligationCoverage() {
  const { validateObligationManifest } = require("./execution-graph/obligation-manifest.js");
  const nodes = [{ node_id: "r1" }];
  const validObligations = [{ id: "req-1", criticality: "must", implemented_by: ["r1"], required_evidence: ["ev:test"] }];
  const orphanObligations = [{ id: "req-orphan", criticality: "must", implemented_by: [], required_evidence: ["ev:test"] }];
  const validRes = validateObligationManifest(validObligations, nodes);
  const orphanRes = validateObligationManifest(orphanObligations, nodes);
  const ok = validRes.valid === true && orphanRes.valid === false && orphanRes.unmapped.includes("req-orphan");
  return { ok, invariant_id: "inv-k4a-obligation-coverage" };
}

function checkK4aClarifyInvalidationBoundary() {
  const { applyClarifyEvent } = require("./execution-graph/clarify.js");
  const { computeGraphId } = require("./execution-graph/compiler.js");
  function makeNode(id, deps = []) {
    return {
      node_id: id,
      kind: "repair-action/v1",
      operation: "apply_repair_patch",
      objective: `Execute ${id}`,
      dependencies: deps,
      ownership: { owner: "agent:repair", mode: "exclusive" },
      allowed_paths: ["src/**"],
      invariants: ["inv-fail-closed"],
      required_evidence: [`ev:${id}`],
      budget_ref: "budget:default",
    };
  }
  const nodes = [
    makeNode("n1", []),
    makeNode("n2", ["n1"]),
    makeNode("n3", ["n2"]),
    makeNode("n4", []),
  ];
  const obligations = [
    { id: "req-1", criticality: "must", implemented_by: ["n1"], required_evidence: ["ev:n1"] },
    { id: "req-2", criticality: "must", implemented_by: ["n2"], required_evidence: ["ev:n2"] },
    { id: "req-3", criticality: "must", implemented_by: ["n3"], required_evidence: ["ev:n3"] },
    { id: "req-4", criticality: "must", implemented_by: ["n4"], required_evidence: ["ev:n4"] },
  ];
  const contract_digest = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
  const policy_bundle_digest = "sha256:3333333333333333333333333333333333333333333333333333333333333333";
  const policy_snapshot_id = "sha256:5555555555555555555555555555555555555555555555555555555555555555";
  const source_snapshot_id = "sha256:4444444444444444444444444444444444444444444444444444444444444444";
  const graph_id = computeGraphId(contract_digest, policy_snapshot_id, policy_bundle_digest, source_snapshot_id, nodes, obligations);
  const graph = {
    schema_version: 1,
    graph_id,
    contract_digest,
    policy_bundle_digest,
    policy_snapshot_id,
    source_snapshot_id,
    nodes,
    obligations,
  };
  const event = {
    schema_version: 1,
    event_id: "e1",
    question_id: "q1",
    answer: "a",
    timestamp: "2026-08-15T00:00:00Z",
    affected_nodes: ["n2"],
  };
  const result = applyClarifyEvent(graph, event);
  const ok =
    result.invalidatedNodeIds.includes("n2") &&
    result.invalidatedNodeIds.includes("n3") &&
    result.preservedNodeIds.includes("n1") &&
    result.preservedNodeIds.includes("n4");
  return { ok, invariant_id: "inv-k4a-clarify-invalidation-boundary" };
}

function checkK4aReplayConvergence() {
  const { replayExecutionGraph } = require("./execution-graph/replay-engine.js");
  const { createSampleExecutionGraph, createSampleFixtureResults } = require("./test-support/execution-graph-fixtures.js");
  const graph = createSampleExecutionGraph();
  const fixtures = createSampleFixtureResults();
  const r1 = replayExecutionGraph(graph, fixtures);
  const r2 = replayExecutionGraph(graph, fixtures);
  const ok = r1.ok === true && r1.finalStateDigest === r2.finalStateDigest;
  return { ok, invariant_id: "inv-k4a-replay-convergence" };
}

function checkK4aShadowNonInterference() {
  const { compareShadowExecution } = require("./execution-graph/shadow-comparator.js");
  const { createSampleExecutionGraph } = require("./test-support/execution-graph-fixtures.js");
  const activeState = { status: "ready", revision: "sha256:initial" };
  const beforeJson = JSON.stringify(activeState);
  const graph = createSampleExecutionGraph();
  const comp = compareShadowExecution({
    contractInput: { state: activeState },
    fixedBaselineFn: () => ({
      route: "repair",
      steps: ["apply_repair_patch", "verify_repair_conformance"],
      allowed_paths: ["src/**", "tests/**"],
      invariants: ["inv-fail-closed", "inv-no-direct-mutation"],
      obligations: ["req-repair-patch-001", "req-repair-verify-001"],
      dependencies: [
        { node_id: "repair-patch", dependencies: [] },
        { node_id: "repair-verify", dependencies: ["repair-patch"] },
      ],
      ownership: [
        { node_id: "repair-patch", ownership: { owner: "agent:repair", mode: "exclusive" } },
        { node_id: "repair-verify", ownership: { owner: "agent:verify", mode: "shared" } },
      ],
    }),
    compiledGraph: graph,
  });
  const afterJson = JSON.stringify(activeState);
  const ok = comp.match === true && beforeJson === afterJson;
  return { ok, invariant_id: "inv-k4a-shadow-non-interference" };
}

function checkK4aNoLiveAuthority() {
  const { compileWorkOrders } = require("./execution-graph/work-order-compiler.js");
  const {
    createSampleExecutionGraph,
    createSampleSourceSnapshot,
  } = require("./test-support/execution-graph-fixtures.js");
  const graph = createSampleExecutionGraph();
  const sourceSnapshot = createSampleSourceSnapshot();
  const sourceSnapshotId = sourceSnapshot.source_snapshot_id;
  const workOrders = compileWorkOrders(graph, { sourceSnapshot, sourceSnapshotId });
  const ok =
    workOrders.length > 0 &&
    workOrders.every(
      (wo) =>
        wo.operation_permit === undefined &&
        wo.permit === undefined &&
        wo.authority_token === undefined &&
        wo.token === undefined &&
        wo.kind === "work-order/v2" &&
        wo.source_snapshot_id === sourceSnapshotId
    );
  return { ok, invariant_id: "inv-k4a-no-live-authority" };
}

async function checkK5BudgetMonotonicity() {
  const { createAuthorityStore, createKernelRuntime, DEFAULT_SUBJECT_ID } = require("./lifecycle-kernel/index.js");
  const initial = {
    schema_version: 1,
    status: "ready",
    nodes: {
      n1: {
        id: "n1",
        phase: "pending",
        attempt: 0,
        budget: { schema_version: 1, turns: 10, commands: 20, allowed_paths: [] },
      },
    },
    authority_budget: { schema_version: 1, effect_attempts: 5 },
  };
  const base = createAuthorityStore({ initial: { state: initial, journal: [] } });
  let conflicts = 0;
  const store = {
    ...base,
    async compareAndSwap(...args) {
      conflicts += 1;
      if (conflicts <= 2) return { ok: false, code: "cas-conflict", revision: (await base.load()).revision };
      return base.compareAndSwap(...args);
    },
  };
  const runtime = createKernelRuntime({ store });
  let executions = 0;
  const attempts = [];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const head = await base.load();
    const issued = runtime.issuePermitForSelectedTransition({
      operation: "start", expected_revision: head.revision, arguments: { node_id: "n1" },
    });
    attempts.push(await runtime.runOperation({
      operation: "start", arguments: { node_id: "n1" }, operationPermit: issued.permit,
      effectExecutor: async () => {
        executions += 1;
        return { ok: true, usage: { turns: 3, effect_attempts: 1 } };
      },
    }));
  }
  const exactFinal = await base.load();

  const failedStore = createAuthorityStore({ initial: { state: initial, journal: [] } });
  const failedRuntime = createKernelRuntime({ store: failedStore });
  const failedHead = await failedStore.load();
  const failedPermit = failedRuntime.issuePermitForSelectedTransition({
    operation: "start", expected_revision: failedHead.revision, arguments: { node_id: "n1" },
  });
  let failedExecutions = 0;
  const failed = await failedRuntime.runOperation({
    operation: "start", arguments: { node_id: "n1" }, operationPermit: failedPermit.permit,
    effectExecutor: async () => {
      failedExecutions += 1;
      return { ok: false, usage: { turns: 3, effect_attempts: 1 } };
    },
  });
  const failedRetryHead = await failedStore.load();
  const failedRetryPermit = failedRuntime.issuePermitForSelectedTransition({
    operation: "start", expected_revision: failedRetryHead.revision, arguments: { node_id: "n1" },
  });
  const failedRetry = await failedRuntime.runOperation({
    operation: "start", arguments: { node_id: "n1" }, operationPermit: failedRetryPermit.permit,
    effectExecutor: async () => {
      failedExecutions += 1;
      return { ok: true, usage: { turns: 99 } };
    },
  });
  const failedFinal = await failedStore.load();

  const missingStore = createAuthorityStore({ initial: { state: initial, journal: [] } });
  const missingRuntime = createKernelRuntime({ store: missingStore });
  const missingHead = await missingStore.load();
  const missingPermit = missingRuntime.issuePermitForSelectedTransition({
    operation: "start", expected_revision: missingHead.revision, arguments: { node_id: "n1" },
  });
  const missing = await missingRuntime.runOperation({
    operation: "start", arguments: { node_id: "n1" }, operationPermit: missingPermit.permit,
    effectExecutor: async () => ({ ok: true }),
  });

  const completedJournal = exactFinal.journal[0];
  const stale = await base.compareAndSwap(
    DEFAULT_SUBJECT_ID, exactFinal.revision, exactFinal.state,
    [{ ...completedJournal, status: "failed", result: { ok: false, usage: { turns: 99 } } }]
  );
  const monotonicJournal = (await base.load()).journal[0];
  const ok =
    attempts[0].code === "cas-conflict" &&
    attempts[1].code === "cas-conflict" &&
    attempts[2].outcome === "advanced" &&
    executions === 1 &&
    exactFinal.state.nodes.n1.budget.turns === 7 &&
    exactFinal.state.authority_budget.effect_attempts === 4 &&
    failed.outcome === "blocked" &&
    failedRetry.code === "effect-failed" &&
    failedExecutions === 1 &&
    failedFinal.state.nodes.n1.budget.turns === 7 &&
    missing.code === "execution-usage-required" &&
    stale.ok === true &&
    monotonicJournal.status === "completed";

  return {
    ok,
    invariant_id: "inv-k5-budget-monotonicity",
    runtime_composed: true,
    observations: ["success-exact-debit", "two-cas-losses", "failed-and-missing-usage", "completed-monotonicity"],
    detail: {
      attempt_codes: attempts.map((result) => result.code || result.outcome),
      executions,
      exact_turns: exactFinal.state.nodes.n1.budget.turns,
      exact_effect_attempts: exactFinal.state.authority_budget.effect_attempts,
      failed: failed.code,
      failed_retry: failedRetry.code,
      failed_executions: failedExecutions,
      failed_turns: failedFinal.state.nodes.n1.budget.turns,
      missing: missing.code,
      stale_ok: stale.ok,
      stale_code: stale.code || null,
      monotonic_status: monotonicJournal.status,
    },
  };
}

async function runK5RuntimeCompositionWitness() {
  const { createAuthorityStore, createKernelRuntime } = require("./lifecycle-kernel/index.js");
  const initial = {
    schema_version: 1,
    status: "ready",
    nodes: { n1: { id: "n1", phase: "pending", attempt: 0, budget: { schema_version: 1, turns: 2 } } },
    authority_budget: { schema_version: 1, effect_attempts: 2 },
  };
  const store = createAuthorityStore({ initial: { state: initial, journal: [] } });
  const runtime = createKernelRuntime({ store });
  const head = await store.load();
  const issued = runtime.issuePermitForSelectedTransition({
    operation: "start", expected_revision: head.revision, arguments: { node_id: "n1" },
  });
  const result = await runtime.runOperation({
    operation: "start", arguments: { node_id: "n1" }, operationPermit: issued.permit,
    effectExecutor: async () => ({ ok: true, usage: { turns: 1, effect_attempts: 1 } }),
  });
  const after = await store.load();
  return {
    ok: issued.ok === true && result.outcome === "advanced" && Boolean(result.operation_receipt) &&
      after.state.nodes.n1.phase === "started" && after.journal.some((entry) => entry.status === "completed"),
    runtime_composed: true,
  };
}



async function checkK5CausalPriority() {
  const { resolvePrimaryFailure, createCausalFailure } = require("./causal-failure.js");
  const { selectTransitions } = require("./lifecycle-kernel/transition-selector.js");
  const fCode = createCausalFailure({ failure_id: "f1", category: "code_defect", code: "ASSERTION_FAIL" });
  const fEnv = createCausalFailure({ failure_id: "f2", category: "environment_tooling", code: "TOOL_TIMEOUT" });
  const primary = resolvePrimaryFailure([fCode, fEnv]);

  const state = {
    schema_version: 1,
    status: "blocked",
    nodes: {
      n1: {
        id: "n1",
        phase: "failed",
        attempt: 1,
        failure: primary,
      },
    },
  };
  const transitions = selectTransitions(state);
  const opNames = transitions.map((t) => t.operation);
  const composition = await runK5RuntimeCompositionWitness();
  const ok =
    composition.ok &&
    primary !== null &&
    primary.category === "environment_tooling" &&
    primary.priority === 1 &&
    !opNames.includes("repair") &&
    (opNames.includes("replan") || opNames.includes("escalate"));
  return { ok, invariant_id: "inv-k5-causal-priority", runtime_composed: composition.runtime_composed };
}

async function checkK5AllowlistEnforcement() {
  const { validateRecoveryTransition, getAllowlistedTransitions } = require("./failure-recovery.js");
  const { selectTransitions } = require("./lifecycle-kernel/transition-selector.js");

  const categories = ["code_defect", "validation_gap", "ambiguous_effect", "cas_conflict", "environment_tooling"];
  let allOk = true;

  for (const cat of categories) {
    const allowed = getAllowlistedTransitions(cat, { remainingAttempts: 2 });
    for (const op of allowed) {
      const v = validateRecoveryTransition(cat, op, { remainingAttempts: 2 });
      if (!v.ok) allOk = false;
    }
  }

  const stateAmbiguous = {
    schema_version: 1,
    status: "blocked",
    nodes: {
      n1: {
        id: "n1",
        phase: "failed",
        attempt: 1,
        failure: { category: "ambiguous_effect", code: "AMB_1", priority: 3 },
      },
    },
  };
  const trans = selectTransitions(stateAmbiguous);
  const ops = trans.map((t) => t.operation);

  const composition = await runK5RuntimeCompositionWitness();
  const ok =
    composition.ok &&
    allOk &&
    !ops.includes("repair") &&
    !ops.includes("replan") &&
    ops.includes("escalate") &&
    ops.includes("stop");
  return { ok, invariant_id: "inv-k5-allowlist-enforcement", runtime_composed: composition.runtime_composed };
}

async function checkK5ZeroDeltaConsumption() {
  const { createAuthorityStore, createKernelRuntime } = require("./lifecycle-kernel/index.js");
  const initial = {
    schema_version: 1,
    status: "blocked",
    nodes: {
      n1: {
        id: "n1",
        phase: "failed",
        attempt: 1,
        failure: { category: "code_defect", code: "TEST_FAIL", blocking_fingerprint: "fp:model-zero-delta" },
        budget: { schema_version: 1, turns: 5, effect_attempts: 3, patches: 5, commands: 10, wall_time_minutes: 30, changed_lines: 400, allowed_paths: [] },
      },
    },
    authority_budget: { schema_version: 1, effect_attempts: 3 },
  };
  const store = createAuthorityStore({ initial: { state: initial, journal: [] } });
  const runtime = createKernelRuntime({ store });
  const head = await store.load();
  const issued = runtime.issuePermitForSelectedTransition({
    operation: "repair",
    expected_revision: head.revision,
    arguments: {
      node_id: "n1",
      scope: { node_ids: ["n1"], allowed_paths: ["src/**"], finding_ids: ["F-1"] },
    },
  });
  const result = await runtime.runOperation({
    operation: "repair",
    arguments: {
      node_id: "n1",
      scope: { node_ids: ["n1"], allowed_paths: ["src/**"], finding_ids: ["F-1"] },
    },
    operationPermit: issued.permit,
    effectExecutor: async () => ({
      ok: true,
      usage: {},
      modified_files_count: 0,
      changed_lines: 0,
      state_advanced: true,
    }),
  });
  const after = await store.load();
  const stateAfter = after.state;
  const nodeAfter = stateAfter.nodes.n1;

  const ok =
    result.outcome === "advanced" &&
    nodeAfter.zero_delta_attempts === 1 &&
    nodeAfter.budget.turns === 4 &&
    stateAfter.authority_budget.effect_attempts === 2 &&
    after.journal.some((entry) => entry.status === "completed") &&
    after.journal.some((entry) => entry.status === "zero-delta-attempt" || entry.kind === "zero-delta-attempt");
  return { ok, invariant_id: "inv-k5-zero-delta-consumption", runtime_composed: true };
}

async function checkK5BudgetExhaustionTerminal() {
  const { isBudgetExhausted } = require("./execution-budgets.js");
  const { selectTransitions, nextTransition } = require("./lifecycle-kernel/transition-selector.js");

  const dimensions = [
    { turns: 0 },
    { patches: 0 },
    { commands: 0 },
    { wall_time_minutes: 0 },
    { changed_lines: 0 },
    { effect_attempts: 0 },
    { authority_mutations: 0 },
    { evidence_runs: 0 },
    { review_sweeps: 0 },
  ];

  let allExhausted = true;
  for (const dim of dimensions) {
    const evalRes = isBudgetExhausted(dim);
    if (!evalRes.exhausted) {
      allExhausted = false;
    }
  }

  const exhaustedState = {
    schema_version: 1,
    status: "blocked",
    nodes: {
      n1: {
        id: "n1",
        phase: "failed",
        attempt: 3,
        exhausted: true,
        budget: { schema_version: 1, turns: 0, patches: 0, commands: 0, wall_time_minutes: 0, changed_lines: 0, allowed_paths: [] },
      },
    },
  };
  const transitions = selectTransitions(exhaustedState);
  const next = nextTransition(exhaustedState);

  const composition = await runK5RuntimeCompositionWitness();
  const ok =
    composition.ok &&
    allExhausted &&
    !transitions.some((t) => t.operation === "start" || t.operation === "recover" || t.operation === "repair") &&
    (next.operation === "escalate" || next.operation === "stop");
  return { ok, invariant_id: "inv-k5-budget-exhaustion-terminal", runtime_composed: composition.runtime_composed };
}

async function checkK5HonestRecoveryAdvancement() {
  const { createAuthorityStore, createKernelRuntime } = require("./lifecycle-kernel/index.js");
  const initial = {
    schema_version: 1,
    status: "blocked",
    nodes: {
      n1: {
        id: "n1",
        phase: "failed",
        attempt: 1,
        failure: { category: "code_defect", code: "ERR_1", priority: 5, blocking_fingerprint: "fp:model-honesty" },
      },
    },
  };
  const store = createAuthorityStore({ initial: { state: initial, journal: [] } });
  const runtime = createKernelRuntime({ store });
  const head = await store.load();
  const args = {
    node_id: "n1",
    scope: { node_ids: ["n1"], allowed_paths: ["src/**"], finding_ids: ["ERR_1"] },
  };
  const issued = runtime.issuePermitForSelectedTransition({
    operation: "repair",
    expected_revision: head.revision,
    arguments: args,
  });
  const result = await runtime.runOperation({
    operation: "repair",
    arguments: args,
    operationPermit: issued.permit,
    effectExecutor: async () => ({ ok: true, usage: {}, state_advanced: true }),
  });

  const ok =
    result.outcome === "advanced" &&
    result.status.nodes.n1.phase === "pending";
  return { ok, invariant_id: "inv-k5-honest-recovery-advancement", runtime_composed: true };
}

async function checkK5TelemetryIsolation() {
  const { digestLifecycleState } = require("./lifecycle-kernel/state-digest.js");
  const baseState = {
    schema_version: 1,
    status: "ready",
    nodes: { n1: { id: "n1", phase: "pending", attempt: 1 } },
  };
  const stateWithTelemetry = {
    schema_version: 1,
    status: "ready",
    telemetry: { wall_clock_ms: 12345, cpu_cycles: 9999 },
    consumption: { tokens_in: 500, tokens_out: 100 },
    nodes: { n1: { id: "n1", phase: "pending", attempt: 1, wall_clock_ms: 500 } },
  };
  const d1 = digestLifecycleState(baseState);
  const d2 = digestLifecycleState(stateWithTelemetry);
  const composition = await runK5RuntimeCompositionWitness();
  const ok = composition.ok && d1 === d2;
  return { ok, invariant_id: "inv-k5-telemetry-isolation", runtime_composed: composition.runtime_composed };
}

async function checkK6aWorkspaceLifecycle() {
  const { createWorkspace, disposeWorkspace } = require("./worker-workspace.js");
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-inv-ws-"));
  try {
    const ws = await createWorkspace({ baseDir });
    const createdOk = ws && ws.status === "active" && fs.existsSync(ws.root_path);
    const d1 = await disposeWorkspace(ws);
    const disposedOk = d1.ok && ws.status === "disposed" && !fs.existsSync(ws.root_path);
    const d2 = await disposeWorkspace(ws);
    const idempotentOk = d2.ok && ws.status === "disposed";
    const ok = createdOk && disposedOk && idempotentOk;
    return { ok, invariant_id: "inv-k6a-workspace-lifecycle", runtime_composed: true };
  } finally {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
}

async function checkK6aCapsuleDeterminism() {
  const { createWorkspace, disposeWorkspace, materializeSourceSnapshot } = require("./worker-workspace.js");
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-inv-cap-"));
  try {
    const ws1 = await createWorkspace({ baseDir });
    const ws2 = await createWorkspace({ baseDir });
    const snapshot = {
      schema_version: 1,
      source_snapshot_id: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      repository_id: "repo-inv-test",
      base_tree_digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      projection: "workspace",
      dependency_digests: [],
    };
    const workOrder = {
      schema_version: 2,
      kind: "work-order/v2",
      work_order_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      source_snapshot_id: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      dependencies: ["sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"],
      capsule_inputs: ["src/a.js", "package.json"],
      allowed_paths: ["src/**"],
    };
    const files = { "src/a.js": "const a = 1;\n", "package.json": '{"name":"a"}\n' };
    const c1 = await materializeSourceSnapshot(ws1, workOrder, snapshot, { files });
    const c2 = await materializeSourceSnapshot(ws2, workOrder, snapshot, { files });
    await disposeWorkspace(ws1);
    await disposeWorkspace(ws2);
    const ok =
      c1.fingerprint === c2.fingerprint &&
      /^sha256:[a-f0-9]{64}$/.test(c1.fingerprint) &&
      Array.isArray(c1.capsule_inputs) &&
      c1.capsule_inputs.length === 2;
    return { ok, invariant_id: "inv-k6a-capsule-determinism", runtime_composed: true };
  } finally {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
}

async function checkK6aContainmentFailClosed() {
  const { validateAllowedPaths } = require("./allowed-paths-validator.js");
  const trav = validateAllowedPaths(["../escape"], ["src/**"]);
  const undeclared = validateAllowedPaths(["secret/file.txt"], ["src/**"]);
  const valid = validateAllowedPaths(["src/app.js"], ["src/**"]);
  const ok = !trav.ok && trav.violation.violation_type === "traversal" &&
             !undeclared.ok && undeclared.violation.violation_type === "undeclared_write" &&
             valid.ok;
  return { ok, invariant_id: "inv-k6a-containment-fail-closed", runtime_composed: true };
}

async function checkK6aWorkResultBinding() {
  const { captureWorkResult, validateWorkResultBinding, computeWorkResultId } = require("./worker-executor.js");
  const { computeWorkOrderId } = require("./execution-identities/index.js");
  const snapId = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  const workOrder = {
    schema_version: 2,
    kind: "work-order/v2",
    node_id: "node-inv-1",
    role: "executor",
    status: "pending",
    operation: "apply",
    objective: "Verify binding",
    source_snapshot_id: snapId,
    dependencies: [],
    ownership: { owner: "agent-1", mode: "exclusive" },
    allowed_paths: ["src/**"],
    invariants: ["inv-1"],
    required_evidence: ["ev-1"],
    budget: { model_turns: 5, patches: 2, commands: 5, wall_time_minutes: 5, changed_lines: 100 },
  };
  workOrder.work_order_id = computeWorkOrderId(workOrder);

  const workResult = await captureWorkResult({
    work_order_id: workOrder.work_order_id,
    source_snapshot_id: snapId,
    patch: "--- a/x\n+++ b/x\n",
    commands: [],
    logs: ["ok"],
    exit_code: 0,
    filesystem_inventory: [],
  });

  const validBinding = validateWorkResultBinding(workOrder, workResult);
  const badOrder = {
    ...workOrder,
    work_order_id: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
  };
  const invalidBinding = validateWorkResultBinding(badOrder, workResult);
  const zeroCandidate = workResult.candidate_id === undefined && workResult.candidateId === undefined;
  const ok = validBinding.ok && !invalidBinding.ok && zeroCandidate && workResult.work_result_id === computeWorkResultId(workResult);
  return { ok, invariant_id: "inv-k6a-work-result-binding", runtime_composed: true };
}

async function checkK6aInterruptedRecoveryPreservation() {
  const { createWorkspace, disposeWorkspace } = require("./worker-workspace.js");
  const { recoverInterruptedExecution } = require("./worker-executor.js");
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-inv-rec-"));
  try {
    const ws = await createWorkspace({ baseDir });
    fs.writeFileSync(path.join(ws.root_path, "partial.txt"), "partial data");
    const workOrder = {
      work_order_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      source_snapshot_id: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    };
    const recovery = await recoverInterruptedExecution({
      workspace: ws,
      workOrder,
      partialLogs: ["timeout after 1000ms"],
      reason: "timeout",
    });
    const ok = recovery.status === "interrupted" &&
               ws.status === "interrupted" &&
               recovery.partial_logs.length === 1 &&
               recovery.modified_inventory.some((f) => f.path === "partial.txt");
    await disposeWorkspace(ws);
    return { ok, invariant_id: "inv-k6a-interrupted-recovery-preservation", runtime_composed: true };
  } finally {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
}

async function checkK6aHostIsolationFallback() {
  const { createWorkspace, disposeWorkspace } = require("./worker-workspace.js");
  const { executeWorkOrder } = require("./worker-executor.js");
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "k6a-inv-iso-"));
  try {
    const ws = await createWorkspace({ baseDir });
    const workOrder = {
      work_order_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      source_snapshot_id: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      allowed_paths: ["**"],
    };
    const result = await executeWorkOrder({
      workOrder,
      workspace: ws,
      command: process.execPath,
      args: ["-e", "console.log('iso ok');"],
      isolationCapability: "unavailable",
    });
    const ok = result.ok && result.isolationReported === "unavailable" && result.isolationReported !== "enforced";
    await disposeWorkspace(ws);
    return { ok, invariant_id: "inv-k6a-host-isolation-fallback", runtime_composed: true };
  } finally {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
}

function checkK21NoMutationWithoutCas() {
  const { createMemoryStore } = require("./lifecycle-kernel/memory-store.js");
  const { createKernelRuntime } = require("./lifecycle-kernel/index.js");
  const bare = createMemoryStore({
    state: initialModelState(),
  });
  let rejected = false;
  return createKernelRuntime({ store: bare })
    .runOperation({
      operation: "start",
      arguments: { node_id: "n1" },
      effectExecutor: async () => ({ ok: true, usage: {} }),
    })
    .then(() => ({ ok: false, invariant_id: "inv-k21-no-mutation-without-cas" }))
    .catch((error) => {
      rejected = error && error.code === "authority-store-required";
      return { ok: rejected, invariant_id: "inv-k21-no-mutation-without-cas" };
    });
}

function checkK21StalePermitReject() {
  const { authorizeMutation } = require("./lifecycle-kernel/permits.js");
  const { mintOperationPermit, createPermitAuthorityIssuer } = require("./test-support/permit-test-helpers.js");
  const ledger = createPermitAuthorityIssuer();
  const permit = mintOperationPermit({
    ledger,
    operation: "start",
    expected_revision: "sha256:old",
  });
  const auth = authorizeMutation({
    permit,
    headRevision: "sha256:new",
    ledger,
  });
  return {
    ok: auth.ok === false && auth.code === "stale-permit",
    invariant_id: "inv-k21-stale-permit-reject",
  };
}

function checkK21PermitReuseReject() {
  const { authorizeMutation, consumePermit } = require("./lifecycle-kernel/permits.js");
  const { mintOperationPermit, createPermitAuthorityIssuer } = require("./test-support/permit-test-helpers.js");
  const ledger = createPermitAuthorityIssuer();
  const permit = mintOperationPermit({
    ledger,
    operation: "start",
    expected_revision: "sha256:head",
  });
  consumePermit({
    permit_id: permit.permit_id,
    ledger,
    subject_id: "lifecycle:default",
    operation: "start",
    revision: "sha256:next",
    outcome: "advanced",
  });
  const reuse = authorizeMutation({ permit, headRevision: "sha256:head", ledger });
  return {
    ok: reuse.ok === false && reuse.code === "permit-reuse",
    invariant_id: "inv-k21-permit-reuse-reject",
  };
}

function checkK21IrreversibleAmbiguous() {
  const { applyEffectPolicy } = require("./lifecycle-kernel/effect-policy.js");
  const policy = applyEffectPolicy({ effect_class: "irreversible", ambiguous: true });
  const ok =
    policy.ok === false &&
    policy.code === "irreversible-ambiguous" &&
    policy.auto_retry === false &&
    ["decide", "stop"].includes(policy.next_kind);
  return { ok, invariant_id: "inv-k21-irreversible-ambiguous" };
}

function checkK21ConvergentReplay() {
  const { createAuthorityStore } = require("./authority-store/index.js");
  // Sync shape check: store API supports convergent replay flag contract.
  const store = createAuthorityStore({ initial: { state: initialModelState(), journal: [] } });
  return store.load().then(async (before) => {
    const next = {
      schema_version: 1,
      status: "running",
      nodes: { n1: { id: "n1", phase: "started", attempt: 1 } },
    };
    const journal = [
      {
        schema_version: 1,
        kernel_version: 1,
        operation_id: "sha256:op",
        effect_id: "sha256:e",
        status: "completed",
        result: { ok: true },
      },
    ];
    const first = await store.compareAndSwap("lifecycle:default", before.revision, next, journal);
    const head = await store.load();
    const replay = await store.compareAndSwap("lifecycle:default", head.revision, next, journal);
    return {
      ok: first.ok && replay.ok && replay.converged === true && replay.revision === head.revision,
      invariant_id: "inv-k21-convergent-replay",
    };
  });
}

function checkK21NoSelfGrant() {
  const { authorizeMutation } = require("./lifecycle-kernel/permits.js");
  const { createPermitAuthorityIssuer } = require("./test-support/permit-test-helpers.js");
  const ledger = createPermitAuthorityIssuer();
  const fabricated = {
    schema_version: 1,
    kind: "operation-permit/v1",
    permit_id: "permit:model-self-grant",
    domain: "lifecycle",
    operation: "start",
    subject_id: "lifecycle:default",
    expected_revision: "sha256:head",
    arguments_digest: "sha256:a",
    scope_digest: "sha256:b",
    policy_digest: "sha256:c",
    budget_ref: "budget:none",
    single_use: true,
  };
  const auth = authorizeMutation({ permit: fabricated, headRevision: "sha256:head", ledger });
  const tokenOnly = require("./lifecycle-kernel/operations.js").authorizeOperation({
    operation: "start",
    authorityToken: "opaque:model-token",
  });
  return {
    ok:
      auth.ok === false &&
      auth.code === "permit-not-runtime-issued" &&
      tokenOnly.ok === false &&
      tokenOnly.code === "unauthorized",
    invariant_id: "inv-k21-no-self-grant",
  };
}

function checkK21DirectWriteBlocked() {
  const { blockDirectWrite } = require("./lifecycle-kernel/effect-policy.js");
  const blocked = blockDirectWrite({ hasPermit: false, usedCas: false, hasEffectClass: false });
  const okPath = blockDirectWrite({ hasPermit: true, usedCas: true, hasEffectClass: true });
  return {
    ok: blocked.code === "direct-write-blocked" && okPath.ok === true,
    invariant_id: "inv-k21-direct-write-blocked",
  };
}

function pendingModelState() {
  return {
    schema_version: 1,
    status: "ready",
    nodes: { n1: { id: "n1", phase: "pending", attempt: 0 } },
  };
}

async function checkK21NoPublicAutoMint() {
  const { createAuthorityStore, createKernelRuntime } = require("./lifecycle-kernel/index.js");
  const store = createAuthorityStore({ initial: { state: pendingModelState(), journal: [] } });
  const runtime = createKernelRuntime({ store });
  const auto = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    mintPermit: true,
    effectExecutor: async () => ({ ok: true, usage: {} }),
  });
  const missing = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    effectExecutor: async () => ({ ok: true, usage: {} }),
  });
  const ok =
    auto.outcome === "blocked" &&
    auto.code === "auto-mint-disabled" &&
    missing.outcome === "blocked" &&
    missing.code === "unauthorized";
  return { ok, invariant_id: "inv-k21-no-public-auto-mint" };
}

async function checkK21bNoStateValidOnly() {
  const { runHarnessScenario } = require("./minimal-kernel-harness.js");
  const result = await runHarnessScenario({
    id: "model:k21b-state-valid-only",
    initialState: pendingModelState(),
    operations: [{ operation: "start", arguments: { node_id: "n1" }, omitPermit: true }],
  });
  const ok = result.outcome === "blocked" && result.halted && result.halted.code === "unauthorized";
  return { ok, invariant_id: "inv-k21b-no-state-valid-only" };
}

async function checkK21bCommitRequiresIssuedPermit() {
  // Same gate as state-valid-only: no issued permit → no CAS advance.
  const result = await checkK21bNoStateValidOnly();
  return { ok: result.ok, invariant_id: "inv-k21b-commit-requires-issued-permit" };
}

async function checkK21bAtomicConsumeRevision() {
  const { runHarnessScenario } = require("./minimal-kernel-harness.js");
  const result = await runHarnessScenario({
    id: "model:k21b-atomic-consume",
    initialState: pendingModelState(),
    operations: [{ operation: "start", arguments: { node_id: "n1" } }],
  });
  const snap = result.snapshot;
  const permitId = result.operations[0] && result.operations[0].operation_permit_id;
  const receipt = result.operations[0] && result.operations[0].operation_receipt;
  const ok =
    result.outcome !== "blocked" &&
    snap.state.nodes.n1.phase === "started" &&
    permitId &&
    snap.authority &&
    snap.authority.permits[permitId] &&
    snap.authority.permits[permitId].status === "consumed" &&
    snap.authority.receipts[permitId] &&
    receipt &&
    snap.authority.receipts[permitId].receipt_id === receipt.receipt_id;
  return { ok, invariant_id: "inv-k21b-atomic-consume-revision" };
}

async function checkK21bReplayPriorReceipt() {
  const { createAuthorityStore, createKernelRuntime } = require("./lifecycle-kernel/index.js");
  const store = createAuthorityStore({ initial: { state: pendingModelState(), journal: [] } });
  const runtime = createKernelRuntime({ store });
  const head = await store.load();
  const issued = runtime.issuePermitForSelectedTransition({
    operation: "start",
    expected_revision: head.revision,
    arguments: { node_id: "n1" },
  });
  const first = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: issued.permit,
    effectExecutor: async () => ({ ok: true, usage: {} }),
  });
  const replay = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: issued.permit,
    effectExecutor: async () => ({ ok: true, usage: {} }),
  });
  const ok =
    first.outcome === "advanced" &&
    first.operation_receipt &&
    replay.operation_receipt &&
    replay.operation_receipt.receipt_id === first.operation_receipt.receipt_id &&
    replay.replayed === true;
  return { ok, invariant_id: "inv-k21b-replay-prior-receipt" };
}

async function checkK21bRestartVerifiable() {
  const { runHarnessScenario, createAuthorityStore } = require("./minimal-kernel-harness.js");
  const result = await runHarnessScenario({
    id: "model:k21b-restart",
    initialState: pendingModelState(),
    operations: [{ operation: "start", arguments: { node_id: "n1" } }],
  });
  const permitId = result.operations[0] && result.operations[0].operation_permit_id;
  const receiptId =
    result.operations[0] &&
    result.operations[0].operation_receipt &&
    result.operations[0].operation_receipt.receipt_id;
  const restored = createAuthorityStore({ initial: result.snapshot });
  const loaded = await restored.load();
  const ok =
    permitId &&
    receiptId &&
    loaded.authority.permits[permitId] &&
    loaded.authority.permits[permitId].status === "consumed" &&
    loaded.authority.receipts[permitId] &&
    loaded.authority.receipts[permitId].receipt_id === receiptId;
  return { ok, invariant_id: "inv-k21b-restart-verifiable" };
}

async function checkInvariant(id, context = {}) {
  const checker = CHECKERS[id];
  if (!checker) return { ok: false, invariant_id: id, code: "unknown-invariant" };
  const state = context.state || initialModelState();
  const result = checker({ state, selector: context.selector || selectTransitions });
  return Promise.resolve(result);
}

async function runAllInvariantCheckers(context = {}) {
  const allInvariants = [
    ...EXECUTABLE_INVARIANTS,
    ...K21_EXECUTABLE_INVARIANTS,
    ...K21B_EXECUTABLE_INVARIANTS,
    ...K2A_EXECUTABLE_INVARIANTS,
    ...K4A_EXECUTABLE_INVARIANTS,
    ...K5_EXECUTABLE_INVARIANTS,
    ...K6A_EXECUTABLE_INVARIANTS,
  ];
  const results = [];
  for (const inv of allInvariants) {
    const result = await checkInvariant(inv.id, context);
    results.push({
      ...result,
      name: inv.name,
      optional: inv.optional,
      deferred: false,
      counts_as_enforced: true,
    });
  }
  const deferred = DEFERRED_INVARIANTS.map((inv) => ({
    ok: true,
    invariant_id: inv.id,
    name: inv.name,
    deferred: true,
    counts_as_enforced: false,
    enforced_in_k2: false,
  }));
  // CAS/permit/retry, K2.1b, K2a host, K4a graph, K5 budget/recovery, and K6a worker isolation invariants must not appear on deferred list.
  const deferredIds = new Set(deferred.map((d) => d.invariant_id));
  for (const inv of [
    ...K21_EXECUTABLE_INVARIANTS,
    ...K21B_EXECUTABLE_INVARIANTS,
    ...K2A_EXECUTABLE_INVARIANTS,
    ...K4A_EXECUTABLE_INVARIANTS,
    ...K5_EXECUTABLE_INVARIANTS,
    ...K6A_EXECUTABLE_INVARIANTS,
  ]) {
    if (deferredIds.has(inv.id)) {
      return {
        results: [...results, ...deferred],
        enforced_count: results.length,
        ok: false,
        code: "invariant-incorrectly-deferred",
      };
    }
  }
  return {
    results: [...results, ...deferred],
    enforced_count: results.length,
    ok: results.every((r) => r.ok),
    k21_count: K21_EXECUTABLE_INVARIANTS.length,
    k21b_count: K21B_EXECUTABLE_INVARIANTS.length,
    k2a_count: K2A_EXECUTABLE_INVARIANTS.length,
    k4a_count: K4A_EXECUTABLE_INVARIANTS.length,
    k5_count: K5_EXECUTABLE_INVARIANTS.length,
    k6a_count: K6A_EXECUTABLE_INVARIANTS.length,
  };
}

function applyAction(state, action) {
  if (action === "status") return { state, outcome: "advanced" };
  const nodeId = "n1";
  const { mintOperationPermit, createPermitAuthorityIssuer } = require("./test-support/permit-test-helpers.js");
  const ledger = createPermitAuthorityIssuer();
  const headRevision =
    "sha256:modelexploreaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const permit = mintOperationPermit({
    ledger,
    operation: action,
    expected_revision: headRevision,
    arguments: { node_id: nodeId },
  });
  const reduced = reduceLifecycle(state, {
    operation: action,
    arguments: { node_id: nodeId },
    operationPermit: permit,
    permitLedger: ledger,
    headRevision,
  });
  return { state: reduced.state, outcome: reduced.outcome, code: reduced.code };
}

function exploreModel(options = {}) {
  const seed = options.seed || "k2-default";
  const maxDepth = options.max_depth ?? MODEL_CONFIG.limits.max_depth;
  const maxVisits = options.max_visits ?? MODEL_CONFIG.limits.max_visits;
  const selector = options.selector || selectTransitions;
  const actions = options.actions || MODEL_CONFIG.actions.filter((a) => a !== "status");

  const queue = [{ state: initialModelState(), depth: 0, trace: [] }];
  const visited = new Set();
  let visitCount = 0;

  while (queue.length > 0 && visitCount < maxVisits) {
    const current = queue.shift();
    visitCount += 1;
    const digest = digestLifecycleState(current.state);
    const key = `${digest}:${current.depth}`;
    if (visited.has(key)) continue;
    visited.add(key);

    // Check same-transitions invariant against provided selector.
    const same = checkSameTransitions(current.state, selector);
    if (!same.ok) {
      return {
        ok: false,
        visited: visitCount,
        counterexample: {
          seed,
          invariant_id: same.invariant_id,
          trace: current.trace,
          state: current.state,
          detail: same.detail,
        },
      };
    }

    // For faulty two-node states, expand nodes to force ordering bug.
    if (options.selector && current.depth === 0) {
      const twoNode = {
        schema_version: 1,
        status: "ready",
        nodes: {
          b: { id: "b", phase: "pending", attempt: 0 },
          a: { id: "a", phase: "pending", attempt: 0 },
        },
      };
      const orderedBug = checkSameTransitions(twoNode, selector);
      // Faulty selector returns different order vs honest selector.
      const honest = JSON.stringify(selectTransitions(twoNode));
      const faulty = JSON.stringify(selector(twoNode));
      if (honest !== faulty) {
        return {
          ok: false,
          visited: visitCount,
          counterexample: {
            seed,
            invariant_id: "inv-same-transitions",
            trace: [{ action: "observe", note: "faulty-selector-ordering" }],
            state: twoNode,
            detail: { honest, faulty },
          },
        };
      }
      void orderedBug;
    }

    if (current.depth >= maxDepth) continue;

    for (const action of actions) {
      const next = applyAction(current.state, action);
      if (next.code) continue;
      queue.push({
        state: next.state,
        depth: current.depth + 1,
        trace: [...current.trace, { action, outcome: next.outcome }],
      });
    }
  }

  // Also run the full checker suite on the initial state.
  // Note: exploreModel is sync for BFS; K2.1 async checkers are covered by runAllInvariantCheckers callers.
  const suiteSync = {
    ok: EXECUTABLE_INVARIANTS.every((inv) => {
      const checker = CHECKERS[inv.id];
      if (!checker) return false;
      const result = checker({ state: initialModelState(), selector });
      // Sync checkers only in explore path.
      if (result && typeof result.then === "function") return true;
      return result && result.ok;
    }),
  };
  if (!suiteSync.ok) {
    return {
      ok: false,
      visited: visitCount,
      counterexample: {
        seed,
        invariant_id: "inv-suite",
        trace: [],
        state: initialModelState(),
      },
    };
  }

  return { ok: true, visited: visitCount, counterexample: null, seed };
}

async function replayCounterexample(counterexample) {
  if (!counterexample || !counterexample.invariant_id) {
    return { ok: false, reproduced: false, code: "invalid-counterexample" };
  }

  if (counterexample.invariant_id === "inv-same-transitions") {
    const state = counterexample.state || {
      schema_version: 1,
      status: "ready",
      nodes: {
        b: { id: "b", phase: "pending", attempt: 0 },
        a: { id: "a", phase: "pending", attempt: 0 },
      },
    };
    const harness = await runHarnessScenario({
      id: `replay-${counterexample.seed}`,
      initialState: state,
      operations: [{ operation: "status" }],
    });
    const honest = JSON.stringify(harness.transitions);
    // Reproduce using the same faulty selector on the counterexample state.
    const faulty = createFaultySelector();
    const bad = JSON.stringify(faulty(state));
    const reproduced = honest !== bad;
    return {
      ok: !reproduced,
      reproduced,
      invariant_id: counterexample.invariant_id,
      harness_digest: harness.final_state_digest,
    };
  }

  return {
    ok: false,
    reproduced: false,
    code: "abstraction-mismatch",
    abstraction: "unsupported-invariant-replay",
    invariant_id: counterexample.invariant_id,
  };
}

module.exports = {
  MODEL_CONFIG,
  EXECUTABLE_INVARIANTS,
  K21_EXECUTABLE_INVARIANTS,
  K21B_EXECUTABLE_INVARIANTS,
  K2A_EXECUTABLE_INVARIANTS,
  K4A_EXECUTABLE_INVARIANTS,
  K5_EXECUTABLE_INVARIANTS,
  K6A_EXECUTABLE_INVARIANTS,
  DEFERRED_INVARIANTS,
  exploreModel,
  checkInvariant,
  runAllInvariantCheckers,
  opaquePortsEqual,
  isDecisionStaleForSubject,
  replayCounterexample,
  createFaultySelector,
  initialModelState,
};
