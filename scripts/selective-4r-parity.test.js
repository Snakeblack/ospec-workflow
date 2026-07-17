"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { runConfigure, gatherRuntimeScripts } = require("./configure/cli.js");

const ROOT = path.resolve(__dirname, "..");
const TARGETS = ["claude", "vscode", "github-copilot", "opencode", "codex"];

test("classifier and reducer are explicit generated runtime roots", () => {
  assert.ok(gatherRuntimeScripts(ROOT).some((file) => file.path === "scripts/lib/review-dimensions.js"));
  assert.ok(gatherRuntimeScripts(ROOT).some((file) => file.path === "scripts/lib/review-gate-state.js"));
  assert.ok(gatherRuntimeScripts(ROOT).some((file) => file.path === "scripts/lib/review-lineage.js"));
});

test("all five generated targets carry generalist, classifier, gate, audit, and competence boundary", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "selective-4r-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  for (const target of TARGETS) {
    const out = path.join(temp, target);
    assert.equal(runConfigure({ sourceDir: ROOT, target, outDir: out, validate: true }).exitCode, 0, target);
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
    assert.match(skill, /signals=.*dimensions=/is, `${target} structural reason`);
    assert.match(skill, /allowlisted.*classifier-reference/is, `${target} reason allowlist`);
    assert.match(skill, /not free-form/i, `${target} free-form boundary`);
    assert.match(orchestrator + gate, /review-change/, `${target} generalist dispatch`);
    assert.match(correction + correctionSkill, /every frozen unresolved finding ID exactly once/i, `${target} targeted validator`);
    assert.match(correction + correctionSkill, /non-blocking follow-up/i, `${target} late follow-up boundary`);
    for (const marker of ["normal-cap-excluded", "contract-remediation", "parallel-preferred/serial-fallback", "review-correction", "reconciliation-required"]) {
      assert.ok((orchestrator + classifier + reducer + lineage + gate + correctionSkill).includes(marker), `${target} missing ${marker}`);
    }
    assert.match(orchestrator + gate, /review-lineage\.js/);
    assert.doesNotMatch(orchestrator + gate, /planBoundedRereview|owner[- ]rereview|owning dimension/i);
    assert.match(models, /^\s*review-change: default$/m, `${target} model registration`);
    assert.match(models, /^\s*review-correction: default$/m, `${target} correction model registration`);
  }
});

test("isolated mutations fail runtime and contract parity in every generated target", (t) => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "selective-4r-mutants-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));

  for (const target of TARGETS) {
    const out = path.join(temp, target);
    assert.equal(runConfigure({ sourceDir: ROOT, target, outDir: out, validate: true }).exitCode, 0, `${target} generation`);
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
      { name: "normal-cap", file: "scripts/lib/review-dimensions.js", from: ".slice(0, 2)", to: ".slice(0, 3)", diagnostic: "SELECTION" },
      { name: "canonical-order", file: "scripts/lib/review-dimensions.js", from: '["risk", "reliability", "resilience", "readability"]', to: '["reliability", "risk", "resilience", "readability"]', diagnostic: "SELECTION" },
      { name: "reason", file: "scripts/lib/review-dimensions.js", from: /normal-cap-excluded/g, to: "mutated-cap-reason", diagnostic: "REASONS" },
      { name: "reason-grammar", file: "scripts/lib/review-dimensions.js", from: 'if (!match) return { valid: false, errors: ["reason must use signals=<allowlisted-codes>;dimensions=<canonical-dimensions>"] };', to: 'if (!match) return { valid: true, errors: [], signals: ["diff-auth-permission"], dimensions: ["risk"] };', diagnostic: "BOUNDARY" },
      { name: "diff-scope", file: "scripts/lib/review-dimensions.js", from: "!isRuntimeProductionPath(file)", to: "false", diagnostic: "EVIDENCE" },
      { name: "executable-lines", file: "scripts/lib/review-dimensions.js", from: "const executable = stripNonExecutableText(line.text, lexicalState);", to: "const executable = line.text;", diagnostic: "EVIDENCE" },
      { name: "typed-string-boundary", file: "scripts/lib/review-dimensions.js", from: 'if (value.some((item) => typeof item !== "string"))', to: 'if (false && value.some((item) => typeof item !== "string"))', diagnostic: "EVIDENCE" },
      { name: "language-aware-dash-comment", file: "scripts/lib/review-dimensions.js", from: '(pair === "--" && state.lineComment === "dash")', to: 'pair === "--"', diagnostic: "EVIDENCE" },
      { name: "executable-interpolation", file: "scripts/lib/review-dimensions.js", from: "return { executable, end: index, closed: true };", to: 'return { executable: "", end: index, closed: true };', diagnostic: "EVIDENCE" },
      { name: "multiline-template", file: "scripts/lib/review-dimensions.js", from: 'if (!parsed.closed) state.quote = "`";', to: 'if (false && !parsed.closed) state.quote = "`";', diagnostic: "EVIDENCE" },
      { name: "ruby-block-comment", file: "scripts/lib/review-dimensions.js", from: 'if (state.language === "ruby")', to: 'if (false && state.language === "ruby")', diagnostic: "EVIDENCE" },
      { name: "hash-comment-mode", file: "scripts/lib/review-dimensions.js", from: "hashComment: hashCommentMode(file)", to: "hashComment: null", diagnostic: "EVIDENCE" },
      { name: "shell-word-boundary", file: "scripts/lib/review-dimensions.js", from: '/[\\s|&;()<>]/.test(line[index - 1])', to: '/\\s/.test(line[index - 1])', diagnostic: "EVIDENCE" },
      { name: "diff-validation", file: "scripts/lib/review-dimensions.js", from: "...diffFacts(parseUnifiedDiff(input.diff)),", to: '...(input.diff === "this is not a unified diff" ? [] : diffFacts(parseUnifiedDiff(input.diff))),', diagnostic: "EVIDENCE" },
      { name: "defense-in-depth", file: "scripts/lib/review-gate-state.js", from: "const decisionValidation = validateReviewDecision(decision);", to: "const decisionValidation = { valid: true, errors: [] };", diagnostic: "AUDIT" },
      { name: "persisted-error-boundary", file: "scripts/lib/review-gate-state.js", from: "validation_error_codes: validationErrorCodes", to: "validation_errors: validationErrors", diagnostic: "AUDIT" },
      { name: "attempt-cap", file: "scripts/lib/review-lineage.js", from: "const MAX_FAILED_ATTEMPTS = 3;", to: "const MAX_FAILED_ATTEMPTS = 4;", diagnostic: "LINEAGE" },
      { name: "line-budget", file: "scripts/lib/review-lineage.js", from: "const MAX_BUDGET_LINES = 200;", to: "const MAX_BUDGET_LINES = 201;", diagnostic: "LINEAGE" },
      { name: "candidate-gate", file: "scripts/lib/review-lineage.js", from: "if (input.candidate_id !== state.current_candidate_id)", to: "if (false && input.candidate_id !== state.current_candidate_id)", diagnostic: "LINEAGE" },
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
const correctionPath = { claude: "agents/review-correction.md", vscode: "agents/review-correction.agent.md", "github-copilot": ".github/agents/review-correction.agent.md", opencode: ".opencode/agents/review-correction.md", codex: ".codex/agents/review-correction.toml" }[target];
if (!fs.existsSync(path.join(root, correctionPath))) fail("CORRECTION", "missing targeted correction agent");
const skill = fs.readFileSync(path.join(root, "skills/review-change/SKILL.md"), "utf8");
const correctionSkill = fs.readFileSync(path.join(root, "skills/review-correction/SKILL.md"), "utf8");
if (!/MUST NOT[\s\S]*findings[\s\S]*severity[\s\S]*remediation/i.test(skill)) fail("BOUNDARY", "competence boundary drift");
if (!/MUST NOT[\s\S]*new blocking/i.test(correctionSkill) || !/every frozen unresolved finding ID exactly once/i.test(correctionSkill)) fail("CORRECTION", "targeted-only boundary drift");
if (!/signals=[\s\S]*dimensions=/i.test(skill) || !/allowlisted[\s\S]*classifier-reference/i.test(skill) || !/not free-form/i.test(skill)) fail("BOUNDARY", "reason persistence boundary drift");
const gate = fs.readFileSync(path.join(root, "skills/_shared/gate-4r-review.md"), "utf8");
if (!gate.includes("review-gate-state.js")) fail("RUNTIME", "gate does not consume reducer");
if (!gate.includes("read-merge-write")) fail("AUDIT", "merge-safe audit marker missing");
let classifier, reducer, lineage;
try {
  classifier = require(path.join(root, "scripts/lib/review-dimensions.js"));
  reducer = require(path.join(root, "scripts/lib/review-gate-state.js"));
  lineage = require(path.join(root, "scripts/lib/review-lineage.js"));
} catch (error) { fail("RUNTIME", error.message); }
const clear = { status: "clear", specialists: [], reason: "signals=none;dimensions=none" };
const input = {
  classification: "normal", verify: { status: "success", findings: [] },
  diff: "diff --git a/scripts/run.js b/scripts/run.js\n--- a/scripts/run.js\n+++ b/scripts/run.js\n@@ -0,0 +1,3 @@\n+spawnSync(command)\n+fetch(url)\n+switch(mode)",
  paths: ["scripts/run.js"], capabilities: ["runtime"], operationTypes: ["modify"], dependencies: [], designRisks: [],
};
let normal;
try { normal = classifier.deriveReviewDimensions(classifier.normalizeReviewEvidence(input), clear); }
catch (error) { fail("RUNTIME", error.message); }
if (normal.selected_specialists.join(",") !== "risk,reliability") fail("SELECTION", normal.selected_specialists.join(","));
if (!normal.dimensions.resilience.reasons.some((entry) => entry.code === "normal-cap-excluded")) fail("REASONS", "cap exclusion missing");
for (const reason of ["Authorization: Bearer synthetic-value", "eyJhbGciOiJIUzI1NiJ9.synthetic.value", "AKIAIOSFODNN7EXAMPLE", "signals=invented-signal;dimensions=risk"]) {
  if (classifier.validateGeneralistDecision({ status: "needs-specialist", specialists: ["risk"], reason }).valid) fail("BOUNDARY", "reason grammar drift");
}
if (!classifier.validateGeneralistDecision({ status: "needs-specialist", specialists: ["risk"], reason: "signals=diff-auth-permission;dimensions=risk" }).valid) fail("BOUNDARY", "valid structural reason rejected");
try { classifier.normalizeReviewEvidence({ ...input, diff: "this is not a unified diff" }); fail("EVIDENCE", "malformed diff accepted"); }
catch (error) { if (/malformed diff accepted/.test(error.message)) throw error; }
const mixedEvidence = classifier.normalizeReviewEvidence({ ...input,
  diff: "diff --git a/docs/a.md b/docs/a.md\n--- a/docs/a.md\n+++ b/docs/a.md\n@@ -0,0 +1 @@\n+spawnSync(secret)\ndiff --git a/scripts/run.test.js b/scripts/run.test.js\n--- a/scripts/run.test.js\n+++ b/scripts/run.test.js\n@@ -0,0 +1 @@\n+fetch(url)\ndiff --git a/scripts/runtime.js b/scripts/runtime.js\n--- a/scripts/runtime.js\n+++ b/scripts/runtime.js\n@@ -0,0 +1,4 @@\n+// fetch retry timeout only documented here\n+const note = \\\"spawnSync authorize throw switch\\\";\n+fetch(url)\n+authorize(user)",
  paths: ["docs/a.md", "scripts/run.test.js", "scripts/runtime.js"] });
const mixedFacts = mixedEvidence.sources.facts.filter((fact) => fact.source === "real-diff");
if (JSON.stringify(mixedFacts) !== JSON.stringify([{ code: "diff-auth-permission", source: "real-diff", detail: "scripts/runtime.js" }, { code: "diff-network-flow", source: "real-diff", detail: "scripts/runtime.js" }])) fail("EVIDENCE", JSON.stringify(mixedFacts));
const hashEvidence = classifier.normalizeReviewEvidence({ ...input,
  diff: "diff --git a/src/app.py b/src/app.py\n--- a/src/app.py\n+++ b/src/app.py\n@@ -0,0 +1 @@\n+authorize(user); label = \\\"# fetch(url)\\\" # throw fallback()\ndiff --git a/src/app.rb b/src/app.rb\n--- a/src/app.rb\n+++ b/src/app.rb\n@@ -0,0 +1 @@\n+request(url); label = '# authorize(user)' # throw fallback()\ndiff --git a/scripts/run.sh b/scripts/run.sh\n--- a/scripts/run.sh\n+++ b/scripts/run.sh\n@@ -0,0 +1,2 @@\n+spawnSync(command); label='#' # fetch(url)\n+authorize(user);# request(url) throw fallback()",
  paths: ["src/app.py", "src/app.rb", "scripts/run.sh"] });
const hashFacts = hashEvidence.sources.facts.filter((fact) => fact.source === "real-diff");
if (JSON.stringify(hashFacts) !== JSON.stringify([{ code: "diff-auth-permission", source: "real-diff", detail: "scripts/run.sh,src/app.py" }, { code: "diff-network-flow", source: "real-diff", detail: "src/app.rb" }, { code: "diff-process-execution", source: "real-diff", detail: "scripts/run.sh" }])) fail("EVIDENCE", JSON.stringify(hashFacts));
const highEvidence = classifier.normalizeReviewEvidence({ ...input, classification: "high-risk" });
const high = classifier.deriveReviewDimensions(highEvidence, clear);
if (high.selected_specialists.join(",") !== "risk,reliability,resilience,readability") fail("SELECTION", "high-risk drift");
const noOp = reducer.planReviewGate({ routeGates: [], existingGate: { status: "old" } });
if (noOp.run_generalist || noOp.dispatch.length || !noOp.archive_allowed) fail("AUDIT", "route no-op drift");
const blocked = reducer.planReviewGate({ routeGates: ["4r-review-gate"], validationErrors: ["bad"] });
if (blocked.status !== "blocked" || blocked.dispatch.length || blocked.archive_allowed || blocked.gate.blocker_reason !== "contract-remediation") fail("AUDIT", "fail-closed drift");
const fabricated = structuredClone(normal); delete fabricated.evidence.sources.dependencies;
const defended = reducer.planReviewGate({ routeGates: ["4r-review-gate"], decision: fabricated, validationErrors: [] });
if (defended.status !== "blocked" || defended.dispatch.length || defended.archive_allowed) fail("AUDIT", "reducer validation drift");
const sensitiveErrors = ["Authorization: Bearer synthetic.jwt.value", "AKIAIOSFODNN7EXAMPLE", "arbitrary payload"];
const sanitized = reducer.planReviewGate({ routeGates: ["4r-review-gate"], validationErrors: sensitiveErrors });
const sanitizedJson = JSON.stringify(sanitized.gate);
if (sanitized.gate.validation_error_codes.join(",") !== "adapter-contract-invalid,decision-contract-invalid" || sensitiveErrors.some((value) => sanitizedJson.includes(value)) || Object.hasOwn(sanitized.gate, "validation_errors")) fail("AUDIT", sanitizedJson);
for (const field of ["paths", "capabilities", "dependencies", "operationTypes"]) {
  try { classifier.normalizeReviewEvidence({ ...input, [field]: ["valid", { arbitrary: true }] }); fail("EVIDENCE", field + " coerced non-string evidence"); }
  catch (error) { if (!/must contain only strings/.test(error.message)) fail("EVIDENCE", field + ": " + error.message); }
}
const lexicalEvidence = classifier.normalizeReviewEvidence({ ...input,
  diff: "diff --git a/scripts/runtime.js b/scripts/runtime.js\n--- a/scripts/runtime.js\n+++ b/scripts/runtime.js\n@@ -0,0 +1,6 @@\n+counter--; spawnSync(command)\n+const live = \`documentation \${request(url)}\`;\n+const documentary = \`authorize(user)\`;\n+const multiline = \`\n+authorize(user) throw fallback()\n+\`;\ndiff --git a/src/runtime.py b/src/runtime.py\n--- a/src/runtime.py\n+++ b/src/runtime.py\n@@ -0,0 +1 @@\n+live = f\"documentation {request(url)}\"\ndiff --git a/src/runtime.rb b/src/runtime.rb\n--- a/src/runtime.rb\n+++ b/src/runtime.rb\n@@ -0,0 +1,4 @@\n+=begin\n+authorize(user)\n+=end\n+request(url)",
  paths: ["scripts/runtime.js", "src/runtime.py", "src/runtime.rb"] });
const lexicalFacts = lexicalEvidence.sources.facts.filter((fact) => fact.source === "real-diff");
if (JSON.stringify(lexicalFacts) !== JSON.stringify([{ code: "diff-network-flow", source: "real-diff", detail: "scripts/runtime.js,src/runtime.py,src/runtime.rb" }, { code: "diff-process-execution", source: "real-diff", detail: "scripts/runtime.js" }])) fail("EVIDENCE", JSON.stringify(lexicalFacts));
const candidate = { projection: "workspace", base_tree: "base", candidate_tree: "tree", paths: ["scripts/run.js"], diff_hash: "sha256:" + "a".repeat(64), paths_digest: "sha256:" + "b".repeat(64), authored_lines: 401, original_changed_lines: 401 };
let review = lineage.startReviewLineage({ candidate, classification: "normal", selected_dimensions: ["risk"], evidence_fingerprint: "sha256:" + "c".repeat(64) });
if (review.correction_budget.limit_lines !== 200 || review.correction_budget.max_failed_attempts !== 3) fail("LINEAGE", "bounded genesis drift");
const initialPlan = reducer.planLineageGate({ lineage: review, observed_candidate_id: review.current_candidate_id });
if (initialPlan.dispatch.join(",") !== "review-risk" || initialPlan.next_action.type !== "run-lenses") fail("LINEAGE", "one-shot dispatch drift");
review = lineage.beginLens(review, { dimension: "risk", expected_revision: review.revision, request_id: "risk-start" });
review = lineage.recordLensResult(review, { dimension: "risk", expected_revision: review.revision, request_id: "risk-result", result: { findings: [] } });
review = lineage.freezeFindings(review, { expected_revision: review.revision, request_id: "freeze" });
if (review.status !== "approved") fail("LINEAGE", "terminal approval drift");
if (lineage.validateLineageForGate(review, { candidate_id: "sha256:drift", gate: "archive" }).code !== "candidate-drift") fail("LINEAGE", "candidate gate drift");
try { lineage.beginLens(review, { dimension: "risk", expected_revision: review.revision, request_id: "rerun" }); fail("LINEAGE", "reviewer rerun accepted"); }
catch (error) { if (/reviewer rerun accepted/.test(error.message)) throw error; }
`;

function targetPaths(target) {
  return {
    claude: { generalist: "agents/review-change.md", correction: "agents/review-correction.md", orchestrator: "skills/sdd-orchestrator/SKILL.md" },
    vscode: { generalist: "agents/review-change.agent.md", correction: "agents/review-correction.agent.md", orchestrator: "agents/sdd-orchestrator.agent.md" },
    "github-copilot": { generalist: ".github/agents/review-change.agent.md", correction: ".github/agents/review-correction.agent.md", orchestrator: ".github/agents/sdd-orchestrator.agent.md" },
    opencode: { generalist: ".opencode/agents/review-change.md", correction: ".opencode/agents/review-correction.md", orchestrator: ".opencode/agents/ospec-workflow.md" },
    codex: { generalist: ".codex/agents/review-change.toml", correction: ".codex/agents/review-correction.toml", orchestrator: "agent.md" },
  }[target];
}
