"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  collectCandidateRecoveryAudit,
  validateCandidateRecoveryAudit,
  persistRecoveryOperation,
  reconcileRecoveryOperation,
  preserveDirectedRecheckOperation,
  readDirectedRecheckDisposition,
  writeImmutable,
  sha256,
} = require("./verify-lineage-recovery.js");
const { stableSerialize } = require("./verify-lineage-candidate-store.js");

function lineage() {
  return {
    lineage_id: "sha256:" + "1".repeat(64),
    current_candidate_id: "sha256:" + "2".repeat(64),
    candidate_recovery: { current: { content_digest: "sha256:" + "3".repeat(64) } },
  };
}

test("REQ-verify-lineage-013: an exhaustive negative audit is durable and rejects a tampered blob", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vl-recovery-"));
  try {
    const audit = collectCandidateRecoveryAudit(lineage(), {
      changeRoot: root,
      sources: [
        { id: "persisted-record", applicable: true, metadata: "recovered", tree: "unavailable" },
        { id: "change-root", applicable: true, metadata: "unavailable", tree: "unavailable" },
        { id: "git-objects", applicable: true, metadata: "unavailable", tree: "unavailable" },
        { id: "git-references", applicable: true, metadata: "unavailable", tree: "unavailable" },
        { id: "reflog", applicable: true, metadata: "unavailable", tree: "unavailable" },
        { id: "stash", applicable: true, metadata: "unavailable", tree: "unavailable" },
        { id: "worktrees", applicable: true, metadata: "unavailable", tree: "unavailable" },
      ],
    });
    assert.equal(audit.ok, true);
    assert.equal(validateCandidateRecoveryAudit(lineage(), audit.reference, { changeRoot: root }).ok, true);
    fs.writeFileSync(path.join(root, audit.reference.relative_path), "{}", "utf8");
    assert.equal(validateCandidateRecoveryAudit(lineage(), audit.reference, { changeRoot: root }).ok, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("REQ-verify-lineage-013: unknown inventory source blocks audit and the journal replays only exact completed output", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vl-recovery-"));
  try {
    assert.throws(() => collectCandidateRecoveryAudit(lineage(), { changeRoot: root, sources: [{ id: "change-root", applicable: true, tree: "unknown" }] }));
    const pending = persistRecoveryOperation(root, { type: "terminalize", input: { a: 1 }, expected_output: { b: 2 } });
    const completed = reconcileRecoveryOperation(root, pending.reference, { output: { b: 2 } });
    assert.equal(completed.status, "completed");
    assert.deepEqual(reconcileRecoveryOperation(root, pending.reference, { output: { b: 2 } }).output, { b: 2 });
    assert.throws(() => reconcileRecoveryOperation(root, pending.reference, { output: { b: 3 } }));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("REQ-verify-lineage-015: a pending directed recheck receives one immutable preserved non-reconcilable disposition without replay", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vl-recovery-"));
  try {
    const pending = persistRecoveryOperation(root, {
      type: "directed-recheck-command",
      input: { lineage_id: lineage().lineage_id, finding_id: "V001", command: "node --test focal.js", index: 0 },
      expected_output: { command: "node --test focal.js" },
    });
    const original = fs.readFileSync(path.join(root, pending.reference.relative_path));
    const first = preserveDirectedRecheckOperation(root, pending.reference, { predecessor_lineage_id: lineage().lineage_id });
    const second = preserveDirectedRecheckOperation(root, pending.reference, { predecessor_lineage_id: lineage().lineage_id });

    assert.equal(first.disposition.status, "non-reconcilable");
    assert.equal(first.disposition.preserved, true);
    assert.equal(first.disposition.reason_code, "completion-absent");
    assert.deepEqual(second.reference, first.reference);
    assert.deepEqual(fs.readFileSync(path.join(root, pending.reference.relative_path)), original);
    assert.deepEqual(readDirectedRecheckDisposition(root, first.reference).disposition, first.disposition);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("REQ-verify-lineage-015: unknown completion evidence is preserved and never promoted to an exit result", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "vl-recovery-"));
  try {
    const pending = persistRecoveryOperation(root, {
      type: "directed-recheck-command",
      input: { lineage_id: lineage().lineage_id, finding_id: "V001", command: "node --test focal.js", index: 0 },
      expected_output: { command: "node --test focal.js" },
    });
    const invalidCompletion = { ...pending.operation, status: "unknown", output: { command: "node --test focal.js", exit_code: 0, output: "invented" } };
    const digest = sha256(Buffer.from(stableSerialize(invalidCompletion), "utf8"));
    writeImmutable(root, `.verify-lineage-operation-result-${digest.slice(7)}.json`, invalidCompletion);
    const preserved = preserveDirectedRecheckOperation(root, pending.reference, { predecessor_lineage_id: lineage().lineage_id });
    assert.equal(preserved.disposition.reason_code, "completion-invalid");
    assert.equal(Object.hasOwn(preserved.disposition, "exit_code"), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
