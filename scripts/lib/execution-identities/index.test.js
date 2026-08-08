"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  computeSourceSnapshotId,
  computeWorkOrderId,
  computeWorkResultId,
  computeCandidateId,
  freezeCandidate,
  validateWorkOrderBinding,
  validateWorkResultBinding,
  evaluateCandidateRelation,
  validateIdentityKind,
  validateCandidateV2,
  EXPECTED_KINDS
} = require("./index.js");

test("REQ-execution-identities-001: Distinct digests with domain prefixes for four identities", () => {
  const snapshot = {
    repositoryId: "repo-1",
    baseTreeDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    projection: "workspace",
    dependencyDigests: []
  };
  const snapshotId = computeSourceSnapshotId(snapshot);
  assert.ok(snapshotId.startsWith("sha256:"), "snapshot digest must start with sha256:");

  const workOrder = {
    sourceSnapshotId: snapshotId,
    nodeId: "node-1",
    role: "worker",
    operation: "build",
    objective: "compile",
    dependencies: [],
    ownership: { owner: "worker" },
    allowedPaths: ["src/"],
    invariants: [],
    requiredEvidence: [],
    budget: { model_turns: 5, patches: 2, commands: 10, wall_time_minutes: 5, changed_lines: 50 }
  };
  const orderId = computeWorkOrderId(workOrder);
  assert.ok(orderId.startsWith("sha256:"), "order digest must start with sha256:");
  assert.notEqual(orderId, snapshotId, "snapshotId and orderId must be distinct");

  const workResult = {
    workOrderId: orderId,
    sourceSnapshotId: snapshotId,
    patch: "diff --git a/file.js b/file.js\n...",
    commands: [],
    logs: ["ok"],
    exitCode: 0,
    filesystemInventory: []
  };
  const resultId = computeWorkResultId(workResult);
  assert.ok(resultId.startsWith("sha256:"), "result digest must start with sha256:");
  assert.notEqual(resultId, orderId);

  const candidateInput = {
    repositoryId: "repo-1",
    projection: "workspace",
    baseTree: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    candidateTree: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    diffText: "diff ...",
    paths: ["src/index.js"]
  };
  const frozen = freezeCandidate(candidateInput);
  assert.ok(frozen.candidate_id.startsWith("sha256:"));
  assert.notEqual(frozen.candidate_id, resultId);
});

test("REQ-execution-identities-001: Single byte mutation alters digest", () => {
  const snapshot1 = {
    repositoryId: "repo-1",
    baseTreeDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    projection: "workspace",
    dependencyDigests: []
  };
  const snapshot2 = {
    repositoryId: "repo-2",
    baseTreeDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    projection: "workspace",
    dependencyDigests: []
  };

  assert.notEqual(computeSourceSnapshotId(snapshot1), computeSourceSnapshotId(snapshot2));
});

test("REQ-execution-identities-002: SourceSnapshot digest incorporates projection and base tree", () => {
  const wsSnap = {
    repositoryId: "repo-1",
    baseTreeDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    projection: "workspace"
  };
  const stagedSnap = {
    repositoryId: "repo-1",
    baseTreeDigest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    projection: "staged"
  };

  assert.notEqual(computeSourceSnapshotId(wsSnap), computeSourceSnapshotId(stagedSnap));
});

test("REQ-execution-identities-004: Candidate freeze restricts projections and tracks modes & untracked", () => {
  // Reject commit projection
  assert.throws(() => {
    freezeCandidate({
      repositoryId: "repo-1",
      projection: "commit",
      baseTree: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      candidateTree: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      diffText: "diff",
      paths: ["a.js"]
    });
  }, /projection/i);

  // File mode change alters CandidateId
  const baseTreeHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
  const candTreeHash1 = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
  const candTreeHash2 = "sha256:3333333333333333333333333333333333333333333333333333333333333333";

  const frozenMode1 = freezeCandidate({
    repositoryId: "repo-1",
    projection: "workspace",
    baseTree: baseTreeHash,
    candidateTree: candTreeHash1,
    diffText: "diff",
    paths: ["a.js"],
    fileModes: { "a.js": "100644" }
  });

  const frozenMode2 = freezeCandidate({
    repositoryId: "repo-1",
    projection: "workspace",
    baseTree: baseTreeHash,
    candidateTree: candTreeHash1,
    diffText: "diff",
    paths: ["a.js"],
    fileModes: { "a.js": "100755" }
  });

  assert.notEqual(frozenMode1.candidate_id, frozenMode2.candidate_id);
  assert.notEqual(frozenMode1.changed_paths_modes_digest, frozenMode2.changed_paths_modes_digest);

  // Untracked files alter CandidateId
  const frozenUntracked1 = freezeCandidate({
    repositoryId: "repo-1",
    projection: "workspace",
    baseTree: baseTreeHash,
    candidateTree: candTreeHash1,
    diffText: "diff",
    paths: ["a.js"],
    intendedUntracked: [{ path: "b.js", hash: "sha256:9999999999999999999999999999999999999999999999999999999999999999" }]
  });

  assert.notEqual(frozenMode1.candidate_id, frozenUntracked1.candidate_id);
  assert.ok(frozenUntracked1.intended_untracked_digest);
});

test("REQ-execution-identities-004: Candidate freeze path canonicalization and deduplication", () => {
  const frozen = freezeCandidate({
    repositoryId: "repo-1",
    projection: "staged",
    baseTree: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    candidateTree: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    diffText: "diff",
    paths: ["src\\utils\\foo.js", "src/utils/foo.js", "src\\bar.js"]
  });

  assert.deepEqual(frozen.paths, ["src/bar.js", "src/utils/foo.js"]);
  assert.equal(frozen.projection, "staged");
});

test("REQ-execution-identities-005: Fail-closed initial candidate relation evaluation", () => {
  const baseTreeHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
  const candTreeHash1 = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
  const candTreeHash2 = "sha256:3333333333333333333333333333333333333333333333333333333333333333";

  const c1 = freezeCandidate({
    repositoryId: "repo-1",
    projection: "workspace",
    baseTree: baseTreeHash,
    candidateTree: candTreeHash1,
    diffText: "diff",
    paths: ["a.js"]
  });

  const c2 = freezeCandidate({
    repositoryId: "repo-1",
    projection: "workspace",
    baseTree: baseTreeHash,
    candidateTree: candTreeHash1,
    diffText: "diff",
    paths: ["a.js"]
  });

  const c3 = freezeCandidate({
    repositoryId: "repo-1",
    projection: "workspace",
    baseTree: baseTreeHash,
    candidateTree: candTreeHash2,
    diffText: "diff-changed",
    paths: ["a.js"]
  });

  // exact
  const relExact = evaluateCandidateRelation(c1, c2);
  assert.equal(relExact.relation, "exact");
  assert.equal(relExact.action, "validate");

  // changed
  const relChanged = evaluateCandidateRelation(c1, c3);
  assert.equal(relChanged.relation, "changed");
  assert.equal(relChanged.action, "re-evaluate");

  // forged ambiguous marker (no typed selector) must not bypass freeze gate
  const relForgedAmbiguous = evaluateCandidateRelation(c1, { ambiguous: true });
  assert.equal(relForgedAmbiguous.relation, "unknown");
  assert.equal(relForgedAmbiguous.action, "stop");
  assert.equal(relForgedAmbiguous.reason_code, "INVALID_FROZEN_CANDIDATE");

  const relForgedAmbiguousBase = evaluateCandidateRelation({ ambiguous: true }, c1);
  assert.equal(relForgedAmbiguousBase.reason_code, "INVALID_FROZEN_CANDIDATE");

  // typed relation selector may short-circuit after positive kind check
  const typedAmbiguous = { kind: "candidate-relation-selector", ambiguous: true };
  const relAmbiguous = evaluateCandidateRelation(c1, typedAmbiguous);
  assert.equal(relAmbiguous.relation, "ambiguous");
  assert.equal(relAmbiguous.action, "decide");

  const relAmbiguousBase = evaluateCandidateRelation(typedAmbiguous, c1);
  assert.equal(relAmbiguousBase.relation, "ambiguous");
  assert.equal(relAmbiguousBase.action, "decide");

  // unknown
  const relUnknown = evaluateCandidateRelation(c1, null);
  assert.equal(relUnknown.relation, "unknown");
  assert.equal(relUnknown.action, "stop");

  // forged unknown marker (no typed selector) → INVALID_FROZEN_CANDIDATE
  const relForgedUnknown = evaluateCandidateRelation({ relation: "unknown" }, c1);
  assert.equal(relForgedUnknown.relation, "unknown");
  assert.equal(relForgedUnknown.action, "stop");
  assert.equal(relForgedUnknown.reason_code, "INVALID_FROZEN_CANDIDATE");

  const typedUnknown = { kind: "candidate-relation-selector", relation: "unknown" };
  const relUnknownSel = evaluateCandidateRelation(typedUnknown, c1);
  assert.equal(relUnknownSel.relation, "unknown");
  assert.equal(relUnknownSel.action, "stop");
});

test("REQ-execution-identities-006: Non-aliasing type guards and rejection of mutable targets", () => {
  const workResultPayload = {
    work_result_id: "sha256:1234",
    work_order_id: "sha256:5678",
    source_snapshot_id: "sha256:90ab",
    patch: "diff ..."
  };

  // Reject WorkResult as Candidate
  const v1 = validateIdentityKind(workResultPayload, "Candidate");
  assert.equal(v1.ok, false);
  assert.equal(v1.reason_code, "KIND_MISMATCH");

  // Reject Candidate as EvaluationAttestation
  const candidateRecord = freezeCandidate({
    repositoryId: "repo-1",
    projection: "workspace",
    baseTree: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    candidateTree: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    diffText: "diff",
    paths: ["a.js"]
  });
  const v2 = validateIdentityKind(candidateRecord, "EvaluationAttestation");
  assert.equal(v2.ok, false);
  assert.equal(v2.reason_code, "KIND_MISMATCH");

  // Reject mutable branch reference for Attestation / Authorization target
  const mutableBranchTarget = {
    kind: "candidate-evaluation-attestation/v1",
    targetRef: "refs/heads/main",
    target: "sha256:1111111111111111111111111111111111111111111111111111111111111111"
  };
  const v3 = validateIdentityKind(mutableBranchTarget, "EvaluationAttestation");
  assert.equal(v3.ok, false);
  assert.equal(v3.reason_code, "MUTABLE_TARGET_REJECTED");

  const mutablePathTarget = {
    kind: "delivery-authorization/v1",
    targetPath: "./src",
    target: "sha256:1111111111111111111111111111111111111111111111111111111111111111"
  };
  const v4 = validateIdentityKind(mutablePathTarget, "DeliveryAuthorization");
  assert.equal(v4.ok, false);
  assert.equal(v4.reason_code, "MUTABLE_TARGET_REJECTED");

  // Invalid payload
  const v5 = validateIdentityKind(null, "Candidate");
  assert.equal(v5.ok, false);
  assert.equal(v5.reason_code, "INVALID_PAYLOAD");
});

test("REQ-execution-identities-001: Digest functions reject null or non-object inputs", () => {
  assert.throws(() => computeSourceSnapshotId(null), TypeError);
  assert.throws(() => computeWorkOrderId(null), TypeError);
  assert.throws(() => computeWorkResultId(null), TypeError);
  assert.throws(() => computeCandidateId(null), TypeError);
  assert.throws(() => freezeCandidate(null), TypeError);
});

test("REQ-execution-identities-007: computeSourceSnapshotId validates required inputs and digest format", () => {
  // Ill-formed baseTreeDigest
  assert.throws(() => {
    computeSourceSnapshotId({
      repositoryId: "repo-1",
      baseTreeDigest: "invalid-sha256",
      projection: "workspace"
    });
  }, /digest/i);

  // Missing required baseTreeDigest
  assert.throws(() => {
    computeSourceSnapshotId({
      repositoryId: "repo-1",
      projection: "workspace"
    });
  }, /base/i);
});

test("REQ-execution-identities-003: computeWorkOrderId canonical payload includes dependencies, ownership, required_evidence and validates snapshot digest", () => {
  const baseWorkOrder = {
    sourceSnapshotId: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    nodeId: "node-1",
    role: "worker",
    operation: "build",
    objective: "compile",
    dependencies: [],
    ownership: { owner: "worker" },
    allowedPaths: ["src/"],
    invariants: [],
    requiredEvidence: [],
    budget: { model_turns: 5, patches: 2, commands: 10, wall_time_minutes: 5, changed_lines: 50 }
  };

  // Reject ill-formed sourceSnapshotId
  assert.throws(() => {
    computeWorkOrderId({ ...baseWorkOrder, sourceSnapshotId: "not-sha256" });
  }, /snapshot/i);

  // Differing dependencies yield distinct work_order_id
  const order1 = computeWorkOrderId({ ...baseWorkOrder, dependencies: ["sha256:1111111111111111111111111111111111111111111111111111111111111111"] });
  const order2 = computeWorkOrderId({ ...baseWorkOrder, dependencies: ["sha256:2222222222222222222222222222222222222222222222222222222222222222"] });
  assert.notEqual(order1, order2);

  // Differing ownership yield distinct work_order_id
  const orderOwnerA = computeWorkOrderId({ ...baseWorkOrder, ownership: { owner: "team-a", mode: "exclusive" } });
  const orderOwnerB = computeWorkOrderId({ ...baseWorkOrder, ownership: { owner: "team-b", mode: "exclusive" } });
  assert.notEqual(orderOwnerA, orderOwnerB);

  // Differing required_evidence yield distinct work_order_id
  const orderEv1 = computeWorkOrderId({ ...baseWorkOrder, requiredEvidence: ["ev1"] });
  const orderEv2 = computeWorkOrderId({ ...baseWorkOrder, requiredEvidence: ["ev2"] });
  assert.notEqual(orderEv1, orderEv2);
});

test("REQ-execution-identities-007: computeWorkResultId validates presence and format of work_order_id and source_snapshot_id", () => {
  const validResult = {
    workOrderId: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    sourceSnapshotId: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    patch: "diff...",
    commands: [],
    logs: [],
    exit_code: 0,
    filesystem_inventory: []
  };

  assert.ok(computeWorkResultId(validResult).startsWith("sha256:"));

  assert.throws(() => {
    computeWorkResultId({ ...validResult, workOrderId: "invalid-id" });
  }, /work_order_id|workOrderId/i);

  assert.throws(() => {
    computeWorkResultId({ ...validResult, sourceSnapshotId: "invalid-id" });
  }, /source_snapshot_id|sourceSnapshotId/i);
});

test("REQ-execution-identities-007: computeCandidateId requires mandatory base_tree and projection and validates digest format", () => {
  // Missing required properties
  assert.throws(() => {
    computeCandidateId({
      repositoryId: "repo-1",
      projection: "workspace"
      // missing base_tree, candidate_tree, diff_hash
    });
  }, /base_tree|baseTree/i);

  // Ill-formed base_tree digest
  assert.throws(() => {
    computeCandidateId({
      repositoryId: "repo-1",
      projection: "workspace",
      baseTree: "not-a-sha256",
      candidateTree: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
      diffHash: "sha256:2222222222222222222222222222222222222222222222222222222222222222"
    });
  }, /sha256|digest/i);
});

test("REQ-execution-identities-004: freezeCandidate constructs candidate/v2 with schema_version 2 and strict diff disambiguation", () => {
  const baseInput = {
    repositoryId: "repo-1",
    projection: "workspace",
    baseTree: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    candidateTree: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    paths: ["a.js"]
  };

  // Construct v2 record
  const frozen = freezeCandidate({ ...baseInput, diffText: "raw diff content" });
  assert.equal(frozen.kind, "candidate/v2");
  assert.equal(frozen.schema_version, 2);
  assert.ok(frozen.diff_hash.startsWith("sha256:"));

  // diffText="sha256:text" processed as raw text
  const frozenRawTextHash = freezeCandidate({ ...baseInput, diffText: "sha256:esto-es-texto" });
  assert.notEqual(frozenRawTextHash.diff_hash, "sha256:esto-es-texto");
  assert.ok(frozenRawTextHash.diff_hash.startsWith("sha256:"));

  // Invalid diff_hash format rejected
  assert.throws(() => {
    freezeCandidate({ ...baseInput, diff_hash: "invalid-hash" });
  }, /diff_hash|sha256/i);

  // Conflicting diffText and diff_hash rejected
  assert.throws(() => {
    freezeCandidate({
      ...baseInput,
      diffText: "raw diff content",
      diff_hash: "sha256:9999999999999999999999999999999999999999999999999999999999999999"
    });
  }, /conflict/i);
});

test("REQ-execution-identities-003: validateWorkOrderBinding and validateWorkResultBinding fail-closed validation", () => {
  const sourceSnapshot = {
    schema_version: 1,
    repository_id: "repo-1",
    base_tree_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    projection: "workspace",
    dependency_digests: []
  };
  const snapshotId = computeSourceSnapshotId(sourceSnapshot);
  sourceSnapshot.source_snapshot_id = snapshotId;

  const workOrderFields = {
    kind: "work-order/v2",
    schema_version: 2,
    status: "pending",
    source_snapshot_id: snapshotId,
    node_id: "node-1",
    role: "worker",
    operation: "build",
    objective: "compile",
    dependencies: [],
    ownership: { owner: "worker", mode: "exclusive" },
    allowed_paths: ["src/"],
    invariants: [],
    required_evidence: ["log"],
    budget: { model_turns: 1, patches: 1, commands: 1, wall_time_minutes: 1, changed_lines: 1 }
  };
  const workOrderId = computeWorkOrderId(workOrderFields);
  const workOrder = { ...workOrderFields, work_order_id: workOrderId };

  const workResultFields = {
    schema_version: 1,
    work_order_id: workOrderId,
    source_snapshot_id: snapshotId,
    patch: "diff...",
    commands: [],
    logs: [],
    exit_code: 0,
    filesystem_inventory: []
  };
  const workResultId = computeWorkResultId(workResultFields);
  const workResult = { ...workResultFields, work_result_id: workResultId };

  // validateWorkOrderBinding success (two-arg cryptographic recompute)
  const obRes = validateWorkOrderBinding(sourceSnapshot, workOrder);
  assert.equal(obRes.ok, true);

  // validateWorkOrderBinding fail on missing or invalid snapshot digest
  const obFail = validateWorkOrderBinding(sourceSnapshot, { ...workOrder, source_snapshot_id: "invalid" });
  assert.equal(obFail.ok, false);
  assert.equal(obFail.reason_code, "ILL_FORMED_SNAPSHOT_ID");

  // validateWorkResultBinding success
  const rbRes = validateWorkResultBinding(workOrder, workResult);
  assert.equal(rbRes.ok, true);

  // validateWorkResultBinding fail on work_order_id mismatch
  const rbWorkOrderMismatch = validateWorkResultBinding(workOrder, {
    ...workResult,
    work_order_id: "sha256:3333333333333333333333333333333333333333333333333333333333333333"
  });
  assert.equal(rbWorkOrderMismatch.ok, false);
  assert.equal(rbWorkOrderMismatch.reason_code, "WORK_ORDER_MISMATCH");

  // validateWorkResultBinding fail on source_snapshot_id mismatch
  const rbSnapshotMismatch = validateWorkResultBinding(workOrder, {
    ...workResult,
    source_snapshot_id: "sha256:4444444444444444444444444444444444444444444444444444444444444444"
  });
  assert.equal(rbSnapshotMismatch.ok, false);
  assert.equal(rbSnapshotMismatch.reason_code, "SOURCE_SNAPSHOT_MISMATCH");
});

test("REQ-execution-identities-005: evaluateCandidateRelation recomputes candidate_id and detects declared candidate_id mismatch", () => {
  const baseTreeHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
  const candTreeHash = "sha256:2222222222222222222222222222222222222222222222222222222222222222";

  const validCandidate = freezeCandidate({
    repositoryId: "repo-1",
    projection: "workspace",
    baseTree: baseTreeHash,
    candidateTree: candTreeHash,
    diffText: "diff",
    paths: ["a.js"]
  });

  const tamperedCandidate = {
    ...validCandidate,
    candidate_id: "sha256:9999999999999999999999999999999999999999999999999999999999999999" // declared ID spoofed!
  };

  const relTampered = evaluateCandidateRelation(validCandidate, tamperedCandidate);
  assert.equal(relTampered.relation, "unknown");
  assert.equal(relTampered.action, "stop");
  assert.equal(relTampered.reason, "candidate-id-mismatch");
});

test("Adversarial Scenario 1: Candidate candidate_id copied + content altered yields unknown / candidate-id-mismatch", () => {
  const baseTreeHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
  const candTreeHash = "sha256:2222222222222222222222222222222222222222222222222222222222222222";

  const original = freezeCandidate({
    repositoryId: "repo-1",
    projection: "workspace",
    baseTree: baseTreeHash,
    candidateTree: candTreeHash,
    diffText: "diff-original",
    paths: ["a.js"]
  });

  const alteredContentWithCopiedId = {
    ...original,
    diff_hash: "sha256:3333333333333333333333333333333333333333333333333333333333333333" // altered content, same candidate_id
  };

  const res = evaluateCandidateRelation(original, alteredContentWithCopiedId);
  assert.equal(res.relation, "unknown");
  assert.equal(res.action, "stop");
  assert.equal(res.reason, "candidate-id-mismatch");
});

test("Adversarial Scenario 2: WorkOrder work_order_id copied + ownership altered yields distinct digest", () => {
  const baseOrder = {
    sourceSnapshotId: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    nodeId: "node-1",
    role: "worker",
    operation: "build",
    objective: "compile",
    dependencies: [],
    ownership: { owner: "team-1", mode: "exclusive" },
    allowedPaths: ["src/"],
    invariants: [],
    requiredEvidence: [],
    budget: { model_turns: 1 }
  };
  const originalId = computeWorkOrderId(baseOrder);

  const alteredOrder = {
    ...baseOrder,
    ownership: { owner: "attacker", mode: "shared" }
  };
  const alteredId = computeWorkOrderId(alteredOrder);

  assert.notEqual(originalId, alteredId);
});

test("Adversarial Scenario 3: WorkOrder work_order_id copied + required_evidence altered yields distinct digest", () => {
  const baseOrder = {
    sourceSnapshotId: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    nodeId: "node-1",
    role: "worker",
    operation: "build",
    objective: "compile",
    dependencies: [],
    ownership: { owner: "team-1" },
    allowedPaths: ["src/"],
    invariants: [],
    requiredEvidence: ["proof-1"],
    budget: { model_turns: 1 }
  };
  const originalId = computeWorkOrderId(baseOrder);

  const alteredOrder = {
    ...baseOrder,
    requiredEvidence: ["forged-proof"]
  };
  const alteredId = computeWorkOrderId(alteredOrder);

  assert.notEqual(originalId, alteredId);
});

test("Adversarial Scenario 4: WorkOrder work_order_id copied + dependencies altered yields distinct digest", () => {
  const baseOrder = {
    sourceSnapshotId: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    nodeId: "node-1",
    role: "worker",
    operation: "build",
    objective: "compile",
    dependencies: ["sha256:aaaaa11111111111111111111111111111111111111111111111111111111111"],
    ownership: { owner: "team-1" },
    allowedPaths: ["src/"],
    invariants: [],
    requiredEvidence: [],
    budget: { model_turns: 1 }
  };
  const originalId = computeWorkOrderId(baseOrder);

  const alteredOrder = {
    ...baseOrder,
    dependencies: ["sha256:bbbbb22222222222222222222222222222222222222222222222222222222222"]
  };
  const alteredId = computeWorkOrderId(alteredOrder);

  assert.notEqual(originalId, alteredId);
});

test("Adversarial Scenario 5: WorkOrder(S1) + WorkResult(S2) yields REJECT SOURCE_SNAPSHOT_MISMATCH", () => {
  const s1 = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
  const s2 = "sha256:2222222222222222222222222222222222222222222222222222222222222222";

  const orderFields = {
    kind: "work-order/v2",
    schema_version: 2,
    status: "pending",
    source_snapshot_id: s1,
    node_id: "node-1",
    role: "worker",
    operation: "build",
    objective: "x",
    dependencies: [],
    ownership: { owner: "w", mode: "exclusive" },
    allowed_paths: [],
    invariants: [],
    required_evidence: [],
    budget: { model_turns: 1, patches: 0, commands: 0, wall_time_minutes: 1, changed_lines: 1 }
  };
  const wId = computeWorkOrderId(orderFields);
  const order = { ...orderFields, work_order_id: wId };

  const resultFields = {
    schema_version: 1,
    work_order_id: wId,
    source_snapshot_id: s2,
    patch: "diff",
    commands: [],
    logs: [],
    exit_code: 0,
    filesystem_inventory: []
  };
  const result = { ...resultFields, work_result_id: computeWorkResultId(resultFields) };

  const binding = validateWorkResultBinding(order, result);
  assert.equal(binding.ok, false);
  assert.equal(binding.reason_code, "SOURCE_SNAPSHOT_MISMATCH");
});

test("Adversarial Scenario 6: WorkResultId copied + patch altered yields distinct digest", () => {
  const baseResult = {
    workOrderId: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    sourceSnapshotId: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    patch: "diff original",
    commands: [],
    logs: [],
    exit_code: 0,
    filesystem_inventory: []
  };
  const originalId = computeWorkResultId(baseResult);

  const alteredResult = { ...baseResult, patch: "diff malicious patch" };
  const alteredId = computeWorkResultId(alteredResult);

  assert.notEqual(originalId, alteredId);
});

test("Adversarial Scenario 8: SourceSnapshot presented as Candidate is REJECTED", () => {
  const snapshotPayload = {
    kind: "source-snapshot/v1",
    source_snapshot_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    base_tree_digest: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    projection: "workspace"
  };
  const res = validateIdentityKind(snapshotPayload, "Candidate");
  assert.equal(res.ok, false);
  assert.equal(res.reason_code, "KIND_MISMATCH");
});

test("Adversarial Scenario 9: SourceSnapshot presented as DeliveryAuthorization is REJECTED", () => {
  const snapshotPayload = {
    kind: "source-snapshot/v1",
    source_snapshot_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    base_tree_digest: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    projection: "workspace"
  };
  const res = validateIdentityKind(snapshotPayload, "DeliveryAuthorization");
  assert.equal(res.ok, false);
  assert.ok(res.reason_code === "KIND_MISMATCH" || res.reason_code === "INVALID_TARGET_CANDIDATE_ID");
});

test("Adversarial Scenario 10: Candidate presented as EvaluationAttestation is REJECTED", () => {
  const baseTreeHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
  const candTreeHash = "sha256:2222222222222222222222222222222222222222222222222222222222222222";
  const candidateRecord = freezeCandidate({
    repositoryId: "repo-1",
    projection: "workspace",
    baseTree: baseTreeHash,
    candidateTree: candTreeHash,
    diffText: "diff",
    paths: ["a.js"]
  });

  const res = validateIdentityKind(candidateRecord, "EvaluationAttestation");
  assert.equal(res.ok, false);
  assert.equal(res.reason_code, "KIND_MISMATCH");
});

test("Adversarial Scenario 11: feature/foo non-sha256 target used as Attestation target is REJECTED", () => {
  const badTargetPayload = {
    kind: "candidate-evaluation-attestation/v1",
    attestation_id: "att-123",
    target: "feature/foo"
  };
  const res = validateIdentityKind(badTargetPayload, "CandidateEvaluationAttestation");
  assert.equal(res.ok, false);
  assert.equal(res.reason_code, "INVALID_TARGET_CANDIDATE_ID");
});

test("Adversarial Scenario 12: diffText=sha256:esto-es-texto processed as raw text hash, not precomputed", () => {
  const baseTreeHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
  const candTreeHash = "sha256:2222222222222222222222222222222222222222222222222222222222222222";

  const frozen = freezeCandidate({
    repositoryId: "repo-1",
    projection: "workspace",
    baseTree: baseTreeHash,
    candidateTree: candTreeHash,
    diffText: "sha256:esto-es-texto",
    paths: ["a.js"]
  });

  assert.notEqual(frozen.diff_hash, "sha256:esto-es-texto");
  assert.ok(frozen.diff_hash.startsWith("sha256:"));
});

test("Adversarial Scenario 13: diffText and diff_hash simultaneously conflicting are REJECTED", () => {
  const baseTreeHash = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
  const candTreeHash = "sha256:2222222222222222222222222222222222222222222222222222222222222222";

  assert.throws(() => {
    freezeCandidate({
      repositoryId: "repo-1",
      projection: "workspace",
      baseTree: baseTreeHash,
      candidateTree: candTreeHash,
      diffText: "some diff text",
      diff_hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      paths: ["a.js"]
    });
  }, /conflict/i);
});

// ---------------------------------------------------------------------------
// K3 boundary-closure adversarial gates (REQ-003/004/005/007/008/009)
// ---------------------------------------------------------------------------

const DIGEST_A = "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const DIGEST_B = "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const DIGEST_C = "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";

function makeFrozenCandidate(overrides = {}) {
  return freezeCandidate({
    repositoryId: "repo-1",
    projection: "workspace",
    baseTree: DIGEST_A,
    candidateTree: DIGEST_B,
    diffText: "diff-content",
    paths: ["a.js"],
    ...overrides
  });
}

test("K3-2.1: non-frozen / missing kind candidate → INVALID_FROZEN_CANDIDATE (no relation)", () => {
  const valid = makeFrozenCandidate();
  const nonFrozen = {
    projection: "workspace",
    base_tree: DIGEST_A,
    candidate_tree: DIGEST_B,
    diff_hash: DIGEST_C,
    paths: ["a.js"]
  };
  const res = evaluateCandidateRelation(valid, nonFrozen);
  assert.equal(res.relation, "unknown");
  assert.equal(res.action, "stop");
  assert.equal(res.reason_code, "INVALID_FROZEN_CANDIDATE");
});

test("K3-2.2: hand-built kind candidate/v2 but schema-invalid → INVALID_FROZEN_CANDIDATE", () => {
  const valid = makeFrozenCandidate();
  const forged = {
    kind: "candidate/v2",
    schema_version: 2,
    candidate_id: DIGEST_A,
    // missing repository_id and other required freeze fields
    projection: "workspace",
    base_tree: DIGEST_A,
    candidate_tree: DIGEST_B,
    diff_hash: DIGEST_C,
    paths: ["a.js"]
  };
  const res = evaluateCandidateRelation(valid, forged);
  assert.equal(res.relation, "unknown");
  assert.equal(res.action, "stop");
  assert.equal(res.reason_code, "INVALID_FROZEN_CANDIDATE");
  assert.equal(validateCandidateV2(forged), false);
});

test("K3-2.3: attestation surface without kind → validateIdentityKind fail closed", () => {
  const payload = {
    attestation_id: "att-1",
    target: DIGEST_A
  };
  const res = validateIdentityKind(payload, "EvaluationAttestation");
  assert.equal(res.ok, false);
  assert.equal(res.reason_code, "KIND_MISMATCH");
});

test("K3-2.4: SourceSnapshot + attestation_id without attestation kind → fail closed", () => {
  const disguise = {
    kind: "source-snapshot/v1",
    attestation_id: "att-spoof",
    source_snapshot_id: DIGEST_A,
    base_tree_digest: DIGEST_B,
    projection: "workspace",
    target: DIGEST_A
  };
  const res = validateIdentityKind(disguise, "EvaluationAttestation");
  assert.equal(res.ok, false);
  assert.equal(res.reason_code, "KIND_MISMATCH");
});

test("K3-2.5: compatible EXPECTED_KINDS kind → pass", () => {
  assert.ok(EXPECTED_KINDS.Candidate.includes("candidate/v2"));
  assert.ok(EXPECTED_KINDS.EvaluationAttestation.includes("candidate-evaluation-attestation/v1"));
  const payload = {
    kind: "candidate-evaluation-attestation/v1",
    attestation_id: "att-1",
    target: DIGEST_A
  };
  const res = validateIdentityKind(payload, "EvaluationAttestation");
  assert.equal(res.ok, true);
});

test("K3-2.6: binding spoof — declared IDs string-equal but payload mutated → binding", () => {
  const sourceSnapshot = {
    schema_version: 1,
    repository_id: "repo-1",
    base_tree_digest: DIGEST_A,
    projection: "workspace",
    dependency_digests: []
  };
  const snapshotId = computeSourceSnapshotId(sourceSnapshot);
  sourceSnapshot.source_snapshot_id = snapshotId;
  const orderFields = {
    kind: "work-order/v2",
    schema_version: 2,
    status: "pending",
    source_snapshot_id: snapshotId,
    node_id: "node-1",
    role: "worker",
    operation: "build",
    objective: "honest",
    dependencies: [],
    ownership: { owner: "worker", mode: "exclusive" },
    allowed_paths: ["src/"],
    invariants: [],
    required_evidence: ["log"],
    budget: { model_turns: 1, patches: 1, commands: 1, wall_time_minutes: 1, changed_lines: 1 }
  };
  const honestOrderId = computeWorkOrderId(orderFields);
  const honestOrder = { ...orderFields, work_order_id: honestOrderId };

  // Mutate objective but keep declared work_order_id (spoof)
  const spoofedOrder = { ...honestOrder, objective: "malicious" };
  const woBind = validateWorkOrderBinding(sourceSnapshot, spoofedOrder);
  assert.equal(woBind.ok, false, "gate must reject spoofed WorkOrder even when declared IDs look equal");
  assert.ok(
    woBind.reason_code === "WORK_ORDER_MISMATCH" ||
      woBind.reason_code === "DIGEST_MISMATCH" ||
      woBind.reason_code === "DECLARED_ID_MISMATCH"
  );

  const resultFields = {
    schema_version: 1,
    work_order_id: honestOrderId,
    source_snapshot_id: snapshotId,
    patch: "honest-patch",
    commands: [],
    logs: [],
    exit_code: 0,
    filesystem_inventory: []
  };
  const honestResultId = computeWorkResultId(resultFields);
  const spoofedResult = {
    ...resultFields,
    patch: "malicious-patch",
    work_result_id: honestResultId
  };
  const wrBind = validateWorkResultBinding(honestOrder, spoofedResult);
  assert.equal(wrBind.ok, false, "gate must reject spoofed WorkResult even when declared IDs look equal");
  assert.ok(
    wrBind.reason_code === "DIGEST_MISMATCH" ||
      wrBind.reason_code === "DECLARED_ID_MISMATCH" ||
      wrBind.reason_code === "WORK_ORDER_MISMATCH"
  );
});

test("K3-2.7: validateWorkOrderBinding requires sourceSnapshot + workOrder (arity)", () => {
  const order = {
    work_order_id: DIGEST_A,
    source_snapshot_id: DIGEST_B,
    node_id: "node-1",
    role: "worker"
  };
  // One-arg call (legacy) must fail closed — sourceSnapshot is required
  const missingSnap = validateWorkOrderBinding(order);
  assert.equal(missingSnap.ok, false);
  assert.ok(missingSnap.reason_code);
});

test("K3-2.8: dependencies null / non-array → computeWorkOrderId throws (no [] coercion)", () => {
  const base = {
    source_snapshot_id: DIGEST_A,
    node_id: "node-1",
    role: "worker",
    operation: "build",
    objective: "compile",
    ownership: { owner: "dev" },
    allowed_paths: ["src/"],
    invariants: [],
    required_evidence: [],
    budget: { model_turns: 1 }
  };
  assert.throws(() => computeWorkOrderId({ ...base, dependencies: null }), /dependenc/i);
  assert.throws(() => computeWorkOrderId({ ...base, dependencies: "not-an-array" }), /dependenc/i);
});

test("K3-2.9: WorkResult missing required exit_code → computeWorkResultId throws (no silent default)", () => {
  assert.throws(() => {
    computeWorkResultId({
      work_order_id: DIGEST_A,
      source_snapshot_id: DIGEST_B,
      patch: "diff",
      commands: [],
      logs: [],
      filesystem_inventory: []
      // exit_code intentionally omitted
    });
  }, /exit_code/i);
});

test("K3-2.10: freezeCandidate rejects empty repository_id; intended_untracked_digest never empty string", () => {
  assert.throws(() => {
    freezeCandidate({
      repositoryId: "",
      projection: "workspace",
      baseTree: DIGEST_A,
      candidateTree: DIGEST_B,
      diffText: "diff",
      paths: ["a.js"]
    });
  }, /repository_id/i);

  assert.throws(() => {
    freezeCandidate({
      repositoryId: "repo-1",
      projection: "workspace",
      baseTree: DIGEST_A,
      candidateTree: DIGEST_B,
      diffText: "diff",
      paths: ["a.js"],
      intended_untracked_digest: ""
    });
  }, /intended_untracked_digest/i);
});

test("K3-2.11: invariant validateCandidateV2(freezeCandidate(validInput)) === true", () => {
  const frozen = makeFrozenCandidate();
  assert.equal(validateCandidateV2(frozen), true);
  assert.equal(frozen.kind, "candidate/v2");
  assert.equal(frozen.schema_version, 2);
  assert.ok(frozen.repository_id.length >= 1);
  assert.ok(frozen.intended_untracked_digest === null || /^sha256:[a-f0-9]{64}$/.test(frozen.intended_untracked_digest));
});

test("K3-2.12: same WorkOrder payload v1 vs v2 → distinct digests; v2 domain is work-order/v2", () => {
  const payload = {
    source_snapshot_id: DIGEST_A,
    node_id: "node-1",
    role: "worker",
    operation: "build",
    objective: "compile",
    dependencies: [],
    ownership: { owner: "w", mode: "exclusive" },
    allowed_paths: ["src/"],
    invariants: [],
    required_evidence: [],
    budget: { model_turns: 1 }
  };
  const v1Id = computeWorkOrderId({ ...payload, kind: "work-order/v1", schema_version: 1 });
  const v2Id = computeWorkOrderId({ ...payload, kind: "work-order/v2", schema_version: 2 });
  assert.notEqual(v1Id, v2Id, "v1 and v2 digest domains must not alias");

  // Prove domain string by recomputing with sha256Fingerprint
  const { sha256Fingerprint } = require("../canonical-json.js");
  const canonical = {
    source_snapshot_id: DIGEST_A,
    node_id: "node-1",
    role: "worker",
    operation: "build",
    objective: "compile",
    dependencies: [],
    ownership: { owner: "w", mode: "exclusive" },
    allowed_paths: ["src/"],
    invariants: [],
    required_evidence: [],
    budget: { model_turns: 1 }
  };
  assert.equal(v2Id, sha256Fingerprint("work-order/v2", canonical));
  assert.equal(v1Id, sha256Fingerprint("work-order/v1", canonical));
});

test("K3 GO: DECLARED_ID_MISMATCH still fires after freeze gate on schema-valid tamper", () => {
  const valid = makeFrozenCandidate();
  const tampered = {
    ...valid,
    candidate_id: "sha256:9999999999999999999999999999999999999999999999999999999999999999"
  };
  assert.equal(validateCandidateV2(tampered), true, "tampered record remains schema-valid");
  const res = evaluateCandidateRelation(valid, tampered);
  assert.equal(res.relation, "unknown");
  assert.equal(res.action, "stop");
  assert.equal(res.reason_code, "DECLARED_ID_MISMATCH");
});

// --- 4R advisory remediation (architecture-bounded-review-001 / new-scope) ---

test("4R-R1: forged {ambiguous:true} cannot bypass INVALID_FROZEN_CANDIDATE", () => {
  const valid = makeFrozenCandidate();
  const forged = { ambiguous: true };
  const res = evaluateCandidateRelation(valid, forged);
  assert.equal(res.relation, "unknown");
  assert.equal(res.action, "stop");
  assert.equal(res.reason_code, "INVALID_FROZEN_CANDIDATE");
});

test("4R-R1b: typed candidate-relation-selector ambiguous still decides", () => {
  const valid = makeFrozenCandidate();
  const selector = { kind: "candidate-relation-selector", ambiguous: true };
  const res = evaluateCandidateRelation(valid, selector);
  assert.equal(res.relation, "ambiguous");
  assert.equal(res.action, "decide");
});

test("4R-R2: kind work-order/v1 + schema_version 2 throws (fail closed disagreement)", () => {
  const payload = {
    source_snapshot_id: DIGEST_A,
    node_id: "n1",
    role: "implementer",
    operation: "edit",
    objective: "x",
    kind: "work-order/v1",
    schema_version: 2
  };
  assert.throws(() => computeWorkOrderId(payload), /kind|schema_version|disagree/i);
});

test("4R-R2c: kind work-order/v2 + schema_version 1 throws (symmetric disagreement)", () => {
  assert.throws(
    () =>
      computeWorkOrderId({
        source_snapshot_id: DIGEST_A,
        node_id: "n1",
        role: "implementer",
        kind: "work-order/v2",
        schema_version: 1
      }),
    /kind|schema_version|disagree/i
  );
});

test("4R-R2b: consistent work-order/v2 + schema_version 2 uses v2 domain", () => {
  const { sha256Fingerprint } = require("../canonical-json.js");
  const payload = {
    source_snapshot_id: DIGEST_A,
    node_id: "n1",
    role: "implementer",
    operation: "edit",
    objective: "x",
    dependencies: [],
    ownership: { owner: "team" },
    allowed_paths: ["src/"],
    invariants: [],
    required_evidence: [],
    budget: { model_turns: 1 },
    kind: "work-order/v2",
    schema_version: 2
  };
  const id = computeWorkOrderId(payload);
  const canonical = {
    source_snapshot_id: DIGEST_A,
    node_id: "n1",
    role: "implementer",
    operation: "edit",
    objective: "x",
    dependencies: [],
    ownership: { owner: "team" },
    allowed_paths: ["src/"],
    invariants: [],
    required_evidence: [],
    budget: { model_turns: 1 }
  };
  assert.equal(id, sha256Fingerprint("work-order/v2", canonical));
});

test("4R-R3: ownership null / non-object → computeWorkOrderId throws (no {} coercion)", () => {
  const base = {
    source_snapshot_id: DIGEST_A,
    node_id: "n1",
    role: "implementer",
    operation: "edit",
    objective: "x",
    dependencies: [],
    allowed_paths: ["src/"],
    invariants: [],
    required_evidence: [],
    budget: { model_turns: 1, patches: 0, commands: 0, wall_time_minutes: 1, changed_lines: 1 }
  };
  assert.throws(() => computeWorkOrderId({ ...base, ownership: null }), /ownership/i);
  assert.throws(() => computeWorkOrderId({ ...base, ownership: "team" }), /ownership/i);
  assert.throws(() => computeWorkOrderId({ ...base, ownership: { owner: "team", mode: "exclusive" }, budget: null }), /budget/i);
  assert.throws(() => computeWorkOrderId({ ...base, ownership: { owner: "team", mode: "exclusive" }, budget: 42 }), /budget/i);
});

test("4R-R4: missing patch → computeWorkResultId throws (no default empty string)", () => {
  assert.throws(
    () =>
      computeWorkResultId({
        work_order_id: DIGEST_A,
        source_snapshot_id: DIGEST_B,
        exit_code: 0
      }),
    /patch/i
  );
});

test("4R-R4b: exit_code null / non-integer → computeWorkResultId throws", () => {
  const base = {
    work_order_id: DIGEST_A,
    source_snapshot_id: DIGEST_B,
    patch: "diff",
    commands: [],
    logs: [],
    filesystem_inventory: []
  };
  assert.throws(() => computeWorkResultId({ ...base, exit_code: null }), /exit_code/i);
  assert.throws(() => computeWorkResultId({ ...base, exit_code: 1.5 }), /exit_code/i);
  assert.throws(() => computeWorkResultId({ ...base, exit_code: "0" }), /exit_code/i);
});

test("4R-R6: ill-formed declared snapshot id uses ILL_FORMED_SNAPSHOT_ID or INVALID_SCHEMA", () => {
  const sourceSnapshot = {
    schema_version: 1,
    repository_id: "repo-1",
    base_tree_digest: DIGEST_A,
    projection: "workspace",
    dependency_digests: []
  };
  const sourceSnapshotId = computeSourceSnapshotId(sourceSnapshot);
  sourceSnapshot.source_snapshot_id = sourceSnapshotId;

  const workOrder = {
    kind: "work-order/v2",
    schema_version: 2,
    status: "pending",
    source_snapshot_id: "not-a-digest",
    work_order_id: DIGEST_A,
    node_id: "n1",
    role: "implementer",
    operation: "test",
    objective: "verify",
    dependencies: [],
    ownership: { owner: "team", mode: "exclusive" },
    allowed_paths: ["src/"],
    invariants: [],
    required_evidence: [],
    budget: { model_turns: 1, patches: 0, commands: 0, wall_time_minutes: 1, changed_lines: 1 }
  };
  const res = validateWorkOrderBinding(sourceSnapshot, workOrder);
  assert.equal(res.ok, false);
  assert.ok(res.reason_code === "ILL_FORMED_SNAPSHOT_ID" || res.reason_code === "INVALID_SCHEMA");

  const honestOrder = {
    kind: "work-order/v2",
    schema_version: 2,
    status: "pending",
    source_snapshot_id: sourceSnapshotId,
    node_id: "n1",
    role: "implementer",
    operation: "test",
    objective: "verify",
    dependencies: [],
    ownership: { owner: "team", mode: "exclusive" },
    allowed_paths: ["src/"],
    invariants: [],
    required_evidence: [],
    budget: { model_turns: 1, patches: 0, commands: 0, wall_time_minutes: 1, changed_lines: 1 }
  };
  honestOrder.work_order_id = computeWorkOrderId(honestOrder);
  const mismatchSnap = {
    schema_version: 1,
    repository_id: "repo-1",
    base_tree_digest: DIGEST_B,
    projection: "workspace",
    dependency_digests: []
  };
  mismatchSnap.source_snapshot_id = computeSourceSnapshotId(mismatchSnap);
  const mismatch = validateWorkOrderBinding(mismatchSnap, honestOrder);
  assert.equal(mismatch.ok, false);
  assert.equal(mismatch.reason_code, "SOURCE_SNAPSHOT_MISMATCH");
});

test("REQ-execution-identities-007: computeSourceSnapshotId throws on missing repository_id or invalid projection", () => {
  const base = {
    base_tree_digest: DIGEST_A,
    projection: "workspace"
  };
  assert.throws(() => computeSourceSnapshotId(base), /repository_id/i);
  assert.throws(() => computeSourceSnapshotId({ ...base, repository_id: "" }), /repository_id/i);
  assert.throws(() => computeSourceSnapshotId({ ...base, repository_id: "repo", projection: "banana" }), /projection/i);
});

test("REQ-execution-identities-007: computeWorkOrderId fails closed on missing required fields without defaulting", () => {
  const validOrder = {
    source_snapshot_id: DIGEST_A,
    node_id: "n1",
    role: "worker",
    operation: "test",
    objective: "verify",
    dependencies: [],
    ownership: { owner: "dev", mode: "exclusive" },
    allowed_paths: ["src/"],
    invariants: ["inv-1"],
    required_evidence: ["ev-1"],
    budget: { model_turns: 1, patches: 0, commands: 0, wall_time_minutes: 1, changed_lines: 1 }
  };
  assert.ok(computeWorkOrderId(validOrder));

  assert.throws(() => computeWorkOrderId({ ...validOrder, operation: "" }), /operation/i);
  assert.throws(() => computeWorkOrderId({ ...validOrder, objective: "" }), /objective/i);

  const missingDeps = { ...validOrder }; delete missingDeps.dependencies;
  assert.throws(() => computeWorkOrderId(missingDeps), /dependencies/i);

  const missingOwnership = { ...validOrder }; delete missingOwnership.ownership;
  assert.throws(() => computeWorkOrderId(missingOwnership), /ownership/i);

  const missingPaths = { ...validOrder }; delete missingPaths.allowed_paths;
  assert.throws(() => computeWorkOrderId(missingPaths), /allowed_paths/i);

  const missingInvariants = { ...validOrder }; delete missingInvariants.invariants;
  assert.throws(() => computeWorkOrderId(missingInvariants), /invariants/i);

  const missingReqEv = { ...validOrder }; delete missingReqEv.required_evidence;
  assert.throws(() => computeWorkOrderId(missingReqEv), /required_evidence/i);

  const missingBudget = { ...validOrder }; delete missingBudget.budget;
  assert.throws(() => computeWorkOrderId(missingBudget), /budget/i);
});

test("REQ-execution-identities-007: computeWorkResultId fails closed on missing required array fields without defaulting to []", () => {
  const validResult = {
    work_order_id: DIGEST_A,
    source_snapshot_id: DIGEST_B,
    patch: "diff",
    commands: [],
    logs: [{ stream: "stdout", content: "ok" }],
    exit_code: 0,
    filesystem_inventory: []
  };
  assert.ok(computeWorkResultId(validResult));

  const missingCommands = { ...validResult }; delete missingCommands.commands;
  assert.throws(() => computeWorkResultId(missingCommands), /commands/i);

  const missingLogs = { ...validResult }; delete missingLogs.logs;
  assert.throws(() => computeWorkResultId(missingLogs), /logs/i);

  const missingInventory = { ...validResult }; delete missingInventory.filesystem_inventory;
  assert.throws(() => computeWorkResultId(missingInventory), /filesystem_inventory/i);
});

test("REQ-execution-identities-003: validateWorkOrderBinding fails closed on schema-invalid inputs", () => {
  const snap = {
    repository_id: "repo",
    base_tree_digest: DIGEST_A,
    projection: "workspace"
  };
  const invalidWorkOrder = {
    source_snapshot_id: computeSourceSnapshotId(snap),
    node_id: "n1",
    role: "worker",
    operation: "build"
    // missing dependencies, ownership, budget, etc.
  };
  invalidWorkOrder.work_order_id = DIGEST_B; // dummy
  const res = validateWorkOrderBinding(snap, invalidWorkOrder);
  assert.equal(res.ok, false);
  assert.ok(res.reason_code === "DIGEST_MISMATCH" || res.reason_code === "INVALID_WORK_ORDER" || res.reason_code === "WORK_ORDER_MISMATCH" || res.reason_code === "INVALID_SCHEMA");
});

test("REQ-execution-identities-003: validateWorkResultBinding fails closed on schema-invalid inputs", () => {
  const snap = {
    repository_id: "repo",
    base_tree_digest: DIGEST_A,
    projection: "workspace"
  };
  const snapId = computeSourceSnapshotId(snap);
  const workOrder = {
    source_snapshot_id: snapId,
    node_id: "n1",
    role: "worker",
    operation: "test",
    objective: "verify",
    dependencies: [],
    ownership: { owner: "dev", mode: "exclusive" },
    allowed_paths: ["src/"],
    invariants: [],
    required_evidence: [],
    budget: { model_turns: 1, patches: 0, commands: 0, wall_time_minutes: 1, changed_lines: 1 }
  };
  workOrder.work_order_id = computeWorkOrderId(workOrder);

  const invalidResult = {
    work_order_id: workOrder.work_order_id,
    source_snapshot_id: snapId,
    patch: "diff",
    exit_code: 0
    // missing commands, logs, filesystem_inventory
  };
  invalidResult.work_result_id = DIGEST_B;

  const res = validateWorkResultBinding(workOrder, invalidResult);
  assert.equal(res.ok, false);
  assert.ok(res.reason_code === "DIGEST_MISMATCH" || res.reason_code === "INVALID_SCHEMA");
});

test("REQ-execution-identities-008: validateIdentityKind accepts SourceSnapshot v1 and WorkResult v1 with optional or omitted kind", () => {
  const snapWithoutKind = {
    schema_version: 1,
    repository_id: "repo",
    base_tree_digest: DIGEST_A,
    projection: "workspace",
    dependency_digests: []
  };
  snapWithoutKind.source_snapshot_id = computeSourceSnapshotId(snapWithoutKind);
  const snapWithKind = { ...snapWithoutKind, kind: "source-snapshot/v1" };

  assert.equal(validateIdentityKind(snapWithoutKind, "SourceSnapshot").ok, true);
  assert.equal(validateIdentityKind(snapWithKind, "SourceSnapshot").ok, true);

  const resultWithoutKind = {
    schema_version: 1,
    work_order_id: DIGEST_A,
    source_snapshot_id: DIGEST_B,
    patch: "diff",
    commands: [],
    logs: [],
    exit_code: 0,
    filesystem_inventory: []
  };
  resultWithoutKind.work_result_id = computeWorkResultId(resultWithoutKind);
  const resultWithKind = { ...resultWithoutKind, kind: "work-result/v1" };

  assert.equal(validateIdentityKind(resultWithoutKind, "WorkResult").ok, true);
  assert.equal(validateIdentityKind(resultWithKind, "WorkResult").ok, true);
});

test("K3 Remediation: Deep compute shape validation rejects malformed nested fields", () => {
  const validOrder = {
    source_snapshot_id: DIGEST_A,
    node_id: "n1",
    role: "worker",
    operation: "test",
    objective: "verify",
    dependencies: [],
    ownership: { owner: "dev", mode: "exclusive" },
    allowed_paths: ["src/"],
    invariants: [],
    required_evidence: [],
    budget: { model_turns: 1, patches: 0, commands: 0, wall_time_minutes: 1, changed_lines: 1 }
  };

  assert.throws(() => computeWorkOrderId({ ...validOrder, ownership: {} }), /ownership/i);
  assert.throws(() => computeWorkOrderId({ ...validOrder, ownership: { owner: "dev", mode: 123 } }), /ownership/i);
  assert.throws(() => computeWorkOrderId({ ...validOrder, budget: {} }), /budget/i);
  assert.throws(() => computeWorkOrderId({ ...validOrder, budget: { model_turns: "one" } }), /budget/i);
  assert.throws(() => computeWorkOrderId({ ...validOrder, dependencies: ["invalid-dep"] }), /dependencies/i);

  const validResult = {
    work_order_id: DIGEST_A,
    source_snapshot_id: DIGEST_B,
    patch: "diff",
    commands: [],
    logs: [{ stream: "stdout", content: "ok" }],
    exit_code: 0,
    filesystem_inventory: []
  };

  assert.throws(() => computeWorkResultId({ ...validResult, patch: 42 }), /patch/i);
  assert.throws(() => computeWorkResultId({ ...validResult, commands: [42] }), /commands/i);
  assert.throws(() => computeWorkResultId({ ...validResult, logs: [{}] }), /logs/i);
  assert.throws(() => computeWorkResultId({ ...validResult, filesystem_inventory: ["invalid"] }), /filesystem_inventory/i);
});

test("K3 Remediation: validateIdentityKind fails closed on un-kinded schema-invalid v1 objects", () => {
  assert.equal(validateIdentityKind({}, "SourceSnapshot").ok, false);
  assert.equal(validateIdentityKind({}, "SourceSnapshot").reason_code, "INVALID_SCHEMA");

  assert.equal(validateIdentityKind({}, "WorkResult").ok, false);
  assert.equal(validateIdentityKind({}, "WorkResult").reason_code, "INVALID_SCHEMA");
});

test("K3 Remediation: binding gates enforce JSON Schema validation before digest recompute", () => {
  const snap = {
    schema_version: 1,
    repository_id: "repo",
    base_tree_digest: DIGEST_A,
    projection: "workspace",
    dependency_digests: []
  };

  const invalidWorkOrderV2 = {
    kind: "work-order/v2",
    schema_version: 2,
    source_snapshot_id: computeSourceSnapshotId(snap),
    node_id: "n1",
    role: "worker",
    operation: "test"
    // missing status, objective, dependencies, ownership, budget, etc.
  };
  invalidWorkOrderV2.work_order_id = DIGEST_B;

  const resOrder = validateWorkOrderBinding(snap, invalidWorkOrderV2);
  assert.equal(resOrder.ok, false);
  assert.equal(resOrder.reason_code, "INVALID_SCHEMA");
});

test("K3 Remediation: unmutated raw payloads missing required schema fields fail-close with INVALID_SCHEMA", () => {
  const validSnapshot = {
    schema_version: 1,
    repository_id: "repo",
    base_tree_digest: DIGEST_A,
    projection: "workspace",
    dependency_digests: []
  };
  const snapshotId = computeSourceSnapshotId(validSnapshot);
  validSnapshot.source_snapshot_id = snapshotId;

  const fullOrder = {
    kind: "work-order/v2",
    schema_version: 2,
    status: "pending",
    source_snapshot_id: snapshotId,
    node_id: "n1",
    role: "worker",
    operation: "build",
    objective: "compile",
    dependencies: [],
    ownership: { owner: "dev", mode: "exclusive" },
    allowed_paths: ["src/"],
    invariants: [],
    required_evidence: [],
    budget: { model_turns: 1, patches: 0, commands: 0, wall_time_minutes: 1, changed_lines: 1 }
  };
  fullOrder.work_order_id = computeWorkOrderId(fullOrder);

  // Raw WorkOrder compute-valid but missing kind / schema_version / status
  const orderNoKind = { ...fullOrder };
  delete orderNoKind.kind;
  orderNoKind.work_order_id = computeWorkOrderId(orderNoKind);
  assert.equal(validateWorkOrderBinding(validSnapshot, orderNoKind).reason_code, "INVALID_SCHEMA");

  const orderNoSchemaVer = { ...fullOrder };
  delete orderNoSchemaVer.schema_version;
  assert.equal(validateWorkOrderBinding(validSnapshot, orderNoSchemaVer).reason_code, "INVALID_SCHEMA");

  const orderNoStatus = { ...fullOrder };
  delete orderNoStatus.status;
  assert.equal(validateWorkOrderBinding(validSnapshot, orderNoStatus).reason_code, "INVALID_SCHEMA");

  // Raw SourceSnapshot missing schema_version / source_snapshot_id
  const snapNoSchemaVer = { ...validSnapshot };
  delete snapNoSchemaVer.schema_version;
  assert.equal(validateWorkOrderBinding(snapNoSchemaVer, fullOrder).reason_code, "INVALID_SCHEMA");

  const snapNoId = { ...validSnapshot };
  delete snapNoId.source_snapshot_id;
  assert.equal(validateWorkOrderBinding(snapNoId, fullOrder).reason_code, "INVALID_SCHEMA");

  // Raw WorkResult missing schema_version / work_result_id
  const fullResult = {
    schema_version: 1,
    work_order_id: fullOrder.work_order_id,
    source_snapshot_id: snapshotId,
    patch: "diff",
    commands: [],
    logs: [],
    exit_code: 0,
    filesystem_inventory: []
  };
  fullResult.work_result_id = computeWorkResultId(fullResult);

  const resultNoSchemaVer = { ...fullResult };
  delete resultNoSchemaVer.schema_version;
  assert.equal(validateWorkResultBinding(fullOrder, resultNoSchemaVer).reason_code, "INVALID_SCHEMA");

  const resultNoId = { ...fullResult };
  delete resultNoId.work_result_id;
  assert.equal(validateWorkResultBinding(fullOrder, resultNoId).reason_code, "INVALID_SCHEMA");
});

test("REQ-execution-identities-007: computeCandidateId strictly enforces K3 parameters without defaulting", () => {
  const validCandidate = {
    repository_id: "repo-1",
    projection: "workspace",
    base_tree: DIGEST_A,
    candidate_tree: DIGEST_B,
    diff_hash: DIGEST_C,
    paths: ["src/a.js"],
    changed_paths_modes_digest: DIGEST_A
  };

  assert.ok(computeCandidateId(validCandidate).startsWith("sha256:"));

  assert.throws(() => computeCandidateId({ ...validCandidate, repository_id: "" }), /repository_id/i);
  assert.throws(() => computeCandidateId({ ...validCandidate, projection: "commit" }), /projection/i);
  assert.throws(() => computeCandidateId({ ...validCandidate, paths: undefined, pathsDigest: undefined }), /paths/i);
  assert.throws(() => computeCandidateId({ ...validCandidate, paths: [123] }), /paths/i);
  assert.throws(() => computeCandidateId({ ...validCandidate, changed_paths_modes_digest: "" }), /changed_paths_modes_digest/i);
});

test("K3 Remediation: validateIdentityKind enforces JSON Schema validation on payloads with declared kind", () => {
  assert.equal(validateIdentityKind({ kind: "source-snapshot/v1" }, "SourceSnapshot").reason_code, "INVALID_SCHEMA");
  assert.equal(validateIdentityKind({ kind: "work-order/v2" }, "WorkOrder").reason_code, "INVALID_SCHEMA");
  assert.equal(validateIdentityKind({ kind: "work-result/v1" }, "WorkResult").reason_code, "INVALID_SCHEMA");
  assert.equal(validateIdentityKind({ kind: "candidate/v2" }, "Candidate").reason_code, "INVALID_SCHEMA");

  // Complete schema-valid objects pass validateIdentityKind
  const validSnapshot = {
    kind: "source-snapshot/v1",
    schema_version: 1,
    source_snapshot_id: DIGEST_A,
    repository_id: "repo",
    base_tree_digest: DIGEST_B,
    projection: "workspace",
    dependency_digests: []
  };
  assert.equal(validateIdentityKind(validSnapshot, "SourceSnapshot").ok, true);

  const validOrder = {
    kind: "work-order/v2",
    schema_version: 2,
    status: "pending",
    work_order_id: DIGEST_C,
    source_snapshot_id: DIGEST_A,
    node_id: "n1",
    role: "worker",
    operation: "build",
    objective: "compile",
    dependencies: [],
    ownership: { owner: "dev", mode: "exclusive" },
    allowed_paths: ["src/"],
    invariants: [],
    required_evidence: [],
    budget: { model_turns: 1, patches: 0, commands: 0, wall_time_minutes: 1, changed_lines: 1 }
  };
  assert.equal(validateIdentityKind(validOrder, "WorkOrder").ok, true);

  const validResult = {
    kind: "work-result/v1",
    schema_version: 1,
    work_result_id: DIGEST_A,
    work_order_id: DIGEST_C,
    source_snapshot_id: DIGEST_A,
    patch: "diff",
    commands: [],
    logs: [],
    exit_code: 0,
    filesystem_inventory: []
  };
  assert.equal(validateIdentityKind(validResult, "WorkResult").ok, true);

  const validCandidate = {
    kind: "candidate/v2",
    schema_version: 2,
    candidate_id: DIGEST_A,
    repository_id: "repo",
    projection: "workspace",
    base_tree: DIGEST_A,
    candidate_tree: DIGEST_B,
    diff_hash: DIGEST_C,
    paths: ["src/a.js"],
    changed_paths_modes_digest: DIGEST_A,
    intended_untracked_digest: null,
    relation: "exact"
  };
  assert.equal(validateIdentityKind(validCandidate, "Candidate").ok, true);
});

test("K3 Remediation: SourceSnapshot own-ID integrity and freezeCandidate schema invariant", () => {
  // SourceSnapshot declaring false ID fails validateWorkOrderBinding with SOURCE_SNAPSHOT_ID_MISMATCH
  const realSnap = {
    kind: "source-snapshot/v1",
    schema_version: 1,
    repository_id: "repo",
    base_tree_digest: DIGEST_A,
    projection: "workspace",
    dependency_digests: []
  };
  const realSnapId = computeSourceSnapshotId(realSnap);

  const forgedSnap = {
    ...realSnap,
    source_snapshot_id: DIGEST_B // forged declared ID
  };

  const order = {
    kind: "work-order/v2",
    schema_version: 2,
    status: "pending",
    source_snapshot_id: realSnapId,
    node_id: "n1",
    role: "worker",
    operation: "build",
    objective: "compile",
    dependencies: [],
    ownership: { owner: "dev", mode: "exclusive" },
    allowed_paths: ["src/"],
    invariants: [],
    required_evidence: [],
    budget: { model_turns: 1, patches: 0, commands: 0, wall_time_minutes: 1, changed_lines: 1 }
  };
  order.work_order_id = computeWorkOrderId(order);

  const bindingResult = validateWorkOrderBinding(forgedSnap, order);
  assert.equal(bindingResult.ok, false);
  assert.equal(bindingResult.reason_code, "SOURCE_SNAPSHOT_ID_MISMATCH");

  // freezeCandidate rejects empty path string
  assert.throws(() => {
    freezeCandidate({
      repositoryId: "repo-1",
      projection: "workspace",
      baseTree: DIGEST_A,
      candidateTree: DIGEST_B,
      diffText: "diff",
      paths: [""]
    });
  }, /non-empty strings/i);

  // freezeCandidate rejects non-string diffText
  assert.throws(() => {
    freezeCandidate({
      repositoryId: "repo-1",
      projection: "workspace",
      baseTree: DIGEST_A,
      candidateTree: DIGEST_B,
      diffText: { invalid: true },
      paths: ["src/index.js"]
    });
  }, /diffText must be a string/i);

  // freezeCandidate output always passes validateCandidateV2
  const frozen = freezeCandidate({
    repositoryId: "repo-1",
    projection: "workspace",
    baseTree: DIGEST_A,
    candidateTree: DIGEST_B,
    diffText: "diff content",
    paths: ["src/index.js"]
  });
  assert.equal(validateCandidateV2(frozen), true);
});



