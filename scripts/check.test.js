"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { main, generateTarget, runStep, claudeCliAvailable } = require("./check.js");

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
});

test("main reports generation failures and exits with status 1", () => {
  const stderr = [];
  let exitCode;

  main({
    runStep: () => {},
    claudeCliAvailable: () => true,
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
