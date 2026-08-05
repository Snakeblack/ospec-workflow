"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  runHarnessScenario,
  snapshotRoundTrip,
  assertPublicApiConformance,
  reduceLifecycle,
} = (() => {
  const harness = require("./minimal-kernel-harness.js");
  const kernel = require("./lifecycle-kernel/index.js");
  return { ...harness, reduceLifecycle: kernel.reduceLifecycle };
})();

const pendingState = {
  schema_version: 1,
  status: "ready",
  nodes: { n1: { id: "n1", phase: "pending", attempt: 0 } },
};

test("assertPublicApiConformance rejects reducer-only evidence", () => {
  assert.throws(
    () =>
      assertPublicApiConformance({
        usedRunKernelOperation: false,
        usedReducerOnly: true,
      }),
    (error) => error.code === "harness-conformance-incomplete"
  );
  assert.equal(typeof reduceLifecycle, "function");
  assert.doesNotThrow(() =>
    assertPublicApiConformance({
      usedRunKernelOperation: true,
      usedReducerOnly: true,
    })
  );
});

test("harness executes start through public kernel API", async () => {
  const result = await runHarnessScenario({
    id: "start-n1",
    initialState: pendingState,
    operations: [{ operation: "start", arguments: { node_id: "n1" } }],
  });
  assert.equal(result.scenario_id, "start-n1");
  assert.equal(result.snapshot.state.nodes.n1.phase, "started");
  assert.ok(result.effects.length >= 1);
  assert.match(result.final_state_digest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(result.next_transition.operation, "complete");
});

test("harness halts on decide without auto-approval", async () => {
  const result = await runHarnessScenario({
    id: "decide-halt",
    initialState: {
      schema_version: 1,
      status: "blocked",
      nodes: { n1: { id: "n1", phase: "failed", attempt: 3, exhausted: true } },
    },
    operations: [{ operation: "status" }],
  });
  assert.equal(result.outcome, "decision-required");
  assert.equal(result.halted.reason, "decision-required");
  assert.equal(result.halted.decision.kind, "decide");
  assert.equal(result.next_transition.kind, "decide");
  // Must not invent an approval operation.
  assert.ok(!result.operations.some((op) => op.operation === "approve"));
});

test("snapshot round-trip preserves digest and transitions", async () => {
  const started = await runHarnessScenario({
    id: "snap-prep",
    initialState: pendingState,
    operations: [{ operation: "start", arguments: { node_id: "n1" } }],
  });
  const round = await snapshotRoundTrip(started.snapshot.state, started.snapshot.journal);
  assert.equal(round.ok, true);
  assert.equal(round.before_digest, round.after_digest);
  assert.equal(
    JSON.stringify(round.before_transitions),
    JSON.stringify(round.after_transitions)
  );
});

test("completed effect is not duplicated on resume after interrupt marker", async () => {
  const effectIds = [];
  const first = await runHarnessScenario({
    id: "interrupt-prep",
    initialState: pendingState,
    operations: [{ operation: "start", arguments: { node_id: "n1" } }],
    effectExecutor: async (effect) => {
      effectIds.push(effect.effect_id);
      return { ok: true };
    },
  });
  assert.equal(effectIds.length, 1);

  // Resume with journal already containing completed effect: reconciliation skips re-exec.
  const resumedEffects = [];
  const resumed = await runHarnessScenario({
    id: "interrupt-resume",
    initialState: first.snapshot.state,
    initialJournal: first.snapshot.journal,
    operations: [{ operation: "complete", arguments: { node_id: "n1" } }],
    effectExecutor: async (effect) => {
      resumedEffects.push(effect.effect_id);
      return { ok: true };
    },
  });
  assert.equal(resumed.snapshot.state.nodes.n1.phase, "completed");
  // New complete effect executes once; prior start effect is not replayed.
  assert.equal(resumedEffects.length, 1);
  assert.notEqual(resumedEffects[0], effectIds[0]);
});

test("interruption matrix: before-journal leaves state and journal untouched", async () => {
  const executed = [];
  const result = await runHarnessScenario({
    id: "interrupt-before-journal",
    initialState: pendingState,
    operations: [{ operation: "start", arguments: { node_id: "n1" } }],
    checkpointInterrupt: "before-journal",
    effectExecutor: async (effect) => {
      executed.push(effect.effect_id);
      return { ok: true };
    },
  });
  assert.equal(result.halted.reason, "interrupt");
  assert.equal(result.halted.at, "before-journal");
  assert.equal(executed.length, 0);
  assert.equal(result.snapshot.state.nodes.n1.phase, "pending");
  assert.equal(result.snapshot.journal.length, 0);
});

test("harness: effectExecutor {ok:false} halts blocked without advancing state", async () => {
  const result = await runHarnessScenario({
    id: "effect-failed-ok-false",
    initialState: pendingState,
    operations: [{ operation: "start", arguments: { node_id: "n1" } }],
    effectExecutor: async () => ({ ok: false, reason: "denied" }),
  });
  assert.equal(result.halted.reason, "blocked");
  assert.equal(result.halted.code, "effect-failed");
  assert.equal(result.snapshot.state.nodes.n1.phase, "pending");
  assert.equal(result.snapshot.journal[0].status, "failed");
  assert.notEqual(result.outcome, "advanced");
});

test("interruption matrix: after-journal before effect persists started and does not mutate state", async () => {
  const executed = [];
  const result = await runHarnessScenario({
    id: "interrupt-after-journal",
    initialState: pendingState,
    operations: [{ operation: "start", arguments: { node_id: "n1" } }],
    checkpointInterrupt: "after-journal",
    effectExecutor: async (effect) => {
      executed.push(effect.effect_id);
      return { ok: true };
    },
  });
  assert.equal(result.halted.at, "after-journal");
  assert.equal(executed.length, 0);
  assert.equal(result.snapshot.state.nodes.n1.phase, "pending");
  assert.equal(result.snapshot.journal.length, 1);
  assert.equal(result.snapshot.journal[0].status, "started");

  const resumedExec = [];
  const resumed = await runHarnessScenario({
    id: "resume-after-journal",
    initialState: result.snapshot.state,
    initialJournal: result.snapshot.journal,
    operations: [{ operation: "start", arguments: { node_id: "n1" } }],
    effectExecutor: async (effect) => {
      resumedExec.push(effect.effect_id);
      return { ok: true };
    },
  });
  assert.equal(resumedExec.length, 1);
  assert.equal(resumed.snapshot.state.nodes.n1.phase, "started");
});

test("interruption matrix: after-effect before state commit does not re-execute on resume", async () => {
  const executed = [];
  const interrupted = await runHarnessScenario({
    id: "interrupt-after-effect",
    initialState: pendingState,
    operations: [{ operation: "start", arguments: { node_id: "n1" } }],
    checkpointInterrupt: "after-effect",
    effectExecutor: async (effect) => {
      executed.push(effect.effect_id);
      return { ok: true };
    },
  });
  assert.equal(interrupted.halted.at, "after-effect");
  assert.equal(executed.length, 1);
  assert.equal(interrupted.snapshot.state.nodes.n1.phase, "pending");
  assert.equal(interrupted.snapshot.journal[0].status, "completed");

  const resumedExec = [];
  const resumed = await runHarnessScenario({
    id: "resume-after-effect",
    initialState: interrupted.snapshot.state,
    initialJournal: interrupted.snapshot.journal,
    operations: [{ operation: "start", arguments: { node_id: "n1" } }],
    effectExecutor: async (effect) => {
      resumedExec.push(effect.effect_id);
      return { ok: true };
    },
  });
  assert.equal(resumedExec.length, 0);
  assert.equal(resumed.snapshot.state.nodes.n1.phase, "started");
  // Converges to the same digest as an uninterrupted start.
  const clean = await runHarnessScenario({
    id: "clean-start",
    initialState: pendingState,
    operations: [{ operation: "start", arguments: { node_id: "n1" } }],
  });
  assert.equal(resumed.final_state_digest, clean.final_state_digest);
});

test("named execute and recover fixtures are invoked through the harness", async () => {
  const invoked = [];
  const start = await runHarnessScenario({
    id: "fixture-execute-start",
    initialState: pendingState,
    operations: [{ operation: "start", arguments: { node_id: "n1" } }],
    effectExecutor: async (effect) => {
      invoked.push({ op: "start", effect_id: effect.effect_id });
      return { ok: true };
    },
  });
  assert.ok(invoked.some((entry) => entry.op === "start"));

  const failState = {
    schema_version: 1,
    status: "blocked",
    nodes: { n1: { id: "n1", phase: "failed", attempt: 1 } },
  };
  const recover = await runHarnessScenario({
    id: "fixture-execute-recover",
    initialState: failState,
    operations: [{ operation: "recover", arguments: { node_id: "n1" } }],
    effectExecutor: async (effect) => {
      invoked.push({ op: "recover", effect_id: effect.effect_id });
      return { ok: true };
    },
  });
  assert.equal(recover.snapshot.state.nodes.n1.phase, "pending");
  assert.ok(invoked.some((entry) => entry.op === "recover"));
  assert.notEqual(recover.final_state_digest, require("./lifecycle-kernel/state-digest.js").digestLifecycleState(failState));
  assert.equal(start.snapshot.state.nodes.n1.phase, "started");
});

test("K2.1 fault matrix: CAS conflict via public API — one winner, budgets unchanged", async () => {
  const { runCasConflictFault } = require("./minimal-kernel-harness.js");
  const result = await runCasConflictFault({ id: "fault:cas-conflict" });
  assert.equal(result.winner_ok, true);
  assert.equal(result.loser_ok, false);
  assert.equal(result.loser_code, "cas-conflict");
  assert.equal(result.budgets_unchanged, true);
});

test("K2.1 fault matrix: stale permit fails closed; head unchanged", async () => {
  const { createPermitLedger, mintOperationPermit } = require("./lifecycle-kernel/permits.js");
  const { createAuthorityStore, runKernelOperation } = require("./minimal-kernel-harness.js");
  const store = createAuthorityStore({ initial: { state: pendingState } });
  const before = await store.load();
  const ledger = createPermitLedger();
  const stale = mintOperationPermit({
    ledger,
    operation: "start",
    expected_revision: "sha256:not-the-head",
  });
  const result = await runKernelOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    store,
    mintPermit: false,
    operationPermit: stale,
    permitLedger: ledger,
    effectExecutor: async () => ({ ok: true }),
  });
  assert.equal(result.outcome, "blocked");
  assert.equal(result.code, "stale-permit");
  assert.equal((await store.load()).revision, before.revision);
});

test("K2.1 fault matrix: permit reuse fails; no second advance", async () => {
  const first = await runHarnessScenario({
    id: "fault:permit-reuse-prep",
    initialState: pendingState,
    operations: [{ operation: "start", arguments: { node_id: "n1" } }],
  });
  assert.equal(first.snapshot.state.nodes.n1.phase, "started");

  const { createPermitLedger, mintOperationPermit, consumePermit } = require("./lifecycle-kernel/permits.js");
  const { runKernelOperation } = require("./minimal-kernel-harness.js");
  const ledger = createPermitLedger();
  const head = first.revision;
  const permit = mintOperationPermit({
    ledger,
    operation: "complete",
    expected_revision: head,
  });
  consumePermit({
    permit_id: permit.permit_id,
    ledger,
    subject_id: "lifecycle:default",
    operation: "complete",
    revision: head,
    outcome: "advanced",
  });
  const beforeDigest = first.final_state_digest;
  const reuse = await runKernelOperation({
    operation: "complete",
    arguments: { node_id: "n1" },
    store: first.store,
    mintPermit: false,
    operationPermit: permit,
    permitLedger: ledger,
    effectExecutor: async () => ({ ok: true }),
  });
  assert.equal(reuse.outcome, "blocked");
  assert.equal(reuse.code, "permit-reuse");
  assert.equal(reuse.state_digest, beforeDigest);
});

test("K2.1 fault matrix: ambiguous irreversible → decide|stop; no auto-retry", async () => {
  const result = await runHarnessScenario({
    id: "fault:irreversible-ambiguous",
    initialState: pendingState,
    irreversibleAmbiguousNext: "decide",
    effect_class: "irreversible",
    operations: [{ operation: "start", arguments: { node_id: "n1" } }],
    effectExecutor: async () => ({ ok: true, ambiguous: true, next_kind: "decide" }),
  });
  assert.equal(result.outcome, "decision-required");
  assert.equal(result.halted.reason, "decision-required");
  assert.equal(result.halted.decision.kind, "decide");
  assert.equal(result.halted.decision.not_code_defect, true);
  assert.equal(result.snapshot.state.nodes.n1.phase, "pending");
});

test("K2.1 fixed-policy control-path remains green under K2.1 enforcement", async () => {
  const fixed = await runHarnessScenario({
    id: "fixed-policy-control",
    initialState: pendingState,
    operations: [{ operation: "start", arguments: { node_id: "n1" } }],
  });
  assert.equal(fixed.snapshot.state.nodes.n1.phase, "started");
  assert.equal(fixed.halted, null);
  assert.equal(fixed.operations[0].outcome, "advanced");
});

test("K2a: harness peers with Headless Conformance Host for host-fault scenarios", async () => {
  const { peerHostFaultMatrix, getHarnessKind, HARNESS_KIND } = require("./minimal-kernel-harness.js");
  const { createClaudeHostAdapter } = require("./host-adapters/claude.js");
  const { KIND } = require("./headless-conformance-host.js");
  assert.equal(getHarnessKind(), HARNESS_KIND);
  assert.notEqual(HARNESS_KIND, KIND);

  const peer = await peerHostFaultMatrix({ adapter: createClaudeHostAdapter() });
  assert.equal(peer.fault_driver, "headless-conformance-host");
  assert.equal(peer.owns_host_policy, false);
  assert.equal(peer.owns_capability_proof_issuance, false);
  assert.equal(peer.matrix.pass, true);
  assert.deepEqual(peer.matrix.faults_covered, ["timeout", "cancel", "worker-fail", "interrupt"]);
});

test("K2a: harness-alone host-fault coverage remains incomplete without headless peer (W4)", () => {
  const {
    evaluateHarnessAloneHostFaultCoverage,
    HARNESS_KIND,
  } = require("./minimal-kernel-harness.js");

  // Only Minimal Kernel Harness fixtures — no Headless Conformance Host peer wired.
  const alone = evaluateHarnessAloneHostFaultCoverage({
    peer_wired: false,
    fault_driver: null,
    faults_exercised: [],
  });
  assert.equal(alone.complete, false);
  assert.equal(alone.reason_code, "host-fault-coverage-incomplete");
  assert.equal(alone.peer_wired, false);
  assert.equal(alone.harness_kind, HARNESS_KIND);

  // Must not pass by stubbing incompleteness away.
  assert.notEqual(alone.complete, true);
});

test("K2a: fixed-policy and K2.1 authority fixtures remain green with host-contract ports available", async () => {
  const { createClaudeHostAdapter } = require("./host-adapters/claude.js");
  const adapter = createClaudeHostAdapter();
  assert.ok(adapter.transports.ExecutionTransport);

  const fixed = await runHarnessScenario({
    id: "fixed-policy-control-k2a",
    initialState: pendingState,
    operations: [{ operation: "start", arguments: { node_id: "n1" } }],
  });
  assert.equal(fixed.snapshot.state.nodes.n1.phase, "started");

  const cas = await require("./minimal-kernel-harness.js").runCasConflictFault({
    id: "fault:cas-conflict-k2a",
  });
  assert.equal(cas.winner_ok, true);
  assert.equal(cas.loser_ok, false);
  assert.equal(cas.loser_code, "cas-conflict");
});

test("K2.1b: positive companion issues permit via controlled issuer (mintPermit default false)", async () => {
  const positive = await runHarnessScenario({
    id: "k21b-issuer-first-positive",
    initialState: pendingState,
    operations: [{ operation: "start", arguments: { node_id: "n1" } }],
  });
  assert.equal(positive.snapshot.state.nodes.n1.phase, "started");
  assert.ok(positive.operations[0].operation_permit_id);
  assert.ok(positive.operations[0].operation_receipt);
  assert.equal(
    positive.snapshot.authority.permits[positive.operations[0].operation_permit_id].status,
    "consumed"
  );
});

test("K2.1b: auto-mint convenience does not count as positive authorization", async () => {
  const auto = await runHarnessScenario({
    id: "k21b-auto-mint-not-positive",
    initialState: pendingState,
    operations: [{ operation: "start", arguments: { node_id: "n1" }, mintPermit: true }],
  });
  assert.equal(auto.outcome, "blocked");
  assert.equal(auto.halted.code, "auto-mint-disabled");
});

test("K2.1b: atomic consume revision inspection via public harness", async () => {
  const result = await runHarnessScenario({
    id: "k21b-atomic-consume",
    initialState: pendingState,
    operations: [{ operation: "start", arguments: { node_id: "n1" } }],
  });
  const permitId = result.operations[0].operation_permit_id;
  const receipt = result.operations[0].operation_receipt;
  assert.equal(result.snapshot.state.nodes.n1.phase, "started");
  assert.ok(Array.isArray(result.snapshot.journal));
  assert.equal(result.snapshot.authority.permits[permitId].status, "consumed");
  assert.equal(result.snapshot.authority.receipts[permitId].receipt_id, receipt.receipt_id);
});

test("K2.1b: exact replay receipt stability via public entrypoint", async () => {
  const { createAuthorityStore, runKernelOperation } = require("./minimal-kernel-harness.js");
  const { issueFixturePermit, createPermitLedger } = require("./lifecycle-kernel/test-permit-helpers.js");
  const store = createAuthorityStore({ initial: { state: pendingState, journal: [] } });
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
  assert.equal(replay.operation_receipt.receipt_id, first.operation_receipt.receipt_id);
  assert.equal(replay.replayed, true);
});

test("K2.1b: in-process restart keeps consumed permit and receipt verifiable", async () => {
  const { createAuthorityStore } = require("./minimal-kernel-harness.js");
  const first = await runHarnessScenario({
    id: "k21b-restart-prep",
    initialState: pendingState,
    operations: [{ operation: "start", arguments: { node_id: "n1" } }],
  });
  const permitId = first.operations[0].operation_permit_id;
  const receiptId = first.operations[0].operation_receipt.receipt_id;
  const restored = createAuthorityStore({ initial: first.snapshot });
  const loaded = await restored.load();
  assert.equal(loaded.authority.permits[permitId].status, "consumed");
  assert.equal(loaded.authority.receipts[permitId].receipt_id, receiptId);
});
