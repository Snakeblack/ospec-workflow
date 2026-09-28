"use strict";

const { freezeCandidate, computeSourceSnapshotId } = require("../../lib/execution-identities/index.js");
const { compileExecutionGraph, createPolicySnapshot } = require("../../lib/execution-graph/index.js");
const { computeTreeDigest } = require("../../lib/worker-workspace.js");
const { verifyCandidate } = require("../../lib/independent-verifier/index.js");
const { createTestRunnerReceiptChannel } = require("../../lib/test-support/k6b-runner-receipt.js");
const { createK7ReviewSelection } = require("../../lib/review-k7-binding.js");
const { startK7ReviewLineage, beginLens, recordLensResult, freezeFindings } = require("../../lib/review-lineage.js");

const DIFF = [
  "diff --git a/src/index.js b/src/index.js",
  "--- a/src/index.js",
  "+++ b/src/index.js",
  "@@ -1 +1 @@",
  "-module.exports = 0;",
  "+module.exports = 1;",
].join("\n");

const NODE = {
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
};

const OBLIGATION = {
  id: "req-repair-001",
  criticality: "must",
  implemented_by: [NODE.node_id],
  required_evidence: ["ev:test-pass"],
};

function createReducerIssuedK7Lineage({ domain = "runtime", includeFinding = true } = {}) {
  const files = { "src/index.js": "module.exports = 1;\n" };
  const tree = computeTreeDigest(files);
  const candidate = freezeCandidate({
    repository_id: "k7-assurance-graph-fixture",
    projection: "workspace",
    base_tree: tree,
    candidate_tree: tree,
    diffText: DIFF,
    paths: Object.keys(files),
  });
  const sourceSnapshot = {
    schema_version: 1,
    repository_id: candidate.repository_id,
    base_tree_digest: candidate.base_tree,
    projection: candidate.projection,
    dependency_digests: [],
  };
  sourceSnapshot.source_snapshot_id = computeSourceSnapshotId(sourceSnapshot);
  const contract = {
    schema_version: 1,
    contract_id: "contract:k7-assurance-graph-fixture",
    family: "repair",
    version: 1,
    contract_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    source_snapshot_id: sourceSnapshot.source_snapshot_id,
    obligations: [OBLIGATION],
  };
  const policySnapshot = createPolicySnapshot({ effectiveRules: [`k7/v1:obligation:${OBLIGATION.id}=${domain}`] });
  const executionGraph = compileExecutionGraph({
    contract,
    policySnapshot,
    sourceSnapshot,
    nodes: [NODE],
    obligations: [OBLIGATION],
  });
  const rawEvidence = ["acceptance", "invariants", "contract", "negative"].map((role) => ({
    bytes: `${role}: passed`,
    provenance: "runtime-observed",
    origin: `fixture:${role}`,
    node_id: NODE.node_id,
  }));
  const receiptSpecs = ["acceptance", "invariants", "contract", "negative"].map((role) => ({
    role,
    node_id: NODE.node_id,
    evidence_requirements_satisfied: ["ev:test-pass"],
  }));
  const collector = { id: "node-test", transport: "tool-execution-transport" };
  const runnerReceiptChannel = createTestRunnerReceiptChannel({
    candidate,
    executionGraph,
    collector,
    rawEvidence,
    receiptSpecs,
  });
  const verified = verifyCandidate({
    candidate,
    executionGraph,
    policySnapshot,
    contract,
    sourceSnapshot,
    repository: { files },
    collector,
    declaredStrategy: "feature",
    rawEvidence,
    runnerReceiptChannel,
  });
  if (!verified.ok) throw new Error(verified.error || verified.reason_code);
  const issuance = {
    candidate,
    sourceSnapshot,
    contract,
    policySnapshot,
    executionGraph,
    k6b: {
      verification: verified.verification,
      assurance_graph: verified.assurance_graph,
      evidence: verified.evidence,
      assessments: verified.assessments,
      replay_evidence: verified.replay_evidence,
      runner_receipt_channel: runnerReceiptChannel,
    },
    residual: { obligations: [{ id: OBLIGATION.id, material: true }], signals: [] },
  };
  const issued = createK7ReviewSelection(issuance);
  if (!issued.ok) throw new Error(issued.error || issued.reason_code);
  let lineage = startK7ReviewLineage(issued.binding, { candidate_diff: DIFF });
  lineage = beginLens(lineage, { dimension: domain, expected_revision: lineage.revision, request_id: `fixture-${domain}-start` });
  lineage = recordLensResult(lineage, {
    dimension: domain,
    expected_revision: lineage.revision,
    request_id: `fixture-${domain}-result`,
    result: { findings: includeFinding ? [{ severity: "CRITICAL", summary: "fixture review finding", acceptance_criteria: "preserve reviewer binding" }] : [] },
  });
  lineage = freezeFindings(lineage, { expected_revision: lineage.revision, request_id: "fixture-freeze", issuance });
  return { candidate, executionGraph, verified, issuance, lineage };
}

module.exports = { createReducerIssuedK7Lineage };
