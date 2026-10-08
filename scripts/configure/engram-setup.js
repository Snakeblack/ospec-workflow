"use strict";

// Automatic, non-authoritative Engram session-memory step shared by every global
// installer (`setup:claude`, `setup:codex`, `setup:antigravity`, `setup:opencode`,
// `setup:cursor`, `setup:vscode`, `setup:copilot`; engram-per-target, adr-20261003-001).
// ospec composes with the official upstream Engram integration: generated output
// never carries an Engram MCP entry or memory hook. This module only (1) detects
// what is installed for the target host, (2) plans the registration action and
// (3) runs it — by default whenever the engram binary is on PATH; `--no-engram`
// turns the step off. Without the binary it only prints install guidance: it never
// downloads Engram.
//
// Each host needs the `mem_*` MCP server plus a piece that delivers the memory
// protocol. For hosts with an upstream `engram setup <agent>` (idempotent, adds
// whichever piece is missing) that command is the single mutating action:
//   claude      -> claude-code      `claude mcp list` + `engram@engram` plugin (hooks)
//   codex       -> codex            [mcp_servers.engram] in config.toml + Codex plugin
//   antigravity -> antigravity-cli  ~/.gemini/config/mcp_config.json + GEMINI.md block
//   opencode    -> opencode         opencode.json(c) `mcp.engram` + plugins/engram.ts
//   cursor      -> cursor           ~/.cursor/mcp.json + engram-memory-protocol.md
//   vscode      -> vscode-copilot   <User>/mcp.json `servers.engram` + prompts file
// Copilot CLI (`github-copilot`, ~/.copilot) has no upstream setup, so the fallback
// action merges a stdio `engram mcp` entry into ~/.copilot/mcp-config.json; the
// SDD addendum shipped by ospec is its only protocol surface.
//
// On Windows the upstream Claude prompt hook starts in a Git Bash "safe mode" that
// skips prompt capture and save reminders to avoid fork hangs under Defender/EDR.
// After Claude is configured, a short fork probe decides: fast forks set
// ENGRAM_CLAUDE_WINDOWS_BASH_SAFE_MODE=0 in ~/.claude/settings.json; slow or failing
// forks keep the safe mode. A value the user already set is never overwritten.
//
// Semantics are deliberately the opposite of the installers' own steps (which abort
// on failure): every probe or action here is fail-open. A failure becomes a warning
// and NEVER throws or changes the installer exit code. Detection is by capability,
// never by a pinned version. Process spawning, the filesystem, the home directory,
// the platform and the clock are injected, so nothing here needs the real host.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
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
} = require("../lib/engram-detect.js");

const MARKETPLACE_NAME = "engram";
const SETUP_TIMEOUT_MS = 120000;
const SAFE_MODE_VAR = "ENGRAM_CLAUDE_WINDOWS_BASH_SAFE_MODE";
// The upstream hook's full path forks dirname, date, jq and curl on every prompt.
// Three rounds must finish well under the time a user would notice on submit.
const FORK_PROBE_SCRIPT = "for i in 1 2 3; do dirname /a/b; date +%s; jq -n 1; curl --version; done >/dev/null";
const FORK_PROBE_TIMEOUT_MS = 5000;
const FORK_PROBE_BUDGET_MS = 1500;

// Pure. Returns the mutating actions, or [] when there is nothing safe to do: step
// disabled, no engram binary, already configured, or any piece we could not read
// (which includes a missing claude/codex CLI). One piece alone is NOT configured.
function planEngramActions(detection, { enabled = true, homedir = os.homedir } = {}) {
  if (!enabled || !detection || !detection.binary || !detection.binary.found) return [];
  // Re-running an incompatible binary's setup can fetch the same newer plugin.
  if (detection.target === "codex" && detection.lifecycle && detection.lifecycle !== "available") return [];
  if (isConfigured(detection) || isUnknown(detection)) return [];
  const target = detection.target || "claude";
  const { agent } = targetSpec(target);
  if (agent) return [{ id: `setup-${agent}`, kind: "spawn", bin: detection.binary.bin, argv: ["setup", agent] }];
  return [{
    id: "register-copilot-mcp",
    kind: "mcp-json",
    file: copilotMcpFile(homedir),
    entry: { type: "stdio", command: detection.binary.bin, args: ["mcp", "--tools=agent"] },
  }];
}

function describe(action) {
  return action.kind === "mcp-json" ? `register engram MCP in ${action.file}` : `${action.bin} ${action.argv.join(" ")}`;
}

function missingPieces(spec, detection) {
  return [
    detection.protocol !== "registered" && detection.protocol !== NOT_APPLICABLE ? spec.protocol : null,
    detection.mcp !== "registered" ? "MCP server" : null,
  ].filter(Boolean);
}

function manualFix(spec) {
  return spec.agent ? `\`engram setup ${spec.agent}\`` : "`npm run setup:copilot` with the engram binary on PATH";
}

function guidance(spec, detection, enabled) {
  const lines = ["\nEngram session memory (optional, non-authoritative):"];
  if (!detection.binary.found) {
    lines.push(
      "  - engram binary not found. Session memory is optional; ospec-workflow works without it.",
      `    To enable it: install Engram (https://github.com/Gentleman-Programming/engram), then re-run \`npm run ${spec.script}\`.`,
    );
    if (spec.host === "claude") lines.push("    The upstream plugin hooks need bash, jq and curl (Git Bash on Windows).");
  } else if (spec.agent === "codex" && detection.lifecycle !== "available") {
    const detail = detection.lifecycle === "unsupported" ? "is incompatible with" : "could not verify";
    lines.push(
      `  - Engram ${detection.binary.version || "binary"} ${detail} the Codex lifecycle commands: ${CODEX_LIFECYCLE.join(", ")}.`,
      ...(detection.lifecycleChecks || []).filter((check) => check.state !== "available")
        .map((check) => `    engram hook ${check.action}: ${check.state} (${check.reason}).`),
      "    Plugin/MCP presence does not confirm runtime session registration; setup alone cannot repair lifecycle incompatibility.",
      "    Use a compatible Engram binary, then run `engram setup codex` in the host's active CODEX_HOME (including a managed runtime home).",
      "    Restart or resume Codex and verify the SessionStart hook confirms its runtime identity before agent-attributed writes.",
    );
  } else if (isConfigured(detection) && spec.agent === "codex") {
    lines.push(
      "  - Engram plugin and MCP are present for Codex; session registration is not verified by this static check.",
      "    Lifecycle commands are available. Verify SessionStart on startup/resume confirms a runtime identity before agent-attributed writes.",
    );
  } else if (isConfigured(detection)) {
    lines.push(`  - Engram is already configured for ${spec.label}; nothing to do.`);
  } else if (isUnknown(detection)) {
    lines.push(`  - Engram binary found, but the ${spec.label} memory state could not be read; no changes were made.`);
    if (spec.host) lines.push(`    Make sure the \`${spec.host}\` CLI is on PATH and re-run \`npm run ${spec.script}\`.`);
  } else if (!enabled) {
    lines.push(
      `  - Engram is not configured for ${spec.label} (missing: ${missingPieces(spec, detection).join(", ")}); skipped by --no-engram.`,
      `    Run ${manualFix(spec)} or re-run \`npm run ${spec.script}\` without --no-engram.`,
    );
  }
  if (detection.binary.found && spec.agent === "codex") {
    lines.push("    For `Hook failed`, capture the hook event, command, exit status and stderr; a store-wide doctor warning alone does not identify the failed hook.");
  }
  return `${lines.join("\n")}\n`;
}

function readJsonObject(fsImpl, file) {
  let raw;
  try {
    raw = fsImpl.readFileSync(file, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return { ok: true, value: {} };
    return { ok: false, reason: error && (error.code || error.message) };
  }
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false, reason: "not a JSON object" };
    return { ok: true, value };
  } catch (error) {
    return { ok: false, reason: `invalid JSON (${error.message})` };
  }
}

function writeJsonObject(fsImpl, file, value) {
  fsImpl.mkdirSync(path.dirname(file), { recursive: true });
  fsImpl.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

// Returns null on success or a failure reason. Existing servers are preserved.
function runAction(action, { spawn, fs: fsImpl }) {
  if (action.kind === "mcp-json") {
    const doc = readJsonObject(fsImpl, action.file);
    if (!doc.ok) return doc.reason;
    try {
      const servers = doc.value.mcpServers && typeof doc.value.mcpServers === "object" ? doc.value.mcpServers : {};
      writeJsonObject(fsImpl, action.file, { ...doc.value, mcpServers: { ...servers, engram: action.entry } });
      return null;
    } catch (error) {
      return error.code || error.message;
    }
  }
  const result = safeSpawn(spawn, action.bin, action.argv, SETUP_TIMEOUT_MS);
  if (result.error) return result.error.code || result.error.message;
  return result.status !== 0 ? `exit ${result.status}` : null;
}

// --- Windows safe mode of the upstream Claude prompt hook -------------------

function findGitBash({ spawn, fs: fsImpl, env, timeoutMs }) {
  const candidates = [];
  if (env.CLAUDE_CODE_GIT_BASH_PATH) candidates.push(env.CLAUDE_CODE_GIT_BASH_PATH);
  const execPath = safeSpawn(spawn, "git", ["--exec-path"], timeoutMs);
  if (!execPath.error && execPath.status === 0 && execPath.stdout) {
    // <git>/mingw64/libexec/git-core -> <git>/bin/bash.exe
    candidates.push(path.resolve(String(execPath.stdout).trim(), "..", "..", "..", "bin", "bash.exe"));
  }
  return candidates.find((candidate) => probeExists(fsImpl, candidate) === "registered") || null;
}

function windowsSafeModeStep({ spawn, fs: fsImpl, homedir, env, now, stdout, stderr, timeoutMs }) {
  const settingsFile = path.join(homedir(), ".claude", "settings.json");
  const settings = readJsonObject(fsImpl, settingsFile);
  if (!settings.ok) {
    stderr.write(`warning: cannot read ${settingsFile} (${settings.reason}); Engram's Windows safe mode left as is.\n`);
    return;
  }
  const userValue = settings.value.env && Object.hasOwn(settings.value.env, SAFE_MODE_VAR)
    ? settings.value.env[SAFE_MODE_VAR]
    : env[SAFE_MODE_VAR];
  if (userValue !== undefined) {
    stdout.write(`  - Windows safe mode: ${SAFE_MODE_VAR}=${userValue} already set; left unchanged.\n`);
    return;
  }

  const bash = findGitBash({ spawn, fs: fsImpl, env, timeoutMs });
  if (!bash) {
    stdout.write("  - Windows safe mode kept: Git Bash not found, so prompt capture and save reminders stay off.\n");
    return;
  }
  const started = now();
  const probe = safeSpawn(spawn, bash, ["-c", FORK_PROBE_SCRIPT], FORK_PROBE_TIMEOUT_MS);
  const elapsed = now() - started;
  if (probe.error || probe.status !== 0 || elapsed > FORK_PROBE_BUDGET_MS) {
    const reason = probe.error || probe.status !== 0 ? "fork probe failed (jq/curl missing or blocked)" : `forks are slow (${elapsed} ms)`;
    stdout.write(
      `  - Windows safe mode kept: ${reason}. Prompt capture and save reminders stay off to avoid hangs.\n` +
        `    To force them on, set ${SAFE_MODE_VAR}=0 in the env block of ${settingsFile}.\n`,
    );
    return;
  }

  try {
    writeJsonObject(fsImpl, settingsFile, { ...settings.value, env: { ...(settings.value.env || {}), [SAFE_MODE_VAR]: "0" } });
  } catch (error) {
    stderr.write(`warning: cannot write ${settingsFile} (${error.code || error.message}); Engram's Windows safe mode left as is.\n`);
    return;
  }
  stdout.write(
    `  - Windows safe mode off (fork probe ${elapsed} ms): ${SAFE_MODE_VAR}=0 written to ${settingsFile}.\n` +
      "    Prompt capture and save reminders are on in new Claude Code sessions; remove the line if prompts start to lag.\n",
  );
}

// --- step entry point --------------------------------------------------------

function runEngramStep({
  target = "claude",
  argv = [],
  hostBin = null,
  claudeBin = null,
  spawn = defaultSpawn,
  fs: fsImpl = fs,
  homedir = os.homedir,
  env = process.env,
  platform = process.platform,
  now = Date.now,
  stdout = process.stdout,
  stderr = process.stderr,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  try {
    const spec = targetSpec(target);
    const enabled = !(Array.isArray(argv) && argv.includes("--no-engram"));
    const probe = () => detectEngram({ target, spawn, hostBin: hostBin || claudeBin, fs: fsImpl, homedir, env, platform, timeoutMs });
    const detection = probe();

    if (detection.doctor === "warn" || detection.doctor === "error" || detection.doctor === "timeout") {
      stderr.write(`warning: engram doctor reported "${detection.doctor}"; continuing (optional integration).\n`);
    }

    const plan = planEngramActions(detection, { enabled, homedir });
    let configured = isConfigured(detection);
    if (plan.length === 0) {
      stdout.write(guidance(spec, detection, enabled));
    } else {
      stdout.write(`\nConfiguring Engram session memory for ${spec.label} (disable with --no-engram):\n`);
      for (const action of plan) {
        const failure = runAction(action, { spawn, fs: fsImpl });
        if (failure) {
          stderr.write(`warning: \`${describe(action)}\` failed (${failure}); continuing. Engram is optional.\n`);
          return;
        }
        stdout.write(`  - ${describe(action)}: ok\n`);
      }
      // Confirm every piece actually landed (mem_* tools + memory protocol).
      const after = probe();
      configured = isConfigured(after);
      if (configured && target === "codex") {
        stdout.write(guidance(spec, after, enabled));
      } else if (configured) {
        stdout.write(`  - Engram configured for ${spec.label}. Restart ${spec.label} to load the mem_* tools.\n`);
      } else {
        stderr.write(
          `warning: Engram is still incomplete for ${spec.label} (missing: ${missingPieces(spec, after).join(", ") || "unreadable state"}).\n` +
            `  Run ${manualFix(spec)} manually and check its output. Engram is optional.\n`,
        );
      }
    }

    if (configured && target === "cursor") {
      stdout.write("  - Cursor ignores global rule files: paste ~/.cursor/engram-memory-protocol.md into Settings > Rules > User Rules once.\n");
    }
    if (enabled && configured && target === "claude" && platform === "win32") {
      windowsSafeModeStep({ spawn, fs: fsImpl, homedir, env, now, stdout, stderr, timeoutMs });
    }
  } catch (error) {
    try {
      stderr.write(`warning: Engram step skipped (${error && error.message}); continuing.\n`);
    } catch {
      // Never let the optional step affect the installer.
    }
  }
}

// Wraps an installer `main` so the Engram step runs after a successful global
// install. `--no-engram` (and the legacy `--with-engram`, now the default) are
// consumed here and never reach the installer's own argument parser. The real step
// runs only when the caller passes `deps.engramStep` (the CLI entry and the TUI
// adapter do): upstream `engram setup` resolves the real home on its own, so an
// embedded or sandboxed call must never reach it by default.
function withEngramStep(target, install, { eligible = () => true, hostBin = () => null } = {}) {
  targetSpec(target);
  return function main(argv = process.argv.slice(2), deps = {}) {
    const raw = Array.isArray(argv) ? argv : [];
    const forwarded = raw.filter((arg) => arg !== "--no-engram" && arg !== "--with-engram");
    const exitCode = install(forwarded, deps);
    if (exitCode !== 0 || typeof deps.engramStep !== "function") return exitCode;
    const stderr = deps.stderr || process.stderr;
    try {
      if (!eligible(forwarded, deps)) return exitCode;
      deps.engramStep({ target, argv: raw, hostBin: hostBin(deps), stdout: deps.stdout || process.stdout, stderr });
    } catch (error) {
      stderr.write(`warning: Engram step skipped (${error.message}); continuing.\n`);
    }
    return exitCode;
  };
}

module.exports = {
  detectEngram,
  planEngramActions,
  runEngramStep,
  withEngramStep,
  parseJsonc,
  TARGETS,
  MARKETPLACE_NAME,
  SAFE_MODE_VAR,
};
