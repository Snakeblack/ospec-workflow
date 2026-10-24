"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { computeCandidateId, freezeCandidate, validateCandidateV2 } = require("./execution-identities/index.js");
const childProcess = require("node:child_process");
const os = require("node:os");

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

function gitOutput(rootDir, args, env = undefined) {
  return childProcess.execFileSync("git", args, { cwd: rootDir, env: env || process.env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }).trim();
}
function gitText(rootDir, args, env = undefined) {
  return childProcess.execFileSync("git", args, { cwd: rootDir, env: env || process.env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 });
}

function canonicalRelativePath(value) {
  if (typeof value !== "string" || value.length === 0 || path.isAbsolute(value)) {
    throw new Error("snapshot exclusion path is invalid");
  }
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (!normalized || normalized.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error("snapshot exclusion path escapes the workspace");
  }
  return normalized;
}

const OPERATIONAL_CHANGE_FILES = new Set([
  "state.yaml",
  "apply-progress.md",
  "verify-report.md",
  "archive-report.md",
]);

function isOperationalChangeArtifact(name) {
  return OPERATIONAL_CHANGE_FILES.has(name) ||
    /^(?:\.verify-lineage-|\.candidate-recovery-audit-|\.reconciliation-successor-audit-|\.directed-recheck-journal-)/.test(name);
}

function workspaceExcludedPaths(changeRoot, rootDir, explicit = []) {
  const paths = [...explicit];
  if (changeRoot) {
    const absoluteRoot = path.resolve(rootDir);
    const absoluteChange = path.resolve(changeRoot);
    const relative = path.relative(absoluteRoot, absoluteChange);
    if (relative && !relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)) {
      const relativeChangeRoot = canonicalRelativePath(relative);
      for (const name of OPERATIONAL_CHANGE_FILES) paths.push(`${relativeChangeRoot}/${name}`);
      for (const entry of fs.readdirSync(absoluteChange, { withFileTypes: true })) {
        if (entry.isFile() && isOperationalChangeArtifact(entry.name)) paths.push(`${relativeChangeRoot}/${entry.name}`);
      }
    }
  }
  return [...new Set(paths.map(canonicalRelativePath))].sort();
}

function operationalIgnorePatterns(excludedPaths) {
  const directories = [...new Set(excludedPaths.map((entry) => entry.slice(0, entry.lastIndexOf("/"))).filter(Boolean))];
  const dynamic = directories.flatMap((directory) => [
    `${directory}/.verify-lineage-*`,
    `${directory}/.candidate-recovery-audit-*`,
    `${directory}/.reconciliation-successor-audit-*`,
    `${directory}/.directed-recheck-journal-*`,
  ]);
  return [...new Set([...excludedPaths, ...dynamic])].sort();
}

function collectWorkspaceTree(rootDir, options = {}) {
  const indexPath = path.join(os.tmpdir(), `.verify-lineage-index-${process.pid}-${crypto.randomUUID()}`);
  const excludesPath = path.join(os.tmpdir(), `.verify-lineage-excludes-${process.pid}-${crypto.randomUUID()}`);
  const env = { ...process.env, GIT_INDEX_FILE: indexPath };
  try {
    const baseTreeOid = gitOutput(rootDir, ["rev-parse", "HEAD^{tree}"]);
    gitOutput(rootDir, ["read-tree", "HEAD"], env);
    const excludedPaths = (options.excludedPaths || []).map(canonicalRelativePath);
    fs.writeFileSync(excludesPath, `${operationalIgnorePatterns(excludedPaths).join("\n")}\n`, "utf8");
    gitOutput(rootDir, ["-c", `core.excludesFile=${excludesPath}`, "add", "-A"], env);
    if (excludedPaths.length > 0) {
      gitOutput(rootDir, ["rm", "--cached", "-r", "--ignore-unmatch", "--", ...excludedPaths], env);
    }
    const candidateTreeOid = gitOutput(rootDir, ["write-tree"], env);
    const base = treeEvidence(rootDir, baseTreeOid);
    const candidate = treeEvidence(rootDir, candidateTreeOid);
    const diffText = gitText(rootDir, ["diff", "--cached", "--binary", "--no-ext-diff", "HEAD", "--"], env);
    const paths = childProcess.execFileSync("git", ["diff", "--cached", "--name-only", "-z", "HEAD", "--"], { cwd: rootDir, env, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }).split("\0").filter(Boolean).sort();
    const baseModes = new Map(base.entries.map((entry) => [entry.path, entry.mode]));
    const candidateModes = new Map(candidate.entries.map((entry) => [entry.path, entry.mode]));
    const fileModes = Object.fromEntries(paths.map((entry) => [entry, { base: baseModes.get(entry) || null, candidate: candidateModes.get(entry) || null }]));
    return { baseTreeOid, candidateTreeOid, base, candidate, diffText, paths, fileModes, excludedPaths };
  } finally {
    for (const suffix of ["", ".lock"]) {
      try { fs.unlinkSync(`${indexPath}${suffix}`); } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    try { fs.unlinkSync(excludesPath); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

function treeEvidence(rootDir, oid) {
  if (typeof oid !== "string" || !/^[0-9a-f]{40,64}$/i.test(oid)) throw new Error("Git tree OID is invalid");
  if (gitOutput(rootDir, ["cat-file", "-t", oid]) !== "tree") throw new Error("Git object is not a tree");
  const entries = gitOutput(rootDir, ["ls-tree", "-r", "-z", oid]).split("\0").filter(Boolean).map((line) => {
    const match = /^(\d+) ([a-z]+) ([0-9a-f]+)\t(.+)$/i.exec(line);
    if (!match) throw new Error("Git tree entry is malformed");
    return { mode: match[1], type: match[2], oid: match[3], path: match[4] };
  });
  return { oid, entries, content_digest: sha256(Buffer.from(stableSerialize(entries), "utf8")) };
}

function snapshotReference(snapshot) {
  const bytes = Buffer.from(stableSerialize(snapshot), "utf8");
  const content_digest = sha256(bytes);
  return {
    kind: "candidate-snapshot-ref/v1", schema_version: 1, candidate_id: snapshot.candidate_id,
    content_digest, relative_path: `.verify-lineage-snapshot-${content_digest.slice(7)}.json`,
  };
}

function persistCandidateSnapshot(changeRoot, candidate, options = {}) {
  try {
    const candidateRecord = persistCandidateRecord(changeRoot, candidate);
    if (!candidateRecord.ok) return candidateRecord;
    const rootDir = options.rootDir || options.sourceRoot;
    let material;
    if (options.git !== false && rootDir) {
      const baseTreeOid = options.base_tree_oid || options.baseTreeOid;
      const candidateTreeOid = options.candidate_tree_oid || options.candidateTreeOid;
      material = {
        type: "git-tree-snapshot/v1",
        base: treeEvidence(rootDir, baseTreeOid),
        candidate: treeEvidence(rootDir, candidateTreeOid),
        excluded_paths: workspaceExcludedPaths(changeRoot, rootDir, options.excludedPaths || []),
      };
      material.diff_digest = candidate.diff_hash;
      material.changed_paths_modes_digest = candidate.changed_paths_modes_digest;
      material.paths = [...candidate.paths];
    } else {
      const files = options.manifest;
      if (!Array.isArray(files) || files.length === 0) throw new Error("complete non-Git snapshot manifest is required");
      material = { type: "file-manifest-snapshot/v1", entries: files.map((entry) => {
        if (!entry || typeof entry.path !== "string" || entry.path.includes("..") || !["file", "symlink"].includes(entry.type) || typeof entry.mode !== "string" || typeof entry.content !== "string") throw new Error("non-Git snapshot entry is invalid");
        return { path: entry.path.replaceAll("\\", "/"), type: entry.type, mode: entry.mode, content: entry.content };
      }).sort((a, b) => a.path.localeCompare(b.path)) };
      material.content_digest = sha256(Buffer.from(stableSerialize(material.entries), "utf8"));
    }
    const snapshot = { kind: "candidate-snapshot/v1", schema_version: 1, candidate_id: candidateRecord.reference.candidate_id, candidate_ref: candidateRecord.reference, material };
    const reference = snapshotReference(snapshot);
    const result = writeNoClobber(changeRoot, reference, Buffer.from(stableSerialize(snapshot), "utf8"));
    const recovered = recoverCandidateSnapshot(changeRoot, reference, candidateRecord.reference.candidate_id, { rootDir });
    if (!recovered.ok) return failure(recovered.reason_code, recovered.error);
    return { ok: true, reference, snapshot: recovered.snapshot, candidate: recovered.candidate, idempotent: !result.created };
  } catch (error) { return failure(error.code || "candidate-snapshot-invalid", error); }
}

function recoverCandidateSnapshot(changeRoot, reference, expectedCandidateId, options = {}) {
  try {
    if (!reference || reference.kind !== "candidate-snapshot-ref/v1" || reference.schema_version !== 1 || reference.candidate_id !== expectedCandidateId || !/^sha256:[a-f0-9]{64}$/.test(reference.content_digest) || reference.relative_path !== `.verify-lineage-snapshot-${reference.content_digest.slice(7)}.json`) {
      throw Object.assign(new Error("snapshot reference is invalid"), { code: "candidate-snapshot-invalid" });
    }
    const root = assertSafeChangeRoot(changeRoot);
    const absolute = path.resolve(root, reference.relative_path);
    if (!absolute.startsWith(`${root}${path.sep}`)) return failure("candidate-snapshot-path-invalid", "Snapshot path escapes root");
    const stat = safeLstat(absolute);
    if (!stat || !stat.isFile() || stat.isSymbolicLink()) return failure("candidate-snapshot-missing", "Candidate snapshot is missing or unsafe");
    const bytes = fs.readFileSync(absolute);
    if (sha256(bytes) !== reference.content_digest) return failure("candidate-snapshot-digest-mismatch", "Snapshot digest does not match reference");
    const snapshot = JSON.parse(bytes.toString("utf8"));
    if (stableSerialize(snapshot) !== bytes.toString("utf8") || snapshot.kind !== "candidate-snapshot/v1" || snapshot.candidate_id !== expectedCandidateId) return failure("candidate-snapshot-invalid", "Snapshot is not canonical or bound to Candidate");
    const recoveredCandidate = recoverCandidateRecord(changeRoot, snapshot.candidate_ref, expectedCandidateId);
    if (!recoveredCandidate.ok) return recoveredCandidate;
    if (snapshot.material?.type === "git-tree-snapshot/v1") {
      const rootDir = options.rootDir || options.sourceRoot;
      if (!rootDir) return failure("candidate-snapshot-root-required", "Git snapshot validation requires rootDir");
      const base = treeEvidence(rootDir, snapshot.material.base?.oid);
      const candidate = treeEvidence(rootDir, snapshot.material.candidate?.oid);
      if (base.content_digest !== snapshot.material.base.content_digest || candidate.content_digest !== snapshot.material.candidate.content_digest) return failure("candidate-snapshot-tree-drift", "Git tree contents changed or snapshot was swapped");
      if (snapshot.material.diff_digest !== recoveredCandidate.candidate.diff_hash || snapshot.material.changed_paths_modes_digest !== recoveredCandidate.candidate.changed_paths_modes_digest || stableSerialize(snapshot.material.paths) !== stableSerialize(recoveredCandidate.candidate.paths)) return failure("candidate-snapshot-binding-mismatch", "Git snapshot does not bind Candidate diff and changed paths");
      if (options.verifyLiveWorkspace === true) {
        const live = collectWorkspaceTree(rootDir, { excludedPaths: snapshot.material.excluded_paths || [] });
        if (live.baseTreeOid !== snapshot.material.base.oid || live.candidateTreeOid !== snapshot.material.candidate.oid) {
          return failure("candidate-snapshot-live-workspace-drift", "Live execution workspace no longer matches the captured Candidate snapshot");
        }
      }
    } else if (snapshot.material?.type === "file-manifest-snapshot/v1") {
      if (!Array.isArray(snapshot.material.entries) || snapshot.material.entries.length === 0) return failure("candidate-snapshot-incomplete", "Non-Git manifest is incomplete");
    } else return failure("candidate-snapshot-invalid", "Snapshot material type is invalid");
    return { ok: true, snapshot, candidate: recoveredCandidate.candidate, reference };
  } catch (error) { return failure(error.code || "candidate-snapshot-invalid", error); }
}

// Materialise the current worktree in a private Git index. This never reads or
// mutates the caller's index, but gives a genuine tree object for every tracked
// and intended untracked path used to freeze Candidate B.
function captureCandidateSnapshot(changeRoot, options = {}) {
  const rootDir = options.rootDir;
  if (!rootDir) return failure("candidate-snapshot-root-required", "rootDir is required for Git Candidate capture");
  try {
    const excludedPaths = workspaceExcludedPaths(changeRoot, rootDir, options.excludedPaths || []);
    const workspace = collectWorkspaceTree(rootDir, { excludedPaths });
    const repositoryId = options.repository_id || options.repositoryId || gitOutput(rootDir, ["config", "--get", "remote.origin.url"]) || gitOutput(rootDir, ["rev-parse", "--show-toplevel"]);
    const frozen = freezeCandidate({
      repository_id: repositoryId,
      projection: options.projection || "workspace",
      base_tree: workspace.base.content_digest,
      candidate_tree: workspace.candidate.content_digest,
      diffText: workspace.diffText,
      paths: workspace.paths,
      fileModes: workspace.fileModes,
    });
    const persisted = persistCandidateSnapshot(changeRoot, frozen, {
      rootDir,
      base_tree_oid: workspace.baseTreeOid,
      candidate_tree_oid: workspace.candidateTreeOid,
      excludedPaths,
    });
    if (!persisted.ok) return persisted;
    return { ok: true, candidate: frozen, candidate_ref: persisted.snapshot.candidate_ref, snapshot: persisted.snapshot, snapshot_ref: persisted.reference };
  } catch (error) { return failure(error.code || "candidate-snapshot-capture-failed", error); }
}

module.exports = {
  STORE_PREFIX,
  REF_KIND,
  stableSerialize,
  persistCandidateRecord,
  recoverCandidateRecord,
  persistCandidateSnapshot,
  recoverCandidateSnapshot,
  captureCandidateSnapshot,
};
