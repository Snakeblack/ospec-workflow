"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { applyClarifyEvent, computeDescendantClosure } = require("./clarify.js");

function createNode(id, deps = []) {
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

const samplePolicySnapshotId = "sha256:5555555555555555555555555555555555555555555555555555555555555555";

test("ClarifyEvent: linear DAG invalidates strictly declared affected node and descendants", () => {
  // N1 -> N2 -> N3 (N2 depends on N1, N3 depends on N2)
  const graph = {
    schema_version: 1,
    graph_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    contract_digest: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    policy_bundle_digest: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    policy_snapshot_id: samplePolicySnapshotId,
    source_snapshot_id: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    nodes: [
      createNode("n1", []),
      createNode("n2", ["n1"]),
      createNode("n3", ["n2"]),
    ],
    obligations: [
      { id: "req-1", criticality: "must", implemented_by: ["n1"], required_evidence: ["ev:n1"] },
      { id: "req-2", criticality: "must", implemented_by: ["n2"], required_evidence: ["ev:n2"] },
      { id: "req-3", criticality: "must", implemented_by: ["n3"], required_evidence: ["ev:n3"] },
    ],
  };

  const clarifyEvent = {
    schema_version: 1,
    event_id: "evt-clarify-1",
    question_id: "q-1",
    answer: "Updated approach for N2",
    timestamp: "2026-08-15T00:00:00Z",
    affected_nodes: ["n2"],
  };

  const result = applyClarifyEvent(graph, clarifyEvent);

  assert.deepEqual(result.invalidatedNodeIds.sort(), ["n2", "n3"]);
  assert.deepEqual(result.preservedNodeIds.sort(), ["n1"]);
  assert.notEqual(result.graph.graph_id, graph.graph_id);
  assert.match(result.graph.graph_id, /^sha256:[a-f0-9]{64}$/);

  // Assert affected node is mutated with clarification context
  const mutatedN2 = result.graph.nodes.find((n) => n.node_id === "n2");
  assert.ok(mutatedN2.clarification_context);
  assert.equal(mutatedN2.clarification_context.event_id, "evt-clarify-1");
  assert.equal(mutatedN2.clarification_context.answer, "Updated approach for N2");

  // Assert unaffected node is not mutated with clarification context
  const preservedN1 = result.graph.nodes.find((n) => n.node_id === "n1");
  assert.equal(preservedN1.clarification_context, undefined);
});

test("ClarifyEvent: parallel independent branches are preserved", () => {
  // Branch A: n1 -> n2
  // Branch B: n3 -> n4
  const graph = {
    schema_version: 1,
    graph_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    contract_digest: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    policy_bundle_digest: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    policy_snapshot_id: samplePolicySnapshotId,
    source_snapshot_id: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    nodes: [
      createNode("n1", []),
      createNode("n2", ["n1"]),
      createNode("n3", []),
      createNode("n4", ["n3"]),
    ],
    obligations: [
      { id: "req-1", criticality: "must", implemented_by: ["n1"], required_evidence: ["ev:n1"] },
      { id: "req-2", criticality: "must", implemented_by: ["n2"], required_evidence: ["ev:n2"] },
      { id: "req-3", criticality: "must", implemented_by: ["n3"], required_evidence: ["ev:n3"] },
      { id: "req-4", criticality: "must", implemented_by: ["n4"], required_evidence: ["ev:n4"] },
    ],
  };

  const clarifyEvent = {
    schema_version: 1,
    event_id: "evt-clarify-2",
    question_id: "q-2",
    answer: "Fix branch B",
    timestamp: "2026-08-15T00:00:00Z",
    affected_nodes: ["n3"],
  };

  const result = applyClarifyEvent(graph, clarifyEvent);

  assert.deepEqual(result.invalidatedNodeIds.sort(), ["n3", "n4"]);
  assert.deepEqual(result.preservedNodeIds.sort(), ["n1", "n2"]);
});

test("ClarifyEvent: diamond DAG invalidates only affected branch and common join point", () => {
  // n1 -> (n2, n3) -> n4
  const graph = {
    schema_version: 1,
    graph_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    contract_digest: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    policy_bundle_digest: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    policy_snapshot_id: samplePolicySnapshotId,
    source_snapshot_id: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    nodes: [
      createNode("n1", []),
      createNode("n2", ["n1"]),
      createNode("n3", ["n1"]),
      createNode("n4", ["n2", "n3"]),
    ],
    obligations: [
      { id: "req-1", criticality: "must", implemented_by: ["n1"], required_evidence: ["ev:n1"] },
      { id: "req-2", criticality: "must", implemented_by: ["n2"], required_evidence: ["ev:n2"] },
      { id: "req-3", criticality: "must", implemented_by: ["n3"], required_evidence: ["ev:n3"] },
      { id: "req-4", criticality: "must", implemented_by: ["n4"], required_evidence: ["ev:n4"] },
    ],
  };

  const clarifyEvent = {
    schema_version: 1,
    event_id: "evt-clarify-3",
    question_id: "q-3",
    answer: "Modify n2",
    timestamp: "2026-08-15T00:00:00Z",
    affected_nodes: ["n2"],
  };

  const result = applyClarifyEvent(graph, clarifyEvent);

  assert.deepEqual(result.invalidatedNodeIds.sort(), ["n2", "n4"]);
  assert.deepEqual(result.preservedNodeIds.sort(), ["n1", "n3"]);
});

test("ClarifyEvent: rejects unknown affected node IDs fail-closed", () => {
  const graph = {
    schema_version: 1,
    graph_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    contract_digest: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    policy_bundle_digest: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    policy_snapshot_id: samplePolicySnapshotId,
    source_snapshot_id: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    nodes: [createNode("n1", [])],
    obligations: [{ id: "req-1", criticality: "must", implemented_by: ["n1"], required_evidence: ["ev:n1"] }],
  };

  const clarifyEvent = {
    schema_version: 1,
    event_id: "evt-clarify-unknown",
    question_id: "q-unknown",
    answer: "x",
    timestamp: "2026-08-15T00:00:00Z",
    affected_nodes: ["non-existent-node"],
  };

  assert.throws(
    () => applyClarifyEvent(graph, clarifyEvent),
    (err) => err.code === "unknown-affected-node" || err.message.includes("non-existent-node")
  );
});

test("ClarifyEvent: detects dependency cycles and fails closed", () => {
  // n1 -> n2 -> n1 cycle
  const graph = {
    schema_version: 1,
    graph_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    contract_digest: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    policy_bundle_digest: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    policy_snapshot_id: samplePolicySnapshotId,
    source_snapshot_id: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    nodes: [
      createNode("n1", ["n2"]),
      createNode("n2", ["n1"]),
    ],
    obligations: [
      { id: "req-1", criticality: "must", implemented_by: ["n1"], required_evidence: ["ev:n1"] },
      { id: "req-2", criticality: "must", implemented_by: ["n2"], required_evidence: ["ev:n2"] },
    ],
  };

  const clarifyEvent = {
    schema_version: 1,
    event_id: "evt-clarify-cycle",
    question_id: "q-cycle",
    answer: "x",
    timestamp: "2026-08-15T00:00:00Z",
    affected_nodes: ["n1"],
  };

  assert.throws(
    () => applyClarifyEvent(graph, clarifyEvent),
    (err) => err.code === "cyclic-dependency-detected" || err.message.includes("cycle")
  );
});
