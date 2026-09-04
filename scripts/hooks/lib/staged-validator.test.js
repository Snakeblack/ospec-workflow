"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  ALL_TARGETS,
  getStagedFiles,
  getStagedContent,
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

test("getStagedContent invokes git show with POSIX path and returns stdout", () => {
  let invoked = null;
  const content = getStagedContent("c:/repo", "scripts\\foo\\bar.js", {
    spawnSync: (cmd, args, opts) => {
      invoked = { cmd, args, opts };
      return { status: 0, stdout: "console.log('staged');\n" };
    },
  });

  assert.equal(invoked.cmd, "git");
  assert.deepEqual(invoked.args, ["show", ":scripts/foo/bar.js"]);
  assert.equal(invoked.opts.cwd, "c:/repo");
  assert.equal(invoked.opts.encoding, "utf8");
  assert.equal(invoked.opts.shell, false);
  assert.equal(content, "console.log('staged');\n");
});

test("getStagedContent returns null when git show fails or produces error", () => {
  const content1 = getStagedContent("c:/repo", "missing.js", {
    spawnSync: () => ({ status: 128, stdout: "", stderr: "fatal: path not in index" }),
  });
  assert.equal(content1, null);

  const content2 = getStagedContent("c:/repo", "error.js", {
    spawnSync: () => ({ status: 1, error: new Error("spawn error") }),
  });
  assert.equal(content2, null);
});

test("getStagedContent returns null when spawnSync throws", () => {
  const content = getStagedContent("c:/repo", "crash.js", {
    spawnSync: () => {
      throw new Error("fatal crash");
    },
  });
  assert.equal(content, null);
});

test("getStagedContent returns null for empty or invalid path", () => {
  assert.equal(getStagedContent("c:/repo", ""), null);
  assert.equal(getStagedContent("c:/repo", null), null);
});

test("checkStagedSyntax validates correct JS and JSON without errors", () => {
  const deps = {
    getStagedContent: (root, p) => {
      if (p.endsWith(".json")) return '{"name": "test", "valid": true}';
      return "const x = 1; function test() { return x + 1; }";
    },
  };

  const errors = checkStagedSyntax(["sample.js", "sample.json"], "/fake/repo", deps);
  assert.deepEqual(errors, []);
});

test("checkStagedSyntax detects JS syntax error", () => {
  const deps = {
    getStagedContent: () => "const = 123;",
  };

  const errors = checkStagedSyntax(["broken.js"], "/fake/repo", deps);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].file, "broken.js");
  assert.equal(errors[0].type, "js-syntax");
});

test("checkStagedSyntax detects JSON parse error", () => {
  const deps = {
    getStagedContent: () => '{"broken": json without quotes}',
  };

  const errors = checkStagedSyntax(["bad.json"], "/fake/repo", deps);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].file, "bad.json");
  assert.equal(errors[0].type, "json-syntax");
});

test("checkStagedSyntax detects error in staged JS even when working tree is clean", () => {
  const stagedFiles = ["app.js"];
  const fakeFs = {
    existsSync: () => true,
    readFileSync: () => "const valid = 1;", // working tree clean
  };
  const deps = {
    fs: fakeFs,
    getStagedContent: (root, file) => "const broken = ;", // staged broken
    spawnSync: () => ({ status: 0, stdout: "const broken = ;" }),
  };

  const errors = checkStagedSyntax(stagedFiles, "/fake/repo", deps);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].file, "app.js");
  assert.equal(errors[0].type, "js-syntax");
});

test("checkStagedSyntax permits valid staged JS even when working tree is broken", () => {
  const stagedFiles = ["app.js"];
  const fakeFs = {
    existsSync: () => true,
    readFileSync: () => "const broken = ;", // working tree broken
  };
  const deps = {
    fs: fakeFs,
    getStagedContent: (root, file) => "const valid = 1;", // staged clean
    spawnSync: () => ({ status: 0, stdout: "const valid = 1;" }),
  };

  const errors = checkStagedSyntax(stagedFiles, "/fake/repo", deps);
  assert.deepEqual(errors, []);
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

test("findAffectedTests returns full suite pattern when scripts/check.js is staged [REQ-git-precommit-hook-002]", () => {
  const cases = [
    ["scripts/check.js"],
    ["scripts\\check.js"],
  ];
  for (const staged of cases) {
    const tests = findAffectedTests(staged, "c:/repo", { fs: { existsSync: () => true } });
    assert.deepEqual(tests, ["scripts/**/*.test.js"]);
  }
});

test("findAffectedTests returns full suite pattern when core scripts/lib module is staged [REQ-git-precommit-hook-002]", () => {
  const cases = [
    ["scripts/lib/staged-validator.js"],
    ["scripts\\lib\\tdd-mode.js"],
    ["scripts/lib/some-shared-util.js"],
  ];
  for (const staged of cases) {
    const tests = findAffectedTests(staged, "c:/repo", { fs: { existsSync: () => true } });
    assert.deepEqual(tests, ["scripts/**/*.test.js"]);
  }
});

test("findAffectedTests does NOT trigger full suite for contract-checkers [REQ-git-precommit-hook-002]", () => {
  const staged = ["scripts/lib/contract-checkers/spec-checker.js"];
  const tests = findAffectedTests(staged, "c:/repo", { fs: { existsSync: () => false } });
  assert.notDeepEqual(tests, ["scripts/**/*.test.js"]);
  assert.ok(tests.includes("scripts/contract-lint.test.js"));
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

test("ALL_TARGETS contains all seven supported targets [REQ-git-precommit-hook-001]", () => {
  assert.deepEqual(ALL_TARGETS, [
    "claude",
    "vscode",
    "github-copilot",
    "opencode",
    "codex",
    "cursor",
    "antigravity",
  ]);
});

test("findAffectedTargets returns ALL_TARGETS when shared generators change [REQ-git-precommit-hook-001]", () => {
  const cases = [
    ["scripts/configure/cli.js"],
    ["scripts/configure/install-engine.js"],
    ["scripts/configure/install-target.js"],
    ["scripts/configure/validate-phase.js"],
    ["scripts\\configure\\cli.js"],
  ];
  for (const staged of cases) {
    const targets = findAffectedTargets(staged);
    assert.deepEqual(targets, ALL_TARGETS);
  }
});

test("findAffectedTargets returns ALL_TARGETS when target profiles or transform change [REQ-git-precommit-hook-001]", () => {
  const cases = [
    ["scripts/lib/target-profiles/claude.js"],
    ["scripts\\lib\\target-profiles\\cursor.js"],
    ["scripts/lib/target-transform.js"],
  ];
  for (const staged of cases) {
    const targets = findAffectedTargets(staged);
    assert.deepEqual(targets, ALL_TARGETS);
  }
});

test("findAffectedTargets returns ALL_TARGETS when models.yaml changes [REQ-git-precommit-hook-001]", () => {
  const targets = findAffectedTargets(["models.yaml"]);
  assert.deepEqual(targets, ALL_TARGETS);
});

test("findAffectedTargets returns isolated target for single target validator [REQ-git-precommit-hook-001]", () => {
  const targets = findAffectedTargets(["scripts/configure/validate-codex.js"]);
  assert.deepEqual(targets, ["codex"]);
});

test("runStagedChecks fails fast on syntax errors before running tests", () => {
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
        { getStagedContent: () => "const bad = ;" }
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
  };

  const result = runStagedChecks(
    {
      repoRoot: "/fake",
      stagedFiles: ["scripts/hooks/pre-commit-hook.test.js", "scripts/configure/validate-codex.js"],
      runStep: (name, args) => steps.push({ name, args }),
      generateTarget: (target) => generated.push(target),
    },
    { fs: fakeFs, getStagedContent: () => "const ok = 1;" }
  );

  assert.equal(result.ok, true);
  assert.equal(steps.length, 1);
  assert.match(steps[0].name, /Targeted tests/);
  assert.ok(generated.includes("codex"));
});
