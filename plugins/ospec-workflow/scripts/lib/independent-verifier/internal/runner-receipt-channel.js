"use strict";

const TRUSTED_ISSUERS = Object.freeze([
  Object.freeze({ issuer_id: "node-test", transport: "tool-execution-transport" }),
  Object.freeze({ issuer_id: "npm-test", transport: "tool-execution-transport" }),
  Object.freeze({ issuer_id: "node:test", transport: "tool-execution-transport" }),
  Object.freeze({ issuer_id: "tool-execution", transport: "tool-execution-transport" }),
  Object.freeze({ issuer_id: "host-adapter", transport: "execution-transport" }),
]);

const RUNNER_RECEIPT_AUTHORITY = Symbol("ospec.runnerReceiptAuthority");
const trustedChannels = new WeakMap();

function authorityError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function isTrustedIssuer(issuerId, transport) {
  return TRUSTED_ISSUERS.some((identity) => (
    identity.issuer_id === issuerId && identity.transport === transport
  ));
}

function freezeReceipt(receipt) {
  if (!receipt || typeof receipt !== "object") return receipt;
  const frozen = {
    ...receipt,
    satisfied_tokens: Array.isArray(receipt.satisfied_tokens)
      ? Object.freeze([...receipt.satisfied_tokens])
      : receipt.satisfied_tokens,
  };
  if (receipt.execution_sequence && typeof receipt.execution_sequence === "object") {
    frozen.execution_sequence = Object.freeze({ ...receipt.execution_sequence });
  }
  return Object.freeze(frozen);
}

/**
 * Crea la capacidad nominal que identifica a un runner autorizado.
 *
 * @param {{issuer_id:string, transport:string}} identity Identidad del runner y transporte.
 * @returns {object} Capacidad interna no serializable.
 */
function createRunnerReceiptAuthority(identity) {
  if (!identity || typeof identity !== "object") {
    throw authorityError("UNTRUSTED_RUNNER_RECEIPT", "runner receipt authority identity is required");
  }
  if (!isTrustedIssuer(identity.issuer_id, identity.transport)) {
    throw authorityError("UNTRUSTED_RUNNER_RECEIPT", "runner receipt issuer/transport is not trusted");
  }
  return Object.freeze({
    [RUNNER_RECEIPT_AUTHORITY]: true,
    issuer_id: identity.issuer_id,
    transport: identity.transport,
  });
}

/**
 * Emite un canal desde una capacidad creada por el runtime, nunca desde strings del caller.
 *
 * @param {{authority:object, receipts:object[]}} input Capacidad y recibos emitidos por el runner.
 * @returns {object} Canal opaco registrado por identidad.
 */
function issueRunnerReceiptChannel(input) {
  if (!input || typeof input !== "object") {
    throw authorityError("INVALID_RUNNER_RECEIPT", "runner receipt channel input must be an object");
  }
  const authority = input.authority;
  if (!authority || authority[RUNNER_RECEIPT_AUTHORITY] !== true) {
    throw authorityError("UNTRUSTED_RUNNER_RECEIPT", "runner receipt authority capability is required");
  }
  if (!Array.isArray(input.receipts)) {
    throw authorityError("INVALID_RUNNER_RECEIPT", "runner receipt channel requires a receipts array");
  }
  const channel = Object.freeze({
    kind: "runner-receipt-channel/v1",
    issuer_id: authority.issuer_id,
    transport: authority.transport,
  });
  trustedChannels.set(channel, Object.freeze({
    issuer_id: authority.issuer_id,
    transport: authority.transport,
    receipts: Object.freeze(input.receipts.map((receipt) => freezeReceipt(receipt))),
  }));
  return channel;
}

function readRunnerReceiptAuthority(channel) {
  return channel && trustedChannels.get(channel);
}

module.exports = {
  createRunnerReceiptAuthority,
  freezeReceipt,
  issueRunnerReceiptChannel,
  readRunnerReceiptAuthority,
};
