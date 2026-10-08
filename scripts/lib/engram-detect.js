"use strict";

// Read-only Engram detection (engram-per-target, adr-20261003-001): what is
// installed for each host, by capability and never by a pinned version. The
// installers' Engram step (scripts/configure/engram-setup.js) plans its actions
// from it, and `ospec doctor` (REQ-idd-019) reports from it, which is why it
// lives in the runtime. Nothing here writes; spawning, the filesystem, the
// home directory and the platform are injected.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const BINARY_CANDIDATES = ["engram", "engram.exe"];
// `claude mcp list` health-checks every server and `engram doctor` scans the whole
// store; both take well over 10 s on a real machine.
const DEFAULT_TIMEOUT_MS = 60000;
const LIFECYCLE_TIMEOUT_MS = 3000;
const CODEX_LIFECYCLE = ["codex-register", "codex-resolve", "codex-session-end"];
// `claude plugin list` / `codex plugin list` print the id as a standalone word.
const PLUGIN_RE = /(?:^|\s)engram@engram(?:\s|$)/m;
// `claude mcp list` prints "engram: <command> - <status>" for the user-scope server.
const CLAUDE_MCP_RE = /^(?:plugin:engram:)?engram:\s/m;
const CODEX_MCP_RE = /^\s*\[mcp_servers\.engram\]\s*$/m;
const GEMINI_MARKER = "<!-- BEGIN ENGRAM MEMORY PROTOCOL";
const VERSION_RE = /\d+\.\d+\.\d+(?:[-+][\w.]+)?/;
const NOT_APPLICABLE = "n/a";

// `agent` is the upstream `engram setup` slug (null: ospec registers the MCP itself);
// `host` names the CLI whose listings are probed; `protocol` names the protocol piece.
const TARGETS = {
  claude: { agent: "claude-code", label: "Claude Code", script: "setup:claude", host: "claude", protocol: "plugin" },
  codex: { agent: "codex", label: "Codex", script: "setup:codex", host: "codex", protocol: "plugin" },
  antigravity: { agent: "antigravity-cli", label: "Antigravity", script: "setup:antigravity", host: null, protocol: "GEMINI.md memory protocol" },
  opencode: { agent: "opencode", label: "OpenCode", script: "setup:opencode", host: null, protocol: "engram.ts plugin" },
  cursor: { agent: "cursor", label: "Cursor", script: "setup:cursor", host: null, protocol: "memory protocol file" },
  vscode: { agent: "vscode-copilot", label: "VS Code", script: "setup:vscode", host: null, protocol: "Copilot instructions file" },
  "github-copilot": { agent: null, label: "Copilot CLI", script: "setup:copilot", host: null, protocol: null },
};

function targetSpec(target) {
  if (!Object.hasOwn(TARGETS, target)) throw new Error(`unknown Engram target: ${target}`);
  return TARGETS[target];
}

function defaultSpawn(bin, args, options) {
  return spawnSync(bin, args, { encoding: "utf8", shell: false, ...options });
}

function safeSpawn(spawn, bin, args, timeoutMs, options = {}) {
  try {
    return spawn(bin, args, { encoding: "utf8", shell: false, timeout: timeoutMs, ...options }) || {};
  } catch (error) {
    return { error };
  }
}

function text(result) {
  return `${result.stdout || ""}${result.stderr || ""}`;
}

function timedOut(result) {
  return Boolean(result.error && (result.error.code === "ETIMEDOUT" || result.signal === "SIGTERM"));
}

function probeBinary(spawn, timeoutMs) {
  for (const bin of BINARY_CANDIDATES) {
    const result = safeSpawn(spawn, bin, ["version"], timeoutMs);
    if (!result.error && result.status === 0) {
      const match = VERSION_RE.exec(text(result));
      return { found: true, bin, version: match ? match[0] : null };
    }
  }
  return { found: false, bin: null, version: null };
}

function probeDoctor(spawn, binary, timeoutMs) {
  if (!binary.found) return "skipped";
  const result = safeSpawn(spawn, binary.bin, ["doctor", "--json"], timeoutMs);
  if (timedOut(result)) return "timeout";
  if (result.error || result.status !== 0) return "error";
  try {
    const status = String(JSON.parse(result.stdout || "{}").status || "").toLowerCase();
    if (status === "warn" || status === "warning" || status === "blocked") return "warn";
    if (status === "error" || status === "fail" || status === "failed") return "error";
  } catch {
    // Unparseable output is not a failure: the exit status already said ok.
  }
  return "ok";
}

// #264: the Codex plugin can be newer than its binary. Upstream lifecycle hooks
// reject an empty payload before HTTP calls, so this checks command support
// without registering, resolving or ending any session. It does not establish
// that SessionStart ran or that the live server can confirm a runtime identity.
function probeCodexLifecycle(spawn, binary, timeoutMs) {
  if (!binary.found) return { lifecycle: "skipped", lifecycleChecks: [] };
  const checks = CODEX_LIFECYCLE.map((action) => {
    const result = safeSpawn(spawn, binary.bin, ["hook", action], Math.min(timeoutMs, LIFECYCLE_TIMEOUT_MS), { input: "{}" });
    if (result.error) {
      const code = result.error.code;
      return { action, state: "unknown", reason: typeof code === "string" && /^[A-Z0-9_]+$/.test(code) ? code : "spawn error" };
    }
    if (result.status !== 0 && /\busage:\s*engram hook\b/i.test(text(result))) return { action, state: "unsupported", reason: `exit ${result.status}` };
    return result.status === 0 && text(result).trim() === ""
      ? { action, state: "available" }
      : { action, state: "unknown", reason: result.status === 0 ? "unexpected output" : `exit ${result.status}` };
  });
  const lifecycle = checks.some((check) => check.state === "unsupported") ? "unsupported"
    : checks.every((check) => check.state === "available") ? "available" : "unknown";
  return { lifecycle, lifecycleChecks: checks };
}

// registered | absent | unknown (CLI missing, errored, timed out or non-zero).
// `hostBin` is a command, or `{ command, args }` when the CLI needs a launcher
// (a Windows npm `.cmd` shim cannot be spawned without a shell).
function probeList(spawn, hostBin, args, re, timeoutMs) {
  if (!hostBin) return "unknown";
  const [command, prefix] = typeof hostBin === "string" ? [hostBin, []] : [hostBin.command, hostBin.args || []];
  const result = safeSpawn(spawn, command, [...prefix, ...args], timeoutMs);
  if (result.error || result.status !== 0) return "unknown";
  return re.test(text(result)) ? "registered" : "absent";
}

// registered | absent (file missing or check fails) | unknown (unreadable/unparseable).
function probeFile(fsImpl, file, check) {
  let content;
  try {
    content = fsImpl.readFileSync(file, "utf8");
  } catch (error) {
    return error && error.code === "ENOENT" ? "absent" : "unknown";
  }
  try {
    return check(content) ? "registered" : "absent";
  } catch {
    return "unknown";
  }
}

function probeExists(fsImpl, file) {
  try {
    return fsImpl.existsSync(file) ? "registered" : "absent";
  } catch {
    return "unknown";
  }
}

// VS Code and OpenCode accept JSONC. Strip comments and trailing commas outside
// strings; anything still unparseable throws and reads as `unknown`.
function parseJsonc(content) {
  let out = "";
  let inString = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];
    if (inString) {
      out += ch;
      if (ch === "\\") { out += next || ""; i += 1; } else if (ch === "\"") inString = false;
    } else if (ch === "\"") {
      inString = true;
      out += ch;
    } else if (ch === "/" && next === "/") {
      while (i < content.length && content[i] !== "\n") i += 1;
      out += "\n";
    } else if (ch === "/" && next === "*") {
      i += 2;
      while (i < content.length && !(content[i] === "*" && content[i + 1] === "/")) i += 1;
      i += 1;
    } else {
      out += ch;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

function hasKey(section) {
  return (content) => {
    const value = parseJsonc(content)[section];
    return Boolean(value && typeof value === "object" && Object.hasOwn(value, "engram"));
  };
}

function absEnv(env, name) {
  const value = env[name] && String(env[name]).trim();
  return value && path.isAbsolute(value) ? value : null;
}

function codexConfigPath(homedir, env) {
  const codexHome = absEnv(env, "CODEX_HOME");
  return codexHome ? path.join(codexHome, "config.toml") : path.join(homedir(), ".codex", "config.toml");
}

// OpenCode reads ~/.config/opencode on every platform, honoring XDG_CONFIG_HOME.
function openCodeConfigFile(fsImpl, homedir, env) {
  const xdg = env.XDG_CONFIG_HOME && String(env.XDG_CONFIG_HOME).trim();
  const dir = xdg ? path.join(xdg, "opencode") : path.join(homedir(), ".config", "opencode");
  const jsonc = path.join(dir, "opencode.jsonc");
  try {
    if (fsImpl.existsSync(jsonc)) return { dir, file: jsonc };
  } catch {
    // Fall through to opencode.json.
  }
  return { dir, file: path.join(dir, "opencode.json") };
}

function vscodeUserDir(homedir, env, platform) {
  if (platform === "win32") {
    const appData = absEnv(env, "APPDATA");
    return appData ? path.join(appData, "Code", "User") : path.join(homedir(), "AppData", "Roaming", "Code", "User");
  }
  if (platform === "darwin") return path.join(homedir(), "Library", "Application Support", "Code", "User");
  const xdg = absEnv(env, "XDG_CONFIG_HOME");
  return xdg ? path.join(xdg, "Code", "User") : path.join(homedir(), ".config", "Code", "User");
}

function copilotMcpFile(homedir) {
  return path.join(homedir(), ".copilot", "mcp-config.json");
}

// `mcp` provides the mem_* tools; `protocol` delivers the memory protocol to the host.
function probeHost(target, { spawn, hostBin, fs: fsImpl, homedir, env, platform, timeoutMs }) {
  switch (target) {
    case "claude":
      return {
        protocol: probeList(spawn, hostBin, ["plugin", "list"], PLUGIN_RE, timeoutMs),
        mcp: probeList(spawn, hostBin, ["mcp", "list"], CLAUDE_MCP_RE, timeoutMs),
      };
    case "codex":
      return {
        protocol: probeList(spawn, hostBin, ["plugin", "list"], PLUGIN_RE, timeoutMs),
        mcp: probeFile(fsImpl, codexConfigPath(homedir, env), (content) => CODEX_MCP_RE.test(content)),
      };
    case "antigravity": {
      const gemini = path.join(homedir(), ".gemini");
      return {
        protocol: probeFile(fsImpl, path.join(gemini, "GEMINI.md"), (content) => content.includes(GEMINI_MARKER)),
        mcp: probeFile(fsImpl, path.join(gemini, "config", "mcp_config.json"), hasKey("mcpServers")),
      };
    }
    case "opencode": {
      const { dir, file } = openCodeConfigFile(fsImpl, homedir, env);
      return {
        protocol: probeExists(fsImpl, path.join(dir, "plugins", "engram.ts")),
        mcp: probeFile(fsImpl, file, hasKey("mcp")),
      };
    }
    case "cursor": {
      const cursor = path.join(homedir(), ".cursor");
      return {
        protocol: probeExists(fsImpl, path.join(cursor, "engram-memory-protocol.md")),
        mcp: probeFile(fsImpl, path.join(cursor, "mcp.json"), hasKey("mcpServers")),
      };
    }
    case "vscode": {
      const user = vscodeUserDir(homedir, env, platform);
      return {
        protocol: probeExists(fsImpl, path.join(user, "prompts", "engram.instructions.md")),
        mcp: probeFile(fsImpl, path.join(user, "mcp.json"), hasKey("servers")),
      };
    }
    default:
      return { protocol: NOT_APPLICABLE, mcp: probeFile(fsImpl, copilotMcpFile(homedir), hasKey("mcpServers")) };
  }
}

function detectEngram({
  target = "claude",
  spawn = defaultSpawn,
  hostBin = null,
  claudeBin = null,
  fs: fsImpl = fs,
  homedir = os.homedir,
  env = process.env,
  platform = process.platform,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  targetSpec(target);
  const binary = probeBinary(spawn, timeoutMs);
  return {
    target,
    binary,
    doctor: probeDoctor(spawn, binary, timeoutMs),
    ...(target === "codex" ? probeCodexLifecycle(spawn, binary, timeoutMs) : {}),
    ...probeHost(target, { spawn, hostBin: hostBin || claudeBin, fs: fsImpl, homedir, env, platform, timeoutMs }),
  };
}

function isConfigured(detection) {
  return (detection.protocol === "registered" || detection.protocol === NOT_APPLICABLE) && detection.mcp === "registered";
}

function isUnknown(detection) {
  return detection.protocol === "unknown" || detection.mcp === "unknown";
}

module.exports = {
  CODEX_LIFECYCLE,
  DEFAULT_TIMEOUT_MS,
  NOT_APPLICABLE,
  TARGETS,
  copilotMcpFile,
  defaultSpawn,
  detectEngram,
  isConfigured,
  isUnknown,
  parseJsonc,
  probeExists,
  safeSpawn,
  targetSpec,
};
