"use strict";

// Content lint: YAML forbids tabs for indentation, so a ```yaml fenced example
// that uses tabs is invalid and misleads anyone who copies it. Scan every source
// markdown file (the generated dist/ tree is excluded — it mirrors source).

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "dist"]);

function markdownFiles(dir = ROOT, acc = []) {
  // Other test files create/remove real directories under openspec/changes/
  // while suites run in parallel. A directory can vanish between the parent
  // readdirSync and this recursive call; treat that race as "no files here"
  // instead of failing the whole scan.
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT" || err.code === "EPERM" || err.code === "EACCES") return acc;
    throw err;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        markdownFiles(path.join(dir, entry.name), acc);
      }
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      acc.push(path.join(dir, entry.name));
    }
  }
  return acc;
}

function yamlFenceTabLines(text) {
  const lines = text.split(/\r?\n/);
  const offenders = [];
  let inYaml = false;
  for (let i = 0; i < lines.length; i += 1) {
    const fence = lines[i].match(/^\s*```\s*(\w+)?/);
    if (fence) {
      inYaml = !inYaml && (fence[1] || "").toLowerCase() === "yaml" ? true : false;
      continue;
    }
    if (inYaml && lines[i].includes("\t")) {
      offenders.push(i + 1);
    }
  }
  return offenders;
}

test("no ```yaml fenced example uses tabs for indentation", () => {
  const problems = [];
  for (const file of markdownFiles()) {
    let content;
    try {
      content = fs.readFileSync(file, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") continue;
      throw err;
    }
    const offenders = yamlFenceTabLines(content);
    if (offenders.length > 0) {
      problems.push(`${path.relative(ROOT, file)}: lines ${offenders.join(", ")}`);
    }
  }
  assert.deepEqual(problems, [], `tabs in yaml fences:\n${problems.join("\n")}`);
});

// ---------------------------------------------------------------------------
// C4 — Compact rules budget enforcement (skills/_shared/token-budget.md).
// Target per skill is 50-150 estimated tokens; this lint enforces the hard cap
// so a new skill with fat compact_rules cannot silently degrade every dispatch.
// Current worst offender is ~418 (stack-starlight) — the cap ratchets DOWN as
// offenders shrink; never raise it to admit a new fat skill.
// ---------------------------------------------------------------------------

const COMPACT_RULES_HARD_CAP_TOKENS = 450;

test("compact rules budget: no skill's compact_rules exceeds the hard cap", async () => {
  const { discoverSkills } = require("./lib/skill-registry.js");
  const { skills } = await discoverSkills(ROOT);
  assert.ok(skills.length > 0, "discoverSkills must find skills");

  const estimateTokens = (rules) => Math.round(rules.join(" ").length / 4);
  const offenders = skills
    .map((skill) => ({ id: skill.id, tokens: estimateTokens(skill.compact_rules) }))
    .filter((entry) => entry.tokens > COMPACT_RULES_HARD_CAP_TOKENS);

  assert.deepEqual(
    offenders,
    [],
    `compact_rules over ${COMPACT_RULES_HARD_CAP_TOKENS} estimated tokens degrade every dispatch: ` +
      offenders.map((o) => `${o.id}=${o.tokens}`).join(", ")
  );
});

// ---------------------------------------------------------------------------
// E1.32 (OSP-008): the READMEs must not promise `claude plugin validate
// --strict` as a CI gate unless a workflow really runs it. Until then every
// mention in the target table and its paragraph carries the local qualifier
// ("locally" / "localmente"), the honest state of Validate Harness.
// ---------------------------------------------------------------------------

const README_LOCAL_TERM = new Map([
  ["README.md", "locally"],
  ["README.es.md", "localmente"],
]);

function workflowRunsClaudeValidate() {
  const dir = path.join(ROOT, ".github", "workflows");
  for (const entry of fs.readdirSync(dir)) {
    if (!/\.ya?ml$/.test(entry)) continue;
    const lines = fs.readFileSync(path.join(dir, entry), "utf8").split(/\r?\n/);
    if (lines.some((line) => !line.trimStart().startsWith("#") && line.includes("claude plugin validate"))) {
      return true;
    }
  }
  return false;
}

test("READMEs present `claude plugin validate --strict` as a local check, not a CI gate", () => {
  if (workflowRunsClaudeValidate()) return; // a workflow runs it for real: the gate promise holds
  const problems = [];
  for (const [file, term] of README_LOCAL_TERM) {
    const lines = fs.readFileSync(path.join(ROOT, file), "utf8").split(/\r?\n/);
    lines.forEach((line, index) => {
      if (line.includes("claude plugin validate --strict") && !line.includes(term)) {
        problems.push(`${file}:${index + 1} must say "${term}" or CI must run the validation`);
      }
    });
  }
  assert.deepEqual(problems, [], `unqualified claude validate gate:\n${problems.join("\n")}`);
});

// ---------------------------------------------------------------------------
// OSP-026 (#341): the published bench summary must not sell a difference no
// bench supports. Quality reads as not demonstrated, with the significance of
// the one-repetition result, and never as fewer defects in every bench.
// ---------------------------------------------------------------------------

const BENCH_SUMMARIES = new Map([
  ["README.md", { verdict: "not demonstrated", significance: "p≈0.49", claim: /fewer defects in every bench/i }],
  ["README.es.md", { verdict: "no demostrada", significance: "p≈0,49", claim: /menos defectos en todos los bancos/i }],
  ["docs/benchs/bench-idd-vs-gentle-ai.md", { verdict: "not demonstrated", significance: "p≈0.49", claim: /fewer defects than gentle-ai in every bench/i }],
  ["docs/benchs/bench-idd-vs-gentle-ai.es.md", { verdict: "no demostrada", significance: "p≈0,49", claim: /menos defectos que gentle-ai en todos los bancos/i }],
]);

test("bench summaries call quality not demonstrated, with its significance and the Engram asymmetry", () => {
  const problems = [];
  for (const [file, { verdict, significance, claim }] of BENCH_SUMMARIES) {
    const text = fs.readFileSync(path.join(ROOT, file), "utf8");
    const quality = text.split(/\r?\n/).find((line) => /^- \*\*(Quality|Calidad)/.test(line)) || "";
    if (!quality.includes(verdict)) problems.push(`${file}: the quality line must say "${verdict}"`);
    if (!quality.includes(significance)) problems.push(`${file}: the quality line must give ${significance}`);
    if (!/Engram/.test(quality)) problems.push(`${file}: the quality line must state that Engram ran in one arm`);
    if (claim.test(text)) problems.push(`${file}: claims fewer defects in every bench`);
  }
  assert.deepEqual(problems, [], problems.join("\n"));
});
