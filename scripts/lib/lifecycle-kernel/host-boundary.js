"use strict";

const { resolveCapabilityState, normalizeTransportOutcome, REQUIRED_TRANSPORTS } = require("../host-contract/index.js");

/**
 * Kernel-owned generic host boundary.
 * Consumes host-agnostic ports only — never imports concrete host adapters.
 */

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Observe a transport through the generic boundary.
 * @param {{transports:object, port:string, input?:*}} args
 */
function observeHostPort(args) {
  const portName = args && args.port;
  const transports = args && args.transports;
  if (!REQUIRED_TRANSPORTS.includes(portName)) {
    return { ok: false, outcome: "error", code: "unknown-host-port" };
  }
  if (!isRecord(transports) || transports[portName] == null) {
    return { ok: false, outcome: "error", code: "missing-transport-port" };
  }
  const port = transports[portName];
  let raw;
  if (typeof port === "function") raw = port(args.input || {});
  else if (isRecord(port) && typeof port.invoke === "function") raw = port.invoke(args.input || {});
  else if (isRecord(port) && typeof port.run === "function") raw = port.run(args.input || {});
  else raw = { ok: true, outcome: "noop", value: port };
  return normalizeTransportOutcome(raw);
}

/**
 * Resolve capability enforcement eligibility via ports/proof — never by host product id.
 * @param {{capability_id:string, declared_state:string, proof?:object, semantic_evidence?:*, host_product_id?:string}} input
 */
function resolveHostCapability(input) {
  // Explicitly ignore host_product_id for transition/enforcement decisions.
  return resolveCapabilityState({
    capability_id: input.capability_id,
    declared_state: input.declared_state,
    proof: input.proof,
    semantic_evidence: input.semantic_evidence,
    request_enforced: input.request_enforced,
  });
}

/**
 * After a transport fault, authoritative mutation still requires permit+CAS.
 * This helper only reports that host-local mutation is forbidden.
 */
function requirePermitCasAfterHostFault(faultOutcome) {
  if (!faultOutcome || faultOutcome.ok === true) {
    return { ok: true, host_local_mutation_allowed: false };
  }
  return {
    ok: true,
    host_local_mutation_allowed: false,
    requires_operation_permit: true,
    requires_cas: true,
    fault_code: faultOutcome.code || faultOutcome.outcome,
  };
}

/**
 * Compare transition selection inputs that differ only by host product id —
 * results must be identical when port outcomes match.
 */
function transitionInputsEquivalent(left, right) {
  const strip = (v) => {
    if (!isRecord(v)) return v;
    const { host_product_id, adapter_id, ...rest } = v;
    void host_product_id;
    void adapter_id;
    return rest;
  };
  return JSON.stringify(strip(left)) === JSON.stringify(strip(right));
}

module.exports = {
  observeHostPort,
  resolveHostCapability,
  requirePermitCasAfterHostFault,
  transitionInputsEquivalent,
  REQUIRED_TRANSPORTS,
};
