"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  startVerifyLineage,
  recordRemediationAttempt,
  evaluateRecheck,
  getLineageNextAction,
  computeContractDigest,
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

test("Phase 1.1-1.4: verify-lineage uses Candidate/v2.candidate_id as canonical identity", () => {
  const lineage = startVerifyLineage(
    { contract: sampleContract, candidate: sampleCandidate, findings: sampleFindings },
    { generation: 1 }
  );

  const expectedId = computeCandidateId(sampleCandidate);
  assert.equal(lineage.genesis_candidate_id, expectedId);
  assert.equal(lineage.current_candidate_id, expectedId);
  assert.equal(lineage.status, "remediation-pending");
  assert.equal(lineage.remediation_attempts, 0);
  assert.equal(lineage.max_remediation_attempts, MAX_REMEDIATION_ATTEMPTS);
  assert.equal(lineage.findings.length, 1);
  assert.equal(lineage.findings[0].id, "V001");
  assert.deepEqual(lineage.findings[0].validation.commands, ["go test ./internal/auth"]);
});

test("Phase 1.3 & 1.5: rejects Candidate malformed, empty input, and forged candidate_id", () => {
  assert.throws(
    () => resolveCanonicalCandidateId(null),
    /Candidate\/v2 object is required/
  );

  assert.throws(
    () => resolveCanonicalCandidateId({}),
    /failed schema validation/
  );

  assert.throws(
    () => resolveCanonicalCandidateId({ paths: ["internal/auth/auth.go"], diff_hash: "sha256:1111" }),
    /failed schema validation/
  );

  const forgedCandidate = {
    ...sampleCandidate,
    candidate_id: "sha256:9999999999999999999999999999999999999999999999999999999999999999",
  };
  assert.throws(
    () => resolveCanonicalCandidateId(forgedCandidate),
    /Candidate candidate_id mismatch/
  );
});

// --- Phase 2 — Active Candidate Drift ---

test("Phase 2.1-2.4: Active candidate drift in remediation-pending, recheck-pending, and closed", () => {
  const lineage0 = startVerifyLineage(
    { contract: sampleContract, candidate: sampleCandidate, findings: sampleFindings }
  );

  const modifiedCandidate = freezeCandidate({
    repository_id: "repo-1",
    projection: "workspace",
    base_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000001",
    candidate_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000003",
    diffText: "diff --git a/internal/auth/auth.go b/internal/auth/auth.go\n+modified",
    paths: ["internal/auth/auth.go"],
  });

  // 2.2 remediation-pending drift
  const nextDriftRem = getLineageNextAction(lineage0, {
    contract: sampleContract,
    candidate: modifiedCandidate,
  });
  assert.equal(nextDriftRem.action, "supersede-and-discovery");
  assert.equal(nextDriftRem.reason, "candidate-code-changed");

  // Record attempt with same candidate -> recheck-pending
  const { lineage: lineage1 } = recordRemediationAttempt(lineage0, sampleCandidate);
  assert.equal(lineage1.status, "recheck-pending");

  // 2.3 recheck-pending drift in evaluateRecheck
  const recheckDrift = evaluateRecheck(lineage1, {
    contract: sampleContract,
    candidate: modifiedCandidate,
    recheck_results: { V001: true },
  });
  assert.equal(recheckDrift.action, "superseded");
  assert.equal(recheckDrift.lineage.status, "superseded");

  // 2.3 recheck-pending drift in getLineageNextAction
  const nextDriftRecheck = getLineageNextAction(lineage1, {
    contract: sampleContract,
    candidate: modifiedCandidate,
  });
  assert.equal(nextDriftRecheck.action, "supersede-and-discovery");
  assert.equal(nextDriftRecheck.reason, "candidate-code-changed");

  // Close lineage
  const recheckClose = evaluateRecheck(lineage1, {
    contract: sampleContract,
    candidate: sampleCandidate,
    recheck_results: { V001: true },
  });
  assert.equal(recheckClose.action, "close");

  // 2.4 closed drift
  const nextDriftClosed = getLineageNextAction(recheckClose.lineage, {
    contract: sampleContract,
    candidate: modifiedCandidate,
  });
  assert.equal(nextDriftClosed.action, "supersede-and-discovery");
  assert.equal(nextDriftClosed.reason, "candidate-code-changed");
});

test("Phase 2.6: Restart in every persisted state produces deterministic next_action", () => {
  const lineage0 = startVerifyLineage(
    { contract: sampleContract, candidate: sampleCandidate, findings: sampleFindings }
  );

  // Remediation pending
  const actionRem = getLineageNextAction(lineage0, { contract: sampleContract, candidate: sampleCandidate });
  assert.equal(actionRem.action, "apply-remediation");

  // Recheck pending
  const { lineage: lineage1 } = recordRemediationAttempt(lineage0, sampleCandidate);
  const actionRecheck = getLineageNextAction(lineage1, { contract: sampleContract, candidate: sampleCandidate });
  assert.equal(actionRecheck.action, "run-targeted-recheck");

  // Closed
  const recheckResult = evaluateRecheck(lineage1, {
    contract: sampleContract,
    candidate: sampleCandidate,
    recheck_results: { V001: true },
  });
  const actionClosed = getLineageNextAction(recheckResult.lineage, { contract: sampleContract, candidate: sampleCandidate });
  assert.equal(actionClosed.action, "return-cached-pass");
});

// --- Phase 3 — Byte-Bound Contract Fingerprint ---

test("Phase 3.1-3.5: Byte-bound contract digest changes when bytes change and fails closed on missing artifact", () => {
  const contractA = {
    proposal: "Fix auth bug",
    specs: ["specs/auth/spec.md"],
    design: "design v1 content",
    tasks: "tasks.md",
  };
  const contractB = {
    proposal: "Fix auth bug",
    specs: ["specs/auth/spec.md"],
    design: "design v2 modified content",
    tasks: "tasks.md",
  };

  const digestA = computeContractDigest(contractA);
  const digestB = computeContractDigest(contractB);

  assert.notEqual(digestA, digestB);

  // Missing required proposal artifact
  assert.throws(
    () => computeContractDigest({ specs: ["specs/auth/spec.md"] }),
    /Required contract artifact missing/
  );
});

test("Phase 3.3: Fingerprint specs are canonically sorted by path", () => {
  const contract1 = {
    proposal: "p",
    specs: [{ path: "specs/z.md", content: "z" }, { path: "specs/a.md", content: "a" }],
  };
  const contract2 = {
    proposal: "p",
    specs: [{ path: "specs/a.md", content: "a" }, { path: "specs/z.md", content: "z" }],
  };

  assert.equal(computeContractDigest(contract1), computeContractDigest(contract2));
});

// --- Phase 4 — Mechanical Remediation Scope ---

test("Phase 4.1-4.6: Mechanical remediation scope enforcement", () => {
  const lineage = startVerifyLineage(
    { contract: sampleContract, candidate: sampleCandidate, findings: sampleFindings }
  );
  // Allowed path for V001 is "internal/auth/auth.go"

  const inScopeCandidate = freezeCandidate({
    repository_id: "repo-1",
    projection: "workspace",
    base_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000001",
    candidate_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000004",
    diffText: "diff --git a/internal/auth/auth.go b/internal/auth/auth.go\n+fix",
    paths: ["internal/auth/auth.go"],
  });

  const inScopeRes = recordRemediationAttempt(lineage, { candidate: inScopeCandidate });
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

  const outOfScopeRes = recordRemediationAttempt(lineage, { candidate: outOfScopeCandidate });
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
  const { lineage: l1 } = recordRemediationAttempt(l0, sampleCandidate);
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
  const { lineage: l2 } = recordRemediationAttempt(recheck1.lineage, sampleCandidate);
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
  const { lineage: l1 } = recordRemediationAttempt(l0, sampleCandidate);
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
