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

const FAILURE_CLASSES = Object.freeze([
  "timeout",
  "cancel",
  "reject",
  "interrupt",
  "worker-fail",
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

function isThenable(value) {
  return value != null && (typeof value === "object" || typeof value === "function") && typeof value.then === "function";
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

function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || (typeof value !== "object" && typeof value !== "function")) {
    return value;
  }
  if (seen.has(value)) return value;
  seen.add(value);
  Object.freeze(value);
  if (typeof value === "object") {
    for (const key of Reflect.ownKeys(value)) {
      deepFreeze(value[key], seen);
    }
  }
  return value;
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

  const capabilities = { ...input.capabilities };
  const transports = { ...input.transports };
  for (const name of Object.keys(transports)) {
    const port = transports[name];
    if (isRecord(port)) {
      transports[name] = { ...port };
    }
  }

  return deepFreeze({
    kind: "host-adapter/v1",
    adapter_id: input.adapter_id,
    adapter_version: input.adapter_version,
    host_version: input.host_version,
    capabilities,
    transports,
  });
}

/**
 * Resolve effective capability state. Promotion to enforced requires live-bound proof.
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

  const verification = verifyCapabilityProof({
    capabilityId,
    expectedAdapterId: input.expectedAdapterId,
    expectedAdapterVersion: input.expectedAdapterVersion,
    expectedHostRuntimeVersion: input.expectedHostRuntimeVersion,
    expectedProbeDigest: input.expectedProbeDigest,
    proof: input.proof,
    evidence: input.semantic_evidence,
  });
  if (!verification.ok) {
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
    probe_digest: verification.probe_digest,
  };
}

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
  if (raw.failure_class != null) result.failure_class = raw.failure_class;
  if (raw.requestId != null) result.requestId = raw.requestId;
  if (raw.exit_code != null) result.exit_code = raw.exit_code;
  if (raw.stdout != null) result.stdout = raw.stdout;
  if (raw.stderr != null) result.stderr = raw.stderr;
  return result;
}

/**
 * Classify transport failures into stable failure_class values.
 */
function classifyTransportFailure(errOrOutcome, opts = {}) {
  const requestId = opts.requestId;
  const portName = opts.portName;

  let failureClass = "reject";
  let code = "transport-reject";
  let outcome = "error";

  if (isRecord(errOrOutcome) && errOrOutcome.ok === false && nonEmptyString(errOrOutcome.failure_class)) {
    failureClass = errOrOutcome.failure_class;
    code = errOrOutcome.code || `host-fault-${failureClass}`;
    outcome = errOrOutcome.outcome || failureClass;
  } else {
    const hintParts = [];
    if (errOrOutcome && typeof errOrOutcome === "object") {
      hintParts.push(
        errOrOutcome.failure_class,
        errOrOutcome.code,
        errOrOutcome.name,
        errOrOutcome.outcome,
        errOrOutcome.message
      );
    } else if (typeof errOrOutcome === "string") {
      hintParts.push(errOrOutcome);
    }
    const text = hintParts.filter(Boolean).join(" ").toLowerCase();

    if (text.includes("timeout") || text.includes("deadline") || (errOrOutcome && errOrOutcome.name === "TimeoutError")) {
      failureClass = "timeout";
      outcome = "timeout";
      code = (errOrOutcome && errOrOutcome.code) || "host-fault-timeout";
    } else if (
      text.includes("abort") ||
      text.includes("cancel") ||
      (errOrOutcome && errOrOutcome.name === "AbortError")
    ) {
      failureClass = "cancel";
      outcome = "cancel";
      code = (errOrOutcome && errOrOutcome.code) || "host-fault-cancel";
    } else if (text.includes("interrupt")) {
      failureClass = "interrupt";
      outcome = "interrupt";
      code = (errOrOutcome && errOrOutcome.code) || "host-fault-interrupt";
    } else if (text.includes("worker-fail") || text.includes("worker")) {
      failureClass = "worker-fail";
      outcome = "worker-fail";
      code = (errOrOutcome && errOrOutcome.code) || "host-fault-worker-fail";
    } else if (portName === "WorkerTransport") {
      failureClass = "worker-fail";
      outcome = "worker-fail";
      code = (errOrOutcome && errOrOutcome.code) || "host-fault-worker-fail";
    } else if (errOrOutcome && nonEmptyString(errOrOutcome.code)) {
      code = errOrOutcome.code;
    }
  }

  if (!FAILURE_CLASSES.includes(failureClass)) {
    failureClass = "reject";
    outcome = "error";
  }

  const result = {
    ok: false,
    failure_class: failureClass,
    outcome,
    code,
  };
  if (errOrOutcome && typeof errOrOutcome === "object") {
    if (errOrOutcome.failures) result.failures = errOrOutcome.failures;
    if (errOrOutcome.failure) result.failure = errOrOutcome.failure;
    if (errOrOutcome.primary_failure) result.primary_failure = errOrOutcome.primary_failure;
    if (errOrOutcome.category) result.category = errOrOutcome.category;
  }
  if (requestId != null) result.requestId = requestId;
  return result;
}

function resolvePortInvoker(port) {
  if (typeof port === "function") return (request) => port(request);
  if (isRecord(port) && typeof port.invoke === "function") return (request) => port.invoke(request);
  if (isRecord(port) && typeof port.run === "function") return (request) => port.run(request);
  return null;
}

/**
 * Shared async transport invoke: await + catch; never invent ok:true from rejection.
 * @param {*} port
 * @param {{requestId:string, signal?:AbortSignal, deadlineMs?:number, input?:*}} request
 * @returns {Promise<object>}
 */
async function invokeTransportAsync(port, request) {
  const requestId = request && request.requestId;
  const signal = request && request.signal;
  const deadlineMs = request && typeof request.deadlineMs === "number" ? request.deadlineMs : null;
  const input = request && Object.prototype.hasOwnProperty.call(request, "input") ? request.input : request || {};

  const cancelPort = () => {
    try {
      if (isRecord(port)) {
        if (typeof port.cancel === "function") port.cancel();
        if (typeof port.terminate === "function") port.terminate();
        if (typeof port.abort === "function") port.abort();
      }
    } catch {
      // Best effort cancellation
    }
  };

  if (signal && signal.aborted) {
    cancelPort();
    return classifyTransportFailure(
      Object.assign(new Error("aborted"), { name: "AbortError", code: "host-fault-cancel" }),
      { requestId }
    );
  }

  const invoker = resolvePortInvoker(port);
  if (!invoker) {
    // Passive port metadata — synthetic observation only (no invoke/run).
    const normalized = normalizeTransportOutcome({
      ok: true,
      outcome: "noop",
      value: { port_id: isRecord(port) ? port.port_id : undefined },
    });
    if (requestId != null) normalized.requestId = requestId;
    return normalized;
  }

  let timeoutId = null;
  let abortHandler = null;
  const guards = [];

  if (signal) {
    guards.push(
      new Promise((_, reject) => {
        abortHandler = () => {
          cancelPort();
          reject(Object.assign(new Error("aborted"), { name: "AbortError", code: "host-fault-cancel" }));
        };
        signal.addEventListener("abort", abortHandler, { once: true });
      })
    );
  }

  if (deadlineMs != null && deadlineMs >= 0) {
    guards.push(
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          cancelPort();
          reject(Object.assign(new Error("deadline exceeded"), { name: "TimeoutError", code: "host-fault-timeout" }));
        }, deadlineMs);
      })
    );
  }

  const cleanup = () => {
    if (timeoutId != null) clearTimeout(timeoutId);
    if (signal && abortHandler) signal.removeEventListener("abort", abortHandler);
  };

  try {
    const invokePromise = Promise.resolve().then(() => invoker(input));
    // Absorb late settlement so a losing invoke cannot raise unhandledRejection
    // after timeout/abort already won the race (caller still gets classified failure).
    invokePromise.catch(() => {});
    let raw = guards.length > 0 ? await Promise.race([invokePromise, ...guards]) : await invokePromise;
    cleanup();

    // Settle nested thenables in value — never report ok:true with a rejecting Promise inside.
    if (isRecord(raw) && raw.ok === true && isThenable(raw.value)) {
      try {
        raw = { ...raw, value: await raw.value };
      } catch (nestedErr) {
        return classifyTransportFailure(nestedErr, { requestId, portName: optsPortName(port) });
      }
    }

    if (isRecord(raw) && raw.ok === false) {
      const classified = classifyTransportFailure(raw, {
        requestId: requestId != null ? requestId : raw.requestId,
        portName: optsPortName(port),
      });
      if (requestId != null && classified.requestId == null) classified.requestId = requestId;
      return classified;
    }

    const normalized = normalizeTransportOutcome(raw);
    if (requestId != null) normalized.requestId = requestId;
    if (normalized.ok !== true) {
      return classifyTransportFailure(
        { ...normalized, failure_class: normalized.failure_class || "reject" },
        { requestId }
      );
    }
    return normalized;
  } catch (err) {
    cleanup();
    return classifyTransportFailure(err, { requestId, portName: optsPortName(port) });
  }
}

function optsPortName(port) {
  if (isRecord(port) && nonEmptyString(port.port_id)) return port.port_id;
  return undefined;
}

module.exports = {
  CAPABILITY_STATES,
  REQUIRED_TRANSPORTS,
  AUTHORITY_SURFACE_KEYS,
  FAILURE_CLASSES,
  REASON,
  createHostAdapter,
  resolveCapabilityState,
  normalizeTransportOutcome,
  validateCapabilityStates,
  evaluateEnforcementEligibility,
  transportOwnsAuthority,
  deepFreeze,
  classifyTransportFailure,
  invokeTransportAsync,
};
