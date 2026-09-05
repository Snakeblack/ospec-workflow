"use strict";

const {
  resolveCapabilityState,
  normalizeTransportOutcome,
  REQUIRED_TRANSPORTS,
  invokeTransportAsync,
} = require("../host-contract/index.js");
const { resolvePrimaryFailure } = require("../causal-failure.js");

/**
 * Kernel-owned generic host boundary.
 * Consumes host-agnostic ports only — never imports concrete host adapters.
 */

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Observe a transport through the generic async boundary.
 * @param {{transports:object, port:string, input?:*, requestId?:string, signal?:AbortSignal, deadlineMs?:number}} args
 */
async function observeHostPort(args) {
  const portName = args && args.port;
  const transports = args && args.transports;
  if (!REQUIRED_TRANSPORTS.includes(portName)) {
    return { ok: false, outcome: "error", code: "unknown-host-port" };
  }
  if (!isRecord(transports) || transports[portName] == null) {
    return { ok: false, outcome: "error", code: "missing-transport-port" };
  }
  const port = transports[portName];
  const invoker =
    typeof port === "function" ||
    (isRecord(port) && (typeof port.invoke === "function" || typeof port.run === "function"));
  if (!invoker) {
    return normalizeTransportOutcome({ ok: true, outcome: "noop", value: port });
  }
  const outcome = await invokeTransportAsync(port, {
    requestId: args.requestId || `observe:${portName}`,
    signal: args.signal,
    deadlineMs: args.deadlineMs,
    input: args.input || {},
  });
  if (!outcome.ok) {
    const rawFailures = [
      outcome.primary_failure,
      outcome.failure,
      ...(Array.isArray(outcome.failures) ? outcome.failures : []),
    ].filter(Boolean);

    if (rawFailures.length === 0) {
      rawFailures.push({
        category: outcome.category || "environment_tooling",
        code: outcome.code,
        message: outcome.message,
      });
    }

    const primary = resolvePrimaryFailure(rawFailures);
    return {
      ...outcome,
      primary_failure: primary || null,
      category: primary ? primary.category : (outcome.category || "environment_tooling"),
    };
  }
  return outcome;
}

/**
 * Resolve capability enforcement eligibility via ports/proof — never by host product id.
 */
function resolveHostCapability(input) {
  return resolveCapabilityState({
    capability_id: input.capability_id,
    declared_state: input.declared_state,
    proof: input.proof,
    semantic_evidence: input.semantic_evidence,
    request_enforced: input.request_enforced,
    expectedAdapterId: input.expectedAdapterId,
    expectedAdapterVersion: input.expectedAdapterVersion,
    expectedHostRuntimeVersion: input.expectedHostRuntimeVersion,
    expectedProbeDigest: input.expectedProbeDigest,
    expectedPortId: input.expectedPortId,
    expectedFingerprint: input.expectedFingerprint,
  });
}

/**
 * After a transport fault, authoritative mutation still requires permit+CAS.
 */
function requirePermitCasAfterHostFault(faultOutcome) {
  if (!faultOutcome || faultOutcome.ok === true) {
    return { ok: true, host_local_mutation_allowed: false };
  }
  const rawFailures = [
    faultOutcome.primary_failure,
    faultOutcome.failure,
    ...(Array.isArray(faultOutcome.failures) ? faultOutcome.failures : []),
  ].filter(Boolean);

  if (rawFailures.length === 0) {
    rawFailures.push({
      category: faultOutcome.category,
      code: faultOutcome.code,
      message: faultOutcome.message,
    });
  }

  const primary = resolvePrimaryFailure(rawFailures);
  return {
    ok: true,
    host_local_mutation_allowed: false,
    requires_operation_permit: true,
    requires_cas: true,
    fault_code: faultOutcome.code || faultOutcome.outcome || faultOutcome.failure_class,
    primary_failure: primary || null,
    category: primary ? primary.category : (faultOutcome.category || "environment_tooling"),
  };
}

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
