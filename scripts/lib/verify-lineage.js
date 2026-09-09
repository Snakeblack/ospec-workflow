"use strict";

const crypto = require("node:crypto");
const fsSync = require("node:fs");
const path = require("node:path");
const { validateCandidateV2, computeCandidateId } = require("./execution-identities/index.js");
const {
  persistCandidateRecord,
  recoverCandidateRecord,
  recoverCandidateSnapshot,
  captureCandidateSnapshot,
} = require("./verify-lineage-candidate-store.js");
const { validateCandidateRecoveryAudit, validateReconciliationSuccessorAudit, requiredApproval } = require("./verify-lineage-recovery.js");

const MAX_REMEDIATION_ATTEMPTS = 2;
const BLOCKING_SEVERITIES = new Set(["BLOCKER", "CRITICAL"]);

function stableSerialize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

function digest(domain, value) {
  return `sha256:${crypto.createHash("sha256").update(`${domain}\0${stableSerialize(value)}`).digest("hex")}`;
}

function canonicalPath(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) {
    throw new TypeError("candidate path must be a non-empty string");
  }
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  if (
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split("/").some((part) => part === ".." || part === "")
  ) {
    throw new TypeError(`candidate path escapes repository: ${value}`);
  }
  return normalized;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function resolveCanonicalCandidateId(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw new TypeError("Candidate/v2 object is required");
  }
  if (!validateCandidateV2(candidate)) {
    throw new Error("Candidate v2 object failed schema validation");
  }
  const computedId = computeCandidateId(candidate);
  if (candidate.candidate_id && candidate.candidate_id !== computedId) {
    throw new Error(`Candidate candidate_id mismatch: declared '${candidate.candidate_id}' vs computed '${computedId}'`);
  }
  return computedId;
}

function computeContractDigestFromArtifacts(changeRoot, options = {}) {
  if (typeof changeRoot !== "string" || changeRoot.trim().length === 0) {
    throw new TypeError("changeRoot must be a non-empty string");
  }
  const mode = options.mode || "standard";
  const absRoot = path.resolve(changeRoot);

  if (!fsSync.existsSync(absRoot)) {
    throw new Error(`changeRoot directory does not exist: ${changeRoot}`);
  }

  const artifacts = [];

  function addArtifact(relPath, required) {
    const full = path.resolve(absRoot, relPath);
    const cPath = canonicalPath(relPath);
    if (!fsSync.existsSync(full)) {
      if (required) {
        throw new Error(`Required contract artifact missing: ${relPath}`);
      }
      return;
    }
    let bytes;
    try {
      bytes = fsSync.readFileSync(full);
    } catch (err) {
      if (required) {
        throw new Error(`Required contract artifact unreadable: ${relPath}`);
      }
      return;
    }
    const sha = `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
    artifacts.push({ path: cPath, digest: sha });
  }

  if (mode === "lite") {
    addArtifact("proposal-lite.md", true);
    addArtifact("tasks.md", false);
  } else {
    addArtifact("proposal.md", true);

    const specsDir = path.join(absRoot, "specs");
    if (fsSync.existsSync(specsDir)) {
      const specFiles = [];
      function walkSpecs(dir) {
        const entries = fsSync.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const res = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walkSpecs(res);
          } else if (entry.isFile() && entry.name.endsWith(".md")) {
            const rel = path.relative(absRoot, res);
            specFiles.push(rel);
          }
        }
      }
      walkSpecs(specsDir);
      specFiles.sort();
      for (const sf of specFiles) {
        addArtifact(sf, true);
      }
    }

    addArtifact("design.md", false);
    addArtifact("tasks.md", false);
  }

  artifacts.sort((a, b) => a.path.localeCompare(b.path));
  return digest("verify-contract-v1", { artifacts });
}

function computeContractDigest(contract, options = {}) {
  const changeRoot =
    options.changeRoot ||
    options.rootDir ||
    (typeof contract === "string" ? contract : (contract && typeof contract === "object" ? contract.changeRoot || contract.rootDir : null));
  const mode = options.mode || (contract && typeof contract === "object" ? contract.mode : null) || "standard";

  if (!changeRoot || typeof changeRoot !== "string") {
    throw new TypeError("changeRoot is required; arbitrary inline contract objects are rejected");
  }

  return computeContractDigestFromArtifacts(changeRoot, { mode });
}

function deriveCandidateDeltaPaths(beforeCandidate, afterCandidate, options = {}) {
  const beforeId = resolveCanonicalCandidateId(beforeCandidate);
  const afterId = resolveCanonicalCandidateId(afterCandidate);

  if (beforeId === afterId) {
    return [];
  }

  const rootDir = options.rootDir || options.cwd || null;
  if (rootDir && typeof rootDir === "string" && fsSync.existsSync(rootDir)) {
    const gitTrees = options.git_trees || options.gitTrees || {};
    let bTree =
      options.before_git_tree ||
      options.beforeGitTree ||
      gitTrees[beforeId] ||
      beforeCandidate?.git_tree_oid ||
      beforeCandidate?.gitTreeOid ||
      null;

    let aTree =
      options.after_git_tree ||
      options.afterGitTree ||
      gitTrees[afterId] ||
      afterCandidate?.git_tree_oid ||
      afterCandidate?.gitTreeOid ||
      null;

    if (!bTree && beforeCandidate?.candidate_tree) {
      const rawB = (beforeCandidate.candidate_tree || "").replace("sha256:", "");
      try {
        bTree = require("node:child_process")
          .execFileSync("git", ["rev-parse", "--verify", `${rawB}^{tree}`], {
            cwd: rootDir,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "ignore"],
          })
          .trim();
      } catch {
        bTree = null;
      }
    }

    if (!aTree && afterCandidate?.candidate_tree) {
      const rawA = (afterCandidate.candidate_tree || "").replace("sha256:", "");
      try {
        aTree = require("node:child_process")
          .execFileSync("git", ["rev-parse", "--verify", `${rawA}^{tree}`], {
            cwd: rootDir,
            encoding: "utf8",
            stdio: ["pipe", "pipe", "ignore"],
          })
          .trim();
      } catch {
        aTree = null;
      }
    }

    if (bTree && aTree) {
      try {
        const stdout = require("node:child_process").execFileSync(
          "git",
          ["diff-tree", "-r", "--name-only", bTree, aTree],
          { cwd: rootDir, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }
        );
        const paths = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map(canonicalPath);
        return Array.from(new Set(paths)).sort();
      } catch (err) {
        const error = new Error(`Failed to derive candidate delta paths via Git diff-tree: delta-unresolvable (${err.message})`);
        error.code = "delta-unresolvable";
        throw error;
      }
    }
  }

  const error = new Error("Cannot derive candidate delta paths: git tree OIDs or rootDir are missing or unresolvable against Git repository (delta-unresolvable)");
  error.code = "delta-unresolvable";
  throw error;
}

function assertVerifyLineage(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    throw new TypeError("verify_lineage state must be a non-null object");
  }
  if (state.schema_version !== 1) {
    throw new TypeError("verify_lineage schema_version must be 1");
  }
  if (typeof state.lineage_id !== "string" || !state.lineage_id.startsWith("sha256:")) {
    throw new TypeError("verify_lineage lineage_id must be a sha256 string");
  }
  const validStatuses = ["remediation-pending", "recheck-pending", "closed", "exhausted", "superseded"];
  if (!validStatuses.includes(state.status)) {
    throw new TypeError(`verify_lineage status must be one of ${validStatuses.join(", ")}`);
  }
  if (state.max_remediation_attempts !== MAX_REMEDIATION_ATTEMPTS) {
    throw new TypeError(`verify_lineage max_remediation_attempts must equal immutable hard limit ${MAX_REMEDIATION_ATTEMPTS}`);
  }
}

function blockCandidateRecovery(state, reason_code, reason) {
  return {
    valid: false,
    action: "block-candidate-recovery",
    reason_code,
    reason: reason || reason_code,
    lineage: clone(state),
  };
}

function recoverLineageCandidate(state, options = {}) {
  const changeRoot = options.changeRoot;
  const reference = state.candidate_recovery?.current;
  if (!reference) {
    return blockCandidateRecovery(
      state,
      "legacy-candidate-recovery-unavailable",
      "Legacy ID-only lineage has no recoverable Candidate record"
    );
  }
  if (typeof changeRoot !== "string" || changeRoot.trim().length === 0) {
    return blockCandidateRecovery(state, "candidate-recovery-path-invalid", "changeRoot is required for Candidate recovery");
  }
  const recovered = recoverCandidateRecord(changeRoot, reference, state.current_candidate_id);
  if (!recovered.ok) return blockCandidateRecovery(state, recovered.reason_code, recovered.error);
  return { valid: true, candidate: recovered.candidate, reference: recovered.reference };
}

function startVerifyLineage(input, meta = {}) {
  if (!input || typeof input !== "object") {
    throw new TypeError("input is required to start verify lineage");
  }
  const changeRoot = input.changeRoot || meta.changeRoot;
  const mode = input.mode || meta.mode || "standard";
  if (!changeRoot || typeof changeRoot !== "string") {
    throw new TypeError("changeRoot is required for startVerifyLineage; arbitrary inline contract objects are rejected");
  }
  const contractDigest = computeContractDigestFromArtifacts(changeRoot, { mode });
  const candidateDigest = resolveCanonicalCandidateId(input.candidate);
  const persistedCandidate = persistCandidateRecord(changeRoot, input.candidate);
  if (!persistedCandidate.ok) {
    const error = new Error(`Unable to persist Candidate recovery record: ${persistedCandidate.reason_code}`);
    error.code = persistedCandidate.reason_code;
    throw error;
  }

  const blockingFindings = (input.findings || [])
    .filter((f) => f && BLOCKING_SEVERITIES.has(f.severity))
    .map((f, idx) => {
      const commands = f.validation?.commands;
      if (!Array.isArray(commands) || commands.length === 0 || commands.some((c) => typeof c !== "string" || c.trim().length === 0)) {
        throw new Error(`Finding ${f.id || idx + 1} lacks explicit reproducible validation recipe`);
      }
      return {
        id: f.id || `V${String(idx + 1).padStart(3, "0")}`,
        severity: f.severity,
        summary: f.summary || "Unspecified defect",
        origin: f.origin || "code-bug",
        allowed_paths: (f.allowed_paths || input.candidate?.paths || []).map(canonicalPath).sort(),
        validation: {
          commands: commands,
          expected_exit: f.validation?.expected_exit ?? 0,
          test_files: (f.validation?.test_files || []).map(canonicalPath).sort(),
        },
        status: "unresolved",
      };
    });

  if (blockingFindings.length === 0) {
    throw new Error("Cannot open remediation lineage without at least one BLOCKER/CRITICAL finding");
  }

  const lineageId = digest("verify-lineage-v1", {
    genesis_candidate_id: candidateDigest,
    contract_digest: contractDigest,
    findings_ids: blockingFindings.map((f) => f.id).sort(),
    generation: meta.generation || 1,
    predecessor_id: meta.predecessor_id || null,
  });

  return {
    schema_version: 1,
    lineage_id: lineageId,
    generation: meta.generation || 1,
    predecessor_id: meta.predecessor_id || null,
    status: "remediation-pending",
    genesis_candidate_id: candidateDigest,
    current_candidate_id: candidateDigest,
    verified_candidate_id: null,
    contract_digest: contractDigest,
    candidate_recovery: {
      schema_version: 1,
      genesis: clone(persistedCandidate.reference),
      current: clone(persistedCandidate.reference),
    },
    remediation_attempts: 0,
    max_remediation_attempts: MAX_REMEDIATION_ATTEMPTS,
    findings: blockingFindings,
    late_observations: [],
    terminal_reason: null,
  };
}

function prepareRemediation(state, options = {}) {
  assertVerifyLineage(state);
  if (state.status !== "remediation-pending") {
    throw new Error(`Cannot prepare remediation on lineage with status '${state.status}' (expected 'remediation-pending')`);
  }
  const recovered = recoverLineageCandidate(state, options);
  if (!recovered.valid) return recovered;

  const diagnosticCandidate = options.candidate;
  const currentCandidateDigest = diagnosticCandidate ? resolveCanonicalCandidateId(diagnosticCandidate) : recovered.candidate.candidate_id;

  if (currentCandidateDigest !== state.current_candidate_id) {
    const next = clone(state);
    next.status = "superseded";
    next.terminal_reason = "candidate-drift";
    return {
      valid: false,
      action: "supersede-and-discovery",
      reason: "Candidate drift detected before remediation attempt",
      reason_code: "candidate-drift",
      lineage: next,
    };
  }

  const unresolvedFindings = state.findings.filter((f) => f.status === "unresolved");
  const allowedPaths = Array.from(
    new Set(unresolvedFindings.flatMap((f) => f.allowed_paths.map(canonicalPath)))
  ).sort();

  return {
    valid: true,
    lineage: clone(state),
    findings: unresolvedFindings.map(clone),
    allowed_paths: allowedPaths,
  };
}

// The verifier's canonical entry point. A Candidate/v2 digest alone cannot be
// used later to reconstruct an execution tree, so a mutable lineage begins
// from an independently persisted, live-validated workspace snapshot.
function startVerifyLineageFromWorkspace(input, meta = {}) {
  if (!input || typeof input !== "object") throw new TypeError("input is required to capture a verify lineage Candidate");
  const changeRoot = input.changeRoot || meta.changeRoot;
  const rootDir = input.rootDir || meta.rootDir;
  if (!changeRoot || !rootDir) throw new TypeError("changeRoot and rootDir are required for canonical Candidate capture");
  const captured = captureCandidateSnapshot(changeRoot, {
    rootDir,
    repository_id: input.repository_id || input.repositoryId,
    projection: input.projection,
  });
  if (!captured.ok) {
    const error = new Error(`Unable to capture canonical Candidate snapshot: ${captured.reason_code}`);
    error.code = captured.reason_code;
    throw error;
  }
  const verified = recoverCandidateSnapshot(changeRoot, captured.snapshot_ref, captured.candidate.candidate_id, {
    rootDir,
    verifyLiveWorkspace: true,
  });
  if (!verified.ok) {
    const error = new Error(`Canonical Candidate snapshot failed live validation: ${verified.reason_code}`);
    error.code = verified.reason_code;
    throw error;
  }
  const lineage = startVerifyLineage({ ...input, changeRoot, candidate: verified.candidate }, meta);
  lineage.candidate_snapshot = clone(captured.snapshot_ref);
  return lineage;
}

function resolveRecoveryApprovals(approvals) {
  const newScope = requiredApproval(approvals, "new-scope");
  const architecture = requiredApproval(approvals, "architecture");
  if (!newScope || !architecture) throw new Error("audited recovery requires new-scope and architecture approvals");
  return [clone(newScope), clone(architecture)];
}

// This is intentionally an additive terminal transition. It never tries to
// derive A -> B; a valid audit only establishes that such derivation cannot be
// made from the available evidence.
function terminalizeIrrecoverableLineage(state, options = {}) {
  assertVerifyLineage(state);
  if (!["remediation-pending", "reconciliation-required"].includes(state.status)) {
    return { ok: false, reason_code: "terminalization-status-invalid", lineage: clone(state) };
  }
  try {
    const approvals = resolveRecoveryApprovals(options.approvals || state.approvals || []);
    const audit = validateCandidateRecoveryAudit(state, options.auditRef, { changeRoot: options.changeRoot });
    if (!audit.ok) return { ok: false, reason_code: audit.reason_code, lineage: clone(state) };
    const terminal = clone(state);
    terminal.status = "superseded";
    terminal.terminal_reason = "candidate-recovery-irrecoverable";
    terminal.candidate_recovery_audit = clone(options.auditRef);
    terminal.recovery_approvals = approvals;
    return { ok: true, action: "terminalized-candidate-recovery", lineage: terminal };
  } catch (error) { return { ok: false, reason_code: "candidate-recovery-approval-missing", error: error.message, lineage: clone(state) }; }
}

function startRecoverySuccessor(predecessor, options = {}) {
  assertVerifyLineage(predecessor);
  if (predecessor.status !== "superseded" || predecessor.terminal_reason !== "candidate-recovery-irrecoverable") {
    return { ok: false, reason_code: "recovery-predecessor-not-terminal", lineage: clone(predecessor) };
  }
  try {
    const approvals = resolveRecoveryApprovals(options.approvals || predecessor.recovery_approvals || []);
    const audit = validateCandidateRecoveryAudit(predecessor, predecessor.candidate_recovery_audit, { changeRoot: options.changeRoot });
    if (!audit.ok) return { ok: false, reason_code: audit.reason_code, lineage: clone(predecessor) };
    const recovered = recoverCandidateSnapshot(options.changeRoot, options.snapshotRef, options.candidateRef?.candidate_id || options.snapshotRef?.candidate_id, { rootDir: options.rootDir });
    if (!recovered.ok) return { ok: false, reason_code: recovered.reason_code, lineage: clone(predecessor) };
    if (options.candidateRef && stableSerialize(options.candidateRef) !== stableSerialize(recovered.snapshot.candidate_ref)) {
      return { ok: false, reason_code: "candidate-snapshot-reference-mismatch", lineage: clone(predecessor) };
    }
    const successor = clone(predecessor);
    const candidateId = resolveCanonicalCandidateId(recovered.candidate);
    const contractDigest = computeContractDigestFromArtifacts(options.changeRoot, { mode: options.mode || "standard" });
    successor.generation = predecessor.generation + 1;
    successor.predecessor_id = predecessor.lineage_id;
    successor.lineage_id = digest("verify-lineage-v1", {
      genesis_candidate_id: candidateId, contract_digest: contractDigest,
      findings_ids: successor.findings.map((finding) => finding.id).sort(), generation: successor.generation,
      predecessor_id: predecessor.lineage_id,
    });
    successor.status = "recheck-pending";
    successor.genesis_candidate_id = candidateId;
    successor.current_candidate_id = candidateId;
    successor.verified_candidate_id = null;
    successor.contract_digest = contractDigest;
    successor.candidate_recovery = { schema_version: 1, genesis: clone(recovered.snapshot.candidate_ref), current: clone(recovered.snapshot.candidate_ref) };
    successor.candidate_snapshot = clone(options.snapshotRef);
    successor.terminal_reason = null;
    successor.recovery_successor = { schema_version: 1, predecessor_contract_digest: predecessor.contract_digest, audit_ref: clone(predecessor.candidate_recovery_audit), approval_refs: approvals.map((entry) => entry.id) };
    return { ok: true, action: "start-recovery-successor-recheck", lineage: successor, predecessor: clone(predecessor) };
  } catch (error) { return { ok: false, reason_code: "recovery-successor-invalid", error: error.message, lineage: clone(predecessor) }; }
}

function reconciliationSuccessorApproval(approvals) {
  const validSources = new Set([
    "codex/plain-chat-numbered-gate",
    "codex/plain-chat",
    "request_user_input",
    "functions.request_user_input",
    "functions.request_user_input_async",
  ]);
  return (approvals || []).find((entry) =>
    entry?.gate === "successor-reconciliation" &&
    entry.decision === "authorize-audited-successor-for-unreconciled-directed-operations" &&
    validSources.has(entry.source) &&
    Array.isArray(entry.applies_to) && entry.applies_to.includes("sdd-apply")
  ) || null;
}

// This successor is deliberately separate from Candidate-irrecoverable recovery:
// it preserves an intact predecessor and only replaces the active pointer after
// every inconclusive predecessor operation has immutable disposition evidence.
function startReconciliationSuccessor(predecessor, options = {}) {
  assertVerifyLineage(predecessor);
  try {
    if (!['remediation-pending', 'recheck-pending'].includes(predecessor.status)) {
      return { ok: false, reason_code: 'reconciliation-predecessor-status-invalid', lineage: clone(predecessor) };
    }
    const approval = reconciliationSuccessorApproval(options.approvals || []);
    if (!approval) return { ok: false, reason_code: 'reconciliation-successor-approval-missing', lineage: clone(predecessor) };
    const audited = validateReconciliationSuccessorAudit(predecessor, options.auditRef, { changeRoot: options.changeRoot });
    if (!audited.ok) return { ok: false, reason_code: audited.reason_code, lineage: clone(predecessor) };
    if (!audited.audit.approval_ids.includes(approval.id)) return { ok: false, reason_code: 'reconciliation-successor-audit-approval-mismatch', lineage: clone(predecessor) };
    const recovered = recoverCandidateSnapshot(options.changeRoot, options.snapshotRef, options.candidateRef?.candidate_id || options.snapshotRef?.candidate_id, { rootDir: options.rootDir });
    if (!recovered.ok) return { ok: false, reason_code: recovered.reason_code, lineage: clone(predecessor) };
    if (options.candidateRef && stableSerialize(options.candidateRef) !== stableSerialize(recovered.snapshot.candidate_ref)) {
      return { ok: false, reason_code: 'candidate-snapshot-reference-mismatch', lineage: clone(predecessor) };
    }
    const candidateId = resolveCanonicalCandidateId(recovered.candidate);
    if (candidateId === predecessor.current_candidate_id) return { ok: false, reason_code: 'reconciliation-successor-candidate-not-fresh', lineage: clone(predecessor) };
    const contractDigest = computeContractDigestFromArtifacts(options.changeRoot, { mode: options.mode || 'standard' });
    const successor = clone(predecessor);
    successor.generation = predecessor.generation + 1;
    successor.predecessor_id = predecessor.lineage_id;
    successor.lineage_id = digest('verify-lineage-reconciliation-successor-v1', {
      predecessor_id: predecessor.lineage_id, generation: successor.generation,
      genesis_candidate_id: candidateId, contract_digest: contractDigest,
      audit_digest: options.auditRef.content_digest,
    });
    successor.status = 'recheck-pending';
    successor.genesis_candidate_id = candidateId;
    successor.current_candidate_id = candidateId;
    successor.verified_candidate_id = null;
    successor.contract_digest = contractDigest;
    successor.candidate_recovery = { schema_version: 1, genesis: clone(recovered.snapshot.candidate_ref), current: clone(recovered.snapshot.candidate_ref) };
    successor.candidate_snapshot = clone(options.snapshotRef);
    successor.terminal_reason = null;
    successor.recovery_successor = {
      schema_version: 1, kind: 'reconciliation-successor/v1', predecessor_contract_digest: predecessor.contract_digest,
      audit_ref: clone(options.auditRef), approval_refs: [approval.id], predecessor_journal: audited.audit.recipes.map((recipe) => ({
        operation_reference: clone(recipe.operation_reference), disposition_reference: clone(recipe.disposition_reference),
      })),
    };
    return { ok: true, action: 'start-reconciliation-successor-recheck', lineage: successor, predecessor: clone(predecessor) };
  } catch (error) { return { ok: false, reason_code: 'reconciliation-successor-invalid', error: error.message, lineage: clone(predecessor) }; }
}

function persistReconciliationSuccessorState(statePath, predecessor, successor) {
  if (typeof statePath !== 'string' || !statePath.trim()) throw new TypeError('statePath is required');
  if (successor?.predecessor_id !== predecessor?.lineage_id || successor?.generation !== predecessor?.generation + 1) {
    throw new Error('reconciliation successor does not bind the supplied predecessor');
  }
  const original = fsSync.readFileSync(statePath, 'utf8');
  const match = /^verify_lineage: (.+)$/m.exec(original);
  if (!match) throw new Error('state.yaml has no active verify_lineage');
  if (stableSerialize(JSON.parse(match[1])) !== stableSerialize(predecessor)) throw new Error('state.yaml active verify_lineage changed before successor installation');
  const historyMatch = /^verify_lineage_history: (.+)$/m.exec(original);
  const history = historyMatch ? JSON.parse(historyMatch[1]) : [];
  if (!Array.isArray(history)) throw new Error('state.yaml verify_lineage_history is invalid');
  const nextHistory = [...history, clone(predecessor)];
  const replacement = `verify_lineage: ${JSON.stringify(successor)}\nverify_lineage_history: ${JSON.stringify(nextHistory)}`;
  let next = original.replace(match[0], replacement);
  if (historyMatch) next = next.replace(historyMatch[0], '');
  const absolute = path.resolve(statePath);
  const temporary = `${absolute}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fsSync.writeFileSync(temporary, next, 'utf8');
  fsSync.renameSync(temporary, absolute);
  return { active: clone(successor), history_count: nextHistory.length };
}

function persistRecheckResultState(statePath, predecessor, result) {
  if (typeof statePath !== "string" || !statePath.trim()) throw new TypeError("statePath is required");
  assertVerifyLineage(predecessor);
  assertVerifyLineage(result);
  if (predecessor.status !== "recheck-pending") throw new Error("only an active recheck may persist a result");
  if (
    result.lineage_id !== predecessor.lineage_id ||
    result.generation !== predecessor.generation ||
    result.predecessor_id !== predecessor.predecessor_id ||
    result.current_candidate_id !== predecessor.current_candidate_id ||
    result.genesis_candidate_id !== predecessor.genesis_candidate_id ||
    result.contract_digest !== predecessor.contract_digest ||
    stableSerialize(result.candidate_snapshot || null) !== stableSerialize(predecessor.candidate_snapshot || null)
  ) {
    throw new Error("recheck result does not bind the active lineage identity");
  }
  if (result.status === "closed" && result.verified_candidate_id !== predecessor.current_candidate_id) {
    throw new Error("closed recheck result must verify the active Candidate");
  }
  const original = fsSync.readFileSync(statePath, "utf8");
  const match = /^verify_lineage: (.+)$/m.exec(original);
  if (!match) throw new Error("state.yaml has no active verify_lineage");
  if (stableSerialize(JSON.parse(match[1])) !== stableSerialize(predecessor)) {
    throw new Error("state.yaml active verify_lineage changed before recheck result installation");
  }
  const next = original.replace(match[0], `verify_lineage: ${JSON.stringify(result)}`);
  const absolute = path.resolve(statePath);
  const temporary = `${absolute}.${process.pid}.${crypto.randomUUID()}.tmp`;
  let descriptor;
  try {
    descriptor = fsSync.openSync(temporary, "wx", 0o600);
    fsSync.writeFileSync(descriptor, next, "utf8");
    fsSync.fsyncSync(descriptor);
    fsSync.closeSync(descriptor);
    descriptor = undefined;
    fsSync.renameSync(temporary, absolute);
  } finally {
    if (descriptor !== undefined) fsSync.closeSync(descriptor);
    try { fsSync.unlinkSync(temporary); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  return { active: clone(result) };
}

function recordRemediationAttempt(state, candidateInput, options = {}) {
  assertVerifyLineage(state);
  if (state.status !== "remediation-pending") {
    throw new Error(`Cannot record remediation attempt on lineage with status '${state.status}' (expected 'remediation-pending')`);
  }

  const changeRoot = candidateInput?.changeRoot || options.changeRoot;
  const recovered = recoverLineageCandidate(state, { changeRoot });
  if (!recovered.valid) return recovered;
  const preCandidate = recovered.candidate;
  const diagnosticBaseline = candidateInput?.baseline_candidate || candidateInput?.preCandidate || candidateInput?.beforeCandidate || candidateInput?.baselineCandidate;
  const preCandidateDigest = diagnosticBaseline ? resolveCanonicalCandidateId(diagnosticBaseline) : preCandidate.candidate_id;
  if (preCandidateDigest !== state.current_candidate_id) {
    const next = clone(state);
    next.status = "superseded";
    next.terminal_reason = "candidate-drift";
    return {
      lineage: next,
      action: "supersede-and-discovery",
      reason: "Candidate drift detected before remediation attempt",
      reason_code: "candidate-drift",
    };
  }

  const postCandidate = candidateInput?.candidate || (candidateInput !== preCandidate ? candidateInput : null);
  if (!postCandidate) {
    throw new TypeError("successor candidate is required for recordRemediationAttempt");
  }
  const postCandidateDigest = resolveCanonicalCandidateId(postCandidate);

  const deltaOptions = Object.assign({}, typeof candidateInput === "object" ? candidateInput : {}, options);
  const postSnapshotRef = candidateInput?.candidate_snapshot || candidateInput?.candidateSnapshot || candidateInput?.snapshotRef || null;
  let postSnapshot = null;
  if (state.candidate_snapshot || postSnapshotRef) {
    if (!state.candidate_snapshot || !postSnapshotRef) {
      return blockCandidateRecovery(state, "candidate-snapshot-required", "Snapshot-backed remediation requires both baseline and successor Candidate snapshots");
    }
    const rootDir = deltaOptions.rootDir || deltaOptions.cwd;
    const baselineSnapshot = recoverCandidateSnapshot(changeRoot, state.candidate_snapshot, preCandidate.candidate_id, { rootDir });
    if (!baselineSnapshot.ok) return blockCandidateRecovery(state, baselineSnapshot.reason_code, baselineSnapshot.error);
    postSnapshot = recoverCandidateSnapshot(changeRoot, postSnapshotRef, postCandidateDigest, { rootDir });
    if (!postSnapshot.ok) return blockCandidateRecovery(state, postSnapshot.reason_code, postSnapshot.error);
    if (
      baselineSnapshot.snapshot.material?.type !== "git-tree-snapshot/v1" ||
      postSnapshot.snapshot.material?.type !== "git-tree-snapshot/v1"
    ) {
      return blockCandidateRecovery(state, "candidate-snapshot-delta-unresolvable", "Snapshot-backed remediation requires Git tree material for mechanical scope derivation");
    }
    deltaOptions.before_git_tree = baselineSnapshot.snapshot.material.candidate.oid;
    deltaOptions.after_git_tree = postSnapshot.snapshot.material.candidate.oid;
  }
  const actualChangedPaths = deriveCandidateDeltaPaths(preCandidate, postCandidate, deltaOptions);

  const allowedPathsUnion = new Set(
    state.findings
      .filter((f) => f.status === "unresolved")
      .flatMap((f) => f.allowed_paths.map(canonicalPath))
  );

  const unauthorizedPaths = actualChangedPaths.filter((p) => !allowedPathsUnion.has(p));
  if (unauthorizedPaths.length > 0) {
    return {
      lineage: clone(state),
      action: "reject-remediation-scope",
      reason: `Remediation modified paths outside allowed scope: ${unauthorizedPaths.join(", ")}`,
      reason_code: "remediation-scope-violation",
      unauthorized_paths: unauthorizedPaths,
    };
  }

  const next = clone(state);
  next.current_candidate_id = postCandidateDigest;
  const persistedSuccessor = postSnapshot
    ? { ok: true, reference: postSnapshot.snapshot.candidate_ref }
    : persistCandidateRecord(changeRoot, postCandidate);
  if (!persistedSuccessor.ok) {
    return blockCandidateRecovery(state, persistedSuccessor.reason_code, persistedSuccessor.error);
  }
  next.candidate_recovery = {
    schema_version: 1,
    genesis: clone(state.candidate_recovery.genesis),
    current: clone(persistedSuccessor.reference),
  };
  if (postSnapshotRef) next.candidate_snapshot = clone(postSnapshotRef);
  next.remediation_attempts += 1;

  if (next.remediation_attempts > MAX_REMEDIATION_ATTEMPTS) {
    next.status = "exhausted";
    next.terminal_reason = "max-attempts-exceeded";
    return {
      lineage: next,
      action: "exhaust",
      reason: `Exhausted ${MAX_REMEDIATION_ATTEMPTS} remediation attempts`,
    };
  }

  next.status = "recheck-pending";
  return {
    lineage: next,
    action: "run-targeted-recheck",
    reason: `Remediation attempt ${next.remediation_attempts} applied; ready for targeted recheck`,
  };
}

function evaluateRecheck(state, input) {
  assertVerifyLineage(state);
  if (!input || typeof input !== "object") {
    throw new TypeError("input is required for evaluateRecheck");
  }

  const changeRoot = input.changeRoot;
  const mode = input.mode || "standard";
  if (!changeRoot || typeof changeRoot !== "string") {
    throw new TypeError("changeRoot is required for evaluateRecheck; arbitrary inline contract objects are rejected");
  }

  if (state.status !== "recheck-pending") {
    throw new Error(`Cannot evaluate recheck on lineage with status '${state.status}' (expected 'recheck-pending')`);
  }
  if (state.recovery_successor && input.durable_recheck !== true) {
    throw new Error("recovery successor rechecks require durable journal coverage");
  }

  const next = clone(state);

  const candidateDigest = resolveCanonicalCandidateId(input.candidate);
  if (candidateDigest !== next.current_candidate_id) {
    next.status = "superseded";
    next.terminal_reason = "candidate-drift";
    return {
      lineage: next,
      action: "superseded",
      reason: "Candidate changed before targeted recheck",
      reason_code: "candidate-drift",
    };
  }

  const currentContractDigest = computeContractDigestFromArtifacts(changeRoot, { mode });
  if (currentContractDigest !== next.contract_digest) {
    next.status = "superseded";
    next.terminal_reason = "contract-drift";
    return {
      lineage: next,
      action: "superseded",
      reason: "Contract changed during active lineage",
    };
  }

  const recheckResults = input.recheck_results || {};
  const observedFindings = input.new_findings || [];
  const remediationPaths = new Set(
    (input.remediation_delta?.paths || input.candidate?.paths || []).map(canonicalPath)
  );

  let allFixed = true;

  for (const finding of next.findings) {
    const isFixed = recheckResults[finding.id] === true || recheckResults[finding.id] === "PASS";
    if (isFixed) {
      finding.status = "resolved";
    } else {
      finding.status = "unresolved";
      allFixed = false;
    }
  }

  for (const newFinding of observedFindings) {
    const findingPaths = (newFinding.paths || []).map(canonicalPath);
    const isCausalRegression = findingPaths.some((p) => remediationPaths.has(p));

    if (isCausalRegression && BLOCKING_SEVERITIES.has(newFinding.severity)) {
      allFixed = false;
      const existing = next.findings.find((f) => f.id === newFinding.id);
      if (existing) {
        existing.status = "unresolved";
        existing.summary = newFinding.summary || existing.summary;
      } else {
        const commands = newFinding.validation?.commands;
        if (!Array.isArray(commands) || commands.length === 0) {
          throw new Error(`Causal regression finding ${newFinding.id} lacks explicit validation recipe`);
        }
        next.findings.push({
          id: newFinding.id || `V${String(next.findings.length + 1).padStart(3, "0")}`,
          severity: newFinding.severity,
          summary: newFinding.summary || "Causal regression from remediation",
          origin: newFinding.origin || "code-bug",
          allowed_paths: findingPaths,
          validation: {
            commands: commands,
            expected_exit: newFinding.validation?.expected_exit ?? 0,
            test_files: (newFinding.validation?.test_files || []).map(canonicalPath).sort(),
          },
          status: "unresolved",
        });
      }
    } else {
      next.late_observations.push({
        id: newFinding.id || `L${String(next.late_observations.length + 1).padStart(3, "0")}`,
        severity: newFinding.severity || "WARNING",
        summary: newFinding.summary || "Late observation outside remediation scope",
        blocking: false,
      });
    }
  }

  if (allFixed) {
    next.status = "closed";
    next.verified_candidate_id = candidateDigest;
    next.terminal_reason = "all-findings-verified";
    return {
      lineage: next,
      action: "close",
      reason: "All frozen findings verified fixed",
    };
  }

  if (next.remediation_attempts >= MAX_REMEDIATION_ATTEMPTS) {
    next.status = "exhausted";
    next.terminal_reason = "max-attempts-exceeded";
    return {
      lineage: next,
      action: "exhaust",
      reason: `Exhausted ${MAX_REMEDIATION_ATTEMPTS} remediation attempts`,
    };
  }

  next.status = "remediation-pending";
  return {
    lineage: next,
    action: "remediate-again",
    reason: `Remediation attempt ${next.remediation_attempts} of ${MAX_REMEDIATION_ATTEMPTS} failed`,
  };
}

function getLineageNextAction(state, input = {}) {
  if (!state) {
    return { action: "run-discovery", reason: "no-active-lineage" };
  }
  assertVerifyLineage(state);

  const changeRoot = input.changeRoot;
  const mode = input.mode || "standard";
  if (!changeRoot || typeof changeRoot !== "string") {
    throw new TypeError("changeRoot is required for getLineageNextAction; arbitrary inline contract objects are rejected");
  }
  const currentContractDigest = computeContractDigestFromArtifacts(changeRoot, { mode });
  if (currentContractDigest !== state.contract_digest) {
    return { action: "supersede-and-discovery", reason: "contract-changed" };
  }

  const currentCandidateDigest = resolveCanonicalCandidateId(input.candidate);

  switch (state.status) {
    case "closed": {
      if (currentCandidateDigest === state.verified_candidate_id) {
        return { action: "return-cached-pass", reason: "lineage-closed-and-candidate-verified" };
      }
      return { action: "supersede-and-discovery", reason: "candidate-code-changed" };
    }
    case "remediation-pending": {
      if (currentCandidateDigest !== state.current_candidate_id) {
        return { action: "supersede-and-discovery", reason: "candidate-code-changed" };
      }
      return { action: "apply-remediation", reason: "remediation-required-for-frozen-findings" };
    }
    case "recheck-pending": {
      if (currentCandidateDigest !== state.current_candidate_id) {
        return { action: "supersede-and-discovery", reason: "candidate-code-changed" };
      }
      return state.recovery_successor
        ? { action: "run-recovery-successor-recheck", reason: "snapshot-bound-directed-recheck" }
        : { action: "run-targeted-recheck", reason: "active-recheck-pending" };
    }
    case "exhausted":
      return { action: "require-user-intervention", reason: "remediation-attempts-exhausted" };
    case "superseded":
      return { action: "run-discovery", reason: "lineage-superseded" };
    default:
      return { action: "run-discovery", reason: "unknown-status" };
  }
}

module.exports = {
  MAX_REMEDIATION_ATTEMPTS,
  stableSerialize,
  digest,
  canonicalPath,
  resolveCanonicalCandidateId,
  computeContractDigestFromArtifacts,
  computeContractDigest,
  deriveCandidateDeltaPaths,
  assertVerifyLineage,
  startVerifyLineage,
  startVerifyLineageFromWorkspace,
  prepareRemediation,
  terminalizeIrrecoverableLineage,
  startRecoverySuccessor,
  startReconciliationSuccessor,
  persistReconciliationSuccessorState,
  persistRecheckResultState,
  recordRemediationAttempt,
  evaluateRecheck,
  getLineageNextAction,
};


