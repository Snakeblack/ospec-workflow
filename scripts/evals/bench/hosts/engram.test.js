"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { claudeEngramDigest, combineDigests, engramBinIn, setupEngram } = require("./engram.js");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bench-engram-"));
}

// A stand-in for `engram setup claude-code`: what it leaves in the
// configuration directory, its MCP server pointing at the binary it ran from.
function fakeClaudeSetup(calls) {
  return (bin, args, options) => {
    calls.push({ bin, args, options });
    if (args[0] === "version") return { status: 0, stdout: "engram 3.4.0\n" };
    const configDir = options.env.CLAUDE_CONFIG_DIR;
    const plugin = path.join(configDir, "plugins", "cache", "engram", "engram", "0.1.14");
    fs.mkdirSync(path.join(plugin, "hooks"), { recursive: true });
    fs.writeFileSync(path.join(plugin, "hooks", "hooks.json"), "{\"hooks\":{}}\n");
    fs.writeFileSync(path.join(configDir, ".claude.json"), JSON.stringify({ mcpServers: { engram: { type: "stdio", command: bin, args: ["mcp", "--tools=agent"] } } }));
    return { status: 0, stdout: "✓ Installed claude-code plugin\n" };
  };
}

test("setupEngram runs `engram setup <agent>` from its own copy of the binary, with an empty stdin", () => {
  const dir = tempDir();
  const engram = path.join(dir, "engram-src");
  fs.writeFileSync(engram, "binary");
  const home = path.join(dir, "home");
  const configDir = path.join(dir, "config");
  fs.mkdirSync(configDir);
  const calls = [];
  const installed = setupEngram({ engram, home, host: "claude", env: { PATH: "/usr/bin", CLAUDE_CONFIG_DIR: configDir }, spawnSyncImpl: fakeClaudeSetup(calls) });
  assert.equal(installed.bin, engramBinIn(home));
  assert.equal(installed.version, "3.4.0");
  assert.equal(fs.readFileSync(engramBinIn(home), "utf8"), "binary");
  assert.deepEqual(calls.map((call) => call.args), [["setup", "claude-code"], ["version"]]);
  assert.equal(calls[0].bin, engramBinIn(home));
  assert.equal(calls[0].options.input, "");
  assert.equal(calls[0].options.env.PATH.split(path.delimiter)[0], path.join(home, "bin"));
  assert.equal(calls[0].options.env.DO_NOT_TRACK, "1");
  assert.deepEqual(setupEngram({ engram, home, host: "agy", env: {}, spawnSyncImpl: (bin, args) => ({ status: 0, stdout: args[0] === "version" ? "engram 3.5.1" : "" }) }).version, "3.5.1");
});

test("setupEngram fails loudly when setup fails or the host has no setup", () => {
  const dir = tempDir();
  const engram = path.join(dir, "engram-src");
  fs.writeFileSync(engram, "binary");
  const failing = () => ({ status: 1, stderr: "no network" });
  assert.throws(() => setupEngram({ engram, home: path.join(dir, "h"), host: "agy", env: {}, spawnSyncImpl: failing }), /engram setup antigravity-cli failed: no network/);
  assert.throws(() => setupEngram({ engram, home: path.join(dir, "h"), host: "codex", env: {} }), /no engram setup for host codex/);
});

test("claudeEngramDigest identifies the installed plugin and MCP servers, not where the binary lives", () => {
  const dir = tempDir();
  const engram = path.join(dir, "engram-src");
  fs.writeFileSync(engram, "binary");
  const install = (name) => {
    const configDir = path.join(dir, name, "config");
    const home = path.join(dir, name, "engram-home");
    fs.mkdirSync(configDir, { recursive: true });
    setupEngram({ engram, home, host: "claude", env: { CLAUDE_CONFIG_DIR: configDir }, spawnSyncImpl: fakeClaudeSetup([]) });
    return { configDir, home };
  };
  const first = install("a");
  const second = install(path.join("elsewhere", "b"));
  const digest = claudeEngramDigest(first);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(claudeEngramDigest(second), digest);
  fs.writeFileSync(path.join(second.configDir, "plugins", "cache", "engram", "engram", "0.1.14", "hooks", "hooks.json"), "{}\n");
  assert.notEqual(claudeEngramDigest(second), digest, "another plugin build is another digest");
  assert.throws(() => claudeEngramDigest({ configDir: path.join(dir, "none"), home: dir }), /installed no plugin/);
  assert.notEqual(combineDigests("a".repeat(64), digest), combineDigests("b".repeat(64), digest));
});
