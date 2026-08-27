"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { freezeCandidate } = require("../execution-identities/index.js");
const { compileExecutionGraph, createPolicySnapshot } = require("../execution-graph/index.js");
const { computeTreeDigest } = require("../worker-workspace.js");
const {
  projectAssuranceGraph,
  reconcileAssuranceGraph,
  computeInvalidationClosure,
  emitEquivalenceManifest,
  rejectAuthorityMisuse,
  isEvidenceTransitivelyInvalidated,
} = require("./index.js");
const { verifyCandidate } = require("../independent-verifier/index.js");

const SAMPLE_NODES = [
  {
    node_id: "repair-core",
    kind: "repair-action/v1",
    operation: "apply_repair_patch",
    objective: "Apply repair changes",
    dependencies: [],
    ownership: { owner: "agent:repair", mode: "exclusive" },
    allowed_paths: ["src/index.js"],
    invariants: ["inv-fail-closed"],
    required_evidence: ["ev:test-pass"],
    budget_ref: "budget:default",
  },
];

const SAMPLE_OBLIGATIONS = [
  {
    id: "req-repair-001",
    criticality: "must",
    implemented_by: ["repair-core"],
    required_evidence: ["ev:test-pass"],
  },
];

function freezeFromFiles(files, extra = {}) {
  const tree = computeTreeDigest(files);
  return freezeCandidate({
    repository_id: "k6b-graph-repo",
    projection: "workspace",
    base_tree: tree,
    candidate_tree: tree,
    diff_hash: extra.diff_hash || "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    paths: Object.keys(files),
    predecessorCandidate: extra.predecessorCandidate,
  });
}

function compileGraph() {
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-fail-closed"] });
  const contract = {
    schema_version: 1,
    contract_id: "contract:k6b-graph",
    family: "repair",
    version: 1,
    contract_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    source_snapshot_id: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    obligations: SAMPLE_OBLIGATIONS,
  };
  return compileExecutionGraph({
    contract,
    policySnapshot,
    nodes: SAMPLE_NODES,
    obligations: SAMPLE_OBLIGATIONS,
  });
}

function featureRaw() {
  return [
    { role: "acceptance", bytes: "acceptance", provenance: "runtime-observed", origin: "a", node_id: "repair-core", obligation_ids: ["req-repair-001"] },
    { role: "invariants", bytes: "invariants", provenance: "runtime-observed", origin: "i", node_id: "repair-core", obligation_ids: ["req-repair-001"] },
    { role: "contract", bytes: "contract", provenance: "runtime-observed", origin: "c", node_id: "repair-core", obligation_ids: ["req-repair-001"] },
    { role: "negative", bytes: "negative", provenance: "runtime-observed", origin: "n", node_id: "repair-core", obligation_ids: ["req-repair-001"] },
  ];
}

function verifiedProjection() {
  const files = { "src/index.js": "module.exports = 1;\n" };
  const candidate = freezeFromFiles(files);
  const executionGraph = compileGraph();
  const verified = verifyCandidate({
    candidate,
    executionGraph,
    repository: { files },
    declaredStrategy: "feature",
    rawEvidence: featureRaw(),
  });
  assert.equal(verified.ok, true, verified.error || verified.reason_code);
  return { files, candidate, executionGraph, verified };
}

test("REQ-assurance-graph-002: same inputs yield the same digest and edges despite permutation", () => {
  const { candidate, executionGraph, verified } = verifiedProjection();
  const classified = verified.evidence.map((evidence, index) => ({
    evidence,
    obligation_ids: ["req-repair-001"],
    role: ["acceptance", "invariants", "contract", "negative"][index],
  }));
  const first = projectAssuranceGraph({
    candidate,
    executionGraph,
    evidence: classified,
    verification: verified.verification,
  });
  const second = projectAssuranceGraph({
    candidate,
    executionGraph,
    evidence: [...classified].reverse(),
    verification: verified.verification,
    additionalEdges: [...(first.graph.edges || [])].reverse(),
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.graph.graph_id, second.graph.graph_id);
  assert.deepEqual(first.graph.edges, second.graph.edges);
});

test("REQ-assurance-graph-002: forbidden reviewed-by and K7/K8 subjects fail closed", () => {
  const { candidate, executionGraph, verified } = verifiedProjection();
  const reviewed = projectAssuranceGraph({
    candidate,
    executionGraph,
    evidence: verified.evidence,
    verification: verified.verification,
    additionalEdges: [{ from: "finding-1", relation: "reviewed-by", to: "lens-risk" }],
  });
  assert.equal(reviewed.ok, false);
  assert.equal(reviewed.reason_code, "FORBIDDEN_RELATION");

  const attestation = projectAssuranceGraph({
    candidate,
    executionGraph,
    additionalNodes: [{ id: "attestation-1", kind: "attestation" }],
  });
  assert.equal(attestation.ok, false);
  assert.equal(attestation.reason_code, "FORBIDDEN_RELATION");
});

test("REQ-assurance-graph-001: matching canonical inputs project; divergence fails closed", () => {
  const { candidate, executionGraph, verified } = verifiedProjection();
  const projected = projectAssuranceGraph({
    candidate,
    executionGraph,
    evidence: verified.evidence.map((evidence) => ({ evidence, obligation_ids: ["req-repair-001"] })),
    verification: verified.verification,
  });
  assert.equal(projected.ok, true);
  const reconciled = reconcileAssuranceGraph(projected.graph, {
    candidate,
    executionGraph,
    evidence: verified.evidence.map((evidence) => ({ evidence, obligation_ids: ["req-repair-001"] })),
    verification: verified.verification,
  });
  assert.equal(reconciled.ok, true);

  const mutated = { ...projected.graph, graph_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" };
  const diverged = reconcileAssuranceGraph(mutated, {
    candidate,
    executionGraph,
    evidence: verified.evidence.map((evidence) => ({ evidence, obligation_ids: ["req-repair-001"] })),
    verification: verified.verification,
  });
  assert.equal(diverged.ok, false);
  assert.equal(diverged.reason_code, "GRAPH_DIVERGENCE");

  const edgeDiverged = reconcileAssuranceGraph(
    {
      ...projected.graph,
      edges: [{ from: candidate.candidate_id, relation: "satisfies", to: "req-repair-001" }],
    },
    {
      candidate,
      executionGraph,
      evidence: verified.evidence.map((evidence) => ({ evidence, obligation_ids: ["req-repair-001"] })),
      verification: verified.verification,
    }
  );
  assert.equal(edgeDiverged.ok, false);
  assert.equal(edgeDiverged.reason_code, "GRAPH_DIVERGENCE");
  assert.match(edgeDiverged.error, /stored edges diverge from canonical projection/);
});

test("REQ-harness-authority-canon-010: APIs return new objects without write-through", () => {
  const { candidate, executionGraph, verified } = verifiedProjection();
  const nodes = [{ id: candidate.candidate_id, kind: "candidate" }];
  const projected = projectAssuranceGraph({
    candidate,
    executionGraph,
    evidence: verified.evidence.map((evidence) => ({ evidence, obligation_ids: ["req-repair-001"] })),
    verification: verified.verification,
    additionalNodes: nodes,
  });
  assert.equal(projected.ok, true);
  projected.graph.nodes.push({ id: "mutated", kind: "candidate" });
  assert.equal(nodes.length, 1);
  assert.equal(candidate.candidate_id, freezeFromFiles({ "src/index.js": "module.exports = 1;\n" }).candidate_id);
});

test("REQ-assurance-graph-003: successor invalidates dependent evidence and preserves independent evidence", () => {
  const files = { "src/index.js": "module.exports = 1;\n" };
  const predecessor = freezeFromFiles(files);
  const successor = freezeFromFiles(files, {
    diff_hash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    predecessorCandidate: predecessor,
  });
  const dependentId = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const independentId = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const graph = {
    schema_version: 1,
    kind: "assurance-graph/v1",
    graph_id: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    candidate_id: predecessor.candidate_id,
    nodes: [
      { id: predecessor.candidate_id, kind: "candidate" },
      { id: "src/index.js", kind: "source" },
      { id: dependentId, kind: "test-evidence" },
      { id: independentId, kind: "test-evidence" },
      { id: "unrelated-source", kind: "source" },
    ],
    edges: [
      { from: dependentId, relation: "derived-from", to: predecessor.candidate_id },
      { from: dependentId, relation: "derived-from", to: "src/index.js" },
      { from: independentId, relation: "derived-from", to: "unrelated-source" },
    ],
  };
  const closure = computeInvalidationClosure(graph, {
    predecessorCandidate: predecessor,
    successorCandidate: successor,
    changedSubjectIds: [predecessor.candidate_id, "src/index.js"],
  });
  assert.ok(closure.invalidated_node_ids.includes(dependentId));
  assert.ok(closure.preserved_evidence_ids.includes(independentId));
  assert.equal(closure.preserved_evidence_ids.includes(dependentId), false);
});

test("REQ-assurance-graph-003: cycle-safe traversal and transitive invalidates block reuse", () => {
  const graph = {
    nodes: [
      { id: "A", kind: "source" },
      { id: "B", kind: "test-evidence" },
      { id: "C", kind: "test-evidence" },
    ],
    edges: [
      { from: "A", relation: "invalidates", to: "B" },
      { from: "B", relation: "derived-from", to: "C" },
      { from: "C", relation: "derived-from", to: "B" },
    ],
  };
  const closure = computeInvalidationClosure(graph, { changedSubjectIds: ["A"] });
  assert.ok(closure.invalidated_node_ids.includes("B"));
  assert.ok(closure.invalidated_node_ids.includes("C"));
  assert.equal(isEvidenceTransitivelyInvalidated(graph, "B"), true);
  assert.equal(isEvidenceTransitivelyInvalidated(graph, "C"), true);
});

test("REQ-assurance-graph-003: dependent evidence of an invalidated node is transitively stale", () => {
  const graph = {
    nodes: [
      { id: "A", kind: "source" },
      { id: "B", kind: "source" },
      { id: "E", kind: "test-evidence" },
    ],
    edges: [
      { from: "A", relation: "invalidates", to: "B" },
      { from: "E", relation: "derived-from", to: "B" },
    ],
  };
  assert.equal(isEvidenceTransitivelyInvalidated(graph, "E"), true);
  assert.equal(isEvidenceTransitivelyInvalidated(graph, "B"), true);
});

test("REQ-assurance-graph-004: manifest binds graph_id and CandidateId without promoting equivalence", () => {
  const { candidate, verified } = verifiedProjection();
  const manifest = emitEquivalenceManifest(verified.assurance_graph);
  assert.equal(manifest.kind, "equivalence-manifest/v1");
  assert.equal(manifest.graph_id, verified.assurance_graph.graph_id);
  assert.equal(manifest.candidate_id, candidate.candidate_id);
  assert.notEqual(manifest.kind, "candidate-evaluation-attestation/v1");
  assert.notEqual(manifest.kind, "delivery-authorization/v1");
});

test("REQ-harness-authority-canon-010: graph used as approval or delivery authority fails closed", () => {
  const result = rejectAuthorityMisuse({ operation: "approve", from_graph_edges_alone: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "GRAPH_AUTHORITY_MISUSE");
});
