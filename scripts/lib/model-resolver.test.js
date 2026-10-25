"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  resolveModel,
  validateSddModelPolicy,
  validateUserModels,
  REQUIRED_SDD_AGENTS,
  REQUIRED_QUALITY_REVIEW_AGENTS,
  OMIT,
} = require("./model-resolver.js");

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

test("the user's model for a tier takes precedence on its target only", () => {
  const models = { ...MODELS, userModels: { premium: "temporary-model" } };

  assert.equal(resolveModel("sdd-design", "claude", models), "temporary-model");
  assert.equal(resolveModel("sdd-apply", "claude", models), "sonnet");
  assert.equal(MODELS.tiers.premium.claude, "opus");
});

test("a user model keeps the tier's settings that are not a model name", () => {
  const models = {
    agents: { "sdd-apply": "cheap" },
    tiers: { cheap: { codex: { model_reasoning_effort: "low", model_verbosity: "low" } } },
  };
  assert.equal(resolveModel("sdd-apply", "codex", models), OMIT, "effort without a model inherits");
  assert.deepEqual(resolveModel("sdd-apply", "codex", { ...models, userModels: { cheap: " gpt-x " } }), {
    model_reasoning_effort: "low",
    model_verbosity: "low",
    model: "gpt-x",
  });
  assert.equal(resolveModel("sdd-apply", "cursor", { ...models, userModels: { cheap: "composer" } }), "composer");
  assert.equal(resolveModel("sdd-apply", "cursor", { ...models, userModels: { cheap: "  " } }), OMIT);
});

test("user model validation accepts known tiers with a model and rejects the rest", () => {
  assert.deepEqual(validateUserModels(undefined), { valid: true, errors: [] });
  assert.deepEqual(validateUserModels({ premium: "gpt", cheap: "Gemini 3.8 Flash (copilot)" }), { valid: true, errors: [] });
  assert.equal(validateUserModels({ ultra: "gpt" }).valid, false);
  assert.equal(validateUserModels({ premium: "" }).valid, false);
  assert.equal(validateUserModels({ premium: ["a"] }).valid, false);
  assert.equal(validateUserModels(["premium"]).valid, false);
});

test("canonical validator accepts model, effort, reviewer, and default choices from models.yaml", () => {
  const agents = Object.fromEntries(REQUIRED_SDD_AGENTS.map(agent => [agent, "default"]));
  for (const agent of REQUIRED_QUALITY_REVIEW_AGENTS) {
    agents[agent] = agent === "review-change" ? "premium" : "default";
  }
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
