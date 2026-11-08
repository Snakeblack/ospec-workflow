"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { main, generateTarget, runStep, claudeCliAvailable, findPython } = require("./check.js");

test("runStep throws a clear error when spawnSync cannot start", () => {
  const stdout = [];
  const stderr = [];

  assert.throws(
    () => runStep("Native Node tests", ["--test"], {
      spawnSync: () => ({ error: new Error("boom") }),
      stdout: { write: (text) => stdout.push(text) },
      stderr: { write: (text) => stderr.push(text) },
    }),
    /Native Node tests failed to start: boom/
  );

  assert.match(stderr.join(""), /failed to start: boom/);
});

test("runStep runs another program in another directory when asked", () => {
  const calls = [];
  runStep("Python tests", ["-m", "unittest"], {
    spawnSync: (file, args, options) => {
      calls.push({ file, args, cwd: options.cwd });
      return { status: 0 };
    },
    stdout: { write: () => {} },
    command: "python3",
    cwd: "/tmp/skill",
  });
  assert.deepEqual(calls, [{ file: "python3", args: ["-m", "unittest"], cwd: "/tmp/skill" }]);
});

test("runStep throws a clear error when the child exits non-zero", () => {
  const stdout = [];
  const stderr = [];

  assert.throws(
    () => runStep("Native Node tests", ["--test"], {
      spawnSync: () => ({ status: 17 }),
      stdout: { write: (text) => stdout.push(text) },
      stderr: { write: (text) => stderr.push(text) },
    }),
    /Native Node tests failed with exit code 17/
  );

  assert.match(stdout.join(""), /==> Native Node tests/);
  assert.match(stderr.join(""), /failed with exit code 17/);
});

test("generateTarget removes its temp directory when generation fails", () => {
  const removed = [];

  assert.throws(
    () => generateTarget("codex", true, {
      fs: {
        mkdtempSync: () => "C:/tmp/ospec-codex-123",
        rmSync: (dir, options) => removed.push({ dir, options }),
      },
      os: { tmpdir: () => "C:/tmp" },
      path,
      runStep: () => {
        throw new Error("synthetic failure");
      },
    }),
    /synthetic failure/
  );

  assert.deepEqual(removed, [{ dir: "C:/tmp/ospec-codex-123", options: { recursive: true, force: true } }]);
});

test("main includes cursor and skips claude validation when the claude CLI is unavailable", () => {
  const generated = [];
  const steps = [];
  const stdout = [];
  let exitCode;

  main({
    runStep: (name, args) => steps.push({ name, args }),
    claudeCliAvailable: () => false,
    findPython: () => null,
    generateTarget: (target, validate) => generated.push({ target, validate }),
    process: {
      stdout: { write: (text) => stdout.push(text) },
      stderr: { write: () => {} },
      exit: (code) => {
        exitCode = code;
      },
    },
  });

  assert.equal(exitCode, undefined);
  assert.deepEqual(steps, [{
    name: "Native Node tests",
    args: ["--test", "scripts/**/*.test.js", "tests/**/*.test.js"],
  }]);
  assert.deepEqual(generated, [
    { target: "claude", validate: false },
    { target: "vscode", validate: true },
    { target: "github-copilot", validate: true },
    { target: "opencode", validate: true },
    { target: "codex", validate: true },
    { target: "cursor", validate: true },
    { target: "antigravity", validate: true },
  ]);
  assert.match(stdout.join(""), /claude CLI not found/);
  assert.match(stdout.join(""), /Python 3 not found — skipping the caveman-compress tests/);
});

// The caveman-compress skill ships Python code with its own unittest suite.
test("main runs the caveman-compress Python tests when Python 3 is available", () => {
  const steps = [];
  let exitCode;
  main({
    runStep: (name, args, options) => steps.push({ name, args, options }),
    claudeCliAvailable: () => true,
    findPython: () => "python3",
    generateTarget: () => {},
    process: {
      stdout: { write: () => {} },
      stderr: { write: () => {} },
      exit: (code) => {
        exitCode = code;
      },
    },
  });
  assert.equal(exitCode, undefined);
  assert.deepEqual(steps.slice(1), [{
    name: "Python tests (caveman-compress)",
    args: ["-B", "-m", "unittest", "scripts.test_caveman"],
    options: { command: "python3", cwd: path.join(__dirname, "..", "skills", "caveman-compress") },
  }]);
});

test("findPython takes the first Python 3 on PATH and skips a failing probe", () => {
  const probed = [];
  const spawn = (bin) => {
    probed.push(bin);
    return bin === "python3" ? { status: 9009 } : { status: 0 };
  };
  assert.equal(findPython({ spawnSync: spawn }), "python");
  assert.deepEqual(probed, ["python3", "python"]);
  assert.equal(findPython({ spawnSync: () => ({ error: new Error("ENOENT") }) }), null);
});

function runSharded(argv) {
  const steps = [];
  const generated = [];
  const stdout = [];
  const stderr = [];
  let exitCode;
  main({
    argv,
    runStep: (name, args) => steps.push({ name, args }),
    claudeCliAvailable: () => false,
    findPython: () => null,
    generateTarget: (target) => generated.push(target),
    process: {
      stdout: { write: (text) => stdout.push(text) },
      stderr: { write: (text) => stderr.push(text) },
      exit: (code) => {
        exitCode = code;
      },
    },
  });
  return { steps, generated, stdout: stdout.join(""), stderr: stderr.join(""), exitCode };
}

test("--shard runs one shard of the Node tests and generates the targets only on the first", () => {
  const first = runSharded(["--shard", "1/2"]);
  assert.equal(first.exitCode, undefined);
  assert.deepEqual(first.steps, [{
    name: "Native Node tests (shard 1/2)",
    args: ["--test", "--test-shard=1/2", "scripts/**/*.test.js", "tests/**/*.test.js"],
  }]);
  assert.equal(first.generated.length, 7);

  const second = runSharded(["--shard=2/2"]);
  assert.equal(second.exitCode, undefined);
  assert.deepEqual(second.steps.map((step) => step.args[1]), ["--test-shard=2/2"]);
  assert.deepEqual(second.generated, []);
  assert.match(second.stdout, /targets are generated by shard 1\/2/);
});

for (const shard of ["0/2", "3/2", "1/0", "a/b", "1", "", "1/2/3"]) {
  test(`--shard rejects ${JSON.stringify(shard)} before running anything`, () => {
    const result = runSharded(["--shard", shard]);
    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.steps, []);
    assert.deepEqual(result.generated, []);
    assert.match(result.stderr, /Check failed: --shard expects <index>\/<total> with 1 <= index <= total/);
  });
}

test("main reports generation failures and exits with status 1", () => {
  const stderr = [];
  let exitCode;

  main({
    runStep: () => {},
    claudeCliAvailable: () => true,
    findPython: () => null,
    generateTarget: (target) => {
      if (target === "codex") {
        throw new Error("codex exploded");
      }
    },
    process: {
      stdout: { write: () => {} },
      stderr: { write: (text) => stderr.push(text) },
      exit: (code) => {
        exitCode = code;
      },
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(""), /Check failed: codex exploded/);
});

function withPlatform(platform, fn) {
  const original = process.platform;
  Object.defineProperty(process, "platform", { value: platform, configurable: true });
  try {
    fn();
  } finally {
    Object.defineProperty(process, "platform", { value: original, configurable: true });
  }
}

test("claudeCliAvailable rejects a WSL interop binary resolved under /mnt", () => {
  withPlatform("linux", () => {
    assert.equal(
      claudeCliAvailable({
        resolveClaudeBin: () => "/mnt/c/Program Files/nodejs/claude",
        spawnCliSync: () => ({ error: undefined, status: 0 }),
      }),
      false,
    );
  });
});

test("claudeCliAvailable returns false when no claude binary can be resolved", () => {
  assert.equal(
    claudeCliAvailable({
      resolveClaudeBin: () => null,
      spawnCliSync: () => ({ error: new Error("ENOENT") }),
    }),
    false,
  );
});

test("claudeCliAvailable keeps the --version probe for a usable native binary", () => {
  assert.equal(
    claudeCliAvailable({
      resolveClaudeBin: () => "/usr/bin/claude",
      spawnCliSync: () => ({ error: undefined, status: 0 }),
    }),
    true,
  );
});

for (const resolved of ["/usr/bin/claude", "C:/Users/test/WinGet/Claude/claude.exe"]) {
  test(`claudeCliAvailable probes the resolved binary ${resolved}`, () => {
    const calls = [];
    assert.equal(claudeCliAvailable({
      resolveClaudeBin: () => resolved,
      spawnCliSync: (bin, args, options) => {
        calls.push({ bin, args, options });
        return bin === resolved ? { status: 0 } : { error: new Error("ENOENT") };
      },
    }), true);
    assert.deepEqual(calls, [{ bin: resolved, args: ["--version"], options: { stdio: "ignore" } }]);
  });
}

test("claudeCliAvailable delegates the probe to spawnCliSync (Windows .cmd shims route through cmd.exe there)", () => {
  const calls = [];
  assert.equal(claudeCliAvailable({
    resolveClaudeBin: () => "C:/Program Files/nodejs/claude.cmd",
    spawnCliSync: (bin, args, options) => {
      calls.push({ bin, args, options });
      return { status: 0 };
    },
  }), true);
  assert.deepEqual(calls, [{ bin: "C:/Program Files/nodejs/claude.cmd", args: ["--version"], options: { stdio: "ignore" } }]);
});

for (const probe of [{ status: 1 }, { status: null, signal: "SIGTERM" }, { error: new Error("ENOENT") }]) {
  test(`claudeCliAvailable rejects an unsuccessful version probe (${probe.status ?? probe.error?.message ?? probe.signal})`, () => {
    assert.equal(claudeCliAvailable({
      resolveClaudeBin: () => "/usr/bin/claude",
      spawnCliSync: () => probe,
    }), false);
  });
}

test("main delegates to runStagedChecks when --staged flag is passed", () => {
  let stagedChecksCalled = false;
  let fullSuiteCalled = false;
  const stdout = [];

  main({
    argv: ["--staged"],
    runStagedChecks: () => {
      stagedChecksCalled = true;
    },
    runStep: () => {
      fullSuiteCalled = true;
    },
    process: {
      stdout: { write: (text) => stdout.push(text) },
      stderr: { write: () => {} },
      exit: () => {},
    },
  });

  assert.equal(stagedChecksCalled, true);
  assert.equal(fullSuiteCalled, false);
  assert.match(stdout.join(""), /All staged checks passed/);
});

test("main passes --index to runStagedChecks as an absolute path, and rejects it without a value", () => {
  const quiet = { stdout: { write: () => {} }, stderr: { write: () => {} }, exit: () => {} };
  let options = null;
  main({
    argv: ["--staged", "--index", ".git/index.lock"],
    claudeCliAvailable: () => false,
    runStagedChecks: (received) => {
      options = received;
    },
    process: quiet,
  });
  assert.equal(options.indexFile, path.resolve(".git/index.lock"));

  main({ argv: ["--staged"], claudeCliAvailable: () => false, runStagedChecks: (received) => { options = received; }, process: quiet });
  assert.equal(options.indexFile, undefined);

  const stderr = [];
  let exitCode;
  main({
    argv: ["--staged", "--index"],
    claudeCliAvailable: () => false,
    runStagedChecks: () => assert.fail("must not run without an index path"),
    process: { ...quiet, stderr: { write: (text) => stderr.push(text) }, exit: (code) => { exitCode = code; } },
  });
  assert.equal(exitCode, 1);
  assert.match(stderr.join(""), /--index expects the path of a git index/);
});

test("main catches runStagedChecks failure and exits 1", () => {
  const stderr = [];
  let exitCode;

  main({
    argv: ["--staged"],
    runStagedChecks: () => {
      throw new Error("Syntax error in staged files");
    },
    process: {
      stdout: { write: () => {} },
      stderr: { write: (text) => stderr.push(text) },
      exit: (code) => {
        exitCode = code;
      },
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stderr.join(""), /Check failed: Syntax error in staged files/);
});
