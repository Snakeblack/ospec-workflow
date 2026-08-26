"use strict";

const {
  ADAPTER_ID,
  ADAPTER_VERSION,
  HOST_VERSION,
} = require("../host-adapters/claude.js");

/**
 * Builds executeWorkOrder options from canonical Claude adapter proof material.
 * Domain-neutral K6a fixture — no Repair / K4b semantics.
 *
 * @param {Object} material
 * @returns {Object}
 */
function buildExecutionOptionsFromMaterial(material) {
  const tMat = material.WorkerTransport;
  const isoMat = material.WorkerIsolation;
  const options = {
    isolationCapability: "enforced",
    capabilityProof: tMat.proof,
    semantic_evidence: tMat.evidence,
    expectedAdapterId: ADAPTER_ID,
    expectedAdapterVersion: ADAPTER_VERSION,
    expectedHostRuntimeVersion: HOST_VERSION,
    expectedProbeDigest: tMat.expectedProbeDigest,
    probe_digest: tMat.proof.probe_digest,
  };
  if (isoMat && isoMat.expectedProbeDigest) {
    options.workerIsolation = {
      declared_state: "enforced",
      capabilityProof: isoMat.proof,
      semantic_evidence: isoMat.evidence,
      expectedAdapterId: ADAPTER_ID,
      expectedAdapterVersion: ADAPTER_VERSION,
      expectedHostRuntimeVersion: HOST_VERSION,
      expectedProbeDigest: isoMat.expectedProbeDigest,
    };
  }
  return options;
}

module.exports = {
  buildExecutionOptionsFromMaterial,
};
