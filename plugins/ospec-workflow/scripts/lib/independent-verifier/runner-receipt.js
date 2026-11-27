"use strict";

const path = require("node:path");
const { sha256Fingerprint } = require("../canonical-json.js");
const { validateInstance, loadSchemaById } = require("../kernel-schema-validator.js");
const {
  freezeReceipt,
  readRunnerReceiptAuthority,
} = require("./internal/runner-receipt-channel.js");

const RUNNER_RECEIPT_SCHEMA_ID = "ospec://schemas/kernel/runner-receipt/v1";
const DEFAULT_SCHEMA_ROOT = path.resolve(__dirname, "../../..");
const FAILURE_SEMANTIC_ROLES = new Set(["red"]);

let cachedSchema = null;

function fail(reason_code, error) {
  return { ok: false, reason_code, error: error || reason_code };
}

function getSchema() {
  if (!cachedSchema) {
    cachedSchema = loadSchemaById(RUNNER_RECEIPT_SCHEMA_ID, { rootDir: DEFAULT_SCHEMA_ROOT });
  }
  return cachedSchema;
}

function canonicalTokens(tokens) {
  if (!Array.isArray(tokens)) return tokens;
  return [...new Set(tokens)].sort();
}

/**
 * Calcula la identidad content-addressed de un RunnerReceipt sin incluir su propio ID.
 *
 * @param {object} fields Campos persistibles del recibo.
 * @returns {string} Identidad SHA-256 canónica.
 */
function computeRunnerReceiptId(fields) {
  const payload = { ...fields };
  delete payload.receipt_id;
  return sha256Fingerprint("runner-receipt/v1", payload);
}

/**
 * Crea un RunnerReceipt canónico para que el runner lo publique por un canal confiable.
 *
 * @param {object} fields Campos del recibo, salvo `receipt_id`.
 * @returns {object} Recibo inmutable con identidad recomputada.
 */
function createRunnerReceipt(fields) {
  const record = {
    schema_version: 1,
    kind: "runner-receipt/v1",
    candidate_id: fields && fields.candidate_id,
    evidence_id: fields && fields.evidence_id,
    node_id: fields && fields.node_id,
    role: fields && fields.role,
    satisfied_tokens: canonicalTokens(fields && fields.satisfied_tokens),
    outcome: fields && fields.outcome,
    issuer_id: fields && fields.issuer_id,
    transport: fields && fields.transport,
  };
  if (fields && fields.execution_sequence !== undefined) {
    record.execution_sequence = {
      run_id: fields.execution_sequence && fields.execution_sequence.run_id,
      ordinal: fields.execution_sequence && fields.execution_sequence.ordinal,
    };
    if (fields.execution_sequence && fields.execution_sequence.previous_evidence_id !== undefined) {
      record.execution_sequence.previous_evidence_id = fields.execution_sequence.previous_evidence_id;
    }
  }
  record.receipt_id = computeRunnerReceiptId(record);
  return freezeReceipt(record);
}

function validateReceipt(receipt, authority) {
  if (!receipt || typeof receipt !== "object") {
    return fail("INVALID_RUNNER_RECEIPT", "runner receipt must be an object");
  }
  let validation;
  try {
    validation = validateInstance(getSchema(), receipt);
  } catch (error) {
    return fail("INVALID_RUNNER_RECEIPT", `runner receipt schema is unavailable: ${error.message}`);
  }
  if (!validation.valid) {
    return fail(
      "INVALID_RUNNER_RECEIPT",
      validation.errors.map((error) => `${error.path}: ${error.message}`).join("; ")
    );
  }
  if (receipt.issuer_id !== authority.issuer_id || receipt.transport !== authority.transport) {
    return fail("UNTRUSTED_RUNNER_RECEIPT", "runner receipt identity disagrees with its trusted channel");
  }
  if (receipt.receipt_id !== computeRunnerReceiptId(receipt)) {
    return fail("INVALID_RUNNER_RECEIPT", "runner receipt_id does not match its canonical fields");
  }
  if (JSON.stringify(receipt.satisfied_tokens) !== JSON.stringify(canonicalTokens(receipt.satisfied_tokens))) {
    return fail("INVALID_RUNNER_RECEIPT", "runner satisfied_tokens must be unique and canonically sorted");
  }
  if (receipt.outcome === "failed" && receipt.satisfied_tokens.length > 0) {
    return fail("INVALID_RUNNER_RECEIPT", "failed runner receipt cannot satisfy evidence tokens");
  }
  const failureSemanticRole = FAILURE_SEMANTIC_ROLES.has(receipt.role);
  if (failureSemanticRole !== (receipt.outcome === "failed")) {
    return fail("INVALID_RUNNER_RECEIPT", "runner receipt role and outcome are incoherent");
  }
  return { ok: true, receipt };
}

/**
 * Lee y valida los recibos solo si el canal conserva la identidad opaca emitida por el runtime.
 *
 * @param {object} channel Canal presentado al verifier.
 * @returns {{ok:true, receipts:object[], authority:object}|{ok:false, reason_code:string, error:string}}
 */
function readRunnerReceiptChannel(channel) {
  const authority = readRunnerReceiptAuthority(channel);
  if (!authority) {
    return fail("UNTRUSTED_RUNNER_RECEIPT", "runner receipts require a trusted runtime channel");
  }
  const receipts = [];
  const receiptIds = new Set();
  for (const candidate of authority.receipts) {
    const validated = validateReceipt(candidate, authority);
    if (!validated.ok) return validated;
    if (receiptIds.has(validated.receipt.receipt_id)) {
      return fail("INVALID_RUNNER_RECEIPT", "runner receipt_id must be unique");
    }
    receiptIds.add(validated.receipt.receipt_id);
    receipts.push(validated.receipt);
  }
  return { ok: true, receipts, authority };
}

module.exports = {
  computeRunnerReceiptId,
  createRunnerReceipt,
  readRunnerReceiptChannel,
};
