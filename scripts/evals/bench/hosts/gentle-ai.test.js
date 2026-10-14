"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const { AGY_INSTALL_ARGS, INSTALL_ARGS, engramMcpBytes, identifyGentleAi, identifyGentleAiAgy, installGentleAi, installGentleAiAgy, mcpConfig, startEngram } = require("./gentle-ai.js");

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
      fs.writeFileSync(path.join(env.HOME, ".claude.json"), JSON.stringify({ mcpServers: { engram: { type: "stdio", command: path.join(env.HOME, "bin", "engram"), args: ["mcp", "--tools=agent"] } }, numStartups: 1 }));
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
  const otherEngram = identifyGentleAi({ home, spawnSyncImpl }).digest;
  assert.notEqual(otherEngram, edited, "another engram is another install");
  const registry = JSON.parse(fs.readFileSync(path.join(home, ".claude.json"), "utf8"));
  fs.writeFileSync(path.join(home, ".claude.json"), JSON.stringify({ ...registry, numStartups: 9 }));
  assert.equal(identifyGentleAi({ home, spawnSyncImpl }).digest, otherEngram, "Claude Code's own counters are not the install");
  registry.mcpServers.context7 = { type: "stdio", command: "npx" };
  fs.writeFileSync(path.join(home, ".claude.json"), JSON.stringify(registry));
  assert.notEqual(identifyGentleAi({ home, spawnSyncImpl }).digest, otherEngram, "another MCP server is another install");
});

test("mcpConfig hands the agent exactly the MCP servers gentle-ai registered", () => {
  const home = tempDir();
  assert.throws(() => mcpConfig(home), /no MCP server/);
  fs.writeFileSync(path.join(home, ".claude.json"), JSON.stringify({ mcpServers: {}, oauthAccount: { emailAddress: "x" } }));
  assert.throws(() => mcpConfig(home), /no MCP server/);
  const engram = { type: "stdio", command: "/h/bin/engram", args: ["mcp", "--tools=agent"], env: {} };
  fs.writeFileSync(path.join(home, ".claude.json"), JSON.stringify({ mcpServers: { engram }, oauthAccount: { emailAddress: "x" } }));
  assert.deepEqual(JSON.parse(mcpConfig(home)), { mcpServers: { engram } }, "nothing else of the file, such as the account");
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

// A stand-in for agy and gentle-ai 4.1.1 on agy: `agy models` writes the
// migrated marker; the install fails its verification without
// antigravity-cli/mcp_config.json, and otherwise writes GEMINI.md, its skills
// and its Engram plugin where agy 1.3.3 does not read them.
function fakeAgySpawnSync(calls) {
  return (executable, args, { env }) => {
    const name = path.basename(executable);
    calls.push({ name, args, env });
    const gemini = path.join(env.HOME, ".gemini");
    const variant = path.join(gemini, "antigravity-cli");
    if (name === "agy" && args[0] === "models") {
      fs.mkdirSync(path.join(gemini, "config"), { recursive: true });
      fs.writeFileSync(path.join(gemini, "config", ".migrated"), "");
    }
    if (name === "gentle-ai" && args[0] === "install") {
      if (!fs.existsSync(path.join(variant, "mcp_config.json"))) return { status: 1, stderr: "post-apply verification failed" };
      fs.writeFileSync(path.join(gemini, "GEMINI.md"), "orchestrator");
      fs.mkdirSync(path.join(variant, "skills", "go-testing"), { recursive: true });
      fs.writeFileSync(path.join(variant, "skills", "go-testing", "SKILL.md"), "skill");
      fs.mkdirSync(path.join(variant, "plugins", "gentle-ai-engram"), { recursive: true });
      fs.writeFileSync(path.join(variant, "plugins", "gentle-ai-engram", "plugin.json"), "{}");
    }
    if (name === "agy" && args[0] === "plugin") {
      fs.mkdirSync(path.join(gemini, "config", "plugins", "gentle-ai-engram"), { recursive: true });
      fs.writeFileSync(path.join(gemini, "config", "plugins", "gentle-ai-engram", "plugin.json"), fs.readFileSync(path.join(args[2], "plugin.json")));
    }
    if (args[0] === "version") return { status: 0, stdout: name === "engram" ? "engram 3.4.0\n" : "gentle-ai 4.1.1\n" };
    return { status: 0, stdout: "" };
  };
}

test("the agy install keeps the selection and places gentle-ai's unchanged output where agy reads it", () => {
  const dir = tempDir();
  const home = path.join(dir, "home");
  const calls = [];
  installGentleAiAgy({ ...binaries(dir), agy: "/usr/bin/agy", home, baseEnv: { PATH: "/usr/bin", HOME: "/home/user" }, spawnSyncImpl: fakeAgySpawnSync(calls) });

  assert.deepEqual(AGY_INSTALL_ARGS, ["install", "--agent", "antigravity", "--component", "persona,engram,skills", "--preset", "ecosystem-only", "--persona", "neutral"]);
  assert.deepEqual(calls.map((call) => [call.name, ...call.args]), [
    ["agy", "models"],
    ["gentle-ai", ...AGY_INSTALL_ARGS],
    ["gentle-ai", "telemetry", "disable"],
    ["agy", "plugin", "install", path.join(home, ".gemini", "antigravity-cli", "plugins", "gentle-ai-engram")],
  ]);
  for (const call of calls) assert.equal(call.env.HOME, home, "never the user's HOME");
  assert.equal(fs.readFileSync(path.join(home, ".gemini", "antigravity-cli", "mcp_config.json"), "utf8"), "{}\n");
  assert.equal(fs.readFileSync(path.join(home, ".gemini", "config", "skills", "go-testing", "SKILL.md"), "utf8"), "skill");
  assert.ok(fs.existsSync(path.join(home, ".gemini", "config", "plugins", "gentle-ai-engram", "plugin.json")));
});

test("engramMcpBytes is the Engram MCP config, and on agy that is the plugin file when it has content", () => {
  const dir = tempDir();
  const home = path.join(dir, "home");
  fs.mkdirSync(home);
  fs.writeFileSync(path.join(home, ".claude.json"), JSON.stringify({ mcpServers: { engram: { command: "engram" } } }));
  const claude = engramMcpBytes({ home, host: "claude" });
  assert.equal(claude, Buffer.byteLength(mcpConfig(home)));
  const root = path.join(home, ".gemini", "config", "mcp_config.json");
  const plugin = path.join(home, ".gemini", "config", "plugins", "gentle-ai-engram", "mcp_config.json");
  fs.mkdirSync(path.dirname(root), { recursive: true });
  fs.writeFileSync(root, "");
  assert.equal(engramMcpBytes({ home, host: "agy" }), 0);
  fs.mkdirSync(path.dirname(plugin), { recursive: true });
  fs.writeFileSync(plugin, "{\"mcpServers\":{\"engram\":{}}}\n");
  assert.equal(engramMcpBytes({ home, host: "agy" }), Buffer.byteLength(fs.readFileSync(plugin)));
});

test("the agy identity covers both binaries and what agy reads, not its conversations", () => {
  const dir = tempDir();
  const home = path.join(dir, "home");
  const spawnSyncImpl = fakeAgySpawnSync([]);
  assert.throws(() => identifyGentleAiAgy({ home, spawnSyncImpl }), /no gentle-ai install for agy/);
  installGentleAiAgy({ ...binaries(dir), agy: "/usr/bin/agy", home, spawnSyncImpl });

  const first = identifyGentleAiAgy({ home, spawnSyncImpl });
  assert.equal(first.version, "4.1.1 (engram 3.4.0)");
  fs.mkdirSync(path.join(home, ".gemini", "antigravity-cli", "conversations"), { recursive: true });
  fs.writeFileSync(path.join(home, ".gemini", "antigravity-cli", "conversations", "c.pb"), "x");
  assert.equal(identifyGentleAiAgy({ home, spawnSyncImpl }).digest, first.digest, "conversations are not the install");
  fs.writeFileSync(path.join(home, ".gemini", "GEMINI.md"), "edited");
  assert.notEqual(identifyGentleAiAgy({ home, spawnSyncImpl }).digest, first.digest, "an edited orchestrator is another install");
});
