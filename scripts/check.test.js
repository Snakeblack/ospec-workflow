"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { main, generateTarget, runStep, claudeCliAvailable, findPython, listTestFiles, SERIAL_TESTS } = require("./check.js");

const [CODEX_SHELL, LAUNCHER] = ["scripts/configure/codex-hook-shell.test.js", "scripts/hooks/ospec-hooks-launch.test.js"];
const TEST_FILES = ["scripts/a.test.js", CODEX_SHELL, "scripts/configure/b.test.js", LAUNCHER, "tests/c.test.js"];
const PARALLEL = ["scripts/a.test.js", "scripts/configure/b.test.js", "tests/c.test.js"];
const SERIAL = [CODEX_SHELL, LAUNCHER];

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
    listTestFiles: () => TEST_FILES,
    serialTests: SERIAL,
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
  assert.deepEqual(steps, [
    { name: "Native Node tests", args: ["--test", ...PARALLEL] },
    { name: "Native Node tests, one file at a time", args: ["--test", "--test-concurrency=1", CODEX_SHELL, LAUNCHER] },
  ]);
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
    listTestFiles: () => TEST_FILES,
    serialTests: SERIAL,
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
  assert.deepEqual(steps.slice(2), [{
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

function runSharded(argv, files = TEST_FILES, serialTests = SERIAL) {
  const steps = [];
  const generated = [];
  const stdout = [];
  const stderr = [];
  let exitCode;
  main({
    argv,
    listTestFiles: () => files,
    serialTests,
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
  assert.deepEqual(first.steps, [
    { name: "Native Node tests (shard 1/2)", args: ["--test", "--test-shard=1/2", ...PARALLEL] },
    { name: "Native Node tests, one file at a time (shard 1/2)", args: ["--test", "--test-concurrency=1", CODEX_SHELL] },
  ]);
  assert.equal(first.generated.length, 7);

  const second = runSharded(["--shard=2/2"]);
  assert.equal(second.exitCode, undefined);
  assert.deepEqual(second.steps, [
    { name: "Native Node tests (shard 2/2)", args: ["--test", "--test-shard=2/2", ...PARALLEL] },
    { name: "Native Node tests, one file at a time (shard 2/2)", args: ["--test", "--test-concurrency=1", LAUNCHER] },
  ]);
  assert.deepEqual(second.generated, []);
  assert.match(second.stdout, /targets are generated by shard 1\/2/);
});

// E1.30: a test bound to a real deadline (the hook launcher's 4 s, a spawn's
// own timeout) missed it under the contention of the parallel suite. Those run
// after it, one file at a time, each on one shard.
test("the deadline-bound tests leave the parallel phase and run after it, one file at a time, each on one shard", () => {
  assert.deepEqual(SERIAL_TESTS.slice(0, 2), [CODEX_SHELL, LAUNCHER]);
  const shards = [1, 2, 3].map((index) => runSharded(["--shard", `${index}/3`]));
  for (const [at, run] of shards.entries()) {
    assert.equal(run.exitCode, undefined);
    assert.deepEqual(run.steps[0].args, ["--test", `--test-shard=${at + 1}/3`, ...PARALLEL]);
  }
  assert.deepEqual(shards.map((run) => run.steps.slice(1).map((step) => step.args)), [
    [["--test", "--test-concurrency=1", CODEX_SHELL]],
    [["--test", "--test-concurrency=1", LAUNCHER]],
    [],
  ]);
});

// A test that holds work to a wall-clock budget belongs to SERIAL_TESTS: in the
// parallel phase of PR #519, REQ-lifecycle-kernel-035 took 2.2 s against its
// 1 s on a Windows runner. A budget measured with Date.now is not caught.
test("every test file that measures wall time runs in the serial phase", () => {
  const root = path.join(__dirname, "..");
  const timed = listTestFiles(root).filter((file) => /process\.hrtime|performance\.now\(/.test(fs.readFileSync(path.join(root, file), "utf8")));
  assert.ok(timed.length > 0, "the scan finds the timed tests");
  assert.deepEqual(timed.filter((file) => !SERIAL_TESTS.includes(file)), [], "add them to SERIAL_TESTS in scripts/check.js");
});

test("a deadline-bound test that no longer exists fails the check before running anything", () => {
  const result = runSharded([], TEST_FILES.filter((file) => file !== LAUNCHER));
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.steps, []);
  assert.deepEqual(result.generated, []);
  assert.match(result.stderr, /Check failed: the deadline-bound test scripts\/hooks\/ospec-hooks-launch\.test\.js does not exist/);
});

// check.js passes the files explicitly to keep SERIAL_TESTS out of the
// parallel phase: they must be the ones `node --test` would find with the
// patterns it ran before, or a test file would silently leave CI.
test("listTestFiles finds the *.test.js files under scripts and tests, without node_modules or dot entries, sorted", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "check-list-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const file of ["scripts/z.test.js", "scripts/a/b.test.js", "scripts/a/b.js", "scripts/a/test.js", "scripts/.runs/x.test.js",
    "scripts/node_modules/m.test.js", "scripts/.hidden.test.js", "tests/integration/i.test.js", "other/o.test.js"]) {
    fs.mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), "");
  }
  assert.deepEqual(listTestFiles(root), ["scripts/a/b.test.js", "scripts/z.test.js", "tests/integration/i.test.js"]);
});

test("listTestFiles lists the repository's tests as the glob of node --test does", { skip: typeof fs.globSync !== "function" && "fs.globSync unavailable" }, () => {
  const root = path.join(__dirname, "..");
  const globbed = fs.globSync(["scripts/**/*.test.js", "tests/**/*.test.js"], { cwd: root }).map((file) => file.split(path.sep).join("/"));
  assert.deepEqual(listTestFiles(root), globbed.sort());
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
