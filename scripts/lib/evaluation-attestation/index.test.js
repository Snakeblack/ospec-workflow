"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { freezeCandidate, computeSourceSnapshotId } = require("../execution-identities/index.js");
const {
  startK7ReviewLineage,
  startReviewLineage,
  beginLens,
  recordLensResult,
  freezeFindings,
  beginCorrection,
  recordCorrection,
  applyTargetedValidation,
} = require("../review-lineage.js");
const { compileExecutionGraph, createPolicySnapshot } = require("../execution-graph/index.js");
const { computeTreeDigest } = require("../worker-workspace.js");
const { verifyCandidate } = require("../independent-verifier/index.js");
const { createTestRunnerReceiptChannel } = require("../test-support/k6b-runner-receipt.js");
const { createK7ReviewSelection } = require("../review-k7-binding.js");
const { sha256Fingerprint } = require("../canonical-json.js");
const { validateInstance, loadSchemaById } = require("../kernel-schema-validator.js");
const {
  createCandidateEvaluationAttestation,
  validateCandidateEvaluationAttestation,
} = require("./index.js");

const ROOT = require("node:path").resolve(__dirname, "../../..");
const ATTESTATION_SCHEMA_ID = "ospec://schemas/kernel/candidate-evaluation-attestation/v1";

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
  contract_id: "contract:k8-attestation",
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
const TRUST_RULE = `k7/v1:obligation:${OBLIGATION.id}=trust`;

function makeK6bResult(effectiveRules, { repository = "k8-attestation", obligations = [OBLIGATION] } = {}) {
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

function buildK7Chain(effectiveRules, { repository = "k8-attestation", findings = [], freeze = true } = {}) {
  const input = {
    ...makeK6bResult(effectiveRules, { repository }),
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
      result: { findings },
    });
  }
  if (freeze) {
    lineage = freezeFindings(lineage, { expected_revision: lineage.revision, request_id: "freeze", issuance: input });
  }
  return { input, binding: issued.binding, lineage };
}

function correctedApprovedK7Chain(effectiveRules) {
  const chain = buildK7Chain(effectiveRules, {
    findings: [{ severity: "CRITICAL", summary: "repair boundary", acceptance_criteria: "preserve K7 binding" }],
  });
  assert.equal(chain.lineage.status, "correction-required");
  let lineage = chain.lineage;
  const findingId = lineage.findings[0].id;
  lineage = beginCorrection(lineage, {
    expected_revision: lineage.revision, request_id: "correct", finding_ids: [findingId], paths: ["src/index.js"],
    base_candidate_id: lineage.current_candidate_id, forecast_lines: 1,
  });
  const corrected = freezeCandidate({
    repository_id: lineage.current_candidate.repository_id,
    projection: lineage.current_candidate.projection,
    base_tree: lineage.current_candidate.base_tree,
    candidate_tree: `sha256:${"f".repeat(64)}`,
    diffText: K7_DIFF,
    paths: lineage.current_candidate.paths,
    predecessorCandidate: lineage.current_candidate,
  });
  lineage = recordCorrection(lineage, {
    expected_revision: lineage.revision, request_id: "record",
    base_candidate_id: lineage.pending_correction.base_candidate_id,
    paths: ["src/index.js"], actual_changed_lines: 1, corrected_candidate: corrected,
  });
  lineage = applyTargetedValidation(lineage, {
    expected_revision: lineage.revision, request_id: "validate",
    outcomes: [{ id: findingId, status: "resolved" }],
    regression: { detected: false, evidence: ["focused test passed"] }, follow_ups: [],
  });
  assert.equal(lineage.status, "approved");
  return { ...chain, lineage };
}

function issueAttestation(chain, overrides = {}) {
  return createCandidateEvaluationAttestation({
    binding: chain.binding,
    lineage: chain.lineage,
    issuance: chain.input,
    phase: { status: "success", verify_outcome: "PASS" },
    issuer_version: "ospec-issuer/1.0.0",
    runtime_version: `node/${process.versions.node}`,
    issued_at: "2026-09-28T10:00:00.000Z",
    ...overrides,
  });
}

function validateAttestation(attestation, chain, overrides = {}) {
  return validateCandidateEvaluationAttestation(attestation, {
    binding: chain.binding,
    lineage: chain.lineage,
    issuance: chain.input,
    expects: "evaluation",
    ...overrides,
  });
}

function happyAttestation(chain = buildK7Chain([RUNTIME_RULE])) {
  const created = issueAttestation(chain);
  assert.equal(created.ok, true, created.error || created.reason_code);
  return created.attestation;
}

function rehashAttestation(attestation) {
  const body = { ...attestation };
  delete body.attestation_id;
  return { ...body, attestation_id: sha256Fingerprint("candidate-evaluation-attestation/v1", body) };
}

test("K8 constructor emits a frozen schema-valid attestation binding the replayed K7 authority chain", () => {
  const chain = buildK7Chain([RUNTIME_RULE]);
  const attestation = happyAttestation(chain);

  assert.equal(attestation.schema_version, 1);
  assert.equal(attestation.kind, "candidate-evaluation-attestation");
  assert.equal(attestation.outcome, "approved-for-evaluation");
  assert.equal(attestation.valid_for, "evaluation");
  assert.equal(attestation.candidate_id, chain.binding.candidate_id);
  assert.equal(attestation.contract_digest, chain.binding.contract_digest);
  assert.equal(attestation.graph_digest, chain.binding.execution_graph_id);
  assert.equal(attestation.policy_digest, chain.binding.policy_snapshot_id);
  assert.equal(attestation.findings_digest, chain.lineage.findings_digest);

  const manifest = {
    kind: "equivalence-manifest/v1",
    graph_id: chain.binding.issuance.k6b.assurance_graph.graph_id,
    candidate_id: chain.binding.candidate_id,
  };
  assert.equal(
    attestation.evidence_root_digest,
    sha256Fingerprint("equivalence-manifest/v1", { graph_id: manifest.graph_id, candidate_id: manifest.candidate_id })
  );

  const { attestation_id, ...body } = attestation;
  assert.equal(attestation_id, sha256Fingerprint("candidate-evaluation-attestation/v1", body));
  assert.equal(Object.isFrozen(attestation), true);
  assert.throws(() => { attestation.outcome = "approved-for-delivery"; }, TypeError);

  const schema = loadSchemaById(ATTESTATION_SCHEMA_ID, { rootDir: ROOT });
  const schemaResult = validateInstance(schema, attestation);
  assert.equal(schemaResult.valid, true, JSON.stringify(schemaResult.errors));

  const replayed = issueAttestation(chain);
  assert.deepEqual(replayed.attestation, attestation);

  const validated = validateAttestation(attestation, chain);
  assert.deepEqual(validated, { ok: true });
});

test("K8 validator recomputes every digest and rejects tampered claims", () => {
  const chain = buildK7Chain([RUNTIME_RULE]);
  const attestation = happyAttestation(chain);

  for (const field of [
    "candidate_id",
    "contract_digest",
    "graph_digest",
    "evidence_root_digest",
    "findings_digest",
    "policy_digest",
    "expected_revision",
    "authority_revision",
  ]) {
    const tampered = { ...attestation, [field]: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" };
    const result = validateAttestation(tampered, chain);
    assert.equal(result.ok, false, field);
    assert.equal(result.reason_code, "EVALUATION_DIGEST_MISMATCH", field);
    assert.match(result.error, new RegExp(field), "error must name the divergent field");
  }

  const metadataTampered = { ...attestation, issuer_version: "rogue-issuer/9.9.9" };
  assert.equal(validateAttestation(metadataTampered, chain).reason_code, "EVALUATION_IDENTITY_MISMATCH");

  const rehashed = rehashAttestation({ ...attestation, findings_digest: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" });
  assert.equal(validateAttestation(rehashed, chain).reason_code, "EVALUATION_DIGEST_MISMATCH");
});

test("K8 rejects K7 bindings that fail replay validation", () => {
  const chain = buildK7Chain([RUNTIME_RULE]);
  const forgedBinding = structuredClone(chain.binding);
  forgedBinding.selection.selected_domains = ["trust"];
  const forgedBody = { ...forgedBinding };
  delete forgedBody.binding_id;
  forgedBinding.binding_id = sha256Fingerprint("k7-review-binding/v1", forgedBody);

  const created = issueAttestation(chain, { binding: forgedBinding });
  assert.equal(created.ok, false);
  assert.equal(created.reason_code, "EVALUATION_K7_BINDING_INVALID");

  const attestation = happyAttestation(chain);
  const validated = validateAttestation(attestation, chain, { binding: forgedBinding });
  assert.equal(validated.ok, false);
  assert.equal(validated.reason_code, "EVALUATION_K7_BINDING_INVALID");

  const notABinding = issueAttestation(chain, { binding: { kind: "k7-review-binding/v1" } });
  assert.equal(notABinding.reason_code, "EVALUATION_K7_BINDING_INVALID");
});

test("K8 emits zero approbatory attestation for K7_NO_MODEL_DEFERRED bindings", () => {
  const noModelInput = {
    ...makeK6bResult(["k7/v1:no-model=allow"], { obligations: [] }),
    residual: { obligations: [], signals: [] },
  };
  assert.equal(createK7ReviewSelection(noModelInput).reason_code, "K7_NO_MODEL_DEFERRED");
  const bindingShaped = { kind: "k7-review-binding/v1", binding_id: `sha256:${"0".repeat(64)}`, issuance: noModelInput };

  const created = issueAttestation({ input: noModelInput, binding: bindingShaped, lineage: null });
  assert.equal(created.ok, false);
  assert.equal(created.reason_code, "EVALUATION_K7_NO_MODEL_DEFERRED");

  const attestation = happyAttestation();
  const validated = validateCandidateEvaluationAttestation(attestation, {
    binding: bindingShaped,
    lineage: null,
    issuance: noModelInput,
    expects: "evaluation",
  });
  assert.equal(validated.ok, false);
  assert.equal(validated.reason_code, "EVALUATION_K7_NO_MODEL_DEFERRED");
});

test("K8 rejects absent, non-v3, tampered, foreign, or unapproved review lineages", () => {
  const chain = buildK7Chain([RUNTIME_RULE]);
  const attestation = happyAttestation(chain);

  assert.equal(issueAttestation(chain, { lineage: null }).reason_code, "EVALUATION_LINEAGE_INVALID");
  assert.equal(validateAttestation(attestation, chain, { lineage: null }).reason_code, "EVALUATION_LINEAGE_INVALID");

  const legacyCandidate = {
    projection: chain.binding.candidate.projection,
    base_tree: chain.binding.candidate.base_tree,
    candidate_tree: chain.binding.candidate.candidate_tree,
    diff_hash: chain.binding.candidate.diff_hash,
    paths_digest: `sha256:${"1".repeat(64)}`,
    authored_lines: 1,
    original_changed_lines: 2,
    paths: ["src/index.js"],
  };
  const legacyLineage = startReviewLineage({
    classification: "normal",
    evidence_fingerprint: "fingerprint",
    candidate: legacyCandidate,
    selected_dimensions: ["risk"],
  });
  assert.equal(issueAttestation(chain, { lineage: legacyLineage }).reason_code, "EVALUATION_LINEAGE_INVALID");
  assert.equal(validateAttestation(attestation, chain, { lineage: legacyLineage }).reason_code, "EVALUATION_LINEAGE_INVALID");

  const tamperedLineage = structuredClone(chain.lineage);
  tamperedLineage.findings_digest = `sha256:${"2".repeat(64)}`;
  assert.equal(issueAttestation(chain, { lineage: tamperedLineage }).reason_code, "EVALUATION_LINEAGE_INVALID");

  const foreignChain = buildK7Chain([TRUST_RULE]);
  // The foreign lineage is internally authentic (its own issuance replays),
  // so only the binding-identity comparison can expose the substitution.
  assert.equal(
    issueAttestation(chain, { lineage: foreignChain.lineage, issuance: foreignChain.input }).reason_code,
    "EVALUATION_LINEAGE_FOREIGN"
  );
  assert.equal(
    validateAttestation(attestation, chain, { lineage: foreignChain.lineage, issuance: foreignChain.input }).reason_code,
    "EVALUATION_LINEAGE_FOREIGN"
  );
  // A foreign lineage paired with a mismatched issuance fails the replay itself.
  assert.equal(issueAttestation(chain, { lineage: foreignChain.lineage }).reason_code, "EVALUATION_LINEAGE_INVALID");

  const midReview = buildK7Chain([RUNTIME_RULE], { freeze: false });
  assert.equal(midReview.lineage.status, "reviewing");
  assert.equal(issueAttestation(chain, { lineage: midReview.lineage }).reason_code, "EVALUATION_LINEAGE_NOT_APPROVED");

  const blocking = buildK7Chain([RUNTIME_RULE], {
    findings: [{ severity: "CRITICAL", summary: "unresolved", acceptance_criteria: "must fix" }],
  });
  assert.equal(blocking.lineage.status, "correction-required");
  assert.equal(issueAttestation(chain, { lineage: blocking.lineage }).reason_code, "EVALUATION_LINEAGE_NOT_APPROVED");
  assert.equal(validateAttestation(attestation, chain, { lineage: blocking.lineage }).reason_code, "EVALUATION_LINEAGE_NOT_APPROVED");
});

test("K8 rejects attesting a corrected successor candidate under the genesis evidence root", () => {
  const chain = correctedApprovedK7Chain([RUNTIME_RULE]);
  assert.notEqual(chain.lineage.current_candidate_id, chain.binding.candidate_id);

  const created = issueAttestation(chain);
  assert.equal(created.ok, false);
  assert.equal(created.reason_code, "EVALUATION_CANDIDATE_DRIFT");

  const attestation = happyAttestation(buildK7Chain([RUNTIME_RULE]));
  const validated = validateAttestation(attestation, chain);
  assert.equal(validated.ok, false);
  assert.equal(validated.reason_code, "EVALUATION_CANDIDATE_DRIFT");
});

test("K8 rejects phase success with a FAIL verify_outcome and non-success phase closures", () => {
  const chain = buildK7Chain([RUNTIME_RULE]);

  const failOutcome = issueAttestation(chain, { phase: { status: "success", verify_outcome: "FAIL" } });
  assert.equal(failOutcome.ok, false);
  assert.equal(failOutcome.reason_code, "EVALUATION_VERIFY_OUTCOME_FAIL");

  const failedPhase = issueAttestation(chain, { phase: { status: "failed", verify_outcome: "PASS" } });
  assert.equal(failedPhase.reason_code, "EVALUATION_PHASE_NOT_SUCCESS");

  const stalePhase = issueAttestation(chain, { phase: { status: "stale", verify_outcome: "PASS" } });
  assert.equal(stalePhase.reason_code, "EVALUATION_PHASE_NOT_SUCCESS");

  assert.equal(issueAttestation(chain, { phase: null }).reason_code, "EVALUATION_INPUT_INVALID");
  assert.equal(issueAttestation(chain, { phase: { status: "success" } }).reason_code, "EVALUATION_INPUT_INVALID");
});

test("K8 attestations of a different candidate, contract, graph, or policy are not interchangeable", () => {
  const runtimeChain = buildK7Chain([RUNTIME_RULE]);
  const trustChain = buildK7Chain([TRUST_RULE]);
  const otherCandidateChain = buildK7Chain([RUNTIME_RULE], { repository: "k8-attestation-other" });

  const runtimeAttestation = happyAttestation(runtimeChain);
  const trustAttestation = happyAttestation(trustChain);
  const otherAttestation = happyAttestation(otherCandidateChain);

  assert.equal(runtimeAttestation.candidate_id, trustAttestation.candidate_id);
  assert.notEqual(runtimeAttestation.policy_digest, trustAttestation.policy_digest);
  assert.notEqual(runtimeAttestation.attestation_id, trustAttestation.attestation_id);
  assert.notEqual(runtimeAttestation.candidate_id, otherAttestation.candidate_id);

  assert.deepEqual(validateAttestation(runtimeAttestation, runtimeChain), { ok: true });
  const policySwap = validateAttestation(trustAttestation, runtimeChain);
  assert.equal(policySwap.ok, false);
  assert.equal(policySwap.reason_code, "EVALUATION_FOREIGN_ATTESTATION");

  const candidateSwap = validateAttestation(otherAttestation, runtimeChain);
  assert.equal(candidateSwap.ok, false);
  assert.equal(candidateSwap.reason_code, "EVALUATION_FOREIGN_ATTESTATION");

  const reverseSwap = validateAttestation(runtimeAttestation, otherCandidateChain);
  assert.equal(reverseSwap.ok, false);
  assert.equal(reverseSwap.reason_code, "EVALUATION_FOREIGN_ATTESTATION");
});

test("K8 rejects stale authority revisions and tampered revision claims", () => {
  const chain = buildK7Chain([RUNTIME_RULE]);
  const attestation = happyAttestation(chain);

  const staleLineage = structuredClone(chain.lineage);
  staleLineage.revision += 1;
  const stale = validateAttestation(attestation, chain, { lineage: staleLineage });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason_code, "EVALUATION_DIGEST_MISMATCH");
  assert.match(stale.error, /authority_revision/);

  const claimedAuthority = rehashAttestation({ ...attestation, authority_revision: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" });
  assert.equal(validateAttestation(claimedAuthority, chain).reason_code, "EVALUATION_DIGEST_MISMATCH");

  const claimedExpected = rehashAttestation({ ...attestation, expected_revision: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" });
  assert.equal(validateAttestation(claimedExpected, chain).reason_code, "EVALUATION_DIGEST_MISMATCH");
});

test("K8 approved-for-evaluation never validates as a delivery pass", () => {
  const chain = buildK7Chain([RUNTIME_RULE]);
  const attestation = happyAttestation(chain);

  const delivery = validateAttestation(attestation, chain, { expects: "delivery" });
  assert.equal(delivery.ok, false);
  assert.equal(delivery.reason_code, "EVALUATION_CONTEXT_MISMATCH");
  assert.match(delivery.error, /delivery/i);

  const preCommit = validateAttestation(attestation, chain, { expects: "pre-commit" });
  assert.equal(preCommit.reason_code, "EVALUATION_CONTEXT_MISMATCH");

  const missing = validateCandidateEvaluationAttestation(attestation, {
    binding: chain.binding,
    lineage: chain.lineage,
    issuance: chain.input,
  });
  assert.equal(missing.ok, false);
  assert.equal(missing.reason_code, "EVALUATION_INPUT_INVALID");

  const forgedValidFor = rehashAttestation({ ...attestation, valid_for: "delivery" });
  assert.equal(validateAttestation(forgedValidFor, chain).reason_code, "EVALUATION_ATTESTATION_SCHEMA_INVALID");
});

test("K8 rejects malformed constructor and validator inputs", () => {
  const chain = buildK7Chain([RUNTIME_RULE]);

  assert.equal(issueAttestation(chain, { unknown_key: true }).reason_code, "EVALUATION_INPUT_INVALID");
  for (const key of ["binding", "lineage", "issuance", "phase", "issuer_version", "runtime_version", "issued_at"]) {
    const input = {
      binding: chain.binding,
      lineage: chain.lineage,
      issuance: chain.input,
      phase: { status: "success", verify_outcome: "PASS" },
      issuer_version: "ospec-issuer/1.0.0",
      runtime_version: `node/${process.versions.node}`,
      issued_at: "2026-09-28T10:00:00.000Z",
    };
    delete input[key];
    const result = createCandidateEvaluationAttestation(input);
    assert.equal(result.ok, false, key);
    assert.equal(result.reason_code, "EVALUATION_INPUT_INVALID", key);
  }

  assert.equal(issueAttestation(chain, { issuer_version: "" }).reason_code, "EVALUATION_METADATA_INVALID");
  assert.equal(issueAttestation(chain, { runtime_version: "" }).reason_code, "EVALUATION_METADATA_INVALID");
  assert.equal(issueAttestation(chain, { issued_at: "" }).reason_code, "EVALUATION_METADATA_INVALID");

  assert.equal(createCandidateEvaluationAttestation(null).reason_code, "EVALUATION_INPUT_INVALID");
  const attestation = happyAttestation(chain);
  assert.equal(validateCandidateEvaluationAttestation(attestation, null).reason_code, "EVALUATION_INPUT_INVALID");
  assert.equal(
    validateCandidateEvaluationAttestation(null, { binding: chain.binding, lineage: chain.lineage, issuance: chain.input, expects: "evaluation" }).reason_code,
    "EVALUATION_ATTESTATION_SCHEMA_INVALID"
  );
});
