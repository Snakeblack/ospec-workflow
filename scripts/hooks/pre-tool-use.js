#!/usr/bin/env node

"use strict";

const SHELL_TOOL_NAMES = new Set([
  "runcommand",
  "runinterminal",
  "runterminalcommand",
  "shell",
  "shellcommand",
  "terminal",
]);

const DENY_RULES = [
  {
    pattern:
      /\brm\b(?=[^\r\n;&|]*\s-(?:[a-z]*r[a-z]*f|[a-z]*f[a-z]*r)\b)[^\r\n;&|]*(?:\s\/(?:\s|$)|--no-preserve-root\b)/i,
    reason: "Recursive forced deletion of the filesystem root is blocked.",
  },
  {
    pattern: /\bgit\s+push\b[^\r\n;&|]*(?:--force(?:=|\s|$)|\s-f(?:\s|$))/i,
    reason: "Force-pushing Git history is blocked.",
  },
  {
    pattern:
      /\b(?:curl|wget)\b[^\r\n]*(?:\||\|&)\s*(?:sudo\s+)?(?:sh|bash|zsh|dash|ksh)\b/i,
    reason: "Piping downloaded content directly into a shell is blocked.",
  },
  {
    pattern:
      /\b(?:iwr|irm|invoke-webrequest|invoke-restmethod)\b[^\r\n]*\|\s*(?:iex|invoke-expression)\b/i,
    reason: "Piping downloaded content into PowerShell evaluation is blocked.",
  },
  {
    pattern:
      /\bremove-item\b[^\r\n;&|]*(?=[^\r\n;&|]*\s-(?:recurse|r)\b)(?=[^\r\n;&|]*\s-(?:force|fo)\b)[^\r\n;&|]*(?:[a-z]:\\(?:\s|$)|[a-z]:\/(?:\s|$))/i,
    reason: "Recursive forced deletion of a drive root is blocked.",
  },
  {
    pattern: /\bmkfs(?:\.[a-z0-9_-]+)?\b/i,
    reason: "Formatting a filesystem is blocked.",
  },
  {
    pattern:
      /\bdd\b[^\r\n;&|]*\bof\s*=\s*\/dev\/(?:sd[a-z]|nvme\d+n\d+|vd[a-z]|xvd[a-z]|disk\d+)\b/i,
    reason: "Writing raw data directly to a storage device is blocked.",
  },
  {
    pattern:
      /\b(?:format(?:\.com)?|clear-disk)\b[^\r\n;&|]*(?:[a-z]:|-\s*number\b)/i,
    reason: "Formatting or clearing a disk is blocked.",
  },
];

const ASK_RULES = [
  {
    pattern: /\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|i|ci)\b/i,
    reason: "Dependency installation requires user approval.",
  },
  {
    pattern: /\bgit\s+reset\b[^\r\n;&|]*--hard\b/i,
    reason: "A hard Git reset can discard local changes.",
  },
  {
    pattern: /\bgit\s+clean\b[^\r\n;&|]*\s-[a-z]*f[a-z]*\b/i,
    reason: "Git clean can permanently remove untracked files.",
  },
  {
    pattern: /\bdocker(?:\s+compose|-compose)\s+down\b/i,
    reason: "Stopping and removing Docker Compose resources requires approval.",
  },
  {
    pattern:
      /\brm\b(?=[^\r\n;&|]*\s-(?:[a-z]*r[a-z]*f|[a-z]*f[a-z]*r)\b)/i,
    reason: "Recursive forced deletion requires user approval.",
  },
  {
    pattern:
      /\b(?:chmod|chown)\b[^\r\n;&|]*(?:\s-[a-z]*R[a-z]*\b|\s--recursive\b)/i,
    reason: "Recursive permission or ownership changes require approval.",
  },
  {
    pattern:
      /\bremove-item\b[^\r\n;&|]*(?=[^\r\n;&|]*\s-(?:recurse|r)\b)(?=[^\r\n;&|]*\s-(?:force|fo)\b)/i,
    reason: "Recursive forced deletion requires user approval.",
  },
  {
    pattern: /\b(?:rmdir|rd)\b[^\r\n;&|]*\s\/s\b/i,
    reason: "Recursive directory deletion requires user approval.",
  },
  {
    pattern: /\bgit\s+push\b[^\r\n;&|]*--force-with-lease\b/i,
    reason: "Force-pushing with lease still rewrites remote history.",
  },
  {
    pattern: /\b(?:shutdown|reboot|poweroff|restart-computer)\b/i,
    reason: "Restarting or shutting down the machine requires approval.",
  },
];

function normalizeToolName(toolName) {
  return String(toolName || "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function isShellTool(toolName) {
  return SHELL_TOOL_NAMES.has(normalizeToolName(toolName));
}

function extractCommands(toolInput) {
  if (!toolInput || typeof toolInput !== "object") {
    return [];
  }

  const commands = [];

  if (typeof toolInput.command === "string") {
    commands.push(toolInput.command);
  }

  if (Array.isArray(toolInput.commands)) {
    for (const command of toolInput.commands) {
      if (typeof command === "string") {
        commands.push(command);
      } else if (command && typeof command.command === "string") {
        commands.push(command.command);
      }
    }
  }

  return commands;
}

function findMatchingRule(command, rules) {
  return rules.find(({ pattern }) => pattern.test(command));
}

function makeDecision(permissionDecision, permissionDecisionReason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision,
      permissionDecisionReason,
    },
  };
}

function evaluateToolUse(input) {
  const commands = extractCommands(input?.tool_input);

  if (commands.length === 0) {
    if (!isShellTool(input?.tool_name)) {
      return makeDecision("allow", "Tool did not include a command payload.");
    }

    return makeDecision("allow", "Shell tool did not include a command payload.");
  }

  for (const command of commands) {
    const denyRule = findMatchingRule(command, DENY_RULES);

    if (denyRule) {
      return makeDecision("deny", denyRule.reason);
    }
  }

  for (const command of commands) {
    const askRule = findMatchingRule(command, ASK_RULES);

    if (askRule) {
      return makeDecision("ask", askRule.reason);
    }
  }

  return makeDecision("allow", "Command payload passed the safety policy.");
}

async function readJsonInput(stream = process.stdin) {
  const chunks = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const input = Buffer.concat(chunks).toString("utf8").trim();
  return input ? JSON.parse(input) : {};
}

async function main() {
  try {
    const decision = evaluateToolUse(await readJsonInput());
    process.stdout.write(`${JSON.stringify(decision)}\n`);
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify(
        makeDecision(
          "ask",
          `The safety hook could not inspect this tool call: ${error.message}`,
        ),
      )}\n`,
    );
  }
}

if (require.main === module) {
  void main();
}

module.exports = {
  ASK_RULES,
  DENY_RULES,
  evaluateToolUse,
  extractCommands,
  isShellTool,
  normalizeToolName,
};
