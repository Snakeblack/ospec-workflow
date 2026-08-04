"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  observeHostPort,
  resolveHostCapability,
  requirePermitCasAfterHostFault,
  transitionInputsEquivalent,
} = require("./host-boundary.js");
const { createEvidenceDigest } = require("../capability-proof/index.js");
const { createAuthorityStore, runKernelOperation } = require("./index.js");

function proofFor(cap) {
  const evidence = { cap };
  const adapter_version = "1.0.0";
  const host_version = "k2a-host/1";
  const fixture = `f/${cap}.json`;
  return {
    proof: {
      schema_version: 1,
      kind: "capability-proof/v1",
      adapter_version,
      host_version,
      fixture,
      evidence_digest: createEvidenceDigest({
        capability_id: cap,
        adapter_version,
        host_version,
        fixture,
        evidence,
      }),
    },
    evidence,
  };
}

test("transition selection uses port outcomes, not concrete host product id", () => {
  const left = { status: "ready", port_outcome: "ok", host_product_id: "claude" };
  const right = { status: "ready", port_outcome: "ok", host_product_id: "codex" };
  assert.equal(transitionInputsEquivalent(left, right), true);

  const transports = {
    ExecutionTransport: { invoke: () => ({ ok: true, outcome: "ok", value: 1 }) },
  };
  const a = observeHostPort({ transports, port: "ExecutionTransport" });
  const b = observeHostPort({ transports, port: "ExecutionTransport" });
  assert.deepEqual(a, b);

  const { proof, evidence } = proofFor("ExecutionTransport");
  const claude = resolveHostCapability({
    capability_id: "ExecutionTransport",
    declared_state: "enforced",
    proof,
    semantic_evidence: evidence,
    host_product_id: "claude",
  });
  const other = resolveHostCapability({
    capability_id: "ExecutionTransport",
    declared_state: "enforced",
    proof,
    semantic_evidence: evidence,
    host_product_id: "cursor",
  });
  assert.equal(claude.enforced, other.enforced);
  assert.equal(claude.effective_state, other.effective_state);
});

test("host port failure does not bypass permit+CAS requirements", async () => {
  const fault = observeHostPort({
    transports: {
      ExecutionTransport: { invoke: () => ({ ok: false, outcome: "timeout", code: "host-fault-timeout" }) },
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
  // After fault, mutation still needs the normal kernel path (permit+CAS).
  const result = await runKernelOperation({
    operation: "status",
    arguments: {},
    store,
    mintPermit: true,
  });
  assert.ok(result);
  assert.equal(result.outcome === "advanced" || result.outcome === "ready" || typeof result.state_digest === "string", true);
  assert.ok(!result.code || result.code !== "host-local-mutation");
});
