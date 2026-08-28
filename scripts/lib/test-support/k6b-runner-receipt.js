"use strict";

const { normalizeEvidence } = require("../independent-verifier/evidence.js");
const {
  createRunnerReceipt,
} = require("../independent-verifier/runner-receipt.js");
const {
  createRunnerReceiptAuthority,
  issueRunnerReceiptChannel,
} = require("../independent-verifier/internal/runner-receipt-channel.js");

const MISSING_EVIDENCE_ID = "sha256:0000000000000000000000000000000000000000000000000000000000000000";
const TEST_RUNNER_AUTHORITY = createRunnerReceiptAuthority({
  issuer_id: "node-test",
  transport: "tool-execution-transport",
});

/**
 * Registra recibos preconstruidos mediante la autoridad interna del runner de prueba.
 *
 * @param {object[]} receipts Recibos usados por un caso adversarial.
 * @returns {object} Canal opaco aceptado por el verifier.
 */
function createTestRunnerReceiptChannelFromReceipts(receipts) {
  return issueRunnerReceiptChannel({ authority: TEST_RUNNER_AUTHORITY, receipts });
}

/**
 * Emite un canal de receipts confiable para fixtures K6b sin relajar el facade productivo.
 *
 * @param {object} input Candidate, grafo, observaciones y claims del runner de prueba.
 * @returns {object} Capacidad opaca aceptada por `verifyCandidate`.
 */
function createTestRunnerReceiptChannel(input) {
  const receipts = [];
  let previousReceipt = null;
  for (let index = 0; index < input.receiptSpecs.length; index += 1) {
    const spec = input.receiptSpecs[index];
    const collector = Array.isArray(input.collectors) ? input.collectors[index] : input.collector;
    const normalized = normalizeEvidence(
      input.rawEvidence[index],
      input.candidate,
      input.executionGraph,
      collector
    );
    const evidence = normalized.ok ? normalized.evidence : null;
    const hasExplicitSequence = Object.prototype.hasOwnProperty.call(spec, "execution_sequence");
    let sequence = hasExplicitSequence
      ? spec.execution_sequence
      : (normalized.ok ? normalized.execution_sequence : undefined);
    // Solo los fixtures positivos sintetizan el enlace; las secuencias adversariales explícitas quedan intactas.
    if (
      !hasExplicitSequence &&
      sequence &&
      !sequence.previous_evidence_id &&
      previousReceipt &&
      previousReceipt.execution_sequence &&
      previousReceipt.execution_sequence.run_id === sequence.run_id &&
      previousReceipt.execution_sequence.ordinal < sequence.ordinal
    ) {
      sequence = { ...sequence, previous_evidence_id: previousReceipt.evidence_id };
    }
    const receipt = createRunnerReceipt({
      candidate_id: spec.candidate_id || input.candidate.candidate_id,
      evidence_id: spec.evidence_id || (evidence && evidence.evidence_id) || MISSING_EVIDENCE_ID,
      node_id: spec.node_id || (evidence && evidence.node_id) || "unknown-node",
      role: spec.role,
      satisfied_tokens: spec.satisfied_tokens || spec.evidence_requirements_satisfied || [],
      execution_sequence: sequence || undefined,
      outcome: spec.outcome || (spec.role === "red" ? "failed" : "passed"),
      issuer_id: "node-test",
      transport: "tool-execution-transport",
    });
    receipts.push(receipt);
    previousReceipt = receipt;
  }
  return createTestRunnerReceiptChannelFromReceipts(receipts);
}

module.exports = {
  createTestRunnerReceiptChannel,
  createTestRunnerReceiptChannelFromReceipts,
};
