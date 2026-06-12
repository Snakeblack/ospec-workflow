"use strict";

// End-to-end against the real target CLIs. The unit/golden/real-repo suites use
// the in-repo node validator; these tests instead drive the actual `claude` CLI
// against a freshly generated tree, catching drift between our assumptions and
// the tool's real loader. They self-skip when the CLI is not installed, so CI and
// laptops without the binary stay green while machines that have it get coverage.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");

const { runConfigure } = require("./cli.js");

const ROOT = path.resolve(__dirname, "..", "..");

function findCli(bins, args = ["--version"]) {
  for (const bin of bins) {
    const probe = spawnSync(bin, args, { stdio: "ignore", shell: false });
    if (!probe.error) {
      return bin;
    }
  }
  return null;
}

function tmpOut(t, label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ospec-e2e-${label}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const claudeBin = findCli(["claude", "claude.cmd", "claude.exe"]);

test(
  "E2E: the real claude CLI validates the generated claude plugin tree",
  { skip: claudeBin ? false : "claude CLI not installed" },
  (t) => {
    const out = tmpOut(t, "claude");
    runConfigure({ sourceDir: ROOT, target: "claude", outDir: out, validate: false });

    const result = spawnSync(claudeBin, ["plugin", "validate", "--strict", out], {
      encoding: "utf8",
      shell: false,
    });

    assert.equal(result.status, 0, `claude plugin validate failed:\n${result.stdout}\n${result.stderr}`);
  },
);
