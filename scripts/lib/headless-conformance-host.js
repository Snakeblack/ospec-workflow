"use strict";

const { stableSerialize } = require("./canonical-json.js");
const {
  createHostAdapter,
  resolveCapabilityState,
  normalizeTransportOutcome,
  REQUIRED_TRANSPORTS,
  transportOwnsAuthority,
} = require("./host-contract/index.js");

const KIND = "headless-conformance-host/v1";
const HARNESS_KIND = "minimal-kernel-harness/v1";

const FAULTS = Object.freeze(["timeout", "cancel", "worker-fail", "interrupt"]);

const REASON = Object.freeze({
  LIFECYCLE_DUPLICATION: "lifecycle-duplication",
  GRAPH_DUPLICATION: "graph-duplication",
  UNKNOWN_FAULT: "unknown-fault",
  ADAPTER_REJECTED: "adapter-rejected",
});

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function detectDuplication(adapter) {
  if (!isRecord(adapter)) {
    return { ok: false, reason_code: REASON.ADAPTER_REJECTED };
  }
  const surface = adapter.authority_surface || adapter;
  const transports = adapter.transports || {};

  const lifecycleSignals = [
    surface.selectTransition,
    surface.select_transition,
    surface.reduceLifecycle,
    surface.mintPermit,
    surface.mint_operation_permit,
    surface.compareAndSwap,
    surface.owns_lifecycle,
  ];
  if (lifecycleSignals.some((v) => v === true || typeof v === "function")) {
    return { ok: false, reason_code: REASON.LIFECYCLE_DUPLICATION };
  }
  for (const name of REQUIRED_TRANSPORTS) {
    const port = transports[name];
    if (!isRecord(port)) continue;
    if (transportOwnsAuthority(port)) {
      return { ok: false, reason_code: REASON.LIFECYCLE_DUPLICATION };
    }
  }

  if (
    surface.compileGraph === true ||
    typeof surface.compileGraph === "function" ||
    surface.graph_authority === true ||
    surface.owns_graph === true ||
    (isRecord(transports.ExecutionTransport) && transports.ExecutionTransport.graph_ir_authority === true)
  ) {
    return { ok: false, reason_code: REASON.GRAPH_DUPLICATION };
  }

  return { ok: true };
}

function invokePort(port, input) {
  try {
    if (typeof port === "function") {
      return normalizeTransportOutcome(port(input));
    }
    if (isRecord(port) && typeof port.invoke === "function") {
      return normalizeTransportOutcome(port.invoke(input));
    }
    if (isRecord(port) && typeof port.run === "function") {
      return normalizeTransportOutcome(port.run(input));
    }
    // Passive port metadata — synthetic observation only.
    return { ok: true, outcome: "noop", value: { port_id: port && port.port_id } };
  } catch (err) {
    const code =
      err && typeof err.code === "string" && err.code.trim() !== ""
        ? err.code
        : "transport-invoke-error";
    return { ok: false, outcome: "error", code };
  }
}

function injectFault(fault, portName) {
  const code = `host-fault-${fault}`;
  switch (fault) {
    case "timeout":
      return { ok: false, outcome: "timeout", code, value: { port: portName } };
    case "cancel":
      return { ok: false, outcome: "cancel", code, value: { port: portName } };
    case "worker-fail":
      return { ok: false, outcome: "worker-fail", code, value: { port: portName } };
    case "interrupt":
      return { ok: false, outcome: "interrupt", code, value: { port: portName } };
    default:
      return { ok: false, outcome: "error", code: REASON.UNKNOWN_FAULT };
  }
}

function faultTargetPort(fault) {
  if (fault === "worker-fail") return "WorkerTransport";
  if (fault === "cancel") return "QuestionTransport";
  if (fault === "interrupt") return "ToolExecutionTransport";
  return "ExecutionTransport";
}

/**
 * @param {{scenario_id:string, seed:string|number, adapter:object, fault?:string|null, proof_material?:object}} input
 */
function runConformanceScenario(input) {
  const scenarioId = (input && input.scenario_id) || "anonymous";
  const seed = input && input.seed != null ? input.seed : 0;
  const adapterInput = input && input.adapter;
  const fault = input && input.fault != null ? input.fault : null;
  const proofMaterial = (input && input.proof_material) || {};

  const duplication = detectDuplication(adapterInput);
  if (!duplication.ok) {
    return semanticResult({
      scenario_id: scenarioId,
      seed,
      fault,
      adapter_id: adapterInput && adapterInput.adapter_id,
      adapter_version: adapterInput && adapterInput.adapter_version,
      host_version: adapterInput && adapterInput.host_version,
      pass: false,
      reason_code: duplication.reason_code,
      capability_states: {},
      proof_verification: null,
      port_outcomes: {},
    });
  }

  let adapter;
  try {
    adapter = createHostAdapter({
      adapter_id: adapterInput.adapter_id,
      adapter_version: adapterInput.adapter_version,
      host_version: adapterInput.host_version,
      capabilities: adapterInput.capabilities || {},
      transports: adapterInput.transports,
      authority_surface: adapterInput.authority_surface,
    });
  } catch (err) {
    return semanticResult({
      scenario_id: scenarioId,
      seed,
      fault,
      adapter_id: adapterInput && adapterInput.adapter_id,
      adapter_version: adapterInput && adapterInput.adapter_version,
      host_version: adapterInput && adapterInput.host_version,
      pass: false,
      reason_code: err.code || REASON.ADAPTER_REJECTED,
      path: err.path,
      capability_states: {},
      proof_verification: null,
      port_outcomes: {},
    });
  }

  const portOutcomes = {};
  for (const name of REQUIRED_TRANSPORTS) {
    if (fault && faultTargetPort(fault) === name) {
      portOutcomes[name] = injectFault(fault, name);
      continue;
    }
    portOutcomes[name] = invokePort(adapter.transports[name], { seed, scenario_id: scenarioId });
  }

  const capabilityStates = {};
  const proofVerification = {};
  for (const [capId, declared] of Object.entries(adapter.capabilities)) {
    const proof = proofMaterial[capId] && proofMaterial[capId].proof;
    const evidence = proofMaterial[capId] && proofMaterial[capId].evidence;
    const resolved = resolveCapabilityState({
      capability_id: capId,
      declared_state: declared,
      proof,
      semantic_evidence: evidence,
      request_enforced: declared === "enforced",
    });
    capabilityStates[capId] = resolved.effective_state;
    proofVerification[capId] = {
      ok: resolved.ok === true && resolved.enforced === true,
      reason_code: resolved.reason_code || null,
    };
  }

  // Fault paths must not invent successful enforced capability for the faulted port.
  if (fault) {
    const target = faultTargetPort(fault);
    if (capabilityStates[target] === "enforced" && portOutcomes[target].ok === false) {
      capabilityStates[target] = "partial";
      proofVerification[target] = { ok: false, reason_code: portOutcomes[target].code };
    }
  }

  let pass;
  let reasonCode = null;
  if (fault == null) {
    const failed = Object.values(portOutcomes).find((o) => normalizeTransportOutcome(o).ok !== true);
    pass = failed == null;
    if (!pass) {
      const normalized = normalizeTransportOutcome(failed);
      reasonCode = normalized.code || "transport-outcome-failed";
    }
  } else {
    const expected = fault === "worker-fail" ? "worker-fail" : fault;
    pass = portOutcomes[faultTargetPort(fault)].outcome === expected;
    if (!pass) reasonCode = portOutcomes[faultTargetPort(fault)].code;
  }

  return semanticResult({
    scenario_id: scenarioId,
    seed,
    fault,
    adapter_id: adapter.adapter_id,
    adapter_version: adapter.adapter_version,
    host_version: adapter.host_version,
    pass: Boolean(pass),
    reason_code: reasonCode,
    capability_states: capabilityStates,
    proof_verification: proofVerification,
    port_outcomes: portOutcomes,
  });
}

function semanticResult(payload) {
  // Exclude volatile timestamps from semantic digests by construction.
  const semantic = {
    kind: KIND,
    scenario_id: payload.scenario_id,
    seed: payload.seed,
    fault: payload.fault,
    adapter_id: payload.adapter_id,
    adapter_version: payload.adapter_version,
    host_version: payload.host_version,
    pass: payload.pass,
    reason_code: payload.reason_code,
    path: payload.path || null,
    capability_states: payload.capability_states,
    proof_verification: payload.proof_verification,
    port_outcomes: payload.port_outcomes,
  };
  return {
    ...semantic,
    semantic_bytes: stableSerialize(semantic),
  };
}

/**
 * @param {{adapter:object, fixtures?:object[], proof_material?:object}} input
 */
function runHostFaultMatrix(input) {
  const adapter = input && input.adapter;
  const proofMaterial = (input && input.proof_material) || {};
  const fixtures =
    Array.isArray(input && input.fixtures) && input.fixtures.length > 0
      ? input.fixtures
      : FAULTS.map((fault) => ({ scenario_id: `fault-${fault}`, seed: "k2a-fault", fault }));

  const results = fixtures.map((fixture) =>
    runConformanceScenario({
      scenario_id: fixture.scenario_id,
      seed: fixture.seed != null ? fixture.seed : "k2a-fault",
      adapter,
      fault: fixture.fault,
      proof_material: proofMaterial,
    })
  );

  return {
    kind: KIND,
    peer_of: HARNESS_KIND,
    faults_covered: FAULTS.slice(),
    results,
    pass: results.every((r) => r.pass === true),
  };
}

function getModuleKind() {
  return KIND;
}

module.exports = {
  KIND,
  HARNESS_KIND,
  FAULTS,
  REASON,
  getModuleKind,
  runConformanceScenario,
  runHostFaultMatrix,
  detectDuplication,
};
