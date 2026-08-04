"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");

const {
  routeK2Operation,
  bridgeReviewLineage,
  bridgeArchiveTransaction,
  rejectProseLifecycleOperation,
  assertSingleLifecycleReducer,
  sourceDefinesReduceLifecycle,
  assertPermitDoesNotOverrideAuthority,
} = require("./bridges.js");

test("routing bridge consumes structured K2 operation without changing fixed route defaults", () => {
  const routed = routeK2Operation({
    operation: "start",
    arguments: { node_id: "n1" },
    authorityToken: "opaque:t1",
  });
  assert.equal(routed.ok, true);
  assert.equal(routed.source, "k2");
  assert.equal(routed.operation, "start");
  assert.equal(routed.route_policy, "fixed");
  // Must not invent adaptive routing.
  assert.equal(routed.adaptive, false);
});

test("review-lineage fixture preserves candidate/findings/attempt history", () => {
  const lineage = {
    candidate: { id: "cand-1", digest: "sha256:c1" },
    findings: [{ id: "f1", severity: "HIGH" }],
    attempts: [{ id: "a1", status: "failed" }],
    revision: 3,
  };
  const bridged = bridgeReviewLineage({
    lineage,
    k2Operation: { operation: "status" },
  });
  assert.equal(bridged.ok, true);
  assert.deepEqual(bridged.lineage.candidate, lineage.candidate);
  assert.deepEqual(bridged.lineage.findings, lineage.findings);
  assert.deepEqual(bridged.lineage.attempts, lineage.attempts);
  assert.equal(bridged.lineage.revision, 3);
  assert.equal(bridged.reset, false);
});

test("archive fixture preserves transaction history and rollback semantics", () => {
  const journal = [
    { step: "plan", status: "completed" },
    { step: "move", status: "started" },
  ];
  const bridged = bridgeArchiveTransaction({
    journal,
    k2Operation: { operation: "status" },
  });
  assert.equal(bridged.ok, true);
  assert.deepEqual(bridged.journal, journal);
  assert.equal(bridged.rollback_supported, true);
  assert.equal(bridged.history_rewritten, false);
});

test("orchestrator rejects prose interpretation for K2-covered operations", () => {
  const rejected = rejectProseLifecycleOperation({
    prose: "please mark the change as archived now",
    coveredOperations: ["start", "complete", "fail", "recover", "status"],
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, "prose-lifecycle-rejected");
  assert.ok(rejected.hint.includes("structured"));

  const allowed = rejectProseLifecycleOperation({
    prose: "please summarize the proposal",
    coveredOperations: ["start", "complete"],
  });
  assert.equal(allowed.ok, true);
});

test("no second lifecycle reducer outside lifecycle-kernel", () => {
  const root = path.resolve(__dirname, "..", "..", "..");
  const result = assertSingleLifecycleReducer(root);
  assert.equal(result.ok, true);
  assert.deepEqual(result.extra_reducers, []);
});

test("assertSingleLifecycleReducer detects arrow/const/exported reduceLifecycle fixtures", () => {
  assert.equal(
    sourceDefinesReduceLifecycle("const reduceLifecycle = (state, op) => state;"),
    true
  );
  assert.equal(
    sourceDefinesReduceLifecycle("let reduceLifecycle = async function (s, o) { return s; };"),
    true
  );
  assert.equal(
    sourceDefinesReduceLifecycle("exports.reduceLifecycle = (state) => state;"),
    true
  );
  assert.equal(
    sourceDefinesReduceLifecycle("module.exports.reduceLifecycle = function reduceLifecycle() {}"),
    true
  );
  assert.equal(
    sourceDefinesReduceLifecycle('const { reduceLifecycle } = require("./reducer.js");'),
    false
  );
  assert.equal(
    sourceDefinesReduceLifecycle("module.exports = { reduceLifecycle };"),
    false
  );
});

test("K2.1 bridges: permit cannot override OpenSpec/Git; no second lifecycle authority", () => {
  const routed = routeK2Operation({
    operation: "start",
    arguments: { node_id: "n1" },
    operationPermit: { permit_id: "permit:runtime:0001" },
  });
  assert.equal(routed.ok, true);
  assert.equal(routed.second_lifecycle_authority, false);
  assert.equal(routed.openspec_git_sole_authority, true);
  assert.equal(routed.route_policy, "fixed");
  assert.equal(routed.adaptive, false);

  const blocked = assertPermitDoesNotOverrideAuthority({
    permit: { permit_id: "p1", overrides_openspec: true },
    openspecFact: { status: "ready-for-apply" },
    gitFact: { branch: "feat/x" },
  });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "permit-cannot-override-openspec");

  const ok = assertPermitDoesNotOverrideAuthority({
    permit: { permit_id: "p1" },
    openspecFact: { status: "ready-for-apply" },
    gitFact: { branch: "feat/x" },
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.openspec_git_sole_authority, true);
});
