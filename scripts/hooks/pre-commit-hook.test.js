"use strict";

const assert = require("node:assert/strict");
const child_process = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { runPreCommit } = require("./pre-commit-hook.js");

test.afterEach(() => {
  // En Node.js native test runner, los mocks se limpian automáticamente al terminar cada test si se registran a través de t.mock.
});

test("respects DISABLE_OSPEC_PRECOMMIT env bypass", (t) => {
  let exitCode = null;
  t.mock.method(process, "exit", (code) => {
    exitCode = code;
  });

  const oldEnv = process.env.DISABLE_OSPEC_PRECOMMIT;
  process.env.DISABLE_OSPEC_PRECOMMIT = "true";
  try {
    runPreCommit();
    assert.equal(exitCode, 0);
  } finally {
    if (oldEnv === undefined) {
      delete process.env.DISABLE_OSPEC_PRECOMMIT;
    } else {
      process.env.DISABLE_OSPEC_PRECOMMIT = oldEnv;
    }
  }
});

test("blocks commit when check.js fails", (t) => {
  let exitCode = null;
  t.mock.method(process, "exit", (code) => {
    exitCode = code;
  });

  // Mock spawnSync to return exit code 1 for check.js
  t.mock.method(child_process, "spawnSync", (cmd, args) => {
    if (cmd === "node" && args[0] === "scripts/check.js") {
      return { status: 1 };
    }
    return { status: 0, stdout: "" };
  });

  runPreCommit();
  assert.equal(exitCode, 1);
});

test("warns but continues when check.js throws external error", (t) => {
  let exitCode = null;
  t.mock.method(process, "exit", (code) => {
    exitCode = code;
  });

  // Mock spawnSync to throw an error for check.js
  t.mock.method(child_process, "spawnSync", (cmd, args) => {
    if (cmd === "node" && args[0] === "scripts/check.js") {
      return { error: new Error("external command failure") };
    }
    // git diff
    return { status: 0, stdout: "" };
  });

  // Mock config reads to return empty/no strict tdd
  t.mock.method(fs, "existsSync", () => false);

  runPreCommit();
  assert.equal(exitCode, 0);
});

test("allows commit when strict_tdd is inactive, even if no tests staged", (t) => {
  let exitCode = null;
  t.mock.method(process, "exit", (code) => {
    exitCode = code;
  });

  // check.js passes
  t.mock.method(child_process, "spawnSync", (cmd, args) => {
    if (cmd === "node" && args[0] === "scripts/check.js") {
      return { status: 0 };
    }
    if (cmd === "git" && args[0] === "diff") {
      return { status: 0, stdout: "internal/hooks/sessionstart.go\n" };
    }
    return { status: 0, stdout: "" };
  });

  // config.yaml has strict_tdd: false
  t.mock.method(fs, "existsSync", (p) => p.endsWith("config.yaml"));
  t.mock.method(fs, "readFileSync", () => "strict_tdd: false\n");

  runPreCommit();
  assert.equal(exitCode, 0);
});

test("allows commit when strict_tdd is active and no production files are staged", (t) => {
  let exitCode = null;
  t.mock.method(process, "exit", (code) => {
    exitCode = code;
  });

  // check.js passes, git diff shows only doc files
  t.mock.method(child_process, "spawnSync", (cmd, args) => {
    if (cmd === "node" && args[0] === "scripts/check.js") {
      return { status: 0 };
    }
    if (cmd === "git" && args[0] === "diff") {
      return { status: 0, stdout: "README.md\nopenspec/config.yaml\n" };
    }
    return { status: 0, stdout: "" };
  });

  // config.yaml has strict_tdd: true
  t.mock.method(fs, "existsSync", (p) => p.endsWith("config.yaml"));
  t.mock.method(fs, "readFileSync", () => "strict_tdd: true\n");

  runPreCommit();
  assert.equal(exitCode, 0);
});

test("blocks commit when strict_tdd is active and production files have no tests or tasks staged", (t) => {
  let exitCode = null;
  t.mock.method(process, "exit", (code) => {
    exitCode = code;
  });

  // check.js passes, git diff shows prod files but no test/task
  t.mock.method(child_process, "spawnSync", (cmd, args) => {
    if (cmd === "node" && args[0] === "scripts/check.js") {
      return { status: 0 };
    }
    if (cmd === "git" && args[0] === "diff") {
      return { status: 0, stdout: "internal/hooks/sessionstart.go\nscripts/hooks/session-start.js\n" };
    }
    return { status: 0, stdout: "" };
  });

  t.mock.method(fs, "existsSync", (p) => p.endsWith("config.yaml"));
  t.mock.method(fs, "readFileSync", () => "strict_tdd: true\n");

  runPreCommit();
  assert.equal(exitCode, 1);
});

test("allows commit when strict_tdd is active and production files are staged alongside a test file", (t) => {
  let exitCode = null;
  t.mock.method(process, "exit", (code) => {
    exitCode = code;
  });

  // check.js passes, git diff shows prod file AND test file
  t.mock.method(child_process, "spawnSync", (cmd, args) => {
    if (cmd === "node" && args[0] === "scripts/check.js") {
      return { status: 0 };
    }
    if (cmd === "git" && args[0] === "diff") {
      return { status: 0, stdout: "internal/hooks/sessionstart.go\ninternal/hooks/sessionstart_test.go\n" };
    }
    return { status: 0, stdout: "" };
  });

  t.mock.method(fs, "existsSync", (p) => p.endsWith("config.yaml"));
  t.mock.method(fs, "readFileSync", () => "strict_tdd: true\n");

  runPreCommit();
  assert.equal(exitCode, 0);
});

test("allows commit when strict_tdd is active and production files are staged alongside tasks.md", (t) => {
  let exitCode = null;
  t.mock.method(process, "exit", (code) => {
    exitCode = code;
  });

  // check.js passes, git diff shows prod file AND tasks.md
  t.mock.method(child_process, "spawnSync", (cmd, args) => {
    if (cmd === "node" && args[0] === "scripts/check.js") {
      return { status: 0 };
    }
    if (cmd === "git" && args[0] === "diff") {
      return { status: 0, stdout: "internal/hooks/sessionstart.go\nopenspec/changes/git-precommit-hook/tasks.md\n" };
    }
    return { status: 0, stdout: "" };
  });

  t.mock.method(fs, "existsSync", (p) => p.endsWith("config.yaml"));
  t.mock.method(fs, "readFileSync", () => "strict_tdd: true\n");

  runPreCommit();
  assert.equal(exitCode, 0);
});
