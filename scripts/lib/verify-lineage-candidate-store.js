"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { computeCandidateId, validateCandidateV2 } = require("./execution-identities/index.js");

// Candidate blobs live directly below the trusted change root.  A digest is a
// filename, not a directory component: this deliberately avoids publishing
// through a caller-mutable `.verify-lineage` directory.
const STORE_PREFIX = ".verify-lineage-candidate";
const LEGACY_STORE_PREFIX = ".verify-lineage/candidates/sha256";
const REF_KIND = "candidate-recovery-ref/v1";

function stableSerialize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

function sha256(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function failure(reason_code, error) {
  return { ok: false, reason_code, error: error instanceof Error ? error.message : String(error || reason_code) };
}

function validateCandidate(candidate) {
  if (!candidate || typeof candidate !== "object" || !validateCandidateV2(candidate)) {
    throw Object.assign(new Error("Candidate/v2 failed canonical validation"), { code: "candidate-recovery-noncanonical" });
  }
  const candidateId = computeCandidateId(candidate);
  if (candidate.candidate_id !== candidateId) {
    throw Object.assign(new Error("Candidate/v2 candidate_id does not match canonical identity"), { code: "candidate-recovery-id-mismatch" });
  }
  return candidateId;
}

function safeLstat(target) {
  try {
    return fs.lstatSync(target);
  } catch (error) {
    if (error && error.code === "ENOENT") return null;
    throw error;
  }
}

function assertSafeChangeRoot(root) {
  const absoluteRoot = path.resolve(root);
  const rootStat = safeLstat(absoluteRoot);
  if (!rootStat || !rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw Object.assign(new Error("Candidate recovery root must be an existing non-symlink directory"), { code: "candidate-recovery-path-invalid" });
  }
  return absoluteRoot;
}

function canonicalBlobName(contentDigest) {
  return `${STORE_PREFIX}-${contentDigest.slice("sha256:".length)}.json`;
}

function legacyBlobPath(contentDigest) {
  return `${LEGACY_STORE_PREFIX}/${contentDigest.slice("sha256:".length)}.json`;
}

function assertReference(reference, expectedCandidateId) {
  if (!reference || typeof reference !== "object" || reference.kind !== REF_KIND || reference.schema_version !== 1) {
    throw Object.assign(new Error("Candidate recovery reference is invalid"), { code: "candidate-recovery-path-invalid" });
  }
  if (typeof reference.content_digest !== "string" || !/^sha256:[a-f0-9]{64}$/.test(reference.content_digest)) {
    throw Object.assign(new Error("Candidate recovery reference has invalid content digest"), { code: "candidate-recovery-path-invalid" });
  }
  if (typeof reference.candidate_id !== "string" || !/^sha256:[a-f0-9]{64}$/.test(reference.candidate_id)) {
    throw Object.assign(new Error("Candidate recovery reference has invalid candidate id"), { code: "candidate-recovery-path-invalid" });
  }
  const expectedPath = canonicalBlobName(reference.content_digest);
  const isLegacyPath = reference.relative_path === legacyBlobPath(reference.content_digest);
  if ((reference.relative_path !== expectedPath && !isLegacyPath) || path.isAbsolute(reference.relative_path) || reference.relative_path.includes("\\")) {
    throw Object.assign(new Error("Candidate recovery reference path is invalid"), { code: "candidate-recovery-path-invalid" });
  }
  if (expectedCandidateId && reference.candidate_id !== expectedCandidateId) {
    throw Object.assign(new Error("Candidate recovery reference does not match expected CandidateId"), { code: "candidate-recovery-id-mismatch" });
  }
}

function makeReference(candidate, bytes) {
  const candidateId = validateCandidate(candidate);
  const contentDigest = sha256(bytes);
  return {
    kind: REF_KIND,
    schema_version: 1,
    candidate_id: candidateId,
    content_digest: contentDigest,
    relative_path: canonicalBlobName(contentDigest),
  };
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = fs.openSync(directory, "r");
    fs.fsyncSync(descriptor);
  } catch (error) {
    // Windows does not consistently allow directory descriptors. File durability
    // has already been established; this is a best-effort portability step.
    if (!["EINVAL", "EPERM", "EISDIR"].includes(error.code)) throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function writeNoClobber(changeRoot, reference, bytes, hooks = {}) {
  const root = assertSafeChangeRoot(changeRoot);
  const finalPath = path.join(root, reference.relative_path);
  const tempPath = path.join(root, `.${path.basename(finalPath)}.${process.pid}.${crypto.randomUUID()}.tmp`);
  let descriptor;
  try {
    hooks.beforeOpen?.();
    descriptor = fs.openSync(tempPath, "wx", 0o600);
    fs.writeFileSync(descriptor, bytes);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    try {
      hooks.beforeLink?.();
      fs.linkSync(tempPath, finalPath);
      fs.unlinkSync(tempPath);
      fsyncDirectory(root);
      return { created: true };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      fs.unlinkSync(tempPath);
      return { created: false };
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    // Both names are direct children of the trusted change root.  If the
    // temporary file already vanished, cleanup is intentionally idempotent.
    try { fs.unlinkSync(tempPath); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

function persistCandidateRecord(changeRoot, candidate, hooks = {}) {
  try {
    const bytes = Buffer.from(stableSerialize(candidate), "utf8");
    const reference = makeReference(candidate, bytes);
    const result = writeNoClobber(changeRoot, reference, bytes, hooks);
    const recovered = recoverCandidateRecord(changeRoot, reference, reference.candidate_id);
    if (!recovered.ok) {
      return failure(
        result.created || recovered.reason_code === "candidate-recovery-path-invalid"
          ? recovered.reason_code
          : "candidate-recovery-conflict",
        recovered.error
      );
    }
    if (!recovered.candidate || !Buffer.from(stableSerialize(recovered.candidate), "utf8").equals(bytes)) {
      return failure("candidate-recovery-conflict", "Existing Candidate recovery bytes conflict with requested Candidate");
    }
    return { ok: true, reference, candidate: recovered.candidate, idempotent: !result.created };
  } catch (error) {
    return failure(error.code || "candidate-recovery-conflict", error);
  }
}

function recoverCandidateRecord(changeRoot, reference, expectedCandidateId) {
  try {
    assertReference(reference, expectedCandidateId);
    const root = assertSafeChangeRoot(changeRoot);
    const absolute = path.resolve(root, reference.relative_path);
    if (!absolute.startsWith(`${root}${path.sep}`)) return failure("candidate-recovery-path-invalid", "Candidate recovery path escapes root");
    const stat = safeLstat(absolute);
    if (!stat) return failure("candidate-recovery-missing", "Candidate recovery record is missing");
    if (!stat.isFile() || stat.isSymbolicLink()) return failure("candidate-recovery-path-invalid", "Candidate recovery record is not a regular file");
    const bytes = fs.readFileSync(absolute);
    if (sha256(bytes) !== reference.content_digest) return failure("candidate-recovery-digest-mismatch", "Candidate recovery digest does not match reference");
    const text = bytes.toString("utf8");
    if (!Buffer.from(text, "utf8").equals(bytes)) return failure("candidate-recovery-noncanonical", "Candidate recovery bytes are not UTF-8");
    let candidate;
    try { candidate = JSON.parse(text); } catch { return failure("candidate-recovery-noncanonical", "Candidate recovery bytes are not JSON"); }
    if (stableSerialize(candidate) !== text) return failure("candidate-recovery-noncanonical", "Candidate recovery JSON is not canonical");
    const candidateId = validateCandidate(candidate);
    if (candidateId !== reference.candidate_id || (expectedCandidateId && candidateId !== expectedCandidateId)) {
      return failure("candidate-recovery-id-mismatch", "Candidate recovery identity does not match reference");
    }
    return { ok: true, candidate, reference };
  } catch (error) {
    return failure(error.code || "candidate-recovery-path-invalid", error);
  }
}

module.exports = {
  STORE_PREFIX,
  REF_KIND,
  stableSerialize,
  persistCandidateRecord,
  recoverCandidateRecord,
};
