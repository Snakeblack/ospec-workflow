"use strict";

const crypto = require("node:crypto");

const DIMENSIONS = Object.freeze(["risk", "reliability", "resilience", "readability"]);
const TERMINAL = new Set(["approved", "exhausted", "escalated", "invalidated"]);
const BLOCKING = new Set(["BLOCKER", "CRITICAL"]);
const OUTCOMES = new Set(["resolved", "unresolved"]);
const MAX_FAILED_ATTEMPTS = 3;
const MAX_BUDGET_LINES = 200;

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
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) throw new TypeError("candidate path must be a non-empty string");
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || normalized.split("/").some((part) => part === ".." || part === "")) {
    throw new TypeError(`candidate path escapes repository: ${value}`);
  }
  return normalized;
}

function canonicalStringList(values, label, allowed) {
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) throw new TypeError(`${label} must be a string array`);
  const unique = [...new Set(values)];
  if (unique.length !== values.length) throw new TypeError(`${label} must not contain duplicates`);
  if (allowed && unique.some((value) => !allowed.includes(value))) throw new TypeError(`${label} contains an unknown value`);
  return allowed ? allowed.filter((value) => unique.includes(value)) : unique.sort();
}

function assertCount(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${label} must be a non-negative safe integer`);
}

function normalizeCandidate(candidate) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) throw new TypeError("candidate is required");
  const requiredStrings = ["projection", "base_tree", "candidate_tree", "diff_hash", "paths_digest"];
  for (const key of requiredStrings) if (typeof candidate[key] !== "string" || candidate[key].length === 0) throw new TypeError(`candidate.${key} is required`);
  assertCount(candidate.original_changed_lines, "original_changed_lines");
  assertCount(candidate.authored_lines, "authored_lines");
  const paths = canonicalStringList(candidate.paths, "candidate paths").map(canonicalPath).sort();
  if (paths.length === 0) throw new TypeError("candidate paths are required");
  if (new Set(paths).size !== paths.length) throw new TypeError("candidate paths must be unique after canonicalization");
  return {
    projection: candidate.projection,
    base_tree: candidate.base_tree,
    candidate_tree: candidate.candidate_tree,
    paths,
    diff_hash: candidate.diff_hash,
    paths_digest: candidate.paths_digest,
    authored_lines: candidate.authored_lines,
    original_changed_lines: candidate.original_changed_lines,
  };
}

function normalizeGenesis(input, meta = {}) {
  if (!input || typeof input !== "object") throw new TypeError("lineage genesis is required");
  if (!["normal", "high-risk"].includes(input.classification)) throw new TypeError("classification must be normal or high-risk");
  if (typeof input.evidence_fingerprint !== "string" || input.evidence_fingerprint.length === 0) throw new TypeError("evidence_fingerprint is required");
  const candidate = normalizeCandidate(input.candidate);
  const selectedDimensions = canonicalStringList(input.selected_dimensions, "selected_dimensions", DIMENSIONS);
  const generation = meta.generation || 1;
  assertCount(generation, "generation");
  if (generation < 1) throw new TypeError("generation must be positive");
  const candidateId = digest("review-candidate-v1", candidate);
  const genesis = {
    candidate,
    candidate_id: candidateId,
    paths: candidate.paths,
    classification: input.classification,
    selected_dimensions: selectedDimensions,
    evidence_fingerprint: input.evidence_fingerprint,
    original_changed_lines: candidate.original_changed_lines,
    authored_lines: candidate.authored_lines,
  };
  const lineageId = digest("review-lineage-v1", {
    candidate_id: candidateId,
    classification: genesis.classification,
    selected_dimensions: selectedDimensions,
    evidence_fingerprint: genesis.evidence_fingerprint,
    generation,
    predecessor_lineage_id: meta.predecessor_lineage_id || null,
  });
  return { genesis, generation, lineageId };
}

function startReviewLineage(input, existing, meta = {}) {
  const normalized = normalizeGenesis(input, meta);
  if (existing !== undefined) {
    assertLineage(existing);
    if (existing.lineage_id !== normalized.lineageId) throw new Error("ordinary start cannot replace an existing lineage; create an explicit successor");
    return clone(existing);
  }
  const lenses = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, {
    selected: normalized.genesis.selected_dimensions.includes(dimension),
    status: normalized.genesis.selected_dimensions.includes(dimension) ? "pending" : "skipped",
    request_id: null,
    result_digest: null,
    result: null,
    operation: null,
  }]));
  return {
    schema_version: 1,
    lineage_id: normalized.lineageId,
    generation: normalized.generation,
    predecessor_lineage_id: meta.predecessor_lineage_id || null,
    recovery: meta.recovery ? clone(meta.recovery) : null,
    revision: 0,
    status: "reviewing",
    genesis: normalized.genesis,
    current_candidate_id: normalized.genesis.candidate_id,
    current_candidate: clone(normalized.genesis.candidate),
    lenses,
    findings: [],
    findings_digest: null,
    correction_budget: {
      limit_lines: Math.min(MAX_BUDGET_LINES, Math.ceil(normalized.genesis.original_changed_lines / 2)),
      used_lines: 0,
      failed_attempts: 0,
      max_failed_attempts: MAX_FAILED_ATTEMPTS,
    },
    correction_history: [],
    validation_history: [],
    follow_ups: [],
    pending_operation: null,
    pending_correction: null,
    terminal_reason: null,
  };
}

function beginLens(state, input) {
  const dimension = input.dimension;
  assertLineage(state);
  if (!DIMENSIONS.includes(dimension) || !state.genesis.selected_dimensions.includes(dimension)) throw new Error("lens dimension is not selected in genesis");
  assertExpectedRevision(state, input && input.expected_revision);
  assertRequestId(input && input.request_id);
  const currentLens = state.lenses[dimension];
  if (currentLens.status === "running" && currentLens.request_id === input.request_id && currentLens.operation && currentLens.operation.request_digest === digest("review-operation-v1", { operation: "lens-start", payload: { dimension } })) return clone(state);
  const next = prepareMutation(state, input, "lens-start", ["reviewing"]);
  const lens = next.lenses[dimension];
  if (lens.status !== "pending") throw new Error("selected lens may execute only once");
  lens.status = "running";
  lens.request_id = input.request_id;
  lens.operation = operationRecord(input, "lens-start", { dimension }, { status: "reviewing", lens_status: "pending", dimension });
  return commit(next);
}

function recordLensResult(state, input) {
  assertLineage(state);
  assertExpectedRevision(state, input.expected_revision);
  assertRequestId(input.request_id);
  if (state.status !== "reviewing") throw new Error(`lens result is not allowed in status ${state.status}`);
  const dimension = input.dimension;
  if (!DIMENSIONS.includes(dimension) || !state.genesis.selected_dimensions.includes(dimension)) throw new Error("lens dimension is not selected in genesis");
  const normalized = normalizeLensResult(input.result);
  const resultDigest = digest("review-lens-result-v1", normalized);
  const lens = state.lenses[dimension];
  if (lens.status === "completed") {
    if (lens.result_digest === resultDigest && lens.result_request_id === input.request_id) return clone(state);
    throw new Error("completed lens result is immutable");
  }
  if (lens.status !== "running") throw new Error("lens must be running before its result is recorded");
  const next = clone(state);
  next.lenses[dimension] = { ...next.lenses[dimension], status: "completed", result: normalized, result_digest: resultDigest, result_request_id: input.request_id, operation: null };
  return commit(next);
}

function normalizeLensResult(result) {
  if (!result || typeof result !== "object" || !Array.isArray(result.findings)) throw new TypeError("lens result findings are required");
  return { findings: result.findings.map((finding) => normalizeFinding(finding)) };
}

function normalizeFinding(finding) {
  if (!finding || typeof finding !== "object") throw new TypeError("finding must be an object");
  if (!["BLOCKER", "CRITICAL", "WARNING", "SUGGESTION"].includes(finding.severity)) throw new TypeError("finding severity is invalid");
  for (const field of ["summary", "acceptance_criteria"]) {
    if (typeof finding[field] !== "string" || finding[field].trim().length === 0 || finding[field].length > 1000) throw new TypeError(`finding ${field} is invalid`);
  }
  return { severity: finding.severity, summary: finding.summary.trim(), acceptance_criteria: finding.acceptance_criteria.trim() };
}

function freezeFindings(state, input) {
  const next = prepareMutation(state, input, "freeze-findings", ["reviewing"]);
  const selected = next.genesis.selected_dimensions;
  if (selected.some((dimension) => next.lenses[dimension].status !== "completed")) throw new Error("all selected lenses must complete before findings freeze");
  const seen = new Set();
  const findings = [];
  for (const owner of selected) {
    for (const raw of next.lenses[owner].result.findings) {
      const contentDigest = digest("review-finding-content-v1", raw);
      const duplicateKey = `${owner}:${contentDigest}`;
      if (seen.has(duplicateKey)) throw new Error("duplicate finding content is not allowed");
      seen.add(duplicateKey);
      const idHash = digest("review-finding-id-v1", { lineage_id: next.lineage_id, owner, finding: raw }).slice("sha256:".length, "sha256:".length + 16);
      const id = `F-${idHash}`;
      if (findings.some((finding) => finding.id === id)) throw new Error("finding ID collision");
      findings.push({ id, owner, ...raw, blocking: BLOCKING.has(raw.severity), resolution: BLOCKING.has(raw.severity) ? "unresolved" : "advisory" });
    }
  }
  next.findings = findings;
  next.findings_digest = digest("review-findings-v1", findings);
  next.status = findings.some((finding) => finding.blocking) ? "correction-required" : "approved";
  next.terminal_reason = next.status === "approved" ? "no-unresolved-blocking-findings" : null;
  return commit(next);
}

function beginCorrection(state, input) {
  assertLineage(state);
  assertExpectedRevision(state, input && input.expected_revision);
  assertRequestId(input && input.request_id);
  if (state.status === "correcting" && state.pending_correction && state.pending_correction.request_id === input.request_id) {
    const retry = {
      attempt: state.pending_correction.attempt,
      request_id: input.request_id,
      finding_ids: canonicalStringList(input.finding_ids, "finding_ids"),
      paths: canonicalStringList(input.paths, "correction paths").map(canonicalPath).sort(),
      base_candidate_id: input.base_candidate_id,
      forecast_lines: input.forecast_lines,
    };
    if (stableSerialize(retry) === stableSerialize(state.pending_correction)) return clone(state);
    throw new Error("divergent correction retry is not allowed");
  }
  const next = prepareMutation(state, input, "correction-start", ["correction-required"]);
  if (next.correction_budget.failed_attempts >= MAX_FAILED_ATTEMPTS) throw new Error("lineage correction attempts are exhausted");
  if (input.base_candidate_id !== next.current_candidate_id) throw new Error("correction base candidate mismatch");
  assertCount(input.forecast_lines, "forecast_lines");
  const ids = canonicalStringList(input.finding_ids, "finding_ids");
  if (ids.length === 0) throw new Error("at least one unresolved finding is required");
  const unresolved = new Set(next.findings.filter((finding) => finding.blocking && finding.resolution === "unresolved").map((finding) => finding.id));
  if (ids.some((id) => !unresolved.has(id))) throw new Error("correction references an unknown or resolved finding");
  const paths = canonicalStringList(input.paths, "correction paths").map(canonicalPath).sort();
  if (paths.length === 0 || paths.some((path) => !next.genesis.paths.includes(path))) throw new Error("correction path escapes frozen genesis paths");
  const remaining = next.correction_budget.limit_lines - next.correction_budget.used_lines;
  if (input.forecast_lines > remaining) throw new Error("correction forecast exceeds fixed budget");
  next.pending_correction = {
    attempt: next.correction_history.length + 1,
    request_id: input.request_id,
    finding_ids: ids,
    paths,
    base_candidate_id: input.base_candidate_id,
    forecast_lines: input.forecast_lines,
  };
  next.status = "correcting";
  next.pending_operation = operationRecord(input, "correction-start", next.pending_correction, { status: "correction-required" });
  return commit(next);
}

function recordCorrection(state, input) {
  assertLineage(state);
  assertExpectedRevision(state, input && input.expected_revision);
  assertRequestId(input && input.request_id);
  if (state.status === "validating") {
    const previous = state.correction_history.at(-1);
    if (previous && previous.record_request_id === input.request_id) {
      const retryCandidate = normalizeCandidate(input.corrected_candidate);
      const retry = {
        base_candidate_id: input.base_candidate_id,
        paths: canonicalStringList(input.paths, "correction paths").map(canonicalPath).sort(),
        actual_changed_lines: input.actual_changed_lines,
        corrected_candidate_id: digest("review-candidate-v1", retryCandidate),
      };
      const recorded = {
        base_candidate_id: previous.base_candidate_id,
        paths: previous.paths,
        actual_changed_lines: previous.actual_changed_lines,
        corrected_candidate_id: previous.corrected_candidate_id,
      };
      if (stableSerialize(retry) === stableSerialize(recorded)) return clone(state);
      throw new Error("divergent correction record retry is not allowed");
    }
  }
  const next = prepareMutation(state, input, "correction-record", ["correcting"]);
  const pending = next.pending_correction;
  if (!pending) throw new Error("pending correction is required");
  if (input.base_candidate_id !== pending.base_candidate_id || input.base_candidate_id !== next.current_candidate_id) throw new Error("correction base candidate mismatch");
  assertCount(input.actual_changed_lines, "actual_changed_lines");
  if (input.actual_changed_lines > pending.forecast_lines) throw new Error("actual changed lines exceed correction forecast");
  const paths = canonicalStringList(input.paths, "correction paths").map(canonicalPath).sort();
  if (paths.some((path) => !pending.paths.includes(path)) || paths.some((path) => !next.genesis.paths.includes(path))) throw new Error("actual correction paths exceed forecast or genesis");
  if (next.correction_budget.used_lines + input.actual_changed_lines > next.correction_budget.limit_lines) throw new Error("cumulative correction line budget exceeded");
  const correctedCandidate = normalizeCandidate(input.corrected_candidate);
  if (stableSerialize(correctedCandidate.paths) !== stableSerialize(next.genesis.paths)) throw new Error("corrected candidate paths must equal frozen genesis paths");
  if (correctedCandidate.original_changed_lines !== next.genesis.original_changed_lines || correctedCandidate.authored_lines !== next.genesis.authored_lines) throw new Error("corrected candidate changed_lines counts are immutable");
  const correctedCandidateId = digest("review-candidate-v1", correctedCandidate);
  next.correction_budget.used_lines += input.actual_changed_lines;
  next.current_candidate = correctedCandidate;
  next.current_candidate_id = correctedCandidateId;
  next.correction_history.push({
    ...clone(pending),
    record_request_id: input.request_id,
    actual_changed_lines: input.actual_changed_lines,
    corrected_candidate_id: correctedCandidateId,
    status: "awaiting-validation",
  });
  next.status = "validating";
  next.pending_operation = null;
  return commit(next);
}

function applyTargetedValidation(state, input) {
  assertLineage(state);
  assertExpectedRevision(state, input && input.expected_revision);
  assertRequestId(input && input.request_id);
  if (!Array.isArray(input.outcomes)) throw new TypeError("validation outcomes are required");
  const outcomes = input.outcomes.map((outcome) => {
    if (!outcome || Object.keys(outcome).sort().join(",") !== "id,status" || typeof outcome.id !== "string" || !OUTCOMES.has(outcome.status)) throw new TypeError("validation outcome must contain exactly frozen id and resolved|unresolved status");
    return { id: outcome.id, status: outcome.status };
  });
  if (!input.regression || typeof input.regression.detected !== "boolean" || !Array.isArray(input.regression.evidence) || input.regression.evidence.length === 0 || input.regression.evidence.some((item) => typeof item !== "string" || item.length === 0 || item.length > 500)) {
    throw new TypeError("correction regression evidence is required");
  }
  const followUps = normalizeFollowUps(input.follow_ups);
  const requestDigest = digest("review-targeted-validation-v1", { outcomes, regression: input.regression, follow_ups: followUps });
  const previousValidation = state.validation_history.find((entry) => entry.request_id === input.request_id);
  if (previousValidation) {
    if (previousValidation.request_digest === requestDigest) return clone(state);
    throw new Error("divergent targeted validation retry is not allowed");
  }
  const next = prepareMutation(state, input, "targeted-validation", ["validating"]);
  const expectedIds = next.findings.filter((finding) => finding.blocking && finding.resolution === "unresolved").map((finding) => finding.id).sort();
  const actualIds = outcomes.map((outcome) => outcome.id).sort();
  if (new Set(actualIds).size !== actualIds.length || stableSerialize(actualIds) !== stableSerialize(expectedIds)) throw new Error("validation must cover every frozen unresolved finding ID exactly once");
  const failed = input.regression.detected || outcomes.some((outcome) => outcome.status === "unresolved");
  const outcomeById = new Map(outcomes.map((outcome) => [outcome.id, outcome.status]));
  next.findings = next.findings.map((finding) => {
    if (outcomeById.has(finding.id)) {
      const status = failed ? "unresolved" : outcomeById.get(finding.id);
      return { ...finding, resolution: status };
    }
    return finding;
  });
  next.follow_ups.push(...followUps);
  if (failed) next.correction_budget.failed_attempts += 1;
  const history = next.correction_history.at(-1);
  if (history) history.status = failed ? "failed" : "passed";
  next.validation_history.push({
    request_id: input.request_id,
    request_digest: requestDigest,
    outcomes,
    regression: clone(input.regression),
    follow_up_count: followUps.length,
    result: failed ? "failed" : "passed",
  });
  next.pending_correction = null;
  next.pending_operation = null;
  if (!failed && next.findings.every((finding) => !finding.blocking || finding.resolution === "resolved")) {
    next.status = "approved";
    next.terminal_reason = "all-frozen-findings-resolved";
  } else if (next.correction_budget.failed_attempts >= MAX_FAILED_ATTEMPTS) {
    next.status = "exhausted";
    next.terminal_reason = "three-failed-targeted-validations";
  } else {
    next.status = "correction-required";
  }
  return commit(next);
}

function normalizeFollowUps(value) {
  if (!Array.isArray(value)) throw new TypeError("follow_ups must be an array");
  return value.map((followUp) => {
    if (!followUp || Object.keys(followUp).sort().join(",") !== "owner,summary" || !DIMENSIONS.includes(followUp.owner) || typeof followUp.summary !== "string" || followUp.summary.trim().length === 0 || followUp.summary.length > 500) {
      throw new TypeError("follow-up must be a bounded non-blocking owner/summary record");
    }
    return { owner: followUp.owner, summary: followUp.summary.trim(), blocking: false };
  });
}

function markOperationUnknown(state, input) {
  assertLineage(state);
  assertExpectedRevision(state, input.expected_revision);
  const lensEntry = Object.entries(state.lenses).find(([, lens]) => lens.operation && lens.operation.request_id === input.request_id);
  const operation = state.pending_operation && state.pending_operation.request_id === input.request_id
    ? state.pending_operation
    : lensEntry && lensEntry[1].operation;
  if (!operation) throw new Error("exact pending operation is required for unknown outcome");
  const next = clone(state);
  const nextOperation = lensEntry ? next.lenses[lensEntry[0]].operation : next.pending_operation;
  nextOperation.status = "unknown";
  nextOperation.interrupted_status = next.status;
  next.status = "reconciliation-required";
  return commit(next);
}

function reconcilePendingOperation(state, input) {
  assertLineage(state);
  assertExpectedRevision(state, input.expected_revision);
  assertRequestId(input.request_id);
  const lensEntry = Object.entries(state.lenses).find(([, lens]) => lens.operation && lens.operation.request_id === input.request_id && lens.operation.status === "unknown");
  const operation = state.pending_operation && state.pending_operation.request_id === input.request_id && state.pending_operation.status === "unknown"
    ? state.pending_operation
    : lensEntry && lensEntry[1].operation;
  if (state.status !== "reconciliation-required" || !operation) throw new Error("exact unknown operation must be reconciled");
  if (!['committed', 'not_started', 'unknown'].includes(input.outcome)) throw new TypeError("reconciliation outcome must be committed, not_started, or unknown");
  if (input.outcome === "unknown") return clone(state);
  const next = clone(state);
  if (input.outcome === "not_started") {
    next.status = operation.before.status;
    if (operation.before.dimension) {
      next.lenses[operation.before.dimension].status = operation.before.lens_status;
      next.lenses[operation.before.dimension].request_id = null;
      next.lenses[operation.before.dimension].operation = null;
    } else {
      next.pending_operation = null;
    }
    return commit(next);
  }
  if (!input.committed_state || input.committed_state.lineage_id !== state.lineage_id || input.committed_state.revision < operation.expected_revision || !stateContainsRequest(input.committed_state, input.request_id)) throw new Error("exact committed lineage state and request are required");
  assertLineage(input.committed_state);
  verifyLineageInvariants(state, input.committed_state);
  return clone(input.committed_state);
}

function validateLineageForGate(state, input) {
  assertLineage(state);
  if (!input || !["status", "verify", "delivery", "archive"].includes(input.gate)) return { valid: false, code: "unknown-gate" };
  if (state.status === "reconciliation-required" || (state.pending_operation && state.pending_operation.status === "unknown") || Object.values(state.lenses).some((lens) => lens.operation && lens.operation.status === "unknown")) return { valid: false, code: "reconciliation-required" };
  if (input.candidate_id !== state.current_candidate_id) return { valid: false, code: "candidate-drift" };
  if (state.status !== "approved") return { valid: false, code: TERMINAL.has(state.status) ? `lineage-${state.status}` : "lineage-not-terminal" };
  return { valid: true, code: "lineage-approved" };
}

function createSuccessor(predecessor, input) {
  assertLineage(predecessor);
  if (!TERMINAL.has(predecessor.status)) throw new Error("successor requires a terminal predecessor lineage");
  if (predecessor.status === "reconciliation-required" || predecessor.pending_operation) throw new Error("successor is forbidden while reconciliation is pending");
  if (!input || typeof input.reason !== "string" || input.reason.trim().length === 0 || typeof input.approval_reference !== "string" || input.approval_reference.trim().length === 0) throw new TypeError("successor reason and approval reference are required");
  
  const ref = input.approval_reference.trim();
  const refRegex = /^[a-z0-9-]+-bounded-review-[0-9]{3,}$/;
  if (!refRegex.test(ref)) {
    throw new TypeError(`invalid approval_reference format: ${ref}`);
  }
  
  const approvals = input.approvals || predecessor.approvals || input.approval_list;
  if (!Array.isArray(approvals)) {
    throw new TypeError("applicable approvals list is required to resolve successor creation");
  }
  const matching = approvals.find((app) => app && app.id === ref);
  if (!matching) {
    throw new Error(`approval reference ${ref} does not resolve to any persisted ledger entry`);
  }
  if (matching.applies_to && Array.isArray(matching.applies_to)) {
    const hasScope = matching.applies_to.some(phase => ["sdd-design", "sdd-tasks", "sdd-apply", "sdd-verify"].includes(phase));
    if (!hasScope) throw new Error(`approval reference ${ref} is out of scope for lineage successor`);
  }
  if (predecessor.recovery && predecessor.recovery.approval_reference === ref) {
    throw new Error(`approval reference ${ref} has already been used in predecessor lineage`);
  }
  
  return startReviewLineage(input, undefined, {
    generation: predecessor.generation + 1,
    predecessor_lineage_id: predecessor.lineage_id,
    recovery: { reason: input.reason.trim(), approval_reference: ref },
  });
}

function terminateLineage(state, input) {
  assertLineage(state);
  assertExpectedRevision(state, input && input.expected_revision);
  assertRequestId(input && input.request_id);
  if (state.status === "reconciliation-required") throw new Error("lineage requires reconciliation before termination");
  if (TERMINAL.has(state.status)) throw new Error("terminal lineage cannot be reset");
  if (!input || !["escalated", "invalidated"].includes(input.status) || typeof input.reason !== "string" || input.reason.trim().length === 0 || input.reason.length > 500) throw new TypeError("explicit escalated|invalidated status and bounded reason are required");
  const next = clone(state);
  next.status = input.status;
  next.terminal_reason = input.reason.trim();
  next.pending_operation = null;
  next.pending_correction = null;
  for (const lens of Object.values(next.lenses)) lens.operation = null;
  return commit(next);
}

function nextLineageAction(state) {
  assertLineage(state);
  if (state.status === "reconciliation-required") {
    const lensOperation = Object.values(state.lenses).map((lens) => lens.operation).find((operation) => operation && operation.status === "unknown");
    return { type: "reconcile", request_id: (state.pending_operation && state.pending_operation.request_id) || (lensOperation && lensOperation.request_id) || null };
  }
  if (TERMINAL.has(state.status)) return { type: "stop", reason: state.terminal_reason || state.status };
  if (state.status === "reviewing") {
    const pending = state.genesis.selected_dimensions.filter((dimension) => state.lenses[dimension].status === "pending");
    if (pending.length) return { type: "run-lenses", dimensions: pending };
    const running = state.genesis.selected_dimensions.filter((dimension) => state.lenses[dimension].status === "running");
    return running.length ? { type: "await-lenses", dimensions: running } : { type: "freeze-findings" };
  }
  if (state.status === "correction-required") return { type: "correct", finding_ids: state.findings.filter((finding) => finding.blocking && finding.resolution === "unresolved").map((finding) => finding.id) };
  if (state.status === "correcting") return { type: "record-correction", request_id: state.pending_correction.request_id };
  if (state.status === "validating") return { type: "targeted-validation", finding_ids: state.findings.filter((finding) => finding.blocking && finding.resolution === "unresolved").map((finding) => finding.id) };
  return { type: "stop", reason: "invalid-lineage-state" };
}

function prepareMutation(state, input, operation, allowedStatuses) {
  assertLineage(state);
  if (state.status === "reconciliation-required") throw new Error("lineage requires reconciliation before any mutation");
  if (TERMINAL.has(state.status)) throw new Error(`terminal lineage cannot perform ${operation}`);
  if (!allowedStatuses.includes(state.status)) throw new Error(`${operation} is not allowed in status ${state.status}`);
  assertExpectedRevision(state, input && input.expected_revision);
  assertRequestId(input && input.request_id);
  return clone(state);
}

function operationRecord(input, operation, payload, before) {
  return {
    request_id: input.request_id,
    request_digest: digest("review-operation-v1", { operation, payload }),
    expected_revision: input.expected_revision,
    operation,
    status: "pending",
    before: clone(before),
  };
}

function assertExpectedRevision(state, expected) {
  if (!Number.isSafeInteger(expected) || expected !== state.revision) throw new Error(`stale revision: expected ${state.revision}`);
}

function assertRequestId(value) {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 200) throw new TypeError("request_id is required");
}

function assertLineage(state) {
  if (!state || typeof state !== "object") throw new TypeError("lineage state must be an object");
  if (state.schema_version !== 1) throw new TypeError("schema_version must be 1");
  if (typeof state.lineage_id !== "string" || state.lineage_id.length === 0) throw new TypeError("lineage_id must be a non-empty string");
  if (!Number.isSafeInteger(state.revision) || state.revision < 0) throw new TypeError("revision must be a non-negative safe integer");
  if (!Number.isSafeInteger(state.generation) || state.generation < 1) throw new TypeError("generation must be a positive safe integer");
  if (state.predecessor_lineage_id !== null && (typeof state.predecessor_lineage_id !== "string" || state.predecessor_lineage_id.length === 0)) {
    throw new TypeError("predecessor_lineage_id must be null or a non-empty string");
  }
  if (!state.genesis || typeof state.genesis !== "object") throw new TypeError("genesis is required");
  if (typeof state.genesis.classification !== "string" || !["normal", "high-risk"].includes(state.genesis.classification)) {
    throw new TypeError("genesis classification must be normal or high-risk");
  }
  if (typeof state.genesis.evidence_fingerprint !== "string" || state.genesis.evidence_fingerprint.length === 0) {
    throw new TypeError("genesis evidence_fingerprint is required");
  }
  if (!Array.isArray(state.genesis.selected_dimensions)) throw new TypeError("genesis selected_dimensions must be an array");
  
  if (typeof state.genesis.candidate_id !== "string" || state.genesis.candidate_id.length === 0) {
    throw new TypeError("genesis candidate_id is required");
  }
  if (!state.genesis.candidate || typeof state.genesis.candidate !== "object") throw new TypeError("genesis candidate is required");
  const expectedCandidateId = digest("review-candidate-v1", state.genesis.candidate);
  if (state.genesis.candidate_id !== expectedCandidateId) {
    throw new TypeError("genesis candidate_id integrity check failed");
  }
  
  if (typeof state.current_candidate_id !== "string" || state.current_candidate_id.length === 0) {
    throw new TypeError("current_candidate_id must be a non-empty string");
  }
  if (!state.current_candidate || typeof state.current_candidate !== "object") throw new TypeError("current_candidate is required");
  const expectedCurrentCandidateId = digest("review-candidate-v1", state.current_candidate);
  if (state.current_candidate_id !== expectedCurrentCandidateId) {
    throw new TypeError("current_candidate_id integrity check failed");
  }
  
  if (!state.lenses || typeof state.lenses !== "object") throw new TypeError("lenses is required");
  for (const dim of DIMENSIONS) {
    const lens = state.lenses[dim];
    if (!lens || typeof lens !== "object") throw new TypeError(`lens ${dim} is required`);
    if (typeof lens.selected !== "boolean") throw new TypeError(`lens ${dim}.selected must be a boolean`);
    if (!["pending", "running", "completed", "skipped"].includes(lens.status)) {
      throw new TypeError(`lens ${dim}.status is invalid`);
    }
  }
  
  if (!Array.isArray(state.findings)) throw new TypeError("findings must be an array");
  if (state.findings_digest !== null) {
    if (typeof state.findings_digest !== "string" || state.findings_digest.length === 0) {
      throw new TypeError("findings_digest must be a non-empty string");
    }
    const freezeTimeFindings = state.findings.map((f) => ({
      ...f,
      resolution: f.blocking ? "unresolved" : "advisory"
    }));
    const computedDigest = digest("review-findings-v1", freezeTimeFindings);
    if (state.findings_digest !== computedDigest) {
      throw new TypeError("findings_digest mismatch");
    }
  } else {
    if (state.findings.length !== 0) {
      throw new TypeError("findings must be empty before findings are frozen");
    }
  }
  
  if (!state.correction_budget || typeof state.correction_budget !== "object") throw new TypeError("correction_budget is required");
  if (!Number.isSafeInteger(state.correction_budget.limit_lines) || state.correction_budget.limit_lines < 0) {
    throw new TypeError("correction_budget.limit_lines must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(state.correction_budget.used_lines) || state.correction_budget.used_lines < 0) {
    throw new TypeError("correction_budget.used_lines must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(state.correction_budget.failed_attempts) || state.correction_budget.failed_attempts < 0) {
    throw new TypeError("correction_budget.failed_attempts must be a non-negative safe integer");
  }
  if (!Number.isSafeInteger(state.correction_budget.max_failed_attempts) || state.correction_budget.max_failed_attempts < 0) {
    throw new TypeError("correction_budget.max_failed_attempts must be a non-negative safe integer");
  }
  
  if (!Array.isArray(state.correction_history)) throw new TypeError("correction_history must be an array");
  if (!Array.isArray(state.validation_history)) throw new TypeError("validation_history must be an array");
  if (!Array.isArray(state.follow_ups)) throw new TypeError("follow_ups must be an array");
  
  if (typeof state.status !== "string" || !["reviewing", "correction-required", "correcting", "validating", "approved", "exhausted", "escalated", "invalidated", "reconciliation-required"].includes(state.status)) {
    throw new TypeError(`invalid lineage status: ${state.status}`);
  }
  
  const expectedLineageId = digest("review-lineage-v1", {
    candidate_id: state.genesis.candidate_id,
    classification: state.genesis.classification,
    selected_dimensions: state.genesis.selected_dimensions,
    evidence_fingerprint: state.genesis.evidence_fingerprint,
    generation: state.generation,
    predecessor_lineage_id: state.predecessor_lineage_id,
  });
  if (state.lineage_id !== expectedLineageId) {
    throw new TypeError("lineage_id integrity check failed");
  }
}

function verifyLineageInvariants(pre, post) {
  assertLineage(pre);
  assertLineage(post);
  if (post.lineage_id !== pre.lineage_id) throw new Error("lineage_id mismatch");
  if (post.generation !== pre.generation) throw new Error("generation mismatch");
  if (post.predecessor_lineage_id !== pre.predecessor_lineage_id) throw new Error("predecessor_lineage_id mismatch");
  if (stableSerialize(post.genesis) !== stableSerialize(pre.genesis)) throw new Error("genesis mismatch");
  if (post.correction_budget.limit_lines !== pre.correction_budget.limit_lines) throw new Error("correction_budget.limit_lines mismatch");
  if (post.correction_budget.max_failed_attempts !== pre.correction_budget.max_failed_attempts) throw new Error("correction_budget.max_failed_attempts mismatch");
  
  if (pre.findings_digest !== null) {
    if (post.findings_digest !== pre.findings_digest) throw new Error("findings_digest mismatch");
    if (post.findings.length !== pre.findings.length) throw new Error("findings count mismatch");
    for (let i = 0; i < pre.findings.length; i++) {
      const fPre = pre.findings[i];
      const fPost = post.findings.find(f => f.id === fPre.id);
      if (!fPost) throw new Error(`missing finding ${fPre.id}`);
      if (fPost.owner !== fPre.owner || fPost.severity !== fPre.severity || fPost.summary !== fPre.summary || fPost.acceptance_criteria !== fPre.acceptance_criteria || fPost.blocking !== fPre.blocking) {
        throw new Error(`finding ${fPre.id} properties mismatch`);
      }
    }
  }
  
  for (const dim of DIMENSIONS) {
    const lPre = pre.lenses[dim];
    const lPost = post.lenses[dim];
    if (lPre.status === "completed") {
      if (lPost.status !== "completed") throw new Error(`lens ${dim} was completed but is no longer completed`);
      if (lPost.result_digest !== lPre.result_digest) throw new Error(`lens ${dim} result_digest mismatch`);
      if (lPost.request_id !== lPre.request_id) throw new Error(`lens ${dim} request_id mismatch`);
      if (lPost.result_request_id !== lPre.result_request_id) throw new Error(`lens ${dim} result_request_id mismatch`);
    }
  }
}

function stateContainsRequest(state, requestId) {
  return Object.values(state.lenses || {}).some((lens) => lens.request_id === requestId || lens.result_request_id === requestId)
    || (state.pending_operation && state.pending_operation.request_id === requestId)
    || (state.pending_correction && state.pending_correction.request_id === requestId)
    || (state.correction_history || []).some((entry) => entry.request_id === requestId || entry.record_request_id === requestId)
    || (state.validation_history || []).some((entry) => entry.request_id === requestId);
}

function commit(state) {
  state.revision += 1;
  return state;
}

function clone(value) {
  return structuredClone(value);
}

module.exports = {
  stableSerialize,
  startReviewLineage,
  beginLens,
  recordLensResult,
  freezeFindings,
  beginCorrection,
  recordCorrection,
  applyTargetedValidation,
  markOperationUnknown,
  reconcilePendingOperation,
  validateLineageForGate,
  createSuccessor,
  terminateLineage,
  nextLineageAction,
};
