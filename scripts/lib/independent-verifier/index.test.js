"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { freezeCandidate } = require("../execution-identities/index.js");
const { compileExecutionGraph, createPolicySnapshot } = require("../execution-graph/index.js");
const { computeTreeDigest } = require("../worker-workspace.js");
const { verifyCandidate, selectStrategy } = require("./index.js");
const { computeEvidenceId, digestRawBytes } = require("./evidence.js");
const { computeVerificationId } = require("./verdict.js");

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
  };
}

function raw(role, bytes, extra = {}) {
  return {
    role,
    bytes,
    provenance: extra.provenance || "runtime-observed",
    origin: extra.origin || `role:${role}`,
    node_id: extra.node_id || "repair-core",
    obligation_ids: extra.obligation_ids || ["req-repair-001"],
    ...extra.fields,
  };
}

function featureEvidence() {
  return [
    raw("acceptance", "acceptance: ok"),
    raw("invariants", "invariants: ok"),
    raw("contract", "contract: ok"),
    raw("negative", "negative: rejects bad input"),
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
      raw("acceptance", "acceptance"),
      raw("invariants", "invariants"),
      raw("contract", "contract"),
    ],
  });
  assert.equal(missingNegative.ok, false);
  assert.equal(missingNegative.reason_code, "MISSING_NEGATIVE");

  const characterizationOnly = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: [
      raw("characterization-before", "before"),
      raw("characterization-after", "after"),
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
    rawEvidence: [raw("red", "red fail"), raw("green", "green pass")],
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
    rawEvidence: [raw("green", "green"), raw("patch", "patch", { provenance: "tool-produced" })],
  });
  assert.equal(greenWithoutRed.ok, false);

  const behavioralDelta = verifyCandidate({
    ...harness,
    declaredStrategy: "refactor",
    rawEvidence: [
      raw("characterization-before", "before"),
      raw("characterization-after", "after"),
      raw("no-behavior-change", "same"),
      raw("behavioral-delta", "changed"),
    ],
  });
  assert.equal(behavioralDelta.ok, false);
  assert.equal(behavioralDelta.reason_code, "MISSING_NEGATIVE");

  const skippedRollback = verifyCandidate({
    ...harness,
    declaredStrategy: "migration",
    rawEvidence: [
      raw("dry-run", "dry"),
      raw("incompatibility", "incompat"),
      raw("idempotent-re-run", "idempotent"),
    ],
  });
  assert.equal(skippedRollback.ok, false);
  assert.equal(skippedRollback.reason_code, "MISSING_STRATEGY_MINIMUM");

  const docsOnly = verifyCandidate({
    ...harness,
    declaredStrategy: "config-docs",
    rawEvidence: [raw("docs-only", "readme")],
  });
  assert.equal(docsOnly.ok, false);
});

test("REQ-independent-verification-002: config-docs anyOf requires install or consume", () => {
  const harness = buildHarness();
  const missingInstallOrConsume = verifyCandidate({
    ...harness,
    declaredStrategy: "config-docs",
    rawEvidence: [raw("schema-parser", "parsed schema"), raw("smoke", "smoke ok")],
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
  const result = verifyCandidate({
    ...harness,
    declaredStrategy: "feature",
    rawEvidence: [
      ...featureEvidence(),
      raw("annotation", "human reviewed", { provenance: "human-decision" }),
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
      raw("acceptance", "acceptance: ok"),
      raw("invariants", "invariants: ok"),
      raw("negative", "negative: rejects bad input"),
    ],
  });
  assert.equal(missingAnyOf.ok, false);
  assert.equal(missingAnyOf.reason_code, "MISSING_STRATEGY_MINIMUM");
});

test("REQ-independent-verification-002: Strict TDD rejects host-attested red and green", () => {
  const harness = buildHarness();
  const result = verifyCandidate({
    ...harness,
    rawEvidence: [
      raw("red", "red fail", { provenance: "host-attested" }),
      raw("green", "green pass", { provenance: "host-attested" }),
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
    rawEvidence: [{ ...raw("acceptance", "x"), verdict: "PASS" }, ...featureEvidence().slice(1)],
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
