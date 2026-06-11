"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { resolveModel, OMIT } = require("./model-resolver.js");

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
