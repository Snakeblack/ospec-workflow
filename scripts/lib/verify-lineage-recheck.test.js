"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  startVerifyLineage,
  startReconciliationSuccessor,
  persistReconciliationSuccessorState,
  persistRecheckResultState,
  getLineageNextAction,
} = require("./verify-lineage.js");
const { captureCandidateSnapshot } = require("./verify-lineage-candidate-store.js");
const {
  persistRecoveryOperation,
  preserveDirectedRecheckOperation,
  collectReconciliationSuccessorAudit,
} = require("./verify-lineage-recovery.js");
const { runRecoverySuccessorRecheck, createDirectedRecheckJournal } = require("./verify-lineage-recheck.js");

function setupContract(changeRoot) {
  fs.mkdirSync(path.join(changeRoot, "specs", "recheck"), { recursive: true });
  fs.writeFileSync(path.join(changeRoot, "proposal.md"), "# Proposal\nDirected recovery recheck\n");
  fs.writeFileSync(path.join(changeRoot, "specs", "recheck", "spec.md"), "# Spec\nReplay completed evidence only\n");
  fs.writeFileSync(path.join(changeRoot, "design.md"), "# Design\nMap every recipe result by finding\n");
  fs.writeFileSync(path.join(changeRoot, "tasks.md"), "# Tasks\n- [x] directed recheck\n");
}

function setupRecoverySuccessor(findings) {
  const changeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "vl-recheck-change-"));
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "vl-recheck-repo-"));
  const git = (args) => childProcess.execFileSync("git", args, { cwd: rootDir, encoding: "utf8" }).trim();
  setupContract(changeRoot);
  git(["init"]);
  git(["config", "user.name", "Recheck Test"]);
  git(["config", "user.email", "recheck@example.test"]);
  fs.writeFileSync(path.join(rootDir, "subject.txt"), "base\n");
  git(["add", "."]);
  git(["commit", "-m", "base"]);
  fs.writeFileSync(path.join(rootDir, "subject.txt"), "candidate B\n");
  const captured = captureCandidateSnapshot(changeRoot, { rootDir, repository_id: "recheck-test" });
  assert.equal(captured.ok, true);
  const lineage = startVerifyLineage({ changeRoot, candidate: captured.candidate, findings });
  lineage.status = "recheck-pending";
  lineage.candidate_snapshot = captured.snapshot_ref;
  lineage.recovery_successor = { schema_version: 1 };
  return {
    changeRoot,
    rootDir,
    lineage,
    cleanup() {
      fs.rmSync(changeRoot, { recursive: true, force: true });
      fs.rmSync(rootDir, { recursive: true, force: true });
    },
  };
}

function finding(id, commands) {
  return {
    id,
    severity: "CRITICAL",
    summary: `${id} regression`,
    origin: "code-bug",
    allowed_paths: ["subject.txt"],
    validation: { commands, expected_exit: 0, test_files: [] },
  };
}

test("REQ-verify-lineage-014: directed recheck rejects caller supplied results", () => {
  assert.throws(() => runRecoverySuccessorRecheck({}, { recheck_results: [true] }), /caller-supplied/);
});

test("REQ-verify-lineage-014: completed recipe evidence is normalized from entries to the canonical finding map without replay", () => {
  const fixture = setupRecoverySuccessor([finding("V001", ["first"]), finding("V002", ["second", "third"])]);
  try {
    let invocations = 0;
    const first = runRecoverySuccessorRecheck(fixture.lineage, {
      changeRoot: fixture.changeRoot,
      rootDir: fixture.rootDir,
      runCommand() { invocations += 1; return { status: 0, stdout: "ok\n", stderr: "" }; },
    });
    assert.equal(first.action, "close");
    assert.equal(first.lineage.status, "closed");
    assert.deepEqual(Object.fromEntries(first.lineage.findings.map((item) => [item.id, item.status])), { V001: "resolved", V002: "resolved" });
    assert.equal(invocations, 3);

    const replay = runRecoverySuccessorRecheck(fixture.lineage, {
      changeRoot: fixture.changeRoot,
      rootDir: fixture.rootDir,
      runCommand() { throw new Error("a completed directed recipe must not execute again"); },
    });
    assert.equal(replay.action, "close");
    assert.equal(replay.lineage.status, "closed");
  } finally { fixture.cleanup(); }
});

test("REQ-verify-lineage-014: a partial recipe failure keeps its finding unresolved even when another finding passes", () => {
  const fixture = setupRecoverySuccessor([finding("V001", ["first", "second"]), finding("V002", ["third"])]);
  try {
    const statuses = [0, 1, 0];
    const result = runRecoverySuccessorRecheck(fixture.lineage, {
      changeRoot: fixture.changeRoot,
      rootDir: fixture.rootDir,
      runCommand() { return { status: statuses.shift(), stdout: "evidence\n", stderr: "" }; },
    });
    assert.equal(result.action, "remediate-again");
    assert.deepEqual(Object.fromEntries(result.lineage.findings.map((item) => [item.id, item.status])), { V001: "unresolved", V002: "resolved" });
  } finally { fixture.cleanup(); }
});

test("REQ-verify-lineage-014: a non-zero exit is a durable failed outcome and is never retried", () => {
  const fixture = setupRecoverySuccessor([finding("V001", ["fails"])]);
  try {
    let calls = 0;
    const first = runRecoverySuccessorRecheck(fixture.lineage, {
      changeRoot: fixture.changeRoot,
      rootDir: fixture.rootDir,
      runCommand() { calls += 1; return { status: 7, stdout: "", stderr: "failure\n" }; },
    });
    assert.equal(first.action, "remediate-again");
    assert.equal(calls, 1);
    const replay = runRecoverySuccessorRecheck(fixture.lineage, {
      changeRoot: fixture.changeRoot,
      rootDir: fixture.rootDir,
      runCommand() { throw new Error("failed evidence must be reconciled, not replayed"); },
    });
    assert.equal(replay.action, "remediate-again");
  } finally { fixture.cleanup(); }
});

test("REQ-verify-lineage-014: a pre-existing pending directed operation blocks exact reconciliation before any command", () => {
  const fixture = setupRecoverySuccessor([finding("V001", ["pending"])]);
  try {
    persistRecoveryOperation(fixture.changeRoot, {
      type: "directed-recheck-command",
      input: { lineage_id: fixture.lineage.lineage_id, finding_id: "V001", command: "pending", index: 0 },
      expected_output: { command: "pending" },
    });
    let calls = 0;
    assert.throws(() => runRecoverySuccessorRecheck(fixture.lineage, {
      changeRoot: fixture.changeRoot,
      rootDir: fixture.rootDir,
      runCommand() { calls += 1; return { status: 0, stdout: "", stderr: "" }; },
    }), /reconciliation required/);
    assert.equal(calls, 0);
  } finally { fixture.cleanup(); }
});

test("REQ-verify-lineage-017: restart does not replay a pending fresh-journal operation", () => {
  const fixture = setupRecoverySuccessor([finding("V001", ["pending"]) ]);
  try {
    const journal = createDirectedRecheckJournal(fixture.lineage, { changeRoot: fixture.changeRoot });
    const recipe = journal.manifest.recipes[0];
    persistRecoveryOperation(fixture.changeRoot, {
      type: "directed-recheck-command",
      input: {
        lineage_id: fixture.lineage.lineage_id, journal_id: journal.manifest.journal_id,
        manifest_digest: journal.reference.content_digest, finding_id: recipe.finding_id, command: recipe.command, index: recipe.index,
      },
      expected_output: { command: recipe.command },
    });
    let calls = 0;
    assert.throws(() => runRecoverySuccessorRecheck(fixture.lineage, {
      changeRoot: fixture.changeRoot, rootDir: fixture.rootDir,
      runCommand() { calls += 1; return { status: 0, stdout: "", stderr: "" }; },
    }), /reconciliation required/);
    assert.equal(calls, 0);
  } finally { fixture.cleanup(); }
});

test("REQ-verify-lineage-017: completion is durable before the runner evaluates recipe coverage", () => {
  const fixture = setupRecoverySuccessor([finding("V001", ["passes"])]);
  try {
    let completionObserved = false;
    const result = runRecoverySuccessorRecheck(fixture.lineage, {
      changeRoot: fixture.changeRoot, rootDir: fixture.rootDir,
      runCommand() { return { status: 0, stdout: "ok", stderr: "" }; },
      onCompletionPersisted() { completionObserved = true; },
      onBeforeEvaluate() { assert.equal(completionObserved, true); },
    });
    assert.equal(result.action, "close");
  } finally { fixture.cleanup(); }
});

test("REQ-verify-lineage-015..018: an audited successor closes durably and a restarted runtime uses the cached pass", () => {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), "vl-recheck-e2e-repo-"));
  const changeRoot = path.join(rootDir, "openspec", "changes", "directed-e2e");
  const statePath = path.join(changeRoot, "state.yaml");
  const git = (args) => childProcess.execFileSync("git", args, { cwd: rootDir, encoding: "utf8" }).trim();
  const command = `${JSON.stringify(process.execPath)} -e "process.stdout.write('directed pass')"`;
  try {
    git(["init"]);
    git(["config", "user.name", "Directed Recheck"]);
    git(["config", "user.email", "directed@example.test"]);
    fs.writeFileSync(path.join(rootDir, "subject.txt"), "base\n");
    git(["add", "."]); git(["commit", "-m", "base"]);
    fs.mkdirSync(changeRoot, { recursive: true });
    setupContract(changeRoot);
    fs.writeFileSync(path.join(rootDir, "subject.txt"), "candidate B\n");

    const predecessorCapture = captureCandidateSnapshot(changeRoot, { rootDir, repository_id: "directed-e2e" });
    assert.equal(predecessorCapture.ok, true, predecessorCapture.error);
    const predecessor = startVerifyLineage({ changeRoot, candidate: predecessorCapture.candidate, findings: [finding("V001", [command, command])] });
    const oldOperations = [0, 1].map((index) => persistRecoveryOperation(changeRoot, {
      type: "directed-recheck-command",
      input: { lineage_id: predecessor.lineage_id, finding_id: "V001", command, index },
      expected_output: { command },
    }));
    const dispositions = oldOperations.map((operation) =>
      preserveDirectedRecheckOperation(changeRoot, operation.reference, { predecessor_lineage_id: predecessor.lineage_id })
    );
    fs.writeFileSync(path.join(rootDir, "subject.txt"), "candidate C\n");
    const successorCapture = captureCandidateSnapshot(changeRoot, { rootDir, repository_id: "directed-e2e" });
    assert.equal(successorCapture.ok, true, successorCapture.error);
    const approvals = [{
      id: "successor-e2e-approval", gate: "successor-reconciliation",
      decision: "authorize-audited-successor-for-unreconciled-directed-operations",
      source: "codex/plain-chat-numbered-gate", applies_to: ["sdd-apply"],
    }];
    const audit = collectReconciliationSuccessorAudit(predecessor, {
      changeRoot, approvals, dispositions: dispositions.map((item) => item.reference),
    });
    fs.writeFileSync(statePath, `verify_lineage: ${JSON.stringify(predecessor)}\nverify_lineage_history: []\n`);
    const proposed = startReconciliationSuccessor(predecessor, {
      changeRoot, rootDir, snapshotRef: successorCapture.snapshot_ref, auditRef: audit.reference, approvals,
    });
    assert.equal(proposed.ok, true, proposed.error || proposed.reason_code);
    persistReconciliationSuccessorState(statePath, predecessor, proposed.lineage);

    const persistedSuccessor = JSON.parse(/^verify_lineage: (.+)$/m.exec(fs.readFileSync(statePath, "utf8"))[1]);
    const result = runRecoverySuccessorRecheck(persistedSuccessor, { changeRoot, rootDir });
    assert.equal(result.action, "close");
    assert.equal(result.lineage.status, "closed");
    persistRecheckResultState(statePath, persistedSuccessor, result.lineage);

    const reloaded = JSON.parse(/^verify_lineage: (.+)$/m.exec(fs.readFileSync(statePath, "utf8"))[1]);
    const recovered = captureCandidateSnapshot(changeRoot, { rootDir, repository_id: "directed-e2e" });
    assert.equal(recovered.ok, true, recovered.error);
    assert.equal(recovered.candidate.candidate_id, reloaded.verified_candidate_id);
    assert.deepEqual(
      getLineageNextAction(reloaded, { changeRoot, candidate: recovered.candidate }),
      { action: "return-cached-pass", reason: "lineage-closed-and-candidate-verified" }
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
});
