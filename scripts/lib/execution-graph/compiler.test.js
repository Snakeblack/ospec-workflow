"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { validateInstance, loadSchemaById } = require("../kernel-schema-validator.js");
const { createPolicySnapshot } = require("./policy-snapshot.js");
const { compileExecutionGraph, computeGraphId, FORBIDDEN_OPERATIONS } = require("./compiler.js");

const ROOT = path.resolve(__dirname, "..", "..", "..");

const sampleNodes = [
  {
    node_id: "repair-core",
    kind: "repair-action/v1",
    operation: "apply_repair_patch",
    objective: "Apply repair changes to target file",
    dependencies: [],
    ownership: {
      owner: "agent:repair",
      mode: "exclusive",
    },
    allowed_paths: ["src/**"],
    invariants: ["inv-fail-closed"],
    required_evidence: ["ev:test-pass"],
    budget_ref: "budget:default",
  },
];

const sampleObligations = [
  {
    id: "req-repair-001",
    criticality: "must",
    implemented_by: ["repair-core"],
    required_evidence: ["ev:test-pass"],
  },
];

const sampleSnapshotId = "sha256:4444444444444444444444444444444444444444444444444444444444444444";

const sampleContract = {
  schema_version: 1,
  contract_id: "contract:repair-001",
  family: "repair",
  version: 1,
  contract_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  source_snapshot_id: sampleSnapshotId,
};

test("Compiler: generates valid semantic ExecutionGraph for Repair route", () => {
  const policySnapshot = createPolicySnapshot({
    effectiveRules: ["rule-fail-closed"],
  });

  const graph = compileExecutionGraph({
    contract: sampleContract,
    policySnapshot,
    nodes: sampleNodes,
    obligations: sampleObligations,
  });

  assert.equal(graph.schema_version, 1);
  assert.match(graph.graph_id, /^sha256:[a-f0-9]{64}$/);
  assert.equal(graph.contract_digest, sampleContract.contract_digest);
  assert.equal(graph.policy_bundle_digest, policySnapshot.policy_bundle_digest);
  assert.equal(graph.policy_snapshot_id, policySnapshot.snapshot_id);
  assert.equal(graph.source_snapshot_id, sampleSnapshotId);
  assert.deepEqual(graph.nodes, sampleNodes);
  assert.deepEqual(graph.obligations, sampleObligations);

  const schema = loadSchemaById("ospec://schemas/kernel/execution-graph/v1", { rootDir: ROOT });
  const validation = validateInstance(schema, graph);
  assert.equal(validation.valid, true, `Compiled graph must validate: ${JSON.stringify(validation.errors)}`);
});

test("Compiler: computeGraphId incorporates obligations in SHA-256 preimage", () => {
  const cDigest = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
  const psId1 = "sha256:4444444444444444444444444444444444444444444444444444444444444444";
  const pDigest = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
  const sId1 = "sha256:3333333333333333333333333333333333333333333333333333333333333333";

  const id1 = computeGraphId(cDigest, psId1, pDigest, sId1, sampleNodes, sampleObligations);
  const id2 = computeGraphId(cDigest, psId1, pDigest, sId1, sampleNodes, sampleObligations);
  assert.equal(id1, id2);

  const altObligations = [
    {
      id: "req-repair-001",
      criticality: "should",
      implemented_by: ["repair-core"],
      required_evidence: ["ev:test-pass"],
    },
  ];
  const idAlt = computeGraphId(cDigest, psId1, pDigest, sId1, sampleNodes, altObligations);
  assert.notEqual(id1, idAlt);
});

test("Compiler: explicit empty sourceSnapshotId fails closed with invalid-source-snapshot-id", () => {
  const policySnapshot = createPolicySnapshot();

  assert.throws(
    () => {
      compileExecutionGraph({
        contract: sampleContract,
        policySnapshot,
        sourceSnapshotId: "",
        nodes: sampleNodes,
        obligations: sampleObligations,
      });
    },
    (err) => err.code === "invalid-source-snapshot-id"
  );
});

test("Compiler: forged policySnapshot fails with policy-snapshot-mismatch", () => {
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-alpha"] });
  policySnapshot.snapshot_id = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

  assert.throws(
    () => {
      compileExecutionGraph({
        contract: sampleContract,
        policySnapshot,
        nodes: sampleNodes,
        obligations: sampleObligations,
      });
    },
    (err) => err.code === "policy-snapshot-mismatch"
  );
});

test("Compiler: caller cannot downgrade contract MUST obligation to should or may", () => {
  const policySnapshot = createPolicySnapshot();
  const contractWithMust = {
    ...sampleContract,
    obligations: [
      {
        id: "req-must-001",
        criticality: "must",
        implemented_by: ["repair-core"],
        required_evidence: ["ev:test-pass"],
      },
    ],
  };

  const callerDowngrade = [
    {
      id: "req-must-001",
      criticality: "should",
      implemented_by: ["repair-core"],
      required_evidence: ["ev:test-pass"],
    },
  ];

  const graph = compileExecutionGraph({
    contract: contractWithMust,
    policySnapshot,
    nodes: sampleNodes,
    obligations: callerDowngrade,
  });

  assert.equal(graph.obligations[0].criticality, "must");
});

test("Compiler: rejects missing or malformed source_snapshot_id fail-closed", () => {
  const policySnapshot = createPolicySnapshot();

  const invalidSnapshotIds = [
    undefined,
    null,
    "",
    "not-a-sha256",
    "sha256:UPPERCASE0123456789abcdef0123456789abcdef0123456789abcdef0123456789a",
    "sha256:short",
  ];

  for (const badId of invalidSnapshotIds) {
    assert.throws(
      () => {
        compileExecutionGraph({
          contract: {
            schema_version: 1,
            contract_id: "contract:test",
            family: "repair",
            version: 1,
            contract_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            source_snapshot_id: badId,
          },
          policySnapshot,
          nodes: sampleNodes,
          obligations: sampleObligations,
        });
      },
      (err) => err.code === "invalid-source-snapshot-id" || err.message.includes("source_snapshot_id")
    );
  }
});

test("Compiler: detects dependency cycles and fails closed", () => {
  const policySnapshot = createPolicySnapshot();
  const cyclicNodes = [
    {
      ...sampleNodes[0],
      node_id: "node-a",
      dependencies: ["node-b"],
    },
    {
      ...sampleNodes[0],
      node_id: "node-b",
      dependencies: ["node-a"],
    },
  ];

  assert.throws(
    () => {
      compileExecutionGraph({
        contract: sampleContract,
        policySnapshot,
        nodes: cyclicNodes,
        obligations: [
          { id: "req-a", criticality: "must", implemented_by: ["node-a"], required_evidence: ["ev:test"] },
          { id: "req-b", criticality: "must", implemented_by: ["node-b"], required_evidence: ["ev:test"] },
        ],
      });
    },
    (err) => err.code === "cyclic-dependency-detected" || err.message.includes("cycle")
  );
});

test("Compiler: defensive cloning prevents post-compilation mutation", () => {
  const policySnapshot = createPolicySnapshot();
  const mutableNodes = [structuredClone(sampleNodes[0])];
  const mutableObligations = [structuredClone(sampleObligations[0])];

  const graph = compileExecutionGraph({
    contract: sampleContract,
    policySnapshot,
    nodes: mutableNodes,
    obligations: mutableObligations,
  });

  // Mutate the original inputs
  mutableNodes[0].operation = "mutated_operation";
  mutableObligations[0].criticality = "may";

  // Mutate the returned graph objects
  graph.nodes[0].operation = "another_mutation";

  // Re-compile under clean inputs and verify immutability
  const cleanGraph = compileExecutionGraph({
    contract: sampleContract,
    policySnapshot,
    nodes: sampleNodes,
    obligations: sampleObligations,
  });

  assert.equal(cleanGraph.nodes[0].operation, "apply_repair_patch");
  assert.equal(cleanGraph.obligations[0].criticality, "must");
});

test("Compiler: contract obligations are authoritative and cannot be stripped by empty arrays", () => {
  const policySnapshot = createPolicySnapshot();
  const contractWithObligations = {
    ...sampleContract,
    obligations: [
      {
        id: "req-contract-must",
        criticality: "must",
        implemented_by: ["repair-core"],
        required_evidence: ["ev:test-pass"],
      },
    ],
  };

  // Passing empty array [] must retain contract MUST obligations
  const graph = compileExecutionGraph({
    contract: contractWithObligations,
    policySnapshot,
    nodes: sampleNodes,
    obligations: [],
  });

  assert.equal(graph.obligations.length, 1);
  assert.equal(graph.obligations[0].id, "req-contract-must");
});

test("Compiler: rejects microscopic worker action nodes fail-closed", () => {
  const policySnapshot = createPolicySnapshot();

  for (const badOp of FORBIDDEN_OPERATIONS) {
    const badNodes = [
      {
        ...sampleNodes[0],
        operation: badOp,
      },
    ];

    assert.throws(
      () => {
        compileExecutionGraph({
          contract: sampleContract,
          policySnapshot,
          nodes: badNodes,
          obligations: sampleObligations,
        });
      },
      (err) => err.message.includes(badOp) || err.code === "microscopic-node-rejected"
    );
  }
});

test("Compiler: rejects nodes without required semantic fields", () => {
  const policySnapshot = createPolicySnapshot();

  for (const field of ["objective", "ownership", "required_evidence"]) {
    const invalidNode = { ...sampleNodes[0] };
    delete invalidNode[field];

    assert.throws(
      () => {
        compileExecutionGraph({
          contract: sampleContract,
          policySnapshot,
          nodes: [invalidNode],
          obligations: sampleObligations,
        });
      },
      (err) => err.code === "missing-required-node-field" && err.field === field
    );
  }
});

test("Compiler: rejects dependencies that do not identify a graph node", () => {
  const policySnapshot = createPolicySnapshot();
  const nodeWithUnknownDependency = {
    ...sampleNodes[0],
    dependencies: ["missing-node"],
  };

  assert.throws(
    () => {
      compileExecutionGraph({
        contract: sampleContract,
        policySnapshot,
        nodes: [nodeWithUnknownDependency],
        obligations: sampleObligations,
      });
    },
    (err) =>
      err.code === "unknown-node-dependency" &&
      err.node_id === "repair-core" &&
      err.dependency === "missing-node"
  );
});

test("Compiler: rejects unmapped MUST obligations fail-closed", () => {
  const policySnapshot = createPolicySnapshot();
  const orphanObligations = [
    {
      id: "req-unmapped-must",
      criticality: "must",
      implemented_by: [],
      required_evidence: ["ev:test"],
    },
  ];

  assert.throws(
    () => {
      compileExecutionGraph({
        contract: sampleContract,
        policySnapshot,
        nodes: sampleNodes,
        obligations: orphanObligations,
      });
    },
    (err) => err.message.includes("req-unmapped-must")
  );
});
