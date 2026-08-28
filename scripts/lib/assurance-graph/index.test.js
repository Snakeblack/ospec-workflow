"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { freezeCandidate } = require("../execution-identities/index.js");
const { compileExecutionGraph, createPolicySnapshot } = require("../execution-graph/index.js");
const { computeTreeDigest } = require("../worker-workspace.js");
const {
  projectAssuranceGraph,
  reconcileAssuranceGraph,
  replayAssuranceGraph,
  rejectForbidden,
  computeInvalidationClosure,
  emitEquivalenceManifest,
  rejectAuthorityMisuse,
  isEvidenceTransitivelyInvalidated,
} = require("./index.js");
const { verifyCandidate } = require("../independent-verifier/index.js");
const { computeAssessmentId } = require("../independent-verifier/assessment.js");
const { createTestRunnerReceiptChannel } = require("../test-support/k6b-runner-receipt.js");
const { canonicalize, computeGraphId } = require("./projector.js");

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
    { bytes: "acceptance", provenance: "runtime-observed", origin: "a", node_id: "repair-core" },
    { bytes: "invariants", provenance: "runtime-observed", origin: "i", node_id: "repair-core" },
    { bytes: "contract", provenance: "runtime-observed", origin: "c", node_id: "repair-core" },
    { bytes: "negative", provenance: "runtime-observed", origin: "n", node_id: "repair-core" },
  ];
}

function featureReceipts() {
  return [
    { role: "acceptance", node_id: "repair-core", evidence_requirements_satisfied: ["ev:test-pass"] },
    { role: "invariants", node_id: "repair-core", evidence_requirements_satisfied: ["ev:test-pass"] },
    { role: "contract", node_id: "repair-core", evidence_requirements_satisfied: ["ev:test-pass"] },
    { role: "negative", node_id: "repair-core", evidence_requirements_satisfied: ["ev:test-pass"] },
  ];
}

const HARNESS_COLLECTOR = { id: "node-test", transport: "tool-execution-transport" };

function verifiedProjection() {
  const files = { "src/index.js": "module.exports = 1;\n" };
  const candidate = freezeFromFiles(files);
  const executionGraph = compileGraph();
  const rawEvidence = featureRaw();
  const receiptSpecs = featureReceipts();
  const runnerReceiptChannel = createTestRunnerReceiptChannel({
    candidate,
    executionGraph,
    collector: HARNESS_COLLECTOR,
    rawEvidence,
    receiptSpecs,
  });
  const verified = verifyCandidate({
    candidate,
    executionGraph,
    contract: { contract_digest: executionGraph.contract_digest },
    repository: { files },
    declaredStrategy: "feature",
    collector: HARNESS_COLLECTOR,
    rawEvidence,
    runnerReceiptChannel,
  });
  assert.equal(verified.ok, true, verified.error || verified.reason_code);
  return { files, candidate, executionGraph, runnerReceiptChannel, verified };
}

function replayBundle(projection, overrides = {}) {
  return {
    candidate: projection.candidate,
    executionGraph: projection.executionGraph,
    evidence: projection.verified.replay_evidence,
    assessments: projection.verified.assessments,
    verification: projection.verified.verification,
    canonical_inputs: projection.verified.assurance_graph.canonical_inputs,
    runnerReceiptChannel: projection.runnerReceiptChannel,
    ...overrides,
  };
}

function withAssessmentFields(assessment, fields) {
  const updated = { ...assessment, ...fields };
  return { ...updated, assessment_id: computeAssessmentId(updated) };
}

function withStoredGraphId(stored) {
  const canonical = canonicalize(stored.nodes, stored.edges);
  return {
    ...stored,
    nodes: canonical.nodes,
    edges: canonical.edges,
    graph_id: computeGraphId({
      candidate_id: stored.candidate_id,
      canonical_inputs: stored.canonical_inputs,
      nodes: canonical.nodes,
      edges: canonical.edges,
    }),
  };
}

test("REQ-assurance-graph-002: same inputs yield the same digest and edges despite permutation", () => {
  const { candidate, executionGraph, verified } = verifiedProjection();
  const classified = verified.evidence.map((evidence, index) => ({
    evidence,
    role: ["acceptance", "invariants", "contract", "negative"][index],
  }));
  const first = projectAssuranceGraph({
    candidate,
    executionGraph,
    evidence: classified,
    assessments: verified.assessments,
    verification: verified.verification,
  });
  const second = projectAssuranceGraph({
    candidate,
    executionGraph,
    evidence: [...classified].reverse(),
    assessments: [...verified.assessments].reverse(),
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
    evidence: verified.evidence,
    assessments: verified.assessments,
    verification: verified.verification,
  });
  assert.equal(projected.ok, true);
  const reconciled = reconcileAssuranceGraph(projected.graph, {
    candidate,
    executionGraph,
    evidence: verified.evidence,
    assessments: verified.assessments,
    verification: verified.verification,
  });
  assert.equal(reconciled.ok, true);

  const mutated = { ...projected.graph, graph_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" };
  const diverged = reconcileAssuranceGraph(mutated, {
    candidate,
    executionGraph,
    evidence: verified.evidence,
    assessments: verified.assessments,
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
      evidence: verified.evidence,
      assessments: verified.assessments,
      verification: verified.verification,
    }
  );
  assert.equal(edgeDiverged.ok, false);
  assert.equal(edgeDiverged.reason_code, "GRAPH_DIVERGENCE");
  assert.match(edgeDiverged.error, /stored graph_id does not match its stored payload/);
});

test("REQ-harness-authority-canon-010: APIs return new objects without write-through", () => {
  const { candidate, executionGraph, verified } = verifiedProjection();
  const nodes = [{ id: candidate.candidate_id, kind: "candidate" }];
  const projected = projectAssuranceGraph({
    candidate,
    executionGraph,
    evidence: verified.evidence,
    assessments: verified.assessments,
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

test("REQ-assurance-graph-007: contradictory canonical inputs fail closed; permutation does not", () => {
  const { candidate, executionGraph, verified } = verifiedProjection();
  const baseInput = {
    candidate,
    executionGraph,
    evidence: verified.evidence,
    assessments: verified.assessments,
    verification: verified.verification,
  };
  const base = projectAssuranceGraph(baseInput);
  assert.equal(base.ok, true);
  assert.ok(base.graph.canonical_inputs);

  const flippedContract = projectAssuranceGraph({
    ...baseInput,
    canonicalInputs: {
      ...base.graph.canonical_inputs,
      contract_digest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    },
  });
  assert.equal(flippedContract.ok, false);
  assert.equal(flippedContract.reason_code, "GRAPH_DIVERGENCE");

  const flippedPolicy = projectAssuranceGraph({
    ...baseInput,
    canonicalInputs: {
      ...base.graph.canonical_inputs,
      policy_snapshot_id: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    },
  });
  assert.equal(flippedPolicy.ok, false);
  assert.equal(flippedPolicy.reason_code, "GRAPH_DIVERGENCE");

  const flippedExec = projectAssuranceGraph({
    ...baseInput,
    canonicalInputs: {
      ...base.graph.canonical_inputs,
      execution_graph_digest: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    },
  });
  assert.equal(flippedExec.ok, false);
  assert.equal(flippedExec.reason_code, "GRAPH_DIVERGENCE");

  const flippedOpenspec = projectAssuranceGraph({
    ...baseInput,
    canonicalInputs: {
      ...base.graph.canonical_inputs,
      openspec_input_digest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    },
  });
  assert.equal(flippedOpenspec.ok, false);
  assert.equal(flippedOpenspec.reason_code, "GRAPH_DIVERGENCE");

  const permutedNodes = projectAssuranceGraph({
    ...baseInput,
    additionalNodes: [...base.graph.nodes].reverse(),
  });
  assert.equal(permutedNodes.ok, true);
  assert.equal(base.graph.graph_id, permutedNodes.graph.graph_id);
});

test("REQ-assurance-graph-007: missing required canonical digest is never fingerprinted", () => {
  const { candidate, executionGraph } = verifiedProjection();
  const missingPolicy = { ...executionGraph };
  delete missingPolicy.policy_snapshot_id;
  const result = projectAssuranceGraph({ candidate, executionGraph: missingPolicy });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "GRAPH_DIVERGENCE");
});

test("REQ-assurance-graph-005: rejectForbidden matches kind/namespace, not id substring", () => {
  const allowed = rejectForbidden(
    [{ id: "REQ-add-authorization-header", kind: "requirement" }],
    []
  );
  assert.equal(allowed.ok, true);

  const structured = rejectForbidden([{ id: "authz-1", kind: "authorization" }], []);
  assert.equal(structured.ok, false);
  assert.equal(structured.reason_code, "FORBIDDEN_RELATION");

  const namespaced = rejectForbidden(
    [{ id: "harmless-id", kind: "requirement", namespace: "attestation" }],
    []
  );
  assert.equal(namespaced.ok, false);
  assert.equal(namespaced.reason_code, "FORBIDDEN_RELATION");
});

test("REQ-assurance-graph-001: missing candidate is GRAPH_PROJECTION_FAILED", () => {
  const result = projectAssuranceGraph({});
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "GRAPH_PROJECTION_FAILED");
});

test("REQ-assurance-graph-006: replay from persistable outputs is byte-identical; contract churn diverges", () => {
  const projection = verifiedProjection();
  const { candidate, executionGraph, verified } = projection;
  const persistable = replayBundle(projection);
  const replayed = replayAssuranceGraph(persistable);
  assert.equal(replayed.ok, true);
  assert.equal(replayed.graph.graph_id, verified.assurance_graph.graph_id);
  assert.deepEqual(replayed.graph.edges, verified.assurance_graph.edges);

  const churned = projectAssuranceGraph({
    candidate,
    executionGraph,
    evidence: verified.evidence,
    assessments: verified.assessments,
    verification: verified.verification,
    canonicalInputs: {
      ...verified.assurance_graph.canonical_inputs,
      contract_digest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    },
  });
  assert.equal(churned.ok, false);
  assert.equal(churned.reason_code, "GRAPH_DIVERGENCE");
  const diverged = reconcileAssuranceGraph(verified.assurance_graph, {
    candidate,
    executionGraph,
    evidence: verified.evidence,
    assessments: verified.assessments,
    verification: verified.verification,
    canonicalInputs: {
      ...verified.assurance_graph.canonical_inputs,
      contract_digest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
    },
  });
  assert.equal(diverged.ok, false);
  assert.equal(diverged.reason_code, "GRAPH_DIVERGENCE");
});

test("REQ-assurance-graph-006 [Adversarial]: replay without observation bytes or blob reference fails closed", () => {
  const projection = verifiedProjection();
  const { verified } = projection;
  const replayed = replayAssuranceGraph(replayBundle(projection, {
    evidence: verified.evidence,
  }));

  assert.equal(replayed.ok, false);
  assert.equal(replayed.reason_code, "GRAPH_DIVERGENCE");
  assert.match(replayed.error, /bytes|blob/i);
});

test("REQ-assurance-graph-006: resolvable content-addressed observation blobs replay byte-identically", () => {
  const projection = verifiedProjection();
  const { verified } = projection;
  const observationBlobs = {};
  const evidence = verified.replay_evidence.map((item) => {
    observationBlobs[item.evidence.digest] = item.bytes;
    return {
      evidence: item.evidence,
      observation_blob_id: item.evidence.digest,
      runner_receipt_id: item.runner_receipt_id,
    };
  });
  const replayed = replayAssuranceGraph(replayBundle(projection, {
    evidence,
    observation_blobs: observationBlobs,
  }));

  assert.equal(replayed.ok, true, replayed.error || replayed.reason_code);
  assert.equal(replayed.graph.graph_id, verified.assurance_graph.graph_id);
});

test("REQ-assurance-graph-006/008: replay and reconcile reject assessment and stored-payload tampering", () => {
  const projection = verifiedProjection();
  const { candidate, executionGraph, verified } = projection;
  const persistable = replayBundle(projection);
  const tamperedAssessment = replayAssuranceGraph({
    ...persistable,
    assessments: [{ ...verified.assessments[0], assessment_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" }, ...verified.assessments.slice(1)],
  });
  assert.equal(tamperedAssessment.ok, false);
  assert.equal(tamperedAssessment.reason_code, "GRAPH_DIVERGENCE");

  const tamperedNode = reconcileAssuranceGraph(
    { ...verified.assurance_graph, nodes: [...verified.assurance_graph.nodes, { id: "extra", kind: "source" }] },
    { candidate, executionGraph, evidence: verified.evidence, assessments: verified.assessments, verification: verified.verification }
  );
  assert.equal(tamperedNode.ok, false);
  assert.equal(tamperedNode.reason_code, "GRAPH_DIVERGENCE");
});

test("REQ-assurance-graph-006: replay rejects every persisted assessment binding mutation", () => {
  const projection = verifiedProjection();
  const { verified } = projection;
  const persistable = replayBundle(projection);
  const assessment = verified.assessments[0];
  const missingEvidenceId = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

  const cases = [
    {
      name: "malformed assessment schema",
      input: {
        ...persistable,
        assessments: [{ ...assessment, kind: "evidence/v2" }, ...verified.assessments.slice(1)],
      },
    },
    {
      name: "coverage outside the obligation requirements",
      input: {
        ...persistable,
        assessments: [withAssessmentFields(assessment, { evidence_requirements_satisfied: ["ev:unexpected"] }), ...verified.assessments.slice(1)],
      },
    },
    {
      name: "candidate mismatch",
      input: {
        ...persistable,
        assessments: [withAssessmentFields(assessment, { candidate_id: missingEvidenceId }), ...verified.assessments.slice(1)],
      },
    },
    {
      name: "policy mismatch",
      input: {
        ...persistable,
        assessments: [withAssessmentFields(assessment, { policy_snapshot_id: missingEvidenceId }), ...verified.assessments.slice(1)],
      },
    },
    {
      name: "missing evidence",
      input: {
        ...persistable,
        assessments: [withAssessmentFields(assessment, { evidence_id: missingEvidenceId }), ...verified.assessments.slice(1)],
      },
    },
    {
      name: "unknown obligation",
      input: {
        ...persistable,
        assessments: [withAssessmentFields(assessment, { obligation_id: "req-unknown-001" }), ...verified.assessments.slice(1)],
      },
    },
    {
      name: "non-implementing node",
      input: {
        ...persistable,
        evidence: [
          {
            ...verified.replay_evidence[0],
            evidence: { ...verified.evidence[0], node_id: "non-implementing-node" },
          },
          ...verified.replay_evidence.slice(1),
        ],
        assessments: [withAssessmentFields(assessment, { node_id: "non-implementing-node" }), ...verified.assessments.slice(1)],
      },
    },
    {
      name: "node_id mismatch",
      input: {
        ...persistable,
        evidence: [
          {
            ...verified.replay_evidence[0],
            evidence: { ...verified.evidence[0], node_id: "evidence-node-mismatch" },
          },
          ...verified.replay_evidence.slice(1),
        ],
      },
    },
  ];

  for (const { name, input } of cases) {
    const replayed = replayAssuranceGraph(input);
    assert.equal(replayed.ok, false, name);
    assert.equal(replayed.reason_code, "GRAPH_DIVERGENCE", name);
  }
});

test("REQ-assurance-graph-008: reconcile rejects stored identity mutations after recomputing stored graph_id", () => {
  const { candidate, executionGraph, verified } = verifiedProjection();
  const canonicalInput = {
    candidate,
    executionGraph,
    evidence: verified.replay_evidence,
    assessments: verified.assessments,
    verification: verified.verification,
  };
  const stored = verified.assurance_graph;

  const cases = [
    {
      name: "canonical_inputs",
      graph: withStoredGraphId({
        ...stored,
        canonical_inputs: {
          ...stored.canonical_inputs,
          openspec_input_digest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        },
      }),
    },
    {
      name: "candidate_id",
      graph: withStoredGraphId({
        ...stored,
        candidate_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      }),
    },
    {
      name: "kind",
      graph: withStoredGraphId({ ...stored, kind: "assurance-graph/v2" }),
    },
    {
      name: "schema_version",
      graph: withStoredGraphId({ ...stored, schema_version: 2 }),
    },
  ];

  for (const { name, graph } of cases) {
    const reconciled = reconcileAssuranceGraph(graph, canonicalInput);
    assert.equal(reconciled.ok, false, name);
    assert.equal(reconciled.reason_code, "GRAPH_DIVERGENCE", name);
  }
});

test("REQ-assurance-graph-002: satisfies edge is emitted only when evidence_requirements_satisfied.length > 0", () => {
  const { candidate, executionGraph, verified } = verifiedProjection();
  const withCoverage = projectAssuranceGraph({
    candidate,
    executionGraph,
    evidence: verified.evidence,
    assessments: [
      {
        schema_version: 2,
        kind: "assessment/v2",
        assessment_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
        evidence_id: verified.evidence[0].evidence_id,
        obligation_id: "req-repair-001",
        node_id: "repair-core",
        candidate_id: candidate.candidate_id,
        policy_snapshot_id: executionGraph.policy_snapshot_id,
        evidence_requirements_satisfied: ["ev:test-pass"],
      },
    ],
  });
  assert.equal(withCoverage.ok, true);
  const satisfiesEdge = withCoverage.graph.edges.find((e) => e.relation === "satisfies");
  assert.ok(satisfiesEdge, "satisfies edge must be emitted when evidence_requirements_satisfied is non-empty");

  const withoutCoverage = projectAssuranceGraph({
    candidate,
    executionGraph,
    evidence: verified.evidence,
    assessments: [
      {
        schema_version: 2,
        kind: "assessment/v2",
        assessment_id: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
        evidence_id: verified.evidence[0].evidence_id,
        obligation_id: "req-repair-001",
        node_id: "repair-core",
        candidate_id: candidate.candidate_id,
        policy_snapshot_id: executionGraph.policy_snapshot_id,
        evidence_requirements_satisfied: [],
      },
    ],
  });
  assert.equal(withoutCoverage.ok, true);
  const noSatisfiesEdge = withoutCoverage.graph.edges.find((e) => e.relation === "satisfies");
  assert.equal(noSatisfiesEdge, undefined, "satisfies edge must NOT be emitted when evidence_requirements_satisfied is empty");
});

test("REQ-assurance-graph-006: replay rejects evidence and verification mutations", () => {
  const projection = verifiedProjection();
  const { verified } = projection;
  const persistable = replayBundle(projection);
  const foreignCandidateId = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

  // Evidence candidate mismatch
  const badEvidenceCandidate = replayAssuranceGraph({
    ...persistable,
    evidence: [
      {
        ...verified.replay_evidence[0],
        evidence: { ...verified.evidence[0], candidate_id: foreignCandidateId },
      },
      ...verified.replay_evidence.slice(1),
    ],
  });
  assert.equal(badEvidenceCandidate.ok, false);
  assert.equal(badEvidenceCandidate.reason_code, "GRAPH_DIVERGENCE");

  // Evidence with verdict
  const evidenceWithVerdict = replayAssuranceGraph({
    ...persistable,
    evidence: [
      {
        ...verified.replay_evidence[0],
        evidence: { ...verified.evidence[0], verdict: "PASS" },
      },
      ...verified.replay_evidence.slice(1),
    ],
  });
  assert.equal(evidenceWithVerdict.ok, false);
  assert.equal(evidenceWithVerdict.reason_code, "GRAPH_DIVERGENCE");

  // Verification referencing non-existent evidence_id
  const badVerificationEvidence = replayAssuranceGraph({
    ...persistable,
    verification: {
      ...verified.verification,
      evidence_ids: ["sha256:0000000000000000000000000000000000000000000000000000000000000000"],
    },
  });
  assert.equal(badVerificationEvidence.ok, false);
  assert.equal(badVerificationEvidence.reason_code, "GRAPH_DIVERGENCE");

  // Verification candidate mismatch
  const badVerificationCandidate = replayAssuranceGraph({
    ...persistable,
    verification: {
      ...verified.verification,
      candidate_id: foreignCandidateId,
    },
  });
  assert.equal(badVerificationCandidate.ok, false);
  assert.equal(badVerificationCandidate.reason_code, "GRAPH_DIVERGENCE");
});

test("REQ-assurance-graph-006: replay rejects tampered evidence_id and mismatched raw bytes", () => {
  const projection = verifiedProjection();
  const persistable = replayBundle(projection);

  // Tampered evidence_id on evidence record
  const tamperedEvId = replayAssuranceGraph({
    ...persistable,
    evidence: [
      {
        ...persistable.evidence[0],
        evidence: {
          ...persistable.evidence[0].evidence,
          evidence_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        },
      },
      ...persistable.evidence.slice(1),
    ],
  });
  assert.equal(tamperedEvId.ok, false);
  assert.equal(tamperedEvId.reason_code, "GRAPH_DIVERGENCE");

  // Tampered raw bytes (bytes do not match record.digest)
  const tamperedBytes = replayAssuranceGraph({
    ...persistable,
    evidence: [
      {
        ...persistable.evidence[0],
        bytes: "tampered-content-bytes",
      },
      ...persistable.evidence.slice(1),
    ],
  });
  assert.equal(tamperedBytes.ok, false);
  assert.equal(tamperedBytes.reason_code, "GRAPH_DIVERGENCE");
});

test("REQ-assurance-graph-006: replay rejects insufficient provenance (model-reported)", () => {
  const projection = verifiedProjection();
  const { verified } = projection;
  const persistable = replayBundle(projection, {
    evidence: [
      {
        ...verified.replay_evidence[0],
        evidence: {
          ...verified.evidence[0],
          provenance: "model-reported",
        },
      },
      ...verified.replay_evidence.slice(1),
    ],
  });

  const insufficient = replayAssuranceGraph(persistable);
  assert.equal(insufficient.ok, false);
  assert.equal(insufficient.reason_code, "GRAPH_DIVERGENCE");
});

test("REQ-assurance-graph-006 [Adversarial]: replay requires trusted runner receipt authority", () => {
  const { candidate, executionGraph, verified } = verifiedProjection();
  const persistable = {
    candidate,
    executionGraph,
    evidence: verified.replay_evidence,
    assessments: verified.assessments,
    verification: verified.verification,
    canonical_inputs: verified.assurance_graph.canonical_inputs,
  };

  const missingAuthority = replayAssuranceGraph(persistable);
  assert.equal(missingAuthority.ok, false);
  assert.equal(missingAuthority.reason_code, "GRAPH_DIVERGENCE");

  const forgedAuthority = replayAssuranceGraph({
    ...persistable,
    runnerReceiptChannel: Object.freeze({
      kind: "runner-receipt-channel/v1",
      issuer_id: "node-test",
      transport: "tool-execution-transport",
    }),
  });
  assert.equal(forgedAuthority.ok, false);
  assert.equal(forgedAuthority.reason_code, "GRAPH_DIVERGENCE");
});

test("REQ-assurance-graph-006 [Adversarial]: null replay bundle fails closed", () => {
  const replayed = replayAssuranceGraph(null);

  assert.equal(replayed.ok, false);
  assert.equal(replayed.reason_code, "GRAPH_DIVERGENCE");
});



