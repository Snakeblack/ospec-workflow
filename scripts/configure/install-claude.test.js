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
