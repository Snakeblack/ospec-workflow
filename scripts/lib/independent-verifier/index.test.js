"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { freezeCandidate } = require("../execution-identities/index.js");
const { compileExecutionGraph, createPolicySnapshot } = require("../execution-graph/index.js");
const { computeTreeDigest } = require("../worker-workspace.js");
const { verifyCandidate: verifyCandidateRuntime, verifyCandidateWithChallenges: verifyCandidateWithChallengesRuntime, selectStrategy } = require("./index.js");
const { computeEvidenceId, digestRawBytes, normalizeEvidence } = require("./evidence.js");
const runnerReceipt = require("./runner-receipt.js");
const {
  computeRunnerReceiptId,
  createRunnerReceipt,
} = require("./runner-receipt.js");
const {
  createTestRunnerReceiptChannel,
  createTestRunnerReceiptChannelFromReceipts,
} = require("../test-support/k6b-runner-receipt.js");
const { computeVerificationId } = require("./verdict.js");
const { computeAssessmentId } = require("./assessment.js");
const assuranceGraph = require("../assurance-graph/index.js");

const ROOT = path.resolve(__dirname, "../../..");
const CONFIG_PATH = path.join(ROOT, "openspec", "config.yaml");

const SAMPLE_NODES = [
  {
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
  },
];

const SAMPLE_OBLIGATIONS = [
  {
    id: "req-repair-001",
    criticality: "must",
    implemented_by: ["repair-core"],
    required_evidence: ["ev:test-pass"],
  },
];

function sampleReceipt(role, satisfied, extra = {}) {
  return {
    role,
    node_id: extra.node_id || "repair-core",
    evidence_requirements_satisfied: satisfied === undefined
      ? (role === "red" ? [] : ["ev:test-pass"])
      : satisfied,
    ...extra,
  };
}

function featureReceipts() {
  return [
    sampleReceipt("acceptance"),
    sampleReceipt("invariants"),
    sampleReceipt("contract"),
    sampleReceipt("negative"),
  ];
}

function buildHarness(overrides = {}) {
  const files = overrides.files || { "src/index.js": "module.exports = 1;\n" };
  const tree = computeTreeDigest(files);
  const candidate = freezeCandidate({
    repository_id: "k6b-test-repo",
    projection: "workspace",
    base_tree: tree,
    candidate_tree: tree,
    diff_hash: overrides.diff_hash || "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    paths: Object.keys(files),
    predecessorCandidate: overrides.predecessorCandidate,
  });
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-fail-closed"] });
  const contract = {
    schema_version: 1,
    contract_id: "contract:k6b-001",
    family: "repair",
    version: 1,
    contract_digest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    source_snapshot_id: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
    obligations: SAMPLE_OBLIGATIONS,
  };
  const executionGraph = compileExecutionGraph({
    contract,
    policySnapshot,
    nodes: SAMPLE_NODES,
    obligations: SAMPLE_OBLIGATIONS,
  });
  return {
    candidate,
    executionGraph,
    policySnapshot,
    contract,
    repository: { files },
    collector: Object.prototype.hasOwnProperty.call(overrides, "collector")
      ? overrides.collector
      : trustedCollector("runtime-observed"),
    runner_receipts: overrides.runner_receipts || featureReceipts(),
  };
}

function trustedCollector(provenance) {
  if (provenance === "tool-produced") {
    return { id: "tool-execution", transport: "tool-execution-transport" };
  }
  if (provenance === "host-attested") {
    return { id: "host-adapter", transport: "execution-transport" };
  }
  if (provenance === "runtime-observed") {
    return { id: "node-test", transport: "tool-execution-transport" };
  }
  return undefined;
}

function raw(bytes, extra = {}) {
  const provenance = extra.provenance || "runtime-observed";
  const record = {
    bytes,
    provenance,
    origin: extra.origin || "test-runner",
    node_id: extra.node_id || "repair-core",
  };
  if (Object.prototype.hasOwnProperty.call(extra, "collector") && extra.collector) {
    record.collector = extra.collector;
  }
  if (extra.execution_sequence) {
    record.execution_sequence = extra.execution_sequence;
  }
  return { ...record, ...extra.fields };
}

function withTrustedRunnerReceipts(input) {
  if (input.runnerReceiptChannel) return input;
  const receiptSpecs = Array.isArray(input.runner_receipts)
    ? input.runner_receipts
    : (Array.isArray(input.receipts) ? input.receipts : []);
  const rawEvidence = Array.isArray(input.rawEvidence) ? input.rawEvidence : [];
  const trustedInput = {
    ...input,
    runnerReceiptChannel: createTestRunnerReceiptChannel({
      ...input,
      rawEvidence,
      receiptSpecs,
    }),
  };
  delete trustedInput.runner_receipts;
  delete trustedInput.receipts;
  return trustedInput;
}

function verifyCandidate(input) {
  return verifyCandidateRuntime(withTrustedRunnerReceipts(input));
}

function verifyCandidateWithChallenges(input) {
  return verifyCandidateWithChallengesRuntime(withTrustedRunnerReceipts(input));
}

function k6dEligible(result) {
  return Boolean(result && result.ok && result.challenge_verification && result.challenge_verification.status === "accepted");
}

function featureEvidence() {
  return [
    raw("acceptance: ok", { origin: "role:acceptance" }),
    raw("invariants: ok", { origin: "role:invariants" }),
    raw("contract: ok", { origin: "role:contract" }),
    raw("negative: rejects bad input", { origin: "role:negative" }),
  ];
}

test("REQ-independent-verification-001: frozen CandidateId proceeds to strategy selection", () => {
  const harness = buildHarness();
  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
  });
  assert.equal(result.ok, true, result.error || result.reason_code);
  assert.equal(result.strategy, "feature");
  assert.equal(result.verification.candidate_id, harness.candidate.candidate_id);
});

test("REQ-independent-verification-001: WorkResult subject is rejected before strategy", () => {
  const harness = buildHarness();
  const workResult = {
    schema_version: 1,
    kind: "work-result/v1",
    work_result_id: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    work_order_id: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    source_snapshot_id: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    patch: "diff",
  };
  const result = verifyCandidate({
    ...harness,
    candidate: workResult,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "WORK_RESULT_SUBJECT");
});

test("REQ-independent-verification-001: unfrozen candidate is rejected before strategy", () => {
  const harness = buildHarness();
  const unfrozen = { ...harness.candidate };
  delete unfrozen.changed_paths_modes_digest;
  const result = verifyCandidate({
    ...harness,
    candidate: unfrozen,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNFROZEN_CANDIDATE");
});

test("REQ-independent-verification-001: binding digest mismatch fails closed", () => {
  const harness = buildHarness();
  const mismatched = {
    ...harness.candidate,
    candidate_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
  };
  const result = verifyCandidate({
    ...harness,
    candidate: mismatched,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "BINDING_MISMATCH");
});

test("REQ-independent-verification-008: contract digest mismatch fails before strategy or verdict", () => {
  const harness = buildHarness();
  const result = verifyCandidate({
    ...harness,
    contract: { ...harness.contract, contract_digest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" },
    declaredStrategy: "feature",
    rawEvidence: [],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "BINDING_MISMATCH");
  assert.equal(Object.prototype.hasOwnProperty.call(result, "verification"), false);
  assert.doesNotMatch(result.error, /strategy|MUST/i);
});

test("REQ-independent-verification-001: repository tree_digest without bytes is rejected", () => {
  const harness = buildHarness();
  const result = verifyCandidate({
    ...harness,
    repository: { tree_digest: harness.candidate.candidate_tree },
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "BINDING_MISMATCH");
  assert.match(result.error || "", /bytes/i);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "verification"), false);
});

test("REQ-independent-verification-001: repository files tree mismatch fails closed without verification", () => {
  const harness = buildHarness();
  const mismatchedFiles = { "src/index.js": "module.exports = 999;\n" };
  assert.notEqual(computeTreeDigest(mismatchedFiles), harness.candidate.candidate_tree);
  const result = verifyCandidate({
    ...harness,
    repository: { files: mismatchedFiles },
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "BINDING_MISMATCH");
  assert.equal(Object.prototype.hasOwnProperty.call(result, "verification"), false);
});

test("REQ-independent-verification-001: evidence node_id missing or unknown fails closed without verification", () => {
  const harness = buildHarness();

  const missingNodeId = featureEvidence().map((item, index) => {
    if (index !== 0) return item;
    const rest = { ...item };
    delete rest.node_id;
    return rest;
  });
  const missing = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: missingNodeId,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason_code, "BINDING_MISMATCH");
  assert.equal(Object.prototype.hasOwnProperty.call(missing, "verification"), false);

  const unknownNode = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence().map((item, index) =>
      index === 0 ? { ...item, node_id: "not-in-graph" } : item
    ),
  });
  assert.equal(unknownNode.ok, false);
  assert.equal(unknownNode.reason_code, "BINDING_MISMATCH");
  assert.equal(Object.prototype.hasOwnProperty.call(unknownNode, "verification"), false);
});

test("REQ-independent-verification-002: feature strategy requires minimums and a negative", () => {
  const harness = buildHarness();
  const missingNegative = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: [
      raw("acceptance"),
      raw("invariants"),
      raw("contract"),
    ],
    runner_receipts: [
      sampleReceipt("acceptance"),
      sampleReceipt("invariants"),
      sampleReceipt("contract"),
    ],
  });
  assert.equal(missingNegative.ok, false);
  assert.equal(missingNegative.reason_code, "MISSING_NEGATIVE");

  const characterizationOnly = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: [
      raw("before"),
      raw("after"),
    ],
    runner_receipts: [
      sampleReceipt("characterization-before"),
      sampleReceipt("characterization-after"),
    ],
  });
  assert.equal(characterizationOnly.ok, false);
  assert.equal(characterizationOnly.reason_code, "MISSING_STRATEGY_MINIMUM");
});

test("REQ-independent-verification-002: missing strategy falls back to Strict TDD without rewriting tdd_mode", () => {
  const before = fs.readFileSync(CONFIG_PATH, "utf8");
  assert.match(before, /tdd_mode:\s*focused/);
  assert.equal(selectStrategy(undefined), "strict-tdd");

  const harness = buildHarness();
  const result = verifyCandidate({
    ...harness,
    rawEvidence: [
      raw("red fail", { execution_sequence: { run_id: "r1", ordinal: 1 } }),
      raw("green pass", { execution_sequence: { run_id: "r1", ordinal: 2 } }),
    ],
    runner_receipts: [
      sampleReceipt("red"),
      sampleReceipt("green"),
    ],
  });
  assert.equal(result.ok, true, result.error || result.reason_code);
  assert.equal(result.strategy, "strict-tdd");

  const after = fs.readFileSync(CONFIG_PATH, "utf8");
  assert.equal(after, before);
  assert.match(after, /tdd_mode:\s*focused/);
});

test("REQ-independent-verification-002: strategy negatives for bug, refactor, migration, config-docs", () => {
  const harness = buildHarness();

  const greenWithoutRed = verifyCandidate({
    ...harness,
    declaredStrategy: "bug",
    collectors: [
      trustedCollector("runtime-observed"),
      trustedCollector("tool-produced"),
    ],
    rawEvidence: [
      raw("green", { execution_sequence: { run_id: "r1", ordinal: 2 } }),
      raw("patch", { provenance: "tool-produced", execution_sequence: { run_id: "r1", ordinal: 1 } }),
    ],
    runner_receipts: [
      sampleReceipt("green"),
      sampleReceipt("patch"),
    ],
  });
  assert.equal(greenWithoutRed.ok, false);

  const behavioralDelta = verifyCandidate({
    ...harness,
    declaredStrategy: "refactor",
    rawEvidence: [
      raw("before", { execution_sequence: { run_id: "r1", ordinal: 1 } }),
      raw("after", { execution_sequence: { run_id: "r1", ordinal: 2 } }),
      raw("same"),
      raw("changed"),
    ],
    runner_receipts: [
      sampleReceipt("characterization-before"),
      sampleReceipt("characterization-after"),
      sampleReceipt("no-behavior-change"),
      sampleReceipt("behavioral-delta"),
    ],
  });
  assert.equal(behavioralDelta.ok, false);
  assert.equal(behavioralDelta.reason_code, "MISSING_NEGATIVE");

  const skippedRollback = verifyCandidate({
    ...harness,
    declaredStrategy: "migration",
    rawEvidence: [
      raw("dry"),
      raw("incompat"),
      raw("idempotent"),
    ],
    runner_receipts: [
      sampleReceipt("dry-run"),
      sampleReceipt("incompatibility"),
      sampleReceipt("idempotent-re-run"),
    ],
  });
  assert.equal(skippedRollback.ok, false);
  assert.equal(skippedRollback.reason_code, "MISSING_STRATEGY_MINIMUM");

  const docsOnly = verifyCandidate({
    ...harness,
    declaredStrategy: "config-docs",
    rawEvidence: [raw("readme")],
    runner_receipts: [sampleReceipt("docs-only")],
  });
  assert.equal(docsOnly.ok, false);
});

test("REQ-independent-verification-002: config-docs anyOf requires install or consume", () => {
  const harness = buildHarness();
  const missingInstallOrConsume = verifyCandidate({
    ...harness,
    declaredStrategy: "config-docs",
    rawEvidence: [raw("parsed schema"), raw("smoke ok")],
    runner_receipts: [sampleReceipt("schema-parser"), sampleReceipt("smoke")],
  });
  assert.equal(missingInstallOrConsume.ok, false);
  assert.equal(missingInstallOrConsume.reason_code, "MISSING_STRATEGY_MINIMUM");
});

test("REQ-independent-verification-003: runtime-observed satisfies; model-reported does not", () => {
  const harness = buildHarness();
  const runtime = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
  });
  assert.equal(runtime.ok, true);
  assert.equal(runtime.evidence.every((ev) => !Object.prototype.hasOwnProperty.call(ev, "verdict")), true);

  const modelReported = verifyCandidate({
    ...harness,
    collector: undefined,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence().map((item) => ({ ...item, provenance: "model-reported" })),
  });
  assert.equal(modelReported.ok, false);
  assert.equal(modelReported.reason_code, "INSUFFICIENT_PROVENANCE");
});

test("REQ-independent-verification-003: stale, foreign, or fabricated evidence is rejected", () => {
  const harness = buildHarness();
  const foreign = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence().map((item, index) =>
      index === 0
        ? { ...item, candidate_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" }
        : item
    ),
  });
  assert.equal(foreign.ok, false);
  assert.equal(foreign.reason_code, "FOREIGN_SUBJECT");

  const fabricated = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence().map((item, index) =>
      index === 0
        ? { ...item, digest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" }
        : item
    ),
  });
  assert.equal(fabricated.ok, false);
  assert.equal(fabricated.reason_code, "FABRICATED_EVIDENCE");

  const preview = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
  });
  assert.equal(preview.ok, true, preview.error || preview.reason_code);
  const evidenceId = preview.evidence[0].evidence_id;
  const staleDependent = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
    priorAssuranceGraph: {
      nodes: [
        { id: "subject-A", kind: "source" },
        { id: "node-B", kind: "source" },
        { id: evidenceId, kind: "test-evidence" },
      ],
      edges: [
        { from: "subject-A", relation: "invalidates", to: "node-B" },
        { from: evidenceId, relation: "derived-from", to: "node-B" },
      ],
    },
  });
  assert.equal(staleDependent.ok, false);
  assert.equal(staleDependent.reason_code, "STALE_EVIDENCE");
  assert.equal(staleDependent.verification, undefined);
});

test("F-ad61b7e3cff9629a: predecessor remint without prior graph and digest reuse under invalidates are STALE", () => {
  const files = { "src/index.js": "module.exports = 1;\n" };
  const predecessor = buildHarness({ files });
  const first = verifyCandidate({ ...predecessor, declaredStrategy: "feature", rawEvidence: featureEvidence() });
  assert.equal(first.ok, true, first.reason_code);
  const successor = buildHarness({
    files,
    diff_hash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
    predecessorCandidate: predecessor.candidate,
  });
  assert.equal(verifyCandidate({ ...successor, declaredStrategy: "feature", rawEvidence: featureEvidence() }).reason_code, "STALE_EVIDENCE");
  const reminted = verifyCandidate({
    ...successor,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
    priorAssuranceGraph: {
      ...first.assurance_graph,
      edges: [...(first.assurance_graph.edges || []), { from: successor.candidate.candidate_id, relation: "invalidates", to: first.evidence[0].evidence_id }],
    },
  });
  assert.equal(reminted.reason_code, "STALE_EVIDENCE");
});

test("REQ-independent-verification-004: sufficient evidence yields a verification verdict without embedding it in evidence", () => {
  const harness = buildHarness();
  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.verification.verdict, "PASS");
  assert.equal(result.verification.kind, "verification/v2");
  for (const ev of result.evidence) {
    assert.equal(Object.prototype.hasOwnProperty.call(ev, "verdict"), false);
  }
});

test("REQ-independent-verification-004: extra human-decision evidence yields PASS WITH WARNINGS", () => {
  const harness = buildHarness();
  const nodeTest = harness.collector;
  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    collectors: [...featureEvidence().map(() => nodeTest), undefined],
    rawEvidence: [
      ...featureEvidence(),
      raw("human reviewed", { origin: "role:annotation", provenance: "human-decision" }),
    ],
    runner_receipts: [
      ...featureReceipts(),
      sampleReceipt("annotation"),
    ],
  });
  assert.equal(result.ok, true, result.error || result.reason_code);
  assert.equal(result.verification.verdict, "PASS WITH WARNINGS");
});

test("REQ-independent-verification-002: feature anyOf requires contract or integration", () => {
  const harness = buildHarness();
  const missingAnyOf = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: [
      raw("acceptance: ok"),
      raw("invariants: ok"),
      raw("negative: rejects bad input"),
    ],
    runner_receipts: [
      sampleReceipt("acceptance"),
      sampleReceipt("invariants"),
      sampleReceipt("negative"),
    ],
  });
  assert.equal(missingAnyOf.ok, false);
  assert.equal(missingAnyOf.reason_code, "MISSING_STRATEGY_MINIMUM");
});

test("REQ-independent-verification-002: Strict TDD rejects host-attested red and green", () => {
  const harness = buildHarness({ collector: { id: "host-adapter", transport: "execution-transport" } });
  const result = verifyCandidate({
    ...harness,
    rawEvidence: [
      raw("red fail", { provenance: "host-attested", execution_sequence: { run_id: "r1", ordinal: 1 } }),
      raw("green pass", { provenance: "host-attested", execution_sequence: { run_id: "r1", ordinal: 2 } }),
    ],
    runner_receipts: [
      sampleReceipt("red"),
      sampleReceipt("green"),
    ],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "INSUFFICIENT_PROVENANCE");
});

test("REQ-independent-verification-003: declared evidence_id mismatch is fabricated", () => {
  const harness = buildHarness();
  const forgedId = `sha256:${"f".repeat(64)}`;
  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence().map((item, index) =>
      index === 0 ? { ...item, evidence_id: forgedId } : item
    ),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "FABRICATED_EVIDENCE");
  assert.equal(result.verification, undefined);
});

test("REQ-independent-verification-004: evidence carrying verdict is rejected", () => {
  const harness = buildHarness();
  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: [{ ...raw("x"), verdict: "PASS" }, ...featureEvidence().slice(1)],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "MIXED_EVIDENCE_VERDICT");
});

test("REQ-independent-verification-003/004: evidence_id and verification_id are deterministic under permutation", () => {
  const harness = buildHarness();
  const a = featureEvidence();
  const b = [...a].reverse();
  const first = verifyCandidate({ ...harness, declaredStrategy: "feature", rawEvidence: a });
  const second = verifyCandidate({ ...harness, declaredStrategy: "feature", rawEvidence: b });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual([...first.evidence.map((e) => e.evidence_id)].sort(), [...second.evidence.map((e) => e.evidence_id)].sort());
  assert.equal(first.verification.verification_id, second.verification.verification_id);

  const sample = first.evidence[0];
  const recomputed = computeEvidenceId(
    {
      schema_version: sample.schema_version,
      kind: sample.kind,
      candidate_id: sample.candidate_id,
      provenance: sample.provenance,
      origin: sample.origin,
      digest: sample.digest,
      node_id: sample.node_id,
    },
    a.find((item) => digestRawBytes(item.bytes) === sample.digest).bytes
  );
  assert.equal(sample.evidence_id, recomputed);
  assert.equal(
    first.verification.verification_id,
    computeVerificationId(first.verification.candidate_id, first.verification.verdict, first.verification.evidence_ids)
  );
});

test("REQ-independent-verification-003: payload runtime-observed without collector fails UNTRUSTED_COLLECTOR", () => {
  const harness = buildHarness({ collector: undefined });
  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNTRUSTED_COLLECTOR");
  assert.equal(Object.prototype.hasOwnProperty.call(result, "verification"), false);
});

test("REQ-independent-verification-003: allowlisted node-test collector derives runtime-observed", () => {
  const harness = buildHarness();
  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
  });
  assert.equal(result.ok, true, result.error || result.reason_code);
  assert.equal(result.evidence.every((ev) => ev.provenance === "runtime-observed"), true);
  assert.equal(result.evidence.every((ev) => !Object.prototype.hasOwnProperty.call(ev, "collector")), true);
});

test("REQ-independent-verification-003: worker collector is model-reported and insufficient for runtime MUST", () => {
  const harness = buildHarness({ collector: { id: "worker", transport: "worker-transport" } });
  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence().map((item) => ({ ...item, provenance: "model-reported" })),
  });
  assert.equal(result.ok, false);
  assert.ok(["INSUFFICIENT_PROVENANCE", "UNTRUSTED_COLLECTOR"].includes(result.reason_code));
});

test("REQ-independent-verification-003: payload strong vs collector weak fails closed", () => {
  const harness = buildHarness({ collector: { id: "worker", transport: "worker-transport" } });
  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNTRUSTED_COLLECTOR");
});

test("F-d5739d79237afeb8/F-2fc6db350f5b8afc: weak+allowlisted fails closed; mapping and npm-test/node:test", () => {
  const harness = buildHarness();
  const run = (rawEvidence, collector) => verifyCandidate({
    ...harness,
    collector,
    declaredStrategy: "feature",
    rawEvidence,
  });
  const nodeTest = { id: "node-test", transport: "tool-execution-transport" };
  for (const provenance of ["model-reported", "human-decision", "external-unverified"]) {
    const result = run(featureEvidence().map((item) => ({ ...item, provenance })), nodeTest);
    assert.equal(result.ok, false);
    assert.equal(result.reason_code, "UNTRUSTED_COLLECTOR");
  }
  assert.equal(run(featureEvidence(), { id: "tool-execution", transport: "tool-execution-transport" }).reason_code, "UNTRUSTED_COLLECTOR");
  assert.equal(run(featureEvidence(), { id: "node-test", transport: "execution-transport" }).reason_code, "UNTRUSTED_COLLECTOR");
  for (const id of ["npm-test", "node:test"]) {
    const result = run(featureEvidence(), { id, transport: "tool-execution-transport" });
    assert.equal(result.ok, true, result.reason_code);
    assert.equal(result.evidence.every((ev) => ev.provenance === "runtime-observed"), true);
  }
});

test("F-d5739d79237afeb8: envelope collector fails closed; harness collector derives class", () => {
  const h = { ...buildHarness(), declaredStrategy: "feature", collector: { id: "node-test", transport: "tool-execution-transport" } };
  assert.equal(verifyCandidate({ ...h, rawEvidence: featureEvidence().map((i) => ({ ...i, collector: h.collector })) }).reason_code, "UNTRUSTED_COLLECTOR");
  const ok = verifyCandidate({ ...h, rawEvidence: featureEvidence() });
  assert.equal(ok.ok && ok.evidence.every((e) => e.provenance === "runtime-observed"), true, ok.reason_code);
});

test("REQ-independent-verification-005: MUST without receipts fails UNFULFILLED_MUST after strategy", () => {
  const harness = buildHarness();
  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
    runner_receipts: featureReceipts().map((r) => ({ ...r, evidence_requirements_satisfied: [] })),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNFULFILLED_MUST");
  assert.match(result.error || "", /req-repair-001/);
  assert.equal(Object.prototype.hasOwnProperty.call(result, "verification"), false);
});

test("REQ-independent-verification-005: evidence on a non-implementing node fails WRONG_IMPLEMENTING_NODE", () => {
  const extraNode = {
    node_id: "other-node",
    kind: "repair-action/v1",
    operation: "apply_repair_patch",
    objective: "Other",
    dependencies: [],
    ownership: { owner: "agent:repair", mode: "exclusive" },
    allowed_paths: ["src/other.js"],
    invariants: ["inv-fail-closed"],
    required_evidence: ["ev:test-pass"],
    budget_ref: "budget:default",
  };
  const files = { "src/index.js": "module.exports = 1;\n", "src/other.js": "module.exports = 2;\n" };
  const harness = buildHarness({ files });
  const { compileExecutionGraph, createPolicySnapshot } = require("../execution-graph/index.js");
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-fail-closed"] });
  const executionGraph = compileExecutionGraph({
    contract: harness.contract,
    policySnapshot,
    nodes: [...SAMPLE_NODES, extraNode],
    obligations: SAMPLE_OBLIGATIONS,
  });
  const result = verifyCandidate({
    ...harness,
    executionGraph,
    policySnapshot,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence().map((item) => ({ ...item, node_id: "other-node" })),
    runner_receipts: featureReceipts().map((r) => ({ ...r, node_id: "other-node", obligation_ids: ["req-repair-001"] })),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNFULFILLED_MUST");
});

test("REQ-independent-verification-005: approved deferral skips MUST coverage", () => {
  const deferred = [
    {
      id: "req-repair-001",
      criticality: "must",
      implemented_by: ["repair-core"],
      required_evidence: ["ev:test-pass"],
      deferred: { reason: "Hardening deferred with maintainer approval", approved_by: "maintainer" },
    },
  ];
  const harness = buildHarness();
  const { compileExecutionGraph, createPolicySnapshot } = require("../execution-graph/index.js");
  const policySnapshot = createPolicySnapshot({ effectiveRules: ["rule-fail-closed"] });
  const contract = { ...harness.contract, obligations: deferred };
  const executionGraph = compileExecutionGraph({
    contract,
    policySnapshot,
    nodes: SAMPLE_NODES,
    obligations: deferred,
  });
  const result = verifyCandidate({
    ...harness,
    contract,
    executionGraph,
    policySnapshot,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
    runner_receipts: featureReceipts().map((r) => ({ ...r, evidence_requirements_satisfied: [] })),
  });
  assert.equal(result.ok, true, result.error || result.reason_code);
});

test("REQ-independent-verification-007: projector failure is GRAPH_PROJECTION_FAILED without PASS or graph", () => {
  const harness = buildHarness();
  const original = assuranceGraph.projectAssuranceGraph;
  const run = (reason_code) => {
    assuranceGraph.projectAssuranceGraph = () => ({ ok: false, reason_code, error: "stub" });
    return verifyCandidate({ ...harness, declaredStrategy: "feature", rawEvidence: featureEvidence() });
  };
  try {
    const failed = run("GRAPH_PROJECTION_FAILED");
    assert.equal(failed.ok, false);
    assert.equal(failed.reason_code, "GRAPH_PROJECTION_FAILED");
    assert.equal(Object.prototype.hasOwnProperty.call(failed, "assurance_graph"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(failed, "verification"), false);
    const diverged = run("GRAPH_DIVERGENCE");
    assert.equal(diverged.ok, false);
    assert.equal(diverged.reason_code, "GRAPH_DIVERGENCE");
    assert.equal(Object.prototype.hasOwnProperty.call(diverged, "verification"), false);
  } finally {
    assuranceGraph.projectAssuranceGraph = original;
  }
});

test("F-6b1f8c8265c82b3e: mismatched canonicalInputs fail closed", () => {
  const harness = buildHarness();
  const mismatch = "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
  for (const canonicalInputs of [{ contract_digest: mismatch }, { policy_snapshot_id: mismatch }, { execution_graph_digest: mismatch }]) {
    const result = verifyCandidate({ ...harness, declaredStrategy: "feature", rawEvidence: featureEvidence(), canonicalInputs });
    assert.equal(result.ok, false);
    assert.ok(["GRAPH_DIVERGENCE", "BINDING_MISMATCH"].includes(result.reason_code));
    assert.equal(Object.prototype.hasOwnProperty.call(result, "verification"), false);
  }
});

test("REQ-independent-verification-004: strategy failure short-circuits without MUST upgrade", () => {
  const harness = buildHarness();
  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: [
      raw("acceptance"),
      raw("invariants"),
      raw("contract"),
    ],
    runner_receipts: [
      sampleReceipt("acceptance"),
      sampleReceipt("invariants"),
      sampleReceipt("contract"),
    ],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "MISSING_NEGATIVE");
  assert.notEqual(result.reason_code, "UNFULFILLED_MUST");
});

test("REQ-independent-verification-006: one observation cannot satisfy four incompatible roles", () => {
  const harness = buildHarness();
  const bytes = "shared-bytes";
  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: [
      raw(bytes, { origin: "shared-origin" }),
      raw(bytes, { origin: "shared-origin" }),
      raw(bytes, { origin: "shared-origin" }),
      raw(bytes, { origin: "shared-origin" }),
    ],
    runner_receipts: [
      sampleReceipt("acceptance"),
      sampleReceipt("invariants"),
      sampleReceipt("contract"),
      sampleReceipt("negative"),
    ],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "RUNNER_RECEIPT_BINDING_MISMATCH");
  assert.equal(Object.prototype.hasOwnProperty.call(result, "verification"), false);
});

test("REQ-independent-verification-006: strict-tdd and bug role order fail closed on reversed ordinals", () => {
  const harness = buildHarness();
  const strict = verifyCandidate({
    ...harness,
    rawEvidence: [
      raw("green", { execution_sequence: { run_id: "r1", ordinal: 1 } }),
      raw("red", { execution_sequence: { run_id: "r1", ordinal: 2 } }),
    ],
    runner_receipts: [
      sampleReceipt("green"),
      sampleReceipt("red"),
    ],
  });
  assert.equal(strict.ok, false);
  assert.equal(strict.reason_code, "STRATEGY_SEQUENCE_VIOLATION");

  const bug = verifyCandidate({
    ...harness,
    declaredStrategy: "bug",
    collectors: [
      trustedCollector("tool-produced"),
      trustedCollector("runtime-observed"),
      trustedCollector("runtime-observed"),
    ],
    rawEvidence: [
      raw("patch", { provenance: "tool-produced", execution_sequence: { run_id: "r1", ordinal: 1 } }),
      raw("red", { execution_sequence: { run_id: "r1", ordinal: 2 } }),
      raw("green", { execution_sequence: { run_id: "r1", ordinal: 3 } }),
    ],
    runner_receipts: [
      sampleReceipt("patch"),
      sampleReceipt("red"),
      sampleReceipt("green"),
    ],
  });
  assert.equal(bug.ok, false);
  assert.equal(bug.reason_code, "STRATEGY_SEQUENCE_VIOLATION");
});

test("FABRICATED_EVIDENCE: non-object raw and missing origin fail closed", () => {
  const harness = buildHarness();
  const nonObject = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: [null, ...featureEvidence().slice(1)],
  });
  assert.equal(nonObject.ok, false);
  assert.equal(nonObject.reason_code, "FABRICATED_EVIDENCE");
  assert.equal(Object.prototype.hasOwnProperty.call(nonObject, "verification"), false);

  const missingOrigin = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence().map((item, index) => (index === 0 ? { ...item, origin: "" } : item)),
  });
  assert.equal(missingOrigin.ok, false);
  assert.equal(missingOrigin.reason_code, "FABRICATED_EVIDENCE");
  assert.equal(Object.prototype.hasOwnProperty.call(missingOrigin, "verification"), false);
});

test("REQ-independent-verification-003: verifier derives trusted evidence metadata from Execution Graph and receipts", () => {
  const harness = buildHarness();
  const rawObservations = [
    { bytes: "acceptance: ok", origin: "node:test", node_id: "repair-core" },
    { bytes: "invariants: ok", origin: "node:test", node_id: "repair-core" },
    { bytes: "contract: ok", origin: "node:test", node_id: "repair-core" },
    { bytes: "negative: ok", origin: "node:test", node_id: "repair-core" },
  ];
  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: rawObservations,
    runner_receipts: featureReceipts(),
  });
  assert.equal(result.ok, true, result.error || result.reason_code);
  assert.ok(result.assessments.length > 0);
  assert.equal(result.assessments[0].obligation_id, "req-repair-001");
  assert.deepEqual(result.assessments[0].evidence_requirements_satisfied, ["ev:test-pass"]);
});

test("REQ-independent-verification-006: incompatible roles red ↔ green, char-before ↔ char-after, negative ↔ acceptance fail closed", () => {
  const harness = buildHarness();
  const bytes = "shared-bytes";

  // red ↔ green
  const redGreen = verifyCandidate({
    ...harness,
    declaredStrategy: "strict-tdd",
    rawEvidence: [
      raw(bytes, { origin: "shared-rg", execution_sequence: { run_id: "r1", ordinal: 1 } }),
      raw(bytes, { origin: "shared-rg", execution_sequence: { run_id: "r1", ordinal: 2 } }),
    ],
    runner_receipts: [
      sampleReceipt("red"),
      sampleReceipt("green"),
    ],
  });
  assert.equal(redGreen.ok, false);
  assert.equal(redGreen.reason_code, "RUNNER_RECEIPT_BINDING_MISMATCH");

  // negative ↔ acceptance
  const negAcc = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: [
      raw(bytes, { origin: "shared-neg-acc" }),
      raw("inv-bytes", { origin: "inv" }),
      raw("contract-bytes", { origin: "con" }),
      raw(bytes, { origin: "shared-neg-acc" }),
    ],
    runner_receipts: [
      sampleReceipt("acceptance"),
      sampleReceipt("invariants"),
      sampleReceipt("contract"),
      sampleReceipt("negative"),
    ],
  });
  assert.equal(negAcc.ok, false);
  assert.equal(negAcc.reason_code, "RUNNER_RECEIPT_BINDING_MISMATCH");

  // characterization-before ↔ characterization-after
  const charBeforeAfter = verifyCandidate({
    ...harness,
    declaredStrategy: "refactor",
    rawEvidence: [
      raw(bytes, { origin: "shared-cb-ca", execution_sequence: { run_id: "r1", ordinal: 1 } }),
      raw(bytes, { origin: "shared-cb-ca", execution_sequence: { run_id: "r1", ordinal: 2 } }),
      raw("nbc-bytes", { origin: "nbc" }),
    ],
    runner_receipts: [
      sampleReceipt("characterization-before"),
      sampleReceipt("characterization-after"),
      sampleReceipt("no-behavior-change"),
    ],
  });
  assert.equal(charBeforeAfter.ok, false);
  assert.equal(charBeforeAfter.reason_code, "RUNNER_RECEIPT_BINDING_MISMATCH");
});

test("REQ-independent-verification-006: non-conflicting shared evidence (integration + acceptance) passes validation", () => {
  const harness = buildHarness();
  const bytes = "shared-integration-acceptance";

  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: [
      raw(bytes, { origin: "acc" }),
      raw("inv-bytes", { origin: "inv" }),
      raw(bytes, { origin: "integ" }),
      raw("neg-bytes", { origin: "neg" }),
    ],
    runner_receipts: [
      sampleReceipt("acceptance"),
      sampleReceipt("invariants"),
      sampleReceipt("integration"),
      sampleReceipt("negative"),
    ],
  });
  assert.equal(result.ok, true, result.error || result.reason_code);
  assert.equal(result.verification.verdict, "PASS");
});

test("REQ-independent-verification-006: refactor chronological sequence via execution_sequence fails closed on bad ordinal or previous_evidence_id", () => {
  const harness = buildHarness();

  // Bad ordinal: after ordinal <= before ordinal
  const badOrdinal = verifyCandidate({
    ...harness,
    declaredStrategy: "refactor",
    rawEvidence: [
      raw("before-bytes", {
        origin: "cb",
        execution_sequence: { run_id: "run-1", ordinal: 5 },
      }),
      raw("after-bytes", {
        origin: "ca",
        execution_sequence: { run_id: "run-1", ordinal: 4 },
      }),
      raw("nbc-bytes", { origin: "nbc" }),
    ],
    runner_receipts: [
      sampleReceipt("characterization-before"),
      sampleReceipt("characterization-after"),
      sampleReceipt("no-behavior-change"),
    ],
  });
  assert.equal(badOrdinal.ok, false);
  assert.equal(badOrdinal.reason_code, "STRATEGY_SEQUENCE_VIOLATION");

  // Bad previous_evidence_id: after does not link to before
  const badPrev = verifyCandidate({
    ...harness,
    declaredStrategy: "refactor",
    rawEvidence: [
      raw("before-bytes", {
        origin: "cb",
        execution_sequence: { run_id: "run-1", ordinal: 1 },
      }),
      raw("after-bytes", {
        origin: "ca",
        execution_sequence: { run_id: "run-1", ordinal: 2, previous_evidence_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" },
      }),
      raw("nbc-bytes", { origin: "nbc" }),
    ],
    runner_receipts: [
      sampleReceipt("characterization-before"),
      sampleReceipt("characterization-after"),
      sampleReceipt("no-behavior-change"),
    ],
  });
  assert.equal(badPrev.ok, false);
  assert.equal(badPrev.reason_code, "STRATEGY_SEQUENCE_VIOLATION");
});

// Adversarial tests for B1, B2, B3, H1
test("REQ-independent-verification-003 [Adversarial B1]: caller semantic metadata injection in rawEvidence fails closed", () => {
  const harness = buildHarness();

  const injectionCases = [
    { name: "role injection", item: { ...raw("bytes"), role: "acceptance" } },
    { name: "obligation_id injection", item: { ...raw("bytes"), obligation_id: "req-repair-001" } },
    { name: "obligation_ids injection", item: { ...raw("bytes"), obligation_ids: ["req-repair-001"] } },
    { name: "evidence_requirements_satisfied injection", item: { ...raw("bytes"), evidence_requirements_satisfied: ["ev:test-pass"] } },
  ];

  for (const { name, item } of injectionCases) {
    const result = verifyCandidate({
      ...harness,
      declaredStrategy: "feature",
      rawEvidence: [item, ...featureEvidence().slice(1)],
      runner_receipts: featureReceipts(),
    });
    assert.equal(result.ok, false, `Failed to reject ${name}`);
    assert.equal(result.reason_code, "UNTRUSTED_CALLER_METADATA", name);
    assert.equal(result.verification, undefined);
  }
});

test("REQ-independent-verification-005 [Adversarial B2]: blind copying eliminated; ungrounded MUST fails closed", () => {
  const harness = buildHarness();
  // Node has required_evidence: ["ev:test-pass"], but receipts have empty evidence_requirements_satisfied: []
  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
    runner_receipts: featureReceipts().map((r) => ({ ...r, evidence_requirements_satisfied: [] })),
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNFULFILLED_MUST");
  assert.match(result.error, /req-repair-001/);
});

test("REQ-independent-verification-006 [Adversarial B3]: temporal strategies without execution_sequence fail closed (no array fallback)", () => {
  const harness = buildHarness();

  // Strict TDD with array order [red, green] but NO execution_sequence
  const strictNoSeq = verifyCandidate({
    ...harness,
    rawEvidence: [raw("red fail"), raw("green pass")],
    runner_receipts: [sampleReceipt("red"), sampleReceipt("green")],
  });
  assert.equal(strictNoSeq.ok, false);
  assert.equal(strictNoSeq.reason_code, "STRATEGY_SEQUENCE_VIOLATION");
  assert.match(strictNoSeq.error, /execution_sequence/i);

  // Bug strategy with array order [red, patch, green] but NO execution_sequence
  const bugNoSeq = verifyCandidate({
    ...harness,
    declaredStrategy: "bug",
    collectors: [
      trustedCollector("runtime-observed"),
      trustedCollector("tool-produced"),
      trustedCollector("runtime-observed"),
    ],
    rawEvidence: [
      raw("red"),
      raw("patch", { provenance: "tool-produced" }),
      raw("green"),
    ],
    runner_receipts: [
      sampleReceipt("red"),
      sampleReceipt("patch"),
      sampleReceipt("green"),
    ],
  });
  assert.equal(bugNoSeq.ok, false);
  assert.equal(bugNoSeq.reason_code, "STRATEGY_SEQUENCE_VIOLATION");
  assert.match(bugNoSeq.error, /execution_sequence/i);
});

test("REQ-independent-verification-006 [Adversarial]: strict-tdd previous_evidence_id chaining mismatch fails closed", () => {
  const harness = buildHarness();
  const redObservation = raw("red fail", {
    execution_sequence: { run_id: "r1", ordinal: 1 },
  });
  const greenObservation = raw("green pass", {
    execution_sequence: {
      run_id: "r1",
      ordinal: 2,
      previous_evidence_id: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
    },
  });
  const result = verifyCandidate({
    ...harness,
    rawEvidence: [redObservation, greenObservation],
    runner_receipts: [sampleReceipt("red"), sampleReceipt("green")],
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "STRATEGY_SEQUENCE_VIOLATION");
  assert.match(result.error, /previous_evidence_id/i);
});

test("REQ-independent-verification-003 [Adversarial]: caller runner_receipts without trusted channel fail closed", () => {
  const harness = buildHarness();
  const result = verifyCandidateRuntime({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
    runner_receipts: featureReceipts(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "UNTRUSTED_RUNNER_RECEIPT");
});

test("REQ-independent-verification-003 [Adversarial]: public verifier facade cannot mint a trusted receipt channel", () => {
  assert.equal(runnerReceipt.createRunnerReceiptChannel, undefined);
  assert.equal(runnerReceipt.issueRunnerReceiptChannel, undefined);
});

test("REQ-independent-verification-003 [Adversarial]: failed receipt cannot satisfy evidence tokens", () => {
  const harness = buildHarness({
    runner_receipts: featureReceipts().map((receipt, index) => index === 0
      ? { ...receipt, outcome: "failed" }
      : receipt),
  });
  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "INVALID_RUNNER_RECEIPT");
});

test("REQ-independent-verification-003 [Adversarial]: failed success role cannot satisfy strategy shape", () => {
  const harness = buildHarness({
    runner_receipts: featureReceipts().map((receipt, index) => index === 0
      ? { ...receipt, evidence_requirements_satisfied: [], outcome: "failed" }
      : receipt),
  });
  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "INVALID_RUNNER_RECEIPT");
});

test("REQ-independent-verification-006 [Adversarial]: temporal evidence requires one run and complete chaining", () => {
  const harness = buildHarness();
  const differentRun = verifyCandidate({
    ...harness,
    rawEvidence: [
      raw("red fail", { execution_sequence: { run_id: "run-a", ordinal: 1 } }),
      raw("green pass", { execution_sequence: { run_id: "run-b", ordinal: 2 } }),
    ],
    runner_receipts: [sampleReceipt("red"), sampleReceipt("green")],
  });
  assert.equal(differentRun.ok, false);
  assert.equal(differentRun.reason_code, "STRATEGY_SEQUENCE_VIOLATION");

  const missingPrevious = verifyCandidate({
    ...harness,
    rawEvidence: [
      raw("red fail", { execution_sequence: { run_id: "run-a", ordinal: 1 } }),
      raw("green pass", { execution_sequence: { run_id: "run-a", ordinal: 2 } }),
    ],
    runner_receipts: [
      sampleReceipt("red", [], { execution_sequence: { run_id: "run-a", ordinal: 1 } }),
      sampleReceipt("green", ["ev:test-pass"], { execution_sequence: { run_id: "run-a", ordinal: 2 } }),
    ],
  });
  assert.equal(missingPrevious.ok, false);
  assert.equal(missingPrevious.reason_code, "STRATEGY_SEQUENCE_VIOLATION");
  assert.match(missingPrevious.error, /previous_evidence_id/i);
});

test("REQ-independent-verification-003 [Adversarial]: receipt without evidence_id fails schema validation", () => {
  const harness = buildHarness();
  const rawEvidence = featureEvidence();
  const receipts = featureReceipts().map((spec, index) => {
    const normalized = normalizeEvidence(rawEvidence[index], harness.candidate, harness.executionGraph, harness.collector);
    return createRunnerReceipt({
      candidate_id: harness.candidate.candidate_id,
      evidence_id: normalized.evidence.evidence_id,
      node_id: normalized.evidence.node_id,
      role: spec.role,
      satisfied_tokens: spec.evidence_requirements_satisfied,
      outcome: "passed",
      issuer_id: "node-test",
      transport: "tool-execution-transport",
    });
  });
  const invalid = { ...receipts[0] };
  delete invalid.evidence_id;
  invalid.receipt_id = computeRunnerReceiptId(invalid);
  const input = {
    ...harness,
    rawEvidence,
    declaredStrategy: "feature",
    runnerReceiptChannel: createTestRunnerReceiptChannelFromReceipts([invalid, ...receipts.slice(1)]),
  };
  delete input.runner_receipts;
  const result = verifyCandidateRuntime(input);

  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "INVALID_RUNNER_RECEIPT");
});

test("REQ-independent-verification-003 [Adversarial]: receipt for E1 cannot bind E2 by position", () => {
  const harness = buildHarness();
  const rawEvidence = featureEvidence();
  const firstEvidence = normalizeEvidence(
    rawEvidence[0],
    harness.candidate,
    harness.executionGraph,
    harness.collector
  ).evidence;
  const receiptSpecs = featureReceipts().map((receipt, index) => index === 1
    ? { ...receipt, evidence_id: firstEvidence.evidence_id }
    : receipt);
  const input = {
    ...harness,
    declaredStrategy: "feature",
    rawEvidence,
    runnerReceiptChannel: createTestRunnerReceiptChannel({
      ...harness,
      rawEvidence,
      receiptSpecs,
    }),
  };
  delete input.runner_receipts;
  const result = verifyCandidateRuntime(input);

  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "RUNNER_RECEIPT_BINDING_MISMATCH");
});

test("REQ-independent-verification-006 [Adversarial]: bug GREEN must chain to PATCH EvidenceId", () => {
  const harness = buildHarness();
  const rawEvidence = [
    raw("red", { execution_sequence: { run_id: "bug-run", ordinal: 1 } }),
    raw("patch", { provenance: "tool-produced", execution_sequence: { run_id: "bug-run", ordinal: 2 } }),
    raw("green", { execution_sequence: { run_id: "bug-run", ordinal: 3 } }),
  ];
  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "bug",
    collectors: [
      trustedCollector("runtime-observed"),
      trustedCollector("tool-produced"),
      trustedCollector("runtime-observed"),
    ],
    rawEvidence,
    runner_receipts: [
      sampleReceipt("red"),
      sampleReceipt("patch"),
      sampleReceipt("green", ["ev:test-pass"], {
        execution_sequence: {
          run_id: "bug-run",
          ordinal: 3,
          previous_evidence_id: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        },
      }),
    ],
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "STRATEGY_SEQUENCE_VIOLATION");
});

test("REQ-independent-verification-010: Successful challenge results satisfy complementary verification", () => {
  const { createChallengePlan } = require("../adversarial-challenges/planner.js");
  const { emitChallengeResult } = require("../adversarial-challenges/runner.js");
  const harness = buildHarness();

  const challengePlan = createChallengePlan({
    candidateId: harness.candidate.candidate_id,
    nodeId: "repair-core",
    policySnapshotId: harness.executionGraph.policy_snapshot_id,
    evidenceStrategy: "feature",
  });

  const challengeResults = challengePlan.selected.map((type) =>
    emitChallengeResult({
      planId: challengePlan.plan_id,
      candidateId: harness.candidate.candidate_id,
      policySnapshotId: harness.executionGraph.policy_snapshot_id,
      evidenceStrategy: "feature",
      challengeType: type,
      outcome: "passed",
      nodeId: "repair-core",
    })
  );

  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
    challengePlan,
    challengeResults,
  });

  assert.equal(result.ok, true, result.error || result.reason_code);
  assert.equal(result.verification.verdict, "PASS");
});

test("REQ-independent-verification-010: Failed challenge result fails closed with CHALLENGE_VERIFICATION_FAILED", () => {
  const { createChallengePlan } = require("../adversarial-challenges/planner.js");
  const { emitChallengeResult } = require("../adversarial-challenges/runner.js");
  const harness = buildHarness();

  const challengePlan = createChallengePlan({
    candidateId: harness.candidate.candidate_id,
    nodeId: "repair-core",
    policySnapshotId: harness.executionGraph.policy_snapshot_id,
    evidenceStrategy: "feature",
  });

  const challengeResults = challengePlan.selected.map((type, index) =>
    emitChallengeResult({
      planId: challengePlan.plan_id,
      candidateId: harness.candidate.candidate_id,
      policySnapshotId: harness.executionGraph.policy_snapshot_id,
      evidenceStrategy: "feature",
      challengeType: type,
      outcome: index === 0 ? "failed" : "passed",
      nodeId: "repair-core",
      details: index === 0 ? { reason: "COMPLACENT_TEST_DETECTED" } : {},
    })
  );

  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
    challengePlan,
    challengeResults,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "CHALLENGE_VERIFICATION_FAILED");
  assert.equal(Object.prototype.hasOwnProperty.call(result, "verification"), false);
});

test("REQ-independent-verification-010: Budget exhaustion during challenges fails closed with CHALLENGE_BUDGET_EXHAUSTED", () => {
  const { createChallengePlan } = require("../adversarial-challenges/planner.js");
  const harness = buildHarness();

  const challengePlan = createChallengePlan({
    candidateId: harness.candidate.candidate_id,
    nodeId: "repair-core",
    policySnapshotId: harness.executionGraph.policy_snapshot_id,
    evidenceStrategy: "feature",
  });

  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
    challengePlan,
    challenge_budget_exhausted: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "CHALLENGE_BUDGET_EXHAUSTED");
  assert.equal(Object.prototype.hasOwnProperty.call(result, "verification"), false);
});

test("REQ-independent-verification-010: Challenge results alone cannot grant PASS without strategy minimums", () => {
  const { createChallengePlan } = require("../adversarial-challenges/planner.js");
  const { emitChallengeResult } = require("../adversarial-challenges/runner.js");
  const harness = buildHarness();

  const challengePlan = createChallengePlan({
    candidateId: harness.candidate.candidate_id,
    nodeId: "repair-core",
    policySnapshotId: harness.executionGraph.policy_snapshot_id,
    evidenceStrategy: "feature",
  });

  const challengeResults = challengePlan.selected.map((type) =>
    emitChallengeResult({
      planId: challengePlan.plan_id,
      candidateId: harness.candidate.candidate_id,
      policySnapshotId: harness.executionGraph.policy_snapshot_id,
      evidenceStrategy: "feature",
      challengeType: type,
      outcome: "passed",
      nodeId: "repair-core",
    })
  );

  // Missing negative evidence for feature strategy
  const missingNegativeEvidence = [
    raw("acceptance: ok"),
    raw("invariants: ok"),
    raw("contract: ok"),
  ];

  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: missingNegativeEvidence,
    runner_receipts: [
      sampleReceipt("acceptance"),
      sampleReceipt("invariants"),
      sampleReceipt("contract"),
    ],
    challengePlan,
    challengeResults,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason_code, "MISSING_NEGATIVE");
  assert.equal(Object.prototype.hasOwnProperty.call(result, "verification"), false);
});

test("REQ-independent-verification-010: verifyCandidateWithChallenges accepts exact set and suppresses K6d otherwise", () => {
  const { createChallengePlan } = require("../adversarial-challenges/planner.js");
  const { emitChallengeResult } = require("../adversarial-challenges/runner.js");
  const harness = buildHarness();

  function boundPlan() {
    return createChallengePlan({
      candidateId: harness.candidate.candidate_id,
      nodeId: "repair-core",
      policySnapshotId: harness.executionGraph.policy_snapshot_id,
      evidenceStrategy: "feature",
    });
  }

  function passedResults(plan) {
    return plan.selected.map((type) =>
      emitChallengeResult({
        planId: plan.plan_id,
        candidateId: harness.candidate.candidate_id,
        policySnapshotId: harness.executionGraph.policy_snapshot_id,
        evidenceStrategy: "feature",
        challengeType: type,
        outcome: "passed",
        nodeId: "repair-core",
      })
    );
  }

  const acceptedPlan = boundPlan();
  const accepted = verifyCandidateWithChallenges({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
    challengePlan: acceptedPlan,
    challengeResults: passedResults(acceptedPlan),
  });
  assert.equal(accepted.ok, true, accepted.error || accepted.reason_code);
  assert.equal(accepted.challenge_verification.status, "accepted");
  assert.equal(k6dEligible(accepted), true);
  assert.equal(accepted.assurance_graph.nodes.some((node) => node.kind === "challenge-plan"), true);

  const legacy = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
    challengePlan: acceptedPlan,
    challengeResults: passedResults(acceptedPlan),
  });
  assert.equal(legacy.ok, true, legacy.error || legacy.reason_code);
  assert.notEqual(legacy.challenge_verification && legacy.challenge_verification.status, "accepted");
  assert.equal(k6dEligible(legacy), false);

  const missing = verifyCandidateWithChallenges({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
    challengePlan: boundPlan(),
    challengeResults: [],
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason_code, "CHALLENGE_INTEGRITY_INVALID");
  assert.equal(k6dEligible(missing), false);
  assert.equal(Object.prototype.hasOwnProperty.call(missing, "verification"), false);

  const duplicatePlan = boundPlan();
  const duplicateResults = passedResults(duplicatePlan);
  const duplicate = verifyCandidateWithChallenges({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
    challengePlan: duplicatePlan,
    challengeResults: [duplicateResults[0], duplicateResults[0]],
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason_code, "CHALLENGE_INTEGRITY_INVALID");
  assert.equal(k6dEligible(duplicate), false);

  const foreignPlan = boundPlan();
  const foreignResults = passedResults(foreignPlan);
  const foreign = {
    ...foreignResults[0],
    candidate_id: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  };
  foreign.result_id = require("../adversarial-challenges/integrity.js").computeChallengeResultId(foreign);
  const foreignGate = verifyCandidateWithChallenges({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: featureEvidence(),
    challengePlan: foreignPlan,
    challengeResults: [foreign, foreignResults[1]],
  });
  assert.equal(foreignGate.ok, false);
  assert.equal(foreignGate.reason_code, "CHALLENGE_INTEGRITY_INVALID");
  assert.equal(k6dEligible(foreignGate), false);
});

