"use strict";

/**
 * Pure, opt-in operation identity binding checker (AIB-1).
 *
 * Cross-checks caller-supplied snapshots — an explicit
 * `{changePath, phase, expectedRevision, operation}` binding snapshot against
 * a target record snapshot and/or a candidate record set — and returns a
 * typed advisory signal. Binding and target inputs are untrusted snapshots,
 * not verified claims: this module can only detect inconsistency between
 * them, never vouch for their truth.
 *
 * This module never authorizes or invokes a material effect. There is no
 * trusted dispatch channel, no permit, and no live SubagentStop or hook
 * wiring here by design (deferred follow-up). Callers own every effect and
 * its policy; a decision object carries no effect, permit, or dispatch
 * surface at all.
 *
 * `reconciliation_required` is only a signal that external reconciliation is
 * needed; no durable reconciliation is implemented by this module. Any
 * recorded outcome (success, failure, unknown, or unrecognized) fails closed
 * until such external reconciliation completes — including the legacy
 * absent-binding path, whose named passthrough candidate must record no
 * outcome. There is no replay flag and no bypass: unknown input fields are
 * ignored.
 *
 * When both a target snapshot and candidate records are supplied, candidate
 * records for the same changePath must agree with the target on phase,
 * revision, operation, and lastOutcome — including the missing-vs-present
 * case where one side records an outcome and the other records none. When
 * only candidates are supplied, records for the binding's changePath must
 * equally agree with each other before exact-match selection; fully agreeing
 * duplicates collapse to one record. Any contradiction is rejected as
 * `input.contradictory_snapshots`; the adapter never silently prioritizes
 * one snapshot over another. Records for other changePaths are unrelated
 * and ignored.
 */

const DECISION_STATUSES = Object.freeze([
  "bound",
  "rejected",
  "legacy_passthrough",
  "reconciliation_required",
]);

const KNOWN_OUTCOMES = Object.freeze(["success", "failure", "unknown"]);

const IDENTITY_FIELDS = Object.freeze(["changePath", "phase", "expectedRevision", "operation"]);

function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function makeDecision(status, reasons, binding, record) {
  return Object.freeze({
    status,
    reasons: Object.freeze([...reasons]),
    binding,
    record,
  });
}

function rejected(reasons, binding, record) {
  return makeDecision("rejected", reasons, binding ?? null, record ?? null);
}

function reconciliationRequired(reasons, binding, record) {
  return makeDecision("reconciliation_required", reasons, binding, record);
}

function isRecordShape(record) {
  return (
    isPlainObject(record) &&
    isNonEmptyString(record.changePath) &&
    isNonEmptyString(record.phase) &&
    isNonEmptyString(record.revision) &&
    isNonEmptyString(record.operation)
  );
}

function summarizeRecord(record) {
  return Object.freeze({
    changePath: record.changePath,
    phase: record.phase,
    revision: record.revision,
    operation: record.operation,
    lastOutcome: record.lastOutcome === undefined ? undefined : record.lastOutcome,
  });
}

/**
 * Returns the first binding-vs-record mismatch reason, or null on exact match.
 */
function compareBindingToRecord(binding, record) {
  if (binding.changePath !== record.changePath) return "binding.change_mismatch";
  if (binding.phase !== record.phase) return "binding.phase_mismatch";
  if (binding.expectedRevision !== record.revision) return "binding.revision_mismatch";
  if (binding.operation !== record.operation) return "binding.operation_mismatch";
  return null;
}

function resolveAbsentBinding(candidates) {
  if (candidates.length === 0) {
    return rejected(["absent_binding.no_candidate"]);
  }
  if (candidates.length > 1) {
    return rejected(["absent_binding.ambiguous"]);
  }
  const [only] = candidates;
  const named = summarizeRecord(only);
  const outcomeReason = recordedOutcomeReason(named);
  if (outcomeReason !== null) {
    return reconciliationRequired([outcomeReason], null, named);
  }
  return makeDecision(
    "legacy_passthrough",
    ["absent_binding.single_candidate_legacy"],
    null,
    named,
  );
}

/**
 * Returns the reconciliation reason for any recorded outcome, or null when no
 * outcome is recorded. Recorded outcomes are never re-runnable from here.
 */
function recordedOutcomeReason(record) {
  const outcome = record.lastOutcome;
  if (outcome === undefined) return null;
  if (outcome === "success") return "outcome.recorded_success";
  if (outcome === "failure") return "outcome.recorded_failure";
  if (outcome === "unknown") return "target.unknown_outcome";
  if (!KNOWN_OUTCOMES.includes(outcome)) return "target.unrecognized_outcome";
  return null;
}

/**
 * Returns true when two record snapshots disagree on phase, revision,
 * operation, or lastOutcome. Missing-vs-present outcomes diverge: an
 * outcome recorded by one snapshot and omitted by the other is a
 * contradiction, never a silent priority.
 */
function snapshotDiverges(left, right) {
  return (
    left.phase !== right.phase ||
    left.revision !== right.revision ||
    left.operation !== right.operation ||
    left.lastOutcome !== right.lastOutcome
  );
}

/**
 * Returns true when a candidate record for the target's changePath disagrees
 * with the target snapshot. Records for other changePaths are unrelated and
 * never contradict the target.
 */
function candidatesDivergeFromTarget(target, candidates) {
  return candidates.some(
    (entry) => entry.changePath === target.changePath && snapshotDiverges(entry, target),
  );
}

function resolveExplicitBinding(binding, target, candidates) {
  let record;
  if (target !== undefined) {
    if (!isRecordShape(target)) {
      return reconciliationRequired(["target.unresolved_identity"], binding, null);
    }
    record = summarizeRecord(target);
    if (candidatesDivergeFromTarget(target, candidates)) {
      return rejected(["input.contradictory_snapshots"], binding, record);
    }
    const mismatch = compareBindingToRecord(binding, record);
    if (mismatch !== null) return rejected([mismatch], binding, record);
  } else {
    const related = candidates.filter((entry) => entry.changePath === binding.changePath);
    const [reference] = related;
    if (
      reference !== undefined &&
      related.slice(1).some((entry) => snapshotDiverges(reference, entry))
    ) {
      return rejected(["input.contradictory_snapshots"], binding, summarizeRecord(reference));
    }
    const matches = related.filter((entry) => compareBindingToRecord(binding, entry) === null);
    if (matches.length === 0) return rejected(["binding.record_not_found"], binding, null);
    record = summarizeRecord(matches[0]);
  }

  const outcomeReason = recordedOutcomeReason(record);
  if (outcomeReason !== null) {
    return reconciliationRequired([outcomeReason], binding, record);
  }
  return makeDecision("bound", ["binding.exact_match", "outcome.no_record"], binding, record);
}

/**
 * Resolve an explicit operation identity binding into a typed advisory signal.
 *
 * @param {{
 *   changePath?: string,
 *   phase?: string,
 *   expectedRevision?: string,
 *   operation?: string,
 *   target?: {changePath: string, phase: string, revision: string, operation: string, lastOutcome?: string},
 *   candidates?: Array<{changePath: string, phase: string, revision: string, operation: string, lastOutcome?: string}>,
 *   [key: string]: unknown
 * }} input
 * @returns {Readonly<{status: string, reasons: string[], binding: object|null, record: object|null}>}
 *   Advisory signal only. Not an authorization, permit, or dispatch order.
 */
function resolveOperationIdentityBinding(input) {
  const raw = isPlainObject(input) ? input : {};
  const candidates = raw.candidates === undefined ? [] : raw.candidates;
  if (!Array.isArray(candidates)) return rejected(["input.malformed_candidates"]);
  if (raw.target !== undefined && !isPlainObject(raw.target)) {
    return rejected(["input.malformed_target"]);
  }
  for (const entry of candidates) {
    if (!isRecordShape(entry)) return rejected(["input.malformed_candidate"]);
  }

  const present = IDENTITY_FIELDS.filter((field) => raw[field] !== undefined);
  if (present.length === 0) {
    return resolveAbsentBinding(candidates);
  }
  const binding = {};
  for (const field of IDENTITY_FIELDS) binding[field] = raw[field];
  if (
    present.length < IDENTITY_FIELDS.length ||
    IDENTITY_FIELDS.some((field) => !isNonEmptyString(binding[field]))
  ) {
    return rejected(["binding.malformed"], binding);
  }
  return resolveExplicitBinding(binding, raw.target, candidates);
}

module.exports = { resolveOperationIdentityBinding, DECISION_STATUSES };
