"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { computeGraphId } = require("./compiler.js");
const { applyClarifyEvent, computeDescendantClosure } = require("./clarify.js");
const { validateExecutionGraphBinding } = require("./binding.js");

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

function createTestGraph(nodes, obligations = []) {
  const contractDigest = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
  const policyBundleDigest = "sha256:3333333333333333333333333333333333333333333333333333333333333333";
  const policySnapshotId = samplePolicySnapshotId;
  const sourceSnapshotId = "sha256:4444444444444444444444444444444444444444444444444444444444444444";
  const graphId = computeGraphId(
    contractDigest,
    policySnapshotId,
    policyBundleDigest,
    sourceSnapshotId,
    nodes,
    obligations
  );
  return {
    schema_version: 1,
    graph_id: graphId,
    contract_digest: contractDigest,
    policy_bundle_digest: policyBundleDigest,
    policy_snapshot_id: policySnapshotId,
    source_snapshot_id: sourceSnapshotId,
    nodes,
    obligations,
  };
}

test("ClarifyEvent: linear DAG invalidates strictly declared affected node and descendants", () => {
  const nodes = [
    createNode("n1", []),
    createNode("n2", ["n1"]),
    createNode("n3", ["n2"]),
  ];
  const obligations = [
    { id: "req-1", criticality: "must", implemented_by: ["n1"], required_evidence: ["ev:n1"] },
    { id: "req-2", criticality: "must", implemented_by: ["n2"], required_evidence: ["ev:n2"] },
    { id: "req-3", criticality: "must", implemented_by: ["n3"], required_evidence: ["ev:n3"] },
  ];
  const graph = createTestGraph(nodes, obligations);

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

  // Assert clarified graph passes validateExecutionGraphBinding
  const bindingCheck = validateExecutionGraphBinding(result.graph);
  assert.equal(bindingCheck.ok, true, `Clarified graph must pass binding check: ${bindingCheck.error}`);
});

test("ClarifyEvent: parallel independent branches are preserved", () => {
  const nodes = [
    createNode("n1", []),
    createNode("n2", ["n1"]),
    createNode("n3", []),
    createNode("n4", ["n3"]),
  ];
  const obligations = [
    { id: "req-1", criticality: "must", implemented_by: ["n1"], required_evidence: ["ev:n1"] },
    { id: "req-2", criticality: "must", implemented_by: ["n2"], required_evidence: ["ev:n2"] },
    { id: "req-3", criticality: "must", implemented_by: ["n3"], required_evidence: ["ev:n3"] },
    { id: "req-4", criticality: "must", implemented_by: ["n4"], required_evidence: ["ev:n4"] },
  ];
  const graph = createTestGraph(nodes, obligations);

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
  const nodes = [
    createNode("n1", []),
    createNode("n2", ["n1"]),
    createNode("n3", ["n1"]),
    createNode("n4", ["n2", "n3"]),
  ];
  const obligations = [
    { id: "req-1", criticality: "must", implemented_by: ["n1"], required_evidence: ["ev:n1"] },
    { id: "req-2", criticality: "must", implemented_by: ["n2"], required_evidence: ["ev:n2"] },
    { id: "req-3", criticality: "must", implemented_by: ["n3"], required_evidence: ["ev:n3"] },
    { id: "req-4", criticality: "must", implemented_by: ["n4"], required_evidence: ["ev:n4"] },
  ];
  const graph = createTestGraph(nodes, obligations);

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
  const nodes = [createNode("n1", [])];
  const obligations = [{ id: "req-1", criticality: "must", implemented_by: ["n1"], required_evidence: ["ev:n1"] }];
  const graph = createTestGraph(nodes, obligations);

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
  const cyclicNodes = [
    createNode("n1", ["n2"]),
    createNode("n2", ["n1"]),
  ];
  const obligations = [
    { id: "req-1", criticality: "must", implemented_by: ["n1"], required_evidence: ["ev:n1"] },
    { id: "req-2", criticality: "must", implemented_by: ["n2"], required_evidence: ["ev:n2"] },
  ];
  const graph = createTestGraph(cyclicNodes, obligations);

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

test("ClarifyEvent: rejects tampered input graph with graph-id-mismatch", () => {
  const nodes = [createNode("n1", [])];
  const obligations = [{ id: "req-1", criticality: "must", implemented_by: ["n1"], required_evidence: ["ev:n1"] }];
  const graph = createTestGraph(nodes, obligations);
  graph.graph_id = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

  const clarifyEvent = {
    schema_version: 1,
    event_id: "evt-clarify-tampered",
    question_id: "q-tampered",
    answer: "x",
    timestamp: "2026-08-15T00:00:00Z",
    affected_nodes: ["n1"],
  };

  assert.throws(
    () => applyClarifyEvent(graph, clarifyEvent),
    (err) => err.code === "graph-id-mismatch"
  );
});

test("ClarifyEvent: rejects schema-invalid ClarifyEvent records fail-closed", () => {
  const nodes = [createNode("n1", [])];
  const obligations = [{ id: "req-1", criticality: "must", implemented_by: ["n1"], required_evidence: ["ev:n1"] }];
  const graph = createTestGraph(nodes, obligations);

  // Missing timestamp
  const missingTimestamp = {
    schema_version: 1,
    event_id: "evt-1",
    question_id: "q-1",
    answer: "x",
    affected_nodes: ["n1"],
  };
  assert.throws(
    () => applyClarifyEvent(graph, missingTimestamp),
    (err) => err.code === "invalid-clarify-event-schema"
  );

  // Extra unexpected field
  const extraField = {
    schema_version: 1,
    event_id: "evt-1",
    question_id: "q-1",
    answer: "x",
    timestamp: "2026-08-15T00:00:00Z",
    affected_nodes: ["n1"],
    forbidden_extra: "evil",
  };
  assert.throws(
    () => applyClarifyEvent(graph, extraField),
    (err) => err.code === "invalid-clarify-event-schema"
  );
});

test("ClarifyEvent: rejects graph containing duplicate node_id fail-closed", () => {
  const dupNodes = [
    createNode("n-dup", []),
    createNode("n-dup", []),
  ];
  const obligations = [{ id: "req-1", criticality: "must", implemented_by: ["n-dup"], required_evidence: ["ev:n-dup"] }];
  const graph = {
    schema_version: 1,
    graph_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    contract_digest: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    policy_bundle_digest: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    policy_snapshot_id: samplePolicySnapshotId,
    source_snapshot_id: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    nodes: dupNodes,
    obligations,
  };

  const clarifyEvent = {
    schema_version: 1,
    event_id: "evt-1",
    question_id: "q-1",
    answer: "x",
    timestamp: "2026-08-15T00:00:00Z",
    affected_nodes: ["n-dup"],
  };

  assert.throws(
    () => applyClarifyEvent(graph, clarifyEvent),
    (err) => err.code === "duplicate-node-id" || err.code === "DUPLICATE_NODE_ID" || err.code === "invalid-graph"
  );
});
