"use strict";

const { validateReviewDecision, classifyQualityReview, validateRouterDecision, mergeRouterDecision } = require("./review-dimensions.js");
const { nextLineageAction, validateLineageForGate } = require("./review-lineage.js");
const {
  detectMixedGateKeys,
  detectMixedTaxonomy,
  ACTIVE_V2_REVIEWERS,
  LEGACY_V1_REVIEWERS,
  reviewerForDomain,
} = require("./review-taxonomy.js");

const LEGACY_DIMENSIONS = Object.freeze(["risk", "reliability", "resilience", "readability"]);
const LEGACY_REVIEWERS = Object.freeze({ ...LEGACY_V1_REVIEWERS });

function readReviewGate(state) {
  const mixed = detectMixedGateKeys(state && state.gates);
  if (mixed.mixed) {
    return { legacy: false, mixed: true, gate: { status: "blocked", blocker_reason: "contract-remediation", validation_error_codes: ["mixed-gate-keys"] } };
  }
  const v2Gate = state && state.gates && state.gates["quality-review-gate"];
  const v1Gate = state && state.gates && state.gates["4r-review-gate"];
  if (v2Gate) {
    return { legacy: false, schema_version: 2, gate: clone(v2Gate) };
  }
  const cloned = clone(v1Gate || {});
  return {
    legacy: !Object.hasOwn(cloned, "schema_version") || cloned.schema_version === 1,
    schema_version: 1,
    gate: cloned,
  };
}

function mergeReviewGateAudit(existingGate, audit) {
  return { ...clone(existingGate || {}), ...clone(audit || {}) };
}

function planReviewGate({
  routeGates = [],
  existingGate = {},
  decision,
  classifierDecision,
  routerDecision = null,
  validationErrors = [],
  admissionContext = "live-v2",
} = {}) {
  const reviewGate = routeGates.find((name) => name === "quality-review-gate" || name === "4r-review-gate");
  if (!reviewGate) {
    return { status: "skipped", run_generalist: false, dispatch: [], archive_allowed: true, gate: clone(existingGate) };
  }

  if (reviewGate === "4r-review-gate") {
    return planLegacyReviewGate({ routeGates, existingGate, decision, validationErrors });
  }
  if (reviewGate === "quality-review-gate") {
    return planQualityReviewGate({ routeGates, existingGate, classifierDecision, routerDecision, validationErrors });
  }
  return { status: "skipped", run_router: false, run_generalist: false, dispatch: [], archive_allowed: true, gate: clone(existingGate) };
}

function planQualityReviewGate({ routeGates = [], existingGate = {}, classifierDecision, routerDecision = null, validationErrors = [] } = {}) {
  if (!routeGates.includes("quality-review-gate")) {
    return { status: "skipped", run_router: false, run_generalist: false, dispatch: [], archive_allowed: true, gate: clone(existingGate) };
  }
  const adapterInvalid = !Array.isArray(validationErrors) || validationErrors.length > 0;
  if (adapterInvalid || !classifierDecision || classifierDecision.schema_version !== 2) {
    return blockedGate(existingGate, ["adapter-contract-invalid", "decision-contract-invalid"]);
  }
  const mixed = detectMixedTaxonomy({ domains: classifierDecision.selected_domains, lineageSchemaVersion: 2 });
  if (mixed.mixed) return blockedGate(existingGate, ["mixed-taxonomy"]);

  if (classifierDecision.classification_status === "sufficient" && !routerDecision) {
    const selected = classifierDecision.selected_domains;
    const status = selected.length ? "ready" : "done";
    return {
      status,
      run_router: false,
      run_generalist: false,
      dispatch: selected.map((id) => ACTIVE_V2_REVIEWERS[id]),
      archive_allowed: selected.length === 0,
      gate: mergeReviewGateAudit(existingGate, buildV2GateAudit(classifierDecision, status, null)),
    };
  }

  if (classifierDecision.classification_status === "ambiguous" && !routerDecision) {
    return {
      status: "blocked",
      run_router: true,
      run_generalist: false,
      dispatch: [],
      archive_allowed: false,
      gate: mergeReviewGateAudit(existingGate, {
        ...buildV2GateAudit(classifierDecision, "blocked", null),
        blocker_reason: "contract-remediation",
        validation_error_codes: ["router-required"],
      }),
    };
  }

  if (routerDecision) {
    const routerValidation = validateRouterDecision(routerDecision);
    if (!routerValidation.valid) return blockedGate(existingGate, ["router-contract-invalid"]);
    if (routerDecision.classification_status === "ambiguous") {
      return {
        status: "blocked",
        run_router: false,
        run_generalist: false,
        dispatch: [],
        archive_allowed: false,
        gate: mergeReviewGateAudit(existingGate, {
          ...buildV2GateAudit(classifierDecision, "blocked", routerDecision),
          blocker_reason: "quality-review-ambiguity-unresolved",
        }),
      };
    }
    const merged = mergeRouterDecision(classifierDecision, routerDecision);
    if (!merged.valid) return blockedGate(existingGate, ["router-contract-invalid"]);
    const selected = merged.selected_domains;
    const status = selected.length ? "ready" : "done";
    return {
      status,
      run_router: false,
      run_generalist: false,
      dispatch: merged.dispatch,
      archive_allowed: selected.length === 0,
      gate: mergeReviewGateAudit(existingGate, buildV2GateAudit(classifierDecision, status, routerDecision, selected)),
    };
  }

  return blockedGate(existingGate, ["decision-contract-invalid"]);
}

function planLegacyReviewGate({ routeGates = [], existingGate = {}, decision, validationErrors = [] } = {}) {
  if (!routeGates.includes("4r-review-gate")) {
    return { status: "skipped", run_router: false, run_generalist: false, dispatch: [], archive_allowed: true, gate: clone(existingGate) };
  }
  const adapterInvalid = !Array.isArray(validationErrors) || validationErrors.length > 0;
  const decisionValidation = validateReviewDecision(decision);
  const validationErrorCodes = [
    ...(adapterInvalid ? ["adapter-contract-invalid"] : []),
    ...(!decisionValidation.valid ? ["decision-contract-invalid"] : []),
  ];
  if (validationErrorCodes.length) return blockedGate(existingGate, validationErrorCodes);

  const selected = [...decision.selected_specialists];
  const status = selected.length ? "ready" : "done";
  const gate = mergeReviewGateAudit(existingGate, {
    status,
    schema_version: decision.schema_version,
    classification: decision.classification,
    evidence: decision.evidence,
    generalist: decision.generalist,
    depth: decision.depth,
    escalation_reason: decision.escalation_reason,
    dimensions: decision.dimensions,
  });
  delete gate.blocker_reason;
  delete gate.validation_errors;
  delete gate.validation_error_codes;
  return {
    status,
    run_router: false,
    run_generalist: true,
    dispatch: selected.map((id) => LEGACY_REVIEWERS[id]),
    archive_allowed: selected.length === 0,
    gate,
  };
}

function buildV2GateAudit(classifierDecision, status, routerDecision, selectedOverride) {
  const audit = {
    status,
    schema_version: 2,
    classification: classifierDecision.classification,
    classification_status: classifierDecision.classification_status,
    selected_domains: selectedOverride || classifierDecision.selected_domains,
    capability_coverage: classifierDecision.capability_coverage,
    ambiguity_reasons: classifierDecision.ambiguity_reasons,
    evidence: classifierDecision.evidence,
    domains: classifierDecision.domains,
  };
  if (routerDecision) audit.router = routerDecision;
  if (classifierDecision.residual_evidence) audit.residual_evidence = classifierDecision.residual_evidence;
  return audit;
}

function blockedGate(existingGate, validationErrorCodes) {
  return {
    status: "blocked",
    run_router: false,
    run_generalist: false,
    dispatch: [],
    archive_allowed: false,
    gate: mergeReviewGateAudit(existingGate, {
      status: "blocked",
      blocker_reason: "contract-remediation",
      validation_error_codes: validationErrorCodes,
    }),
  };
}

function planLineageGate({ lineage, observed_candidate_id, downstream_gate = "status" } = {}) {
  const schemaVersion = lineage && lineage.schema_version === 2 ? 2 : 1;
  const reviewerMap = schemaVersion === 2 ? ACTIVE_V2_REVIEWERS : LEGACY_V1_REVIEWERS;
  const dimensionKey = schemaVersion === 2 ? "selected_domains" : "selected_dimensions";
  const nextAction = nextLineageAction(lineage);
  const dispatch = nextAction.type === "run-lenses"
    ? nextAction.dimensions.map((dimension) => reviewerForDomain(dimension, schemaVersion))
    : nextAction.type === "targeted-validation"
      ? ["review-correction"]
      : [];
  const downstream = ["verify", "delivery", "archive"].includes(downstream_gate)
    ? validateLineageForGate(lineage, { candidate_id: observed_candidate_id, gate: downstream_gate })
    : null;
  const mutableAction = ["correct", "record-correction", "targeted-validation"].includes(nextAction.type);
  const migrationRequired = mutableAction && lineage && lineage.remediation_schema_version !== 2;
  if (migrationRequired) {
    return { status: "migration-required", next_action: { type: "migrate-remediation-v2" }, dispatch: [], archive_allowed: false };
  }
  return {
    status: downstream && !downstream.valid ? downstream.code : lineage.status,
    next_action: nextAction,
    dispatch: downstream && !downstream.valid ? [] : dispatch,
    archive_allowed: downstream_gate === "archive" && Boolean(downstream && downstream.valid),
    ...(nextAction.slice_id ? { active_slice: { slice_id: nextAction.slice_id, finding_ids: nextAction.finding_ids || [], paths: nextAction.paths || [] } } : {}),
  };
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

module.exports = { readReviewGate, planReviewGate, mergeReviewGateAudit, planLineageGate, classifyQualityReview };
