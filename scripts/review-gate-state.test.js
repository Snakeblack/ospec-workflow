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

test("valid decisions plan exact 0, 2, and 4 specialist dispatch", () => {
  const zero = planReviewGate({ routeGates: ["4r-review-gate"], decision: decision("normal", []) });
  assert.equal(zero.status, "done");
  assert.deepEqual(zero.dispatch, []);
  assert.equal(zero.archive_allowed, true);

  const two = planReviewGate({ routeGates: ["4r-review-gate"], decision: decision("normal", ["risk", "reliability"]) });
  assert.equal(two.status, "ready");
  assert.deepEqual(two.dispatch, ["review-risk", "review-reliability"]);
  assert.equal(two.archive_allowed, false);

  const four = planReviewGate({ routeGates: ["4r-review-gate"], decision: decision("high-risk", ["risk", "reliability", "resilience", "readability"]) });
  assert.deepEqual(four.dispatch, ["review-risk", "review-reliability", "review-resilience", "review-readability"]);
  assert.deepEqual(four.gate.depth, { review: "strict" });
  assert.equal(four.gate.escalation_reason, null);
});

test("normal overflow audit persists strict depth and structured reason additively", () => {
  const overflowDecision = deriveReviewDimensions(normalizeReviewEvidence({
    classification: "normal", verify: { status: "success", findings: [] },
    diff: "diff --git a/scripts/run.js b/scripts/run.js\n--- a/scripts/run.js\n+++ b/scripts/run.js\n@@ -0,0 +1,3 @@\n+spawnSync(command)\n+fetch(url)\n+switch(mode)",
    paths: ["scripts/run.js"], capabilities: ["runtime"], dependencies: [], operationTypes: ["modify"], designRisks: [],
  }), { status: "clear", specialists: [], reason: "signals=none;dimensions=none" });
  const plan = planReviewGate({ routeGates: ["4r-review-gate"], existingGate: { status: "old", findings_summary: "keep", escalation_reason: { code: "stale" } }, decision: overflowDecision });
  assert.equal(plan.status, "ready");
  assert.deepEqual(plan.dispatch, ["review-risk", "review-reliability", "review-resilience", "review-readability"]);
  assert.deepEqual(plan.gate.depth, { review: "strict" });
  assert.deepEqual(plan.gate.escalation_reason, { code: "normal-signal-overflow", positive_dimensions: 4, detail: "Normal review has 4 positive dimensions; strict full 4R required" });
  assert.equal(plan.gate.findings_summary, "keep");
});

test("targeted recovery clears stale overflow audit fields", () => {
  const targeted = planReviewGate({
    routeGates: ["4r-review-gate"],
    existingGate: {
      status: "ready",
      depth: { review: "strict" },
      escalation_reason: { code: "normal-signal-overflow", positive_dimensions: 3, detail: "stale" },
    },
    decision: decision("normal", ["risk", "reliability"]),
  });
  assert.deepEqual(targeted.gate.depth, { review: "targeted" });
  assert.equal(targeted.gate.escalation_reason, null);
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
    "AKIAIOSFODNN7EXAMPLE",
    "arbitrary payload with user-controlled text",
  ];
  const adapterInvalid = planReviewGate({
    routeGates: ["4r-review-gate"],
    validationErrors: secrets,
  });
  assert.deepEqual(adapterInvalid.gate.validation_error_codes, ["adapter-contract-invalid", "decision-contract-invalid"]);
  const persisted = JSON.stringify(adapterInvalid.gate);
  for (const secret of secrets) assert.equal(persisted.includes(secret), false, secret);

  const invalidDecision = decision("normal", []);
  delete invalidDecision.evidence.sources.dependencies;
  const decisionInvalid = planReviewGate({ routeGates: ["4r-review-gate"], decision: invalidDecision });
  assert.deepEqual(decisionInvalid.gate.validation_error_codes, ["decision-contract-invalid"]);
  assert.equal(Object.hasOwn(decisionInvalid.gate, "validation_errors"), false);
});

test("reducer fully validates decisions even when adapter reports no errors", () => {
  const fabricated = decision("normal", []);
  delete fabricated.evidence.sources.dependencies;
  const plan = planReviewGate({ routeGates: ["4r-review-gate"], decision: fabricated, validationErrors: [] });
  assert.equal(plan.status, "blocked");
  assert.deepEqual(plan.dispatch, []);
  assert.equal(plan.archive_allowed, false);
  assert.deepEqual(plan.gate.validation_error_codes, ["decision-contract-invalid"]);
});

test("successful blocked recovery clears stale blocker state for ready and done", () => {
  for (const selected of [[], ["risk", "reliability"]]) {
    const plan = planReviewGate({
      routeGates: ["4r-review-gate"],
      existingGate: { status: "blocked", blocker_reason: "contract-remediation", validation_errors: ["old failure"], validation_error_codes: ["decision-contract-invalid"], historical_extension: true },
      decision: decision("normal", selected),
    });
    assert.equal(Object.hasOwn(plan.gate, "blocker_reason"), false);
    assert.equal(Object.hasOwn(plan.gate, "validation_errors"), false);
    assert.equal(Object.hasOwn(plan.gate, "validation_error_codes"), false);
    assert.equal(plan.gate.historical_extension, true);
  }
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
  let lineage = startReviewLineage({ candidate, classification: "normal", selected_dimensions: ["risk"], evidence_fingerprint: `sha256:${"c".repeat(64)}` });
  assert.deepEqual(planLineageGate({ lineage, observed_candidate_id: lineage.current_candidate_id }), {
    status: "reviewing", next_action: { type: "run-lenses", dimensions: ["risk"] }, dispatch: ["review-risk"], archive_allowed: false,
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

test("v1 legacy dispatch uses LEGACY_V1_REVIEWERS", () => {
  const plan = planReviewGate({ routeGates: ["4r-review-gate"], decision: decision("normal", ["risk"]) });
  assert.deepEqual(plan.dispatch, ["review-risk"]);
});
