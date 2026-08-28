"use strict";

const path = require("node:path");
const { computeRevision, findReceiptKindMismatch, isRunnerReceiptsMap } = require("../authority-store/index.js");
const { validateInstance, loadSchemaById } = require("../kernel-schema-validator.js");
const {
  computeRunnerReceiptId,
  readRunnerReceiptChannel,
} = require("./runner-receipt.js");
const {
  createRunnerReceiptAuthority,
  issueRunnerReceiptChannel,
} = require("./internal/runner-receipt-channel.js");

const RUNNER_RECEIPT_SCHEMA_ID = "ospec://schemas/kernel/runner-receipt/v1";
const DEFAULT_SCHEMA_ROOT = path.resolve(__dirname, "../../..");

let cachedSchema = null;

function fail(reason_code, error, extra = {}) {
  return { ok: false, reason_code, error: error || reason_code, ...extra };
}

function getSchema() {
  if (!cachedSchema) {
    cachedSchema = loadSchemaById(RUNNER_RECEIPT_SCHEMA_ID, { rootDir: DEFAULT_SCHEMA_ROOT });
  }
  return cachedSchema;
}

function cloneReceipt(receipt) {
  return JSON.parse(JSON.stringify(receipt));
}

function bagFromReceipts(receipts) {
  const bag = {};
  for (const receipt of receipts) {
    bag[receipt.receipt_id] = cloneReceipt(receipt);
  }
  return bag;
}

async function persistViaCommit(store, bag) {
  const current = await store.load();
  if (current && current.ok === false) return current;
  const nextBag = { ...(current.runner_receipts || {}), ...bag };
  if (findReceiptKindMismatch(current.authority, nextBag)) {
    return fail("receipt-kind-mismatch", "runner receipt kind disagrees with CAS collection", {
      code: "receipt-kind-mismatch",
    });
  }
  const expectedRevision = computeRevision(
    current.state,
    current.journal,
    current.authority,
    current.runner_receipts
  );
  const committed = await store.commit({
    state: current.state,
    journal: current.journal,
    authority: current.authority,
    budgets: current.budgets,
    runner_receipts: nextBag,
    expectedRevision,
  });
  if (committed && committed.ok === false) return committed;
  return { ok: true, runner_receipts: nextBag };
}

/**
 * Persist schema-valid runner-receipt/v1 records from a trusted channel into CAS `runner_receipts`.
 *
 * @param {object} store AuthorityStore or FileSystemStore
 * @param {object} channel Opaque runnerReceiptChannel
 * @param {string} [subjectId]
 * @returns {Promise<object>}
 */
async function persistRunnerReceipts(store, channel, subjectId) {
  const gate = readRunnerReceiptChannel(channel);
  if (!gate.ok) return gate;
  const bag = bagFromReceipts(gate.receipts);
  if (typeof store.commitRunnerReceipts === "function") {
    const committed = await store.commitRunnerReceipts(bag, subjectId);
    if (committed && committed.ok === false) {
      return committed.code
        ? fail(committed.code, committed.code, { code: committed.code, revision: committed.revision })
        : committed;
    }
    return { ok: true, ...committed, runner_receipts: committed.runner_receipts || bag };
  }
  if (typeof store.commit === "function") {
    return persistViaCommit(store, bag);
  }
  return fail("INVALID_RUNNER_RECEIPT", "store cannot persist runner receipts");
}

function validatePersistedRecord(record) {
  if (!record || typeof record !== "object") {
    return fail("INVALID_RUNNER_RECEIPT", "persisted runner receipt must be an object");
  }
  let validation;
  try {
    validation = validateInstance(getSchema(), record);
  } catch (error) {
    return fail("INVALID_RUNNER_RECEIPT", `runner receipt schema is unavailable: ${error.message}`);
  }
  if (!validation.valid) {
    return fail(
      "INVALID_RUNNER_RECEIPT",
      validation.errors.map((error) => `${error.path}: ${error.message}`).join("; ")
    );
  }
  const recomputed = computeRunnerReceiptId(record);
  if (recomputed !== record.receipt_id) {
    return fail("INVALID_RUNNER_RECEIPT", "recomputed receipt_id diverges from persisted identity");
  }
  return { ok: true, receipt: record };
}

/**
 * Load persisted runner-receipt/v1 records, fail closed on identity divergence, and issue a NEW channel.
 *
 * @param {object} store AuthorityStore or FileSystemStore
 * @param {{issuer_id?:string, transport?:string, subjectId?:string}} [identity]
 * @returns {Promise<object>}
 */
async function rehydrateAndIssueRunnerReceiptChannel(store, identity = {}) {
  const subjectId = identity && identity.subjectId;
  const loaded = await store.load(subjectId);
  if (loaded && loaded.ok === false) return loaded;
  if (loaded.runner_receipts != null && !isRunnerReceiptsMap(loaded.runner_receipts)) {
    return fail("INVALID_RUNNER_RECEIPT", "persisted runner_receipts must be a map keyed by receipt_id");
  }
  const bag = isRunnerReceiptsMap(loaded.runner_receipts) ? loaded.runner_receipts : {};
  const records = Object.values(bag);
  if (records.length === 0) {
    return fail("INVALID_RUNNER_RECEIPT", "no persisted runner-receipt/v1 records");
  }

  const validated = [];
  for (const record of records) {
    const checked = validatePersistedRecord(record);
    if (!checked.ok) return checked;
    validated.push(checked.receipt);
  }

  const issuer_id = identity.issuer_id || validated[0].issuer_id;
  const transport = identity.transport || validated[0].transport;
  for (const receipt of validated) {
    if (receipt.issuer_id !== issuer_id || receipt.transport !== transport) {
      return fail("UNTRUSTED_RUNNER_RECEIPT", "persisted runner receipts are not a homogeneous issuer/transport set");
    }
  }

  let authority;
  try {
    authority = createRunnerReceiptAuthority({ issuer_id, transport });
  } catch (error) {
    return fail(error.code || "UNTRUSTED_RUNNER_RECEIPT", error.message);
  }
  const channel = issueRunnerReceiptChannel({ authority, receipts: validated });
  return { ok: true, channel, receipts: validated };
}

module.exports = {
  persistRunnerReceipts,
  rehydrateAndIssueRunnerReceiptChannel,
};
