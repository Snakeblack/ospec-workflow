"use strict";

// Quality comparison of two bench records (E1.6): the pure parts of the
// delivery classification, the diff metrics, the mutation generator and the
// blind pairwise judgment. Nothing here runs a model or touches a workspace.

const test = require("node:test");
const assert = require("node:assert");

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { addedLines, classifyPath, locateWorkspace, metricsFromNumstat, readDelivery, scrubDiff } = require("./deliveries.js");
const { copyWorkspace, generateMutants, inlineScriptLines, maskLiterals, sampleEvenly } = require("./mutation.js");
const { evaluateQuality } = require("./quality.js");
const { aggregateJudgments, buildJudgePrompt, JUDGE_CRITERIA } = require("./judge.js");

test("paths are classified as workflow, test, types, docs or source", () => {
  assert.strictEqual(classifyPath(".ospec/session/latest.md"), "workflow");
  assert.strictEqual(classifyPath("openspec/changes/archive/x/spec.md"), "workflow");
  assert.strictEqual(classifyPath("idd/archive/2026-10-07-x/state.yaml"), "workflow");
  assert.strictEqual(classifyPath(".claude/settings.json"), "workflow");
  assert.strictEqual(classifyPath("odd/tasks/prioridades.md"), "workflow", "gentle-ai's feature document");
  assert.strictEqual(classifyPath(".atl/skill-registry.md"), "workflow", "gentle-ai's skill registry");
  assert.notStrictEqual(classifyPath("src/odd.js"), "workflow");
  assert.strictEqual(classifyPath("test/invoice.test.js"), "test");
  assert.strictEqual(classifyPath("src/__tests__/a.js"), "test");
  assert.strictEqual(classifyPath("src/paginate.spec.ts"), "test");
  assert.strictEqual(classifyPath("index.d.ts"), "types");
  assert.strictEqual(classifyPath("README.md"), "docs");
  assert.strictEqual(classifyPath("docs/adr/adr-001.md"), "docs");
  assert.strictEqual(classifyPath("CHANGELOG.md"), "docs");
  assert.strictEqual(classifyPath("src/invoice.js"), "source");
  assert.strictEqual(classifyPath("bin\\tasks.js"), "source");
  assert.strictEqual(classifyPath("node_modules/jsdom/lib/api.js"), "workflow", "installed dependencies are not product");
  assert.strictEqual(classifyPath("package-lock.json"), "workflow");
  assert.strictEqual(classifyPath("index.html"), "source");
});

test("numstat becomes per-category file and line counts, without workflow artifacts", () => {
  const numstat = [
    "12\t3\tsrc/invoice.js",
    "40\t0\ttest/invoice.test.js",
    "5\t1\tREADME.md",
    "200\t0\topenspec/changes/x/spec.md",
    "-\t-\tlogo.png",
  ].join("\n");
  assert.deepStrictEqual(metricsFromNumstat(numstat), {
    files: { source: 1, test: 1, types: 0, docs: 1, other: 1 },
    added: { source: 12, test: 40, types: 0, docs: 5, other: 0 },
    removed: { source: 3, test: 0, types: 0, docs: 1, other: 0 },
    workflow_files: 1,
    test_to_source: 3.33,
  });
  assert.strictEqual(metricsFromNumstat("").test_to_source, null);
});

test("added lines come from a zero-context diff with their new line numbers", () => {
  const diff = [
    "diff --git a/src/a.js b/src/a.js",
    "--- a/src/a.js",
    "+++ b/src/a.js",
    "@@ -3,0 +4,2 @@ function x() {",
    "+  if (n < 1) return 1;",
    "+  return n;",
    "@@ -10 +12 @@",
    "-  old();",
    "+  next();",
    "diff --git a/src/new.js b/src/new.js",
    "--- /dev/null",
    "+++ b/src/new.js",
    "@@ -0,0 +1 @@",
    "+module.exports = 1;",
  ].join("\n");
  assert.deepStrictEqual(addedLines(diff), {
    "src/a.js": [4, 5, 12],
    "src/new.js": [1],
  });
});

test("the blind diff hides which workflow produced it", () => {
  const scrubbed = scrubDiff("+// REQ-invoice-001, see openspec/specs and idd/archive (SDD, ospec)\n");
  assert.doesNotMatch(scrubbed, /openspec|\bidd\b|\bsdd\b|ospec/i);
});

test("literals are masked so operators inside strings are never mutated", () => {
  const line = `  if (a < b) throw new Error("a < b and 'x'" + \`t > \${y}\`);`;
  const masked = maskLiterals(line);
  assert.strictEqual(masked.length, line.length);
  assert.strictEqual(masked.indexOf("<"), line.indexOf("<"));
  assert.strictEqual(masked.lastIndexOf("<"), line.indexOf("<"), "the < inside the string is masked");
  assert.ok(!masked.includes(">"));
});

test("mutants change one operator, literal or throw per line, and skip comments and arrows", () => {
  const mutants = generateMutants("src/p.js", 7, "  if (page < 1 && size >= 0) throw new RangeError('bad');");
  const replaced = mutants.map((m) => m.text);
  assert.ok(replaced.includes("  if (page <= 1 && size >= 0) throw new RangeError('bad');"));
  assert.ok(replaced.includes("  if (page < 1 || size >= 0) throw new RangeError('bad');"));
  assert.ok(replaced.includes("  if (page < 1 && size > 0) throw new RangeError('bad');"));
  assert.ok(replaced.includes("  if (page < 2 && size >= 0) throw new RangeError('bad');"));
  assert.ok(replaced.includes("  if (page < 1 && size >= 0) void new RangeError('bad');"));
  for (const mutant of mutants) {
    assert.strictEqual(mutant.file, "src/p.js");
    assert.strictEqual(mutant.line, 7);
    assert.ok(typeof mutant.operator === "string");
  }
  assert.deepStrictEqual(generateMutants("a.js", 1, "  // if (a < b) return true;"), []);
  assert.deepStrictEqual(generateMutants("a.js", 1, "const f = (x) => x;").map((m) => m.text), []);
  assert.ok(generateMutants("a.js", 1, "return a === b;").some((m) => m.text === "return a !== b;"));
  assert.ok(generateMutants("a.js", 1, "return ok ? true : false;").some((m) => m.text === "return ok ? false : false;"));
  assert.ok(generateMutants("a.js", 1, "total = sub + iva;").some((m) => m.text === "total = sub - iva;"));
  assert.ok(!generateMutants("a.js", 1, "i++;").some((m) => m.operator === "arithmetic"));
});

test("sampling keeps the first and last mutants and is deterministic", () => {
  const items = Array.from({ length: 10 }, (_, i) => i);
  assert.deepStrictEqual(sampleEvenly(items, 4), [0, 3, 6, 9]);
  assert.deepStrictEqual(sampleEvenly(items, 20), items);
});

test("the judge prompt names both deliveries anonymously and every criterion", () => {
  const prompt = buildJudgePrompt({ brief: "Add discount codes.", first: "+a", second: "+b" });
  assert.match(prompt, /Delivery A/);
  assert.match(prompt, /Delivery B/);
  for (const criterion of JUDGE_CRITERIA) assert.ok(prompt.includes(criterion), criterion);
  assert.doesNotMatch(prompt, /\bsdd\b|\bidd\b/i);
});

test("judgments in both orders are mapped back to the arms and averaged", () => {
  const scores = (a, b) => Object.fromEntries(JUDGE_CRITERIA.map((c) => [c, { A: a, B: b }]));
  // Order 1: A = baseline. Order 2: A = candidate.
  const result = aggregateJudgments([
    { order: ["baseline", "candidate"], verdict: { scores: scores(4, 3), preferred: "A" } },
    { order: ["candidate", "baseline"], verdict: { scores: scores(3, 5), preferred: "B" } },
  ]);
  assert.deepStrictEqual(result.scores.baseline, Object.fromEntries(JUDGE_CRITERIA.map((c) => [c, 4.5])));
  assert.deepStrictEqual(result.scores.candidate, Object.fromEntries(JUDGE_CRITERIA.map((c) => [c, 3])));
  assert.strictEqual(result.preferred, "baseline");

  const split = aggregateJudgments([
    { order: ["baseline", "candidate"], verdict: { scores: scores(4, 4), preferred: "A" } },
    { order: ["candidate", "baseline"], verdict: { scores: scores(4, 4), preferred: "A" } },
  ]);
  assert.strictEqual(split.preferred, "inconsistent", "position bias is reported, not resolved");
  const tie = aggregateJudgments([
    { order: ["baseline", "candidate"], verdict: { scores: scores(4, 4), preferred: "tie" } },
    { order: ["candidate", "baseline"], verdict: { scores: scores(4, 4), preferred: "tie" } },
  ]);
  assert.strictEqual(tie.preferred, "tie");
});

test("the delivery is everything after the setup commit, committed or not", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "quality-delivery-"));
  const git = (...args) => assert.strictEqual(spawnSync("git", args, { cwd: root, encoding: "utf8" }).status, 0, args.join(" "));
  git("init", "-q", "-b", "main");
  git("config", "user.name", "bench");
  git("config", "user.email", "bench@example.invalid");
  git("config", "commit.gpgsign", "false");
  fs.writeFileSync(path.join(root, "a.js"), "module.exports = 1;\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  git("commit", "-q", "--allow-empty", "-m", "setup");
  git("checkout", "-q", "-b", "feat/x");
  fs.writeFileSync(path.join(root, "a.js"), "module.exports = 2;\n");
  git("commit", "-q", "-am", "feat: two");
  fs.writeFileSync(path.join(root, "b.js"), "module.exports = 3;\n");
  fs.mkdirSync(path.join(root, "odd", "tasks"), { recursive: true });
  fs.writeFileSync(path.join(root, "odd", "tasks", "x.md"), "- [x] T1\n");
  const delivery = readDelivery(root);
  assert.deepStrictEqual(delivery.product.sort(), ["a.js", "b.js"], "the committed edit and the new file; odd/ is workflow");
  assert.match(delivery.diff, /\+module\.exports = 2;/);
});

test("only the code of inline JavaScript blocks of an HTML file is mutated", () => {
  const html = [
    "<!doctype html>", // 1
    "<style>", // 2
    "  li > span { color: red; }", // 3
    "</style>", // 4
    "<script>", // 5
    "const MAXIMO = 200;", // 6
    "if (titulo.length > MAXIMO) return false;", // 7
    "</script>", // 8
    "<script src=\"vendor.js\"></script>", // 9
    "<script type=\"application/json\">", // 10
    "{ \"a\": 1 }", // 11
    "</script>", // 12
    "<script type=\"module\">", // 13
    "export const x = 1 + 2;", // 14
    "</script>", // 15
    "<p>a < b</p>", // 16
  ].join("\n");
  assert.deepStrictEqual([...inlineScriptLines(html)], [6, 7, 14]);
});

test("the mutation copy links the delivered node_modules instead of copying it", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "quality-copy-"));
  fs.mkdirSync(path.join(root, "node_modules", "jsdom"), { recursive: true });
  fs.writeFileSync(path.join(root, "node_modules", "jsdom", "index.js"), "module.exports = 1;\n");
  fs.writeFileSync(path.join(root, "index.html"), "<p></p>");
  const copy = copyWorkspace(root);
  try {
    assert.ok(fs.lstatSync(path.join(copy, "node_modules")).isSymbolicLink());
    assert.ok(fs.existsSync(path.join(copy, "node_modules", "jsdom", "index.js")));
    assert.ok(fs.existsSync(path.join(copy, "index.html")));
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
});

test("a repetition's workspace is found under r<n>, and a one-run record under the scenario", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "quality-locate-"));
  fs.mkdirSync(path.join(root, "one", "todo-spa", ".git"), { recursive: true });
  fs.mkdirSync(path.join(root, "three", "todo-spa", "r2", ".git"), { recursive: true });
  assert.strictEqual(locateWorkspace(root, "one", "todo-spa"), path.join(root, "one", "todo-spa"));
  assert.strictEqual(locateWorkspace(root, "three", "todo-spa", 2), path.join(root, "three", "todo-spa", "r2"));
  assert.throws(() => locateWorkspace(root, "three", "todo-spa", 3), /repetition 3/);
  fs.mkdirSync(path.join(root, "archived", "todo-spa", "r1", "workspace", ".git"), { recursive: true });
  assert.strictEqual(locateWorkspace(root, "archived", "todo-spa", 1), path.join(root, "archived", "todo-spa", "r1", "workspace"), "the bench archives a judged workspace next to its transcripts");
});

const delivery = (score, { passes = true } = {}) => ({ mutation: { suite_passes: passes, score: passes ? score : null } });
const pair = (baseline, candidate, preferred) => ({ baseline, candidate, ...(preferred ? { judge: { preferred } } : {}) });
const criterion = { max_mutation_score_deficit: 5, max_consistent_baseline_preferences: 1 };

test("the quality criterion continues within its margins and reports each arm's interval", () => {
  const verdict = evaluateQuality({ scenarios: {
    "todo-spa/r1": pair(delivery(80), delivery(78), "baseline"),
    "todo-spa/r2": pair(delivery(70), delivery(75), "inconsistent"),
    "todo-spa/r3": pair(delivery(90), delivery(80), "candidate"),
  } }, criterion);
  assert.strictEqual(verdict.decision, "continue", verdict.reasons.join("; "));
  assert.strictEqual(verdict.mutation.baseline.mean, 80);
  assert.strictEqual(verdict.mutation.candidate.mean, 77.666667);
  assert.ok(Array.isArray(verdict.mutation.candidate.ci95));
  assert.strictEqual(verdict.baseline_preferences, 1);
});

test("the quality criterion revises on a mutation deficit, a consistent baseline preference, or an unjudged pair", () => {
  const deficit = evaluateQuality({ scenarios: { a: pair(delivery(90), delivery(84), "tie") } }, criterion);
  assert.strictEqual(deficit.decision, "revise");
  assert.match(deficit.reasons.join(), /trails the baseline's by 6 points/);
  const failing = evaluateQuality({ scenarios: { a: pair(delivery(10), delivery(null, { passes: false }), "tie") } }, criterion);
  assert.strictEqual(failing.mutation.candidate.mean, 0, "a failing suite protects nothing");
  assert.strictEqual(failing.decision, "revise");
  const preferred = evaluateQuality({ scenarios: {
    a: pair(delivery(80), delivery(80), "baseline"),
    b: pair(delivery(80), delivery(80), "baseline"),
  } }, criterion);
  assert.match(preferred.reasons.join(), /in 2 pairs/);
  const unjudged = evaluateQuality({ scenarios: { a: pair(delivery(80), delivery(80)) } }, criterion);
  assert.match(unjudged.reasons.join(), /1 of 1 pairs are not judged/);
});
