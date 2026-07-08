"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const { main, generateTarget, runStep } = require("./check.js");

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

test("main includes codex and skips claude validation when the claude CLI is unavailable", () => {
  const generated = [];
  const stdout = [];
  let exitCode;

  main({
    runStep: () => {},
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
  assert.deepEqual(generated, [
    { target: "claude", validate: false },
    { target: "vscode", validate: false },
    { target: "github-copilot", validate: true },
    { target: "opencode", validate: true },
    { target: "codex", validate: true },
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
