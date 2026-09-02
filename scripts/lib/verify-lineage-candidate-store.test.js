"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { freezeCandidate } = require("./execution-identities/index.js");
const {
  stableSerialize,
  persistCandidateRecord,
  recoverCandidateRecord,
} = require("./verify-lineage-candidate-store.js");

function candidate(suffix = "2") {
  return freezeCandidate({
    repository_id: "candidate-store-test",
    projection: "workspace",
    base_tree: `sha256:${"1".repeat(63)}${suffix}`,
    candidate_tree: `sha256:${"2".repeat(63)}${suffix}`,
    diff_hash: `sha256:${"3".repeat(63)}${suffix}`,
    paths: ["src/a.js"],
  });
}

function changeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "vl-candidate-store-"));
}

test("REQ-verify-lineage-010: persists canonical Candidate bytes at the digest-derived, change-local path", () => {
  const root = changeRoot();
  try {
    const value = candidate();
    const result = persistCandidateRecord(root, value);
    assert.equal(result.ok, true);
    assert.equal(result.idempotent, false);
    assert.match(result.reference.content_digest, /^sha256:[a-f0-9]{64}$/);
    assert.equal(result.reference.candidate_id, value.candidate_id);
    assert.equal(result.reference.relative_path, `.verify-lineage-candidate-${result.reference.content_digest.slice(7)}.json`);
    const bytes = fs.readFileSync(path.join(root, result.reference.relative_path));
    assert.equal(bytes.toString("utf8"), stableSerialize(value));
    assert.equal(`sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`, result.reference.content_digest);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("REQ-verify-lineage-010: repeated publish is idempotent and cannot clobber divergent bytes", () => {
  const root = changeRoot();
  try {
    const value = candidate();
    const first = persistCandidateRecord(root, value);
    const second = persistCandidateRecord(root, value);
    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(second.idempotent, true);
    assert.deepEqual(second.reference, first.reference);

    fs.writeFileSync(path.join(root, first.reference.relative_path), "{}", "utf8");
    const conflict = persistCandidateRecord(root, value);
    assert.equal(conflict.ok, false);
    assert.equal(conflict.reason_code, "candidate-recovery-conflict");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("REQ-verify-lineage-010: rejects incomplete Candidates and a symlinked direct-root target", (t) => {
  const root = changeRoot();
  try {
    const invalid = persistCandidateRecord(root, { kind: "candidate/v2" });
    assert.equal(invalid.ok, false);

    const external = fs.mkdtempSync(path.join(os.tmpdir(), "vl-external-"));
    t.after(() => fs.rmSync(external, { recursive: true, force: true }));
    const value = candidate();
    const bytes = Buffer.from(stableSerialize(value), "utf8");
    const digest = `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
    fs.symlinkSync(external, path.join(root, `.verify-lineage-candidate-${digest.slice(7)}.json`), "file");
    const unsafe = persistCandidateRecord(root, value);
    assert.equal(unsafe.ok, false);
    assert.equal(unsafe.reason_code, "candidate-recovery-path-invalid");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("F-e9ec0655ee53d886: replacing the former storage directory during publication cannot redirect a direct-root CAS write", (t) => {
  const root = changeRoot();
  const external = fs.mkdtempSync(path.join(os.tmpdir(), "vl-race-external-"));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));
  try {
    const value = candidate();
    const result = persistCandidateRecord(root, value, {
      beforeOpen: () => fs.symlinkSync(external, path.join(root, ".verify-lineage"), "junction"),
    });
    assert.equal(result.ok, true);
    assert.deepEqual(fs.readdirSync(external), []);
    fs.unlinkSync(path.join(root, ".verify-lineage"));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("F-e9ec0655ee53d886: a final-name replacement in the publication window is fail-closed and never follows the link", (t) => {
  const root = changeRoot();
  const external = fs.mkdtempSync(path.join(os.tmpdir(), "vl-race-external-"));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));
  try {
    const value = candidate();
    const bytes = Buffer.from(stableSerialize(value), "utf8");
    const digest = `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
    const finalName = `.verify-lineage-candidate-${digest.slice(7)}.json`;
    const result = persistCandidateRecord(root, value, {
      beforeLink: () => fs.symlinkSync(external, path.join(root, finalName), "file"),
    });
    assert.equal(result.ok, false);
    assert.equal(result.reason_code, "candidate-recovery-path-invalid");
    assert.deepEqual(fs.readdirSync(external), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("REQ-verify-lineage-011: recovery double-validates path, bytes, canonical representation, and Candidate identity", () => {
  const root = changeRoot();
  try {
    const value = candidate();
    const stored = persistCandidateRecord(root, value);
    assert.equal(stored.ok, true);
    assert.deepEqual(recoverCandidateRecord(root, stored.reference, value.candidate_id).candidate, value);

    fs.writeFileSync(path.join(root, stored.reference.relative_path), `${stableSerialize(value)} `, "utf8");
    const noncanonical = recoverCandidateRecord(root, stored.reference, value.candidate_id);
    assert.equal(noncanonical.ok, false);
    assert.equal(noncanonical.reason_code, "candidate-recovery-digest-mismatch");

    fs.rmSync(path.join(root, stored.reference.relative_path));
    const missing = recoverCandidateRecord(root, stored.reference, value.candidate_id);
    assert.equal(missing.ok, false);
    assert.equal(missing.reason_code, "candidate-recovery-missing");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("REQ-verify-lineage-011: recovery rejects canonical bytes that are bound to a divergent Candidate identity", () => {
  const root = changeRoot();
  try {
    const original = candidate();
    const divergent = candidate("4");
    const stored = persistCandidateRecord(root, original);
    const bytes = Buffer.from(stableSerialize(divergent), "utf8");
    const ref = {
      ...stored.reference,
      content_digest: `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`,
    };
    ref.relative_path = `.verify-lineage-candidate-${ref.content_digest.slice(7)}.json`;
    fs.writeFileSync(path.join(root, ref.relative_path), bytes);
    const recovered = recoverCandidateRecord(root, ref, original.candidate_id);
    assert.equal(recovered.ok, false);
    assert.equal(recovered.reason_code, "candidate-recovery-id-mismatch");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("REQ-verify-lineage-010: orphan temp files and post-publish blobs never become a valid reference", () => {
  const root = changeRoot();
  try {
    const value = candidate();
    const bytes = Buffer.from(stableSerialize(value), "utf8");
    const digest = `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
    const relativePath = `.verify-lineage-candidate-${digest.slice(7)}.json`;
    fs.writeFileSync(path.join(root, `.pending.${process.pid}.tmp`), bytes);
    const absent = recoverCandidateRecord(root, {
      kind: "candidate-recovery-ref/v1",
      schema_version: 1,
      candidate_id: value.candidate_id,
      content_digest: digest,
      relative_path: relativePath,
    }, value.candidate_id);
    assert.equal(absent.ok, false);
    assert.equal(absent.reason_code, "candidate-recovery-missing");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
