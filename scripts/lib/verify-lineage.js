"use strict";

const crypto = require("node:crypto");
const fsSync = require("node:fs");
const path = require("node:path");
const { validateCandidateV2, computeCandidateId } = require("./execution-identities/index.js");

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
    let bTree = (beforeCandidate.candidate_tree || "").replace("sha256:", "");
    let aTree = (afterCandidate.candidate_tree || "").replace("sha256:", "");
    if (bTree.length === 64 && /^0{24}[a-f0-9]{40}$/i.test(bTree)) bTree = bTree.slice(24);
    if (aTree.length === 64 && /^0{24}[a-f0-9]{40}$/i.test(aTree)) aTree = aTree.slice(24);
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

  const error = new Error("Cannot derive candidate delta paths: candidate_tree or rootDir is missing or unresolvable against Git repository (delta-unresolvable)");
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
    remediation_attempts: 0,
    max_remediation_attempts: MAX_REMEDIATION_ATTEMPTS,
    findings: blockingFindings,
    late_observations: [],
    terminal_reason: null,
  };
}

function prepareRemediation(state, currentCandidate) {
  assertVerifyLineage(state);
  if (state.status !== "remediation-pending") {
    throw new Error(`Cannot prepare remediation on lineage with status '${state.status}' (expected 'remediation-pending')`);
  }
  if (!currentCandidate) {
    throw new TypeError("currentCandidate baseline is required for prepareRemediation");
  }

  const currentCandidateDigest = resolveCanonicalCandidateId(currentCandidate);

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

function recordRemediationAttempt(state, candidateInput) {
  assertVerifyLineage(state);
  if (state.status !== "remediation-pending") {
    throw new Error(`Cannot record remediation attempt on lineage with status '${state.status}' (expected 'remediation-pending')`);
  }

  const preCandidate = candidateInput?.baseline_candidate || candidateInput?.preCandidate || candidateInput?.beforeCandidate || candidateInput?.baselineCandidate;
  if (!preCandidate) {
    throw new TypeError("baseline_candidate is required for recordRemediationAttempt");
  }

  const preCandidateDigest = resolveCanonicalCandidateId(preCandidate);
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

  const actualChangedPaths = deriveCandidateDeltaPaths(preCandidate, postCandidate, candidateInput);

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
      return { action: "run-targeted-recheck", reason: "active-recheck-pending" };
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
  prepareRemediation,
  recordRemediationAttempt,
  evaluateRecheck,
  getLineageNextAction,
};


