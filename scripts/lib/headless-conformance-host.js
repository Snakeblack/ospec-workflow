"use strict";

const { stableSerialize } = require("./canonical-json.js");
const {
  createHostAdapter,
  resolveCapabilityState,
  normalizeTransportOutcome,
  REQUIRED_TRANSPORTS,
  transportOwnsAuthority,
  invokeTransportAsync,
} = require("./host-contract/index.js");

const KIND = "headless-conformance-host/v1";
const HARNESS_KIND = "minimal-kernel-harness/v1";

const FAULTS = Object.freeze(["timeout", "cancel", "worker-fail", "interrupt"]);

const REASON = Object.freeze({
  LIFECYCLE_DUPLICATION: "lifecycle-duplication",
  GRAPH_DUPLICATION: "graph-duplication",
  UNKNOWN_FAULT: "unknown-fault",
  ADAPTER_REJECTED: "adapter-rejected",
  SYNTHETIC_INJECT_ALONE: "synthetic-inject-alone",
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

/**
 * Synthetic inject helper — factory for expected fault shapes / failing wrappers.
 * Alone does NOT satisfy fault-matrix coverage.
 */
function injectFault(fault, portName) {
  const code = `host-fault-${fault}`;
  switch (fault) {
    case "timeout":
      return { ok: false, outcome: "timeout", failure_class: "timeout", code, value: { port: portName } };
    case "cancel":
      return { ok: false, outcome: "cancel", failure_class: "cancel", code, value: { port: portName } };
    case "worker-fail":
      return {
        ok: false,
        outcome: "worker-fail",
        failure_class: "worker-fail",
        code,
        value: { port: portName },
      };
    case "interrupt":
      return {
        ok: false,
        outcome: "interrupt",
        failure_class: "interrupt",
        code,
        value: { port: portName },
      };
    default:
      return { ok: false, outcome: "error", failure_class: "reject", code: REASON.UNKNOWN_FAULT };
  }
}

function faultTargetPort(fault) {
  if (fault === "worker-fail") return "WorkerTransport";
  if (fault === "cancel") return "QuestionTransport";
  if (fault === "interrupt") return "ToolExecutionTransport";
  return "ExecutionTransport";
}

/**
 * Install a failing port wrapper that surfaces the fault through invokeTransportAsync.
 */
function createFailingPortWrapper(fault, portName, originalPort) {
  const synthetic = injectFault(fault, portName);
  const portId = (isRecord(originalPort) && originalPort.port_id) || portName;
  return {
    port_id: portId,
    async invoke() {
      if (fault === "timeout") {
        throw Object.assign(new Error("deadline exceeded"), {
          name: "TimeoutError",
          code: synthetic.code,
          failure_class: "timeout",
        });
      }
      if (fault === "cancel") {
        throw Object.assign(new Error("aborted"), {
          name: "AbortError",
          code: synthetic.code,
          failure_class: "cancel",
        });
      }
      if (fault === "interrupt") {
        throw Object.assign(new Error("interrupt"), {
          code: synthetic.code,
          failure_class: "interrupt",
        });
      }
      if (fault === "worker-fail") {
        throw Object.assign(new Error("worker-fail"), {
          code: synthetic.code,
          failure_class: "worker-fail",
        });
      }
      return synthetic;
    },
  };
}

/**
 * Coverage is incomplete when only synthetic injectFault bypasses published ports.
 */
function evaluateFaultMatrixCoverage({ port_invocations = [], synthetic_only = false } = {}) {
  if (synthetic_only || port_invocations.length === 0) {
    return {
      complete: false,
      reason_code: REASON.SYNTHETIC_INJECT_ALONE,
    };
  }
  return { complete: true, reason_code: null };
}

/**
 * @param {{scenario_id:string, seed:string|number, adapter:object, fault?:string|null, proof_material?:object}} input
 */
async function runConformanceScenario(input) {
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
      port_traversal: false,
    });
  }

  const transports = { ...(adapterInput.transports || {}) };
  let portTraversal = false;
  if (fault) {
    const target = faultTargetPort(fault);
    transports[target] = createFailingPortWrapper(fault, target, transports[target]);
  }

  let adapter;
  try {
    adapter = createHostAdapter({
      adapter_id: adapterInput.adapter_id,
      adapter_version: adapterInput.adapter_version,
      host_version: adapterInput.host_version,
      capabilities: adapterInput.capabilities || {},
      transports,
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
      port_traversal: false,
    });
  }

  const portOutcomes = {};
  for (const name of REQUIRED_TRANSPORTS) {
    const outcome = await invokeTransportAsync(adapter.transports[name], {
      requestId: `${scenarioId}:${name}`,
      input: { seed, scenario_id: scenarioId },
    });
    portOutcomes[name] = outcome;
    if (fault && faultTargetPort(fault) === name) {
      portTraversal = true;
    }
  }

  const capabilityStates = {};
  const proofVerification = {};
  for (const [capId, declared] of Object.entries(adapter.capabilities)) {
    const entry = proofMaterial[capId] || {};
    const resolved = resolveCapabilityState({
      capability_id: capId,
      declared_state: declared,
      proof: entry.proof,
      semantic_evidence: entry.evidence,
      request_enforced: declared === "enforced",
      expectedAdapterId: entry.expectedAdapterId || adapter.adapter_id,
      expectedAdapterVersion: entry.expectedAdapterVersion || adapter.adapter_version,
      expectedHostRuntimeVersion: entry.expectedHostRuntimeVersion || adapter.host_version,
      // Independent expectedProbeDigest required — never fall back to proof.probe_digest
      // (self-consistent proof must not authenticate without an external digest bind).
      expectedProbeDigest: entry.expectedProbeDigest,
    });
    capabilityStates[capId] = resolved.effective_state;
    proofVerification[capId] = {
      ok: resolved.ok === true && resolved.enforced === true,
      reason_code: resolved.reason_code || null,
    };
  }

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
    const failed = Object.values(portOutcomes).find((o) => o.ok !== true);
    pass = failed == null;
    if (!pass) {
      reasonCode = failed.code || failed.failure_class || "transport-outcome-failed";
    }
  } else {
    const target = faultTargetPort(fault);
    const expected = fault === "worker-fail" ? "worker-fail" : fault;
    const observed = portOutcomes[target];
    pass =
      observed.ok === false &&
      (observed.outcome === expected || observed.failure_class === expected);
    if (!pass) reasonCode = observed.code || observed.failure_class;
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
    port_traversal: portTraversal,
  });
}

function semanticResult(payload) {
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
    port_traversal: payload.port_traversal === true,
  };
  return {
    ...semantic,
    semantic_bytes: stableSerialize(semantic),
  };
}

/**
 * @param {{adapter:object, fixtures?:object[], proof_material?:object}} input
 */
async function runHostFaultMatrix(input) {
  const adapter = input && input.adapter;
  const proofMaterial = (input && input.proof_material) || {};
  const fixtures =
    Array.isArray(input && input.fixtures) && input.fixtures.length > 0
      ? input.fixtures
      : FAULTS.map((fault) => ({ scenario_id: `fault-${fault}`, seed: "k2a-fault", fault }));

  const results = [];
  for (const fixture of fixtures) {
    results.push(
      await runConformanceScenario({
        scenario_id: fixture.scenario_id,
        seed: fixture.seed != null ? fixture.seed : "k2a-fault",
        adapter,
        fault: fixture.fault,
        proof_material: proofMaterial,
      })
    );
  }

  const coverage = evaluateFaultMatrixCoverage({
    port_invocations: results.filter((r) => r.port_traversal === true),
    synthetic_only: results.every((r) => r.port_traversal !== true),
  });

  return {
    kind: KIND,
    peer_of: HARNESS_KIND,
    faults_covered: FAULTS.slice(),
    results,
    coverage,
    pass: results.every((r) => r.pass === true) && coverage.complete === true,
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
  injectFault,
  evaluateFaultMatrixCoverage,
  createFailingPortWrapper,
  faultTargetPort,
  normalizeTransportOutcome,
};
