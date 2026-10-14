"use strict";

// gentle-ai for the bench (E4.2, E4.5): installs it into a HOME of its own,
// identifies that install, and gives every scenario an empty Engram.
//
// gentle-ai always writes to $HOME/.claude and registers Engram's MCP server
// in $HOME/.claude.json, which Claude Code does not read under
// CLAUDE_CONFIG_DIR, so the agent runs with HOME set to the bench's gentle-ai
// home instead (the persona keeps the bench configuration directory). The
// install is fixed by the user's decisions of 2026-10-12: Claude Code only;
// the persona, engram, and skills components with the ecosystem-only skills;
// the neutral persona; RDD at its default (on); telemetry and self-update off.
// GGA (a global binary) and Context7 (a network MCP server) stay out. Both
// binaries are copied into <home>/bin, so the MCP server, the hooks, and the
// identity use the same files. The agent gets exactly the MCP servers the
// install registered (`mcpConfig`), never the account's claude.ai connectors.

const crypto = require("node:crypto");
const fs = require("node:fs");
const net = require("node:net");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const INSTALL_ARGS = Object.freeze([
  "install",
  "--agent", "claude-code",
  "--component", "persona,engram,skills",
  "--preset", "ecosystem-only",
  "--persona", "neutral",
]);
// The same selection for the Antigravity CLI (E4.5).
const AGY_INSTALL_ARGS = Object.freeze(INSTALL_ARGS.map((arg) => (arg === "claude-code" ? "antigravity" : arg)));
// Variables that keep gentle-ai from phoning home or replacing its binary.
const QUIET_ENV = Object.freeze({ DO_NOT_TRACK: "1", GENTLE_AI_NO_SELF_UPDATE: "1" });
// What the install writes and a run reads. Claude Code's own state (sessions,
// projects, credentials) changes between runs and stays out of the identity.
const ASSET_PATHS = Object.freeze(["CLAUDE.md", "settings.json", "output-styles", "skills", "agents", "plugins/cache"]);
// What the agy install writes and a run reads, relative to the HOME.
const AGY_ASSET_PATHS = Object.freeze([".gemini/GEMINI.md", ".gemini/config/skills", ".gemini/config/plugins", ".gemini/config/mcp_config.json"]);
const ENGRAM_START_TIMEOUT_MS = 10000;

const binDir = (home) => path.join(home, "bin");
const gentleAiBin = (home) => path.join(binDir(home), "gentle-ai");
const engramBin = (home) => path.join(binDir(home), "engram");

function homeEnv(baseEnv, home) {
  return {
    ...baseEnv,
    ...QUIET_ENV,
    HOME: home,
    GENTLE_AI_HOME: path.join(home, ".gentle-ai"),
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_DATA_HOME: path.join(home, ".local", "share"),
    XDG_STATE_HOME: path.join(home, ".local", "state"),
    PATH: `${binDir(home)}${path.delimiter}${baseEnv.PATH || ""}`,
  };
}

function run(spawnSyncImpl, executable, args, env) {
  const result = spawnSyncImpl(executable, args, { env, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${path.basename(executable)} ${args.join(" ")} failed: ${result.stderr || result.stdout || result.error}`);
  return (result.stdout || "").trim();
}

/** Installs gentle-ai for Claude Code into `home` with the bench's fixed selection. */
function installGentleAi({ gentleAi, engram, home, baseEnv = process.env, spawnSyncImpl = spawnSync }) {
  fs.mkdirSync(binDir(home), { recursive: true });
  fs.copyFileSync(gentleAi, gentleAiBin(home));
  fs.copyFileSync(engram, engramBin(home));
  fs.chmodSync(gentleAiBin(home), 0o755);
  fs.chmodSync(engramBin(home), 0o755);
  const env = { ...homeEnv(baseEnv, home), GENTLE_AI_ENGRAM_BIN: engramBin(home) };
  run(spawnSyncImpl, gentleAiBin(home), INSTALL_ARGS, env);
  run(spawnSyncImpl, gentleAiBin(home), ["telemetry", "disable"], env);
}

/**
 * Installs gentle-ai for the Antigravity CLI into `home` with the same
 * selection (user decision, 2026-10-13). gentle-ai 4.1.1 does not reach agy
 * 1.3.3 on its own, so three environment steps place its unchanged output
 * where agy reads it: agy starts once (it writes `.gemini/config/.migrated`),
 * an empty `antigravity-cli/mcp_config.json` exists before the install (its
 * verification requires the file, which its Engram step never writes, and a
 * failed verification rolls back GEMINI.md), `agy plugin install` registers
 * the Engram plugin gentle-ai generates, and its skills are copied to
 * `.gemini/config/skills`.
 */
function installGentleAiAgy({ gentleAi, engram, agy, home, baseEnv = process.env, spawnSyncImpl = spawnSync }) {
  fs.mkdirSync(binDir(home), { recursive: true });
  fs.copyFileSync(gentleAi, gentleAiBin(home));
  fs.copyFileSync(engram, engramBin(home));
  fs.chmodSync(gentleAiBin(home), 0o755);
  fs.chmodSync(engramBin(home), 0o755);
  const env = { ...homeEnv(baseEnv, home), GENTLE_AI_ENGRAM_BIN: engramBin(home) };
  const variant = path.join(home, ".gemini", "antigravity-cli");
  run(spawnSyncImpl, agy, ["models"], env);
  fs.mkdirSync(variant, { recursive: true });
  if (!fs.existsSync(path.join(variant, "mcp_config.json"))) fs.writeFileSync(path.join(variant, "mcp_config.json"), "{}\n");
  run(spawnSyncImpl, gentleAiBin(home), AGY_INSTALL_ARGS, env);
  run(spawnSyncImpl, gentleAiBin(home), ["telemetry", "disable"], env);
  run(spawnSyncImpl, agy, ["plugin", "install", path.join(variant, "plugins", "gentle-ai-engram")], env);
  fs.cpSync(path.join(variant, "skills"), path.join(home, ".gemini", "config", "skills"), { recursive: true });
}

function hashPath(hash, root, relative) {
  const full = path.join(root, relative);
  if (!fs.existsSync(full)) return;
  if (fs.statSync(full).isDirectory()) {
    for (const entry of fs.readdirSync(full).sort()) hashPath(hash, root, path.join(relative, entry));
    return;
  }
  hash.update(`${relative.split(path.sep).join("/")}\0`);
  hash.update(crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex"));
  hash.update("\n");
}

/**
 * The MCP servers gentle-ai registered in $HOME/.claude.json, as the value of
 * `--mcp-config`. Passed with `--strict-mcp-config`, they are the only ones the
 * agent loads: without it Claude Code adds the account's claude.ai connectors.
 */
function mcpConfig(home) {
  let servers;
  try {
    servers = JSON.parse(fs.readFileSync(path.join(home, ".claude.json"), "utf8")).mcpServers;
  } catch {
    servers = null;
  }
  if (!servers || Object.keys(servers).length === 0) throw new Error(`no MCP server registered in ${path.join(home, ".claude.json")}`);
  return JSON.stringify({ mcpServers: servers });
}

/** Byte size of the Engram MCP config the arm loads. Not a token count. */
function engramMcpBytes({ home, host = "claude" }) {
  if (host === "agy") {
    const plugin = path.join(home, ".gemini", "config", "plugins", "gentle-ai-engram", "mcp_config.json");
    const root = path.join(home, ".gemini", "config", "mcp_config.json");
    const file = fs.existsSync(plugin) && fs.statSync(plugin).size > 0 ? plugin : root;
    if (!fs.existsSync(file)) throw new Error(`no MCP config in ${home}`);
    return Buffer.byteLength(fs.readFileSync(file));
  }
  return Buffer.byteLength(mcpConfig(home));
}

/** Version and digest of the install in `home`: both binaries, its MCP servers, and the assets a run reads. */
function identifyGentleAi({ home, baseEnv = process.env, spawnSyncImpl = spawnSync }) {
  if (!fs.existsSync(path.join(home, ".claude", "CLAUDE.md")) || !fs.existsSync(gentleAiBin(home))) {
    throw new Error(`no gentle-ai install in ${home}`);
  }
  const env = homeEnv(baseEnv, home);
  const version = (executable) => run(spawnSyncImpl, executable, ["version"], env).replace(/^\S+\s+/, "");
  const hash = crypto.createHash("sha256");
  hashPath(hash, home, "bin");
  hash.update(`mcp\0${mcpConfig(home)}\n`);
  for (const asset of ASSET_PATHS) hashPath(hash, path.join(home, ".claude"), asset);
  return { version: `${version(gentleAiBin(home))} (engram ${version(engramBin(home))})`, digest: hash.digest("hex") };
}

/** Version and digest of the agy install in `home`: both binaries and the assets agy reads. */
function identifyGentleAiAgy({ home, baseEnv = process.env, spawnSyncImpl = spawnSync }) {
  if (!fs.existsSync(path.join(home, ".gemini", "GEMINI.md")) || !fs.existsSync(gentleAiBin(home))) {
    throw new Error(`no gentle-ai install for agy in ${home}`);
  }
  const env = homeEnv(baseEnv, home);
  const version = (executable) => run(spawnSyncImpl, executable, ["version"], env).replace(/^\S+\s+/, "");
  const hash = crypto.createHash("sha256");
  hashPath(hash, home, "bin");
  for (const asset of AGY_ASSET_PATHS) hashPath(hash, home, asset);
  return { version: `${version(gentleAiBin(home))} (engram ${version(engramBin(home))})`, digest: hash.digest("hex") };
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => { setTimeout(resolve, 100); });
  }
  throw new Error(`engram did not answer on port ${port}`);
}

/**
 * Starts an empty Engram for one workspace: its data under .git/ (never part
 * of the delivery, removed with the workspace) and its own port, so the
 * plugin's hooks find a server they own and never reach the user's Engram.
 * The bench stops it when the scenario ends.
 */
async function startEngram({ home, workspaceRoot, baseEnv = process.env, spawnImpl = spawn }) {
  const dataDir = path.join(workspaceRoot, ".git", "bench-engram");
  fs.mkdirSync(dataDir, { recursive: true });
  const port = await freePort();
  const env = { ...homeEnv(baseEnv, home), ENGRAM_DATA_DIR: dataDir, ENGRAM_PORT: String(port) };
  const child = spawnImpl(engramBin(home), ["serve"], { env, stdio: "ignore", windowsHide: true });
  try {
    await waitForHealth(port, ENGRAM_START_TIMEOUT_MS);
  } catch (error) {
    child.kill();
    throw error;
  }
  return { env: { ENGRAM_DATA_DIR: dataDir, ENGRAM_PORT: String(port) }, stop: () => { child.kill(); } };
}

module.exports = {
  AGY_ASSET_PATHS,
  AGY_INSTALL_ARGS,
  ASSET_PATHS,
  INSTALL_ARGS,
  QUIET_ENV,
  homeEnv,
  engramMcpBytes,
  identifyGentleAi,
  identifyGentleAiAgy,
  installGentleAi,
  installGentleAiAgy,
  mcpConfig,
  startEngram,
};
