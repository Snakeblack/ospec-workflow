"use strict";

// The trust review an IDD change needs when it crosses a security boundary
// (openspec/specs/idd/spec.md, REQ-idd-016), on the bounded review lineage of
// review-lineage.js: one frozen candidate, only the `trust` lens, findings
// frozen once, at most one bounded correction validated against the frozen
// IDs. A successor review needs a changed candidate and a change runs at most
// MAX_REVIEWS of them, plus one per review-limit gate the person resolves;
// no other approval is asked (REQ-idd-008). Pure: the
// CLI reads the trees from git and dispatches the reviewers.

const crypto = require("node:crypto");

const { IddRecordError } = require("./idd-record.js");
const {
  applyTargetedValidation,
  beginCorrection,
  beginLens,
  freezeFindings,
  nextLineageAction,
  recordCorrection,
  recordLensResult,
  startQualityReviewLineage,
  terminateLineage,
} = require("./review-lineage.js");

const OBLIGATION = "trust-review";
const LENS = "trust";
const REVIEWER = "review-trust";
const VALIDATOR = "review-correction";
const MAX_REVIEWS = 3;
const LIMIT_GATE = "review-limit";
const TERMINAL = new Set(["approved", "exhausted", "escalated", "invalidated"]);
const PROJECTION = "idd-tree-diff/v1";

function refuse(code, message) {
  throw new IddRecordError(code, message);
}

function sha256(text) {
  return `sha256:${crypto.createHash("sha256").update(text).digest("hex")}`;
}

// Lineage invariants surface as plain errors: report them as refusals.
function lineageStep(fn) {
  try {
    return fn();
  } catch (error) {
    if (error instanceof IddRecordError) throw error;
    throw new IddRecordError("review-refused", error.message);
  }
}

function requestId(state, operation, lineage) {
  return `${state.change}:${operation}:${lineage.generation}:${lineage.revision}`;
}

function currentReview(state) {
  return (state.reviews || []).at(-1) || null;
}

// Each review-limit gate the person resolves authorizes one more review.
function allowedReviews(state) {
  return MAX_REVIEWS + state.gates.filter((gate) => gate.id === LIMIT_GATE && gate.status === "resolved").length;
}

function limitReason(state) {
  return `${(state.reviews || []).length} of ${allowedReviews(state)} trust reviews used: ospec check opens the ${LIMIT_GATE} gate, and only the person's answer authorizes one more`;
}

function trustObligation(state) {
  const target = state.obligations.find((entry) => entry.id === OBLIGATION);
  return target && target.status !== "withdrawn" ? target : null;
}

function requireReviewable(state) {
  if (state.status === "closed") refuse("change-closed", `change ${state.change} is closed`);
  if (!trustObligation(state)) refuse("unknown-obligation", `change ${state.change} has no ${OBLIGATION} obligation; derive its signals with ospec signals`);
}

/**
 * The reviewed candidate: the paths the diff changes against the base, a
 * digest of their blobs on both sides and the changed line counts.
 */
/** Digest of what the given paths hold on each side of the diff. */
function candidateDiffHash(paths, baseBlobs, candidateBlobs) {
  return sha256([...paths].sort().map((file) => `${file}\0${baseBlobs.get(file) || "-"}\0${candidateBlobs.get(file) || "-"}\n`).join(""));
}

function buildCandidate({ baseTree, candidateTree, numstat, baseBlobs, candidateBlobs }) {
  const changes = numstat.filter((entry) => entry.path);
  if (changes.length === 0) throw new IddRecordError("review-refused", "nothing to review: the diff is empty");
  const paths = changes.map((entry) => entry.path).sort();
  return {
    projection: PROJECTION,
    base_tree: baseTree,
    candidate_tree: candidateTree,
    paths,
    diff_hash: candidateDiffHash(paths, baseBlobs, candidateBlobs),
    paths_digest: sha256(paths.join("\n")),
    original_changed_lines: changes.reduce((sum, entry) => sum + entry.added + entry.deleted, 0),
    authored_lines: changes.reduce((sum, entry) => sum + entry.added, 0),
  };
}

function withReview(state, lineage) {
  const next = structuredClone(state);
  next.reviews = [...(next.reviews || [])];
  if (next.reviews.length > 0 && next.reviews.at(-1).lineage_id === lineage.lineage_id) next.reviews[next.reviews.length - 1] = lineage;
  else next.reviews.push(lineage);
  return next;
}

// A successor whose predecessor ended with unresolved blocking findings hands
// them to the reviewer, who checks them on top of the full review.
function reviewRequest(state, lineage) {
  const request = { lineage_id: lineage.lineage_id, generation: lineage.generation, lens: LENS, reviewer: REVIEWER, paths: [...lineage.genesis.paths] };
  const predecessor = (state.reviews || []).find((entry) => entry.lineage_id === lineage.predecessor_lineage_id);
  const unresolved = predecessor ? predecessor.findings.filter((finding) => finding.blocking && finding.resolution === "unresolved") : [];
  if (unresolved.length > 0) {
    request.predecessor_findings = unresolved.map(({ id, severity, summary, acceptance_criteria }) => ({ id, severity, summary, acceptance_criteria }));
  }
  return request;
}

/**
 * True when the changes since the reviewed candidate do not fit the one
 * bounded correction: more lines than the budget left, or a path outside the
 * frozen ones. Such a fix needs a successor review, not a targeted validation.
 */
function exceedsBoundedCorrection(lineage, changes) {
  const lines = changes.reduce((sum, entry) => sum + entry.added + entry.deleted, 0);
  const budget = lineage.correction_budget;
  const frozen = new Set(lineage.genesis.paths);
  return lines > budget.limit_lines - budget.used_lines || changes.some((entry) => !frozen.has(entry.path));
}

const OVERSIZED_CORRECTION = "the correction does not fit one bounded correction (line budget or frozen paths)";

/**
 * Opens the trust review of the current candidate, or resumes the one in
 * progress. `reviewedChanged` says whether the reviewed paths (and any new
 * security-boundary path) differ from the last reviewed candidate.
 * `correctionChanges` are the changes since a candidate waiting for its
 * correction: when they do not fit one bounded correction, that review ends
 * as escalated and the successor opens (it counts toward the limit).
 */
function startTrustReview(state, { candidate, reviewedChanged, correctionChanges }) {
  requireReviewable(state);
  const reviews = state.reviews || [];
  let current = currentReview(state);
  if (current && current.status === "correction-required" && correctionChanges && correctionChanges.length > 0
    && exceedsBoundedCorrection(current, correctionChanges)) {
    if (reviews.length >= allowedReviews(state)) refuse("review-limit", limitReason(state));
    const predecessor = current;
    current = lineageStep(() => terminateLineage(predecessor, {
      status: "escalated",
      reason: `${OVERSIZED_CORRECTION}: a successor review checks it`,
      expected_revision: predecessor.revision,
      request_id: requestId(state, "terminate", predecessor),
    }));
    state = withReview(state, current);
  }
  if (current && !TERMINAL.has(current.status)) return { state, changed: false, request: reviewRequest(state, current) };
  if (current) {
    if (trustObligation(state).status === "satisfied") refuse("review-current", "the trust review of the current candidate is already approved");
    if (!reviewedChanged) refuse("candidate-unchanged", "the reviewed paths did not change: change the code before a successor review");
    if (reviews.length >= allowedReviews(state)) refuse("review-limit", limitReason(state));
  }
  const lineage = lineageStep(() => {
    const started = startQualityReviewLineage(
      { classification: "high-risk", evidence_fingerprint: candidate.candidate_tree, candidate, selected_domains: [LENS] },
      undefined,
      { generation: reviews.length + 1, predecessor_lineage_id: current ? current.lineage_id : undefined },
    );
    return beginLens(started, { dimension: LENS, expected_revision: started.revision, request_id: requestId(state, "lens-start", started) });
  });
  const next = withReview(state, lineage);
  return { state: next, changed: true, request: reviewRequest(next, lineage) };
}

function approve(state, lineage, recordedAt) {
  const next = withReview(state, lineage);
  const target = trustObligation(next);
  const id = `ev-${next.evidence.length + 1}`;
  next.evidence.push({
    id,
    kind: "frozen-review",
    obligation: OBLIGATION,
    recorded_at: recordedAt,
    detail: {
      lineage_id: lineage.lineage_id,
      candidate_id: lineage.current_candidate_id,
      candidate_tree: lineage.current_candidate.candidate_tree,
      findings_digest: lineage.findings_digest,
    },
  });
  target.status = "satisfied";
  target.evidence = [id];
  return { state: next, evidence: id };
}

function unresolvedIds(lineage) {
  return lineage.findings.filter((finding) => finding.blocking && finding.resolution === "unresolved").map((finding) => finding.id);
}

/** Records the trust reviewer's findings and freezes them. */
function recordTrustFindings(state, { result, recordedAt }) {
  requireReviewable(state);
  const current = currentReview(state);
  if (!current || current.status !== "reviewing") refuse("review-refused", "no trust review is waiting for findings: run ospec review start");
  const frozen = lineageStep(() => {
    const recorded = recordLensResult(current, {
      dimension: LENS,
      result,
      expected_revision: current.revision,
      request_id: requestId(state, "lens-result", current),
    });
    return freezeFindings(recorded, { expected_revision: recorded.revision, request_id: requestId(state, "freeze", recorded) });
  });
  if (frozen.status === "approved") return { ...approve(state, frozen, recordedAt), lineage: frozen };
  return { state: withReview(state, frozen), evidence: null, lineage: frozen };
}

/**
 * Records the one bounded correction: the changes since the reviewed
 * candidate, which must stay inside the frozen paths and the line budget.
 */
function correctTrustReview(state, { changes, candidateTree, diffHash }) {
  requireReviewable(state);
  const current = currentReview(state);
  if (!current || current.status !== "correction-required") refuse("review-refused", "no frozen blocking finding is waiting for a correction");
  if (changes.length === 0) refuse("review-refused", "nothing changed since the reviewed candidate");
  if (exceedsBoundedCorrection(current, changes)) refuse("review-refused", `${OVERSIZED_CORRECTION}: run ospec review start for a successor review`);
  const paths = changes.map((entry) => entry.path).sort();
  const lines = changes.reduce((sum, entry) => sum + entry.added + entry.deleted, 0);
  const findingIds = unresolvedIds(current);
  const corrected = lineageStep(() => {
    const begun = beginCorrection(current, {
      finding_ids: findingIds,
      paths,
      base_candidate_id: current.current_candidate_id,
      forecast_lines: lines,
      expected_revision: current.revision,
      request_id: requestId(state, "correction-start", current),
    });
    return recordCorrection(begun, {
      base_candidate_id: current.current_candidate_id,
      paths,
      actual_changed_lines: lines,
      corrected_candidate: { ...current.current_candidate, candidate_tree: candidateTree, diff_hash: diffHash },
      expected_revision: begun.revision,
      request_id: requestId(state, "correction-record", begun),
    });
  });
  return { state: withReview(state, corrected), finding_ids: findingIds, validator: VALIDATOR };
}

/**
 * Applies the correction validator's verdict on the frozen IDs. A failure
 * ends the lineage: IDD allows one bounded correction per review.
 */
function validateTrustCorrection(state, { result, recordedAt }) {
  requireReviewable(state);
  const current = currentReview(state);
  if (!current || current.status !== "validating") refuse("review-refused", "no correction is waiting for validation");
  const validated = lineageStep(() =>
    applyTargetedValidation(current, {
      outcomes: result.outcomes,
      regression: result.regression,
      follow_ups: result.follow_ups || [],
      expected_revision: current.revision,
      request_id: requestId(state, "validation", current),
    }),
  );
  if (validated.status === "approved") return { ...approve(state, validated, recordedAt), lineage: validated };
  const ended = TERMINAL.has(validated.status)
    ? validated
    : lineageStep(() =>
        terminateLineage(validated, {
          status: "escalated",
          reason: "the one bounded correction did not resolve the frozen findings",
          expected_revision: validated.revision,
          request_id: requestId(state, "terminate", validated),
        }),
      );
  return { state: withReview(state, ended), evidence: null, lineage: ended };
}

/**
 * An approved review proves only the candidate it reviewed: trust-review
 * leaves it when the reviewed paths change and returns when they come back.
 * Once the reviews are used up, the review-limit gate asks the person.
 */
function settleReviewFreshness(state, { reviewedChanged }) {
  const next = structuredClone(state);
  const target = trustObligation(next);
  if (!target) return next;
  const current = currentReview(next);
  if (target.status === "satisfied" && reviewedChanged) {
    target.status = "pending";
    target.evidence = [];
  } else if (target.status === "pending" && !reviewedChanged && current?.status === "approved") {
    const approval = next.evidence.find((entry) =>
      entry.kind === "frozen-review" && entry.obligation === OBLIGATION && entry.detail?.lineage_id === current.lineage_id);
    if (approval) {
      target.status = "satisfied";
      target.evidence = [approval.id];
    }
  }
  const asking = next.gates.some((gate) => gate.id === LIMIT_GATE && gate.status === "open");
  if (target.status === "pending" && current && TERMINAL.has(current.status) && !asking
    && next.reviews.length >= allowedReviews(next)) {
    next.gates.push({ id: LIMIT_GATE, status: "open", reason: limitReason(next) });
  }
  return next;
}

/** Why trust-review is still pending, and the command that moves it on. */
function trustReason(state) {
  const reviews = state.reviews || [];
  const current = currentReview(state);
  if (!current) return `no trust review yet: run ospec review start, dispatch ${REVIEWER} and record its findings`;
  const action = nextLineageAction(current);
  if (action.type === "run-lenses" || action.type === "await-lenses") {
    return `dispatch ${REVIEWER} on the frozen candidate and record its findings with ospec review record`;
  }
  if (action.type === "correct") return `fix the frozen blocking findings ${action.finding_ids.join(", ")} and run ospec review correct`;
  if (action.type === "targeted-validation") {
    return `dispatch ${VALIDATOR} for ${action.finding_ids.join(", ")} and record its verdict with ospec review validate`;
  }
  if (reviews.length >= allowedReviews(state)) return limitReason(state);
  const why = current.status === "approved" ? "the reviewed paths changed after the review" : "the review was not approved";
  return `${why}: change the code and run ospec review start for a successor review (${reviews.length + 1} of ${allowedReviews(state)})`;
}

module.exports = {
  LENS,
  MAX_REVIEWS,
  REVIEWER,
  VALIDATOR,
  buildCandidate,
  candidateDiffHash,
  correctTrustReview,
  currentReview,
  recordTrustFindings,
  settleReviewFreshness,
  startTrustReview,
  trustReason,
  validateTrustCorrection,
};
