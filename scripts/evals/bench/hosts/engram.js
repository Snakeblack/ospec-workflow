"use strict";

// Engram for the ospec arms (OSP-025, #340): Engram goes in every arm (user
// decision, 2026-10-13). The ospec arms get the same engram binary the
// host's gentle-ai arm uses, installed the way an ospec user's install does,
// with the upstream `engram setup <agent>` (user decision, 2026-10-21): its
// MCP server and its memory protocol (agy: the GEMINI.md block; Claude Code:
// the engram@engram plugin, its hooks and skill). Each workspace then gets an
// empty Engram of its own (hosts/gentle-ai.js startEngram), as gentle-ai does.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { QUIET_ENV } = require("./gentle-ai.js");
const { listFiles } = require("../scenarios.js");

const SETUP_AGENTS = Object.freeze({ claude: "claude-code", agy: "antigravity-cli" });
const SETUP_TIMEOUT_MS = 5 * 60 * 1000;

const engramBinIn = (home) => path.join(home, "bin", "engram");

/**
 * Copies `engram` into <home>/bin and runs `engram setup <agent>` from that
 * copy with `env` (HOME or CLAUDE_CONFIG_DIR say where it installs), so the
 * MCP server it registers points at <home>/bin/engram. stdin is empty, so
 * setup declines its optional permission allowlist: the bench runs bypass
 * permissions.
 */
function setupEngram({ engram, home, host, env, spawnSyncImpl = spawnSync }) {
  const agent = SETUP_AGENTS[host];
  if (!agent) throw new Error(`no engram setup for host ${host}`);
  const bin = engramBinIn(home);
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  fs.copyFileSync(engram, bin);
  fs.chmodSync(bin, 0o755);
  const setupEnv = { ...env, ...QUIET_ENV, PATH: `${path.dirname(bin)}${path.delimiter}${env.PATH || ""}` };
  const run = (args) => {
    const result = spawnSyncImpl(bin, args, { env: setupEnv, input: "", encoding: "utf8", timeout: SETUP_TIMEOUT_MS });
    if (result.status !== 0) throw new Error(`engram ${args.join(" ")} failed: ${result.stderr || result.stdout || result.error}`);
    return (result.stdout || "").trim();
  };
  run(["setup", agent]);
  return { bin, version: run(["version"]).split("\n")[0].replace(/^\S+\s+/, "") };
}

/**
 * SHA-256 over what `engram setup claude-code` installed in `configDir`: the
 * engram plugin it fetched (its version floats with the marketplace) and the
 * MCP servers it registered, with the absolute `home` of the binary read as
 * `~`, so the digest identifies the content and not the machine.
 */
function claudeEngramDigest({ configDir, home }) {
  const hash = crypto.createHash("sha256");
  const plugin = path.join(configDir, "plugins", "cache", "engram");
  const files = fs.existsSync(plugin) ? listFiles(plugin) : [];
  if (files.length === 0) throw new Error(`engram setup installed no plugin in ${configDir}`);
  for (const file of files) {
    hash.update(`${file}\0`);
    hash.update(crypto.createHash("sha256").update(fs.readFileSync(path.join(plugin, file))).digest("hex"));
    hash.update("\n");
  }
  const servers = JSON.parse(fs.readFileSync(path.join(configDir, ".claude.json"), "utf8")).mcpServers;
  hash.update(`mcp\0${JSON.stringify(servers).split(path.resolve(home)).join("~")}\n`);
  return hash.digest("hex");
}

/** One digest for a plugin and the Engram installed next to it. */
const combineDigests = (plugin, engram) => crypto.createHash("sha256").update(`${plugin}\n${engram}\n`).digest("hex");

module.exports = { SETUP_AGENTS, claudeEngramDigest, combineDigests, engramBinIn, setupEngram };
