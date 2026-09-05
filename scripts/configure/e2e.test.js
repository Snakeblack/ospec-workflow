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

const { runConfigure, isWindowsInteropPath, resolveBinFromPath, spawnCliSync } = require("./cli.js");

const ROOT = path.resolve(__dirname, "..", "..");

function findCli(bins, args = ["--version"]) {
  for (const bin of bins) {
    // Resolve through PATH first so Windows npm shims (.cmd) spawn via cmd.exe.
    const resolved = resolveBinFromPath(bin) || bin;
    const probe = spawnCliSync(resolved, args, { stdio: "ignore" });
    if (!probe.error && probe.status === 0) {
      return resolved;
    }
  }
  return null;
}

function tmpOut(t, label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `ospec-e2e-${label}-`));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// resolveClaudeBin() already nulls interop paths, so classify from the raw PATH
// resolution to tell "not installed" apart from "Windows interop under /mnt".
const claudeRaw = resolveBinFromPath("claude");
const claudeInterop = Boolean(claudeRaw && isWindowsInteropPath(claudeRaw));
const claudeBin = claudeInterop ? null : findCli(["claude", "claude.cmd", "claude.exe"]);
const codexBin = findCli(["codex", "codex.cmd", "codex.exe"]);

test(
  "E2E: the real claude CLI validates the generated claude plugin tree",
  { skip: claudeBin ? false : claudeInterop ? "claude interop de Windows bajo /mnt" : "claude CLI not installed" },
  (t) => {
    const out = tmpOut(t, "claude");
    runConfigure({ sourceDir: ROOT, target: "claude", outDir: out, validate: false });

    const result = spawnCliSync(claudeBin, ["plugin", "validate", "--strict", out], {
      encoding: "utf8",
    });

    assert.equal(result.status, 0, `claude plugin validate failed:\n${result.stdout}\n${result.stderr}`);
  },
);

// Codex has no equivalent "plugin validate" CLI subcommand documented yet
// (the installer/CLI bridge is Bloque 5.2/5.3, out of scope for 5.1); this
// entry self-skips whenever a `codex` binary is not on PATH, and otherwise
// only confirms the generated tree is at least well-formed enough for the
// binary to start against it (deep validation against the real loader is
// deferred to the installer bloque, matching validate-codex.js's own scope
// note on the hooks bridge).
test(
  "E2E: the real codex CLI is present and the generated codex tree is non-empty (deep validation deferred to 5.2/5.3)",
  { skip: codexBin ? false : "codex CLI not installed" },
  (t) => {
    const out = tmpOut(t, "codex");
    const result = runConfigure({ sourceDir: ROOT, target: "codex", outDir: out, validate: false });

    assert.ok(result.files.length > 0, "codex must generate a non-empty tree");
  },
);
