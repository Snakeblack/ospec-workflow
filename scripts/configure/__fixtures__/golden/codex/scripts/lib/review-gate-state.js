"use strict";

const { validateReviewDecision, classifyQualityReview, validateRouterDecision, mergeRouterDecision, validateAttributionOverride, pathMatchesScopePattern } = require("./review-dimensions.js");
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
  attributionOverride = null,
} = {}) {
  const reviewGate = routeGates.find((name) => name === "quality-review-gate" || name === "4r-review-gate");
  if (!reviewGate) {
    return { status: "skipped", run_generalist: false, dispatch: [], archive_allowed: true, gate: clone(existingGate) };
  }

  if (reviewGate === "4r-review-gate") {
    return planLegacyReviewGate({ routeGates, existingGate, decision, validationErrors });
  }
  if (reviewGate === "quality-review-gate") {
    return planQualityReviewGate({ routeGates, existingGate, classifierDecision, routerDecision, validationErrors, attributionOverride });
  }
  return { status: "skipped", run_router: false, run_generalist: false, dispatch: [], archive_allowed: true, gate: clone(existingGate) };
}

function planQualityReviewGate({ routeGates = [], existingGate = {}, classifierDecision, routerDecision = null, validationErrors = [], attributionOverride = null } = {}) {
  if (!routeGates.includes("quality-review-gate")) {
    return { status: "skipped", run_router: false, run_generalist: false, dispatch: [], archive_allowed: true, gate: clone(existingGate) };
  }
  const adapterInvalid = !Array.isArray(validationErrors) || validationErrors.length > 0;
  if (adapterInvalid || !classifierDecision || classifierDecision.schema_version !== 2) {
    return blockedGate(existingGate, ["adapter-contract-invalid", "decision-contract-invalid"]);
  }
  const mixed = detectMixedTaxonomy({ domains: classifierDecision.selected_domains, lineageSchemaVersion: 2 });
  if (mixed.mixed) return blockedGate(existingGate, ["mixed-taxonomy"]);

  // QRAR-002: a malformed override always fails closed with a structured
  // validation error; it is never a silent bypass and never a silent no-op.
  // The classifier audit is preserved so the ambiguity stays visible and
  // unresolved in the persisted gate.
  if (attributionOverride !== null && attributionOverride !== undefined) {
    const overrideValidation = validateAttributionOverride(attributionOverride);
    if (!overrideValidation.valid) {
      return {
        status: "blocked",
        run_router: false,
        run_generalist: false,
        dispatch: [],
        archive_allowed: false,
        gate: mergeReviewGateAudit(existingGate, {
          ...buildV2GateAudit(classifierDecision, "blocked", null),
          blocker_reason: "contract-remediation",
          validation_error_codes: ["attribution-override-invalid"],
        }),
      };
    }
  }

  if (classifierDecision.classification_status === "sufficient" && !routerDecision) {
    const selected = classifierDecision.selected_domains;
    const status = selected.length ? "ready" : "done";
    return {
      status,
      run_router: false,
      run_generalist: false,
      dispatch: selected.map((id) => ACTIVE_V2_REVIEWERS[id]),
      archive_allowed: selected.length === 0,
      gate: mergeReviewGateAudit(existingGate, withResolutionAudit(
        buildV2GateAudit(classifierDecision, status, null),
        buildScopeAttributionResolution(classifierDecision),
      )),
    };
  }

  if (classifierDecision.classification_status === "ambiguous" && !routerDecision) {
    // QRAR-002 / ROUTING-003 MODIFIED: apply the declarative override to the
    // codes it lists whose residual paths fall inside its scope. Closed codes
    // never re-appear as unresolved ambiguity reasons in this evaluation.
    const closure = applyAttributionOverride(classifierDecision, attributionOverride);
    if (closure.closed_codes.length) {
      const remainingReasons = classifierDecision.ambiguity_reasons.filter((code) => !closure.closed_codes.includes(code));
      if (!remainingReasons.length) {
        const selected = classifierDecision.selected_domains;
        const status = selected.length ? "ready" : "done";
        return {
          status,
          run_router: false,
          run_generalist: false,
          dispatch: selected.map((id) => ACTIVE_V2_REVIEWERS[id]),
          archive_allowed: selected.length === 0,
          gate: mergeReviewGateAudit(existingGate, {
            ...buildV2GateAudit(classifierDecision, status, null),
            ambiguity_reasons: remainingReasons,
            resolution: closure.record,
          }),
        };
      }
      return {
        status: "blocked",
        run_router: true,
        run_generalist: false,
        dispatch: [],
        archive_allowed: false,
        gate: mergeReviewGateAudit(existingGate, {
          ...buildV2GateAudit(classifierDecision, "blocked", null),
          ambiguity_reasons: remainingReasons,
          resolution: closure.record,
          blocker_reason: "contract-remediation",
          validation_error_codes: ["router-required"],
        }),
      };
    }
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
    // QRAR-003: a router resolution closes exactly its declared codes; the
    // gate MUST NOT re-derive a code the router just resolved.
    const routerResolution = merged.resolution
      ? {
        ambiguity_reasons: classifierDecision.ambiguity_reasons.filter((code) => !merged.resolution.codes.includes(code)),
        resolution: {
          source: merged.resolution.source,
          justification: merged.resolution.justification || null,
          scope: merged.resolution.scope || null,
          closed_codes: merged.resolution.codes.filter((code) => classifierDecision.ambiguity_reasons.includes(code)).sort(),
        },
      }
      : {};
    return {
      status,
      run_router: false,
      run_generalist: false,
      dispatch: merged.dispatch,
      archive_allowed: selected.length === 0,
      gate: mergeReviewGateAudit(existingGate, withResolutionAudit({
        ...buildV2GateAudit(classifierDecision, status, routerDecision, selected),
        ...routerResolution,
      }, buildScopeAttributionResolution(classifierDecision))),
    };
  }

  return blockedGate(existingGate, ["decision-contract-invalid"]);
}

// QRAR-002: apply a validated override block to the classifier's ambiguity
// codes. A code closes only when it is listed in `applies_to` AND some
// residual capability path matches a scope pattern (prefix or `dir/**`).
function applyAttributionOverride(classifierDecision, override) {
  if (!override) return { closed_codes: [], record: null };
  const residualPaths = [];
  const residual = classifierDecision.residual_evidence;
  if (residual && Array.isArray(residual.capabilities)) {
    for (const capability of residual.capabilities) {
      for (const residualPath of Array.isArray(capability.paths) ? capability.paths : []) residualPaths.push(residualPath);
    }
  }
  const closedCodes = [];
  for (const code of classifierDecision.ambiguity_reasons) {
    if (!override.applies_to.includes(code)) continue;
    const inScope = residualPaths.some((residualPath) => override.scope.some((pattern) => pathMatchesScopePattern(residualPath, pattern)));
    if (inScope) closedCodes.push(code);
  }
  const record = closedCodes.length
    ? { source: "attribution-override", justification: override.justification, scope: [...override.scope], closed_codes: [...new Set(closedCodes)].sort() }
    : null;
  return { closed_codes: [...new Set(closedCodes)].sort(), record };
}

// QRAR-001 / ROUTING-003 MODIFIED: when classification closed deterministically
// via the kernel-contract synthetic fact, the audit records the resolution
// source so scope attribution is auditable like an override closure.
function buildScopeAttributionResolution(classifierDecision) {
  if (!classifierDecision || classifierDecision.classification_status !== "sufficient" || classifierDecision.classification !== "normal") return null;
  const facts = classifierDecision.evidence && classifierDecision.evidence.sources ? classifierDecision.evidence.sources.facts : [];
  const kernelFacts = (Array.isArray(facts) ? facts : []).filter((fact) => fact && fact.code === "kernel-contract-change");
  if (!kernelFacts.length) return null;
  const scopePaths = [...new Set(kernelFacts.flatMap((fact) => String(fact.detail).split(",").map((item) => item.trim()).filter(Boolean)))].sort();
  return {
    source: "scope-attribution",
    justification: "kernel-contract-change synthetic fact (schemas/kernel/** capability scope)",
    scope: scopePaths,
    closed_codes: [],
  };
}

function withResolutionAudit(audit, resolution) {
  if (!resolution) return audit;
  return { ...audit, resolution };
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
