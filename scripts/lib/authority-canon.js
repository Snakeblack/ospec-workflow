"use strict";

const { stableSerialize } = require("./canonical-json.js");

/**
 * Structured authority helpers for the harness canon (REQ-harness-authority-canon-001/002).
 * Graph IR is never an independent override of OpenSpec/Git; missing structured
 * fields fail closed — never fall back to prose interpretation.
 */

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function structurallyEqual(left, right) {
  try {
    return stableSerialize(left) === stableSerialize(right);
  } catch {
    return false;
  }
}

/**
 * @param {{openspec: object, graphIr?: object|null}} input
 * @returns {{ok: boolean, authority: string, reason_code?: string}}
 */
function assertOpenSpecAuthoritative(input) {
  const openspec = input && input.openspec;
  if (!isRecord(openspec)) {
    return { ok: false, authority: "openspec", reason_code: "missing-openspec-authority" };
  }

  const graphIr = input.graphIr;
  if (graphIr == null) {
    return { ok: true, authority: "openspec" };
  }

  if (!isRecord(graphIr)) {
    return { ok: false, authority: "openspec", reason_code: "graph-ir-override-rejected" };
  }

  const materialKeys = ["status", "change", "owner", "candidate_id"];
  let reconciledFields = 0;
  for (const key of materialKeys) {
    const openspecHasKey = Object.prototype.hasOwnProperty.call(openspec, key);
    const graphHasKey = Object.prototype.hasOwnProperty.call(graphIr, key);
    if (openspecHasKey !== graphHasKey) {
      return { ok: false, authority: "openspec", reason_code: "graph-ir-override-rejected" };
    }
    if (openspecHasKey) {
      reconciledFields += 1;
      if (!structurallyEqual(openspec[key], graphIr[key])) {
        return { ok: false, authority: "openspec", reason_code: "graph-ir-override-rejected" };
      }
    }
  }

  if (reconciledFields === 0) {
    return { ok: false, authority: "openspec", reason_code: "graph-ir-override-rejected" };
  }

  return { ok: true, authority: "openspec" };
}

/**
 * @param {{openspec: object, git?: object|null, graphIr: object}} input
 * @returns {{ok: boolean, reason_code?: string}}
 */
function reconcileGraphIr(input) {
  const openspec = input && input.openspec;
  const graphIr = input && input.graphIr;
  if (!isRecord(openspec) || !isRecord(graphIr)) {
    return { ok: false, reason_code: "graph-ir-unreconciled" };
  }

  const gitWasProvided = input.git != null;
  const git = isRecord(input.git) ? input.git : null;
  const authorityCandidate = openspec.candidate_id;

  if (
    !nonEmptyString(authorityCandidate) ||
    !nonEmptyString(openspec.change) ||
    (gitWasProvided && (!git || !nonEmptyString(git.candidate_id))) ||
    (git && git.candidate_id !== authorityCandidate)
  ) {
    return { ok: false, reason_code: "graph-ir-unreconciled" };
  }

  const derived = graphIr.derived_from;
  const derivedCandidate = isRecord(derived) ? derived.candidate_id : null;
  const derivationSource = isRecord(derived) ? derived.source : null;
  const validSources = new Set(["openspec", "git", "openspec/git", "openspec-git"]);
  const authorityParity = assertOpenSpecAuthoritative({ openspec, graphIr });

  if (
    !nonEmptyString(graphIr.change) ||
    !nonEmptyString(graphIr.candidate_id) ||
    graphIr.candidate_id !== authorityCandidate ||
    derivedCandidate !== authorityCandidate ||
    !validSources.has(derivationSource) ||
    (derivationSource === "git" && !git) ||
    !authorityParity.ok
  ) {
    return { ok: false, reason_code: "graph-ir-unreconciled" };
  }

  return { ok: true };
}

/**
 * @param {{requiredField: string, structured: object, proseHint?: string}} input
 * @returns {{ok: boolean, value?: *, reason_code?: string}}
 */
function rejectProseFallback(input) {
  const field = input && input.requiredField;
  const structured = input && input.structured;
  if (typeof field !== "string" || !field || !structured || typeof structured !== "object") {
    return { ok: false, reason_code: "missing-structured-authority-field" };
  }

  if (!Object.prototype.hasOwnProperty.call(structured, field) || structured[field] == null || structured[field] === "") {
    return { ok: false, reason_code: "missing-structured-authority-field" };
  }

  return { ok: true, value: structured[field] };
}

/**
 * HostAdapters / HostCapabilities / CapabilityProof / Headless Conformance Host
 * MUST NOT override OpenSpec/Git semantic facts (REQ-harness-authority-canon-007).
 *
 * @param {{
 *   openspec: object,
 *   git?: object|null,
 *   adapter_claim?: object|null,
 *   capability_proof?: object|null,
 *   conformance_host_claim?: object|null
 * }} input
 */
function assertAdaptersNotSemanticAuthority(input) {
  const openspec = input && input.openspec;
  if (!isRecord(openspec)) {
    return { ok: false, authority: "openspec", reason_code: "missing-openspec-authority" };
  }

  const claims = [input.adapter_claim, input.capability_proof, input.conformance_host_claim].filter(
    (c) => c != null
  );

  for (const claim of claims) {
    if (!isRecord(claim)) {
      return { ok: false, authority: "openspec", reason_code: "adapter-claim-rejected" };
    }
    for (const key of ["status", "change", "owner", "candidate_id", "approval", "semantic_fact"]) {
      if (
        Object.prototype.hasOwnProperty.call(claim, key) &&
        Object.prototype.hasOwnProperty.call(openspec, key) &&
        !structurallyEqual(claim[key], openspec[key])
      ) {
        return {
          ok: false,
          authority: "openspec",
          reason_code: "adapter-claim-override-rejected",
        };
      }
      if (
        Object.prototype.hasOwnProperty.call(claim, key) &&
        !Object.prototype.hasOwnProperty.call(openspec, key) &&
        (key === "status" || key === "change" || key === "candidate_id" || key === "approval")
      ) {
        return {
          ok: false,
          authority: "openspec",
          reason_code: "adapter-claim-override-rejected",
        };
      }
    }
    if (claim.overrides_openspec === true || claim.semantic_authority === true) {
      return {
        ok: false,
        authority: "openspec",
        reason_code: "adapter-claim-override-rejected",
      };
    }
  }

  if (isRecord(input.capability_proof) && input.capability_proof.replaces_openspec === true) {
    return {
      ok: false,
      authority: "openspec",
      reason_code: "capability-proof-not-authority",
    };
  }

  return { ok: true, authority: "openspec/git", adapters_are_authority: false };
}

module.exports = {
  assertOpenSpecAuthoritative,
  rejectProseFallback,
  reconcileGraphIr,
  assertAdaptersNotSemanticAuthority,
};
