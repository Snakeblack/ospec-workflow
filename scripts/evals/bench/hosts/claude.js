"use strict";

// Claude Code host for the bench: headless `claude -p` turns with the plugin
// built from the current checkout, inside a dedicated configuration directory
// (CLAUDE_CONFIG_DIR) so the user's CLAUDE.md, installed plugins, MCP servers,
// and memory never reach the run. The persona runs on the same binary and
// configuration, with no tools, and answers through structured output.
// The gentle-ai arm (E4.2) runs the agent from gentle-ai's own HOME instead,
// without the plugin and with only its Engram MCP server (hosts/gentle-ai.js); the
// persona still runs in the bench configuration, so it is the same for every
// arm. The ospec arms run from a copy of that configuration with Engram set up
// in it (hosts/engram.js, OSP-025) and only its MCP server. That copy and the
// original share one OAuth login, so the newer login is copied over the other
// before every call (shareLogin).

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const { resolveClaudeBin } = require("../../../configure/cli.js");
const { writeRouterBlock } = require("../../../configure/instruction-block.js");
const { homeEnv } = require("./gentle-ai.js");
const { listFiles } = require("../scenarios.js");
const { PERSONA_SCHEMA, buildPersonaPrompt, buildPersonaSystemPrompt, normalizePersonaReply } = require("../persona.js");
const { emptyUsage, summarizeTurn } = require("../transcript.js");

const DEFAULT_TURN_TIMEOUT_MS = 60 * 60 * 1000;
const PERSONA_TIMEOUT_MS = 5 * 60 * 1000;
const STDERR_TAIL = 2000;
const CREDENTIALS_FILE = ".credentials.json";
// Variables of the calling session that would leak into the bench: nested
// Claude Code markers, this repository's hook switches, and an API key that
// would bill the run outside the bench configuration's login.
const STRIPPED_ENV = [/^CLAUDECODE$/, /^CLAUDE_CODE_/, /^DISABLE_/, /^ANTHROPIC_API_KEY$/, /^CLAUDE_CONFIG_DIR$/];
const PERSONA_FALLBACK = Object.freeze({
  kind: "stopped",
  answer: "Continúa, por favor.",
  facts_disclosed: [],
  deviates_from_recommendation: false,
  unknown_facts: [],
});

function resolveClaudeExecutable(bin = resolveClaudeBin()) {
  if (!bin) throw new Error("claude CLI not found on PATH");
  if (!/\.(cmd|bat)$/i.test(bin)) return bin;
  const native = path.join(path.dirname(bin), "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
  if (!fs.existsSync(native)) throw new Error(`could not find the native binary behind ${bin}`);
  return native;
}

const inheritedEnv = (baseEnv) => Object.fromEntries(Object.entries(baseEnv).filter(([key]) => !STRIPPED_ENV.some((pattern) => pattern.test(key))));

function benchEnv(baseEnv, configDir) {
  return { ...inheritedEnv(baseEnv), CLAUDE_CONFIG_DIR: configDir, CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" };
}

function gentleAiEnv(baseEnv, home) {
  return { ...homeEnv(inheritedEnv(baseEnv), home), CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" };
}

// The ospec arms run with the plugin and the MCP servers `engram setup`
// registered; without a plugin directory the agent runs gentle-ai from its
// HOME with exactly the MCP servers it registered. Both pass `mcpConfig`.
// `--mcp-config` takes several values, so it goes last.
function turnArgs({ model, effort, pluginDir, mcpConfig = null, sessionId }) {
  return [
    "-p",
    "--output-format", "stream-json",
    "--verbose",
    "--model", model,
    ...(effort ? ["--effort", effort] : []),
    "--permission-mode", "bypassPermissions",
    "--strict-mcp-config",
    ...(pluginDir ? ["--plugin-dir", pluginDir] : []),
    ...(sessionId ? ["--resume", sessionId] : []),
    ...(mcpConfig ? ["--mcp-config", mcpConfig] : []),
  ];
}

function personaArgs({ model, system }) {
  return [
    "-p",
    "--model", model,
    "--tools", "",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--output-format", "json",
    "--json-schema", JSON.stringify(PERSONA_SCHEMA),
    "--system-prompt", system,
  ];
}

function runProcess({ executable, args, cwd, env, input, stdoutPath, timeoutMs, children = null }) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(executable, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    if (children) children.add(child);
    const chunks = [];
    let stderr = "";
    let timedOut = false;
    const out = stdoutPath ? fs.createWriteStream(stdoutPath) : null;
    child.stdout.on("data", (chunk) => {
      if (out) out.write(chunk);
      else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-STDERR_TAIL); });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    const finish = (code, error) => {
      clearTimeout(timer);
      if (children) children.delete(child);
      const done = () => resolve({
        code,
        error,
        timedOut,
        stderr,
        stdout: out ? null : Buffer.concat(chunks).toString("utf8"),
        wall_ms: Date.now() - started,
      });
      if (out) out.end(done);
      else done();
    };
    child.on("error", (error) => finish(null, error));
    child.on("close", (code) => finish(code, null));
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

function hashTree(dir) {
  const hash = crypto.createHash("sha256");
  for (const file of listFiles(dir)) {
    hash.update(`${file}\0`);
    hash.update(crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, file))).digest("hex"));
    hash.update("\n");
  }
  return hash.digest("hex");
}

/** Builds the Claude plugin from `repoRoot` into `outDir` and identifies it. */
// The sdd arm keeps `--with-sdd`. The idd arm omits it, matching the agy
// install (E4.9).
function buildPlugin({ repoRoot, outDir, withSdd = true, spawnSyncImpl = spawnSync }) {
  const result = spawnSyncImpl(process.execPath, [
    path.join(repoRoot, "scripts", "configure", "claude-marketplace.js"),
    "--source", repoRoot,
    "--out", outDir,
    ...(withSdd ? ["--with-sdd"] : []),
  ], { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`plugin build failed: ${result.stderr || result.stdout}`);
  const pluginDir = path.join(outDir, "plugins", "ospec-workflow");
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, ".claude-plugin", "plugin.json"), "utf8"));
  return { pluginDir, version: manifest.version, digest: hashTree(pluginDir) };
}

// Refreshing an expired access token rotates the refresh token, so of two
// directories holding the same login, the one that refreshes first leaves the
// other's dead (the persona of idd-7 never answered). The login with the later
// `expiresAt` is copied over the other. Without a credentials file in either
// directory (macOS keeps the login in the keychain) there is nothing to share.
function shareLogin(dirs, fsImpl = fs) {
  const logins = [];
  for (const dir of dirs) {
    const file = path.join(dir, CREDENTIALS_FILE);
    let text;
    try {
      text = fsImpl.readFileSync(file, "utf8");
    } catch {
      return;
    }
    let expiresAt;
    try {
      expiresAt = JSON.parse(text).claudeAiOauth.expiresAt;
    } catch {
      expiresAt = null;
    }
    logins.push({ file, text, expiresAt: typeof expiresAt === "number" ? expiresAt : -Infinity });
  }
  const newest = logins.reduce((best, login) => (login.expiresAt > best.expiresAt ? login : best));
  for (const login of logins) {
    if (login.text === newest.text) continue;
    fsImpl.writeFileSync(login.file, newest.text, { mode: 0o600 });
    fsImpl.chmodSync(login.file, 0o600);
  }
}

/**
 * Copies the logged-in bench configuration for the agent and, with
 * `routerSource` (the idd arm), writes the plugin's router block into that
 * copy. The persona keeps the original directory, so neither the router nor
 * what the agent's Engram installs reaches it.
 */
function prepareAgentConfig({ configDir, destDir, routerSource = null, fsImpl = fs }) {
  fsImpl.rmSync(destDir, { recursive: true, force: true });
  fsImpl.cpSync(configDir, destDir, { recursive: true });
  if (routerSource) writeRouterBlock(path.join(destDir, "CLAUDE.md"), fsImpl.readFileSync(routerSource, "utf8"), { fs: fsImpl });
  return destDir;
}

function createClaudeHost({
  executable,
  prefixArgs = [],
  configDir,
  agentConfigDir = null,
  pluginDir,
  model,
  effort = null,
  personaModel,
  personaDir,
  gentleAi = null,
  engram = null,
  baseEnv = process.env,
  turnTimeoutMs = DEFAULT_TURN_TIMEOUT_MS,
}) {
  const env = benchEnv(baseEnv, configDir);
  // `engram` ({ home, startEngram, mcpConfig }): the ospec arms' Engram, whose
  // hooks call the engram in <home>/bin.
  const ospecEnv = benchEnv(baseEnv, agentConfigDir || configDir);
  const agentEnv = gentleAi
    ? gentleAiEnv(baseEnv, gentleAi.home)
    : engram ? { ...ospecEnv, PATH: `${path.join(engram.home, "bin")}${path.delimiter}${ospecEnv.PATH || ""}` } : ospecEnv;
  const memory = gentleAi || engram;
  // gentle-ai's agent logs in from its own HOME; an ospec agent shares the bench login.
  const sharedLogin = agentConfigDir && !gentleAi ? [configDir, agentConfigDir] : null;
  const engrams = new Map();
  const children = new Set();

  // Every arm with Engram gets an empty one per workspace, started on its first turn.
  async function workspaceEnv(cwd) {
    if (!memory) return agentEnv;
    if (!engrams.has(cwd)) engrams.set(cwd, await memory.startEngram({ home: memory.home, workspaceRoot: cwd, baseEnv: inheritedEnv(baseEnv) }));
    return { ...agentEnv, ...engrams.get(cwd).env };
  }

  async function turn({ cwd, prompt, sessionId, transcriptPath }) {
    fs.mkdirSync(path.dirname(transcriptPath), { recursive: true });
    if (sharedLogin) shareLogin(sharedLogin);
    const run = await runProcess({
      executable,
      args: [...prefixArgs, ...turnArgs({ model, effort, pluginDir: gentleAi ? null : pluginDir, mcpConfig: memory ? memory.mcpConfig : null, sessionId })],
      cwd,
      env: await workspaceEnv(cwd),
      input: prompt,
      stdoutPath: transcriptPath,
      timeoutMs: turnTimeoutMs,
      children,
    });
    const summary = summarizeTurn(fs.readFileSync(transcriptPath));
    const failure = run.timedOut ? "timeout" : run.error ? run.error.message : run.code !== 0 ? `exit ${run.code}: ${run.stderr.trim()}` : null;
    return {
      ...summary,
      wall_ms: run.wall_ms,
      ...(failure ? { is_error: true, error: summary.is_error ? `${failure} (${summary.error})` : failure } : {}),
    };
  }

  async function askPersona(scenario, goal, message) {
    if (sharedLogin) shareLogin(sharedLogin);
    const run = await runProcess({
      executable,
      args: [...prefixArgs, ...personaArgs({ model: personaModel, system: buildPersonaSystemPrompt(scenario, { goal }) })],
      cwd: personaDir,
      env,
      input: buildPersonaPrompt(message),
      timeoutMs: PERSONA_TIMEOUT_MS,
      children,
    });
    const summary = summarizeTurn(run.stdout || "");
    let output;
    try {
      output = JSON.parse(run.stdout).structured_output;
    } catch {
      output = null;
    }
    return { summary, reply: normalizePersonaReply(output, scenario) };
  }

  async function persona({ scenario, goal, message }) {
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const { summary, reply } = await askPersona(scenario, goal, message);
        return { reply, usage: summary.usage, cost_usd: summary.cost_usd, error: null };
      } catch (error) {
        lastError = error;
      }
    }
    // A failed persona call reports no usable usage; the fallback only keeps the run going.
    return { reply: { ...PERSONA_FALLBACK }, usage: emptyUsage(), cost_usd: 0, error: String(lastError && lastError.message) };
  }

  function version() {
    const result = spawnSync(executable, [...prefixArgs, "--version"], { env: agentEnv, encoding: "utf8" });
    return (result.stdout || "").trim();
  }

  /** Ends what the host keeps for a workspace (its Engram). */
  function release(cwd) {
    const engram = engrams.get(cwd);
    if (!engram) return;
    engrams.delete(cwd);
    engram.stop();
  }

  /** Ends the turns in flight and what the host keeps for every workspace, when the bench is interrupted. */
  function releaseAll() {
    for (const child of children) child.kill();
    for (const cwd of [...engrams.keys()]) release(cwd);
  }

  return { name: "claude-code", turn, persona, version, release, releaseAll };
}

module.exports = { benchEnv, buildPlugin, createClaudeHost, gentleAiEnv, hashTree, prepareAgentConfig, resolveClaudeExecutable, turnArgs };
