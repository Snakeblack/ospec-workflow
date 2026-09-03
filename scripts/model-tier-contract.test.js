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
  REQUIRED_SDD_AGENTS,
  sddAgentsByTier,
  validateSddModelPolicy,
} = require("./lib/model-resolver.js");

const ROOT = path.resolve(__dirname, "..");
const MODELS_TEXT = fs.readFileSync(path.join(ROOT, "models.yaml"), "utf8");
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
  if (target === "cursor") return path.join(out, "agents", `${agent}.md`);
  return agent === "sdd-orchestrator" ? path.join(out, "AGENTS.md") : path.join(out, ".codex", "agents", `${agent}.toml`);
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

test("REQ-generator-011 live quality roster mappings are required", () => {
  const models = parseModels(MODELS_TEXT);
  for (const agent of ["review-change", "review-correction", "review-trust", "review-runtime", "review-evolution", "review-efficiency"]) {
    assert.ok(models.agents[agent], `${agent} must be mapped in models.yaml`);
  }
  assert.ok(models.agents["review-risk"], "legacy review-risk remains allowed");
});

test("REQ-generator-005 models.yaml is the agent-tier source of truth with structural guards", () => {
  const models = parseModels(MODELS_TEXT);
  const partition = sddAgentsByTier(models.agents);
  assert.deepEqual(REQUIRED_SDD_AGENTS.length, 17);
  assert.deepEqual(
    [...partition.premium, ...partition.default, ...partition.cheap].sort(),
    [...REQUIRED_SDD_AGENTS].sort(),
  );
  assert.deepEqual(validateSddModelPolicy(models), { valid: true, errors: [] });
});

test("REQ-generator-005 missing, unknown, and unexpected structural mutations fail deterministically", () => {
  const base = parseModels(MODELS_TEXT);
  const cases = [
    ["missing agent", models => { delete models.agents["sdd-tasks"]; }, "missing-agent", "sdd-tasks"],
    ["unknown tier", models => { models.agents["sdd-apply"] = "mystery"; }, "unknown-tier", "sdd-apply"],
    ["unexpected agent", models => { models.agents["sdd-extra"] = "default"; }, "unexpected-agent", "sdd-extra"],
    ["unknown reviewer tier", models => { models.agents["review-risk"] = "mystery"; }, "unknown-tier", "review-risk"],
    ["unknown default tier", models => { models.agents._default = "mystery"; }, "unknown-tier", "_default"],
  ];
  for (const [label, mutate, code, identity] of cases) {
    const models = clone(base);
    mutate(models);
    const result = validateSddModelPolicy(models);
    assert.equal(result.valid, false, label);
    assert.ok(result.errors.some(error => error.code === code && (error.agent === identity || error.tier === identity)), `${label}: ${JSON.stringify(result.errors)}`);
  }
});

test("REQ-generator-005 all model routing choices in models.yaml are accepted", () => {
  const models = clone(parseModels(MODELS_TEXT));
  models.agents["sdd-propose"] = "premium";
  models.agents["sdd-document"] = "default";
  models.agents["review-risk"] = "premium";
  models.agents._default = "premium";
  models.tiers.premium.codex.model = "future-premium-model";
  models.tiers.premium.codex.model_reasoning_effort = "high";
  models.tiers.default.codex.model = "future-default-model";
  models.tiers.default.codex.model_reasoning_effort = "xhigh";
  assert.deepEqual(validateSddModelPolicy(models), { valid: true, errors: [] });
});

test("REQ-generator-005 duplicate YAML agent keys are rejected before overwrite", () => {
  assert.throws(
    () => parseModels("agents:\n  sdd-apply: default\n  sdd-apply: cheap\ntiers:\n  default:\n    claude: sonnet\n"),
    /duplicate key.*sdd-apply.*line 3/i,
  );
});

test("REQ-generator-005 all six temporary targets honor models.yaml tiers and fail-soft omission", t => {
  const models = parseModels(MODELS_TEXT);
  const partition = sddAgentsByTier(models.agents);
  const allAgents = Object.values(partition).flat();
  const beforeDist = treeDigest(path.join(ROOT, "dist"));
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-tier-contract-"));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));

  for (const target of ["claude", "vscode", "github-copilot", "opencode", "codex", "cursor"]) {
    const out = path.join(base, target);
    assert.equal(runConfigure({ sourceDir: ROOT, target, outDir: out, validate: false }).exitCode, 0);
    for (const [tier, agents] of Object.entries(partition)) {
      for (const agent of agents) {
        const generated = outputPath(out, target, agent);
        if (generated === null) continue;
        assert.equal(fs.existsSync(generated), true, `${target}:${agent}`);
        const content = fs.readFileSync(generated, "utf8");
        if (target === "github-copilot" || (target === "codex" && agent === "sdd-orchestrator")) {
          assert.doesNotMatch(content, target === "codex" ? /^model\s*=/m : /^model:/m, `${target}:${agent}`);
        } else if (target === "codex") {
          assert.match(content, new RegExp(`^model = "${models.tiers[tier].codex.model}"$`, "m"), `${target}:${agent}`);
          assert.match(content, new RegExp(`^model_reasoning_effort = "${models.tiers[tier].codex.model_reasoning_effort}"$`, "m"), `${target}:${agent}`);
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
