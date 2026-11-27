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
  "post-tool-use",
  "pre-compact",
  "subagent-stop",
  "stop",
]);

// Only the Claude Code hooks pass it (nestHooks in target-transform.js): that
// host rewrites tool output through PostToolUse, so a non-shell read of a
// secret needs no prompt. Every other invocation clears an inherited value.
const OUTPUT_REDACTION_FLAG = "--output-redaction";
// Only the Claude Code SessionStart passes it (nestHooks): the launcher keeps
// the Claude Code router (scripts/lib/claude-router.js) before the child runs,
// so a session outside an ospec project gets it too.
const CLAUDE_ROUTER_FLAG = "--claude-router";
// E1.51: the VS Code and GitHub Copilot builds name their host on their
// SessionStart and Stop commands (target-transform.js), since neither sets a
// marker of its own and each reads the answer in its own shape.
const HOST_FLAG = "--host";
const FLAGGED_HOSTS = new Set(["vscode", "github-copilot"]);

// E1.51: how the end-of-turn hook of each host asks the agent to continue.
// The child answers `decision: "block"` with the reason; OpenCode's plugin
// sends the reason as a prompt instead (opencode-plugin.js).
const CONTINUATION = {
  claude: (reason) => ({ decision: "block", reason }),
  codex: (reason) => ({ decision: "block", reason }),
  "github-copilot": (reason) => ({ decision: "block", reason }),
  vscode: (reason) => ({ hookSpecificOutput: { hookEventName: "Stop", decision: "block", reason } }),
  cursor: (reason) => ({ followup_message: reason }),
  antigravity: (reason) => ({ decision: "continue", reason }),
};

// The reason of a Stop answer that asks to continue, else null.
function continuationReason(output) {
  return isPlainObject(output) && output.decision === "block" && typeof output.reason === "string" && output.reason.trim()
    ? output.reason
    : null;
}

// The model-facing context a SessionStart answer carries (E1.51).
function sessionContext(output) {
  const context = isPlainObject(output) ? output.hookSpecificOutput?.additionalContext : undefined;
  return typeof context === "string" && context.trim() ? context.trim() : "";
}

function hostFlag(argv) {
  const index = argv.indexOf(HOST_FLAG);
  const host = index >= 0 ? argv[index + 1] : undefined;
  return FLAGGED_HOSTS.has(host) ? host : null;
}

// VS Code reads a Stop decision only inside hookSpecificOutput; Copilot CLI
// reads the SessionStart context at the top level.
function normalizeFlaggedHostOutput(host, subcommand, output) {
  if (!isPlainObject(output)) return output;
  if (subcommand === "stop") {
    const reason = continuationReason(output);
    if (!reason) return output;
    const { decision: _decision, reason: _reason, ...rest } = output;
    return { ...rest, ...CONTINUATION[host](reason) };
  }
  if (subcommand === "session-start" && host === "github-copilot") {
    const context = sessionContext(output);
    if (!context) return output;
    const { hookSpecificOutput: _nested, ...rest } = output;
    return { ...rest, additionalContext: context };
  }
  return output;
}

const CONTINUE = '{"continue":true}\n';
// Leave one second for launch, normalization and host delivery (host: 5s).
const CHILD_TIMEOUT_MS = 4000;
const INSPECTION_FAILURE_PREFIX = "The safety hook could not inspect this tool call:";

// A failed PostToolUse child must not let the original output through (ADR
// 0008): redact in process, or withhold every string when that fails too.
// Without a readable payload there is no shape to rewrite, so nothing is sent.
function postToolUseFallback(rawInput, detail) {
  let input;
  try {
    input = JSON.parse(stripUtf8Bom(rawInput) || "{}");
  } catch {
    return null;
  }
  const { evaluatePostToolUse, withheldOutput } = require("./post-tool-use.js");
  try {
    return evaluatePostToolUse(input);
  } catch {
    return withheldOutput(input, detail);
  }
}

function launcherFailure(sub, detail, cursorHost = false, rawInput = "") {
  process.stderr.write(`[ospec error] Hook ${sub} failed: ${detail}\n`);
  if (sub === "post-tool-use") {
    let fallback = postToolUseFallback(rawInput, detail);
    if (process.env.OSPEC_TARGET === "codex") fallback = normalizeCodexHookOutput(sub, fallback);
    else if (process.env.OSPEC_TARGET === "antigravity") fallback = normalizeAntigravityHookOutput(sub, fallback);
    else if (cursorHost) fallback = normalizeCursorHookOutput(sub, fallback);
    if (fallback && Object.keys(fallback).length > 0) {
      process.stdout.write(`${JSON.stringify(fallback)}\n`);
    }
    return 0;
  }
  const message = `${INSPECTION_FAILURE_PREFIX} ${detail}`;
  let output = sub === "pre-tool-use"
    ? { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "ask", permissionDecisionReason: message } }
    : { continue: true, systemMessage: `[ospec error] Hook ${sub} failed: ${detail}` };
  try {
    // Native advisory adapters need ASK as input to preserve their context.
    if (sub === "pre-tool-use" && !cursorHost && !["codex", "antigravity"].includes(process.env.OSPEC_TARGET) && JSON.parse(rawInput).permission_mode === "bypassPermissions") {
      output.hookSpecificOutput.permissionDecision = "allow";
      output.systemMessage = `[ospec advisory] ${message}`;
    }
  } catch { /* Unknown permission mode preserves the inspection-error ASK. */ }
  if (process.env.OSPEC_TARGET === "antigravity") {
    writeAntigravityHookOutput(normalizeAntigravityHookOutput(sub, output));
    return 0;
  }
  if (process.env.OSPEC_TARGET === "codex") output = normalizeCodexHookOutput(sub, output);
  else if (cursorHost) output = normalizeCursorHookOutput(sub, output);
  process.stdout.write(`${JSON.stringify(output)}\n`);
  return 0;
}

// agy 1.4.2 reads `{}` as an empty PreToolUse decision and denies the call,
// so an answer without fields is written as nothing at all.
function writeAntigravityHookOutput(output) {
  if (Object.keys(output).length > 0) {
    process.stdout.write(`${JSON.stringify(output)}\n`);
  }
}

// Cursor's hook stdin is UTF-8 and may start with U+FEFF. encoding/json
// reports that byte as invalid character 'ï' and the fail-closed hook then
// returns permissionDecision "ask", which Cursor rejects outright.
function stripUtf8Bom(value) {
  const text = String(value || "");
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

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
    // An error envelope must keep its frame in the only channel Codex
    // surfaces: prefix it instead of leaking the raw diagnostic JSON.
    if (output.status === "error") {
      const detail = typeof output.message === "string" && output.message.trim()
        ? output.message.trim()
        : "unknown session-start failure";
      return {
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: `[ospec error] ${detail}`,
        },
      };
    }
    const message = typeof output.systemMessage === "string" ? output.systemMessage.trim() : "";
    // Codex surfaces only additionalContext, so the structured fields the
    // orchestrator needs for skill injection ride along as a JSON line after
    // the human-readable advisory. The open IDD changes (E1.51) lead it.
    const context = Object.fromEntries(
      Object.entries(output).filter(([key]) => !["status", "systemMessage", "hookSpecificOutput"].includes(key)),
    );
    const json = JSON.stringify(context);
    let additionalContext = [sessionContext(output), message].filter(Boolean).join("\n");
    if (json !== "{}") {
      additionalContext = additionalContext ? `${additionalContext}\n${json}` : json;
    }
    return additionalContext
      ? { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } }
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

  if (subcommand === "post-tool-use") {
    // Codex cannot rewrite a tool result, but `block` replaces it with the
    // reason: the reason carries the redacted output.
    const hook = output.hookSpecificOutput;
    if (!hook || hook.updatedToolOutput === undefined) {
      return {};
    }
    const text = typeof hook.updatedToolOutput === "string" ? hook.updatedToolOutput : JSON.stringify(hook.updatedToolOutput);
    return { decision: "block", reason: hook.additionalContext ? `${hook.additionalContext}\n${text}` : text };
  }

  const systemMessage = typeof output.systemMessage === "string" && output.systemMessage.trim()
    ? { systemMessage: output.systemMessage.trim() }
    : {};
  // Codex's Stop parser drops an answer with any key it does not know.
  const reason = subcommand === "stop" ? continuationReason(output) : null;
  return reason ? { ...CONTINUATION.codex(reason), ...systemMessage } : systemMessage;
}

// agy runs a hook from the directory holding hooks.json and sends
// { toolCall: { name, args }, conversationId, cwd, workspacePaths }.
// Rebuild the shared contract and the directory the policy must read from:
// a shell command's own Cwd, else native cwd (agy 1.5+), else the first
// workspace that is a directory. A tool call it cannot read is `unreadable`:
// the guard must not see it as empty.
function adaptAntigravityHookInput(subcommand, rawInput, isDirectory = isExistingDirectory) {
  const unreadable = { input: rawInput, cwd: undefined, unreadable: subcommand === "pre-tool-use" };
  let parsed;
  try {
    parsed = JSON.parse(stripUtf8Bom(rawInput) || "{}");
  } catch {
    return unreadable;
  }
  if (!isPlainObject(parsed)) {
    return unreadable;
  }
  const resolveDir = (dir) => {
    if (typeof dir !== "string") return undefined;
    const trimmed = dir.trim();
    if (!trimmed || trimmed.split(/[\\/]/).includes("..")) return undefined;
    const cleaned = path.normalize(trimmed);
    if (!path.isAbsolute(cleaned) || path.dirname(cleaned) === cleaned) return undefined;
    return isDirectory(cleaned) ? cleaned : undefined;
  };
  const workspace = Array.isArray(parsed.workspacePaths) ? parsed.workspacePaths.map(resolveDir).find(Boolean) : undefined;
  let cwd = resolveDir(parsed.cwd) ?? workspace;
  const adapted = { ...parsed, session_id: parsed.conversationId, cwd };
  if (subcommand === "pre-tool-use") {
    const args = parsed.toolCall?.args;
    if (!isPlainObject(parsed.toolCall) || typeof parsed.toolCall.name !== "string" || !isPlainObject(args)) {
      return unreadable;
    }
    const toolInput = { ...args };
    // Avoid Go pretooluse.go json.Unmarshal failures or EqualFold overwrites
    // from case-variant or type-mismatched top-level `command`/`commands`.
    for (const key of Object.keys(toolInput)) {
      if (key === "command" || key === "commands") continue;
      const folded = key.replace(/\u017f/gi, "s").toLowerCase();
      if (folded === "command" || folded === "commands") {
        toolInput[`__ospec_raw_${key}`] = toolInput[key];
        delete toolInput[key];
      }
    }
    if (Object.prototype.hasOwnProperty.call(toolInput, "command") && typeof toolInput.command !== "string") {
      toolInput.__ospec_raw_command = toolInput.command;
      delete toolInput.command;
    }
    if (Object.prototype.hasOwnProperty.call(toolInput, "commands") && !Array.isArray(toolInput.commands)) {
      toolInput.__ospec_raw_commands = toolInput.commands;
      delete toolInput.commands;
    }
    if (typeof args.CommandLine === "string" && args.CommandLine.length > 0) {
      if (typeof toolInput.command === "string" && toolInput.command.length > 0) {
        if (toolInput.command !== args.CommandLine) {
          toolInput.commands = [...(toolInput.commands || []), args.CommandLine];
        }
      } else {
        toolInput.command = args.CommandLine;
      }
    }
    const agyPaths = [...new Set([args.Path, args.AbsolutePath, args.TargetFile].filter((value) => typeof value === "string" && value.length > 0))];
    if (agyPaths.length > 0) {
      const hasExistingPath = Object.prototype.hasOwnProperty.call(toolInput, "file_path") && toolInput.file_path !== undefined && toolInput.file_path !== "";
      const extraPaths = hasExistingPath
        ? (typeof toolInput.file_path === "string" ? agyPaths.filter((p) => p !== toolInput.file_path) : agyPaths)
        : ((toolInput.file_path = agyPaths[0]), agyPaths.slice(1));
      if (extraPaths.length > 0) {
        toolInput.__ospec_agy_paths = extraPaths.map((file_path) => ({ file_path }));
      }
    }
    // agy 1.5+ write_file/edit_file send Content/Replacement; legacy
    // write_to_file and replace tools send CodeContent/ReplacementContent
    // (also inside ReplacementChunks). Target/TargetContent are not scanned.
    const bodies = collectStrings(args, new Set(["Content", "Replacement", "CodeContent", "ReplacementContent"])).filter((value) => value.length > 0);
    if (bodies.length > 0) {
      const joined = bodies.join("\n");
      if (toolInput.content === undefined) {
        toolInput.content = joined;
      } else if (typeof toolInput.content === "string") {
        toolInput.content = toolInput.content.length > 0 ? `${toolInput.content}\n${joined}` : joined;
      } else {
        toolInput.__ospec_agy_content = { content: joined };
      }
    }
    adapted.tool_name = parsed.toolCall.name;
    adapted.tool_input = toolInput;
    // A relative Cwd is relative to the agent's cwd (or workspace), never to
    // hooks.json's directory; an empty or missing one keeps cwd. Without any
    // directory to inspect from, the guard cannot read the call.
    if (typeof args.Cwd === "string") {
      const trimmedCwd = args.Cwd.trim();
      if (trimmedCwd && !trimmedCwd.split(/[\\/]/).includes("..")) {
        const base = cwd || workspace;
        const commandDir = resolveDir(path.isAbsolute(trimmedCwd) ? trimmedCwd : base && path.resolve(base, trimmedCwd));
        if (commandDir) cwd = commandDir;
      }
    }
    if (!cwd) {
      return unreadable;
    }
    adapted.cwd = cwd;
  }
  if (subcommand === "stop") {
    const reason = typeof parsed.terminationReason === "string" ? parsed.terminationReason.trim() : "";
    if (parsed.fullyIdle === false || (reason && reason !== "NO_TOOL_CALL")) {
      adapted.stop_hook_active = true;
    }
  }
  return { input: JSON.stringify(adapted), cwd, unreadable: false };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectStrings(value, keys, found = []) {
  for (const [key, child] of Object.entries(value || {})) {
    if (typeof child === "string" && keys.has(key)) found.push(child);
    else if (child && typeof child === "object") collectStrings(child, keys, found);
  }
  return found;
}

function formatSecurityAlerts(security) {
  if (!isPlainObject(security)) {
    return "";
  }
  const alerts = Array.isArray(security.alerts) ? security.alerts : [];
  const items = alerts
    .map((alert) => {
      if (typeof alert === "string") return alert.trim();
      if (!isPlainObject(alert)) return "";
      const file = typeof alert.file === "string" ? alert.file.trim() : "";
      const reason = typeof alert.reason === "string" ? alert.reason.trim() : "";
      if (file && reason) return `${file} (${reason})`;
      return file || reason || (typeof alert.type === "string" ? alert.type.trim() : "");
    })
    .filter(Boolean);
  if (items.length > 0) {
    return `[ospec security] ${items.join(", ")}`;
  }
  return security.status === "warning" ? "[ospec security] security warning detected at session start" : "";
}

// agy's PreToolUse takes { decision, reason }, its SessionStart injects steps
// and its Stop only reads decision "continue", which ospec never asks for.
// An affirmative allow would skip agy's own prompts, so none is emitted.
function normalizeAntigravityHookOutput(subcommand, output) {
  if (!output || typeof output !== "object" || Array.isArray(output)) {
    return {};
  }
  if (subcommand === "pre-tool-use") {
    const decision = output.hookSpecificOutput?.permissionDecision;
    const reason = output.hookSpecificOutput?.permissionDecisionReason || output.systemMessage;
    if (decision === "deny") return { decision: "deny", reason: reason || "Blocked by OSpec policy." };
    if (decision === "ask") {
      const agyDecision = typeof reason === "string" && reason.startsWith(INSPECTION_FAILURE_PREFIX) ? "force_ask" : "ask";
      return reason ? { decision: agyDecision, reason } : { decision: agyDecision };
    }
    return {};
  }
  if (subcommand === "session-start") {
    if (output.status === "error") {
      const detail = typeof output.message === "string" && output.message.trim()
        ? output.message.trim()
        : "unknown session-start failure";
      return { injectSteps: [{ systemMessage: { systemMessage: `[ospec error] ${detail}` } }] };
    }
    const userMarkdown = typeof output.systemMessage === "string" ? output.systemMessage.trim() : "";
    const errorLines = userMarkdown
      ? userMarkdown.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith("[ospec error]"))
      : [];
    const modelMessage = [
      sessionContext(output),
      ...errorLines,
      formatSecurityAlerts(output.security),
    ].filter(Boolean).join("\n");
    if (!modelMessage && !userMarkdown) {
      return {};
    }
    const step = { systemMessage: modelMessage };
    if (userMarkdown) {
      step.metadata = { user_markdown: userMarkdown };
    }
    return { injectSteps: [{ systemMessage: step }] };
  }
  if (subcommand === "stop") {
    const reason = continuationReason(output);
    return reason ? CONTINUATION.antigravity(reason) : {};
  }
  return {};
}

// Cursor installs live under ~/.cursor (or a path segment named ".cursor").
// Env markers are intentionally not required — REQ-hooks-runtime-001 left them
// out of scope — so install-path detection is the durable signal. Cursor also
// loads Claude-plugin hooks as third-party PreToolUse; detect that host via
// Cursor-native stdin fields / event names so we never emit unsupported `ask`.
function isCursorInstall(scriptDir = __dirname, env = process.env) {
  if (env && env.OSPEC_TARGET) {
    return env.OSPEC_TARGET === "cursor";
  }
  const parts = String(scriptDir || "")
    .split(/[\\/]+/)
    .map((part) => part.toLowerCase());
  return parts.includes(".cursor");
}

function isCursorHost(scriptDir = __dirname, env = process.env, rawInput = "") {
  // Explicit target configuration wins over inherited terminal/plugin markers.
  if (env && env.OSPEC_TARGET) {
    return env.OSPEC_TARGET === "cursor";
  }
  if (isCursorInstall(scriptDir, env)) {
    return true;
  }
  // OSP-031: the payload names its caller, so an inherited CURSOR_* marker
  // must not override it. Cursor always sends cursor_version and
  // conversation_id, also to third-party hooks; Claude Code sends session_id
  // with a PascalCase event.
  let payload = null;
  try {
    payload = JSON.parse(stripUtf8Bom(rawInput) || "null");
  } catch {
    // Unreadable: the env markers and shape checks below decide.
  }
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    if (typeof payload.cursor_version === "string" || typeof payload.conversation_id === "string") {
      return true;
    }
    if (typeof payload.session_id === "string" && /^[A-Z]/.test(String(payload.hook_event_name || ""))) {
      return false;
    }
  }
  if (env && (env.CURSOR_AGENT || env.CURSOR_SESSION_ID || env.CURSOR_HOOK)) {
    return true;
  }
  try {
    const parsed = JSON.parse(stripUtf8Bom(rawInput) || "{}");
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

// A child spawned from a path that is not a directory fails, and on Cursor a
// failed guard can only degrade to an advisory allow.
function isExistingDirectory(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

// Cursor hosts speak a different stdin shape than Claude:
//   beforeShellExecution → { command, cwd, sandbox }
//   beforeReadFile       → { file_path, content, ... }
//   preToolUse           → { tool_name, tool_input, ... } (already Claude-like)
// Map those into the shared PreToolUse contract so Go/Node policy stays shared.
// E1.49: user hooks run from ~/.cursor and most events name the workspace only
// in workspace_roots, so every hook runs from the first root that exists, as
// agy's do, and a shell command keeps its own directory.
function adaptCursorHookInput(subcommand, rawInput, isDirectory = isExistingDirectory) {
  let parsed;
  try {
    parsed = JSON.parse(stripUtf8Bom(rawInput) || "{}");
  } catch {
    return { input: rawInput, cwd: undefined };
  }
  if (!isPlainObject(parsed)) {
    return { input: rawInput, cwd: undefined };
  }
  const isDir = (dir) => typeof dir === "string" && path.isAbsolute(dir) && isDirectory(dir);
  const workspace = Array.isArray(parsed.workspace_roots) ? parsed.workspace_roots.find(isDir) : undefined;
  const cwd = isDir(parsed.cwd) ? parsed.cwd : workspace;
  const adapted = cwd ? { ...parsed, cwd } : parsed;

  if (subcommand === "pre-tool-use") {
    if (typeof parsed.command === "string" && !parsed.tool_input) {
      return {
        input: JSON.stringify({
          ...adapted,
          tool_name: parsed.tool_name || "Shell",
          tool_input: { command: parsed.command },
        }),
        cwd,
      };
    }
    if (typeof parsed.file_path === "string" && !parsed.tool_input) {
      return {
        input: JSON.stringify({
          ...adapted,
          tool_name: parsed.tool_name || "Read",
          tool_input: {
            path: parsed.file_path,
            file_path: parsed.file_path,
            filePath: parsed.file_path,
          },
        }),
        cwd,
      };
    }
  }

  return { input: adapted === parsed ? rawInput : JSON.stringify(adapted), cwd };
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
    // beforeSubmitPrompt hands additional_context to the model (E1.51).
    const context = sessionContext(output);
    return {
      continue: true,
      ...(message ? { user_message: message } : {}),
      ...(context ? { additional_context: context } : {}),
    };
  }

  if (subcommand === "stop") {
    const reason = continuationReason(output);
    if (reason) return CONTINUATION.cursor(reason);
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

// The direct `artifact_store.backend` of openspec/config.yaml, never a key
// written inside a value (REQ-lifecycle-kernel-034). yaml-lite.js loads only
// for the hooks that read it, off the hot path of the others.
function readBackendModeSync(configPath, readFileSync = fs.readFileSync) {
  try {
    const { readYamlScalar } = require("../lib/yaml-lite.js");
    return readYamlScalar(readFileSync(configPath, "utf8"), ["artifact_store", "backend"]) ?? "openspec";
  } catch (err) {
    // Ignore and default
  }
  return "openspec";
}

// The exec errors of a binary the system could not start, and the exit codes
// of the /bin/sh the spawn falls back to on ENOEXEC (126: not executable, 127:
// not found). ospec-hooks itself exits only 0, 1 or 2. That shell exits without
// reading stdin, so an input larger than the pipe buffer adds EPIPE to its
// exit code. Returns the reason, or null when the binary ran.
const NOT_STARTED_ERRORS = new Set(["EACCES", "ENOEXEC", "ENOENT"]);

function binaryDidNotStart(result) {
  if (result.error && result.error.code !== "EPIPE") return NOT_STARTED_ERRORS.has(result.error.code) ? result.error.code : null;
  return !result.signal && (result.status === 126 || result.status === 127) ? `exit ${result.status}` : null;
}

// The reason of a failed child (REQ-hooks-025). EPIPE only says the child
// exited before reading all of stdin, so its signal or nonzero exit names the
// failure; after exit 0 EPIPE stays the reason, as the child decided without
// reading the whole call.
function childFailureDetail(result) {
  const code = result.error?.code;
  const exited = Boolean(result.signal) || (result.status != null && result.status !== 0);
  if (code && !(code === "EPIPE" && exited)) return code;
  return result.signal || `exit ${result.status}`;
}

function resolveBinary(scriptDir, suffix = hostBinarySuffix(), exists = fs.existsSync) {
  for (const candidate of binaryCandidates(scriptDir, suffix)) {
    if (exists(candidate)) {
      return candidate;
    }
  }
  return null;
}

// REQ-hooks-019 (ADR-002): hosts Claude Code reutilizan el precedente Codex —
// un binario nativo presente no debe ensombrecer al productor Node para
// SubagentStop. Detección solo por marcadores de entorno, sin I/O adicional;
// OSPEC_TARGET precede a CLAUDE_PLUGIN_ROOT para que hosts que reutilizan
// layouts de plugin Claude (p. ej. Cursor) puedan sobreescribir.
function isClaudeCodeHost(env = process.env) {
  if (env && env.OSPEC_TARGET) {
    return env.OSPEC_TARGET === "claude";
  }
  return Boolean(env) && typeof env.CLAUDE_PLUGIN_ROOT === "string" && env.CLAUDE_PLUGIN_ROOT.length > 0;
}

// Resolve what to run and how. Pure so it can be unit-tested without spawning:
// returns { command, args } for either the native binary or the Node fallback.
// `env` is injectable (defaults to process.env) so tests never mutate the
// ambient environment; the codex branch keeps reading process.env exactly as
// before (byte-for-byte precedent, REQ-hooks-019).
function resolveInvocation(sub, scriptDir, suffix = hostBinarySuffix(), exists = fs.existsSync, readFileSync = fs.readFileSync, env = process.env, cwd = process.cwd()) {
  // Codex live O1 binding depends on the exact installed Node producer that
  // consumes OSPEC_CODEX_EVENTS_PATH. Do not let a stale bundled binary shadow
  // that audited producer for SubagentStop.
  if (sub === "subagent-stop" && process.env.OSPEC_TARGET === "codex") {
    return { command: process.execPath, args: [path.join(scriptDir, `${sub}.js`)] };
  }
  // Claude Code: route SubagentStop to the Node producer even when a native
  // binary ships — the binary is an optimization, the Node hook is the
  // functional superset for this event.
  if (sub === "subagent-stop" && isClaudeCodeHost(env)) {
    return { command: process.execPath, args: [path.join(scriptDir, `${sub}.js`)] };
  }
  if (FEDERATION_AWARE_HOOKS.has(sub)) {
    const configPath = path.join(cwd, "openspec", "config.yaml");
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


// Refreshes the router ospec wrote and returns the notice for a session that
// starts without one. A failure costs the notice, never the session start.
function claudeRouterStep(rawInput, scriptDir, env = process.env) {
  try {
    const input = rawInput.trim() ? JSON.parse(rawInput) : {};
    const { sessionStartRouter } = require("../lib/claude-router.js");
    return sessionStartRouter({ input: isPlainObject(input) ? input : {}, env, pluginRoot: path.resolve(scriptDir, "../..") });
  } catch (error) {
    process.stderr.write(`[ospec warn] the Claude Code router step failed (${error.message}); the session starts without it\n`);
    return null;
  }
}

// The notice rides on the child's JSON answer as `systemMessage`, which the
// user sees and the model does not. An answer that is not a JSON object is
// passed on unchanged.
function withSystemMessage(stdout, notice) {
  const answer = parseLastJson(stdout || "{}");
  if (!isPlainObject(answer)) return stdout;
  const systemMessage = typeof answer.systemMessage === "string" && answer.systemMessage ? `${answer.systemMessage}\n${notice}` : notice;
  return `${JSON.stringify({ ...answer, systemMessage })}\n`;
}

function launch(argv, scriptDir, seen = {}) {
  const sub = argv[0];
  if (!SUBCOMMANDS.has(sub)) {
    process.stderr.write(`ospec-hooks-launch: unknown subcommand '${sub || ""}'\n`);
    process.stdout.write(CONTINUE);
    return 0;
  }

  const rawInput = stripUtf8Bom(fs.readFileSync(0, "utf8"));
  seen.rawInput = rawInput;
  const flaggedHost = hostFlag(argv);
  const cursorHost = !flaggedHost && isCursorHost(scriptDir, process.env, rawInput);
  const antigravityHost = process.env.OSPEC_TARGET === "antigravity";
  const adapted = antigravityHost
    ? adaptAntigravityHookInput(sub, rawInput)
    : cursorHost
      ? adaptCursorHookInput(sub, rawInput)
      : { input: rawInput, cwd: undefined };
  if (adapted.unreadable) {
    return launcherFailure(sub, "unrecognized agy tool call", cursorHost, rawInput);
  }
  const router = sub === "session-start" && argv.includes(CLAUDE_ROUTER_FLAG) ? claudeRouterStep(rawInput, scriptDir) : null;
  const { command, args } = resolveInvocation(sub, scriptDir, undefined, undefined, undefined, undefined, adapted.cwd);
  const input = adapted.input;
  const pluginRoot = path.resolve(scriptDir, "../..");
  const env = {
    ...process.env,
    OSPEC_PLUGIN_ROOT: pluginRoot,
    OSPEC_OUTPUT_REDACTION: argv.includes(OUTPUT_REDACTION_FLAG) ? "1" : "",
    ...(cursorHost ? { OSPEC_TARGET: process.env.OSPEC_TARGET || "cursor" } : {}),
  };
  const started = Date.now();
  const spawnChild = (file, fileArgs, timeout) => spawnSync(file, fileArgs, { input, env, cwd: adapted.cwd, encoding: "utf8", timeout, killSignal: "SIGKILL" });
  let result = spawnChild(command, args, CHILD_TIMEOUT_MS);
  // REQ-hooks-031: a binary that never started (no execute bit, missing
  // loader, another architecture) gives way to the Node hook of the same
  // name, within the same deadline. One that ran and failed is not retried.
  const notStarted = command !== process.execPath && binaryDidNotStart(result);
  if (notStarted) {
    process.stderr.write(`[ospec warn] the ospec-hooks binary could not start (${notStarted}); ran the Node hook\n`);
    result = spawnChild(process.execPath, [path.join(scriptDir, `${sub}.js`)], Math.max(1, CHILD_TIMEOUT_MS - (Date.now() - started)));
  }

  if (result.error || result.signal || result.status !== 0) {
    // Never forward partial stdout from a failed child as a permission decision.
    return launcherFailure(sub, childFailureDetail(result), cursorHost, rawInput);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (sub === "pre-tool-use" && result.stdout?.trim()) {
    const answer = parseLastJson(result.stdout);
    const output = answer?.hookSpecificOutput;
    // In an automatic run an advisory comes with no decision, so the host's own
    // permissions decide the call (REQ-hooks-035).
    const advisoryOnly = isPlainObject(answer) && Object.keys(answer).length === 1 && typeof answer.systemMessage === "string" && answer.systemMessage.startsWith("[ospec advisory] ");
    if (!advisoryOnly && (output?.hookEventName !== "PreToolUse" || !["allow", "deny", "ask"].includes(output.permissionDecision) || typeof output.permissionDecisionReason !== "string")) {
      return launcherFailure(sub, "invalid output", cursorHost, rawInput);
    }
  }
  if (sub === "post-tool-use" && result.stdout?.trim()) {
    const output = parseLastJson(result.stdout)?.hookSpecificOutput;
    if (output?.hookEventName !== "PostToolUse" || output.updatedToolOutput === undefined) {
      return launcherFailure(sub, "invalid output", cursorHost, rawInput);
    }
  }
  if (process.env.OSPEC_TARGET === "codex") {
    process.stdout.write(`${JSON.stringify(normalizeCodexHookOutput(sub, parseLastJson(result.stdout)))}\n`);
  } else if (antigravityHost) {
    writeAntigravityHookOutput(normalizeAntigravityHookOutput(sub, parseLastJson(result.stdout)));
  } else if (cursorHost) {
    process.stdout.write(`${JSON.stringify(normalizeCursorHookOutput(sub, parseLastJson(result.stdout)))}\n`);
  } else if (flaggedHost && (sub === "stop" || sub === "session-start") && isPlainObject(parseLastJson(result.stdout))) {
    process.stdout.write(`${JSON.stringify(normalizeFlaggedHostOutput(flaggedHost, sub, parseLastJson(result.stdout)))}\n`);
  } else if (router?.notice) {
    process.stdout.write(withSystemMessage(result.stdout, router.notice));
  } else if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  return result.status == null ? 0 : result.status;
}

function main(argv, scriptDir = __dirname) {
  // launch() records the stdin it read, so an exception still answers in the
  // caller's protocol and the PostToolUse fallback can redact it (OSP-031).
  const seen = { rawInput: "" };
  try {
    return launch(argv, scriptDir, seen);
  } catch (error) {
    return launcherFailure(argv[0], error.code || "launcher error", isCursorHost(scriptDir, process.env, seen.rawInput), seen.rawInput);
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  CONTINUATION,
  SUBCOMMANDS,
  hostFlag,
  normalizeFlaggedHostOutput,
  hostBinarySuffix,
  binaryCandidates,
  resolveBinary,
  resolveInvocation,
  isClaudeCodeHost,
  normalizeCodexHookOutput,
  adaptAntigravityHookInput,
  normalizeAntigravityHookOutput,
  stripUtf8Bom,
  isCursorInstall,
  isCursorHost,
  adaptCursorHookInput,
  normalizeCursorHookOutput,
  withSystemMessage,
  main,
};
