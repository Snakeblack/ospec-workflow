"use strict";

// Optional, non-authoritative Engram session-memory step for `setup:claude`
// (add-engram-session-memory, ADR-002). ospec composes with the official upstream
// `engram` plugin: it never ships its own MCP entry or memory hooks. This module
// only (1) detects what is installed, (2) plans the registration actions and
// (3) runs them when the user opted in with `--with-engram`.
//
// Semantics are deliberately the opposite of install-claude.js `run`/`listOutput`
// (REQ-install-014 aborts on failure): every probe or action here is fail-open.
// A failure becomes a warning and NEVER throws or changes the installer exit code.
// Detection is by capability (binary, doctor, plugin list, mcp list), never by a
// pinned version. All process spawning goes through an injected spawnSync-compatible
// `spawn`, so the module is testable without touching the host.

const { spawnSync } = require("node:child_process");

const MARKETPLACE_SOURCE = "Gentleman-Programming/engram";
const MARKETPLACE_NAME = "engram";
const PLUGIN_ID = "engram@engram";
const BINARY_CANDIDATES = ["engram", "engram.exe"];
const DEFAULT_TIMEOUT_MS = 10000;
const PLUGIN_RE = /\bengram@[\w.-]+/;
// Matches a plain or `plugin:engram:`-prefixed `engram` line if one is ever listed.
// Real Claude Code does NOT list plugin-provided servers in `claude mcp list`, so this
// is only a secondary signal; a registered plugin (PLUGIN_RE) is the primary one.
const MCP_RE = /^(?:plugin:engram:)?engram\b/m;
const MARKETPLACE_RE = /\bengram\b/i;
const VERSION_RE = /\d+\.\d+\.\d+(?:[-+][\w.]+)?/;

function defaultSpawn(bin, args, options) {
  return spawnSync(bin, args, { encoding: "utf8", shell: false, ...options });
}

function safeSpawn(spawn, bin, args, timeoutMs) {
  try {
    return spawn(bin, args, { encoding: "utf8", shell: false, timeout: timeoutMs }) || {};
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
    if (status === "warn" || status === "warning") return "warn";
    if (status === "error" || status === "fail" || status === "failed") return "error";
  } catch {
    // Unparseable output is not a failure: the exit status already said ok.
  }
  return "ok";
}

// registered | absent | unknown (CLI missing, errored, timed out or non-zero).
function probeList(spawn, claudeBin, args, re, timeoutMs) {
  if (!claudeBin) return "unknown";
  const result = safeSpawn(spawn, claudeBin, args, timeoutMs);
  if (result.error || result.status !== 0) return "unknown";
  return re.test(text(result)) ? "registered" : "absent";
}

function detectEngram({ spawn = defaultSpawn, claudeBin = null, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const binary = probeBinary(spawn, timeoutMs);
  return {
    binary,
    doctor: probeDoctor(spawn, binary, timeoutMs),
    marketplace: probeList(spawn, claudeBin, ["plugin", "marketplace", "list"], MARKETPLACE_RE, timeoutMs),
    plugin: probeList(spawn, claudeBin, ["plugin", "list"], PLUGIN_RE, timeoutMs),
    mcp: probeList(spawn, claudeBin, ["mcp", "list"], MCP_RE, timeoutMs),
  };
}

// Pure. Returns the ordered mutating actions, or [] when there is nothing safe to
// do: no opt-in, no claude CLI, no engram binary, anything already registered, or
// any probe we could not read. Verified against a real Claude Code install: the
// upstream plugin provides the MCP server itself and `claude mcp list` does not
// show plugin-provided servers, so a registered plugin counts as configured.
// `engram setup claude-code` is an alternative path (it installs that same plugin
// and needs jq/curl), so it is only a conditional fallback: the runner re-probes
// after the plugin install and skips it when the plugin or MCP is now visible.
function planEngramActions(detection, { optIn = false, claudeBin = null } = {}) {
  if (!optIn || !claudeBin || !detection || !detection.binary || !detection.binary.found) return [];
  const { plugin, mcp, marketplace } = detection;
  if (plugin === "registered" || mcp === "registered") return [];
  if (plugin === "unknown" || mcp === "unknown" || marketplace === "unknown") return [];

  const actions = [];
  if (marketplace === "absent") {
    actions.push({ id: "plugin-marketplace-add", bin: claudeBin, argv: ["plugin", "marketplace", "add", MARKETPLACE_SOURCE] });
  }
  actions.push({ id: "plugin-install", bin: claudeBin, argv: ["plugin", "install", PLUGIN_ID] });
  actions.push({ id: "setup-claude-code", bin: detection.binary.bin, argv: ["setup", "claude-code"] });
  return actions;
}

function guidance(detection, claudeBin) {
  const lines = ["\nEngram session memory (optional, non-authoritative):"];
  if (!detection.binary.found) {
    lines.push(
      "  - engram binary not found. Session memory is optional; ospec-workflow works without it.",
      "    To enable it: install Engram (https://github.com/Gentleman-Programming/engram), then run",
      "    `npm run setup:claude -- --with-engram`. The upstream plugin hooks need bash, jq and curl (Git Bash on Windows).",
    );
  } else if (detection.plugin === "registered" || detection.mcp === "registered") {
    lines.push("  - Engram is already configured; nothing to do.");
  } else if (!claudeBin || detection.plugin === "unknown" || detection.mcp === "unknown") {
    lines.push("  - Engram binary found, but plugin/MCP state could not be read; no changes were made.");
  } else {
    lines.push(
      "  - Engram binary found but the plugin is not registered in Claude Code.",
      "    Run `npm run setup:claude -- --with-engram` to install the plugin (no changes made now).",
      "    The upstream plugin hooks need bash, jq and curl (Git Bash on Windows).",
    );
  }
  return `${lines.join("\n")}\n`;
}

function describe(action) {
  return `${action.bin} ${action.argv.join(" ")}`;
}

function runEngramStep({ argv = [], claudeBin = null, spawn = defaultSpawn, stdout = process.stdout, stderr = process.stderr, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  try {
    const optIn = Array.isArray(argv) && argv.includes("--with-engram");
    const detection = detectEngram({ spawn, claudeBin, timeoutMs });

    if (detection.doctor === "warn" || detection.doctor === "error" || detection.doctor === "timeout") {
      stderr.write(`warning: engram doctor reported "${detection.doctor}"; continuing (optional integration).\n`);
    }

    if (!optIn) {
      stdout.write(guidance(detection, claudeBin));
      return;
    }

    const plan = planEngramActions(detection, { optIn, claudeBin });
    if (plan.length === 0) {
      stdout.write(
        detection.plugin === "registered" || detection.mcp === "registered"
          ? "\nEngram is already configured; nothing to do.\n"
          : guidance(detection, claudeBin),
      );
      return;
    }

    stdout.write("\nConfiguring Engram session memory (--with-engram):\n");
    for (const action of plan) {
      if (action.id === "setup-claude-code") {
        // Re-probe after the plugin install: the plugin provides the MCP itself, so
        // the fallback only runs when neither the plugin nor an MCP server is visible.
        const plugin = probeList(spawn, claudeBin, ["plugin", "list"], PLUGIN_RE, timeoutMs);
        const mcp = probeList(spawn, claudeBin, ["mcp", "list"], MCP_RE, timeoutMs);
        if (plugin !== "absent" || mcp !== "absent") {
          stdout.write("  - Engram plugin/MCP already visible after the install; skipping `engram setup claude-code`.\n");
          continue;
        }
      }
      const result = safeSpawn(spawn, action.bin, action.argv, 120000);
      if (result.error || result.status !== 0) {
        const reason = result.error ? result.error.code || result.error.message : `exit ${result.status}`;
        stderr.write(`warning: \`${describe(action)}\` failed (${reason}); continuing. Engram is optional.\n`);
      } else {
        stdout.write(`  - ${describe(action)}: ok\n`);
      }
    }
  } catch (error) {
    try {
      stderr.write(`warning: Engram step skipped (${error && error.message}); continuing.\n`);
    } catch {
      // Never let the optional step affect the installer.
    }
  }
}

module.exports = { detectEngram, planEngramActions, runEngramStep, MARKETPLACE_NAME };
