"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { freezeCandidate, computeSourceSnapshotId } = require("../execution-identities/index.js");
const {
  startK7ReviewLineage,
  beginLens,
  recordLensResult,
  freezeFindings,
} = require("../review-lineage.js");
const { compileExecutionGraph, createPolicySnapshot } = require("../execution-graph/index.js");
const { computeTreeDigest } = require("../worker-workspace.js");
const { verifyCandidate } = require("../independent-verifier/index.js");
const { createTestRunnerReceiptChannel } = require("../test-support/k6b-runner-receipt.js");
const { createK7ReviewSelection } = require("../review-k7-binding.js");
const { createAuthorityStore, computeRevision } = require("../authority-store/index.js");
const { assertNotReceiptV1 } = require("../lifecycle-kernel/permits.js");
const { createJournalRecord, mergeJournalEntries } = require("../lifecycle-kernel/journal.js");
const { issueFixturePermit } = require("../test-support/permit-test-helpers.js");
const {
  createCandidateEvaluationAttestation,
  validateCandidateEvaluationAttestation,
} = require("./index.js");
const {
  ISSUE_OPERATION,
  computeEvaluationSubjectId,
  emissionPermitArguments,
  issueCandidateEvaluationAttestation,
} = require("./issuer.js");

const ISSUER_VERSION = "ospec-issuer/1.0.0";
const ISSUED_AT = "2026-09-28T10:00:00.000Z";
const ISSUED_AT_LATER = "2026-09-28T11:00:00.000Z";

// The evaluation operation this emission closes, and its recorded state.
const OPERATION_IDENTITY = Object.freeze({
  changePath: "openspec/changes/k8-issuer",
  phase: "sdd-verify",
  expectedRevision: "rev-verify-7",
  operation: "close-evaluation",
});
const OPERATION_TARGET = Object.freeze({
  changePath: OPERATION_IDENTITY.changePath,
  phase: OPERATION_IDENTITY.phase,
  revision: OPERATION_IDENTITY.expectedRevision,
  operation: OPERATION_IDENTITY.operation,
});
const OPERATION_BINDING = Object.freeze({ ...OPERATION_IDENTITY, target: OPERATION_TARGET });

const NODE = {
  node_id: "repair-core",
  kind: "repair-action/v1",
  operation: "apply_repair_patch",
  objective: "Apply repair changes",
  dependencies: [],
  ownership: { owner: "agent:repair", mode: "exclusive" },
  allowed_paths: ["src/index.js"],
  invariants: ["inv-fail-closed"],
  required_evidence: ["ev:test-pass"],
  budget_ref: "budget:default",
};
const OBLIGATION = {
  id: "req-repair-001",
  criticality: "must",
  implemented_by: ["repair-core"],
  required_evidence: ["ev:test-pass"],
};
const CONTRACT = {
  schema_version: 1,
  contract_id: "contract:k8-issuer",
  family: "repair",
  version: 1,
  contract_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  source_snapshot_id: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  obligations: [OBLIGATION],
};

const K7_DIFF = [
  "diff --git a/src/index.js b/src/index.js",
  "--- a/src/index.js",
  "+++ b/src/index.js",
  "@@ -1 +1 @@",
  "-module.exports = 0;",
  "+module.exports = 1;",
].join("\n");

const RUNTIME_RULE = `k7/v1:obligation:${OBLIGATION.id}=runtime`;

function makeK6bResult(effectiveRules, { repository = "k8-issuer", obligations = [OBLIGATION] } = {}) {
  const files = { "src/index.js": "module.exports = 1;\n" };
  const tree = computeTreeDigest(files);
  const candidate = freezeCandidate({
    repository_id: repository,
    projection: "workspace",
    base_tree: tree,
    candidate_tree: tree,
    diffText: K7_DIFF,
    paths: Object.keys(files),
  });
  const sourceSnapshot = {
    schema_version: 1,
    repository_id: candidate.repository_id,
    base_tree_digest: candidate.base_tree,
    projection: candidate.projection,
    dependency_digests: [],
  };
  sourceSnapshot.source_snapshot_id = computeSourceSnapshotId(sourceSnapshot);
  const contract = { ...CONTRACT, source_snapshot_id: sourceSnapshot.source_snapshot_id, obligations };
  const policySnapshot = createPolicySnapshot({ effectiveRules });
  const executionGraph = compileExecutionGraph({
    contract,
    policySnapshot,
    sourceSnapshot,
    nodes: [NODE],
    obligations,
  });
  const rawEvidence = [
    ["acceptance", "acceptance: ok"],
    ["invariants", "invariants: ok"],
    ["contract", "contract: ok"],
    ["negative", "negative: rejects forged input"],
  ].map(([role, bytes]) => ({
    bytes,
    provenance: "runtime-observed",
    origin: `role:${role}`,
    node_id: NODE.node_id,
  }));
  const receiptSpecs = ["acceptance", "invariants", "contract", "negative"].map((role) => ({
    role,
    node_id: NODE.node_id,
    evidence_requirements_satisfied: ["ev:test-pass"],
  }));
  const runnerReceiptChannel = createTestRunnerReceiptChannel({
    candidate,
    executionGraph,
    rawEvidence,
    receiptSpecs,
    collector: { id: "node-test", transport: "tool-execution-transport" },
  });
  const verified = verifyCandidate({
    candidate,
    executionGraph,
    policySnapshot,
    contract,
    sourceSnapshot,
    repository: { files },
    collector: { id: "node-test", transport: "tool-execution-transport" },
    declaredStrategy: "feature",
    rawEvidence,
    runnerReceiptChannel,
  });
  assert.equal(verified.ok, true, verified.error || verified.reason_code);
  return {
    candidate,
    sourceSnapshot,
    contract,
    policySnapshot,
    executionGraph,
    k6b: {
      verification: verified.verification,
      assurance_graph: verified.assurance_graph,
      evidence: verified.evidence,
      assessments: verified.assessments,
      replay_evidence: verified.replay_evidence,
      runner_receipt_channel: runnerReceiptChannel,
    },
  };
}

function buildK7Chain(effectiveRules) {
  const input = {
    ...makeK6bResult(effectiveRules),
    residual: { obligations: [{ id: OBLIGATION.id, material: true }], signals: [] },
  };
  const issued = createK7ReviewSelection(input);
  assert.equal(issued.ok, true, issued.error || issued.reason_code);
  let lineage = startK7ReviewLineage(issued.binding, { candidate_diff: K7_DIFF });
  for (const domain of issued.selection.selected_domains) {
    lineage = beginLens(lineage, { dimension: domain, expected_revision: lineage.revision, request_id: `${domain}-start` });
    lineage = recordLensResult(lineage, {
      dimension: domain,
      expected_revision: lineage.revision,
      request_id: `${domain}-result`,
      result: { findings: [] },
    });
  }
  lineage = freezeFindings(lineage, { expected_revision: lineage.revision, request_id: "freeze", issuance: input });
  return { input, binding: issued.binding, lineage };
}

let cachedChain = null;
function defaultChain() {
  if (!cachedChain) cachedChain = buildK7Chain([RUNTIME_RULE]);
  return cachedChain;
}

/**
 * Durable inner store double: persists state, journal, and the authority bag
 * (consumed permits + receipts) atomically in one record — REQ-authority-store-005
 * fidelity that the plain MemoryStore lacks. It deliberately does NOT persist
 * budgets or runner_receipts, so it must not be cited as REQ-authority-store-011
 * four-component atomic-record fidelity. It enforces expectedRevision across
 * store instances (the in-memory analogue of REQ-authority-store-013 restart
 * preservation, without disk), and can simulate an unknown-outcome interruption
 * or a typed non-conflict durable-commit failure.
 */
function createDurableEvaluationInner({
  crash = null,
  onFirstCommit = null,
  failCommit = null,
} = {}) {
  let head = { state: {}, journal: [], authority: { permits: {}, receipts: {} } };
  let crashesLeft = crash ? crash.times : 0;
  let failuresLeft = failCommit ? failCommit.times : 0;
  let hookArmed = typeof onFirstCommit === "function";
  let hookRunning = false;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  return {
    async load() {
      return clone(head);
    },
    async commitJournal(nextJournal) {
      head = { ...head, journal: mergeJournalEntries(head.journal, clone(nextJournal)) };
      return { ok: true };
    },
    async commit(payload) {
      if (hookArmed && !hookRunning) {
        hookArmed = false;
        hookRunning = true;
        try {
          await onFirstCommit();
        } finally {
          hookRunning = false;
        }
      }
      if (crashesLeft > 0 && crash.mode === "before") {
        crashesLeft -= 1;
        throw new Error("simulated interruption before durable commit");
      }
      const currentRevision = computeRevision(head.state, head.journal, head.authority, {});
      if (payload.expectedRevision != null && payload.expectedRevision !== currentRevision) {
        return { ok: false, code: "cas-conflict", revision: currentRevision };
      }
      if (failuresLeft > 0) {
        failuresLeft -= 1;
        return { ok: false, code: failCommit.code, revision: currentRevision };
      }
      head = {
        state: payload.state !== undefined ? clone(payload.state) : head.state,
        journal:
          payload.journal !== undefined
            ? mergeJournalEntries(head.journal, clone(payload.journal))
            : head.journal,
        authority: payload.authority !== undefined ? clone(payload.authority) : head.authority,
      };
      if (crashesLeft > 0 && crash.mode === "after") {
        crashesLeft -= 1;
        throw new Error("simulated interruption after durable commit");
      }
      return { ok: true };
    },
    snapshot() {
      return clone(head);
    },
  };
}

function pureAttestationFor(chain, overrides = {}) {
  const created = createCandidateEvaluationAttestation({
    binding: chain.binding,
    lineage: chain.lineage,
    issuance: chain.input,
    phase: { status: "success", verify_outcome: "PASS" },
    issuer_version: ISSUER_VERSION,
    runtime_version: `node/${process.versions.node}`,
    issued_at: ISSUED_AT,
    ...overrides,
  });
  assert.equal(created.ok, true, created.error || created.reason_code);
  return created.attestation;
}

function buildRig(chain, innerOptions = {}) {
  const attestation = pureAttestationFor(chain);
  const subjectId = computeEvaluationSubjectId({
    candidate_id: attestation.candidate_id,
    policy_digest: attestation.policy_digest,
  });
  const inner = createDurableEvaluationInner(innerOptions);
  const store = createAuthorityStore({ subjectId, store: inner });
  return { chain, attestation, subjectId, inner, store };
}

async function mintEmissionPermit(store, subjectId, attestation, operationIdentity = OPERATION_IDENTITY) {
  const head = await store.load(subjectId);
  assert.equal(head.ok, true, head.code);
  return issueFixturePermit({
    operation: ISSUE_OPERATION,
    headRevision: head.revision,
    subject_id: subjectId,
    arguments: emissionPermitArguments(subjectId, attestation.attestation_id, operationIdentity),
  });
}

function issuanceInput(store, permitLedger, permit, chain, overrides = {}) {
  return {
    store,
    permitLedger,
    operationPermit: permit,
    binding: chain.binding,
    lineage: chain.lineage,
    issuance: chain.input,
    phase: { status: "success", verify_outcome: "PASS" },
    operationBinding: OPERATION_BINDING,
    issuer_version: ISSUER_VERSION,
    runtime_version: `node/${process.versions.node}`,
    issued_at: ISSUED_AT,
    ...overrides,
  };
}

async function issueOnce(chain, innerOptions = {}, overrides = {}) {
  const rig = buildRig(chain, innerOptions);
  const issued = await mintEmissionPermit(rig.store, rig.subjectId, rig.attestation);
  const input = issuanceInput(rig.store, issued.ledger, issued.permit, chain, overrides);
  const result = await issueCandidateEvaluationAttestation(input);
  return { ...rig, ...issued, input, result };
}

test("issuer issues and validates a frozen attestation via single-use permit and atomic CAS", async () => {
  const chain = defaultChain();
  const { attestation, subjectId, store } = buildRig(chain);
  const head = await store.load(subjectId);
  const issued = await mintEmissionPermit(store, subjectId, attestation);
  const permit = issued.permit;

  // The CAS subject is the WU2 subject identity: derived from the same
  // {candidate_id, policy_digest} pair the attestation pins as expected_revision.
  assert.equal(subjectId, `evaluation-attestation:${attestation.expected_revision}`);

  const result = await issueCandidateEvaluationAttestation(
    issuanceInput(store, issued.ledger, permit, chain)
  );
  assert.equal(result.ok, true, result.error || result.reason_code);
  assert.equal(result.replayed, false);
  assert.equal(result.converged, false);
  assert.equal(result.subject_id, subjectId);
  assert.deepEqual(result.attestation, attestation);
  assert.equal(Object.isFrozen(result.attestation), true);
  assert.notEqual(result.revision, head.revision);

  assert.deepEqual(
    validateCandidateEvaluationAttestation(result.attestation, {
      binding: chain.binding,
      lineage: chain.lineage,
      issuance: chain.input,
      expects: "evaluation",
    }),
    { ok: true }
  );

  const receipt = result.operation_receipt;
  assert.equal(receipt.kind, "operation-receipt/v1");
  assert.equal(receipt.permit_id, permit.permit_id);
  assert.equal(receipt.subject_id, subjectId);
  assert.equal(receipt.operation, ISSUE_OPERATION);
  assert.equal(receipt.outcome, "advanced");
  assert.equal(receipt.revision, result.revision);
  assert.equal(assertNotReceiptV1(receipt).ok, true);
  assert.equal(issued.ledger.get(permit.permit_id).consumed, true);

  const after = await store.load(subjectId);
  assert.deepEqual(after.state.attestations[attestation.attestation_id], attestation);
  assert.equal(after.state.kind, "evaluation-attestation-ledger/v1");
  assert.equal(after.authority.permits[permit.permit_id].status, "consumed");
  assert.equal(after.authority.receipts[permit.permit_id].revision, result.revision);
  const emissionEntries = after.journal.filter(
    (entry) => entry.effect_id === `emit-attestation:${attestation.attestation_id}`
  );
  assert.equal(emissionEntries.length, 1);
  assert.equal(emissionEntries[0].status, "completed");
  assert.equal(emissionEntries[0].effect_class, "idempotent-keyed");
});

test("exact replay converges on the same attestation and prior receipt without a second consume", async () => {
  const chain = defaultChain();
  const { attestation, subjectId, store, ledger, permit, input, result: first } =
    await issueOnce(chain);

  const replay = await issueCandidateEvaluationAttestation(input);
  assert.equal(replay.ok, true, replay.error || replay.reason_code);
  assert.equal(replay.replayed, true);
  assert.equal(replay.converged, true);
  assert.equal(replay.revision, first.revision);
  assert.deepEqual(replay.attestation, attestation);
  assert.deepEqual(replay.operation_receipt, first.operation_receipt);
  assert.equal(assertNotReceiptV1(replay.operation_receipt).ok, true);

  const after = await store.load(subjectId);
  assert.equal(Object.keys(after.authority.receipts).length, 1);
  assert.equal(Object.keys(after.authority.permits).length, 1);
  assert.equal(Object.keys(after.state.attestations).length, 1);
  assert.equal(after.journal.length, 1);
  assert.equal(ledger.get(permit.permit_id).consumed, true);
});

test("stale writer loses: a competing revision between authorization and CAS fails closed", async () => {
  const chain = defaultChain();
  const attestation = pureAttestationFor(chain);
  const subjectId = computeEvaluationSubjectId({
    candidate_id: attestation.candidate_id,
    policy_digest: attestation.policy_digest,
  });
  let baseRevision = null;
  let competitorState = null;
  const inner = createDurableEvaluationInner({
    onFirstCommit: async () => {
      const competitor = createAuthorityStore({ subjectId, store: inner });
      const advanced = await competitor.compareAndSwap(
        subjectId,
        baseRevision,
        competitorState,
        [createJournalRecord({
          operation_id: "competitor:journal-tick",
          effect_id: "competitor:journal-tick",
          status: "completed",
        })],
        null,
        undefined
      );
      assert.equal(advanced.ok, true, advanced.code);
    },
  });
  const store = createAuthorityStore({ subjectId, store: inner });
  const head = await store.load(subjectId);
  baseRevision = head.revision;
  competitorState = head.state;

  const issued = await mintEmissionPermit(store, subjectId, attestation);
  const result = await issueCandidateEvaluationAttestation(
    issuanceInput(store, issued.ledger, issued.permit, chain)
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "EVALUATION_ISSUANCE_CAS_CONFLICT");
  assert.equal(result.cause, "cas-conflict");

  const after = await store.load(subjectId);
  assert.equal(after.state.attestations, undefined);
  assert.equal(after.authority.permits[issued.permit.permit_id], undefined);
  assert.equal(after.authority.receipts[issued.permit.permit_id], undefined);
  assert.equal(issued.ledger.get(issued.permit.permit_id).consumed, false);
  assert.ok(after.journal.some((entry) => entry.effect_id === "competitor:journal-tick"));
});

test("non-conflict typed CAS failure is classified as commit failure, not a lost race", async () => {
  const chain = defaultChain();
  const { attestation, subjectId, store } = buildRig(chain, {
    failCommit: { times: 1, code: "durability-error" },
  });
  const issued = await mintEmissionPermit(store, subjectId, attestation);

  const result = await issueCandidateEvaluationAttestation(
    issuanceInput(store, issued.ledger, issued.permit, chain)
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "EVALUATION_ISSUANCE_COMMIT_FAILED");
  assert.equal(result.cause, "durability-error");
  assert.ok(result.error.includes("durability-error"));

  const after = await store.load(subjectId);
  assert.equal(after.state.attestations, undefined);
  assert.equal(after.authority.permits[issued.permit.permit_id], undefined);
  assert.equal(after.authority.receipts[issued.permit.permit_id], undefined);
  assert.equal(after.journal.length, 0);
  assert.equal(issued.ledger.get(issued.permit.permit_id).consumed, false);
});

test("stale permit is rejected typed when the head advanced before issuance", async () => {
  const chain = defaultChain();
  const { attestation, subjectId, store, inner } = buildRig(chain);
  const head = await store.load(subjectId);
  const issued = await mintEmissionPermit(store, subjectId, attestation);

  const competitor = createAuthorityStore({ subjectId, store: inner });
  const advanced = await competitor.compareAndSwap(
    subjectId,
    head.revision,
    head.state,
    [createJournalRecord({
      operation_id: "competitor:journal-tick",
      effect_id: "competitor:journal-tick",
      status: "completed",
    })],
    null,
    undefined
  );
  assert.equal(advanced.ok, true, advanced.code);

  const result = await issueCandidateEvaluationAttestation(
    issuanceInput(store, issued.ledger, issued.permit, chain)
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "EVALUATION_ISSUANCE_PERMIT_STALE");
  assert.equal(result.cause, "stale-permit");

  const after = await store.load(subjectId);
  assert.equal(after.state.attestations, undefined);
  assert.equal(after.authority.permits[issued.permit.permit_id], undefined);
  assert.equal(issued.ledger.get(issued.permit.permit_id).consumed, false);
});

test("K7_NO_MODEL_DEFERRED writes nothing and consumes nothing", async () => {
  const noModelInput = {
    ...makeK6bResult(["k7/v1:no-model=allow"], { obligations: [] }),
    residual: { obligations: [], signals: [] },
  };
  assert.equal(createK7ReviewSelection(noModelInput).reason_code, "K7_NO_MODEL_DEFERRED");
  const bindingShaped = {
    kind: "k7-review-binding/v1",
    binding_id: `sha256:${"0".repeat(64)}`,
    issuance: noModelInput,
  };

  const subjectId = "evaluation-attestation:probe";
  const store = createAuthorityStore({
    subjectId,
    store: createDurableEvaluationInner(),
  });
  const head = await store.load(subjectId);
  const issued = issueFixturePermit({
    operation: ISSUE_OPERATION,
    headRevision: head.revision,
    subject_id: subjectId,
    arguments: emissionPermitArguments(subjectId, `sha256:${"9".repeat(64)}`, OPERATION_IDENTITY),
  });

  const result = await issueCandidateEvaluationAttestation({
    store,
    permitLedger: issued.ledger,
    operationPermit: issued.permit,
    binding: bindingShaped,
    lineage: null,
    issuance: noModelInput,
    phase: { status: "success", verify_outcome: "PASS" },
    operationBinding: OPERATION_BINDING,
    issuer_version: ISSUER_VERSION,
    runtime_version: `node/${process.versions.node}`,
    issued_at: ISSUED_AT,
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "EVALUATION_K7_NO_MODEL_DEFERRED");

  const after = await store.load(subjectId);
  assert.equal(after.state.attestations, undefined);
  assert.deepEqual(after.authority.permits, {});
  assert.deepEqual(after.authority.receipts, {});
  assert.equal(after.journal.length, 0);
  assert.equal(issued.ledger.get(issued.permit.permit_id).consumed, false);
});

test("an already-consumed permit cannot authorize a second emission", async () => {
  const chain = defaultChain();
  const { subjectId, store, ledger, permit, input } = await issueOnce(chain);

  const second = await issueCandidateEvaluationAttestation({ ...input, issued_at: ISSUED_AT_LATER });
  assert.equal(second.ok, false);
  assert.equal(second.reason_code, "EVALUATION_ISSUANCE_PERMIT_REUSE");
  assert.equal(second.cause, "permit-reuse");

  const after = await store.load(subjectId);
  assert.equal(Object.keys(after.state.attestations).length, 1);
  assert.equal(Object.keys(after.authority.receipts).length, 1);
  assert.equal(ledger.get(permit.permit_id).consumed, true);
});

test("unknown-outcome interruption before commit reconciles on re-presentation", async () => {
  const chain = defaultChain();
  const { attestation, subjectId, store } = buildRig(chain, {
    crash: { mode: "before", times: 1 },
  });
  const issued = await mintEmissionPermit(store, subjectId, attestation);

  const interrupted = await issueCandidateEvaluationAttestation(
    issuanceInput(store, issued.ledger, issued.permit, chain)
  );
  assert.equal(interrupted.ok, false);
  assert.equal(interrupted.reason_code, "EVALUATION_ISSUANCE_INTERRUPTED");

  const mid = await store.load(subjectId);
  assert.equal(mid.state.attestations, undefined);
  assert.equal(mid.authority.permits[issued.permit.permit_id], undefined);
  assert.equal(issued.ledger.get(issued.permit.permit_id).consumed, false);

  const reconciled = await issueCandidateEvaluationAttestation(
    issuanceInput(store, issued.ledger, issued.permit, chain)
  );
  assert.equal(reconciled.ok, true, reconciled.error || reconciled.reason_code);
  assert.equal(reconciled.replayed, false);
  assert.deepEqual(reconciled.attestation, attestation);

  const after = await store.load(subjectId);
  assert.deepEqual(after.state.attestations[attestation.attestation_id], attestation);
  assert.equal(after.authority.permits[issued.permit.permit_id].status, "consumed");
  assert.equal(Object.keys(after.authority.receipts).length, 1);
  assert.equal(issued.ledger.get(issued.permit.permit_id).consumed, true);
});

test("unknown-outcome interruption after the durable commit reconciles via exact replay", async () => {
  const chain = defaultChain();
  const { attestation, subjectId, store } = buildRig(chain, {
    crash: { mode: "after", times: 1 },
  });
  const issued = await mintEmissionPermit(store, subjectId, attestation);

  const interrupted = await issueCandidateEvaluationAttestation(
    issuanceInput(store, issued.ledger, issued.permit, chain)
  );
  assert.equal(interrupted.ok, false);
  assert.equal(interrupted.reason_code, "EVALUATION_ISSUANCE_INTERRUPTED");

  // The durable record committed even though the caller never observed it.
  const mid = await store.load(subjectId);
  assert.deepEqual(mid.state.attestations[attestation.attestation_id], attestation);
  assert.equal(mid.authority.permits[issued.permit.permit_id].status, "consumed");

  const reconciled = await issueCandidateEvaluationAttestation(
    issuanceInput(store, issued.ledger, issued.permit, chain)
  );
  assert.equal(reconciled.ok, true, reconciled.error || reconciled.reason_code);
  assert.equal(reconciled.replayed, true);
  assert.deepEqual(reconciled.attestation, attestation);
  assert.equal(reconciled.operation_receipt.permit_id, issued.permit.permit_id);
  assert.equal(assertNotReceiptV1(reconciled.operation_receipt).ok, true);
  assert.equal(reconciled.revision, mid.revision);

  const after = await store.load(subjectId);
  assert.equal(Object.keys(after.authority.receipts).length, 1);
  assert.equal(Object.keys(after.state.attestations).length, 1);
  assert.equal(after.journal.length, 1);
  // The durable bag is the consume truth; the in-process ledger mirror was
  // never marked because no caller observed the winning commit.
  assert.equal(issued.ledger.get(issued.permit.permit_id).consumed, false);
});

test("issuer rejects malformed envelopes and non-CAS stores", async () => {
  const chain = defaultChain();
  const { attestation, subjectId, store } = buildRig(chain);
  const issued = await mintEmissionPermit(store, subjectId, attestation);
  const base = issuanceInput(store, issued.ledger, issued.permit, chain);

  for (const key of [
    "store",
    "permitLedger",
    "operationPermit",
    "binding",
    "lineage",
    "issuance",
    "phase",
    "operationBinding",
    "issuer_version",
    "runtime_version",
    "issued_at",
  ]) {
    const input = { ...base };
    delete input[key];
    const result = await issueCandidateEvaluationAttestation(input);
    assert.equal(result.ok, false, key);
    assert.equal(result.reason_code, "EVALUATION_ISSUANCE_INPUT_INVALID", key);
  }

  const extraKey = await issueCandidateEvaluationAttestation({ ...base, unknown_key: true });
  assert.equal(extraKey.reason_code, "EVALUATION_ISSUANCE_INPUT_INVALID");

  const noCasStore = { load: base.store.load.bind(base.store) };
  const noCas = await issueCandidateEvaluationAttestation({ ...base, store: noCasStore });
  assert.equal(noCas.reason_code, "EVALUATION_ISSUANCE_STORE_INVALID");

  const after = await store.load(subjectId);
  assert.equal(after.state.attestations, undefined);
  assert.equal(after.journal.length, 0);
  assert.deepEqual(after.authority.receipts, {});
});

async function assertNothingWritten(store, subjectId, ledger, permit) {
  const after = await store.load(subjectId);
  assert.equal(after.state.attestations, undefined);
  assert.deepEqual(after.authority.receipts, {});
  assert.equal(after.journal.length, 0);
  assert.equal(ledger.get(permit.permit_id).consumed, false);
}

test("emission records the bound operation identity in permit arguments, journal, and result", async () => {
  const chain = defaultChain();
  const { attestation, subjectId, store, result } = await issueOnce(chain);
  assert.equal(result.ok, true, result.error || result.reason_code);
  assert.deepEqual(result.operation_identity, OPERATION_IDENTITY);

  const after = await store.load(subjectId);
  const [entry] = after.journal.filter(
    (record) => record.effect_id === `emit-attestation:${attestation.attestation_id}`
  );
  assert.deepEqual(entry.result.operation_identity, OPERATION_IDENTITY);

  assert.throws(() => emissionPermitArguments(subjectId, attestation.attestation_id), TypeError);
  assert.throws(
    () => emissionPermitArguments(subjectId, attestation.attestation_id, { ...OPERATION_IDENTITY, phase: "" }),
    TypeError
  );
});

test("absent operation binding fails closed, including the legacy single-candidate passthrough", async () => {
  const chain = defaultChain();
  for (const operationBinding of [{}, { target: OPERATION_TARGET }, { candidates: [OPERATION_TARGET] }]) {
    const { attestation, subjectId, store } = buildRig(chain);
    const issued = await mintEmissionPermit(store, subjectId, attestation);
    const result = await issueCandidateEvaluationAttestation(
      issuanceInput(store, issued.ledger, issued.permit, chain, { operationBinding })
    );
    assert.equal(result.ok, false);
    assert.equal(result.reason_code, "EVALUATION_OPERATION_BINDING_ABSENT", JSON.stringify(operationBinding));
    await assertNothingWritten(store, subjectId, issued.ledger, issued.permit);
  }
});

test("stale, foreign, or malformed operation bindings are rejected before any write", async () => {
  const chain = defaultChain();
  const cases = [
    [{ ...OPERATION_BINDING, expectedRevision: "rev-verify-6" }, "binding.revision_mismatch"],
    [{ ...OPERATION_BINDING, changePath: "openspec/changes/other" }, "binding.change_mismatch"],
    [{ ...OPERATION_BINDING, phase: "sdd-apply" }, "binding.phase_mismatch"],
    [{ ...OPERATION_BINDING, operation: "close-apply" }, "binding.operation_mismatch"],
    [{ changePath: OPERATION_IDENTITY.changePath, phase: OPERATION_IDENTITY.phase, target: OPERATION_TARGET }, "binding.malformed"],
    [{ ...OPERATION_IDENTITY }, "binding.record_not_found"],
    [
      { ...OPERATION_BINDING, candidates: [{ ...OPERATION_TARGET, revision: "rev-verify-8" }] },
      "input.contradictory_snapshots",
    ],
  ];
  for (const [operationBinding, reason] of cases) {
    const { attestation, subjectId, store } = buildRig(chain);
    const issued = await mintEmissionPermit(store, subjectId, attestation);
    const result = await issueCandidateEvaluationAttestation(
      issuanceInput(store, issued.ledger, issued.permit, chain, { operationBinding })
    );
    assert.equal(result.ok, false, reason);
    assert.equal(result.reason_code, "EVALUATION_OPERATION_BINDING_REJECTED", reason);
    assert.deepEqual(result.operation_binding_reasons, [reason]);
    await assertNothingWritten(store, subjectId, issued.ledger, issued.permit);
  }
});

test("a recorded or unknown outcome on the bound operation requires reconciliation, not emission", async () => {
  const chain = defaultChain();
  for (const [lastOutcome, reason] of [
    ["success", "outcome.recorded_success"],
    ["failure", "outcome.recorded_failure"],
    ["unknown", "target.unknown_outcome"],
  ]) {
    const { attestation, subjectId, store } = buildRig(chain);
    const issued = await mintEmissionPermit(store, subjectId, attestation);
    const operationBinding = { ...OPERATION_IDENTITY, target: { ...OPERATION_TARGET, lastOutcome } };
    const result = await issueCandidateEvaluationAttestation(
      issuanceInput(store, issued.ledger, issued.permit, chain, { operationBinding })
    );
    assert.equal(result.ok, false, lastOutcome);
    assert.equal(result.reason_code, "EVALUATION_OPERATION_BINDING_RECONCILIATION_REQUIRED", lastOutcome);
    assert.deepEqual(result.operation_binding_reasons, [reason]);
    await assertNothingWritten(store, subjectId, issued.ledger, issued.permit);
  }
});

test("a permit minted for another evaluation operation cannot authorize the emission", async () => {
  const chain = defaultChain();
  const { attestation, subjectId, store } = buildRig(chain);
  const otherIdentity = { ...OPERATION_IDENTITY, expectedRevision: "rev-verify-6" };
  const issued = await mintEmissionPermit(store, subjectId, attestation, otherIdentity);
  const result = await issueCandidateEvaluationAttestation(
    issuanceInput(store, issued.ledger, issued.permit, chain)
  );
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "EVALUATION_ISSUANCE_PERMIT_REJECTED");
  assert.equal(result.cause, "unauthorized");
  await assertNothingWritten(store, subjectId, issued.ledger, issued.permit);
});

test("operation binding with unknown keys or a non-object shape is an invalid envelope", async () => {
  const chain = defaultChain();
  const { attestation, subjectId, store } = buildRig(chain);
  const issued = await mintEmissionPermit(store, subjectId, attestation);
  for (const operationBinding of [null, "bound", [OPERATION_IDENTITY], { ...OPERATION_BINDING, bypass: true }]) {
    const result = await issueCandidateEvaluationAttestation(
      issuanceInput(store, issued.ledger, issued.permit, chain, { operationBinding })
    );
    assert.equal(result.reason_code, "EVALUATION_ISSUANCE_INPUT_INVALID", JSON.stringify(operationBinding));
  }
  await assertNothingWritten(store, subjectId, issued.ledger, issued.permit);
});
