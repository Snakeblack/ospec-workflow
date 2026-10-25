"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { buildPlan, PROTOCOL_VERSION, validateRequest } = require("./installer-adapter.js");

function cleanHome(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "installer-protocol-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { homedir: () => dir, env: {}, platform: process.platform };
}

test("the live plan offers every model tier on each assignable host, with no model name but Claude's aliases", (t) => {
  const plan = buildPlan({ sourceDir: process.cwd(), userModelsOptions: cleanHome(t) });
  for (const id of ["claude", "codex", "opencode", "cursor", "vscode", "github-copilot"]) {
    const target = plan.targets.find(item => item.id === id);
    assert.deepEqual(target.tiers.map(tier => tier.id), ["premium", "default", "cheap"], id);
    assert.ok(target.tiers.every(tier => tier.value === "" && tier.agents.length > 0), id);
    assert.deepEqual(target.tiers.map(tier => tier.fallback), id === "claude" ? ["opus", "sonnet", "haiku"] : ["", "", ""], id);
  }
  assert.deepEqual(plan.targets.find(item => item.id === "antigravity").tiers, []);
});

test("protocol v3 accepts a request built from the live plan", (t) => {
  const plan = buildPlan({ sourceDir: process.cwd(), userModelsOptions: cleanHome(t) });
  const request = { version: PROTOCOL_VERSION, target: "github-copilot", models: { premium: "gpt-6 Sol (copilot)", default: "", cheap: "" } };
  assert.equal(validateRequest(request, plan).target, "github-copilot");
});
