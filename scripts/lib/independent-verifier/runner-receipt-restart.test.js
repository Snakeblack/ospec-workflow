"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { freezeCandidate } = require("../execution-identities/index.js");
const { compileExecutionGraph, createPolicySnapshot } = require("../execution-graph/index.js");
const { computeTreeDigest } = require("../worker-workspace.js");
const { createFileSystemStore } = require("../filesystem-store.js");
const { createAuthorityStore } = require("../authority-store/index.js");
const { verifyCandidate } = require("./index.js");
const { replayAssuranceGraph } = require("../assurance-graph/index.js");
const { readRunnerReceiptChannel } = require("./runner-receipt.js");
const {
  persistRunnerReceipts,
  rehydrateAndIssueRunnerReceiptChannel,
} = require("./runner-receipt-store.js");
const { createTestRunnerReceiptChannel } = require("../test-support/k6b-runner-receipt.js");

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

function freezeFromFiles(files) {
  const tree = computeTreeDigest(files);
  return freezeCandidate({
    repository_id: "k6b-restart-repo",
    projection: "workspace",
    base_tree: tree,
    candidate_tree: tree,
    diff_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    paths: Object.keys(files),
  });
}

function compileGraph() {
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-fail-closed"] });
  const contract = {
    schema_version: 1,
    contract_id: "contract:k6b-restart",
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

async function tmpFile() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "k6b-restart-"));
  return path.join(dir, "head.json");
}

test("REQ-independent-verification-009 [Adversarial]: persist, empty WeakMap, reissue, same graph_id", async () => {
  const filePath = await tmpFile();
  try {
    const files = { "src/index.js": "module.exports = 1;\n" };
    const candidate = freezeFromFiles(files);
    const executionGraph = compileGraph();
    const rawEvidence = featureRaw();
    const receiptSpecs = featureReceipts();
    const channelA = createTestRunnerReceiptChannel({
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
      runnerReceiptChannel: channelA,
    });
    assert.equal(verified.ok, true, verified.error || verified.reason_code);
    const graphIdA = verified.assurance_graph.graph_id;

    const innerA = createFileSystemStore({ filePath, initializeIfMissing: true });
    const storeA = createAuthorityStore({ store: innerA });
    const persisted = await persistRunnerReceipts(storeA, channelA);
    assert.equal(persisted.ok, true, persisted.error || persisted.code);

    const bundle = {
      candidate,
      executionGraph,
      evidence: verified.replay_evidence,
      assessments: verified.assessments,
      verification: verified.verification,
      canonical_inputs: verified.assurance_graph.canonical_inputs,
    };

    const innerB = createFileSystemStore({ filePath });
    const storeB = createAuthorityStore({ store: innerB });
    const rehydrated = await rehydrateAndIssueRunnerReceiptChannel(storeB);
    assert.equal(rehydrated.ok, true, rehydrated.error);
    assert.notEqual(rehydrated.channel, channelA);

    const replayed = replayAssuranceGraph({
      ...bundle,
      runnerReceiptChannel: rehydrated.channel,
    });
    assert.equal(replayed.ok, true, replayed.error || replayed.reason_code);
    assert.equal(replayed.graph.graph_id, graphIdA);

    const staleA = replayAssuranceGraph({
      ...bundle,
      runnerReceiptChannel: channelA,
    });
    assert.equal(staleA.ok, true, "in-process A channel remains valid until process death");
  } finally {
    try { await fs.unlink(filePath); } catch (_) {}
  }
});

test("REQ-independent-verification-009 [Adversarial]: missing persisted receipt blocks reissue for that id and replay diverges", async () => {
  const filePath = await tmpFile();
  try {
    const files = { "src/index.js": "module.exports = 1;\n" };
    const candidate = freezeFromFiles(files);
    const executionGraph = compileGraph();
    const rawEvidence = featureRaw();
    const receiptSpecs = featureReceipts();
    const channelA = createTestRunnerReceiptChannel({
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
      runnerReceiptChannel: channelA,
    });
    assert.equal(verified.ok, true, verified.error || verified.reason_code);

    const gate = readRunnerReceiptChannel(channelA);
    const droppedId = gate.receipts[0].receipt_id;
    const remaining = {};
    for (const receipt of gate.receipts.slice(1)) {
      remaining[receipt.receipt_id] = JSON.parse(JSON.stringify(receipt));
    }

    const innerA = createFileSystemStore({ filePath, initializeIfMissing: true });
    const storeA = createAuthorityStore({ store: innerA });
    const seeded = await storeA.commitRunnerReceipts(remaining);
    assert.equal(seeded.ok, true, seeded.code);
    assert.equal(storeA.snapshot().runner_receipts[droppedId], undefined);

    const innerB = createFileSystemStore({ filePath });
    const storeB = createAuthorityStore({ store: innerB });
    const rehydrated = await rehydrateAndIssueRunnerReceiptChannel(storeB);
    assert.equal(rehydrated.ok, true, rehydrated.error);
    const reissuedIds = new Set(rehydrated.receipts.map((receipt) => receipt.receipt_id));
    assert.equal(reissuedIds.has(droppedId), false);

    const replayed = replayAssuranceGraph({
      candidate,
      executionGraph,
      evidence: verified.replay_evidence,
      assessments: verified.assessments,
      verification: verified.verification,
      canonical_inputs: verified.assurance_graph.canonical_inputs,
      runnerReceiptChannel: rehydrated.channel,
    });
    assert.equal(replayed.ok, false);
    assert.equal(replayed.reason_code, "GRAPH_DIVERGENCE");
  } finally {
    try { await fs.unlink(filePath); } catch (_) {}
  }
});
