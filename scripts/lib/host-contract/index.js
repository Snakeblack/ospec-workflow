"use strict";

const {
  verifyCapabilityProof,
  evaluateEnforcementEligibility,
  REASON: PROOF_REASON,
} = require("../capability-proof/index.js");

const CAPABILITY_STATES = Object.freeze([
  "enforced",
  "partial",
  "instructional",
  "unavailable",
]);

const REQUIRED_TRANSPORTS = Object.freeze([
  "ExecutionTransport",
  "QuestionTransport",
  "WorkerTransport",
  "ToolExecutionTransport",
  "DeliveryGateTransport",
]);

const AUTHORITY_SURFACE_KEYS = Object.freeze([
  "mint_permit",
  "mintPermit",
  "mint_operation_permit",
  "compare_and_swap",
  "compareAndSwap",
  "cas",
  "select_transition",
  "selectTransition",
  "lifecycle_transition",
  "set_lifecycle_status",
  "setLifecycleStatus",
  "approve_operation",
  "approveOperation",
  "compile_graph",
  "compileGraph",
]);

const REASON = Object.freeze({
  UNKNOWN_CAPABILITY_STATE: "unknown-capability-state",
  MISSING_TRANSPORT_PORT: "missing-transport-port",
  AUTHORITY_SURFACE_REJECTED: "authority-surface-rejected",
  POLICY_OWNING_TRANSPORT: "policy-owning-transport",
  SILENT_PROMOTION_REFUSED: PROOF_REASON.SILENT_PROMOTION_REFUSED,
  MISSING_ADAPTER_IDENTITY: "missing-adapter-identity",
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function fail(code, path, message) {
  const error = new Error(message || code);
  error.code = code;
  error.path = path;
  throw error;
}

function validateCapabilityStates(capabilities, basePath = "/capabilities") {
  if (!isRecord(capabilities)) {
    fail(REASON.UNKNOWN_CAPABILITY_STATE, basePath, "capabilities must be an object");
  }
  for (const [id, state] of Object.entries(capabilities)) {
    if (!CAPABILITY_STATES.includes(state)) {
      fail(
        REASON.UNKNOWN_CAPABILITY_STATE,
        `${basePath}/${id}`,
        `unknown capability state "${state}"`
      );
    }
  }
}

function assertNoAuthoritySurface(authoritySurface) {
  if (authoritySurface == null) return;
  if (!isRecord(authoritySurface)) {
    fail(REASON.AUTHORITY_SURFACE_REJECTED, "/authority_surface", "authority_surface must be object or absent");
  }
  for (const key of Object.keys(authoritySurface)) {
    if (AUTHORITY_SURFACE_KEYS.includes(key) || authoritySurface[key] === true) {
      fail(
        REASON.AUTHORITY_SURFACE_REJECTED,
        `/authority_surface/${key}`,
        `forbidden authority surface: ${key}`
      );
    }
  }
  // Reject if any truthy authority-like method is present.
  for (const key of AUTHORITY_SURFACE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(authoritySurface, key)) {
      fail(
        REASON.AUTHORITY_SURFACE_REJECTED,
        `/authority_surface/${key}`,
        `forbidden authority surface: ${key}`
      );
    }
  }
}

function assertTransportPorts(transports) {
  if (!isRecord(transports)) {
    fail(REASON.MISSING_TRANSPORT_PORT, "/transports", "transports must be an object");
  }
  for (const name of REQUIRED_TRANSPORTS) {
    if (!Object.prototype.hasOwnProperty.call(transports, name) || transports[name] == null) {
      fail(REASON.MISSING_TRANSPORT_PORT, `/transports/${name}`, `missing required transport ${name}`);
    }
  }

  // Policy-owning DeliveryGate / Worker transports fail closed.
  for (const name of ["DeliveryGateTransport", "WorkerTransport"]) {
    const port = transports[name];
    if (!isRecord(port)) continue;
    if (
      port.authorize_delivery === true ||
      port.authorizeDelivery === true ||
      port.delivery_policy != null ||
      port.deliveryPolicy != null ||
      port.isolation_policy != null ||
      port.isolationPolicy != null ||
      typeof port.authorizeDelivery === "function" ||
      typeof port.authorize_delivery === "function"
    ) {
      fail(
        REASON.POLICY_OWNING_TRANSPORT,
        `/transports/${name}`,
        `${name} must not embed delivery/isolation policy`
      );
    }
  }

  // Lifecycle/CAS policy embedded in any transport is rejected.
  for (const name of REQUIRED_TRANSPORTS) {
    const port = transports[name];
    if (!isRecord(port) && typeof port !== "function") continue;
    const probe = typeof port === "function" ? { invoke: port } : port;
    if (transportOwnsAuthority(probe)) {
      fail(
        REASON.AUTHORITY_SURFACE_REJECTED,
        `/transports/${name}`,
        `${name} must not own lifecycle/CAS/permit policy`
      );
    }
  }
}

/** True when a transport port exposes any AUTHORITY_SURFACE_KEYS method or owns_* flag. */
function transportOwnsAuthority(probe) {
  if (!isRecord(probe)) return false;
  for (const key of AUTHORITY_SURFACE_KEYS) {
    if (typeof probe[key] === "function") return true;
  }
  return probe.owns_lifecycle === true || probe.owns_cas === true;
}

/**
 * @param {{
 *   adapter_id:string,
 *   adapter_version:string,
 *   host_version:string,
 *   capabilities:object,
 *   transports:object,
 *   authority_surface?:object|null
 * }} input
 */
function createHostAdapter(input) {
  if (!isRecord(input)) {
    fail(REASON.MISSING_ADAPTER_IDENTITY, "/", "createHostAdapter requires an object");
  }
  if (!nonEmptyString(input.adapter_id)) {
    fail(REASON.MISSING_ADAPTER_IDENTITY, "/adapter_id", "adapter_id required");
  }
  if (!nonEmptyString(input.adapter_version)) {
    fail(REASON.MISSING_ADAPTER_IDENTITY, "/adapter_version", "adapter_version required");
  }
  if (!nonEmptyString(input.host_version)) {
    fail(REASON.MISSING_ADAPTER_IDENTITY, "/host_version", "host_version required");
  }

  validateCapabilityStates(input.capabilities);
  assertTransportPorts(input.transports);
  assertNoAuthoritySurface(input.authority_surface);

  return Object.freeze({
    kind: "host-adapter/v1",
    adapter_id: input.adapter_id,
    adapter_version: input.adapter_version,
    host_version: input.host_version,
    capabilities: Object.freeze({ ...input.capabilities }),
    transports: Object.freeze({ ...input.transports }),
  });
}

/**
 * Resolve effective capability state. Promotion to enforced requires proof.
 * @param {{capability_id:string, declared_state:string, proof?:object|null, semantic_evidence?:*, request_enforced?:boolean}} input
 */
function resolveCapabilityState(input) {
  const capabilityId = input && input.capability_id;
  const declared = input && input.declared_state;
  if (!nonEmptyString(capabilityId)) {
    return { ok: false, effective_state: null, reason_code: "proof-field-missing", path: "/capability_id" };
  }
  if (!CAPABILITY_STATES.includes(declared)) {
    return {
      ok: false,
      effective_state: null,
      reason_code: REASON.UNKNOWN_CAPABILITY_STATE,
      path: "/declared_state",
    };
  }

  const wantsEnforced = input.request_enforced === true || declared === "enforced";
  if (!wantsEnforced) {
    return { ok: true, effective_state: declared, enforced: false };
  }

  const verification = verifyCapabilityProof(capabilityId, input.proof, input.semantic_evidence);
  if (!verification.ok) {
    // No silent promotion: unavailable/instructional/partial stay honest.
    return {
      ok: false,
      effective_state: declared === "enforced" ? "unavailable" : declared,
      enforced: false,
      reason_code:
        declared === "enforced"
          ? verification.reason_code
          : REASON.SILENT_PROMOTION_REFUSED,
      path: verification.path,
      proof_reason: verification.reason_code,
    };
  }

  return {
    ok: true,
    effective_state: "enforced",
    enforced: true,
    evidence_digest: verification.evidence_digest,
  };
}

/**
 * Normalize transport outcome shape.
 */
function normalizeTransportOutcome(raw) {
  if (!isRecord(raw)) {
    return { ok: false, outcome: "invalid", code: "invalid-transport-outcome" };
  }
  const result = {
    ok: raw.ok === true,
    outcome: typeof raw.outcome === "string" ? raw.outcome : raw.ok === true ? "ok" : "error",
  };
  if (raw.code != null) result.code = String(raw.code);
  if (Object.prototype.hasOwnProperty.call(raw, "value")) result.value = raw.value;
  return result;
}

module.exports = {
  CAPABILITY_STATES,
  REQUIRED_TRANSPORTS,
  AUTHORITY_SURFACE_KEYS,
  REASON,
  createHostAdapter,
  resolveCapabilityState,
  normalizeTransportOutcome,
  validateCapabilityStates,
  evaluateEnforcementEligibility,
  transportOwnsAuthority,
};
