#!/usr/bin/env node

"use strict";

// Launcher for the ospec-hooks runtime. Claude Code (and the other targets)
// invoke this once per hook event, with the plugin root expanded by the host:
//
//   node <plugin-root>/scripts/hooks/ospec-hooks-launch.js <subcommand>
//
// It prefers the compiled Go binary (fast, single native process) and falls
// back to the committed Node hook of the same name when no binary ships for the
// host platform. This keeps hooks working on every install channel:
//   - the marketplace `release` branch bundles per-platform binaries in
//     scripts/hooks/ (see .github/workflows/publish-marketplace.yml);
//   - local `copyBinaryToTree` drops a generic ospec-hooks[.exe];
//   - opencode places the binary in release/dist/;
//   - if none is present, the Node fallback (<subcommand>.js) still runs.
//
// The launcher is deliberately a .js file so the configure pipeline ships it
// automatically (gatherRuntimeScripts seeds scripts/hooks/*.js) and so it is
// immune to the shebang / CRLF / exec-bit hazards a shell launcher hits on
// Windows — the very failure mode this fix removes.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const SUBCOMMANDS = new Set([
  "session-start",
  "pre-tool-use",
  "pre-compact",
  "subagent-stop",
  "stop",
]);

// Non-blocking sentinel: never fail a hook (and thus the session) because of a
// launcher-level problem. Every Node hook already returns this on its own error
// path, so emitting it here keeps the contract consistent.
const CONTINUE = '{"continue":true}\n';

function parseLastJson(stdout) {
  const lines = String(stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      return JSON.parse(lines[index]);
    } catch {
      // Hook diagnostics may precede the result envelope.
    }
  }
  return null;
}

// Codex's native hook protocol is narrower than OSpec's internal envelopes.
// Keep this boundary in the launcher so the phase/runtime logic remains shared
// with the other targets and no plugin-specific adapter is needed.
function normalizeCodexHookOutput(subcommand, output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return {};
  }

  if (subcommand === "session-start") {
    const context = typeof output.systemMessage === "string" && output.systemMessage.trim()
      ? output.systemMessage.trim()
      : JSON.stringify(Object.fromEntries(Object.entries(output).filter(([key]) => key !== "status")));
    return context && context !== "{}"
      ? { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } }
      : {};
  }

  if (subcommand === "pre-tool-use") {
    const decision = output.hookSpecificOutput?.permissionDecision;
    const reason = output.hookSpecificOutput?.permissionDecisionReason || output.systemMessage;
    if (decision === "deny") {
      return {
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: reason || "Blocked by OSpec policy.",
        },
      };
    }
    if (decision === "ask") {
      return reason
        ? { hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: reason } }
        : {};
    }
    // An allow decision without updatedInput is invalid in Codex. Empty output
    // preserves the normal approval flow for safe OSpec decisions.
    return {};
  }

  return typeof output.systemMessage === "string" && output.systemMessage.trim()
    ? { systemMessage: output.systemMessage.trim() }
    : {};
}

// Cursor installs live under ~/.cursor (or a path segment named ".cursor").
// Env markers are intentionally not required — REQ-hooks-runtime-001 left them
// out of scope — so install-path detection is the durable signal. Cursor also
// loads Claude-plugin hooks as third-party PreToolUse; detect that host via
// Cursor-native stdin fields / event names so we never emit unsupported `ask`.
function isCursorInstall(scriptDir = __dirname, env = process.env) {
  if (env && env.OSPEC_TARGET === "cursor") {
    return true;
  }
  const parts = String(scriptDir || "")
    .split(/[\\/]+/)
    .map((part) => part.toLowerCase());
  return parts.includes(".cursor");
}

function isCursorHost(scriptDir = __dirname, env = process.env, rawInput = "") {
  if (isCursorInstall(scriptDir, env)) {
    return true;
  }
  if (env && (env.CURSOR_AGENT || env.CURSOR_SESSION_ID || env.CURSOR_HOOK || env.VSCODE_PID || env.VSCODE_CWD)) {
    return true;
  }
  try {
    const parsed = JSON.parse(String(rawInput || "") || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return false;
    }
    const eventName = parsed.hook_event_name || parsed.hookEventName;
    if (typeof eventName === "string") {
      const cursorEvents = new Set([
        "preToolUse",
        "postToolUse",
        "beforeShellExecution",
        "beforeReadFile",
        "beforeMCPExecution",
        "beforeSubmitPrompt",
        "subagentStart",
        "subagentStop",
        "afterFileEdit",
        "preCompact",
        "stop",
      ]);
      if (cursorEvents.has(eventName)) {
        return true;
      }
    }
    // Cursor beforeShellExecution / beforeReadFile native shapes (no Claude nesting).
    if (typeof parsed.command === "string" && parsed.sandbox !== undefined && !parsed.tool_input) {
      return true;
    }
    if (typeof parsed.file_path === "string" && Object.prototype.hasOwnProperty.call(parsed, "content")) {
      return true;
    }
    if (parsed.subagent_type || parsed.subagent_id) {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

// Cursor hosts speak a different stdin shape than Claude:
//   beforeShellExecution → { command, cwd, sandbox }
//   beforeReadFile       → { file_path, content, ... }
//   preToolUse           → { tool_name, tool_input, ... } (already Claude-like)
// Map those into the shared PreToolUse contract so Go/Node policy stays shared.
function adaptCursorHookInput(subcommand, rawInput) {
  let parsed;
  try {
    parsed = JSON.parse(String(rawInput || "") || "{}");
  } catch {
    return rawInput;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return rawInput;
  }

  if (subcommand === "pre-tool-use") {
    if (typeof parsed.command === "string" && !parsed.tool_input) {
      return JSON.stringify({
        ...parsed,
        tool_name: parsed.tool_name || "Shell",
        tool_input: { command: parsed.command },
      });
    }
    if (typeof parsed.file_path === "string" && !parsed.tool_input) {
      return JSON.stringify({
        ...parsed,
        tool_name: parsed.tool_name || "Read",
        tool_input: {
          path: parsed.file_path,
          file_path: parsed.file_path,
          filePath: parsed.file_path,
        },
      });
    }
  }

  return rawInput;
}

// Cursor's preToolUse / beforeReadFile / subagentStart contracts only accept
// allow|deny. Emitting Claude-style permissionDecision:"ask" is mapped by
// Cursor to permission:"ask" and fails closed with:
//   "The 'ask' permission for preToolUse hooks is not yet implemented."
// Degrade advisory ask → allow and keep the reason visible to user/agent.
function normalizeCursorHookOutput(subcommand, output) {
  if (subcommand === "pre-tool-use") {
    const decision = output && output.hookSpecificOutput
      ? output.hookSpecificOutput.permissionDecision
      : output && output.permission;
    const reason =
      (output && output.hookSpecificOutput && output.hookSpecificOutput.permissionDecisionReason) ||
      (output && output.systemMessage) ||
      (output && output.user_message) ||
      (output && output.agent_message) ||
      "";

    if (decision === "deny") {
      return {
        permission: "deny",
        user_message: reason || "Blocked by OSpec policy.",
        agent_message: reason || "Blocked by OSpec policy.",
      };
    }

    if (decision === "ask") {
      const advisory = reason ? `[ospec advisory] ${reason}` : "[ospec advisory] Review this action.";
      return {
        permission: "allow",
        user_message: advisory,
        agent_message: advisory,
      };
    }

    return { permission: "allow" };
  }

  if (subcommand === "session-start") {
    const message =
      (output && typeof output.systemMessage === "string" && output.systemMessage.trim()) ||
      (output &&
        output.hookSpecificOutput &&
        typeof output.hookSpecificOutput.additionalContext === "string" &&
        output.hookSpecificOutput.additionalContext.trim()) ||
      "";
    return message
      ? { continue: true, user_message: message }
      : { continue: true };
  }

  return { continue: true };
}

// node platform/arch -> Go GOOS/GOARCH + executable extension, matching the
// names produced by build-hooks.yml and install-target.js (hostBinarySuffix).
function hostBinarySuffix(platform = process.platform, arch = process.arch) {
  const goos =
    platform === "win32" ? "windows" : platform === "darwin" ? "darwin" : "linux";
  const goarch = arch === "x64" ? "amd64" : arch === "arm64" ? "arm64" : arch;
  const ext = platform === "win32" ? ".exe" : "";
  return { goos, goarch, ext };
}

// Candidate binary paths, most specific first:
//   1. per-platform name in scripts/hooks/  (release bundle)
//   2. per-platform name in release/dist/   (opencode binary location)
//   3. generic name in scripts/hooks/       (local copyBinaryToTree)
function binaryCandidates(scriptDir, suffix = hostBinarySuffix()) {
  const { goos, goarch, ext } = suffix;
  const platformName = `ospec-hooks-${goos}-${goarch}${ext}`;
  const genericName = `ospec-hooks${ext}`;
  return [
    path.join(scriptDir, platformName),
    // plugin-root/release/dist (where opencode's resolveBinary looks first).
    path.join(scriptDir, "..", "..", "release", "dist", platformName),
    path.join(scriptDir, genericName),
  ];
}

const FEDERATION_AWARE_HOOKS = new Set([
  "session-start",
  "pre-compact",
  "stop",
]);

function readBackendModeSync(configPath, readFileSync = fs.readFileSync) {
  try {
    const content = readFileSync(configPath, "utf8");
    let inArtifactStore = false;
    for (const raw of content.split(/\r?\n/)) {
      const trimmed = raw.trim();
      const indent = raw.match(/^\s*/)[0].length;
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      if (indent === 0) {
        inArtifactStore = trimmed === "artifact_store:";
        continue;
      }
      if (inArtifactStore) {
        const match = trimmed.match(/^backend:\s*(.+)$/);
        if (match) {
          return match[1].replace(/^(["'])([\s\S]*)\1$/, "$2").replace(/\s+#.*$/, "").trim();
        }
      }
    }
  } catch (err) {
    // Ignore and default
  }
  return "openspec";
}

function resolveBinary(scriptDir, suffix = hostBinarySuffix(), exists = fs.existsSync) {
  for (const candidate of binaryCandidates(scriptDir, suffix)) {
    if (exists(candidate)) {
      return candidate;
    }
  }
  return null;
}

// Resolve what to run and how. Pure so it can be unit-tested without spawning:
// returns { command, args } for either the native binary or the Node fallback.
function resolveInvocation(sub, scriptDir, suffix = hostBinarySuffix(), exists = fs.existsSync, readFileSync = fs.readFileSync) {
  // Codex live O1 binding depends on the exact installed Node producer that
  // consumes OSPEC_CODEX_EVENTS_PATH. Do not let a stale bundled binary shadow
  // that audited producer for SubagentStop.
  if (sub === "subagent-stop" && process.env.OSPEC_TARGET === "codex") {
    return { command: process.execPath, args: [path.join(scriptDir, `${sub}.js`)] };
  }
  if (FEDERATION_AWARE_HOOKS.has(sub)) {
    const configPath = path.join(process.cwd(), "openspec", "config.yaml");
    if (exists(configPath)) {
      const mode = readBackendModeSync(configPath, readFileSync);
      if (mode === "workspace-federated") {
        return { command: process.execPath, args: [path.join(scriptDir, `${sub}.js`)] };
      }
    }
  }

  const binary = resolveBinary(scriptDir, suffix, exists);
  if (binary) {
    return { command: binary, args: [sub] };
  }
  return { command: process.execPath, args: [path.join(scriptDir, `${sub}.js`)] };
}


function main(argv, scriptDir = __dirname) {
  const sub = argv[0];
  if (!SUBCOMMANDS.has(sub)) {
    process.stderr.write(`ospec-hooks-launch: unknown subcommand '${sub || ""}'\n`);
    process.stdout.write(CONTINUE);
    return 0;
  }

  const rawInput = fs.readFileSync(0, "utf8");
  const cursorHost = isCursorHost(scriptDir, process.env, rawInput);
  const { command, args } = resolveInvocation(sub, scriptDir);
  const input = cursorHost ? adaptCursorHookInput(sub, rawInput) : rawInput;
  const pluginRoot = path.resolve(scriptDir, "../..");
  const env = {
    ...process.env,
    OSPEC_PLUGIN_ROOT: pluginRoot,
    ...(cursorHost ? { OSPEC_TARGET: process.env.OSPEC_TARGET || "cursor" } : {}),
  };
  const result = spawnSync(command, args, { input, env, encoding: "utf8" });

  if (result.error) {
    process.stdout.write(CONTINUE);
    return 0;
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (process.env.OSPEC_TARGET === "codex") {
    process.stdout.write(`${JSON.stringify(normalizeCodexHookOutput(sub, parseLastJson(result.stdout)))}\n`);
  } else if (cursorHost) {
    process.stdout.write(`${JSON.stringify(normalizeCursorHookOutput(sub, parseLastJson(result.stdout)))}\n`);
  } else if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  return result.status == null ? 0 : result.status;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  SUBCOMMANDS,
  hostBinarySuffix,
  binaryCandidates,
  resolveBinary,
  resolveInvocation,
  normalizeCodexHookOutput,
  isCursorInstall,
  isCursorHost,
  adaptCursorHookInput,
  normalizeCursorHookOutput,
  main,
};
