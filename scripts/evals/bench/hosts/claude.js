"use strict";

// Claude Code host for the bench: headless `claude -p` turns with the plugin
// built from the current checkout, inside a dedicated configuration directory
// (CLAUDE_CONFIG_DIR) so the user's CLAUDE.md, installed plugins, MCP servers,
// and memory never reach the run. The persona runs on the same binary and
// configuration, with no tools, and answers through structured output.
// The gentle-ai arm (E4.2) runs the agent from gentle-ai's own HOME instead,
// without the plugin and with only its Engram MCP server (hosts/gentle-ai.js); the
// persona still runs in the bench configuration, so it is the same for every
// arm.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const { resolveClaudeBin } = require("../../../configure/cli.js");
const { homeEnv } = require("./gentle-ai.js");
const { listFiles } = require("../scenarios.js");
const { PERSONA_SCHEMA, buildPersonaPrompt, buildPersonaSystemPrompt, normalizePersonaReply } = require("../persona.js");
const { emptyUsage, summarizeTurn } = require("../transcript.js");

const DEFAULT_TURN_TIMEOUT_MS = 60 * 60 * 1000;
const PERSONA_TIMEOUT_MS = 5 * 60 * 1000;
const STDERR_TAIL = 2000;
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

// The ospec arms run with the plugin and no MCP server. Without a plugin
// directory the agent runs gentle-ai from its HOME with exactly the MCP
// servers it registered (`mcpConfig`). `--mcp-config` takes several values, so
// it goes last.
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
// Both arms get the SDD package (E1.6 d2: it installs only on request), so the
// plugin keeps the content sdd-baseline-3 and idd-2 ran with.
function buildPlugin({ repoRoot, outDir, spawnSyncImpl = spawnSync }) {
  const result = spawnSyncImpl(process.execPath, [
    path.join(repoRoot, "scripts", "configure", "claude-marketplace.js"),
    "--source", repoRoot,
    "--out", outDir,
    "--with-sdd",
  ], { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`plugin build failed: ${result.stderr || result.stdout}`);
  const pluginDir = path.join(outDir, "plugins", "ospec-workflow");
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginDir, ".claude-plugin", "plugin.json"), "utf8"));
  return { pluginDir, version: manifest.version, digest: hashTree(pluginDir) };
}

function createClaudeHost({
  executable,
  prefixArgs = [],
  configDir,
  pluginDir,
  model,
  effort = null,
  personaModel,
  personaDir,
  gentleAi = null,
  baseEnv = process.env,
  turnTimeoutMs = DEFAULT_TURN_TIMEOUT_MS,
}) {
  const env = benchEnv(baseEnv, configDir);
  const agentEnv = gentleAi ? gentleAiEnv(baseEnv, gentleAi.home) : env;
  const engrams = new Map();
  const children = new Set();

  // gentle-ai gets an empty Engram per workspace, started on its first turn.
  async function workspaceEnv(cwd) {
    if (!gentleAi) return agentEnv;
    if (!engrams.has(cwd)) engrams.set(cwd, await gentleAi.startEngram({ home: gentleAi.home, workspaceRoot: cwd, baseEnv: inheritedEnv(baseEnv) }));
    return { ...agentEnv, ...engrams.get(cwd).env };
  }

  async function turn({ cwd, prompt, sessionId, transcriptPath }) {
    fs.mkdirSync(path.dirname(transcriptPath), { recursive: true });
    const run = await runProcess({
      executable,
      args: [...prefixArgs, ...turnArgs({ model, effort, pluginDir: gentleAi ? null : pluginDir, mcpConfig: gentleAi ? gentleAi.mcpConfig : null, sessionId })],
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

  /** Ends what the host keeps for a workspace (gentle-ai's Engram). */
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

module.exports = { benchEnv, buildPlugin, createClaudeHost, gentleAiEnv, hashTree, resolveClaudeExecutable, turnArgs };
