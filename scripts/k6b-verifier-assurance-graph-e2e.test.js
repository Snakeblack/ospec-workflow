"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { freezeCandidate } = require("./lib/execution-identities/index.js");
const { compileExecutionGraph, createPolicySnapshot } = require("./lib/execution-graph/index.js");
const { computeTreeDigest } = require("./lib/worker-workspace.js");
const { verifyCandidate } = require("./lib/independent-verifier/index.js");
const {
  projectAssuranceGraph,
  computeInvalidationClosure,
} = require("./lib/assurance-graph/index.js");

const CONFIG_PATH = path.resolve(__dirname, "..", "openspec", "config.yaml");

const NODES = [
  {
    node_id: "repair-core",
    kind: "repair-action/v1",
    operation: "apply_repair_patch",
    objective: "Apply repair changes to target file",
    dependencies: [],
    ownership: { owner: "agent:repair", mode: "exclusive" },
    allowed_paths: ["src/index.js"],
    invariants: ["inv-fail-closed"],
    required_evidence: ["ev:test-pass"],
    budget_ref: "budget:default",
  },
];

const OBLIGATIONS = [
  {
    id: "req-repair-001",
    criticality: "must",
    implemented_by: ["repair-core"],
    required_evidence: ["ev:test-pass"],
  },
];

function featureEvidence() {
  return [
    { role: "acceptance", bytes: "acceptance ok", provenance: "runtime-observed", origin: "e2e-acceptance", node_id: "repair-core", obligation_ids: ["req-repair-001"] },
    { role: "invariants", bytes: "invariants ok", provenance: "runtime-observed", origin: "e2e-invariants", node_id: "repair-core", obligation_ids: ["req-repair-001"] },
    { role: "integration", bytes: "integration ok", provenance: "runtime-observed", origin: "e2e-integration", node_id: "repair-core", obligation_ids: ["req-repair-001"] },
    { role: "negative", bytes: "negative ok", provenance: "runtime-observed", origin: "e2e-negative", node_id: "repair-core", obligation_ids: ["req-repair-001"] },
  ];
}

test("E2E K6b: K4b-frozen Candidate → verify → project twice → successor invalidation rejects stale evidence", () => {
  const configBefore = fs.readFileSync(CONFIG_PATH, "utf8");
  const files = { "src/index.js": "function add(a, b) { return a + b; }\nmodule.exports = { add };\n" };
  const tree = computeTreeDigest(files);
  const predecessor = freezeCandidate({
    repository_id: "k6b-e2e-repo",
    projection: "workspace",
    base_tree: tree,
    candidate_tree: tree,
    diff_hash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    paths: ["src/index.js"],
  });
  assert.equal(predecessor.kind, "candidate/v2");

  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-fail-closed"] });
  const contract = {
    schema_version: 1,
    contract_id: "contract:k6b-e2e",
    family: "repair",
    version: 1,
    contract_digest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    source_snapshot_id: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    obligations: OBLIGATIONS,
  };
  const executionGraph = compileExecutionGraph({
    contract,
    policySnapshot,
    nodes: NODES,
    obligations: OBLIGATIONS,
  });

  const verified = verifyCandidate({
    candidate: predecessor,
    executionGraph,
    policySnapshot,
    contract,
    repository: { files },
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
  });
  assert.equal(verified.ok, true, verified.error || verified.reason_code);
  assert.equal(verified.verification.verdict, "PASS");
  assert.equal(verified.evidence.some((ev) => Object.prototype.hasOwnProperty.call(ev, "verdict")), false);

  const classified = verified.evidence.map((evidence) => ({ evidence, obligation_ids: ["req-repair-001"] }));
  const firstGraph = projectAssuranceGraph({
    candidate: predecessor,
    executionGraph,
    evidence: classified,
    verification: verified.verification,
  });
  const secondGraph = projectAssuranceGraph({
    candidate: predecessor,
    executionGraph,
    evidence: [...classified].reverse(),
    verification: verified.verification,
  });
  assert.equal(firstGraph.ok, true);
  assert.equal(secondGraph.ok, true);
  assert.equal(firstGraph.graph.graph_id, secondGraph.graph.graph_id);
  assert.deepEqual(firstGraph.graph.edges, secondGraph.graph.edges);
  assert.equal(verified.assurance_graph.graph_id, firstGraph.graph.graph_id);

  const successorFiles = { "src/index.js": "function add(a, b) { return a + b + 1; }\nmodule.exports = { add };\n" };
  const successorTree = computeTreeDigest(successorFiles);
  const successor = freezeCandidate({
    repository_id: "k6b-e2e-repo",
    projection: "workspace",
    base_tree: tree,
    candidate_tree: successorTree,
    diff_hash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    paths: ["src/index.js"],
    predecessorCandidate: predecessor,
  });
  assert.equal(successor.relation, "changed");
  assert.equal(successor.predecessor_id, predecessor.candidate_id);

  const dependentId = verified.evidence[0].evidence_id;
  const independentId = "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd";
  const graphForClosure = {
    ...firstGraph.graph,
    nodes: [
      ...firstGraph.graph.nodes,
      { id: independentId, kind: "test-evidence" },
      { id: "unrelated-source", kind: "source" },
    ],
    edges: [
      ...firstGraph.graph.edges,
      { from: independentId, relation: "derived-from", to: "unrelated-source" },
      { from: successor.candidate_id, relation: "invalidates", to: dependentId },
    ],
  };
  const closure = computeInvalidationClosure(graphForClosure, {
    predecessorCandidate: predecessor,
    successorCandidate: successor,
    changedSubjectIds: [predecessor.candidate_id],
  });
  assert.ok(closure.invalidated_node_ids.includes(dependentId));
  assert.ok(closure.preserved_evidence_ids.includes(independentId));

  const staleReuse = verifyCandidate({
    candidate: predecessor,
    executionGraph,
    policySnapshot,
    contract,
    repository: { files },
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
    priorAssuranceGraph: graphForClosure,
  });
  assert.equal(staleReuse.ok, false);
  assert.equal(staleReuse.reason_code, "STALE_EVIDENCE");

  const configAfter = fs.readFileSync(CONFIG_PATH, "utf8");
  assert.equal(configAfter, configBefore);
  assert.match(configAfter, /tdd_mode:\s*focused/);
});
