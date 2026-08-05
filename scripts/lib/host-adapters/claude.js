"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { createHostAdapter, invokeTransportAsync } = require("../host-contract/index.js");
const {
  createEvidenceDigest,
  createProbeDigest,
  verifyCapabilityProof,
} = require("../capability-proof/index.js");
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

/**
 * Independent live-probe digest — computed from probe payload + identity,
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

/**
 * Compose Claude HostAdapter from target profile + injected host primitives.
 *
 * `enforced` requires ALL of: (1) a real host primitive for that capability,
 * (2) a live probe payload, and (3) CapabilityProof verification against an
 * *independent* expectedProbeDigest (createProbeDigest from the live probe —
 * not proof.probe_digest copied as the expected value). Live probes alone do
 * not authorize enforced; digest integrity without a primitive is not an
 * external live-bind for enforcement authority.
 */
function createClaudeHostAdapter(options = {}) {
  const primitives = options.primitives || {};
  const liveProbes = options.liveProbes || null;

  const transports = {
    ExecutionTransport: makePort("claude-execution", (input) => {
      if (typeof primitives.execute === "function") {
        const value = primitives.execute(input);
        return { ok: true, outcome: "ok", value };
      }
      return { ok: true, outcome: "ok", value: { toolMap: profile.toolMap } };
    }),
    QuestionTransport: makePort("claude-question", (input) => {
      if (typeof primitives.askUserQuestion === "function") {
        const value = primitives.askUserQuestion(input);
        return { ok: true, outcome: "ok", value };
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
    WorkerTransport: makePort("claude-worker", (input) => {
      if (typeof primitives.worker === "function") {
        return { ok: true, outcome: "ok", value: primitives.worker(input) };
      }
      return { ok: true, outcome: "ok", value: { delegation: "Agent" } };
    }),
    ToolExecutionTransport: makePort("claude-tool", (input) => {
      if (typeof primitives.tool === "function") {
        return { ok: true, outcome: "ok", value: primitives.tool(input) };
      }
      return { ok: true, outcome: "ok", value: { tools: profile.toolMap } };
    }),
    DeliveryGateTransport: makePort("claude-delivery-gate", (input) => {
      if (typeof primitives.hooksObserve === "function") {
        return { ok: true, outcome: "observation", value: primitives.hooksObserve(input) };
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

  const capabilities = {};
  for (const id of TRANSPORT_CAPABILITIES) {
    if (liveProbes && liveProbes[id] && hasHostPrimitive(id, primitives)) {
      const expectedProbeDigest = independentExpectedProbeDigest(id, liveProbes[id]);
      const material = buildEvidence(id, liveProbes[id]);
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
    } else {
      capabilities[id] = resolveHonestState(id, primitives);
    }
  }

  return createHostAdapter({
    adapter_id: ADAPTER_ID,
    adapter_version: ADAPTER_VERSION,
    host_version: HOST_VERSION,
    capabilities,
    transports,
  });
}

/**
 * Proof material for callers (e.g. headless conformance). When live probes are
 * supplied, each entry includes an independent `expectedProbeDigest` computed
 * from the probe payload — callers must pass that field, not proof.probe_digest.
 */
function getClaudeProofMaterial(liveProbes = null) {
  const material = {};
  for (const id of TRANSPORT_CAPABILITIES) {
    const probe = liveProbes && liveProbes[id] ? liveProbes[id] : undefined;
    const built = buildEvidence(id, probe);
    if (probe !== undefined) {
      material[id] = {
        ...built,
        expectedProbeDigest: independentExpectedProbeDigest(id, probe),
      };
    } else {
      material[id] = built;
    }
  }
  return material;
}

/**
 * Verify proofs under live probes using the independent expectedProbeDigest.
 * Fixture-only material without live probes does not authorize enforced.
 * Integrity verify alone is not enforcement authority (primitives required at adapter compose).
 */
function verifyAllClaudeEnforcedProofs(options = {}) {
  const liveProbes = options.liveProbes || null;
  if (!liveProbes) {
    return { ok: false, reason_code: "fixture-only-not-live-probe", results: {} };
  }
  const material = getClaudeProofMaterial(liveProbes);
  const results = {};
  for (const id of Object.keys(liveProbes)) {
    const entry = material[id];
    results[id] = verifyCapabilityProof({
      capabilityId: id,
      expectedAdapterId: ADAPTER_ID,
      expectedAdapterVersion: ADAPTER_VERSION,
      expectedHostRuntimeVersion: HOST_VERSION,
      expectedProbeDigest: entry && entry.expectedProbeDigest,
      proof: entry && entry.proof,
      evidence: entry && entry.evidence,
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
  createClaudeHostAdapter,
  getClaudeProofMaterial,
  verifyAllClaudeEnforcedProofs,
  buildEvidence,
  invokeTransportAsync,
};
