"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPlan, PROTOCOL_VERSION, validateRequest } = require("./installer-adapter.js");

test("protocol v2 accepts the opaque preset request produced from its live plan", () => {
  const plan = buildPlan({ sourceDir: process.cwd() });
  const target = plan.targets.find(item => item.id === "github-copilot");
  const preset = target.presets.find(item => item.id === "recommended");
  const request = { version: PROTOCOL_VERSION, target: target.id, mode: "preset", presetId: preset.id, selections: preset.selections };
  assert.deepEqual(validateRequest(request, plan).target, "github-copilot");
});

test("protocol exposes only declared capabilities and rejects a control for a capability-less model", () => {
  const plan = buildPlan({ sourceDir: process.cwd() });
  const target = plan.targets.find(item => item.id === "codex");
  const agent = target.agents.find(item => item.selectable);
  const choice = agent.choices.find(item => item.value.model === "gpt-5.3-codex");
  assert.deepEqual(choice.controls, {});
  const selections = Object.fromEntries(target.agents.filter(item => item.selectable).map(item => [item.id, { choiceId: item.id === agent.id ? choice.id : item.choices.find(candidate => JSON.stringify(candidate.value) === JSON.stringify(item.effective)).id, controls: item.id === agent.id ? { model_reasoning_effort: "high" } : {} }]));
  assert.throws(() => validateRequest({ version: PROTOCOL_VERSION, target: target.id, mode: "custom", selections }, plan), /unsupported control/);
});
