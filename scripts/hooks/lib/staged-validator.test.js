"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  getStagedFiles,
  checkStagedSyntax,
  findAffectedTests,
  findAffectedTargets,
  runStagedChecks,
} = require("./staged-validator.js");

test("getStagedFiles returns empty array when git command fails", () => {
  const files = getStagedFiles("/fake/repo", {
    spawnSync: () => ({ status: 1, error: new Error("git error") }),
  });
  assert.deepEqual(files, []);
});

test("getStagedFiles parses git diff output into trimmed lines", () => {
  const files = getStagedFiles("/fake/repo", {
    spawnSync: () => ({
      status: 0,
      stdout: "scripts/check.js\r\nscripts/lib/staged-validator.js\n\n",
    }),
  });
  assert.deepEqual(files, ["scripts/check.js", "scripts/lib/staged-validator.js"]);
});

test("checkStagedSyntax validates correct JS and JSON without errors", () => {
  const fakeFs = {
    existsSync: () => true,
    readFileSync: (p) => {
      if (p.endsWith(".json")) return '{"name": "test", "valid": true}';
      return "const x = 1; function test() { return x + 1; }";
    },
  };

  const errors = checkStagedSyntax(["sample.js", "sample.json"], "/fake/repo", { fs: fakeFs });
  assert.deepEqual(errors, []);
});

test("checkStagedSyntax detects JS syntax error", () => {
  const fakeFs = {
    existsSync: () => true,
    readFileSync: () => "const = 123;",
  };

  const errors = checkStagedSyntax(["broken.js"], "/fake/repo", { fs: fakeFs });
  assert.equal(errors.length, 1);
  assert.equal(errors[0].file, "broken.js");
  assert.equal(errors[0].type, "js-syntax");
});

test("checkStagedSyntax detects JSON parse error", () => {
  const fakeFs = {
    existsSync: () => true,
    readFileSync: () => '{"broken": json without quotes}',
  };

  const errors = checkStagedSyntax(["bad.json"], "/fake/repo", { fs: fakeFs });
  assert.equal(errors.length, 1);
  assert.equal(errors[0].file, "bad.json");
  assert.equal(errors[0].type, "json-syntax");
});

test("findAffectedTests collects direct test files and corresponding source tests", () => {
  const staged = [
    "scripts/hooks/pre-commit-hook.test.js",
    "scripts/hooks/pre-commit-hook.js",
  ];

  const fakeFs = {
    existsSync: (p) => p.includes("pre-commit-hook.test.js"),
  };

  const tests = findAffectedTests(staged, "c:/repo", { fs: fakeFs });
  assert.ok(tests.includes("scripts/hooks/pre-commit-hook.test.js"));
});

test("findAffectedTests triggers contract and doc lints for agents/skills/openspec", () => {
  const staged = [
    "agents/sdd-apply.agent.md",
    "skills/sdd-apply/SKILL.md",
    "openspec/config.yaml",
  ];

  const tests = findAffectedTests(staged, "c:/repo", { fs: { existsSync: () => false } });
  assert.ok(tests.includes("scripts/contract-lint.test.js"));
  assert.ok(tests.includes("scripts/docs-lint.test.js"));
});

test("findAffectedTests defaults to contract and docs lint when no specific tests match", () => {
  const staged = ["some-unknown-file.txt"];
  const tests = findAffectedTests(staged, "c:/repo", { fs: { existsSync: () => false } });
  assert.deepEqual(tests, ["scripts/contract-lint.test.js", "scripts/docs-lint.test.js"]);
});

test("findAffectedTargets detects configure changes for specific targets", () => {
  const staged = [
    "scripts/configure/validate-antigravity.js",
    "scripts/configure/validate-cursor.js",
  ];
  const targets = findAffectedTargets(staged);
  assert.ok(targets.includes("antigravity"));
  assert.ok(targets.includes("cursor"));
  assert.equal(targets.length, 2);
});

test("runStagedChecks fails fast on syntax errors before running tests", () => {
  const fakeFs = {
    existsSync: () => true,
    readFileSync: () => "const bad = ;",
  };

  let runStepCalled = false;
  assert.throws(
    () =>
      runStagedChecks(
        {
          repoRoot: "/fake",
          stagedFiles: ["broken.js"],
          runStep: () => {
            runStepCalled = true;
          },
        },
        { fs: fakeFs }
      ),
    /Error de sintaxis en archivos staged/
  );
  assert.equal(runStepCalled, false);
});

test("runStagedChecks runs affected tests and generates affected targets", () => {
  const steps = [];
  const generated = [];

  const fakeFs = {
    existsSync: () => true,
    readFileSync: () => "const ok = 1;",
  };

  const result = runStagedChecks(
    {
      repoRoot: "/fake",
      stagedFiles: ["scripts/hooks/pre-commit-hook.test.js", "scripts/configure/validate-codex.js"],
      runStep: (name, args) => steps.push({ name, args }),
      generateTarget: (target) => generated.push(target),
    },
    { fs: fakeFs }
  );

  assert.equal(result.ok, true);
  assert.equal(steps.length, 1);
  assert.match(steps[0].name, /Targeted tests/);
  assert.ok(generated.includes("codex"));
});
