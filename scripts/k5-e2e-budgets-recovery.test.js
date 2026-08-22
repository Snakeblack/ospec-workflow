"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createAuthorityStore,
  createKernelRuntime,
  DEFAULT_SUBJECT_ID,
  hostBoundary,
} = require("./lib/lifecycle-kernel/index.js");
const { resolvePrimaryFailure } = require("./lib/causal-failure.js");

test("E2E 1: CAS retry with pre-persisted journal generates exactly 0 additional effectExecutor calls [REQ-authority-store-011, REQ-execution-budgets-003]", async () => {
  const initial = {
    schema_version: 1,
    status: "ready",
    nodes: {
      n1: {
        id: "n1",
        phase: "pending",
        attempt: 0,
        budget: { schema_version: 1, turns: 10, commands: 20 },
      },
    },
    authority_budget: { schema_version: 1, effect_attempts: 5 },
  };

  const store = createAuthorityStore({ initial: { state: initial, journal: [] } });
  const runtime = createKernelRuntime({ store });
  const head0 = await store.load();

  const permit1 = runtime.issuePermitForSelectedTransition({
    operation: "start",
    expected_revision: head0.revision,
    arguments: { node_id: "n1" },
  });
  assert.equal(permit1.ok, true);

  let effectExecutorCalls = 0;

  // Writer 1 (loser): executes effect, persists journal, but suffers CAS conflict because Writer 2 commits first
  const loserResult = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: permit1.permit,
    effectExecutor: async (effect) => {
      effectExecutorCalls++;
      // Rival writer (Writer 2) advances head concurrently
      const currentHead = await store.load();
      await store.compareAndSwap(
        DEFAULT_SUBJECT_ID,
        currentHead.revision,
        {
          ...initial,
          version_tag: "writer2_commit",
          nodes: { n1: { id: "n1", phase: "pending", attempt: 0 } },
        },
        []
      );
      return {
        ok: true,
        usage: { turns: 1, commands: 2, effect_attempts: 1 },
      };
    },
  });

  assert.equal(loserResult.outcome, "blocked");
  assert.equal(loserResult.code, "cas-conflict");
  assert.equal(effectExecutorCalls, 1, "Effect executor must have been called exactly once on first attempt");

  // Writer 1 retries under the new live head revision
  const head1 = await store.load();
  const permitRetry = runtime.issuePermitForSelectedTransition({
    operation: "start",
    expected_revision: head1.revision,
    arguments: { node_id: "n1" },
  });
  assert.equal(permitRetry.ok, true);

  const retryResult = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: permitRetry.permit,
    effectExecutor: async () => {
      effectExecutorCalls++;
      return { ok: true, usage: { turns: 1 } };
    },
  });

  assert.equal(retryResult.outcome, "advanced");
  // Effect must be skipped via journal reconciliation (action: skip)
  assert.equal(
    effectExecutorCalls,
    1,
    "Retry must generate exactly 0 additional effectExecutor calls due to journal reconciliation"
  );
});

test("E2E 2: Partitioned carry-over by ${subjectId}:${nodeId} isolates budgets across concurrent nodes [REQ-execution-budgets-003, REQ-operation-permits-005]", async () => {
  const initial = {
    schema_version: 1,
    status: "ready",
    nodes: {
      n1: {
        id: "n1",
        phase: "pending",
        attempt: 0,
        budget: { schema_version: 1, turns: 5, commands: 10 },
      },
      n2: {
        id: "n2",
        phase: "pending",
        attempt: 0,
        budget: { schema_version: 1, turns: 5, commands: 10 },
      },
    },
    authority_budget: { schema_version: 1, effect_attempts: 10 },
  };

  const store = createAuthorityStore({ initial: { state: initial, journal: [] } });
  const runtime = createKernelRuntime({ store });
  const head0 = await store.load();

  // Issue permit for n1
  const permitN1 = runtime.issuePermitForSelectedTransition({
    operation: "start",
    expected_revision: head0.revision,
    arguments: { node_id: "n1" },
  });
  assert.equal(permitN1.ok, true);

  // n1 suffers a CAS conflict and leaves carry-over (turns: 1, commands: 4)
  const resN1 = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: permitN1.permit,
    effectExecutor: async () => {
      const currentHead = await store.load();
      await store.compareAndSwap(
        DEFAULT_SUBJECT_ID,
        currentHead.revision,
        { ...initial, tag: "concurrent_advance" },
        []
      );
      return { ok: true, usage: { turns: 1, commands: 4, effect_attempts: 1 } };
    },
  });
  assert.equal(resN1.outcome, "blocked");
  assert.equal(resN1.code, "cas-conflict");

  // Now n2 issues permit and executes under updated head
  const head1 = await store.load();
  const permitN2 = runtime.issuePermitForSelectedTransition({
    operation: "start",
    expected_revision: head1.revision,
    arguments: { node_id: "n2" },
  });
  assert.equal(permitN2.ok, true, "Permit for n2 must not be blocked by n1 carry-over");

  const resN2 = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n2" },
    operationPermit: permitN2.permit,
    effectExecutor: async () => ({ ok: true, usage: { turns: 1, commands: 1 } }),
  });
  assert.equal(resN2.outcome, "advanced");

  const head2 = await store.load();
  // n2 budget must only have decremented by its own turn (5 - 1 = 4 turns)
  assert.equal(head2.state.nodes.n2.budget.turns, 4, "n2 budget must reflect only n2 execution");
  assert.equal(head2.state.nodes.n1.budget.turns, 5, "n1 budget on store remains unchanged after n2 commit");

  // Now n1 retries under head2
  const permitN1Retry = runtime.issuePermitForSelectedTransition({
    operation: "start",
    expected_revision: head2.revision,
    arguments: { node_id: "n1" },
  });
  assert.equal(permitN1Retry.ok, true);

  const resN1Retry = await runtime.runOperation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: permitN1Retry.permit,
    effectExecutor: async () => ({ ok: true, usage: { turns: 1 } }),
  });
  assert.equal(resN1Retry.outcome, "advanced");

  const headFinal = await store.load();
  // n1 budget now incorporates n1 carry-over (5 - 1 carry-over - 1 operation turn = 3 turns, 10 - 4 commands = 6 commands)
  assert.equal(headFinal.state.nodes.n1.budget.turns, 3);
  assert.equal(headFinal.state.nodes.n1.budget.commands, 6);
  assert.equal(headFinal.state.nodes.n2.budget.turns, 4);
});

test("E2E 3: Host boundary normalizes multi-transport failure outcomes via resolvePrimaryFailure [REQ-failure-recovery-002, REQ-failure-recovery-003]", async () => {
  const fault = await hostBoundary.observeHostPort({
    transports: {
      ExecutionTransport: {
        invoke: async () => ({
          ok: false,
          outcome: "error",
          failures: [
            { category: "validation_gap", code: "SCHEMA_MISMATCH", priority: 4 },
            { category: "environment_tooling", code: "TOOL_EXIT_1", priority: 1 },
            { category: "code_defect", code: "SYNTAX_ERROR", priority: 5 },
          ],
        }),
      },
    },
    port: "ExecutionTransport",
  });

  assert.equal(fault.ok, false);
  assert.equal(fault.category, "environment_tooling", "environment_tooling (priority 1) must be selected as primary");
  assert.equal(fault.primary_failure.code, "TOOL_EXIT_1");

  const gate = hostBoundary.requirePermitCasAfterHostFault(fault);
  assert.equal(gate.host_local_mutation_allowed, false);
  assert.equal(gate.requires_operation_permit, true);
  assert.equal(gate.requires_cas, true);
  assert.equal(gate.category, "environment_tooling");
});
