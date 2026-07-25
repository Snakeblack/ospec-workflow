"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { parseModels, runConfigure } = require("./configure/cli.js");
const { parse, getField } = require("./lib/frontmatter.js");
const {
  CODEX_TIER_POLICY,
  SDD_AGENT_TIERS,
  validateSddModelPolicy,
} = require("./lib/model-resolver.js");

const ROOT = path.resolve(__dirname, "..");
const MODELS_TEXT = fs.readFileSync(path.join(ROOT, "models.yaml"), "utf8");
const EXPECTED_TIERS = {
  premium: ["sdd-propose", "sdd-design", "sdd-verify", "sdd-foundation", "sdd-workspace"],
  default: ["sdd-orchestrator", "sdd-spec", "sdd-clarify", "sdd-apply", "sdd-reconcile", "sdd-baseline"],
  cheap: ["sdd-init", "sdd-explore", "sdd-tasks", "sdd-archive", "sdd-onboard", "sdd-document"],
};
const REVIEWERS = ["review-change", "review-correction", "review-risk", "review-readability", "review-reliability", "review-resilience"];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function modelField(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const field = getField(parse(content).frontmatter, "model");
  return field && field.value;
}

function outputPath(out, target, agent) {
  if (target === "claude") return agent === "sdd-orchestrator" ? null : path.join(out, "agents", `${agent}.md`);
  if (target === "vscode") return path.join(out, "agents", `${agent}.agent.md`);
  if (target === "github-copilot") return path.join(out, ".github", "agents", `${agent}.agent.md`);
  if (target === "opencode") return path.join(out, ".opencode", "agents", `${agent === "sdd-orchestrator" ? "ospec-workflow" : agent}.md`);
  return agent === "sdd-orchestrator" ? path.join(out, "agent.md") : path.join(out, ".codex", "agents", `${agent}.toml`);
}

function treeDigest(root) {
  if (!fs.existsSync(root)) return "missing";
  const rows = [];
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile()) rows.push(`${path.relative(root, absolute).replace(/\\/g, "/")}:${crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex")}`);
    }
  };
  walk(root);
  return crypto.createHash("sha256").update(rows.join("\n")).digest("hex");
}

test("REQ-generator-005 canonical policy is the exact 5/6/6 partition with unchanged reviewers", () => {
  const models = parseModels(MODELS_TEXT);
  assert.deepEqual(SDD_AGENT_TIERS, EXPECTED_TIERS);
  assert.deepEqual(CODEX_TIER_POLICY, {
    premium: { model: "gpt-5.6-sol", model_reasoning_effort: "medium" },
    default: { model: "gpt-5.6-terra", model_reasoning_effort: "medium" },
    cheap: { model: "gpt-5.6-luna", model_reasoning_effort: "low" },
  });
  assert.deepEqual(validateSddModelPolicy(models), { valid: true, errors: [] });
  for (const reviewer of REVIEWERS) assert.equal(models.agents[reviewer], "default", reviewer);
  assert.equal(models.agents._default, "default");
});

test("REQ-generator-005 stale, missing, unknown and wrong Codex policy mutations fail deterministically", () => {
  const base = parseModels(MODELS_TEXT);
  const cases = [
    ["stale proposal", models => { models.agents["sdd-propose"] = "default"; }, "tier-mismatch", "sdd-propose"],
    ["stale document", models => { models.agents["sdd-document"] = "default"; }, "tier-mismatch", "sdd-document"],
    ["missing agent", models => { delete models.agents["sdd-tasks"]; }, "missing-agent", "sdd-tasks"],
    ["unknown tier", models => { models.agents["sdd-apply"] = "mystery"; }, "unknown-tier", "sdd-apply"],
    ["wrong premium model", models => { models.tiers.premium.codex.model = "gpt-5.6-terra"; }, "codex-model-mismatch", "premium"],
    ["wrong cheap effort", models => { models.tiers.cheap.codex.model_reasoning_effort = "medium"; }, "codex-reasoning-effort-mismatch", "cheap"],
    ["missing default mapping", models => { delete models.tiers.default.codex; }, "codex-model-mismatch", "default"],
    ["reviewer drift", models => { models.agents["review-risk"] = "premium"; }, "tier-mismatch", "review-risk"],
  ];
  for (const [label, mutate, code, identity] of cases) {
    const models = clone(base);
    mutate(models);
    const result = validateSddModelPolicy(models);
    assert.equal(result.valid, false, label);
    assert.ok(result.errors.some(error => error.code === code && (error.agent === identity || error.tier === identity)), `${label}: ${JSON.stringify(result.errors)}`);
  }
});

test("REQ-generator-005 duplicate YAML agent keys are rejected before overwrite", () => {
  assert.throws(
    () => parseModels("agents:\n  sdd-apply: default\n  sdd-apply: cheap\ntiers:\n  default:\n    claude: sonnet\n"),
    /duplicate key.*sdd-apply.*line 3/i,
  );
});

test("REQ-generator-005 all five temporary targets honor tier models and fail-soft omission", t => {
  const models = parseModels(MODELS_TEXT);
  const allAgents = Object.values(EXPECTED_TIERS).flat();
  const beforeDist = treeDigest(path.join(ROOT, "dist"));
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-tier-contract-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));

  for (const target of ["claude", "vscode", "github-copilot", "opencode", "codex"]) {
    const out = path.join(base, target);
    assert.equal(runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false }).exitCode, 0);
    for (const [tier, agents] of Object.entries(EXPECTED_TIERS)) {
      for (const agent of agents) {
        const generated = outputPath(out, target, agent);
        if (generated === null) continue;
        assert.equal(fs.existsSync(generated), true, `${target}:${agent}`);
        const content = fs.readFileSync(generated, "utf8");
        if (target === "github-copilot" || (target === "codex" && agent === "sdd-orchestrator")) {
          assert.doesNotMatch(content, target === "codex" ? /^model\s*=/m : /^model:/m, `${target}:${agent}`);
        } else if (target === "codex") {
          assert.match(content, new RegExp(`^model = "${CODEX_TIER_POLICY[tier].model}"$`, "m"), `${target}:${agent}`);
          assert.match(content, new RegExp(`^model_reasoning_effort = "${CODEX_TIER_POLICY[tier].model_reasoning_effort}"$`, "m"), `${target}:${agent}`);
        } else {
          const declared = models.tiers[tier][target];
          const expected = declared && typeof declared === "object" && !Array.isArray(declared) ? declared.model : declared;
          assert.deepEqual(modelField(generated), expected, `${target}:${agent}`);
        }
      }
    }
    assert.equal(allAgents.length, 17);
  }
  assert.equal(treeDigest(path.join(ROOT, "dist")), beforeDist, "temporary generation must not change dist/**");
});
