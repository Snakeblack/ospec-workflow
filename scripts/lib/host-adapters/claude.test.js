"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createClaudeHostAdapter,
  getClaudeProofMaterial,
  verifyAllClaudeEnforcedProofs,
} = require("./claude.js");
const { resolveCapabilityState } = require("../host-contract/index.js");

test("claude HostAdapter exposes five transports and proof-bound enforced capabilities", () => {
  const adapter = createClaudeHostAdapter({
    primitives: {
      askUserQuestion: (q) => ({ answered: true, q }),
      hooksObserve: () => ({ hook: "Stop", authorized: false }),
    },
  });
  assert.equal(adapter.adapter_id, "claude");
  for (const name of [
    "ExecutionTransport",
    "QuestionTransport",
    "WorkerTransport",
    "ToolExecutionTransport",
    "DeliveryGateTransport",
  ]) {
    assert.ok(adapter.transports[name]);
    assert.equal(adapter.capabilities[name], "enforced");
  }

  const material = getClaudeProofMaterial();
  const resolved = resolveCapabilityState({
    capability_id: "QuestionTransport",
    declared_state: "enforced",
    proof: material.QuestionTransport.proof,
    semantic_evidence: material.QuestionTransport.evidence,
  });
  assert.equal(resolved.enforced, true);
  assert.equal(verifyAllClaudeEnforcedProofs().ok, true);

  const q = adapter.transports.QuestionTransport.invoke({ prompt: "continue?" });
  assert.equal(q.value.answered, true);
});
