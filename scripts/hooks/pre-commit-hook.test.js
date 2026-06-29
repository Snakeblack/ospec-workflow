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

  // Mock spawnSync to return exit code 1 for check.js (pipe-mode shape)
  t.mock.method(child_process, "spawnSync", (cmd, args) => {
    if (cmd === "node" && args[0] === "scripts/check.js") {
      return { status: 1, stdout: "TAP output\n", stderr: "" };
    }
    return { status: 0, stdout: "" };
  });

  // Silence console.error banner output in this test
  t.mock.method(console, "error", () => {});

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

// Task 3.1 — GREEN guard: on success, captured stdout must NOT reach process.stdout
test("on check.js success, does not write captured stdout to process.stdout", (t) => {
  let exitCode = null;
  t.mock.method(process, "exit", (code) => {
    exitCode = code;
  });

  const writeCalls = [];
  t.mock.method(process.stdout, "write", (data) => {
    writeCalls.push(data);
    return true;
  });

  t.mock.method(child_process, "spawnSync", (cmd, args) => {
    if (cmd === "node" && args[0] === "scripts/check.js") {
      return { status: 0, stdout: "lots-of-tap-output\n", stderr: "" };
    }
    return { status: 0, stdout: "" };
  });

  // No config.yaml → strict_tdd stays false → exits 0 cleanly
  t.mock.method(fs, "existsSync", () => false);

  runPreCommit();

  const leaked = writeCalls.some(
    (data) => typeof data === "string" && data.includes("lots-of-tap-output")
  );
  assert.ok(!leaked, "Expected captured stdout NOT to be written to process.stdout on success");
});

// Task 1.1 — RED: on failure, banner with === must appear in console.error
test("on check.js failure, emits === banner citing the reason", (t) => {
  let exitCode = null;
  t.mock.method(process, "exit", (code) => {
    exitCode = code;
  });

  const errorCalls = [];
  t.mock.method(console, "error", (...args) => {
    errorCalls.push(args);
  });

  t.mock.method(child_process, "spawnSync", (cmd, args) => {
    if (cmd === "node" && args[0] === "scripts/check.js") {
      return { status: 1, stdout: "TAP output\n", stderr: "" };
    }
    return { status: 0, stdout: "" };
  });

  runPreCommit();

  const hasBanner = errorCalls.some((args) =>
    args.some((arg) => typeof arg === "string" && arg.includes("==="))
  );
  assert.ok(hasBanner, "Expected at least one console.error call containing '==='");
});

// Task 1.2 — RED: on failure, captured stdout must be written to process.stdout
test("on check.js failure, writes captured stdout before exit", (t) => {
  let exitCode = null;
  t.mock.method(process, "exit", (code) => {
    exitCode = code;
  });

  const writeCalls = [];
  t.mock.method(process.stdout, "write", (data) => {
    writeCalls.push(data);
    return true;
  });

  // Silence console.error to avoid noise in test output
  t.mock.method(console, "error", () => {});

  t.mock.method(child_process, "spawnSync", (cmd, args) => {
    if (cmd === "node" && args[0] === "scripts/check.js") {
      return { status: 1, stdout: "captured-output-line\n", stderr: "" };
    }
    return { status: 0, stdout: "" };
  });

  runPreCommit();

  const hasCapture = writeCalls.some(
    (data) => typeof data === "string" && data.includes("captured-output-line")
  );
  assert.ok(hasCapture, "Expected process.stdout.write to include 'captured-output-line'");
});
