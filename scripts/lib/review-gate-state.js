"use strict";

const { validateReviewDecision } = require("./review-dimensions.js");
const { nextLineageAction, validateLineageForGate } = require("./review-lineage.js");

const DIMENSIONS = Object.freeze(["risk", "reliability", "resilience", "readability"]);
const REVIEWERS = Object.freeze({
  risk: "review-risk",
  reliability: "review-reliability",
  resilience: "review-resilience",
  readability: "review-readability",
});

function readReviewGate(state) {
  const gate = state && state.gates && state.gates["4r-review-gate"];
  const cloned = clone(gate || {});
  return {
    legacy: !Object.hasOwn(cloned, "schema_version") || !Object.hasOwn(cloned, "dimensions"),
    gate: cloned,
  };
}

function mergeReviewGateAudit(existingGate, audit) {
  return { ...clone(existingGate || {}), ...clone(audit || {}) };
}

function planReviewGate({ routeGates = [], existingGate = {}, decision, validationErrors = [] } = {}) {
  if (!routeGates.includes("4r-review-gate")) {
    return {
      status: "skipped",
      run_generalist: false,
      dispatch: [],
      archive_allowed: true,
      gate: clone(existingGate),
    };
  }

  const adapterInvalid = !Array.isArray(validationErrors) || validationErrors.length > 0;
  const decisionValidation = validateReviewDecision(decision);
  const validationErrorCodes = [
    ...(adapterInvalid ? ["adapter-contract-invalid"] : []),
    ...(!decisionValidation.valid ? ["decision-contract-invalid"] : []),
  ];
  if (validationErrorCodes.length) {
    return {
      status: "blocked",
      run_generalist: true,
      dispatch: [],
      archive_allowed: false,
      gate: mergeReviewGateAudit(existingGate, {
        status: "blocked",
        blocker_reason: "contract-remediation",
        validation_error_codes: validationErrorCodes,
      }),
    };
  }

  const selected = [...decision.selected_specialists];
  const status = selected.length ? "ready" : "done";
  const gate = mergeReviewGateAudit(existingGate, {
    status,
    schema_version: decision.schema_version,
    classification: decision.classification,
    evidence: decision.evidence,
    generalist: decision.generalist,
    dimensions: decision.dimensions,
  });
  delete gate.blocker_reason;
  delete gate.validation_errors;
  delete gate.validation_error_codes;
  return {
    status,
    run_generalist: true,
    dispatch: selected.map((id) => REVIEWERS[id]),
    archive_allowed: selected.length === 0,
    gate,
  };
}

function planLineageGate({ lineage, observed_candidate_id, downstream_gate = "status" } = {}) {
  const nextAction = nextLineageAction(lineage);
  const dispatch = nextAction.type === "run-lenses"
    ? nextAction.dimensions.map((dimension) => REVIEWERS[dimension])
    : nextAction.type === "targeted-validation"
      ? ["review-correction"]
      : [];
  const downstream = ["verify", "delivery", "archive"].includes(downstream_gate)
    ? validateLineageForGate(lineage, { candidate_id: observed_candidate_id, gate: downstream_gate })
    : null;
  return {
    status: downstream && !downstream.valid ? downstream.code : lineage.status,
    next_action: nextAction,
    dispatch: downstream && !downstream.valid ? [] : dispatch,
    archive_allowed: downstream_gate === "archive" && Boolean(downstream && downstream.valid),
  };
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

module.exports = { readReviewGate, planReviewGate, mergeReviewGateAudit, planLineageGate };
