"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { createHostAdapter } = require("../host-contract/index.js");
const { createEvidenceDigest, verifyCapabilityProof } = require("../capability-proof/index.js");
const profile = require("../target-profiles/claude.js");

const ADAPTER_ID = "claude";
const ADAPTER_VERSION = "1.0.0";
const HOST_VERSION = "k2a-host/1";

const FIXTURE_DIR = path.join(__dirname, "claude", "fixtures");

const ENFORCED_CAPABILITIES = Object.freeze([
  "ExecutionTransport",
  "QuestionTransport",
  "WorkerTransport",
  "ToolExecutionTransport",
  "DeliveryGateTransport",
]);

function loadFixture(name) {
  const file = path.join(FIXTURE_DIR, name);
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function buildEvidence(capabilityId) {
  const fixtureName = `${capabilityId
    .replace(/Transport$/, "")
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase()}-transport.json`;
  // Map Capability ids to fixture filenames.
  const map = {
    ExecutionTransport: "execution-transport.json",
    QuestionTransport: "question-transport.json",
    WorkerTransport: "worker-transport.json",
    ToolExecutionTransport: "tool-execution-transport.json",
    DeliveryGateTransport: "delivery-gate-transport.json",
  };
  const fixtureRel = `scripts/lib/host-adapters/claude/fixtures/${map[capabilityId]}`;
  const evidence = loadFixture(map[capabilityId]);
  const digest = createEvidenceDigest({
    capability_id: capabilityId,
    adapter_version: ADAPTER_VERSION,
    host_version: HOST_VERSION,
    fixture: fixtureRel,
    evidence,
  });
  return {
    fixture: fixtureRel,
    evidence,
    proof: {
      schema_version: 1,
      kind: "capability-proof/v1",
      adapter_version: ADAPTER_VERSION,
      host_version: HOST_VERSION,
      fixture: fixtureRel,
      evidence_digest: digest,
    },
  };
}

function makePort(portId, handler) {
  return {
    port_id: portId,
    invoke: typeof handler === "function" ? handler : () => ({ ok: true, outcome: "ok", value: { port_id: portId } }),
  };
}

/**
 * Compose Claude HostAdapter from target profile + injected host primitives.
 * Does not expose CAS, permit minting, or lifecycle transition selection.
 */
function createClaudeHostAdapter(options = {}) {
  const primitives = options.primitives || {};

  const transports = {
    ExecutionTransport: makePort("claude-execution", (input) => {
      if (typeof primitives.execute === "function") {
        const value = primitives.execute(input);
        return { ok: true, outcome: "ok", value };
      }
      return { ok: true, outcome: "ok", value: { toolMap: profile.toolMap } };
    }),
    QuestionTransport: makePort("claude-question", (input) => {
      // AskUserQuestion → QuestionTransport (observation only).
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
      // Hooks map without authorizing delivery.
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
  for (const id of ENFORCED_CAPABILITIES) {
    capabilities[id] = "enforced";
  }

  return createHostAdapter({
    adapter_id: ADAPTER_ID,
    adapter_version: ADAPTER_VERSION,
    host_version: HOST_VERSION,
    capabilities,
    transports,
  });
}

function getClaudeProofMaterial() {
  const material = {};
  for (const id of ENFORCED_CAPABILITIES) {
    material[id] = buildEvidence(id);
  }
  return material;
}

function verifyAllClaudeEnforcedProofs() {
  const material = getClaudeProofMaterial();
  const results = {};
  for (const id of ENFORCED_CAPABILITIES) {
    results[id] = verifyCapabilityProof(id, material[id].proof, material[id].evidence);
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
  createClaudeHostAdapter,
  getClaudeProofMaterial,
  verifyAllClaudeEnforcedProofs,
  buildEvidence,
};
