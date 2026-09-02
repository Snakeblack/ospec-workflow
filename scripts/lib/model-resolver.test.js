"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { resolveModel, validateSddModelPolicy, REQUIRED_SDD_AGENTS, OMIT } = require("./model-resolver.js");

const MODELS = {
  agents: {
    "sdd-design": "premium",
    "sdd-apply": "default",
    _default: "default",
  },
  tiers: {
    premium: {
      claude: "opus",
      vscode: ["Claude Opus 4.5 (copilot)", "GPT-5.5 (copilot)"],
      "copilot-cli": "inherit",
    },
    default: {
      claude: "sonnet",
      vscode: ["Claude Sonnet 4.5 (copilot)"],
      "copilot-cli": "inherit",
    },
    cheap: { claude: "haiku" },
  },
};

test("per-target assignment overrides the agent→tier table", () => {
  const models = {
    ...MODELS,
    assignments: {
      claude: {
        "sdd-apply": { model: "fable", effort: "max" },
      },
      antigravity: {
        _all: "flash",
      },
    },
  };
  assert.deepEqual(resolveModel("sdd-apply", "claude", models), { model: "fable", effort: "max" });
  assert.equal(resolveModel("sdd-design", "claude", models), "opus");
  assert.equal(resolveModel("sdd-apply", "antigravity", models), "flash");
  assert.equal(resolveModel("sdd-design", "antigravity", models), "flash");
});

test("codex assignment materializes effort as model_reasoning_effort", () => {
  const models = {
    agents: { "sdd-apply": "default", _default: "default" },
    tiers: { default: { codex: { model: "gpt-5.6-terra", model_reasoning_effort: "medium" } } },
    assignments: {
      codex: {
        "sdd-apply": { model: "gpt-5.6-sol", effort: "xhigh", verbosity: "low" },
      },
    },
  };
  assert.deepEqual(resolveModel("sdd-apply", "codex", models), {
    model: "gpt-5.6-sol",
    model_reasoning_effort: "xhigh",
    model_verbosity: "low",
  });
});

test("listed agent resolves its tier model per target", () => {
  assert.equal(resolveModel("sdd-design", "claude", MODELS), "opus");
  assert.deepEqual(resolveModel("sdd-design", "vscode", MODELS), [
    "Claude Opus 4.5 (copilot)",
    "GPT-5.5 (copilot)",
  ]);
});

test("unlisted agent falls back to the _default tier", () => {
  assert.equal(resolveModel("sdd-onboard", "claude", MODELS), "sonnet");
});

test("inherit yields the OMIT sentinel", () => {
  assert.equal(resolveModel("sdd-design", "copilot-cli", MODELS), OMIT);
});

test("missing tier/target entry yields OMIT without throwing", () => {
  assert.equal(resolveModel("sdd-design", "unknown-target", MODELS), OMIT);
  assert.equal(resolveModel("sdd-design", "vscode", { tiers: { premium: {} } }), OMIT);
});

test("absent or malformed config yields OMIT", () => {
  assert.equal(resolveModel("x", "claude", null), OMIT);
  assert.equal(resolveModel("x", "claude", {}), OMIT);
  assert.equal(resolveModel("x", "claude", "nope"), OMIT);
});

test("canonical validator accepts model, effort, reviewer, and default choices from models.yaml", () => {
  const agents = Object.fromEntries(REQUIRED_SDD_AGENTS.map(agent => [agent, "default"]));
  agents["review-change"] = "premium";
  agents._default = "premium";

  const result = validateSddModelPolicy({
    agents,
    tiers: {
      premium: { codex: { model: "future-premium-model", model_reasoning_effort: "high" } },
      default: { codex: { model: "future-default-model", model_reasoning_effort: "xhigh" } },
      cheap: { codex: { model: "future-cheap-model", model_reasoning_effort: "low" } },
    },
  });

  assert.deepEqual(result, { valid: true, errors: [] });
});

test("canonical validator reports structural errors without pinning configurable policy", () => {
  const result = validateSddModelPolicy({
    agents: { "sdd-propose": "default", "sdd-apply": "mystery", "review-change": "future", _default: "premium" },
    tiers: { premium: {}, default: {}, cheap: {} },
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => error.code === "unknown-tier" && error.agent === "sdd-apply" && error.actual === "mystery"));
  assert.ok(result.errors.some(error => error.code === "unknown-tier" && error.agent === "review-change" && error.actual === "future"));
  assert.ok(!result.errors.some(error => error.agent === "_default"));
  assert.ok(result.errors.some(error => error.code === "missing-agent" && error.agent === "sdd-design"));
});
