"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  computeSourceSnapshotId,
  computeWorkOrderId,
  computeWorkResultId,
  computeCandidateId,
  freezeCandidate,
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
  const frozenMode1 = freezeCandidate({
    repositoryId: "repo-1",
    projection: "workspace",
    baseTree: "tree-1",
    candidateTree: "tree-2",
    diffText: "diff",
    paths: ["a.js"],
    fileModes: { "a.js": "100644" }
  });

  const frozenMode2 = freezeCandidate({
    repositoryId: "repo-1",
    projection: "workspace",
    baseTree: "tree-1",
    candidateTree: "tree-2",
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
    baseTree: "tree-1",
    candidateTree: "tree-2",
    diffText: "diff",
    paths: ["a.js"],
    intendedUntracked: [{ path: "b.js", hash: "sha256:9999" }]
  });

  assert.notEqual(frozenMode1.candidate_id, frozenUntracked1.candidate_id);
  assert.ok(frozenUntracked1.intended_untracked_digest);
});

test("REQ-execution-identities-004: Candidate freeze path canonicalization and deduplication", () => {
  const frozen = freezeCandidate({
    repositoryId: "repo-1",
    projection: "staged",
    baseTree: "tree-1",
    candidateTree: "tree-2",
    diffText: "diff",
    paths: ["src\\utils\\foo.js", "src/utils/foo.js", "src\\bar.js"]
  });

  assert.deepEqual(frozen.paths, ["src/bar.js", "src/utils/foo.js"]);
  assert.equal(frozen.projection, "staged");
});

test("REQ-execution-identities-005: Fail-closed initial candidate relation evaluation", () => {
  const c1 = freezeCandidate({
    repositoryId: "repo-1",
    projection: "workspace",
    baseTree: "tree-1",
    candidateTree: "tree-2",
    diffText: "diff",
    paths: ["a.js"]
  });

  const c2 = freezeCandidate({
    repositoryId: "repo-1",
    projection: "workspace",
    baseTree: "tree-1",
    candidateTree: "tree-2",
    diffText: "diff",
    paths: ["a.js"]
  });

  const c3 = freezeCandidate({
    repositoryId: "repo-1",
    projection: "workspace",
    baseTree: "tree-1",
    candidateTree: "tree-3",
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
    baseTree: "tree-1",
    candidateTree: "tree-2",
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

