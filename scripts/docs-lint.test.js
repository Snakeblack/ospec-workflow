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
    if (err.code === "ENOENT") return acc;
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
// Current worst offender is ~471 (tdd-workflow) — the cap ratchets DOWN as
// offenders shrink; never raise it to admit a new fat skill.
// ---------------------------------------------------------------------------

const COMPACT_RULES_HARD_CAP_TOKENS = 500;

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
