"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  ALL_TARGETS,
  getStagedFiles,
  getStagedBlobSize,
  getStagedContent,
  checkStagedSyntax,
  findAffectedTests,
  findAffectedTargets,
  runStagedChecks,
} = require("./staged-validator.js");

test("getStagedFiles throws descriptive Error when git command fails or exits non-zero [REQ-git-precommit-hook-001]", () => {
  assert.throws(
    () => {
      getStagedFiles("/fake/repo", {
        spawnSync: () => ({ status: 1, stderr: "fatal: bad config" }),
      });
    },
    /git diff --cached falló con código 1/
  );

  assert.throws(
    () => {
      getStagedFiles("/fake/repo", {
        spawnSync: () => ({ status: 0, error: new Error("spawn ENOENT") }),
      });
    },
    /Error de Git al obtener archivos staged: spawn ENOENT/
  );
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

test("getStagedContent throws descriptive Error when git show fails or produces error [REQ-git-precommit-hook-001]", () => {
  assert.throws(
    () => {
      getStagedContent("c:/repo", "missing.js", {
        spawnSync: () => ({ status: 128, stdout: "", stderr: "fatal: path not in index" }),
      });
    },
    /git show :missing\.js falló con código 128/
  );

  assert.throws(
    () => {
      getStagedContent("c:/repo", "error.js", {
        spawnSync: () => ({ status: 1, error: new Error("spawn error") }),
      });
    },
    /Error al invocar git show para :error\.js: spawn error/
  );
});

test("getStagedContent throws descriptive Error when spawnSync throws [REQ-git-precommit-hook-001]", () => {
  assert.throws(
    () => {
      getStagedContent("c:/repo", "crash.js", {
        spawnSync: () => {
          throw new Error("fatal crash");
        },
      });
    },
    /fatal crash/
  );
});

test("getStagedContent throws descriptive Error for empty or invalid path [REQ-git-precommit-hook-001]", () => {
  assert.throws(() => getStagedContent("c:/repo", ""), /Ruta relativa vacía o inválida/);
  assert.throws(() => getStagedContent("c:/repo", null), /Ruta relativa vacía o inválida/);
  assert.throws(() => getStagedContent("c:/repo", "///"), /Ruta relativa normalizada vacía/);
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

test("checkStagedSyntax propagates error when getStagedContent throws [REQ-git-precommit-hook-001]", () => {
  const deps = {
    getStagedContent: () => {
      throw new Error("git show failed");
    },
  };

  assert.throws(
    () => checkStagedSyntax(["sample.js"], "/fake/repo", deps),
    /git show failed/
  );
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

test("findAffectedTargets returns ALL_TARGETS when canonical generator inputs change [REQ-git-precommit-hook-001]", () => {
  const cases = [
    ["agents/sdd-spec.agent.md"],
    ["agents\\sdd-apply.agent.md"],
    ["commands/build.md"],
    ["commands\\test.md"],
    ["rules/code.md"],
    ["rules\\architecture.md"],
    ["skills/branch-pr/SKILL.md"],
    ["skills\\sdd-apply\\SKILL.md"],
    ["hooks/pre-tool-use.json"],
    ["hooks\\session-start.json"],
    ["schemas/kernel/action.json"],
    ["schemas\\kernel\\candidate.json"],
    [".mcp.json"],
    [".claude-plugin/plugin.json"],
    [".claude-plugin\\plugin.json"],
  ];
  for (const staged of cases) {
    const targets = findAffectedTargets(staged);
    assert.deepEqual(targets, ALL_TARGETS, `Expected ALL_TARGETS for ${staged[0]}`);
  }
});

test("findAffectedTargets returns ALL_TARGETS when generator helpers or runtime hooks change [REQ-git-precommit-hook-001]", () => {
  const cases = [
    ["scripts/lib/frontmatter.js"],
    ["scripts\\lib\\frontmatter.js"],
    ["scripts/lib/model-resolver.js"],
    ["scripts\\lib\\model-resolver.js"],
    ["scripts/hooks/pre-commit-hook.js"],
    ["scripts\\hooks\\session-start.js"],
    ["scripts/hooks/lib/secret-scan.js"],
  ];
  for (const staged of cases) {
    const targets = findAffectedTargets(staged);
    assert.deepEqual(targets, ALL_TARGETS, `Expected ALL_TARGETS for ${staged[0]}`);
  }
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

test("getStagedFiles invokes git diff with core.quotepath=false", () => {
  let invokedArgs = [];
  getStagedFiles("/fake/repo", {
    spawnSync: (cmd, args) => {
      invokedArgs = args;
      return { status: 0, stdout: "file1.js\nfile2.js\n" };
    },
  });
  assert.deepEqual(invokedArgs, ["-c", "core.quotepath=false", "diff", "--cached", "--name-only", "--diff-filter=ACMR"]);
});

test("getStagedBlobSize parses size from git cat-file -s", () => {
  const size = getStagedBlobSize("/fake/repo", "large.bin", {
    spawnSync: () => ({ status: 0, stdout: "2048\n" }),
  });
  assert.equal(size, 2048);
});

test("getStagedContent returns null for git submodules (is a commit, not a blob)", () => {
  const content = getStagedContent("/fake/repo", "vendor/submodule", {
    spawnSync: () => ({ status: 128, stderr: "fatal: git show: :vendor/submodule is a commit, not a blob" }),
  });
  assert.equal(content, null);
});

test("getStagedContent throws descriptive Error on maxBuffer length exceeded", () => {
  assert.throws(
    () => {
      getStagedContent("/fake/repo", "large.bundle.js", {
        spawnSync: () => ({
          error: { code: "ERR_CHILD_PROCESS_STDIO_MAXBUFFER", message: "maxBuffer length exceeded" },
        }),
      });
    },
    /excede el límite máximo de búfer de 10 MB/
  );
});

test("checkStagedSyntax does not fail on valid ESM import/export syntax in .js", () => {
  const errors = checkStagedSyntax(
    ["module.js"],
    "/fake/repo",
    {
      getStagedContent: () => "import path from 'node:path';\nexport const foo = 123;",
    }
  );
  assert.deepEqual(errors, []);
});

test("checkStagedSyntax validates valid .mjs ESM via node --check [REQ-git-precommit-hook-001]", () => {
  const errors = checkStagedSyntax(
    ["script.mjs"],
    "/fake/repo",
    {
      getStagedContent: () => "import path from 'node:path';\nexport default 42;",
      spawnSync: (cmd, args) => {
        assert.equal(cmd, process.execPath);
        assert.equal(args[0], "--check");
        assert.ok(args[1].endsWith(".mjs"));
        return { status: 0, stdout: "", stderr: "" };
      },
    }
  );
  assert.deepEqual(errors, []);
});

test("checkStagedSyntax detects broken .mjs ESM via node --check [REQ-git-precommit-hook-001]", () => {
  const errors = checkStagedSyntax(
    ["broken.mjs"],
    "/fake/repo",
    {
      getStagedContent: () => "export default const broken = ;",
      spawnSync: () => ({
        status: 1,
        stdout: "",
        stderr: "file:///tmp/x.mjs:1\nexport default const broken = ;\n^^^^^^\nSyntaxError: Unexpected token 'const'\n",
      }),
    }
  );
  assert.equal(errors.length, 1);
  assert.equal(errors[0].file, "broken.mjs");
  assert.equal(errors[0].type, "mjs-syntax");
  assert.match(errors[0].error, /SyntaxError/);
});

test("findAffectedTargets returns ALL_TARGETS for distributed runtime libs (review-dimensions) [REQ-git-precommit-hook-001]", () => {
  const targets = findAffectedTargets(["scripts/lib/review-dimensions.js"]);
  assert.deepEqual(targets.sort(), [...ALL_TARGETS].sort());
});

test("findAffectedTargets returns ALL_TARGETS for any production scripts/lib module [REQ-git-precommit-hook-001]", () => {
  const targets = findAffectedTargets(["scripts/lib/federation-marker.js"]);
  assert.deepEqual(targets.sort(), [...ALL_TARGETS].sort());
});

test("findAffectedTargets does not invalidate targets for scripts/lib tests or test-support [REQ-git-precommit-hook-001]", () => {
  const staged = [
    "scripts/lib/frontmatter.test.js",
    "scripts/lib/test-support/fixtures/helper.js",
  ];
  assert.deepEqual(findAffectedTargets(staged), []);
});
