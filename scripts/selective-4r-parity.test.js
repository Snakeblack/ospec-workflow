"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { runConfigure, gatherRuntimeScripts, resolveClaudeBin, defaultRunValidator } = require("./configure/cli.js");

const ROOT = path.resolve(__dirname, "..");
const TARGETS = ["claude", "vscode", "github-copilot", "opencode", "codex", "cursor"];

const runValidator = (profile, outDir) => {
  if (profile.id === "claude") {
    const bin = resolveClaudeBin();
    if (!bin) return { status: 0, stdout: "0 errors, 0 warnings", stderr: "" };
    if (process.platform === "win32" && (bin.endsWith(".cmd") || bin.endsWith(".bat"))) {
      return { status: 0, stdout: "0 errors, 0 warnings", stderr: "" };
    }
  }
  return defaultRunValidator(profile, outDir);
};

test("classifier and reducer are explicit generated runtime roots", () => {
  assert.ok(gatherRuntimeScripts(ROOT).some((file) => file.path === "scripts/lib/review-dimensions.js"));
  assert.ok(gatherRuntimeScripts(ROOT).some((file) => file.path === "scripts/lib/review-gate-state.js"));
  assert.ok(gatherRuntimeScripts(ROOT).some((file) => file.path === "scripts/lib/review-lineage.js"));
});

test("all six generated targets carry generalist, classifier, gate, audit, and competence boundary", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "selective-4r-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  for (const target of TARGETS) {
    const out = path.join(temp, target);
    assert.equal(runConfigure({ sourceDir: ROOT, target, outDir: out, validate: true, runValidator }).exitCode, 0, target);
    const paths = targetPaths(target);
    const generalist = fs.readFileSync(path.join(out, paths.generalist), "utf8");
    const correction = fs.readFileSync(path.join(out, paths.correction), "utf8");
    const orchestrator = fs.readFileSync(path.join(out, paths.orchestrator), "utf8");
    const skill = fs.readFileSync(path.join(out, "skills/review-change/SKILL.md"), "utf8");
    const classifier = fs.readFileSync(path.join(out, "scripts/lib/review-dimensions.js"), "utf8");
    const reducer = fs.readFileSync(path.join(out, "scripts/lib/review-gate-state.js"), "utf8");
    const lineage = fs.readFileSync(path.join(out, "scripts/lib/review-lineage.js"), "utf8");
    const correctionSkill = fs.readFileSync(path.join(out, "skills/review-correction/SKILL.md"), "utf8");
    const gate = fs.readFileSync(path.join(out, "skills/_shared/gate-4r-review.md"), "utf8");
    const models = fs.readFileSync(path.join(out, "models.yaml"), "utf8");

    assert.match(generalist + skill, /MUST NOT.*findings.*severity.*remediation/is, `${target} competence boundary`);
    assert.match(skill, /ambiguity=.*added=/is, `${target} structural reason`);
    assert.match(skill, /Allowed ambiguity codes|ambiguity codes/i, `${target} reason allowlist`);
    assert.match(skill, /not free-form/i, `${target} free-form boundary`);
    assert.match(orchestrator + gate, /review-change/, `${target} generalist dispatch`);
    assert.match(correction + correctionSkill, /every frozen unresolved finding ID exactly once/i, `${target} targeted validator`);
    assert.match(correction + correctionSkill, /non-blocking follow-up/i, `${target} late follow-up boundary`);
    for (const marker of ["quality-review-ambiguity-unresolved", "contract-remediation", "parallel-preferred/serial-fallback", "review-correction", "reconciliation-required"]) {
      const haystack = (orchestrator + classifier + reducer + lineage + gate + correctionSkill).toLowerCase();
      assert.ok(haystack.includes(marker.toLowerCase()) || haystack.includes("deterministic-first"), `${target} missing ${marker}`);
    }
    assert.match(orchestrator + gate, /review-lineage\.js/);
    assert.doesNotMatch(orchestrator + gate, /planBoundedRereview|owner[- ]rereview|owning dimension/i);
    assert.match(models, /^\s*review-change: (?:premium|default|cheap)$/m, `${target} model registration`);
    assert.match(models, /^\s*review-correction: (?:premium|default|cheap)$/m, `${target} correction model registration`);
  }
});

test("isolated mutations fail runtime and contract parity in every generated target", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "selective-4r-mutants-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));

  for (const target of TARGETS) {
    const out = path.join(temp, target);
    assert.equal(runConfigure({ sourceDir: ROOT, target, outDir: out, validate: true, runValidator }).exitCode, 0, `${target} generation`);
    const generalist = targetPaths(target).generalist;
    assertProbe(out, generalist, 0, `${target} baseline`);

    const mutations = [
      { name: "generalist", file: generalist, remove: true, diagnostic: "GENERALIST" },
      { name: "classifier-runtime", file: "scripts/lib/review-dimensions.js", remove: true, diagnostic: "RUNTIME" },
      { name: "reducer-runtime", file: "scripts/lib/review-gate-state.js", remove: true, diagnostic: "RUNTIME" },
      { name: "lineage-runtime", file: "scripts/lib/review-lineage.js", remove: true, diagnostic: "RUNTIME" },
      { name: "correction-agent", file: targetPaths(target).correction, remove: true, diagnostic: "CORRECTION" },
      { name: "correction-skill", file: "skills/review-correction/SKILL.md", from: /MUST NOT/g, to: "MAY", diagnostic: "CORRECTION" },
      { name: "competence-boundary", file: "skills/review-change/SKILL.md", from: /MUST NOT/g, to: "MAY", diagnostic: "BOUNDARY" },
      { name: "union-cap", file: "scripts/lib/review-dimensions.js", from: "return QUALITY_DOMAINS.filter((id) => selected.has(id));", to: 'return ["efficiency"];', diagnostic: "SELECTION" },
      { name: "quality-canonical-order", file: "scripts/lib/review-dimensions.js", from: 'const { QUALITY_DOMAINS } = require("./review-taxonomy.js");', to: 'const { QUALITY_DOMAINS } = { QUALITY_DOMAINS: ["efficiency","trust","runtime","evolution"] };', diagnostic: "SELECTION" },
      { name: "router-reason-grammar", file: "scripts/lib/review-dimensions.js", from: 'if (typeof value.reason !== "string" || !ROUTER_REASON.test(value.reason)) errors.push("reason must use ambiguity=<codes>;added=<none|ids>");', to: 'if (false) errors.push("reason must use ambiguity=<codes>;added=<none|ids>");', diagnostic: "BOUNDARY" },
      { name: "ambiguous-block", file: "scripts/lib/review-gate-state.js", from: 'blocker_reason: "quality-review-ambiguity-unresolved"', to: 'blocker_reason: "contract-remediation"', diagnostic: "AUDIT" },
      { name: "audit", file: "skills/_shared/gate-4r-review.md", from: /read-merge-write/g, to: "overwrite", diagnostic: "AUDIT" },
    ];

    for (const mutation of mutations) {
      const absolute = path.join(out, mutation.file);
      const original = fs.readFileSync(absolute);
      if (mutation.remove) fs.rmSync(absolute);
      else {
        const source = original.toString("utf8");
        const changed = source.replace(mutation.from, mutation.to);
        assert.notEqual(changed, source, `${target} ${mutation.name} mutation applied`);
        fs.writeFileSync(absolute, changed);
      }
      try {
        const result = assertProbe(out, generalist, 1, `${target} ${mutation.name}`);
        assert.match(result.stderr, new RegExp(mutation.diagnostic), `${target} ${mutation.name} diagnostic`);
      } finally {
        fs.mkdirSync(path.dirname(absolute), { recursive: true });
        fs.writeFileSync(absolute, original);
      }
      assertProbe(out, generalist, 0, `${target} restored after ${mutation.name}`);
    }
  }
});

function assertProbe(root, generalist, expectedExit, label) {
  const result = spawnSync(process.execPath, ["-e", PROBE, root, generalist], { encoding: "utf8" });
  assert.equal(result.status, expectedExit, `${label}: ${result.stderr || result.stdout}`);
  return result;
}

const PROBE = String.raw`
const fs = require("node:fs");
const path = require("node:path");
const root = process.argv[1];
const generalist = process.argv[2];
function fail(code, message) { console.error(code + ": " + message); process.exit(1); }
if (!fs.existsSync(path.join(root, generalist))) fail("GENERALIST", "missing generated generalist");
const target = generalist.includes(".toml") ? "codex" : generalist.includes(".agent.md") ? (generalist.startsWith(".github") ? "github-copilot" : "vscode") : generalist.startsWith(".opencode") ? "opencode" : "claude";
const correctionPath = { claude: "agents/review-correction.md", vscode: "agents/review-correction.agent.md", "github-copilot": ".github/agents/review-correction.agent.md", opencode: ".opencode/agents/review-correction.md", codex: ".codex/agents/review-correction.toml", cursor: "agents/review-correction.md" }[target];
if (!fs.existsSync(path.join(root, correctionPath))) fail("CORRECTION", "missing targeted correction agent");
const skill = fs.readFileSync(path.join(root, "skills/review-change/SKILL.md"), "utf8");
const correctionSkill = fs.readFileSync(path.join(root, "skills/review-correction/SKILL.md"), "utf8");
if (!/MUST NOT[\s\S]*findings[\s\S]*severity[\s\S]*remediation/i.test(skill)) fail("BOUNDARY", "competence boundary drift");
if (!/MUST NOT[\s\S]*new blocking/i.test(correctionSkill) || !/every frozen unresolved finding ID exactly once/i.test(correctionSkill)) fail("CORRECTION", "targeted-only boundary drift");
if (!/ambiguity=[\s\S]*added=/i.test(skill) || !/not free-form/i.test(skill)) fail("BOUNDARY", "reason persistence boundary drift");
const gate = fs.readFileSync(path.join(root, "skills/_shared/gate-4r-review.md"), "utf8");
if (!gate.includes("review-gate-state.js")) fail("RUNTIME", "gate does not consume reducer");
if (!gate.includes("read-merge-write")) fail("AUDIT", "merge-safe audit marker missing");
let classifier, reducer, lineage;
try {
  classifier = require(path.join(root, "scripts/lib/review-dimensions.js"));
  reducer = require(path.join(root, "scripts/lib/review-gate-state.js"));
  lineage = require(path.join(root, "scripts/lib/review-lineage.js"));
} catch (error) { fail("RUNTIME", error.message); }
const docsEvidence = classifier.normalizeQualityReviewEvidence({ classification: "normal", verify: { status: "success", findings: [] }, diff: "diff --git a/docs/a.md b/docs/a.md\n--- a/docs/a.md\n+++ b/docs/a.md\n@@ -0,0 +1 @@\n+doc", paths: ["docs/a.md"], capabilities: ["docs"], dependencies: [], operationTypes: ["modify"], designRisks: [] });
const docsDecision = classifier.classifyQualityReview(docsEvidence);
if (docsDecision.classification_status !== "sufficient" || docsDecision.selected_domains.length !== 0) fail("SELECTION", "docs-only drift");
if (docsDecision.escalation_reason !== null) fail("REASONS", "v2 must not emit overflow");
const scopedEvidence = classifier.normalizeQualityReviewEvidence({ classification: "normal", verify: { status: "success", findings: [] }, diff: "diff --git a/scripts/run.js b/scripts/run.js\n--- a/scripts/run.js\n+++ b/scripts/run.js\n@@ -0,0 +1 @@\n+fetch(url)", paths: ["scripts/run.js"], capabilities: ["runtime"], capability_scopes: [{ id: "runtime", paths: ["scripts/run.js"] }], dependencies: [], operationTypes: ["modify"], designRisks: [] });
const scopedDecision = classifier.classifyQualityReview(scopedEvidence);
if (scopedDecision.selected_domains.join(",") !== "runtime") fail("SELECTION", scopedDecision.selected_domains.join(","));
const high = classifier.classifyQualityReview(classifier.normalizeQualityReviewEvidence({ classification: "high-risk", verify: { status: "success", findings: [] }, diff: "diff --git a/docs/a.md b/docs/a.md\n--- a/docs/a.md\n+++ b/docs/a.md\n@@ -0,0 +1 @@\n+x", paths: ["docs/a.md"], capabilities: ["docs"], dependencies: [], operationTypes: ["modify"], designRisks: [] }));
if (high.selected_domains.join(",") !== "trust,runtime,evolution,efficiency") fail("SELECTION", high.selected_domains.join(","));
const noOp = reducer.planReviewGate({ routeGates: [], existingGate: { status: "old" } });
if (noOp.dispatch.length || !noOp.archive_allowed) fail("AUDIT", "route no-op drift");
const sufficientPlan = reducer.planReviewGate({ routeGates: ["quality-review-gate"], classifierDecision: scopedDecision });
if (sufficientPlan.run_router || sufficientPlan.dispatch.join(",") !== "review-runtime") fail("AUDIT", "sufficient plan drift");
const ambiguousClassifier = classifier.classifyQualityReview(classifier.normalizeQualityReviewEvidence({ classification: "normal", verify: { status: "success", findings: [] }, diff: "diff --git a/scripts/run.js b/scripts/run.js\n--- a/scripts/run.js\n+++ b/scripts/run.js\n@@ -0,0 +1 @@\n+const x = 1", paths: ["scripts/run.js"], capabilities: ["app"], dependencies: [], operationTypes: ["modify"], designRisks: [] }));
if (ambiguousClassifier.classification_status !== "ambiguous") fail("REASONS", "expected ambiguous");
if (!classifier.validateRouterDecision({ classification_status: "sufficient", added_domains: ["runtime"], reason: "ambiguity=runtime-code-without-domain-attribution;added=runtime" }).valid) fail("BOUNDARY", "valid v2 reason rejected");
if (classifier.validateRouterDecision({ classification_status: "sufficient", added_domains: [], reason: "signals=none;dimensions=none" }).valid) fail("BOUNDARY", "v1 reason accepted");
const unresolved = reducer.planReviewGate({ routeGates: ["quality-review-gate"], classifierDecision: ambiguousClassifier, routerDecision: { classification_status: "ambiguous", added_domains: [], reason: "ambiguity=runtime-code-without-domain-attribution;added=none" } });
if (unresolved.gate.blocker_reason !== "quality-review-ambiguity-unresolved" || unresolved.dispatch.length) fail("AUDIT", "ambiguous router block drift");
const badRouter = reducer.planReviewGate({ routeGates: ["quality-review-gate"], classifierDecision: ambiguousClassifier, routerDecision: { classification_status: "sufficient", added_domains: ["runtime"], reason: "free-form prose" } });
if (badRouter.gate.blocker_reason !== "contract-remediation") fail("AUDIT", "malformed router drift");
try { classifier.normalizeQualityReviewEvidence({ classification: "normal", verify: { status: "success", findings: [] }, diff: "this is not a unified diff", paths: ["scripts/run.js"], capabilities: ["runtime"], dependencies: [], operationTypes: ["modify"], designRisks: [] }); fail("EVIDENCE", "malformed diff accepted"); }
catch (error) { if (/malformed diff accepted/.test(error.message)) throw error; }
for (const field of ["paths", "capabilities", "dependencies", "operationTypes"]) {
  try { classifier.normalizeQualityReviewEvidence({ classification: "normal", verify: { status: "success", findings: [] }, diff: "diff --git a/scripts/run.js b/scripts/run.js\n--- a/scripts/run.js\n+++ b/scripts/run.js\n@@ -0,0 +1 @@\n+x", paths: ["scripts/run.js"], capabilities: ["runtime"], dependencies: [], operationTypes: ["modify"], designRisks: [], [field]: ["valid", { arbitrary: true }] }); fail("EVIDENCE", field + " coerced non-string evidence"); }
  catch (error) { if (!/must contain only strings/.test(error.message)) fail("EVIDENCE", field + ": " + error.message); }
}
const v2Candidate = { projection: "workspace", base_tree: "base", candidate_tree: "tree", paths: ["scripts/run.js"], diff_hash: "sha256:" + "a".repeat(64), paths_digest: "sha256:" + "b".repeat(64), authored_lines: 401, original_changed_lines: 401 };
let v2Review = lineage.startQualityReviewLineage({ candidate: v2Candidate, classification: "normal", selected_domains: ["runtime"], evidence_fingerprint: "sha256:" + "c".repeat(64) });
if (v2Review.schema_version !== 2 || v2Review.correction_budget.limit_lines !== 200) fail("LINEAGE", "v2 genesis drift");
const v2Plan = reducer.planLineageGate({ lineage: v2Review, observed_candidate_id: v2Review.current_candidate_id });
if (v2Plan.dispatch.join(",") !== "review-runtime") fail("LINEAGE", "v2 dispatch drift");
const clear = { status: "clear", specialists: [], reason: "signals=none;dimensions=none" };
const v1Input = { classification: "normal", verify: { status: "success", findings: [] }, diff: "diff --git a/scripts/run.js b/scripts/run.js\n--- a/scripts/run.js\n+++ b/scripts/run.js\n@@ -0,0 +1,3 @@\n+spawnSync(command)\n+fetch(url)\n+switch(mode)", paths: ["scripts/run.js"], capabilities: ["runtime"], operationTypes: ["modify"], dependencies: [], designRisks: [] };
let v1Normal;
try { v1Normal = classifier.deriveReviewDimensions(classifier.normalizeReviewEvidence(v1Input), clear); }
catch (error) { fail("RUNTIME", error.message); }
if (v1Normal.selected_specialists.join(",") !== "risk,reliability,resilience,readability") fail("SELECTION", "v1 overflow path drift");
`;

function targetPaths(target) {
  return {
    claude: { generalist: "agents/review-change.md", correction: "agents/review-correction.md", orchestrator: "skills/sdd-orchestrator/SKILL.md" },
    vscode: { generalist: "agents/review-change.agent.md", correction: "agents/review-correction.agent.md", orchestrator: "agents/sdd-orchestrator.agent.md" },
    "github-copilot": { generalist: ".github/agents/review-change.agent.md", correction: ".github/agents/review-correction.agent.md", orchestrator: ".github/agents/sdd-orchestrator.agent.md" },
    opencode: { generalist: ".opencode/agents/review-change.md", correction: ".opencode/agents/review-correction.md", orchestrator: ".opencode/agents/ospec-workflow.md" },
    codex: { generalist: ".codex/agents/review-change.toml", correction: ".codex/agents/review-correction.toml", orchestrator: "AGENTS.md" },
    cursor: { generalist: "agents/review-change.md", correction: "agents/review-correction.md", orchestrator: "agents/sdd-orchestrator.md" },
  }[target];
}
