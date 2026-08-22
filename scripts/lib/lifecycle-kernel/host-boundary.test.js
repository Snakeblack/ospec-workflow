"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  observeHostPort,
  resolveHostCapability,
  requirePermitCasAfterHostFault,
  transitionInputsEquivalent,
} = require("./host-boundary.js");
const { createEvidenceDigest, createProbeDigest } = require("../capability-proof/index.js");
const { createAuthorityStore, createKernelRuntime } = require("./index.js");

function proofFor(cap) {
  const evidence = { cap };
  const adapter_id = "claude";
  const adapter_version = "1.0.0";
  const host_version = "k2a-host/1";
  const fixture = `f/${cap}.json`;
  const evidence_digest = createEvidenceDigest({
    capability_id: cap,
    adapter_version,
    host_version,
    fixture,
    evidence,
  });
  const probe_digest = createProbeDigest({
    capability_id: cap,
    adapter_id,
    adapter_version,
    host_version,
    probe: { live: true, cap },
  });
  return {
    proof: {
      schema_version: 1,
      kind: "capability-proof/v1",
      adapter_id,
      adapter_version,
      host_version,
      fixture,
      evidence_digest,
      probe_digest,
    },
    evidence,
    expected: {
      expectedAdapterId: adapter_id,
      expectedAdapterVersion: adapter_version,
      expectedHostRuntimeVersion: host_version,
      expectedProbeDigest: probe_digest,
    },
  };
}

test("transition selection uses port outcomes, not concrete host product id", async () => {
  const left = { status: "ready", port_outcome: "ok", host_product_id: "claude" };
  const right = { status: "ready", port_outcome: "ok", host_product_id: "codex" };
  assert.equal(transitionInputsEquivalent(left, right), true);

  const transports = {
    ExecutionTransport: { invoke: async () => ({ ok: true, outcome: "ok", value: 1 }) },
  };
  const a = await observeHostPort({ transports, port: "ExecutionTransport" });
  const b = await observeHostPort({ transports, port: "ExecutionTransport" });
  assert.equal(a.ok, b.ok);
  assert.equal(a.outcome, b.outcome);

  const { proof, evidence, expected } = proofFor("ExecutionTransport");
  const claude = resolveHostCapability({
    capability_id: "ExecutionTransport",
    declared_state: "enforced",
    proof,
    semantic_evidence: evidence,
    host_product_id: "claude",
    ...expected,
  });
  const other = resolveHostCapability({
    capability_id: "ExecutionTransport",
    declared_state: "enforced",
    proof,
    semantic_evidence: evidence,
    host_product_id: "cursor",
    ...expected,
  });
  assert.equal(claude.enforced, other.enforced);
  assert.equal(claude.effective_state, other.effective_state);
});

test("host port failure does not bypass permit+CAS requirements", async () => {
  const fault = await observeHostPort({
    transports: {
      ExecutionTransport: {
        invoke: async () => ({ ok: false, outcome: "timeout", code: "host-fault-timeout", failure_class: "timeout" }),
      },
    },
    port: "ExecutionTransport",
  });
  assert.equal(fault.ok, false);
  const gate = requirePermitCasAfterHostFault(fault);
  assert.equal(gate.host_local_mutation_allowed, false);
  assert.equal(gate.requires_operation_permit, true);
  assert.equal(gate.requires_cas, true);

  const store = createAuthorityStore({
    subjectId: "lifecycle:default",
    initial: {
      state: {
        schema_version: 1,
        status: "ready",
        nodes: { n1: { id: "n1", phase: "pending", attempt: 0 } },
      },
      journal: [],
    },
  });
  const result = await createKernelRuntime({ store }).getStatus();
  assert.ok(result);
  assert.equal(result.outcome === "advanced" || result.outcome === "ready" || typeof result.state_digest === "string", true);
  assert.ok(!result.code || result.code !== "host-local-mutation");
});

test("rejected transport Promise is observed as ok:false; no authority mint", async () => {
  const rejected = await observeHostPort({
    transports: {
      ExecutionTransport: {
        invoke: async () => {
          throw Object.assign(new Error("port reject"), { code: "reject-x" });
        },
      },
    },
    port: "ExecutionTransport",
    requestId: "obs-1",
  });
  assert.equal(rejected.ok, false);
  assert.notEqual(rejected.ok, true);
  assert.equal(rejected.requestId, "obs-1");

  const gate = requirePermitCasAfterHostFault(rejected);
  assert.equal(gate.host_local_mutation_allowed, false);
  assert.equal(gate.requires_operation_permit, true);
  assert.equal(gate.requires_cas, true);
});

test("REQ-failure-recovery-002 / REQ-failure-recovery-003: observeHostPort and requirePermitCasAfterHostFault normalize composite failures via resolvePrimaryFailure", async () => {
  const result = await observeHostPort({
    transports: {
      ExecutionTransport: {
        invoke: async () => ({
          ok: false,
          outcome: "error",
          failures: [
            { category: "code_defect", code: "TEST_FAILED", priority: 5 },
            { category: "environment_tooling", code: "TOOL_CRASH", priority: 1 },
          ],
        }),
      },
    },
    port: "ExecutionTransport",
  });

  assert.equal(result.ok, false);
  assert.ok(result.primary_failure, "primary_failure must be populated via resolvePrimaryFailure");
  assert.equal(result.primary_failure.category, "environment_tooling", "environment_tooling must have highest priority");
  assert.equal(result.category, "environment_tooling");

  const gate = requirePermitCasAfterHostFault(result);
  assert.equal(gate.category, "environment_tooling");
  assert.equal(gate.primary_failure.category, "environment_tooling");
});
