"use strict";

const path = require("node:path");
const fs = require("node:fs");
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
  "ToolExecutionTransport",
  "DeliveryGateTransport",
]);

/** @deprecated use TRANSPORT_CAPABILITIES — enforced only after live probe */
const ENFORCED_CAPABILITIES = TRANSPORT_CAPABILITIES;

const PRIMITIVE_FOR_CAPABILITY = Object.freeze({
  ExecutionTransport: "execute",
  QuestionTransport: "askUserQuestion",
  WorkerTransport: "worker",
  ToolExecutionTransport: "tool",
  DeliveryGateTransport: "hooksObserve",
});

const PROBE_CHALLENGES = Object.freeze({
  ExecutionTransport: Object.freeze({ probe: true, capability: "ExecutionTransport" }),
  QuestionTransport: Object.freeze({ prompt: "probe?", probe: true }),
  WorkerTransport: Object.freeze({ probe: true, parallel: true }),
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
    ToolExecutionTransport: "tool-execution-transport.json",
    DeliveryGateTransport: "delivery-gate-transport.json",
  };
  return map[capabilityId];
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
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
        return settlePrimitiveOutcome(primitives.worker(input));
      }
      return { ok: true, outcome: "ok", value: { delegation: "Agent" } };
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
 * Execute a live probe by invoking the real port and observing the TransportOutcome.
 * Caller-supplied declarative payloads never authorize enforced.
 */
async function executeLiveProbe(port, capabilityId) {
  const challenge = PROBE_CHALLENGES[capabilityId] || { probe: true, capability_id: capabilityId };
  const outcome = await invokeTransportAsync(port, {
    requestId: `probe:${capabilityId}`,
    input: challenge,
  });
  if (!outcome || outcome.ok !== true) {
    return { ok: false, outcome };
  }
  const probe = {
    capability_id: capabilityId,
    observed: true,
    outcome: outcome.outcome || "ok",
    value_digest: sha256Fingerprint("probe:observation-value", {
      value: outcome.value === undefined ? null : outcome.value,
    }),
    requestId: outcome.requestId || `probe:${capabilityId}`,
  };
  return { ok: true, probe, outcome };
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

    const observation = await executeLiveProbe(transports[id], id);
    if (!observation.ok) {
      capabilities[id] = "partial";
      continue;
    }

    const expectedProbeDigest = independentExpectedProbeDigest(id, observation.probe);
    const material = buildEvidence(id, observation.probe);
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
  createClaudeHostAdapter,
  getClaudeProofMaterial,
  verifyAllClaudeEnforcedProofs,
  buildEvidence,
  executeLiveProbe,
  getProbeObservations,
  invokeTransportAsync,
};
