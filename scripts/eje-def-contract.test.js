"use strict";

// Prose-invariant contract tests for Ejes D (target capabilities + hook
// parity declared), E1 (executable Go/JS parity contract) and F (role guides
// + English entry docs). The executable parity itself runs in
// scripts/hooks/parity-contract.test.js and internal/hooks (Go).

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");
const read = (p) => fs.readFile(path.join(ROOT_DIR, p), "utf8");

// D1/D2 — capability + hook parity matrices

test("D1 · target-capabilities.md declares the capability matrix for the 4 targets", async () => {
  const content = await read("docs/target-capabilities.md");
  for (const target of ["claude", "vscode", "github-copilot", "opencode"]) {
    assert.ok(content.includes(target), `matrix must cover ${target}`);
  }
  for (const tool of ["AskUserQuestion", "vscode/askQuestions", "ask_user", "question"]) {
    assert.ok(content.includes(tool), `question-tool mapping must list ${tool}`);
  }
  assert.match(content, /degradaci/i, "must define the degradation rules");
});

test("D2 · target-capabilities.md declares hook parity and the git-hooks-cover-all rule", async () => {
  const content = await read("docs/target-capabilities.md");
  assert.match(content, /Paridad de hooks/i);
  assert.match(content, /git hooks locales son la única capa/i, "must state git hooks as the only universal layer");
});

test("D1 · 4R gate prefers parallel dispatch with serial degradation", async () => {
  const content = await read("skills/_shared/gate-4r-review.md");
  assert.match(content, /parallel preferred/i);
  assert.match(content, /degrade to serial/i);
});

// E1 — executable parity contract

test("E1 · parity fixtures are executed by BOTH runtimes", async () => {
  const readme = await read("internal/testdata/parity/README");
  assert.match(readme, /pretooluse_test\.go/, "README must point to the Go runner");
  assert.match(readme, /parity-contract\.test\.js/, "README must point to the JS runner");
  const jsRunner = await read("scripts/hooks/parity-contract.test.js");
  assert.match(jsRunner, /spawnSync/, "JS runner must exercise the real hook process");
  const bypass = await read("internal/testdata/parity/pre-tool-use-bypass.json");
  assert.match(bypass, /bypassPermissions/, "fixture set must cover permission-mode degradation");
});

test("E1 · parity doc declares the executable contract rule", async () => {
  const content = await read("docs/harness-go-js-parity.md");
  assert.match(content, /Contrato ejecutable \(E1\)/);
  assert.match(content, /nunca "arregles" la fixture sola/i);
});

// F1/F2 — onboarding + English entry point

test("F2 · the three role guides exist and answer their question", async () => {
  const guides = [
    ["docs/onboarding/tech-lead.md", /qué me garantiza esto/i],
    ["docs/onboarding/developer.md", /qué comandos me importan/i],
    ["docs/onboarding/reviewer.md", /cómo leo un change/i],
  ];
  for (const [file, question] of guides) {
    const content = await read(file);
    assert.match(content, question, `${file} must answer its role question`);
  }
});

test("F1 · English entry README exists with install and guarantees", async () => {
  const content = await read("docs/en/README.md");
  assert.match(content, /No gate self-approves/);
  assert.match(content, /\/sdd-init/);
  assert.match(content, /docs\/target-capabilities\.md/, "must link the capability matrix");
});
