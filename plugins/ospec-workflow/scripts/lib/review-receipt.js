"use strict";

// The receipt of an IDD trust review result (OSP-029 step 2, REQ-hooks-027):
// the SubagentStop hook writes it when review-trust or review-correction ends
// with a result that carries a request_digest, and `ospec review record` and
// `ospec review validate` read it (REQ-idd-016). The main agent has the same
// disk access as the hook, so a receipt says the hook saw the reviewer return
// that result; it is not proof that the reviewer ran.

const fs = require("node:fs");
const path = require("node:path");

const { sha256Fingerprint } = require("./canonical-json.js");

// A repository path: the IDD workspace keeps it out of every diff it reads.
const RECEIPTS_DIR = ".ospec/review-receipts";
const SCHEMA = "ospec-review-receipt/v1";
const DIGEST = /^sha256:([0-9a-f]{64})$/;
// The list each reviewer's result holds next to its request_digest.
const RESULT_LISTS = Object.freeze({ "review-trust": "findings", "review-correction": "outcomes" });

/** Digest of a result's content: key order and whitespace do not change it. */
function resultDigest(result) {
  return sha256Fingerprint("ospec-review-result/v1", result);
}

/** Where the receipt of a request digest lives under `root`; null for a malformed digest. */
function receiptPath(root, requestDigest) {
  const match = typeof requestDigest === "string" ? DIGEST.exec(requestDigest) : null;
  return match ? path.join(root, ...RECEIPTS_DIR.split("/"), `${match[1]}.json`) : null;
}

function isResult(value, list) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
    && DIGEST.test(value.request_digest) && Array.isArray(value[list]);
}

/**
 * The result an `agent` reviewer returned in its final message: the message
 * itself as JSON, or its last fenced block that parses as one. Null when the
 * agent is not a reviewer or the message holds no result.
 */
function findReviewResult(message, agent) {
  const list = RESULT_LISTS[agent];
  if (!list) return null;
  if (isResult(message, list)) return message;
  if (typeof message !== "string") return null;
  const fenced = [...message.matchAll(/```[a-z]*[ \t]*\r?\n([\s\S]*?)```/g)].map((match) => match[1]).reverse();
  for (const block of [message, ...fenced]) {
    let value;
    try {
      value = JSON.parse(block.trim());
    } catch {
      continue;
    }
    if (isResult(value, list)) return value;
  }
  return null;
}

function buildReceipt({ agent, result, recordedAt }) {
  return { schema: SCHEMA, request_digest: result.request_digest, agent, result_digest: resultDigest(result), recorded_at: recordedAt };
}

/** The receipt of `requestDigest` under `root`, or null when there is none or it does not parse as one. */
function readReceipt(root, requestDigest) {
  const file = receiptPath(root, requestDigest);
  if (!file) return null;
  let value;
  try {
    value = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  const valid = value && value.schema === SCHEMA && value.request_digest === requestDigest
    && Object.hasOwn(RESULT_LISTS, value.agent) && DIGEST.test(value.result_digest) && typeof value.recorded_at === "string";
  return valid ? value : null;
}

module.exports = {
  RECEIPTS_DIR,
  RESULT_LISTS,
  buildReceipt,
  findReviewResult,
  readReceipt,
  receiptPath,
  resultDigest,
};
