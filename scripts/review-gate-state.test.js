"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  readReviewGate,
  planReviewGate,
  mergeReviewGateAudit,
  planLineageGate,
} = require("./lib/review-gate-state.js");
const { startReviewLineage, freezeFindings, migrateReviewLineage, beginLens, recordLensResult } = require("./lib/review-lineage.js");
const { classifyQualityReview, normalizeQualityReviewEvidence, normalizeReviewEvidence, deriveReviewDimensions } = require("./lib/review-dimensions.js");

const dimensions = (selected) => Object.fromEntries(
  ["risk", "reliability", "resilience", "readability"].map((id) => [id, {
    selected: selected.includes(id),
    reasons: [{ code: selected.includes(id) ? "generalist-escalation" : `no-${id}-signal`, source: selected.includes(id) ? "generalist" : "classifier", detail: id, precedence: selected.includes(id) ? 3 : 5 }],
  }]),
);

const decision = (classification, selected) => deriveReviewDimensions(normalizeReviewEvidence({
  classification,
  verify: { status: "success", findings: [] },
  diff: "diff --git a/docs/a.md b/docs/a.md\n--- a/docs/a.md\n+++ b/docs/a.md\n@@ -0,0 +1 @@\n+documentation only",
  paths: ["docs/a.md"],
  capabilities: ["docs"],
  dependencies: [],
  operationTypes: ["modify"],
  designRisks: [],
}), {
  status: selected.length ? "needs-specialist" : "clear",
  specialists: selected,
  reason: selected.length ? generalistReference(selected) : "signals=none;dimensions=none",
});

function generalistReference(selected) {
  const signalByDimension = {
    risk: "diff-auth-permission",
    reliability: "verify-reliability",
    resilience: "verify-resilience",
    readability: "verify-readability",
  };
  return `signals=${selected.map((id) => signalByDimension[id]).sort().join(",")};dimensions=${selected.join(",")}`;
}

test("route without the gate is a strict no-op", () => {
  const plan = planReviewGate({ routeGates: [], existingGate: { status: "historical" } });
  assert.deepEqual(plan, {
    status: "skipped",
    run_generalist: false,
    dispatch: [],
    archive_allowed: true,
    gate: { status: "historical" },
  });
});

test("E0.3 (d): a retired 4r-review-gate route fails closed without dispatching v1 lenses", () => {
  for (const selected of [[], ["risk", "reliability"], ["risk", "reliability", "resilience", "readability"]]) {
    const plan = planReviewGate({ routeGates: ["4r-review-gate"], existingGate: { status: "old", findings_summary: "keep" }, decision: decision("normal", selected) });
    assert.equal(plan.status, "blocked");
    assert.deepEqual(plan.dispatch, []);
    assert.equal(plan.run_generalist, false);
    assert.equal(plan.archive_allowed, false);
    assert.deepEqual(plan.gate.validation_error_codes, ["legacy-review-retired"]);
    assert.equal(plan.gate.findings_summary, "keep");
  }
});

test("invalid contracts fail closed before specialist or archive dispatch", () => {
  const plan = planReviewGate({
    routeGates: ["4r-review-gate"],
    existingGate: { on_blocker: "advisory" },
    validationErrors: ["selected_specialists mismatch"],
  });
  assert.equal(plan.status, "blocked");
  assert.equal(plan.gate.blocker_reason, "contract-remediation");
  assert.deepEqual(plan.dispatch, []);
  assert.equal(plan.archive_allowed, false);
  assert.equal(plan.gate.on_blocker, "advisory");
});

test("blocked audit persists only deterministic validation codes", () => {
  const secrets = [
    "Authorization: Bearer synthetic.jwt.value",
    "AKIA" + "IOSFODNN7EXAMPLE",
    "arbitrary payload with user-controlled text",
  ];
  const adapterInvalid = planReviewGate({
    routeGates: ["quality-review-gate"],
    validationErrors: secrets,
  });
  assert.equal(adapterInvalid.status, "blocked");
  assert.deepEqual(adapterInvalid.gate.validation_error_codes, ["adapter-contract-invalid", "decision-contract-invalid"]);
  const persisted = JSON.stringify(adapterInvalid.gate);
  for (const secret of secrets) assert.equal(persisted.includes(secret), false, secret);
  assert.equal(Object.hasOwn(adapterInvalid.gate, "validation_errors"), false);
});

test("audit merge preserves owned and unknown historical state", () => {
  const existing = {
    status: "done",
    on_blocker: "advisory",
    findings_summary: "old",
    surfaced_to_user: true,
    decision: "accepted",
    historical_extension: { keep: true },
  };
  const merged = mergeReviewGateAudit(existing, { schema_version: 1, classification: "normal", dimensions: dimensions([]) });
  assert.equal(merged.status, "done");
  assert.equal(merged.findings_summary, "old");
  assert.equal(merged.surfaced_to_user, true);
  assert.deepEqual(merged.historical_extension, { keep: true });
  assert.equal(merged.classification, "normal");
  assert.equal(existing.classification, undefined);
});

test("legacy gate reads without rewrite or invented audit reasons", () => {
  const legacy = { status: "done", findings_summary: "legacy" };
  const read = readReviewGate({ gates: { "4r-review-gate": legacy } });
  assert.equal(read.legacy, true);
  assert.deepEqual(read.gate, legacy);
  assert.notStrictEqual(read.gate, legacy);
  assert.equal(read.gate.dimensions, undefined);
});

test("lineage adapter dispatches only the reducer-authorized next action", () => {
  const candidate = {
    projection: "workspace", base_tree: "b", candidate_tree: "c", paths: ["scripts/a.js"],
    diff_hash: `sha256:${"a".repeat(64)}`, paths_digest: `sha256:${"b".repeat(64)}`,
    authored_lines: 4, original_changed_lines: 4,
  };
  let lineage = startReviewLineage({ candidate, classification: "normal", selected_dimensions: ["risk", "reliability"], evidence_fingerprint: `sha256:${"c".repeat(64)}` });
  assert.deepEqual(planLineageGate({ lineage, observed_candidate_id: lineage.current_candidate_id }), {
    status: "migration-required", next_action: { type: "migrate-taxonomy-v2" }, dispatch: [], archive_allowed: false,
  });
  lineage = beginLens(lineage, { dimension: "risk", expected_revision: lineage.revision, request_id: "risk-start" });
  lineage = recordLensResult(lineage, { dimension: "risk", expected_revision: lineage.revision, request_id: "risk-result", result: { findings: [] } });
  assert.deepEqual(planLineageGate({ lineage, observed_candidate_id: lineage.current_candidate_id }), {
    status: "blocked", next_action: { type: "retire-v1-lineage", reason: "v1-lens-retired", dimensions: ["reliability"] }, dispatch: [], archive_allowed: false,
  });
  lineage = startReviewLineage({ candidate, classification: "normal", selected_dimensions: [], evidence_fingerprint: `sha256:${"c".repeat(64)}` });
  lineage = freezeFindings(lineage, { expected_revision: lineage.revision, request_id: "freeze" });
  assert.deepEqual(planLineageGate({ lineage, observed_candidate_id: lineage.current_candidate_id, downstream_gate: "archive" }), {
    status: "approved", next_action: { type: "stop", reason: "no-unresolved-blocking-findings" }, dispatch: [], archive_allowed: true,
  });
  assert.deepEqual(planLineageGate({ lineage, observed_candidate_id: "sha256:drift", downstream_gate: "archive" }).dispatch, []);
});

test("specialist policy and concurrency remain outside the reducer", () => {
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "../skills/_shared/gate-4r-review.md"), "utf8");
  assert.match(source, /BLOCKER\|CRITICAL\|WARNING\|SUGGESTION/);
  assert.match(source, /parallel-preferred\/serial-fallback/);
  assert.match(source, /review-correction/);
  assert.doesNotMatch(source, /owner[- ]rereview|owning dimension/i);
});

test("lineage adapter requires migration before mutable work and exposes only the active slice to correction", () => {
  const candidate = {
    projection: "workspace", base_tree: "b", candidate_tree: "c", paths: ["scripts/a.js"],
    diff_hash: `sha256:${"a".repeat(64)}`, paths_digest: `sha256:${"b".repeat(64)}`,
    authored_lines: 4, original_changed_lines: 4,
  };
  let legacy = startReviewLineage({ candidate, classification: "normal", selected_dimensions: ["risk"], evidence_fingerprint: `sha256:${"c".repeat(64)}` });
  legacy = beginLens(legacy, { dimension: "risk", expected_revision: legacy.revision, request_id: "risk-start" });
  legacy = recordLensResult(legacy, { dimension: "risk", expected_revision: legacy.revision, request_id: "risk-result", result: { findings: [{ severity: "CRITICAL", summary: "slice me", acceptance_criteria: "isolate" }] } });
  legacy = freezeFindings(legacy, { expected_revision: legacy.revision, request_id: "freeze" });
  assert.deepEqual(planLineageGate({ lineage: legacy, observed_candidate_id: legacy.current_candidate_id }), {
    status: "migration-required", next_action: { type: "migrate-remediation-v2" }, dispatch: [], archive_allowed: false,
  });
  const lineage = migrateReviewLineage(legacy, { slices: [{ root_cause_key: "risk", finding_ids: [legacy.findings[0].id], permitted_paths: ["scripts/a.js"] }] });
  const plan = planLineageGate({ lineage, observed_candidate_id: lineage.current_candidate_id });
  assert.equal(plan.next_action.type, "correct");
  assert.deepEqual(plan.dispatch, [], "correction implementation stays orchestrator-owned; only validation dispatches review-correction");
  assert.deepEqual(plan.active_slice, { slice_id: lineage.slice_order[0], finding_ids: lineage.findings.map((finding) => finding.id), paths: ["scripts/a.js"] });
  assert.equal(planLineageGate({ lineage, observed_candidate_id: "sha256:drift", downstream_gate: "archive" }).archive_allowed, false);
});

test("v2 sufficient classification skips router and dispatches quality specialists", () => {
  const evidence = normalizeQualityReviewEvidence({
    classification: "normal", verify: { status: "success", findings: [] },
    diff: "diff --git a/scripts/run.js b/scripts/run.js\n--- a/scripts/run.js\n+++ b/scripts/run.js\n@@ -0,0 +1 @@\n+fetch(url)",
    paths: ["scripts/run.js"], capabilities: ["runtime"], dependencies: [], operationTypes: ["modify"], designRisks: [],
  });
  const classifier = classifyQualityReview(evidence);
  const plan = planReviewGate({ routeGates: ["quality-review-gate"], classifierDecision: classifier });
  assert.equal(plan.run_router, false);
  assert.deepEqual(plan.dispatch, ["review-runtime"]);
});

test("v2 valid router ambiguous blocks with quality-review-ambiguity-unresolved", () => {
  const classifier = classifyQualityReview(normalizeQualityReviewEvidence({
    classification: "normal", verify: { status: "success", findings: [] },
    diff: "diff --git a/scripts/run.js b/scripts/run.js\n--- a/scripts/run.js\n+++ b/scripts/run.js\n@@ -0,0 +1 @@\n+const x = 1",
    paths: ["scripts/run.js"], capabilities: ["runtime"], dependencies: [], operationTypes: ["modify"], designRisks: [],
  }));
  const plan = planReviewGate({
    routeGates: ["quality-review-gate"],
    classifierDecision: classifier,
    routerDecision: { classification_status: "ambiguous", added_domains: [], reason: "ambiguity=runtime-code-without-domain-attribution;added=none" },
  });
  assert.equal(plan.status, "blocked");
  assert.equal(plan.gate.blocker_reason, "quality-review-ambiguity-unresolved");
  assert.deepEqual(plan.dispatch, []);
});

test("readReviewGate fails closed on mixed gate keys", () => {
  const read = readReviewGate({ gates: { "4r-review-gate": { status: "done" }, "quality-review-gate": { status: "ready" } } });
  assert.equal(read.mixed, true);
  assert.equal(read.gate.blocker_reason, "contract-remediation");
});

test("v2 high-risk dispatches four quality specialists without router", () => {
  const classifier = classifyQualityReview(normalizeQualityReviewEvidence({
    classification: "high-risk",
    verify: { status: "success", findings: [] },
    diff: "diff --git a/docs/a.md b/docs/a.md\n--- a/docs/a.md\n+++ b/docs/a.md\n@@ -0,0 +1 @@\n+x",
    paths: ["docs/a.md"],
    capabilities: ["docs"],
    dependencies: [],
    operationTypes: ["modify"],
    designRisks: [],
  }));
  const plan = planReviewGate({ routeGates: ["quality-review-gate"], classifierDecision: classifier });
  assert.equal(plan.run_router, false);
  assert.deepEqual(plan.dispatch, ["review-trust", "review-runtime", "review-evolution", "review-efficiency"]);
});

test("v2 zero-model path completes with empty dispatch", () => {
  const classifier = classifyQualityReview(normalizeQualityReviewEvidence({
    classification: "normal",
    verify: { status: "success", findings: [] },
    diff: "diff --git a/docs/a.md b/docs/a.md\n--- a/docs/a.md\n+++ b/docs/a.md\n@@ -0,0 +1 @@\n+doc",
    paths: ["docs/a.md"],
    capabilities: ["docs"],
    dependencies: [],
    operationTypes: ["modify"],
    designRisks: [],
  }));
  const plan = planReviewGate({ routeGates: ["quality-review-gate"], classifierDecision: classifier });
  assert.equal(plan.status, "done");
  assert.deepEqual(plan.dispatch, []);
  assert.equal(plan.archive_allowed, true);
});

test("v2 valid router sufficient merge extends union", () => {
  const classifier = classifyQualityReview(normalizeQualityReviewEvidence({
    classification: "normal",
    verify: { status: "success", findings: [] },
    diff: "diff --git a/scripts/run.js b/scripts/run.js\n--- a/scripts/run.js\n+++ b/scripts/run.js\n@@ -0,0 +1 @@\n+const x = 1",
    paths: ["scripts/run.js"],
    capabilities: ["app"],
    dependencies: [],
    operationTypes: ["modify"],
    designRisks: [],
  }));
  const plan = planReviewGate({
    routeGates: ["quality-review-gate"],
    classifierDecision: classifier,
    routerDecision: {
      classification_status: "sufficient",
      added_domains: ["trust"],
      reason: "ambiguity=runtime-code-without-domain-attribution;added=trust",
    },
  });
  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.dispatch, ["review-trust"]);
});

test("v2 malformed router blocks with contract-remediation", () => {
  const classifier = classifyQualityReview(normalizeQualityReviewEvidence({
    classification: "normal",
    verify: { status: "success", findings: [] },
    diff: "diff --git a/scripts/run.js b/scripts/run.js\n--- a/scripts/run.js\n+++ b/scripts/run.js\n@@ -0,0 +1 @@\n+const x = 1",
    paths: ["scripts/run.js"],
    capabilities: ["app"],
    dependencies: [],
    operationTypes: ["modify"],
    designRisks: [],
  }));
  const plan = planReviewGate({
    routeGates: ["quality-review-gate"],
    classifierDecision: classifier,
    routerDecision: { classification_status: "sufficient", added_domains: ["runtime"], reason: "free-form prose" },
  });
  assert.equal(plan.status, "blocked");
  assert.equal(plan.gate.blocker_reason, "contract-remediation");
});

test("E0.3 (d): no review plan dispatches a retired v1 reviewer", () => {
  const plan = planReviewGate({ routeGates: ["4r-review-gate"], decision: decision("normal", ["risk"]) });
  assert.deepEqual(plan.dispatch, []);
  const source = require("node:fs").readFileSync(require("node:path").join(__dirname, "lib/review-gate-state.js"), "utf8");
  assert.doesNotMatch(source, /LEGACY_V1_REVIEWERS|review-(risk|reliability|resilience|readability)/);
});

// ---------------------------------------------------------------------------
// FU1: attribution override + resolution audit (QRAR-002, ROUTING-003 MODIFIED)
// ---------------------------------------------------------------------------

const KERNEL_DIFF = [
  "diff --git a/schemas/kernel/result-envelope/v1/envelope.schema.json b/schemas/kernel/result-envelope/v1/envelope.schema.json",
  "--- a/schemas/kernel/result-envelope/v1/envelope.schema.json",
  "+++ b/schemas/kernel/result-envelope/v1/envelope.schema.json",
  "@@ -0,0 +1 @@",
  "+{ \"type\": \"object\" }",
].join("\n");
const KERNEL_PATH = "schemas/kernel/result-envelope/v1/envelope.schema.json";

function kernelClassifier(overrides = {}) {
  return classifyQualityReview(normalizeQualityReviewEvidence({
    classification: "normal",
    verify: { status: "success", findings: [] },
    diff: KERNEL_DIFF,
    paths: [KERNEL_PATH],
    capabilities: ["kernel-contract"],
    dependencies: [],
    operationTypes: ["modify"],
    designRisks: [],
    ...overrides,
  }));
}

const KERNEL_OVERRIDE = Object.freeze({
  justification: "Clean kernel parity change verified with zero findings",
  scope: ["schemas/kernel/**"],
  applies_to: ["public-kernel-contract-unattributed"],
});

test("QRAR-002/ROUTING-003: valid override closes kernel ambiguity auditable and archive proceeds", () => {
  const classifier = kernelClassifier();
  assert.ok(classifier.ambiguity_reasons.includes("public-kernel-contract-unattributed"));
  const plan = planReviewGate({ routeGates: ["quality-review-gate"], classifierDecision: classifier, attributionOverride: KERNEL_OVERRIDE });
  assert.equal(plan.status, "done");
  assert.equal(plan.archive_allowed, true);
  assert.deepEqual(plan.dispatch, []);
  assert.equal(plan.run_router, false);
  assert.deepEqual(plan.gate.ambiguity_reasons, []);
  assert.deepEqual(plan.gate.resolution, {
    source: "attribution-override",
    justification: KERNEL_OVERRIDE.justification,
    scope: ["schemas/kernel/**"],
    closed_codes: ["public-kernel-contract-unattributed"],
  });
});

test("QRAR-002: override does not apply outside its declared codes or scope", () => {
  const runtimeClassifier = classifyQualityReview(normalizeQualityReviewEvidence({
    classification: "normal",
    verify: { status: "success", findings: [] },
    diff: "diff --git a/scripts/run.js b/scripts/run.js\n--- a/scripts/run.js\n+++ b/scripts/run.js\n@@ -0,0 +1 @@\n+const x = 1",
    paths: ["scripts/run.js"],
    capabilities: ["app"],
    dependencies: [],
    operationTypes: ["modify"],
    designRisks: [],
  }));
  assert.ok(runtimeClassifier.ambiguity_reasons.includes("runtime-code-without-domain-attribution"));
  const plan = planReviewGate({ routeGates: ["quality-review-gate"], classifierDecision: runtimeClassifier, attributionOverride: KERNEL_OVERRIDE });
  assert.equal(plan.status, "blocked");
  assert.equal(plan.run_router, true);
  assert.ok(plan.gate.ambiguity_reasons.includes("runtime-code-without-domain-attribution"));
  assert.equal(plan.gate.resolution, undefined);
});

test("QRAR-002: malformed override fails closed with structured validation error", () => {
  const classifier = kernelClassifier();
  const plan = planReviewGate({
    routeGates: ["quality-review-gate"],
    classifierDecision: classifier,
    attributionOverride: { justification: "", scope: ["schemas/kernel/**"], applies_to: ["public-kernel-contract-unattributed"] },
  });
  assert.equal(plan.status, "blocked");
  assert.equal(plan.gate.blocker_reason, "contract-remediation");
  assert.deepEqual(plan.gate.validation_error_codes, ["attribution-override-invalid"]);
  assert.ok(plan.gate.ambiguity_reasons.includes("public-kernel-contract-unattributed"));
});

test("QRAR-001/ROUTING-003: scope attribution records a resolution audit on the sufficient path", () => {
  const classifier = kernelClassifier({ capability_scopes: [{ id: "kernel-contract", paths: [KERNEL_PATH] }] });
  assert.equal(classifier.classification_status, "sufficient");
  const plan = planReviewGate({ routeGates: ["quality-review-gate"], classifierDecision: classifier });
  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.dispatch, ["review-trust", "review-evolution"]);
  assert.equal(plan.gate.resolution.source, "scope-attribution");
  assert.ok(plan.gate.resolution.scope.includes(KERNEL_PATH));
  assert.deepEqual(plan.gate.ambiguity_reasons, []);
});

test("QRAR-003: router resolution closes codes without re-blocking and never re-derives them", () => {
  const classifier = kernelClassifier();
  const plan = planReviewGate({
    routeGates: ["quality-review-gate"],
    classifierDecision: classifier,
    routerDecision: {
      classification_status: "sufficient",
      added_domains: ["trust"],
      reason: "ambiguity=public-kernel-contract-unattributed;added=trust",
      resolution: { source: "attribution-override", codes: ["public-kernel-contract-unattributed"], justification: "kernel parity verified clean", scope: ["schemas/kernel/**"] },
    },
  });
  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.dispatch, ["review-trust"]);
  assert.deepEqual(plan.gate.ambiguity_reasons, []);
  assert.equal(plan.gate.resolution.source, "attribution-override");
  assert.deepEqual(plan.gate.resolution.closed_codes, ["public-kernel-contract-unattributed"]);
});
