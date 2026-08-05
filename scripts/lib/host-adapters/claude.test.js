"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createClaudeHostAdapter,
  getClaudeProofMaterial,
  verifyAllClaudeEnforcedProofs,
  ADAPTER_ID,
  ADAPTER_VERSION,
  HOST_VERSION,
} = require("./claude.js");
const { resolveCapabilityState } = require("../host-contract/index.js");
const { createProbeDigest } = require("../capability-proof/index.js");

function allLiveProbes() {
  const probes = {};
  for (const id of [
    "ExecutionTransport",
    "QuestionTransport",
    "WorkerTransport",
    "ToolExecutionTransport",
    "DeliveryGateTransport",
  ]) {
    probes[id] = { live: true, capability_id: id, tick: 1 };
  }
  return probes;
}

test("missing primitive degrades honestly — never enforced", async () => {
  const adapter = createClaudeHostAdapter();
  for (const name of [
    "ExecutionTransport",
    "QuestionTransport",
    "WorkerTransport",
    "ToolExecutionTransport",
    "DeliveryGateTransport",
  ]) {
    assert.ok(adapter.transports[name]);
    assert.notEqual(adapter.capabilities[name], "enforced", name);
    assert.ok(
      ["unavailable", "instructional", "partial"].includes(adapter.capabilities[name]),
      name
    );
  }
});

test("fixture-only proof without live probe must not mark enforced", () => {
  const adapter = createClaudeHostAdapter({
    primitives: {
      askUserQuestion: (q) => ({ answered: true, q }),
      hooksObserve: () => ({ hook: "Stop", authorized: false }),
    },
  });
  assert.notEqual(adapter.capabilities.QuestionTransport, "enforced");
  assert.notEqual(adapter.capabilities.DeliveryGateTransport, "enforced");

  const fixtureOnly = verifyAllClaudeEnforcedProofs();
  assert.equal(fixtureOnly.ok, false);
  assert.equal(fixtureOnly.reason_code, "fixture-only-not-live-probe");
});

test("live probe + verified proof enables enforced", async () => {
  const liveProbes = allLiveProbes();
  const adapter = createClaudeHostAdapter({
    primitives: {
      execute: () => ({ ran: true }),
      askUserQuestion: (q) => ({ answered: true, q }),
      worker: () => ({ spawned: true }),
      tool: () => ({ tool: "Bash" }),
      hooksObserve: () => ({ hook: "Stop", authorized: false }),
    },
    liveProbes,
  });
  for (const name of Object.keys(liveProbes)) {
    assert.equal(adapter.capabilities[name], "enforced", name);
  }

  const material = getClaudeProofMaterial(liveProbes);
  const independent = createProbeDigest({
    capability_id: "QuestionTransport",
    adapter_id: ADAPTER_ID,
    adapter_version: ADAPTER_VERSION,
    host_version: HOST_VERSION,
    probe: liveProbes.QuestionTransport,
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
  assert.equal(verifyAllClaudeEnforcedProofs({ liveProbes }).ok, true);

  const q = await adapter.transports.QuestionTransport.invoke({ prompt: "continue?" });
  assert.equal(q.value.answered, true);
});

test("F-42a44346728b7090: liveProbes without primitives never yield enforced", () => {
  const liveProbes = allLiveProbes();
  const adapter = createClaudeHostAdapter({ liveProbes });
  for (const name of Object.keys(liveProbes)) {
    assert.notEqual(adapter.capabilities[name], "enforced", name);
  }
});

test("F-42a44346728b7090: primitives + live probe can yield enforced", () => {
  const liveProbes = {
    QuestionTransport: { live: true, capability_id: "QuestionTransport", tick: 2 },
  };
  const withoutProbe = createClaudeHostAdapter({
    primitives: { askUserQuestion: () => ({ answered: true }) },
  });
  assert.notEqual(withoutProbe.capabilities.QuestionTransport, "enforced");

  const withBoth = createClaudeHostAdapter({
    primitives: { askUserQuestion: () => ({ answered: true }) },
    liveProbes,
  });
  assert.equal(withBoth.capabilities.QuestionTransport, "enforced");
  assert.notEqual(withBoth.capabilities.ExecutionTransport, "enforced");
});

test("F-a23fde0a12e81544: verifyAllClaudeEnforcedProofs uses independent expectedProbeDigest", () => {
  const liveProbes = allLiveProbes();
  const material = getClaudeProofMaterial(liveProbes);
  for (const id of Object.keys(liveProbes)) {
    assert.ok(typeof material[id].expectedProbeDigest === "string");
    assert.ok(material[id].expectedProbeDigest.startsWith("sha256:"));
    const recomputed = createProbeDigest({
      capability_id: id,
      adapter_id: ADAPTER_ID,
      adapter_version: ADAPTER_VERSION,
      host_version: HOST_VERSION,
      probe: liveProbes[id],
    });
    assert.equal(material[id].expectedProbeDigest, recomputed);
  }
  assert.equal(verifyAllClaudeEnforcedProofs({ liveProbes }).ok, true);
});
