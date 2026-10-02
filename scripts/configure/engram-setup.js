"use strict";

// Optional, non-authoritative Engram session-memory step for `setup:claude`
// (add-engram-session-memory, ADR-002). ospec composes with the official upstream
// Engram integration: it never ships its own MCP entry or memory hooks. This module
// only (1) detects what is installed, (2) plans the registration action and
// (3) runs it when the user opted in with `--with-engram`.
//
// Engram needs TWO pieces in Claude Code: the upstream `engram@engram` plugin (hooks
// and skill, no MCP server) and a user-scope `engram` MCP server (the mem_* tools),
// which only `engram setup claude-code` registers via `claude mcp add`. Both must be
// present to count as configured; the upstream setup is idempotent and adds whichever
// piece is missing, so it is the single mutating action.
//
// Semantics are deliberately the opposite of install-claude.js `run`/`listOutput`
// (REQ-install-014 aborts on failure): every probe or action here is fail-open.
// A failure becomes a warning and NEVER throws or changes the installer exit code.
// Detection is by capability (binary, doctor, plugin list, mcp list), never by a
// pinned version. All process spawning goes through an injected spawnSync-compatible
// `spawn`, so the module is testable without touching the host.

const { spawnSync } = require("node:child_process");

const MARKETPLACE_NAME = "engram";
const BINARY_CANDIDATES = ["engram", "engram.exe"];
const DEFAULT_TIMEOUT_MS = 10000;
const SETUP_TIMEOUT_MS = 120000;
// `claude plugin list` prints the id as a standalone word, e.g. `  > engram@engram`.
const PLUGIN_RE = /(?:^|\s)engram@engram(?:\s|$)/m;
// `claude mcp list` prints "engram: <command> - <status>" for the user-scope server.
const MCP_RE = /^(?:plugin:engram:)?engram:\s/m;
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
    plugin: probeList(spawn, claudeBin, ["plugin", "list"], PLUGIN_RE, timeoutMs),
    mcp: probeList(spawn, claudeBin, ["mcp", "list"], MCP_RE, timeoutMs),
  };
}

function isConfigured(detection) {
  return detection.plugin === "registered" && detection.mcp === "registered";
}

// Pure. Returns the mutating actions, or [] when there is nothing safe to do: no
// opt-in, no claude CLI, no engram binary, already configured, or any probe we
// could not read. A registered plugin alone is NOT configured: it ships no MCP server.
function planEngramActions(detection, { optIn = false, claudeBin = null } = {}) {
  if (!optIn || !claudeBin || !detection || !detection.binary || !detection.binary.found) return [];
  if (isConfigured(detection)) return [];
  if (detection.plugin === "unknown" || detection.mcp === "unknown") return [];
  return [{ id: "setup-claude-code", bin: detection.binary.bin, argv: ["setup", "claude-code"] }];
}

function guidance(detection, claudeBin) {
  const lines = ["\nEngram session memory (optional, non-authoritative):"];
  if (!detection.binary.found) {
    lines.push(
      "  - engram binary not found. Session memory is optional; ospec-workflow works without it.",
      "    To enable it: install Engram (https://github.com/Gentleman-Programming/engram), then run",
      "    `npm run setup:claude -- --with-engram`. The upstream plugin hooks need bash, jq and curl (Git Bash on Windows).",
    );
  } else if (isConfigured(detection)) {
    lines.push("  - Engram is already configured; nothing to do.");
  } else if (!claudeBin || detection.plugin === "unknown" || detection.mcp === "unknown") {
    lines.push("  - Engram binary found, but plugin/MCP state could not be read; no changes were made.");
  } else {
    lines.push(
      detection.plugin === "registered"
        ? "  - Engram plugin found, but the Engram MCP server is not registered: mem_* tools are unavailable."
        : "  - Engram binary found but the plugin is not registered in Claude Code.",
      "    Run `npm run setup:claude -- --with-engram` (runs `engram setup claude-code`; no changes made now).",
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
      stdout.write(isConfigured(detection) ? "\nEngram is already configured; nothing to do.\n" : guidance(detection, claudeBin));
      return;
    }

    stdout.write("\nConfiguring Engram session memory (--with-engram):\n");
    for (const action of plan) {
      const result = safeSpawn(spawn, action.bin, action.argv, SETUP_TIMEOUT_MS);
      if (result.error || result.status !== 0) {
        const reason = result.error ? result.error.code || result.error.message : `exit ${result.status}`;
        stderr.write(`warning: \`${describe(action)}\` failed (${reason}); continuing. Engram is optional.\n`);
        return;
      }
      stdout.write(`  - ${describe(action)}: ok\n`);
    }

    // Confirm the piece that provides the mem_* tools actually landed.
    if (probeList(spawn, claudeBin, ["mcp", "list"], MCP_RE, timeoutMs) === "registered") {
      stdout.write("  - Engram MCP server registered (mem_* tools). Restart Claude Code to load it.\n");
    } else {
      stderr.write(
        "warning: Engram MCP server is still not visible in `claude mcp list`; mem_* tools will be unavailable.\n" +
          "  Run `engram setup claude-code` manually and check its output. Engram is optional.\n",
      );
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
