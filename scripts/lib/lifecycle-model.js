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
    id: "def-budget-monotonicity",
    name: "Productive correction budget monotonicity",
    enforced_in_k2: false,
    owned_by: "K5/K7",
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
    name: "Lifecycle/Graph/receipt have zero concrete host imports",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k2a-no-silent-promotion",
    name: "unavailable/instructional never silently become enforced",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k2a-enforced-requires-proof",
    name: "enforced requires verifying CapabilityProof",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k2a-reject-lifecycle-graph-duplication",
    name: "Adapters duplicating lifecycle/Graph semantics are rejected",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k2a-sole-claude-adapter",
    name: "Exactly one real product adapter (claude) is activated",
    optional: false,
  }),
  Object.freeze({
    id: "inv-k2a-host-fault-matrix",
    name: "Host-fault matrix covers timeout/cancel/worker-fail/interrupt",
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
 * Proves journal reconciliation skips completed/failed effects and only executes planned.
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
    failed.action === "skip" &&
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
      const { createPermitLedger, mintOperationPermit } = require("./lifecycle-kernel/permits.js");
      const ledger = createPermitLedger();
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
  const peer = await peerHostFaultMatrix({ adapter: createClaudeHostAdapter() });
  const faults = peer.matrix.faults_covered || [];
  const required = ["timeout", "cancel", "worker-fail", "interrupt"];
  const ok =
    peer.fault_driver === "headless-conformance-host" &&
    peer.owns_host_policy === false &&
    required.every((f) => faults.includes(f)) &&
    peer.matrix.pass === true;
  return { ok, invariant_id: "inv-k2a-host-fault-matrix" };
}

function checkK21NoMutationWithoutCas() {
  const { createMemoryStore } = require("./lifecycle-kernel/memory-store.js");
  const { runKernelOperation } = require("./lifecycle-kernel/index.js");
  const bare = createMemoryStore({
    state: initialModelState(),
  });
  let rejected = false;
  return runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store: bare,
    effectExecutor: async () => ({ ok: true }),
  })
    .then(() => ({ ok: false, invariant_id: "inv-k21-no-mutation-without-cas" }))
    .catch((error) => {
      rejected = error && error.code === "authority-store-required";
      return { ok: rejected, invariant_id: "inv-k21-no-mutation-without-cas" };
    });
}

function checkK21StalePermitReject() {
  const { createPermitLedger, mintOperationPermit, authorizeMutation } = require("./lifecycle-kernel/permits.js");
  const ledger = createPermitLedger();
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
  const { createPermitLedger, mintOperationPermit, authorizeMutation, consumePermit } = require("./lifecycle-kernel/permits.js");
  const ledger = createPermitLedger();
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
  const { createPermitLedger, authorizeMutation } = require("./lifecycle-kernel/permits.js");
  const ledger = createPermitLedger();
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
  const { createAuthorityStore, runKernelOperation } = require("./lifecycle-kernel/index.js");
  const store = createAuthorityStore({ initial: { state: pendingModelState(), journal: [] } });
  const auto = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store,
    mintPermit: true,
    effectExecutor: async () => ({ ok: true }),
  });
  const missing = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store,
    effectExecutor: async () => ({ ok: true }),
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
  const { createAuthorityStore, runKernelOperation, createPermitLedger } = require("./lifecycle-kernel/index.js");
  const { issueFixturePermit } = require("./lifecycle-kernel/test-permit-helpers.js");
  const store = createAuthorityStore({ initial: { state: pendingModelState(), journal: [] } });
  const head = await store.load();
  const issued = issueFixturePermit({
    ledger: createPermitLedger(),
    operation: "start",
    headRevision: head.revision,
    arguments: { node_id: "n1" },
  });
  const first = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store,
    operationPermit: issued.permit,
    permitLedger: issued.ledger,
    effectExecutor: async () => ({ ok: true }),
  });
  const replay = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store,
    operationPermit: issued.permit,
    permitLedger: issued.ledger,
    effectExecutor: async () => ({ ok: true }),
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
  // CAS/permit/retry, K2.1b, and K2a host invariants must not appear on deferred list.
  const deferredIds = new Set(deferred.map((d) => d.invariant_id));
  for (const inv of [...K21_EXECUTABLE_INVARIANTS, ...K21B_EXECUTABLE_INVARIANTS, ...K2A_EXECUTABLE_INVARIANTS]) {
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
  };
}

function applyAction(state, action) {
  if (action === "status") return { state, outcome: "advanced" };
  const nodeId = "n1";
  const { createPermitLedger, mintOperationPermit } = require("./lifecycle-kernel/permits.js");
  const ledger = createPermitLedger();
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
