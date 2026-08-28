"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createAuthorityStore } = require("../authority-store/index.js");
const { createRunnerReceipt } = require("./runner-receipt.js");
const { readRunnerReceiptChannel } = require("./runner-receipt.js");
const {
  persistRunnerReceipts,
  rehydrateAndIssueRunnerReceiptChannel,
} = require("./runner-receipt-store.js");
const {
  createTestRunnerReceiptChannelFromReceipts,
} = require("../test-support/k6b-runner-receipt.js");

function sampleReceipt(overrides = {}) {
  return createRunnerReceipt({
    candidate_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    evidence_id: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    node_id: "repair-core",
    role: "acceptance",
    satisfied_tokens: ["ev:test-pass"],
    outcome: "passed",
    issuer_id: "node-test",
    transport: "tool-execution-transport",
    ...overrides,
  });
}

function pendingState() {
  return {
    schema_version: 1,
    status: "ready",
    nodes: { n1: { id: "n1", phase: "pending", attempt: 0 } },
  };
}

test("REQ-independent-verification-009: rehydrate fails closed when recomputed receipt_id diverges", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const receipt = sampleReceipt();
  const channel = createTestRunnerReceiptChannelFromReceipts([receipt]);
  const persisted = await persistRunnerReceipts(store, channel);
  assert.equal(persisted.ok, true, persisted.error || persisted.code);

  const tampered = { ...JSON.parse(JSON.stringify(receipt)), role: "integration" };
  const mutated = await store.commitRunnerReceipts({ [receipt.receipt_id]: tampered });
  assert.equal(mutated.ok, true, mutated.code);

  const rehydrated = await rehydrateAndIssueRunnerReceiptChannel(store);
  assert.equal(rehydrated.ok, false);
  assert.equal(rehydrated.reason_code, "INVALID_RUNNER_RECEIPT");
  assert.equal(rehydrated.channel, undefined);
});

test("REQ-independent-verification-009: caller DTO without reissued channel is UNTRUSTED_RUNNER_RECEIPT", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const receipt = sampleReceipt();
  const channelA = createTestRunnerReceiptChannelFromReceipts([receipt]);
  const persisted = await persistRunnerReceipts(store, channelA);
  assert.equal(persisted.ok, true);

  const rehydrated = await rehydrateAndIssueRunnerReceiptChannel(store);
  assert.equal(rehydrated.ok, true, rehydrated.error);
  assert.notEqual(rehydrated.channel, channelA);

  const forged = Object.freeze({
    kind: rehydrated.channel.kind,
    issuer_id: rehydrated.channel.issuer_id,
    transport: rehydrated.channel.transport,
  });
  const gate = readRunnerReceiptChannel(forged);
  assert.equal(gate.ok, false);
  assert.equal(gate.reason_code, "UNTRUSTED_RUNNER_RECEIPT");
});

test("REQ-independent-verification-009: persist without trusted channel does not write the bag", async () => {
  const store = createAuthorityStore({ initial: { state: pendingState(), journal: [] } });
  const before = await store.load();
  const forged = Object.freeze({
    kind: "runner-receipt-channel/v1",
    issuer_id: "node-test",
    transport: "tool-execution-transport",
  });
  const persisted = await persistRunnerReceipts(store, forged);
  assert.equal(persisted.ok, false);
  assert.equal(persisted.reason_code, "UNTRUSTED_RUNNER_RECEIPT");
  const after = await store.load();
  assert.deepEqual(after.runner_receipts, {});
  assert.equal(after.revision, before.revision);
});

test("REQ-independent-verification-009: array-shaped bag does not rehydrate into a trusted channel", async () => {
  const receipt = sampleReceipt();
  const store = {
    async load() {
      return {
        state: pendingState(),
        journal: [],
        authority: { permits: {}, receipts: {} },
        budgets: { attempts: 0, corrections: 0 },
        runner_receipts: [receipt],
      };
    },
  };
  const rehydrated = await rehydrateAndIssueRunnerReceiptChannel(store);
  assert.equal(rehydrated.ok, false);
  assert.equal(rehydrated.reason_code, "INVALID_RUNNER_RECEIPT");
  assert.equal(rehydrated.channel, undefined);
});
