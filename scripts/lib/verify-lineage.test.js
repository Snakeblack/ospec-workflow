"use strict";

const assert = require("node:assert/strict");
const child_process = require("node:child_process");
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

const { freezeCandidate } = require("./execution-identities/index.js");
const { resolveTddMode } = require("./tdd-mode.js");

function setupContractDir() {
  const tmpDir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "vl-contract-"));
  fs.mkdirSync(path.join(tmpDir, "specs", "auth"), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, "proposal.md"), "# Proposal\nFix auth token expiry bug");
  fs.writeFileSync(path.join(tmpDir, "specs", "auth", "spec.md"), "# Spec\nAuthentication token validation");
  fs.writeFileSync(path.join(tmpDir, "design.md"), "# Design\nStateless JWT design");
  fs.writeFileSync(path.join(tmpDir, "tasks.md"), "# Tasks\n- [ ] 1.1 Fix auth");
  return tmpDir;
}

function setupGitRepoWithCandidates() {
  const tmpDir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "vl-repo-"));
  const exec = (cmd) => child_process.execSync(cmd, { cwd: tmpDir, stdio: "ignore" });
  exec("git init");
  exec('git config user.name "Test"');
  exec('git config user.email "test@example.com"');

  fs.mkdirSync(path.join(tmpDir, "internal", "auth"), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, "internal", "auth", "auth.go"), "package auth\n");
  fs.writeFileSync(path.join(tmpDir, "internal", "auth", "auth_test.go"), "package auth_test\n");
  exec("git add .");
  exec('git commit -m "initial commit"');
  const tree1 = child_process.execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: tmpDir, encoding: "utf8" }).trim();

  const cA = freezeCandidate({
    repository_id: "repo-1",
    projection: "workspace",
    base_tree: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    candidate_tree: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    diff_hash: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
    paths: ["internal/auth/auth.go", "internal/auth/auth_test.go"],
  });

  fs.writeFileSync(path.join(tmpDir, "internal", "auth", "auth.go"), "package auth\n// fix applied\n");
  exec("git add internal/auth/auth.go");
  exec('git commit -m "fix auth"');
  const tree2 = child_process.execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: tmpDir, encoding: "utf8" }).trim();

  const cB = freezeCandidate({
    repository_id: "repo-1",
    projection: "workspace",
    base_tree: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    candidate_tree: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    diff_hash: "sha256:5555555555555555555555555555555555555555555555555555555555555555",
    paths: ["internal/auth/auth.go", "internal/auth/auth_test.go"],
  });

  const git_trees = {
    [cA.candidate_id]: tree1,
    [cB.candidate_id]: tree2,
  };

  return { tmpDir, cA, cB, tree1, tree2, git_trees };
}

const sampleCandidate = freezeCandidate({
  repository_id: "repo-1",
  projection: "workspace",
  base_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000001",
  candidate_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000002",
  diff_hash: "sha256:0000000000000000000000000000000000000000000000000000000000000001",
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
  const changeRoot = setupContractDir();
  try {
    const lineage = startVerifyLineage(
      { changeRoot, candidate: sampleCandidate, findings: sampleFindings },
      { generation: 1 }
    );

    const prepOk = prepareRemediation(lineage, { changeRoot, candidate: sampleCandidate });
    assert.equal(prepOk.valid, true);
    assert.equal(prepOk.allowed_paths.length, 2);
    assert.deepEqual(prepOk.allowed_paths, ["internal/auth/auth.go", "internal/auth/auth_test.go"]);

    const driftedCandidate = freezeCandidate({
      repository_id: "repo-1",
      projection: "workspace",
      base_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000001",
      candidate_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000099",
      diff_hash: "sha256:0000000000000000000000000000000000000000000000000000000000000099",
      paths: ["drift.go"],
    });

    const prepDrift = prepareRemediation(lineage, { changeRoot, candidate: driftedCandidate });
    assert.equal(prepDrift.valid, false);
    assert.equal(prepDrift.reason_code, "candidate-drift");
    assert.equal(prepDrift.lineage.status, "superseded");

    const noRecoveryRoot = recordRemediationAttempt(lineage, sampleCandidate);
    assert.equal(noRecoveryRoot.action, "block-candidate-recovery");
    assert.equal(noRecoveryRoot.reason_code, "candidate-recovery-path-invalid");

    const recDrift = recordRemediationAttempt(lineage, {
      baseline_candidate: driftedCandidate,
      candidate: sampleCandidate,
      changeRoot,
    });
    assert.equal(recDrift.action, "supersede-and-discovery");
    assert.equal(recDrift.reason_code, "candidate-drift");
    assert.equal(recDrift.lineage.remediation_attempts, 0);
    assert.equal(recDrift.lineage.status, "superseded");
  } finally {
    fs.rmSync(changeRoot, { recursive: true, force: true });
  }
});

// --- Phase 2 — Real Candidate Delta Enforcement ---

test("deriveCandidateDeltaPaths uses real Git objects on rootDir and ignores diffText or path-set fallbacks", () => {
  const gitRepo = setupGitRepoWithCandidates();
  try {
    const { tmpDir, cA, cB, git_trees, tree1, tree2 } = gitRepo;

    // Test with explicit git_trees dictionary
    const delta1 = deriveCandidateDeltaPaths(cA, cB, { rootDir: tmpDir, git_trees });
    assert.deepEqual(delta1, ["internal/auth/auth.go"]);

    // Test with before_git_tree and after_git_tree options
    const delta2 = deriveCandidateDeltaPaths(cA, cB, { rootDir: tmpDir, before_git_tree: tree1, after_git_tree: tree2 });
    assert.deepEqual(delta2, ["internal/auth/auth.go"]);

    assert.throws(
      () => deriveCandidateDeltaPaths(cA, cB, { diffText: "diff --git a/auth.go b/auth.go\n+fix" }),
      (err) => err.code === "delta-unresolvable"
    );

    assert.throws(
      () => deriveCandidateDeltaPaths(cA, cB, { rootDir: "/nonexistent-dir-ospec" }),
      (err) => err.code === "delta-unresolvable"
    );
  } finally {
    fs.rmSync(gitRepo.tmpDir, { recursive: true, force: true });
  }
});

// --- Phase 3 — Filesystem-Only Contract Authority ---

test("startVerifyLineage, evaluateRecheck, and getLineageNextAction require changeRoot and reject inline contracts", () => {
  const changeRoot = setupContractDir();
  try {
    assert.throws(
      () => startVerifyLineage({ candidate: sampleCandidate, findings: sampleFindings }),
      /changeRoot is required for startVerifyLineage/
    );

    const lineage = startVerifyLineage({ changeRoot, candidate: sampleCandidate, findings: sampleFindings });

    assert.throws(
      () => evaluateRecheck(lineage, { candidate: sampleCandidate }),
      /changeRoot is required for evaluateRecheck/
    );

    assert.throws(
      () => getLineageNextAction(lineage, { candidate: sampleCandidate }),
      /changeRoot is required for getLineageNextAction/
    );

    assert.throws(
      () => computeContractDigest({ proposal: "inline text" }),
      /changeRoot is required/
    );

    const digest = computeContractDigest(changeRoot, { mode: "standard" });
    assert.match(digest, /^sha256:[a-f0-9]{64}$/);
  } finally {
    fs.rmSync(changeRoot, { recursive: true, force: true });
  }
});

test("computeContractDigestFromArtifacts reads actual OpenSpec bytes from filesystem", () => {
  const tmpDir = path.resolve(__dirname, "../../tmp-test-contract-digest");
  fs.mkdirSync(path.join(tmpDir, "specs"), { recursive: true });

  try {
    fs.writeFileSync(path.join(tmpDir, "proposal.md"), "# Proposal\nFix auth bug");
    fs.writeFileSync(path.join(tmpDir, "specs", "spec-1.md"), "# Spec 1\nRequirements");
    fs.writeFileSync(path.join(tmpDir, "design.md"), "# Design\nArchitecture");
    fs.writeFileSync(path.join(tmpDir, "tasks.md"), "# Tasks\n- [ ] 1.1");

    const digest1 = computeContractDigestFromArtifacts(tmpDir, { mode: "standard" });
    assert.match(digest1, /^sha256:[a-f0-9]{64}$/);

    fs.writeFileSync(path.join(tmpDir, "design.md"), "# Design\nArchitecture v2");
    const digest2 = computeContractDigestFromArtifacts(tmpDir, { mode: "standard" });
    assert.notEqual(digest1, digest2);

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

test("Mechanical remediation scope enforcement with baseline Candidate and Git delta", () => {
  const changeRoot = setupContractDir();
  const gitRepo = setupGitRepoWithCandidates();
  try {
    const { tmpDir, cA, cB, git_trees } = gitRepo;
    const lineage = startVerifyLineage({ changeRoot, candidate: cA, findings: sampleFindings });

    const inScopeRes = recordRemediationAttempt(lineage, {
      baseline_candidate: cA,
      candidate: cB,
      changeRoot,
      rootDir: tmpDir,
      git_trees,
    });
    assert.equal(inScopeRes.action, "run-targeted-recheck");
    assert.equal(inScopeRes.lineage.status, "recheck-pending");
  } finally {
    fs.rmSync(changeRoot, { recursive: true, force: true });
    fs.rmSync(gitRepo.tmpDir, { recursive: true, force: true });
  }
});

// --- Phase 5 — Frozen Validation Recipes ---

test("Reject blocker finding without explicit validation recipe", () => {
  const changeRoot = setupContractDir();
  try {
    const badFindings = [
      {
        id: "V002",
        severity: "BLOCKER",
        summary: "Missing recipe",
        origin: "code-bug",
        allowed_paths: ["internal/auth/auth.go"],
        validation: { commands: [] },
      },
    ];

    assert.throws(
      () => startVerifyLineage({ changeRoot, candidate: sampleCandidate, findings: badFindings }),
      /lacks explicit reproducible validation recipe/
    );
  } finally {
    fs.rmSync(changeRoot, { recursive: true, force: true });
  }
});

// --- Phase 7 — Sole TDD Runtime Authority ---

test("resolveTddMode relies solely on testing.tdd_mode and ignores strict_tdd legacy flags", () => {
  assert.equal(resolveTddMode({ testing: { tdd_mode: "strict" } }), "strict");
  assert.equal(resolveTddMode({ testing: { tdd_mode: "focused" } }), "focused");
  assert.equal(resolveTddMode({ testing: { tdd_mode: "standard" }, scale: "team" }), "standard");

  assert.equal(resolveTddMode({ strict_tdd: true }), "standard");
  assert.equal(resolveTddMode({ strictTdd: true }), "standard");
  assert.equal(resolveTddMode({ testing: { tdd_mode: "standard" }, strict_tdd: true }), "standard");

  assert.equal(resolveTddMode({}), "standard");
});

// --- Phase 8 — FSM and Recovery Contract Suite ---

test("Full FSM lifecycle from start to exhausted with filesystem contract authority", () => {
  const changeRoot = setupContractDir();
  const gitRepo = setupGitRepoWithCandidates();
  try {
    const { tmpDir, cA, cB, git_trees } = gitRepo;
    const l0 = startVerifyLineage({ changeRoot, candidate: cA, findings: sampleFindings });
    assert.equal(l0.status, "remediation-pending");

    const { lineage: l1 } = recordRemediationAttempt(l0, { baseline_candidate: cA, candidate: cB, changeRoot, rootDir: tmpDir, git_trees });
    assert.equal(l1.status, "recheck-pending");

    const recheck1 = evaluateRecheck(l1, {
      changeRoot,
      candidate: cB,
      recheck_results: { V001: false },
    });
    assert.equal(recheck1.action, "remediate-again");
    assert.equal(recheck1.lineage.status, "remediation-pending");
    assert.equal(recheck1.lineage.remediation_attempts, 1);

    const { lineage: l2 } = recordRemediationAttempt(recheck1.lineage, { baseline_candidate: cB, candidate: cB, changeRoot, rootDir: tmpDir, git_trees });
    assert.equal(l2.status, "recheck-pending");
    assert.equal(l2.remediation_attempts, 2);

    const recheck2 = evaluateRecheck(l2, {
      changeRoot,
      candidate: cB,
      recheck_results: { V001: false },
    });
    assert.equal(recheck2.action, "exhaust");
    assert.equal(recheck2.lineage.status, "exhausted");

    const nextExhausted = getLineageNextAction(recheck2.lineage, { changeRoot, candidate: cB });
    assert.equal(nextExhausted.action, "require-user-intervention");
  } finally {
    fs.rmSync(changeRoot, { recursive: true, force: true });
    fs.rmSync(gitRepo.tmpDir, { recursive: true, force: true });
  }
});

test("Closed lineage cached PASS behavior", () => {
  const changeRoot = setupContractDir();
  const gitRepo = setupGitRepoWithCandidates();
  try {
    const { tmpDir, cA, cB, git_trees } = gitRepo;
    const l0 = startVerifyLineage({ changeRoot, candidate: cA, findings: sampleFindings });
    const { lineage: l1 } = recordRemediationAttempt(l0, { baseline_candidate: cA, candidate: cB, changeRoot, rootDir: tmpDir, git_trees });
    const recheckClosed = evaluateRecheck(l1, {
      changeRoot,
      candidate: cB,
      recheck_results: { V001: true },
    });
    assert.equal(recheckClosed.lineage.status, "closed");

    const actionSame = getLineageNextAction(recheckClosed.lineage, { changeRoot, candidate: cB });
    assert.equal(actionSame.action, "return-cached-pass");

    const diffCandidate = freezeCandidate({
      repository_id: "repo-1",
      projection: "workspace",
      base_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000001",
      candidate_tree: "sha256:0000000000000000000000000000000000000000000000000000000000000009",
      diff_hash: "sha256:0000000000000000000000000000000000000000000000000000000000000009",
      paths: ["b.go"],
    });
    const actionDiff = getLineageNextAction(recheckClosed.lineage, { changeRoot, candidate: diffCandidate });
    assert.equal(actionDiff.action, "supersede-and-discovery");
  } finally {
    fs.rmSync(changeRoot, { recursive: true, force: true });
    fs.rmSync(gitRepo.tmpDir, { recursive: true, force: true });
  }
});

test("Phase 9.1-9.5: Assert corrective introduces no K4a/K4b primitives in verify-lineage.js", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "verify-lineage.js"), "utf8");

  assert.equal(source.includes("ExecutionGraph"), false);
  assert.equal(source.includes("WorkOrder"), false);
  assert.equal(source.includes("WorkResult"), false);
  assert.equal(source.includes("EvaluationAttestation"), false);
  assert.equal(source.includes("DeliveryAuthorization"), false);
  assert.equal(source.includes("AuthorityStore"), false);
});

test("Candidate ↔ Git Tree binding: genuine Candidate v2 with real SHA-256 tree digests derives delta via mechanical git_trees binding", () => {
  const tmpDir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "vl-binding-"));
  const exec = (cmd) => child_process.execSync(cmd, { cwd: tmpDir, stdio: "ignore" });
  exec("git init");
  exec('git config user.name "Test"');
  exec('git config user.email "test@example.com"');

  fs.mkdirSync(path.join(tmpDir, "pkg", "service"), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, "pkg", "service", "service.go"), "package service\n");
  exec("git add .");
  exec('git commit -m "init"');
  const treeA = child_process.execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: tmpDir, encoding: "utf8" }).trim();

  fs.writeFileSync(path.join(tmpDir, "pkg", "service", "service.go"), "package service\n// updated\n");
  exec("git add .");
  exec('git commit -m "update"');
  const treeB = child_process.execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: tmpDir, encoding: "utf8" }).trim();

  const candA = freezeCandidate({
    repository_id: "repo-1",
    projection: "workspace",
    base_tree: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    candidate_tree: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    diff_hash: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    paths: ["pkg/service/service.go"],
  });

  const candB = freezeCandidate({
    repository_id: "repo-1",
    projection: "workspace",
    base_tree: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    candidate_tree: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
    diff_hash: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    paths: ["pkg/service/service.go"],
  });

  try {
    assert.throws(
      () => deriveCandidateDeltaPaths(candA, candB, { rootDir: tmpDir }),
      (err) => err.code === "delta-unresolvable"
    );

    const deltaWithDict = deriveCandidateDeltaPaths(candA, candB, {
      rootDir: tmpDir,
      git_trees: {
        [candA.candidate_id]: treeA,
        [candB.candidate_id]: treeB,
      },
    });
    assert.deepEqual(deltaWithDict, ["pkg/service/service.go"]);

    const deltaWithExplicit = deriveCandidateDeltaPaths(candA, candB, {
      rootDir: tmpDir,
      before_git_tree: treeA,
      after_git_tree: treeB,
    });
    assert.deepEqual(deltaWithExplicit, ["pkg/service/service.go"]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("REQ-verify-lineage-010: lineage start exposes only a validated, reference-bearing Candidate recovery state", () => {
  const changeRoot = setupContractDir();
  try {
    const lineage = startVerifyLineage({ changeRoot, candidate: sampleCandidate, findings: sampleFindings });
    assert.equal(lineage.genesis_candidate_id, sampleCandidate.candidate_id);
    assert.equal(lineage.current_candidate_id, sampleCandidate.candidate_id);
    assert.deepEqual(lineage.candidate_recovery.genesis, lineage.candidate_recovery.current);
    assert.equal(lineage.candidate_recovery.current.candidate_id, sampleCandidate.candidate_id);
    assert.equal(fs.existsSync(path.join(changeRoot, lineage.candidate_recovery.current.relative_path)), true);
  } finally {
    fs.rmSync(changeRoot, { recursive: true, force: true });
  }
});

test("REQ-verify-lineage-011: a separate Node process reloads state and prepares remediation without an in-memory Candidate", () => {
  const changeRoot = setupContractDir();
  const statePath = path.join(changeRoot, "state.json");
  try {
    const lineage = startVerifyLineage({ changeRoot, candidate: sampleCandidate, findings: sampleFindings });
    fs.writeFileSync(statePath, JSON.stringify(lineage), "utf8");
    const script = [
      "const fs = require('node:fs');",
      `const { prepareRemediation } = require(${JSON.stringify(path.resolve(__dirname, "verify-lineage.js"))});`,
      "const state = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));",
      "const result = prepareRemediation(state, { changeRoot: process.argv[2] });",
      "process.stdout.write(JSON.stringify({ valid: result.valid, id: result.lineage.current_candidate_id }));",
    ].join("\n");
    const output = child_process.execFileSync(process.execPath, ["-e", script, statePath, changeRoot], { encoding: "utf8" });
    assert.deepEqual(JSON.parse(output), { valid: true, id: sampleCandidate.candidate_id });
  } finally {
    fs.rmSync(changeRoot, { recursive: true, force: true });
  }
});

test("REQ-verify-lineage-011: missing or tampered recovery material blocks transitions without changing lineage history", () => {
  const changeRoot = setupContractDir();
  const gitRepo = setupGitRepoWithCandidates();
  try {
    const lineage = startVerifyLineage({ changeRoot, candidate: gitRepo.cA, findings: sampleFindings });
    const before = JSON.parse(JSON.stringify(lineage));
    fs.rmSync(path.join(changeRoot, lineage.candidate_recovery.current.relative_path));
    const prepared = prepareRemediation(lineage, { changeRoot });
    assert.equal(prepared.valid, false);
    assert.equal(prepared.reason_code, "candidate-recovery-missing");
    assert.deepEqual(prepared.lineage, before);

    const recorded = recordRemediationAttempt(lineage, {
      changeRoot,
      candidate: gitRepo.cB,
      rootDir: gitRepo.tmpDir,
      git_trees: gitRepo.git_trees,
    });
    assert.equal(recorded.action, "block-candidate-recovery");
    assert.equal(recorded.reason_code, "candidate-recovery-missing");
    assert.deepEqual(recorded.lineage, before);
  } finally {
    fs.rmSync(changeRoot, { recursive: true, force: true });
    fs.rmSync(gitRepo.tmpDir, { recursive: true, force: true });
  }
});

test("REQ-verify-lineage-012: ID-only legacy lineages remain inspectable but cannot enter mutable transitions", () => {
  const changeRoot = setupContractDir();
  try {
    const created = startVerifyLineage({ changeRoot, candidate: sampleCandidate, findings: sampleFindings });
    const legacy = JSON.parse(JSON.stringify(created));
    delete legacy.candidate_recovery;
    const snapshot = JSON.parse(JSON.stringify(legacy));
    assert.doesNotThrow(() => assertVerifyLineage(legacy));
    const nextAction = getLineageNextAction(legacy, { changeRoot, candidate: sampleCandidate });
    assert.equal(nextAction.action, "apply-remediation");
    const prepared = prepareRemediation(legacy, { changeRoot });
    assert.equal(prepared.reason_code, "legacy-candidate-recovery-unavailable");
    assert.deepEqual(prepared.lineage, snapshot);
    const recorded = recordRemediationAttempt(legacy, { changeRoot, candidate: sampleCandidate, rootDir: changeRoot });
    assert.equal(recorded.reason_code, "legacy-candidate-recovery-unavailable");
    assert.deepEqual(recorded.lineage, snapshot);
  } finally {
    fs.rmSync(changeRoot, { recursive: true, force: true });
  }
});

test("REQ-verify-lineage-011: successor recovery survives a second Node process and preserves the recheck action", () => {
  const changeRoot = setupContractDir();
  const gitRepo = setupGitRepoWithCandidates();
  const statePath = path.join(changeRoot, "state.json");
  try {
    const genesis = startVerifyLineage({ changeRoot, candidate: gitRepo.cA, findings: sampleFindings });
    const recorded = recordRemediationAttempt(genesis, {
      changeRoot,
      candidate: gitRepo.cB,
      rootDir: gitRepo.tmpDir,
      git_trees: gitRepo.git_trees,
    });
    assert.equal(recorded.action, "run-targeted-recheck");
    fs.writeFileSync(statePath, JSON.stringify(recorded.lineage), "utf8");
    const script = [
      "const fs = require('node:fs');",
      `const lineage = require(${JSON.stringify(path.resolve(__dirname, "verify-lineage.js"))});`,
      `const store = require(${JSON.stringify(path.resolve(__dirname, "verify-lineage-candidate-store.js"))});`,
      "const state = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));",
      "const candidate = store.recoverCandidateRecord(process.argv[2], state.candidate_recovery.current, state.current_candidate_id);",
      "const action = lineage.getLineageNextAction(state, { changeRoot: process.argv[2], candidate: candidate.candidate });",
      "process.stdout.write(JSON.stringify({ recovered: candidate.ok, id: candidate.candidate?.candidate_id, action: action.action }));",
    ].join("\n");
    const output = child_process.execFileSync(process.execPath, ["-e", script, statePath, changeRoot], { encoding: "utf8" });
    assert.deepEqual(JSON.parse(output), {
      recovered: true,
      id: gitRepo.cB.candidate_id,
      action: "run-targeted-recheck",
    });
  } finally {
    fs.rmSync(changeRoot, { recursive: true, force: true });
    fs.rmSync(gitRepo.tmpDir, { recursive: true, force: true });
  }
});

test("REQ-verify-lineage-010: a state-write failure after Candidate publication leaves only inert successor bytes", () => {
  const changeRoot = setupContractDir();
  const gitRepo = setupGitRepoWithCandidates();
  const statePath = path.join(changeRoot, "state.json");
  try {
    const genesis = startVerifyLineage({ changeRoot, candidate: gitRepo.cA, findings: sampleFindings });
    fs.writeFileSync(statePath, JSON.stringify(genesis), "utf8");
    const attempt = recordRemediationAttempt(genesis, {
      changeRoot,
      candidate: gitRepo.cB,
      rootDir: gitRepo.tmpDir,
      git_trees: gitRepo.git_trees,
    });
    assert.equal(attempt.action, "run-targeted-recheck");
    assert.equal(fs.existsSync(path.join(changeRoot, attempt.lineage.candidate_recovery.current.relative_path)), true);

    // Simulate an atomic state.yaml write failure by leaving its durable bytes at
    // the genesis revision. A later process can only select the genesis ref.
    const reloaded = JSON.parse(fs.readFileSync(statePath, "utf8"));
    assert.deepEqual(reloaded, genesis);
    const prepared = prepareRemediation(reloaded, { changeRoot });
    assert.equal(prepared.valid, true);
    assert.equal(prepared.lineage.current_candidate_id, gitRepo.cA.candidate_id);
    assert.notEqual(attempt.lineage.current_candidate_id, reloaded.current_candidate_id);
  } finally {
    fs.rmSync(changeRoot, { recursive: true, force: true });
    fs.rmSync(gitRepo.tmpDir, { recursive: true, force: true });
  }
});
