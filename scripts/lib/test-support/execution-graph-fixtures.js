"use strict";

const { createPolicySnapshot } = require("../execution-graph/policy-snapshot.js");
const { compileExecutionGraph } = require("../execution-graph/compiler.js");
const { computeSourceSnapshotId } = require("../execution-identities/index.js");

/**
 * Creates a sample valid Repair route contract.
 * @param {Object} [overrides]
 * @returns {Object}
 */
function createSampleRepairContract(overrides = {}) {
  return {
    schema_version: 1,
    contract_id: "contract:repair-sample-001",
    family: "repair",
    version: 1,
    contract_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    source_snapshot_id: createSampleSourceSnapshotId(),
    obligations: [
      {
        id: "req-repair-patch-001",
        criticality: "must",
        implemented_by: ["repair-patch"],
        required_evidence: ["ev:patch-proof"],
      },
      {
        id: "req-repair-verify-001",
        criticality: "must",
        implemented_by: ["repair-verify"],
        required_evidence: ["ev:test-pass"],
      },
    ],
    ...overrides,
  };
}

/**
 * Creates a sample ExecutionGraph DAG for Repair.
 * @param {Object} [options]
 * @returns {Object}
 */
function createSampleExecutionGraph(options = {}) {
  const contract = createSampleRepairContract(options.contractOverrides);
  const policySnapshot = createPolicySnapshot(options.policyOverrides);
  const sourceSnapshotId = options.sourceSnapshotId || contract.source_snapshot_id;

  const nodes = options.nodes || [
    {
      node_id: "repair-patch",
      kind: "repair-action/v1",
      operation: "apply_repair_patch",
      objective: "Apply repair code modifications",
      dependencies: [],
      ownership: {
        owner: "agent:repair",
        mode: "exclusive",
      },
      allowed_paths: ["src/**"],
      invariants: ["inv-fail-closed"],
      required_evidence: ["ev:patch-proof"],
      budget_ref: "budget:default",
    },
    {
      node_id: "repair-verify",
      kind: "repair-action/v1",
      operation: "verify_repair_conformance",
      objective: "Run automated verification on repair modifications",
      dependencies: ["repair-patch"],
      ownership: {
        owner: "agent:verify",
        mode: "shared",
      },
      allowed_paths: ["src/**", "tests/**"],
      invariants: ["inv-no-direct-mutation"],
      required_evidence: ["ev:test-pass"],
      budget_ref: "budget:default",
    },
  ];

  const obligations = options.obligations || [
    {
      id: "req-repair-patch-001",
      criticality: "must",
      implemented_by: ["repair-patch"],
      required_evidence: ["ev:patch-proof"],
    },
    {
      id: "req-repair-verify-001",
      criticality: "must",
      implemented_by: ["repair-verify"],
      required_evidence: ["ev:test-pass"],
    },
  ];

  return compileExecutionGraph({
    contract,
    policySnapshot,
    sourceSnapshotId,
    nodes,
    obligations,
  });
}

/**
 * Creates a map of pre-recorded fixture results with canonical provenance for replay testing.
 * @param {Object} [graph]
 * @returns {Object}
 */
function createSampleFixtureResults(graph) {
  const g = graph || createSampleExecutionGraph();
  const { compileWorkOrdersV2, defaultPathInventory } = require("../execution-graph/work-order-compiler.js");
  let woMap = new Map();
  try {
    const wos = compileWorkOrdersV2(g, { pathInventory: defaultPathInventory(g.source_snapshot_id) });
    woMap = new Map(wos.map((w) => [w.node_id, w.work_order_id]));
  } catch {}

  return {
    "repair-patch": {
      ok: true,
      status: "completed",
      outcome: "completed",
      graph_id: g.graph_id,
      work_order_id: woMap.get("repair-patch"),
      evidence: {
        "ev:patch-proof": { digest: "sha256:evidence-patch-001" },
      },
      logs: ["Applied patch successfully"],
    },
    "repair-verify": {
      ok: true,
      status: "completed",
      outcome: "completed",
      graph_id: g.graph_id,
      work_order_id: woMap.get("repair-verify"),
      evidence: {
        "ev:test-pass": { digest: "sha256:evidence-verify-001" },
      },
      logs: ["Tests passed 100%"],
    },
  };
}

function createSampleSourceSnapshot() {
  const snapshot = {
    kind: "source-snapshot/v1",
    schema_version: 1,
    repository_id: "repo:k4a-fixture",
    base_tree_digest: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    projection: "workspace",
    dependency_digests: [],
  };
  return { ...snapshot, source_snapshot_id: computeSourceSnapshotId(snapshot) };
}

function createSampleSourceSnapshotId() {
  return createSampleSourceSnapshot().source_snapshot_id;
}

module.exports = {
  createSampleRepairContract,
  createSampleExecutionGraph,
  createSampleFixtureResults,
  createSampleSourceSnapshot,
  createSampleSourceSnapshotId,
};
