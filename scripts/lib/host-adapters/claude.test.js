"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createClaudeHostAdapter,
  getClaudeProofMaterial,
  verifyAllClaudeEnforcedProofs,
  getProbeObservations,
  ADAPTER_ID,
  ADAPTER_VERSION,
  HOST_VERSION,
  TRANSPORT_CAPABILITIES,
} = require("./claude.js");
const { resolveCapabilityState, invokeTransportAsync } = require("../host-contract/index.js");
const { createProbeDigest } = require("../capability-proof/index.js");

const ALL_PRIMITIVES = Object.freeze({
  execute: () => ({ ran: true }),
  askUserQuestion: (q) => ({ answered: true, q }),
  worker: () => ({ spawned: true }),
  tool: () => ({ tool: "Bash" }),
  hooksObserve: () => ({ hook: "Stop", authorized: false }),
});

test("missing primitive degrades honestly — never enforced", async () => {
  const adapter = await createClaudeHostAdapter();
  for (const name of TRANSPORT_CAPABILITIES) {
    assert.ok(adapter.transports[name]);
    assert.notEqual(adapter.capabilities[name], "enforced", name);
    assert.ok(
      ["unavailable", "instructional", "partial"].includes(adapter.capabilities[name]),
      name
    );
  }
});

test("fixture-only proof without executed probe must not mark enforced", async () => {
  const adapter = await createClaudeHostAdapter({
    primitives: {
      askUserQuestion: (q) => ({ answered: true, q }),
      hooksObserve: () => ({ hook: "Stop", authorized: false }),
    },
  });
  // Primitives present → probes execute → those two may be enforced; others not.
  assert.notEqual(adapter.capabilities.ExecutionTransport, "enforced");
  assert.notEqual(adapter.capabilities.WorkerTransport, "enforced");

  const fixtureOnly = await verifyAllClaudeEnforcedProofs();
  assert.equal(fixtureOnly.ok, false);
  assert.equal(fixtureOnly.reason_code, "fixture-only-not-live-probe");
});

test("executed live probe + verified proof enables enforced", async () => {
  const adapter = await createClaudeHostAdapter({ primitives: ALL_PRIMITIVES });
  for (const name of TRANSPORT_CAPABILITIES) {
    assert.equal(adapter.capabilities[name], "enforced", name);
  }

  const material = await getClaudeProofMaterial({ primitives: ALL_PRIMITIVES });
  const obs = getProbeObservations(adapter);
  assert.ok(obs.QuestionTransport);
  assert.equal(
    material.QuestionTransport.expectedProbeDigest,
    obs.QuestionTransport.expectedProbeDigest
  );

  const independent = createProbeDigest({
    capability_id: "QuestionTransport",
    adapter_id: ADAPTER_ID,
    adapter_version: ADAPTER_VERSION,
    host_version: HOST_VERSION,
    probe: obs.QuestionTransport.observation,
  });
  assert.equal(material.QuestionTransport.expectedProbeDigest, independent);
  assert.equal(material.QuestionTransport.proof.probe_digest, independent);

  const resolved = resolveCapabilityState({
    capability_id: "QuestionTransport",
    declared_state: "enforced",
    proof: material.QuestionTransport.proof,
    semantic_evidence: material.QuestionTransport.evidence,
    expectedAdapterId: ADAPTER_ID,
    expectedAdapterVersion: ADAPTER_VERSION,
    expectedHostRuntimeVersion: HOST_VERSION,
    expectedProbeDigest: material.QuestionTransport.expectedProbeDigest,
  });
  assert.equal(resolved.enforced, true);
  assert.equal((await verifyAllClaudeEnforcedProofs({ primitives: ALL_PRIMITIVES })).ok, true);

  const q = await adapter.transports.QuestionTransport.invoke({ prompt: "continue?" });
  assert.equal(q.value.answered, true);
});

test("CRITICAL: declarative liveProbes without execution never yield enforced", async () => {
  const liveProbes = {};
  for (const id of TRANSPORT_CAPABILITIES) {
    liveProbes[id] = { live: true, capability_id: id, fabricated: true };
  }
  const adapter = await createClaudeHostAdapter({ liveProbes });
  for (const name of Object.keys(liveProbes)) {
    assert.notEqual(adapter.capabilities[name], "enforced", name);
  }
});

test("CRITICAL: noop primitive + declarative liveProbes does NOT yield enforced without real observation path — probes still execute", async () => {
  // Noop primitives that return successfully WILL pass executed probes (observation-based).
  // The adversarial case is declarative liveProbes WITHOUT invoking primitives for the digest.
  const withDeclarativeOnly = await createClaudeHostAdapter({
    liveProbes: {
      QuestionTransport: { parallel_workers: true, fabricated: true },
    },
    // no primitives
  });
  assert.notEqual(withDeclarativeOnly.capabilities.QuestionTransport, "enforced");

  const withoutProbeExecution = await createClaudeHostAdapter({
    primitives: { askUserQuestion: () => ({ answered: true }) },
  });
  // Probe IS executed against the primitive → enforced is allowed.
  assert.equal(withoutProbeExecution.capabilities.QuestionTransport, "enforced");
  assert.notEqual(withoutProbeExecution.capabilities.ExecutionTransport, "enforced");
});

test("CRITICAL: fabricated liveProbes ignored when primitives absent for other caps", async () => {
  const adapter = await createClaudeHostAdapter({
    primitives: { askUserQuestion: () => ({ answered: true }) },
    liveProbes: {
      ExecutionTransport: { live: true, capability_id: "ExecutionTransport" },
      QuestionTransport: { live: true, capability_id: "QuestionTransport" },
    },
  });
  assert.equal(adapter.capabilities.QuestionTransport, "enforced");
  // Execution has declarative probe but no primitive → not enforced
  assert.notEqual(adapter.capabilities.ExecutionTransport, "enforced");
});

test("CRITICAL: Claude primitive returning Promise.reject → ok:false via invokeTransportAsync", async () => {
  const adapter = await createClaudeHostAdapter({
    primitives: {
      execute: () => Promise.reject(Object.assign(new Error("host-fail"), { code: "host-fail" })),
    },
  });
  // Probe execution failed → not enforced
  assert.notEqual(adapter.capabilities.ExecutionTransport, "enforced");
  assert.equal(adapter.capabilities.ExecutionTransport, "partial");

  const outcome = await invokeTransportAsync(adapter.transports.ExecutionTransport, {
    requestId: "nested-reject-1",
    input: {},
  });
  assert.equal(outcome.ok, false);
  assert.ok(outcome.failure_class);
  assert.equal(outcome.requestId, "nested-reject-1");
});

test("verifyAllClaudeEnforcedProofs requires primitives (executed probes)", async () => {
  const liveProbes = {};
  for (const id of TRANSPORT_CAPABILITIES) {
    liveProbes[id] = { live: true, capability_id: id };
  }
  const declarative = await verifyAllClaudeEnforcedProofs({ liveProbes });
  assert.equal(declarative.ok, false);
  assert.equal(declarative.reason_code, "fixture-only-not-live-probe");

  const executed = await verifyAllClaudeEnforcedProofs({ primitives: ALL_PRIMITIVES });
  assert.equal(executed.ok, true);
});
