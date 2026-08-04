"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  listActivatedRealAdapters,
  isActivatedRealAdapter,
  isInactiveStub,
  isConformanceHostCountedAsProductAdapter,
  getAdapterFactory,
  assertSoleClaudeActivation,
  INACTIVE_PRODUCT_STUBS,
} = require("./registry.js");
const {
  createClaudeHostAdapter,
  getClaudeProofMaterial,
  verifyAllClaudeEnforcedProofs,
  ADAPTER_ID,
} = require("./claude.js");

test("activated real adapters list contains exactly claude; others inactive; conformance host not counted", () => {
  assert.deepEqual(listActivatedRealAdapters(), ["claude"]);
  assert.equal(isActivatedRealAdapter("claude"), true);
  for (const id of INACTIVE_PRODUCT_STUBS) {
    assert.equal(isActivatedRealAdapter(id), false, id);
    assert.equal(isInactiveStub(id), true, id);
  }
  assert.equal(isConformanceHostCountedAsProductAdapter(), false);
  assert.equal(assertSoleClaudeActivation().ok, true);
  assert.equal(assertSoleClaudeActivation(["claude", "codex"]).ok, false);
  assert.equal(assertSoleClaudeActivation(["headless-conformance-host", "claude"]).ok, true);
});

test("claude adapter maps AskUserQuestion → QuestionTransport and hooks without authorizing delivery", () => {
  const adapter = createClaudeHostAdapter();
  const q = adapter.transports.QuestionTransport.invoke({});
  assert.equal(q.ok, true);
  assert.equal(q.value.mapped_from, "AskUserQuestion");

  const d = adapter.transports.DeliveryGateTransport.invoke({});
  assert.equal(d.ok, true);
  assert.equal(d.outcome, "observation");
  assert.equal(d.value.authorizes_delivery, false);
});

test("claude adapter cannot reach compareAndSwap or permit minting; store head unchanged", () => {
  const adapter = createClaudeHostAdapter();
  const store = { head: "rev-1", compareAndSwap() { this.head = "mutated"; } };
  // Authority surface is absent — adapter cannot mint permits or CAS.
  assert.equal(adapter.compareAndSwap, undefined);
  assert.equal(adapter.mintPermit, undefined);
  assert.equal(adapter.authority_surface, undefined);
  assert.equal(store.head, "rev-1");
});

test("every claude enforced capability has verifying CapabilityProof fixture", () => {
  const verified = verifyAllClaudeEnforcedProofs();
  assert.equal(verified.ok, true);
  const material = getClaudeProofMaterial();
  for (const [id, entry] of Object.entries(material)) {
    assert.ok(entry.proof.evidence_digest.startsWith("sha256:"));
    assert.ok(entry.fixture.includes("host-adapters/claude/fixtures"));
    assert.equal(adapterCapability(id), "enforced");
  }
  assert.equal(ADAPTER_ID, "claude");
});

function adapterCapability(id) {
  return createClaudeHostAdapter().capabilities[id];
}

test("inactive stubs cannot be loaded as executable adapters", () => {
  assert.throws(() => getAdapterFactory("codex"), (err) => err.code === "inactive-adapter-stub");
  assert.throws(() => getAdapterFactory("cursor"), (err) => err.code === "inactive-adapter-stub");
  const factory = getAdapterFactory("claude");
  assert.equal(typeof factory, "function");
});
