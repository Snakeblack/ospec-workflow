"use strict";

const crypto = require("node:crypto");

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

function computeContractDigest(contract) {
  if (!contract || typeof contract !== "object") {
    throw new TypeError("contract object is required");
  }
  return digest("verify-contract-v1", {
    proposal: contract.proposal || "",
    specs: contract.specs || [],
    design: contract.design || "",
    tasks: contract.tasks || "",
  });
}

function computeCandidateDigest(candidate) {
  if (!candidate || typeof candidate !== "object") {
    throw new TypeError("candidate object is required");
  }
  const paths = (candidate.paths || []).map(canonicalPath).sort();
  return digest("verify-candidate-v1", {
    paths,
    diff_hash: candidate.diff_hash || "",
  });
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
  const contractDigest = computeContractDigest(input.contract || {});
  const candidateDigest = computeCandidateDigest(input.candidate || {});

  const blockingFindings = (input.findings || [])
    .filter((f) => f && BLOCKING_SEVERITIES.has(f.severity))
    .map((f, idx) => ({
      id: f.id || `V${String(idx + 1).padStart(3, "0")}`,
      severity: f.severity,
      summary: f.summary || "Unspecified defect",
      origin: f.origin || "code-bug",
      allowed_paths: (f.allowed_paths || input.candidate?.paths || []).map(canonicalPath).sort(),
      validation: {
        commands: f.validation?.commands || (input.test_command ? [input.test_command] : ["npm test"]),
        expected_exit: f.validation?.expected_exit ?? 0,
        test_files: (f.validation?.test_files || []).map(canonicalPath).sort(),
      },
      status: "unresolved",
    }));

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

function recordRemediationAttempt(state, candidateInput) {
  assertVerifyLineage(state);
  if (state.status !== "remediation-pending") {
    throw new Error(`Cannot record remediation attempt on lineage with status '${state.status}' (expected 'remediation-pending')`);
  }
  const next = clone(state);
  const candidateDigest = computeCandidateDigest(candidateInput || {});
  next.current_candidate_id = candidateDigest;
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
  const currentContractDigest = computeContractDigest(input.contract || {});

  // 1. Contract Drift Guard: spec/design/tasks changed
  if (currentContractDigest !== next.contract_digest) {
    next.status = "superseded";
    next.terminal_reason = "contract-drift";
    return {
      lineage: next,
      action: "superseded",
      reason: "Contract changed during active lineage",
    };
  }

  const candidateDigest = computeCandidateDigest(input.candidate || {});
  next.current_candidate_id = candidateDigest;

  const recheckResults = input.recheck_results || {};
  const observedFindings = input.new_findings || [];
  const remediationPaths = new Set(
    (input.remediation_delta?.paths || input.candidate?.paths || []).map(canonicalPath)
  );

  let allFixed = true;

  // 2. Evaluate frozen findings against frozen validation recipes
  for (const finding of next.findings) {
    const isFixed = recheckResults[finding.id] === true || recheckResults[finding.id] === "PASS";
    if (isFixed) {
      finding.status = "resolved";
    } else {
      finding.status = "unresolved";
      allFixed = false;
    }
  }

  // 3. Classify new findings during recheck: causal regression vs late observation
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
        next.findings.push({
          id: newFinding.id || `V${String(next.findings.length + 1).padStart(3, "0")}`,
          severity: newFinding.severity,
          summary: newFinding.summary || "Causal regression from remediation",
          origin: newFinding.origin || "code-bug",
          allowed_paths: findingPaths,
          validation: {
            commands: newFinding.validation?.commands || (input.test_command ? [input.test_command] : ["npm test"]),
            expected_exit: newFinding.validation?.expected_exit ?? 0,
            test_files: (newFinding.validation?.test_files || []).map(canonicalPath).sort(),
          },
          status: "unresolved",
        });
      }
    } else {
      // Unrelated late observation -> advisory non-blocking
      next.late_observations.push({
        id: newFinding.id || `L${String(next.late_observations.length + 1).padStart(3, "0")}`,
        severity: newFinding.severity || "WARNING",
        summary: newFinding.summary || "Late observation outside remediation scope",
        blocking: false,
      });
    }
  }

  // 4. State Transition Logic
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

  // Failed recheck: transition back to remediation-pending if attempts remaining
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

  const currentContractDigest = computeContractDigest(input.contract || {});
  if (currentContractDigest !== state.contract_digest) {
    return { action: "supersede-and-discovery", reason: "contract-changed" };
  }

  switch (state.status) {
    case "closed": {
      const currentCandidateDigest = computeCandidateDigest(input.candidate || {});
      if (currentCandidateDigest === state.verified_candidate_id) {
        return { action: "return-cached-pass", reason: "lineage-closed-and-candidate-verified" };
      }
      return { action: "supersede-and-discovery", reason: "candidate-code-changed" };
    }
    case "remediation-pending":
      return { action: "apply-remediation", reason: "remediation-required-for-frozen-findings" };
    case "recheck-pending":
      return { action: "run-targeted-recheck", reason: "active-recheck-pending" };
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
  computeContractDigest,
  computeCandidateDigest,
  assertVerifyLineage,
  startVerifyLineage,
  recordRemediationAttempt,
  evaluateRecheck,
  getLineageNextAction,
};
