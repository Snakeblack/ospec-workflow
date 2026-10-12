"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { INSTALL_ARGS, identifyGentleAi, installGentleAi, startEngram } = require("./gentle-ai.js");

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bench-gentle-"));
}

function binaries(dir) {
  fs.writeFileSync(path.join(dir, "gentle-ai-build"), "gentle-ai v1");
  fs.writeFileSync(path.join(dir, "engram-build"), "engram v1");
  return { gentleAi: path.join(dir, "gentle-ai-build"), engram: path.join(dir, "engram-build") };
}

// A stand-in for both binaries: records each call and, on install, writes the
// files gentle-ai writes; `version` answers like the real ones.
function fakeSpawnSync(calls) {
  return (executable, args, { env }) => {
    calls.push({ name: path.basename(executable), args, env });
    if (args[0] === "install") {
      const claude = path.join(env.HOME, ".claude");
      fs.mkdirSync(path.join(claude, "skills", "go-testing"), { recursive: true });
      fs.writeFileSync(path.join(claude, "CLAUDE.md"), "orchestrator");
      fs.writeFileSync(path.join(claude, "skills", "go-testing", "SKILL.md"), "skill");
      fs.writeFileSync(path.join(env.HOME, ".claude.json"), "{}");
    }
    if (args[0] === "version") return { status: 0, stdout: path.basename(executable) === "engram" ? "engram 3.4.0\n" : "gentle-ai 4.1.1\n" };
    return { status: 0, stdout: "" };
  };
}

test("the install is the bench's fixed selection, in its own HOME, with its own binaries and no telemetry", () => {
  const dir = tempDir();
  const home = path.join(dir, "home");
  const calls = [];
  installGentleAi({ ...binaries(dir), home, baseEnv: { PATH: "/usr/bin", HOME: "/home/user" }, spawnSyncImpl: fakeSpawnSync(calls) });

  assert.equal(fs.readFileSync(path.join(home, "bin", "gentle-ai"), "utf8"), "gentle-ai v1");
  assert.equal(fs.readFileSync(path.join(home, "bin", "engram"), "utf8"), "engram v1");
  assert.deepEqual(calls.map((call) => call.args), [[...INSTALL_ARGS], ["telemetry", "disable"]]);
  assert.deepEqual(INSTALL_ARGS, ["install", "--agent", "claude-code", "--component", "persona,engram,skills", "--preset", "ecosystem-only", "--persona", "neutral"]);
  const { env } = calls[0];
  assert.equal(env.HOME, home, "never the user's HOME");
  assert.equal(env.GENTLE_AI_HOME, path.join(home, ".gentle-ai"));
  assert.equal(env.GENTLE_AI_ENGRAM_BIN, path.join(home, "bin", "engram"), "no brew or download: the copied engram");
  assert.equal(env.DO_NOT_TRACK, "1");
  assert.equal(env.GENTLE_AI_NO_SELF_UPDATE, "1");
  assert.ok(env.PATH.startsWith(`${path.join(home, "bin")}${path.delimiter}`), "the hooks find the copied binaries first");
});

test("a failed install names the command", () => {
  const dir = tempDir();
  const spawnSyncImpl = () => ({ status: 1, stderr: "unsupported platform" });
  assert.throws(() => installGentleAi({ ...binaries(dir), home: path.join(dir, "home"), spawnSyncImpl }), /gentle-ai install .*unsupported platform/);
});

test("the identity covers both binaries and the assets a run reads, not Claude Code's own state", () => {
  const dir = tempDir();
  const home = path.join(dir, "home");
  const spawnSyncImpl = fakeSpawnSync([]);
  assert.throws(() => identifyGentleAi({ home, spawnSyncImpl }), /no gentle-ai install/);
  installGentleAi({ ...binaries(dir), home, spawnSyncImpl });

  const first = identifyGentleAi({ home, spawnSyncImpl });
  assert.equal(first.version, "4.1.1 (engram 3.4.0)");
  assert.match(first.digest, /^[a-f0-9]{64}$/);

  fs.writeFileSync(path.join(home, ".claude", ".credentials.json"), "{}");
  fs.mkdirSync(path.join(home, ".claude", "projects", "x"), { recursive: true });
  fs.writeFileSync(path.join(home, ".claude", "projects", "x", "session.jsonl"), "{}");
  assert.equal(identifyGentleAi({ home, spawnSyncImpl }).digest, first.digest, "login and sessions are not the install");

  fs.writeFileSync(path.join(home, ".claude", "skills", "go-testing", "SKILL.md"), "edited");
  const edited = identifyGentleAi({ home, spawnSyncImpl }).digest;
  assert.notEqual(edited, first.digest, "an edited skill is another install");
  fs.writeFileSync(path.join(home, "bin", "engram"), "engram v2");
  assert.notEqual(identifyGentleAi({ home, spawnSyncImpl }).digest, edited, "another engram is another install");
});

// A stand-in for `engram serve`: answers /health on ENGRAM_PORT and writes the
// data directory it was given.
function fakeEngramSpawn(dir, seen) {
  const script = path.join(dir, "fake-engram.js");
  fs.writeFileSync(script, `
    const fs = require("node:fs");
    const path = require("node:path");
    fs.writeFileSync(path.join(process.env.ENGRAM_DATA_DIR, "engram.db"), process.env.HOME);
    require("node:http").createServer((req, res) => { res.end('{"status":"ok"}'); }).listen(Number(process.env.ENGRAM_PORT), "127.0.0.1");
  `);
  return (executable, args, options) => {
    seen.push({ executable, args, env: options.env });
    return spawn(process.execPath, [script], options);
  };
}

test("each workspace gets an empty Engram of its own under .git, on its own port, until stopped", async () => {
  const dir = tempDir();
  const home = path.join(dir, "home");
  const seen = [];
  const workspaces = ["a", "b"].map((name) => {
    const root = path.join(dir, name);
    fs.mkdirSync(path.join(root, ".git"), { recursive: true });
    return root;
  });
  const engrams = [];
  for (const workspaceRoot of workspaces) engrams.push(await startEngram({ home, workspaceRoot, baseEnv: { PATH: "/usr/bin" }, spawnImpl: fakeEngramSpawn(dir, seen) }));

  assert.equal(seen[0].executable, path.join(home, "bin", "engram"));
  assert.deepEqual(seen[0].args, ["serve"]);
  assert.equal(engrams[0].env.ENGRAM_DATA_DIR, path.join(workspaces[0], ".git", "bench-engram"));
  assert.notEqual(engrams[0].env.ENGRAM_PORT, engrams[1].env.ENGRAM_PORT, "never the shared default port");
  assert.equal(fs.readFileSync(path.join(engrams[1].env.ENGRAM_DATA_DIR, "engram.db"), "utf8"), home);
  const health = await fetch(`http://127.0.0.1:${engrams[0].env.ENGRAM_PORT}/health`);
  assert.equal(health.ok, true);

  for (const engram of engrams) engram.stop();
  await new Promise((resolve) => { setTimeout(resolve, 200); });
  await assert.rejects(fetch(`http://127.0.0.1:${engrams[0].env.ENGRAM_PORT}/health`));
});
