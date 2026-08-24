"use strict";

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { createHostAdapter, invokeTransportAsync } = require("../host-contract/index.js");
const {
  createEvidenceDigest,
  createProbeDigest,
  verifyCapabilityProof,
} = require("../capability-proof/index.js");
const { sha256Fingerprint } = require("../canonical-json.js");
const profile = require("../target-profiles/claude.js");

const ADAPTER_ID = "claude";
const ADAPTER_VERSION = "1.0.0";
const HOST_VERSION = "k2a-host/1";

const FIXTURE_DIR = path.join(__dirname, "claude", "fixtures");

const TRANSPORT_CAPABILITIES = Object.freeze([
  "ExecutionTransport",
  "QuestionTransport",
  "WorkerTransport",
  "WorkerIsolation",
  "ToolExecutionTransport",
  "DeliveryGateTransport",
]);

/** @deprecated use TRANSPORT_CAPABILITIES — enforced only after live probe */
const ENFORCED_CAPABILITIES = TRANSPORT_CAPABILITIES;

const PRIMITIVE_FOR_CAPABILITY = Object.freeze({
  ExecutionTransport: "execute",
  QuestionTransport: "askUserQuestion",
  WorkerTransport: "worker",
  WorkerIsolation: "workerIsolation",
  ToolExecutionTransport: "tool",
  DeliveryGateTransport: "hooksObserve",
});

const PROBE_CHALLENGES = Object.freeze({
  ExecutionTransport: Object.freeze({ probe: true, capability: "ExecutionTransport" }),
  QuestionTransport: Object.freeze({ prompt: "probe?", probe: true }),
  WorkerTransport: Object.freeze({ probe: true, parallel: true }),
  WorkerIsolation: Object.freeze({ probe: true, isolation: true }),
  ToolExecutionTransport: Object.freeze({ probe: true, tool: "probe" }),
  DeliveryGateTransport: Object.freeze({ probe: true, hook: "Stop" }),
});

/** @type {WeakMap<object, object>} */
const probeObservationsByAdapter = new WeakMap();

function getProbeObservations(adapter) {
  return probeObservationsByAdapter.get(adapter) || null;
}

function loadFixture(name) {
  const file = path.join(FIXTURE_DIR, name);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function fixtureMap(capabilityId) {
  const map = {
    ExecutionTransport: "execution-transport.json",
    QuestionTransport: "question-transport.json",
    WorkerTransport: "worker-transport.json",
    WorkerIsolation: "worker-isolation.json",
    ToolExecutionTransport: "tool-execution-transport.json",
    DeliveryGateTransport: "delivery-gate-transport.json",
  };
  return map[capabilityId];
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

const ORACLE_REASON = Object.freeze({
  PROBE_NOT_OK: "oracle-probe-not-executed",
  UNKNOWN_CAPABILITY: "oracle-unknown-capability",
  VALUE_NOT_RECORD: "oracle-value-not-record",
  MISSING_EXECUTION_ID: "oracle-missing-execution-id",
  QUESTION_NOT_ANSWERED: "oracle-question-not-answered",
  MISSING_CORRELATION_ID: "oracle-missing-correlation-id",
  MISSING_WORKER_ID: "oracle-missing-worker-id",
  CONTAINMENT_NOT_DEMONSTRATED: "oracle-containment-not-demonstrated",
  MISSING_TOOL_IDENTITY: "oracle-missing-tool-identity",
  DELIVERY_AUTHORIZATION_CLAIMED: "oracle-delivery-authorization-claimed",
});

const CAPABILITY_ORACLES = Object.freeze({
  ExecutionTransport(value) {
    return nonEmptyString(value.execution_id)
      ? { ok: true }
      : { ok: false, reason_code: ORACLE_REASON.MISSING_EXECUTION_ID };
  },
  QuestionTransport(value) {
    if (value.answered !== true) {
      return { ok: false, reason_code: ORACLE_REASON.QUESTION_NOT_ANSWERED };
    }
    // A correlation id is what distinguishes an answered question from a bare
    // truthy flag: it binds the answer to the request that produced it.
    return nonEmptyString(value.request_id) || nonEmptyString(value.correlation_id)
      ? { ok: true }
      : { ok: false, reason_code: ORACLE_REASON.MISSING_CORRELATION_ID };
  },
  WorkerTransport(value) {
    return nonEmptyString(value.worker_id)
      ? { ok: true }
      : { ok: false, reason_code: ORACLE_REASON.MISSING_WORKER_ID };
  },
  // La contención solo se acepta si el host la observó: un payload declarativo
  // del propio worker nunca demuestra aislamiento (transport ≠ isolation).
  WorkerIsolation(value) {
    const containment = value && value.containment;
    const contained =
      isRecord(containment) &&
      containment.allowed_write === "PASS" &&
      containment.undeclared_workspace_write === "BLOCKED" &&
      containment.external_root_write === "BLOCKED";
    return contained && value.host_observed === true
      ? { ok: true }
      : { ok: false, reason_code: ORACLE_REASON.CONTAINMENT_NOT_DEMONSTRATED };
  },
  ToolExecutionTransport(value) {
    return nonEmptyString(value.tool)
      ? { ok: true }
      : { ok: false, reason_code: ORACLE_REASON.MISSING_TOOL_IDENTITY };
  },
  DeliveryGateTransport(value) {
    return value.authorizes_delivery === false
      ? { ok: true }
      : { ok: false, reason_code: ORACLE_REASON.DELIVERY_AUTHORIZATION_CLAIMED };
  },
});

/**
 * Semantic capability oracle: a port that merely executed has not demonstrated
 * the capability. Only a probe whose observed value carries the capability's
 * semantic marker may authorize `enforced`; anything else stays `partial`.
 *
 * The QuestionTransport correlation id may be an echo of the probe requestId,
 * as long as the primitive surfaces it as `request_id`/`correlation_id`.
 *
 * @param {string} capabilityId
 * @param {object} outcome observed TransportOutcome
 * @returns {{ok:boolean, reason_code?:string}}
 */
function evaluateCapabilityOracle(capabilityId, outcome) {
  const oracle = CAPABILITY_ORACLES[capabilityId];
  if (typeof oracle !== "function") {
    return { ok: false, reason_code: ORACLE_REASON.UNKNOWN_CAPABILITY };
  }
  if (!isRecord(outcome) || outcome.ok !== true) {
    return { ok: false, reason_code: ORACLE_REASON.PROBE_NOT_OK };
  }
  if (!isRecord(outcome.value)) {
    return { ok: false, reason_code: ORACLE_REASON.VALUE_NOT_RECORD };
  }
  return oracle(outcome.value);
}

/**
 * Independent live-probe digest — computed from observed probe payload + identity,
 * never read back from a proof field for authority decisions.
 */
function independentExpectedProbeDigest(capabilityId, probePayload) {
  const probe =
    probePayload !== undefined
      ? probePayload
      : { instructional: true, capability_id: capabilityId };
  return createProbeDigest({
    capability_id: capabilityId,
    adapter_id: ADAPTER_ID,
    adapter_version: ADAPTER_VERSION,
    host_version: HOST_VERSION,
    probe,
  });
}

function buildEvidence(capabilityId, probePayload) {
  const mapName = fixtureMap(capabilityId);
  const fixtureRel = `scripts/lib/host-adapters/claude/fixtures/${mapName}`;
  const evidence = loadFixture(mapName);
  const digest = createEvidenceDigest({
    capability_id: capabilityId,
    adapter_version: ADAPTER_VERSION,
    host_version: HOST_VERSION,
    fixture: fixtureRel,
    evidence,
  });
  const probe =
    probePayload !== undefined
      ? probePayload
      : { instructional: true, capability_id: capabilityId };
  const probe_digest = independentExpectedProbeDigest(capabilityId, probePayload);
  return {
    fixture: fixtureRel,
    evidence,
    probe,
    proof: {
      schema_version: 1,
      kind: "capability-proof/v1",
      adapter_id: ADAPTER_ID,
      adapter_version: ADAPTER_VERSION,
      host_version: HOST_VERSION,
      fixture: fixtureRel,
      evidence_digest: digest,
      probe_digest,
    },
  };
}

function makePort(portId, handler) {
  return {
    port_id: portId,
    invoke:
      typeof handler === "function"
        ? async (input) => handler(input)
        : async () => ({ ok: true, outcome: "ok", value: { port_id: portId } }),
  };
}

/**
 * Normalize a primitive return into a TransportOutcome, awaiting thenables.
 * Never wraps a rejecting Promise as ok:true.
 */
async function settlePrimitiveOutcome(raw, { defaultOutcome = "ok" } = {}) {
  const settled = await Promise.resolve(raw);
  if (isRecord(settled) && typeof settled.ok === "boolean") {
    return settled;
  }
  return { ok: true, outcome: defaultOutcome, value: settled };
}

function resolveHonestState(capabilityId, primitives) {
  const key = PRIMITIVE_FOR_CAPABILITY[capabilityId];
  if (typeof primitives[key] !== "function") {
    if (capabilityId === "DeliveryGateTransport") return "instructional";
    if (capabilityId === "QuestionTransport") return "instructional";
    return "unavailable";
  }
  return "partial";
}

function hasHostPrimitive(capabilityId, primitives) {
  const key = PRIMITIVE_FOR_CAPABILITY[capabilityId];
  return typeof primitives[key] === "function";
}

function buildTransports(primitives) {
  return {
    ExecutionTransport: makePort("claude-execution", async (input) => {
      if (typeof primitives.execute === "function") {
        return settlePrimitiveOutcome(primitives.execute(input, { requestId: "claude-execution" }));
      }
      return { ok: true, outcome: "ok", value: { toolMap: profile.toolMap } };
    }),
    QuestionTransport: makePort("claude-question", async (input) => {
      if (typeof primitives.askUserQuestion === "function") {
        return settlePrimitiveOutcome(primitives.askUserQuestion(input));
      }
      return {
        ok: true,
        outcome: "ok",
        value: {
          mapped_from: "AskUserQuestion",
          tool: profile.toolMap["vscode/askQuestions"],
        },
      };
    }),
    WorkerTransport: makePort("claude-worker", async (input) => {
      if (typeof primitives.worker === "function") {
        return settlePrimitiveOutcome(primitives.worker(input, { workerIsolation: primitives.workerIsolation }));
      }
      if (typeof primitives.workerIsolation === "function" && input && (input.command || input.attempts)) {
        return settlePrimitiveOutcome(primitives.workerIsolation(input));
      }
      return { ok: true, outcome: "ok", value: { delegation: "Agent" } };
    }),
    WorkerIsolation: makePort("claude-worker-isolation", async (input) => {
      if (typeof primitives.workerIsolation === "function") {
        return settlePrimitiveOutcome(primitives.workerIsolation(input));
      }
      // Sin primitiva de aislamiento no hay demostración posible: fallo honesto.
      return {
        ok: false,
        outcome: "error",
        value: { reason: "no-worker-isolation-primitive" },
      };
    }),
    ToolExecutionTransport: makePort("claude-tool", async (input) => {
      if (typeof primitives.tool === "function") {
        return settlePrimitiveOutcome(primitives.tool(input));
      }
      return { ok: true, outcome: "ok", value: { tools: profile.toolMap } };
    }),
    DeliveryGateTransport: makePort("claude-delivery-gate", async (input) => {
      if (typeof primitives.hooksObserve === "function") {
        return settlePrimitiveOutcome(primitives.hooksObserve(input), {
          defaultOutcome: "observation",
        });
      }
      return {
        ok: true,
        outcome: "observation",
        value: {
          hooks_shape: profile.hooks,
          authorizes_delivery: false,
        },
      };
    }),
  };
}

/**
 * Execute a live probe by invoking the real port and observing the TransportOutcome,
 * then require the semantic oracle for that capability to pass.
 * Caller-supplied declarative payloads never authorize enforced.
 */
async function executeLiveProbe(port, capabilityId) {
  const challenge = PROBE_CHALLENGES[capabilityId] || { probe: true, capability_id: capabilityId };
  const outcome = await invokeTransportAsync(port, {
    requestId: `probe:${capabilityId}`,
    input: challenge,
  });
  if (!outcome || outcome.ok !== true) {
    return { ok: false, reason_code: ORACLE_REASON.PROBE_NOT_OK, outcome };
  }
  const oracle = evaluateCapabilityOracle(capabilityId, outcome);
  if (!oracle.ok) {
    return { ok: false, reason_code: oracle.reason_code, outcome };
  }
  const probe = {
    capability_id: capabilityId,
    observed: true,
    outcome: outcome.outcome || "ok",
    semantic_oracle: "pass",
    value_digest: sha256Fingerprint("probe:observation-value", {
      value: outcome.value === undefined ? null : outcome.value,
    }),
    requestId: outcome.requestId || `probe:${capabilityId}`,
  };
  return { ok: true, probe, outcome };
}

/**
 * Ejecuta una prueba REAL de contención de filesystem con observación del host.
 *
 * El protocolo crea un workspace temporal con un subdirectorio `allowed/` y un
 * directorio externo hermano (fuera de la raíz del workspace). El worker recibe
 * tres intentos de escritura y debe honrar su frontera de sandbox; la autoridad
 * de la observación es siempre del HOST, que comprueba la existencia real de
 * los ficheros — nunca una declaración del propio worker:
 *
 *   write en ruta permitida (allowed/)              → PASS requerido
 *   write en ruta no declarada dentro del workspace → BLOCKED requerido
 *   write fuera de la raíz del workspace            → BLOCKED requerido
 *
 * @param {object} port puerto WorkerIsolation del adapter
 * @returns {Promise<{ok:boolean, reason_code?:string, probe?:object}>}
 */
async function executeWorkerIsolationProbe(port) {
  const externalRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-iso-external-"));
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-iso-ws-"));
  try {
    const allowedDir = path.join(workspaceRoot, "allowed");
    fs.mkdirSync(allowedDir, { recursive: true });
    const attempts = [
      { id: "allowed_write", path: path.join(allowedDir, "probe-allowed.txt"), content: "probe" },
      { id: "undeclared_workspace_write", path: path.join(workspaceRoot, "undeclared.txt"), content: "probe" },
      { id: "external_root_write", path: path.join(externalRoot, "escape.txt"), content: "probe" },
    ];

    const outcome = await invokeTransportAsync(port, {
      requestId: "probe:WorkerIsolation",
      input: {
        probe: true,
        isolation: true,
        workspace_root: workspaceRoot,
        attempts,
      },
    });
    if (!outcome || outcome.ok !== true) {
      return { ok: false, reason_code: ORACLE_REASON.PROBE_NOT_OK };
    }

    // Observación autoritativa del host: existencia real de los ficheros.
    const containment = {
      allowed_write: fs.existsSync(attempts[0].path) ? "PASS" : "FAIL",
      undeclared_workspace_write: fs.existsSync(attempts[1].path) ? "LEAKED" : "BLOCKED",
      external_root_write: fs.existsSync(attempts[2].path) ? "LEAKED" : "BLOCKED",
    };
    const contained =
      containment.allowed_write === "PASS" &&
      containment.undeclared_workspace_write === "BLOCKED" &&
      containment.external_root_write === "BLOCKED";

    if (!contained) {
      return {
        ok: false,
        reason_code: ORACLE_REASON.CONTAINMENT_NOT_DEMONSTRATED,
        probe: { capability_id: "WorkerIsolation", observed: true, host_observed: true, containment },
      };
    }

    const probe = {
      capability_id: "WorkerIsolation",
      observed: true,
      host_observed: true,
      outcome: outcome.outcome || "ok",
      semantic_oracle: "pass",
      containment,
      value_digest: sha256Fingerprint("probe:observation-value", {
        value: outcome.value === undefined ? null : outcome.value,
      }),
      requestId: outcome.requestId || "probe:WorkerIsolation",
    };
    return { ok: true, probe };
  } finally {
    try { fs.rmSync(workspaceRoot, { recursive: true, force: true }); } catch {}
    try { fs.rmSync(externalRoot, { recursive: true, force: true }); } catch {}
  }
}

/**
 * Compose Claude HostAdapter from target profile + injected host primitives.
 *
 * `enforced` requires ALL of: (1) a real host primitive, (2) a successfully
 * *executed* live probe through the port (observed TransportOutcome), and
 * (3) CapabilityProof verification against an independent expectedProbeDigest
 * derived from that observation — never from a caller-supplied liveProbes blob.
 *
 * `options.liveProbes` is ignored for enforcement (legacy callers must migrate).
 *
 * @returns {Promise<object>} HostAdapter
 */
async function createClaudeHostAdapter(options = {}) {
  const primitives = options.primitives || {};
  // liveProbes intentionally ignored for enforcement authority.
  void options.liveProbes;

  const transports = buildTransports(primitives);
  const capabilities = {};
  const probeObservations = {};

  for (const id of TRANSPORT_CAPABILITIES) {
    if (!hasHostPrimitive(id, primitives)) {
      capabilities[id] = resolveHonestState(id, primitives);
      continue;
    }

    // Probe failure or an unmet semantic oracle both stop at partial: the
    // primitive exists but the capability was never demonstrated.
    const observation =
      id === "WorkerIsolation"
        ? await executeWorkerIsolationProbe(transports[id])
        : await executeLiveProbe(transports[id], id);
    if (!observation.ok) {
      capabilities[id] = "partial";
      continue;
    }

    const expectedProbeDigest = independentExpectedProbeDigest(id, observation.probe);
    const material = buildEvidence(id, observation.probe);
    if (id === "WorkerIsolation") {
      // La evidencia verificada es la observación VIVA del host, no el fixture:
      // así el mismo objeto que pasa verificación de digest es el que K6a lee
      // para extraer la contención demostrada (sin propiedades ad-hoc).
      material.evidence = {
        surface: "worker-isolation",
        host_observed: true,
        containment: observation.probe.containment,
      };
      material.proof = {
        ...material.proof,
        evidence_digest: createEvidenceDigest({
          capability_id: id,
          adapter_version: ADAPTER_VERSION,
          host_version: HOST_VERSION,
          fixture: material.fixture,
          evidence: material.evidence,
        }),
      };
    }
    const verification = verifyCapabilityProof({
      capabilityId: id,
      expectedAdapterId: ADAPTER_ID,
      expectedAdapterVersion: ADAPTER_VERSION,
      expectedHostRuntimeVersion: HOST_VERSION,
      expectedProbeDigest,
      proof: material.proof,
      evidence: material.evidence,
    });
    capabilities[id] = verification.ok ? "enforced" : resolveHonestState(id, primitives);
    if (verification.ok) {
      probeObservations[id] = {
        ...material,
        expectedProbeDigest,
        observation: observation.probe,
      };
    }
  }

  // Identidad canónica del adapter sobre los transports verificados: permite a
  // K6a casar transport ↔ CapabilityProof sin mocks intermedios (integración
  // K2a real → K6a). Los transports no verificados quedan sin identidad.
  for (const id of TRANSPORT_CAPABILITIES) {
    const obs = probeObservations[id];
    if (obs && obs.proof) {
      transports[id].adapter_id = ADAPTER_ID;
      transports[id].capability_id = id;
      transports[id].probe_digest = obs.proof.probe_digest;
    }
  }

  const adapter = createHostAdapter({
    adapter_id: ADAPTER_ID,
    adapter_version: ADAPTER_VERSION,
    host_version: HOST_VERSION,
    capabilities,
    transports,
  });
  probeObservationsByAdapter.set(adapter, Object.freeze(probeObservations));
  return adapter;
}

/**
 * Proof material for callers. When primitives are supplied, runs live probes and
 * returns observation-backed material. Declarative liveProbes alone never authorize.
 */
async function getClaudeProofMaterial(options = {}) {
  const liveProbes = options && options.liveProbes ? options.liveProbes : null;
  const primitives = options && options.primitives ? options.primitives : null;

  // Legacy signature: getClaudeProofMaterial(liveProbesMap)
  const legacyMap =
    liveProbes == null && options && !options.primitives && !options.liveProbes && typeof options === "object"
      ? Object.keys(options).some((k) => TRANSPORT_CAPABILITIES.includes(k))
        ? options
        : null
      : liveProbes;

  if (primitives) {
    const adapter = await createClaudeHostAdapter({ primitives });
    const observations = getProbeObservations(adapter) || {};
    const material = {};
    for (const id of TRANSPORT_CAPABILITIES) {
      const obs = observations[id];
      if (obs) {
        material[id] = obs;
      } else {
        material[id] = buildEvidence(id, undefined);
      }
    }
    return material;
  }

  // Without primitives, only fixture/instructional material — never enforced.
  const material = {};
  for (const id of TRANSPORT_CAPABILITIES) {
    // Ignore declarative legacyMap for expectedProbeDigest authority.
    void legacyMap;
    material[id] = buildEvidence(id, undefined);
  }
  return material;
}

/**
 * Verify proofs under executed probes. Declarative liveProbes without primitives
 * do not authorize enforced.
 */
async function verifyAllClaudeEnforcedProofs(options = {}) {
  const primitives = options.primitives || null;
  const liveProbes = options.liveProbes || null;

  if (!primitives) {
    return { ok: false, reason_code: "fixture-only-not-live-probe", results: {} };
  }
  // liveProbes alone are not authority — require executed probes via primitives.
  void liveProbes;

  const material = await getClaudeProofMaterial({ primitives });
  const results = {};
  for (const id of TRANSPORT_CAPABILITIES) {
    const entry = material[id];
    if (!entry || !entry.expectedProbeDigest) {
      results[id] = { ok: false, reason_code: "probe-not-executed" };
      continue;
    }
    results[id] = verifyCapabilityProof({
      capabilityId: id,
      expectedAdapterId: ADAPTER_ID,
      expectedAdapterVersion: ADAPTER_VERSION,
      expectedHostRuntimeVersion: HOST_VERSION,
      expectedProbeDigest: entry.expectedProbeDigest,
      proof: entry.proof,
      evidence: entry.evidence,
    });
  }
  return {
    ok: Object.values(results).every((r) => r.ok),
    results,
  };
}

module.exports = {
  ADAPTER_ID,
  ADAPTER_VERSION,
  HOST_VERSION,
  ENFORCED_CAPABILITIES,
  TRANSPORT_CAPABILITIES,
  PROBE_CHALLENGES,
  ORACLE_REASON,
  evaluateCapabilityOracle,
  createClaudeHostAdapter,
  getClaudeProofMaterial,
  verifyAllClaudeEnforcedProofs,
  buildEvidence,
  executeLiveProbe,
  executeWorkerIsolationProbe,
  getProbeObservations,
  invokeTransportAsync,
};
