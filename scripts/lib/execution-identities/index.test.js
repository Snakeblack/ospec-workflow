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
  validateIdentityKind
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
    allowedPaths: ["src/"],
    invariants: [],
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

  // ambiguous
  const relAmbiguous = evaluateCandidateRelation(c1, { ambiguous: true });
  assert.equal(relAmbiguous.relation, "ambiguous");
  assert.equal(relAmbiguous.action, "decide");

  // ambiguous baseline
  const relAmbiguousBase = evaluateCandidateRelation({ ambiguous: true }, c1);
  assert.equal(relAmbiguousBase.relation, "ambiguous");
  assert.equal(relAmbiguousBase.action, "decide");

  // unknown
  const relUnknown = evaluateCandidateRelation(c1, null);
  assert.equal(relUnknown.relation, "unknown");
  assert.equal(relUnknown.action, "stop");

  // unknown baseline
  const relUnknownBase = evaluateCandidateRelation({ relation: "unknown" }, c1);
  assert.equal(relUnknownBase.relation, "unknown");
  assert.equal(relUnknownBase.action, "stop");
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
  const mutableBranchTarget = { targetRef: "refs/heads/main" };
  const v3 = validateIdentityKind(mutableBranchTarget, "EvaluationAttestation");
  assert.equal(v3.ok, false);
  assert.equal(v3.reason_code, "MUTABLE_TARGET_REJECTED");

  const mutablePathTarget = { targetPath: "./src" };
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
    allowedPaths: ["src/"],
    invariants: [],
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
    patch: "diff..."
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
  const validSnapshotId = "sha256:1111111111111111111111111111111111111111111111111111111111111111";
  const validWorkOrderId = "sha256:2222222222222222222222222222222222222222222222222222222222222222";

  const workOrder = {
    work_order_id: validWorkOrderId,
    source_snapshot_id: validSnapshotId,
    node_id: "node-1",
    role: "worker"
  };

  const workResult = {
    work_order_id: validWorkOrderId,
    source_snapshot_id: validSnapshotId,
    patch: "diff..."
  };

  // validateWorkOrderBinding success
  const obRes = validateWorkOrderBinding(workOrder);
  assert.equal(obRes.ok, true);

  // validateWorkOrderBinding fail on missing or invalid snapshot
  const obFail = validateWorkOrderBinding({ ...workOrder, source_snapshot_id: "invalid" });
  assert.equal(obFail.ok, false);
  assert.equal(obFail.reason_code, "SNAPSHOT_MISMATCH");

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
    ownership: { owner: "team-1", mode: "exclusive" }
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
    requiredEvidence: ["proof-1"]
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
    dependencies: ["sha256:aaaaa11111111111111111111111111111111111111111111111111111111111"]
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
  const wId = "sha256:3333333333333333333333333333333333333333333333333333333333333333";

  const order = { work_order_id: wId, source_snapshot_id: s1, node_id: "node-1", role: "worker" };
  const result = { work_order_id: wId, source_snapshot_id: s2, patch: "diff" };

  const binding = validateWorkResultBinding(order, result);
  assert.equal(binding.ok, false);
  assert.equal(binding.reason_code, "SOURCE_SNAPSHOT_MISMATCH");
});

test("Adversarial Scenario 6: WorkResultId copied + patch altered yields distinct digest", () => {
  const baseResult = {
    workOrderId: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    sourceSnapshotId: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    patch: "diff original"
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





