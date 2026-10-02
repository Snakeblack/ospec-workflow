"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { main } = require("./install-claude.js");

function writer() {
  let text = "";
  return {
    write(value) { text += value; },
    get value() { return text; },
  };
}

test("Claude installer forwards an injected generator to the marketplace build", () => {
  const stdout = writer();
  const stderr = writer();
  const runConfigure = () => ({ exitCode: 0 });
  let marketplaceDeps;
  let copied = false;

  const exitCode = main(["--build-only"], {
    cwd: "/repository",
    resolveClaudeBin: () => null,
    runConfigure,
    stdout,
    stderr,
    buildClaudeMarketplace(options, deps) {
      marketplaceDeps = deps;
      assert.equal(options.source, "/repository");
      return { outDir: "/repository/dist/claude-marketplace", pluginDir: "/plugin", exitCode: 0, validation: null };
    },
    copyBinaryToTree() { copied = true; },
  });

  assert.equal(exitCode, 0);
  assert.equal(marketplaceDeps.runConfigure, runConfigure);
  assert.equal(copied, true);
  assert.match(stdout.value, /Built\. Run \/reload-plugins/);
  assert.equal(stderr.value, "");
});

// --- Engram optional step (REQ-install-028/029/030, ADR-002) ----------------

function baseDeps(overrides = {}) {
  return {
    cwd: "/repository",
    stdout: writer(),
    stderr: writer(),
    resolveClaudeBin: () => "claude",
    buildClaudeMarketplace: () => ({ outDir: "/out", pluginDir: "/plugin", exitCode: 0, validation: null }),
    copyBinaryToTree() {},
    run() { return true; },
    listOutput() { return ""; },
    ...overrides,
  };
}

test("Engram step receives argv with --with-engram and the resolved claude bin on the success path", () => {
  let received;
  const exitCode = main(["--with-engram"], baseDeps({ engramStep(options) { received = options; } }));
  assert.equal(exitCode, 0);
  assert.deepEqual(received.argv, ["--with-engram"]);
  assert.equal(received.claudeBin, "claude");
});

test("Engram step also runs (guidance only) when the claude CLI is absent", () => {
  let received;
  const exitCode = main([], baseDeps({ resolveClaudeBin: () => null, engramStep(options) { received = options; } }));
  assert.equal(exitCode, 0);
  assert.equal(received.claudeBin, null);
  assert.deepEqual(received.argv, []);
});

test("--build-only skips the Engram step entirely", () => {
  let called = false;
  const exitCode = main(["--build-only", "--with-engram"], baseDeps({ engramStep() { called = true; } }));
  assert.equal(exitCode, 0);
  assert.equal(called, false);
});

test("a throwing Engram step never alters the exit code", () => {
  const stderr = writer();
  const exitCode = main(["--with-engram"], baseDeps({ stderr, engramStep() { throw new Error("kaboom"); } }));
  assert.equal(exitCode, 0);
  assert.match(stderr.value, /warning/i);
});

test("an ospec install failure still exits 1 and skips the Engram step", () => {
  let called = false;
  const exitCode = main(["--with-engram"], baseDeps({
    run() { throw new Error("install failed"); },
    engramStep() { called = true; },
  }));
  assert.equal(exitCode, 1);
  assert.equal(called, false);
});
