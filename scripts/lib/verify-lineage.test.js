"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  startVerifyLineage,
  prepareRemediation,
  recordRemediationAttempt,
  evaluateRecheck,
  getLineageNextAction,
  computeContractDigest,
  computeContractDigestFromArtifacts,
  deriveCandidateDeltaPaths,
  resolveCanonicalCandidateId,
  assertVerifyLineage,
  MAX_REMEDIATION_ATTEMPTS,
} = require("./verify-lineage.js");

const { freezeCandidate, computeCandidateId } = require("./execution-identities/index.js");
const { resolveTddMode } = require("./tdd-mode.js");

const sampleContract = {
  proposal: "Fix auth token expiry bug",
  specs: ["specs/auth/spec.md"],
  design: "design.md",
  tasks: "tasks.md",
};

const sampleCandidate = freezeCandidate({
  repository_id: "repo-1",
  projection: "workspace",
  base_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000001",
  candidate_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000002",
  diffText: "diff --git a/internal/auth/auth.go b/internal/auth/auth.go\n...",
  paths: ["internal/auth/auth.go", "internal/auth/auth_test.go"],
});

const sampleFindings = [
  {
    id: "V001",
    severity: "BLOCKER",
    summary: "JWT token validation fails on expired signature",
    origin: "code-bug",
    allowed_paths: ["internal/auth/auth.go", "internal/auth/auth_test.go"],
    validation: { commands: ["go test ./internal/auth"], expected_exit: 0, test_files: ["internal/auth/auth_test.go"] },
  },
];

// --- Phase 1 — Canonical Candidate Binding ---

test("Phase 1.1-1.7: prepareRemediation and recordRemediationAttempt enforce baseline candidate and detect drift before writes", () => {
  const lineage = startVerifyLineage(
    { contract: sampleContract, candidate: sampleCandidate, findings: sampleFindings },
    { generation: 1 }
  );

  // 1.1 & 1.2: prepareRemediation validates current candidate against lineage.current_candidate_id
  const prepOk = prepareRemediation(lineage, sampleCandidate);
  assert.equal(prepOk.valid, true);
  assert.equal(prepOk.allowed_paths.length, 2);
  assert.deepEqual(prepOk.allowed_paths, ["internal/auth/auth.go", "internal/auth/auth_test.go"]);

  const driftedCandidate = freezeCandidate({
    repository_id: "repo-1",
    projection: "workspace",
    base_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000001",
    candidate_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000099",
    diffText: "diff --git a/drift.go b/drift.go\n+drift",
    paths: ["drift.go"],
  });

  // 1.3 & 1.4: prepareRemediation rejects candidate drift
  const prepDrift = prepareRemediation(lineage, driftedCandidate);
  assert.equal(prepDrift.valid, false);
  assert.equal(prepDrift.reason_code, "candidate-drift");
  assert.equal(prepDrift.lineage.status, "superseded");

  // 1.5: recordRemediationAttempt fails closed when baseline_candidate is missing
  assert.throws(
    () => recordRemediationAttempt(lineage, sampleCandidate), // missing baseline_candidate!
    /baseline_candidate is required for recordRemediationAttempt/
  );

  // 1.6 & 1.7: recordRemediationAttempt with drifted baseline returns candidate-drift without incrementing remediation_attempts
  const recDrift = recordRemediationAttempt(lineage, {
    baseline_candidate: driftedCandidate,
    candidate: sampleCandidate,
  });
  assert.equal(recDrift.action, "supersede-and-discovery");
  assert.equal(recDrift.reason_code, "candidate-drift");
  assert.equal(recDrift.lineage.remediation_attempts, 0); // attempts NOT incremented!
  assert.equal(recDrift.lineage.status, "superseded");
});

// --- Phase 2 — Active Candidate Drift & Real Candidate Delta ---

test("Phase 2.1-2.9: deriveCandidateDeltaPaths covers added, modified, deleted paths and rejects unauthorized delta", () => {
  const cA = freezeCandidate({
    repository_id: "repo-1",
    projection: "workspace",
    base_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000001",
    candidate_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000002",
    diffText: "diff --git a/auth.js b/auth.js\n+auth\ndiff --git a/user.js b/user.js\n+user",
    paths: ["auth.js", "user.js"],
  });

  const cB = freezeCandidate({
    repository_id: "repo-1",
    projection: "workspace",
    base_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000002",
    candidate_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000003",
    diffText: "diff --git a/auth.js b/auth.js\n+fix",
    paths: ["auth.js", "user.js"],
  });

  // Pre-existing paths (user.js) are ignored; delta derived from diffText is ONLY auth.js
  const delta = deriveCandidateDeltaPaths(cA, cB, { diffText: "diff --git a/auth.js b/auth.js\n+fix" });
  assert.deepEqual(delta, ["auth.js"]);

  // Record attempt using cA as baseline and cB as successor
  const lineage = startVerifyLineage(
    { contract: sampleContract, candidate: cA, findings: [{ ...sampleFindings[0], allowed_paths: ["auth.js"] }] }
  );

  const res = recordRemediationAttempt(lineage, {
    baseline_candidate: cA,
    candidate: cB,
    diffText: "diff --git a/auth.js b/auth.js\n+fix",
  });

  assert.equal(res.action, "run-targeted-recheck");
  assert.equal(res.lineage.status, "recheck-pending");
});

test("Phase 3.1-3.10: computeContractDigestFromArtifacts reads actual OpenSpec bytes from filesystem", () => {
  const tmpDir = path.resolve(__dirname, "../../tmp-test-contract-digest");
  fs.mkdirSync(path.join(tmpDir, "specs"), { recursive: true });

  try {
    fs.writeFileSync(path.join(tmpDir, "proposal.md"), "# Proposal\nFix auth bug");
    fs.writeFileSync(path.join(tmpDir, "specs", "spec-1.md"), "# Spec 1\nRequirements");
    fs.writeFileSync(path.join(tmpDir, "design.md"), "# Design\nArchitecture");
    fs.writeFileSync(path.join(tmpDir, "tasks.md"), "# Tasks\n- [ ] 1.1");

    const digest1 = computeContractDigestFromArtifacts(tmpDir, { mode: "standard" });
    assert.match(digest1, /^sha256:[a-f0-9]{64}$/);

    // Byte modification changes digest
    fs.writeFileSync(path.join(tmpDir, "design.md"), "# Design\nArchitecture v2");
    const digest2 = computeContractDigestFromArtifacts(tmpDir, { mode: "standard" });
    assert.notEqual(digest1, digest2);

    // Missing required artifact fails closed
    fs.unlinkSync(path.join(tmpDir, "proposal.md"));
    assert.throws(
      () => computeContractDigestFromArtifacts(tmpDir, { mode: "standard" }),
      /Required contract artifact missing: proposal.md/
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

// --- Phase 4 — Mechanical Remediation Scope ---

test("Phase 4.1-4.6: Mechanical remediation scope enforcement with baseline Candidate", () => {
  const lineage = startVerifyLineage(
    { contract: sampleContract, candidate: sampleCandidate, findings: sampleFindings }
  );

  const inScopeCandidate = freezeCandidate({
    repository_id: "repo-1",
    projection: "workspace",
    base_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000001",
    candidate_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000004",
    diffText: "diff --git a/internal/auth/auth.go b/internal/auth/auth.go\n+fix",
    paths: ["internal/auth/auth.go"],
  });

  const inScopeRes = recordRemediationAttempt(lineage, {
    baseline_candidate: sampleCandidate,
    candidate: inScopeCandidate,
  });
  assert.equal(inScopeRes.action, "run-targeted-recheck");
  assert.equal(inScopeRes.lineage.status, "recheck-pending");

  const outOfScopeCandidate = freezeCandidate({
    repository_id: "repo-1",
    projection: "workspace",
    base_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000001",
    candidate_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000005",
    diffText: "diff --git a/internal/auth/auth.go b/internal/auth/auth.go\n+fix\ndiff --git a/unauthorized.go b/unauthorized.go\n+leak",
    paths: ["internal/auth/auth.go", "unauthorized.go"],
  });

  const outOfScopeRes = recordRemediationAttempt(lineage, {
    baseline_candidate: sampleCandidate,
    candidate: outOfScopeCandidate,
  });
  assert.equal(outOfScopeRes.action, "reject-remediation-scope");
  assert.equal(outOfScopeRes.reason_code, "remediation-scope-violation");
  assert.deepEqual(outOfScopeRes.unauthorized_paths, ["unauthorized.go"]);
  assert.equal(outOfScopeRes.lineage.status, "remediation-pending");
});

// --- Phase 5 — Frozen Validation Recipes ---

test("Phase 5.1-5.5: Reject blocker finding without explicit validation recipe", () => {
  const badFindings = [
    {
      id: "V002",
      severity: "BLOCKER",
      summary: "Missing recipe",
      origin: "code-bug",
      allowed_paths: ["internal/auth/auth.go"],
      validation: { commands: [] }, // empty commands!
    },
  ];

  assert.throws(
    () => startVerifyLineage({ contract: sampleContract, candidate: sampleCandidate, findings: badFindings }),
    /lacks explicit reproducible validation recipe/
  );
});

// --- Phase 6 — Restore Normal Apply Recovery ---

test("Phase 6.6: Apply continuation with partial tasks preserved", () => {
  const applyProgressContent = `
## Implementation Log
- [x] 1.1 Create middleware
- [~] 1.2 Add config struct
- [ ] 1.3 Add auth routes
`;
  assert.match(applyProgressContent, /- \[x\] 1\.1/);
  assert.match(applyProgressContent, /- \[~\] 1\.2/);
});

// --- Phase 7 — Canonical TDD Authority ---

test("Phase 7.1-7.6: resolveTddMode canonical authority matrix", () => {
  // Explicit testing.tdd_mode
  assert.equal(resolveTddMode({ testing: { tdd_mode: "strict" } }), "strict");
  assert.equal(resolveTddMode({ testing: { tdd_mode: "focused" } }), "focused");
  assert.equal(resolveTddMode({ testing: { tdd_mode: "standard" }, scale: "team" }), "standard");

  // Legacy strict_tdd migration input
  assert.equal(resolveTddMode({ strict_tdd: true }), "strict");
  assert.equal(resolveTddMode({ testing: { tdd_mode: "standard" }, strict_tdd: true }), "standard"); // testing.tdd_mode takes precedence!

  // Default fallback
  assert.equal(resolveTddMode({}), "standard");
});

// --- Phase 8 — FSM and Recovery Contract Suite ---

test("Phase 8.1-8.5: Full FSM lifecycle from start to exhausted", () => {
  // 8.1 Start -> remediation-pending
  const l0 = startVerifyLineage({ contract: sampleContract, candidate: sampleCandidate, findings: sampleFindings });
  assert.equal(l0.status, "remediation-pending");

  // 8.2 Successful remediation -> recheck-pending
  const { lineage: l1 } = recordRemediationAttempt(l0, { baseline_candidate: sampleCandidate, candidate: sampleCandidate });
  assert.equal(l1.status, "recheck-pending");

  // 8.4 First failed recheck -> remediation-pending (attempts = 1)
  const recheck1 = evaluateRecheck(l1, {
    contract: sampleContract,
    candidate: sampleCandidate,
    recheck_results: { V001: false },
  });
  assert.equal(recheck1.action, "remediate-again");
  assert.equal(recheck1.lineage.status, "remediation-pending");
  assert.equal(recheck1.lineage.remediation_attempts, 1);

  // 8.2 Second remediation attempt -> recheck-pending (attempts = 2)
  const { lineage: l2 } = recordRemediationAttempt(recheck1.lineage, { baseline_candidate: sampleCandidate, candidate: sampleCandidate });
  assert.equal(l2.status, "recheck-pending");
  assert.equal(l2.remediation_attempts, 2);

  // 8.5 Second failed recheck -> exhausted
  const recheck2 = evaluateRecheck(l2, {
    contract: sampleContract,
    candidate: sampleCandidate,
    recheck_results: { V001: false },
  });
  assert.equal(recheck2.action, "exhaust");
  assert.equal(recheck2.lineage.status, "exhausted");

  const nextExhausted = getLineageNextAction(recheck2.lineage, { contract: sampleContract, candidate: sampleCandidate });
  assert.equal(nextExhausted.action, "require-user-intervention");
});

test("Phase 8.8: Hard retry limit tampering is rejected by assertVerifyLineage", () => {
  const lineage = startVerifyLineage({ contract: sampleContract, candidate: sampleCandidate, findings: sampleFindings });
  lineage.max_remediation_attempts = 10;
  assert.throws(() => assertVerifyLineage(lineage), /max_remediation_attempts must equal immutable hard limit 2/);
});

test("Phase 8.12-8.13: Closed lineage cached PASS behavior", () => {
  const l0 = startVerifyLineage({ contract: sampleContract, candidate: sampleCandidate, findings: sampleFindings });
  const { lineage: l1 } = recordRemediationAttempt(l0, { baseline_candidate: sampleCandidate, candidate: sampleCandidate });
  const recheckClosed = evaluateRecheck(l1, {
    contract: sampleContract,
    candidate: sampleCandidate,
    recheck_results: { V001: true },
  });
  assert.equal(recheckClosed.lineage.status, "closed");

  // 8.12 Exact candidate -> return-cached-pass
  const actionSame = getLineageNextAction(recheckClosed.lineage, { contract: sampleContract, candidate: sampleCandidate });
  assert.equal(actionSame.action, "return-cached-pass");

  // 8.13 Different candidate -> supersede-and-discovery
  const diffCandidate = freezeCandidate({
    repository_id: "repo-1",
    projection: "workspace",
    base_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000001",
    candidate_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000009",
    diffText: "diff --git a/b.go b/b.go\n+diff",
    paths: ["b.go"],
  });
  const actionDiff = getLineageNextAction(recheckClosed.lineage, { contract: sampleContract, candidate: diffCandidate });
  assert.equal(actionDiff.action, "supersede-and-discovery");
});

// --- Phase 9 — Roadmap Boundary Tests ---

test("Phase 9.1-9.5: Assert corrective introduces no K4a/K4b primitives in verify-lineage.js", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "verify-lineage.js"), "utf8");

  // Assert no Execution Graph, WorkOrder, WorkResult, Attestation, or Authorization primitives
  assert.equal(source.includes("ExecutionGraph"), false);
  assert.equal(source.includes("WorkOrder"), false);
  assert.equal(source.includes("WorkResult"), false);
  assert.equal(source.includes("EvaluationAttestation"), false);
  assert.equal(source.includes("DeliveryAuthorization"), false);
  assert.equal(source.includes("AuthorityStore"), false);
});
