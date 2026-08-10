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
  if (!contract) {
    throw new TypeError("contract object or changeRoot string is required");
  }

  const changeRoot = options.changeRoot || options.rootDir || (typeof contract === "string" ? contract : contract.changeRoot || contract.rootDir);
  const mode = options.mode || (contract && contract.mode) || (contract && contract.proposal_lite !== undefined ? "lite" : "standard");

  if (changeRoot && typeof changeRoot === "string") {
    return computeContractDigestFromArtifacts(changeRoot, { mode });
  }

  if (typeof contract !== "object") {
    throw new TypeError("contract object or changeRoot string is required");
  }

  // Reject external declared digests or trusting unvalidated path strings
  if (contract.external_digest || contract.digest) {
    throw new Error("External or declared digests are not trusted; contract digest must be derived from filesystem bytes");
  }

  function resolveArtifact(key, defaultPath, isRequired) {
    const val = contract[key];
    if (val === undefined || val === null) {
      if (isRequired) {
        throw new Error(`Required contract artifact missing: ${defaultPath}`);
      }
      return null;
    }

    let relPath = defaultPath;
    let bytes = null;

    if (typeof val === "object" && val !== null) {
      relPath = val.path || defaultPath;
      if (val.content !== undefined && val.content !== null) {
        bytes = Buffer.from(val.content, typeof val.content === "string" ? "utf8" : undefined);
      }
    } else if (typeof val === "string") {
      bytes = Buffer.from(val, "utf8");
    }

    if (!bytes) {
      if (isRequired) {
        throw new Error(`Required contract artifact missing or unreadable: ${relPath}`);
      }
      return null;
    }

    const cPath = canonicalPath(relPath);
    const sha = `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
    return { path: cPath, digest: sha };
  }

  const proposalKey = contract.proposal !== undefined ? "proposal" : (contract.proposal_lite !== undefined ? "proposal_lite" : "proposal");
  const defaultProposalPath = contract.proposal_lite !== undefined ? "proposal-lite.md" : "proposal.md";
  const proposalEntry = resolveArtifact(proposalKey, defaultProposalPath, true);

  const rawSpecs = Array.isArray(contract.specs) ? contract.specs : (contract.specs ? [contract.specs] : []);
  const specEntries = rawSpecs.map((specItem, idx) => {
    const defaultSpecPath = `specs/spec-${idx + 1}.md`;
    if (typeof specItem === "object" && specItem !== null) {
      const specRelPath = specItem.path || defaultSpecPath;
      if (specItem.content !== undefined && specItem.content !== null) {
        const bytes = Buffer.from(specItem.content, typeof specItem.content === "string" ? "utf8" : undefined);
        return { path: canonicalPath(specRelPath), digest: `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}` };
      }
    } else if (typeof specItem === "string") {
      const bytes = Buffer.from(specItem, "utf8");
      return { path: canonicalPath(defaultSpecPath), digest: `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}` };
    }
    throw new Error("Required contract spec artifact missing or unreadable");
  }).sort((a, b) => a.path.localeCompare(b.path));

  const designEntry = contract.design !== undefined ? resolveArtifact("design", "design.md", false) : null;
  const tasksEntry = contract.tasks !== undefined ? resolveArtifact("tasks", "tasks.md", false) : null;

  const artifacts = [proposalEntry, ...specEntries, designEntry, tasksEntry]
    .filter(Boolean)
    .sort((a, b) => a.path.localeCompare(b.path));

  return digest("verify-contract-v1", { artifacts });
}

function deriveCandidateDeltaPaths(beforeCandidate, afterCandidate, options = {}) {
  const beforeId = resolveCanonicalCandidateId(beforeCandidate);
  const afterId = resolveCanonicalCandidateId(afterCandidate);

  if (beforeId === afterId) {
    return [];
  }

  const rootDir = options.rootDir || options.cwd || null;
  if (rootDir && typeof rootDir === "string" && fsSync.existsSync(rootDir)) {
    const bTree = (beforeCandidate.candidate_tree || "").replace("sha256:", "");
    const aTree = (afterCandidate.candidate_tree || "").replace("sha256:", "");
    if (bTree && aTree) {
      try {
        const stdout = require("node:child_process").execFileSync(
          "git",
          ["diff-tree", "-r", "--name-only", bTree, aTree],
          { cwd: rootDir, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] }
        );
        const paths = stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map(canonicalPath);
        return Array.from(new Set(paths)).sort();
      } catch {
        // Fall back to candidate diff parsing or path comparison
      }
    }
  }

  const pathsSet = new Set();

  const diffText = options.diffText || options.diff || (afterCandidate && afterCandidate.diffText);
  if (diffText && typeof diffText === "string") {
    const matches = diffText.matchAll(/^diff --git a\/(.+?) b\/(.+?)$/gm);
    for (const match of matches) {
      pathsSet.add(canonicalPath(match[1]));
      pathsSet.add(canonicalPath(match[2]));
    }
  }

  if (pathsSet.size === 0) {
    const beforePaths = new Set((beforeCandidate.paths || []).map(canonicalPath));
    const afterPaths = new Set((afterCandidate.paths || []).map(canonicalPath));

    for (const p of afterPaths) {
      if (!beforePaths.has(p)) {
        pathsSet.add(p);
      }
    }
    for (const p of beforePaths) {
      if (!afterPaths.has(p)) {
        pathsSet.add(p);
      }
    }

    if (pathsSet.size === 0 && beforeCandidate.diff_hash !== afterCandidate.diff_hash) {
      for (const p of afterPaths) {
        pathsSet.add(p);
      }
    }
  }

  if (pathsSet.size === 0 && beforeId !== afterId) {
    throw new Error("Cannot reliably derive candidate delta paths between CandidateBefore and CandidateAfter");
  }

  return Array.from(pathsSet).sort();
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
  const contractDigest = computeContractDigest(input.contract || {}, meta);
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

  const currentContractDigest = computeContractDigest(input.contract || {}, input);
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

  const currentContractDigest = computeContractDigest(input.contract || {}, input);
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


