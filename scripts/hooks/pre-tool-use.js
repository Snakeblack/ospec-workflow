#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { mkdirOspec } = require("../lib/ospec-gitignore.js");
const {
  resolveGitState,
  isRiskyAction,
  composeAdvisory,
} = require("./lib/git-state.js");
const {
  detectSpecDrift,
  readStagedFiles,
  matchesGlobs,
} = require("../lib/ospec-state.js");
const {
  classifySensitiveFile,
  scanContentForSecrets,
  scanFileForSecrets,
  MAX_SCAN_SIZE_BYTES,
} = require("./lib/secret-scan.js");
const { containsRedactionMarker, isCoveredByRedaction, redactSecrets } = require("./lib/secret-redact.js");
const { extractShellReadPaths } = require("./lib/shell-file-access.js");

/**
 * Regex that matches forbidden AI/model attribution: a `*-by:` trailer that
 * names an AI or coding tool, a "generated with/by <tool>" phrase (English or
 * Spanish, the tool within three words), or 🤖. Naming an agent is not
 * attribution, so `fix(claude): …` or a human Co-Authored-By pass.
 * Must stay in sync with commit-msg-hook.js, internal/hooks/pretooluse.go and
 * rules/no-model-attribution.instructions.md.
 * Tool names are anchored at word boundaries so ordinary words that merely
 * contain one (coherente/cohere, bombardeo/bard, llaman/llama) never fire.
 */
const FORBIDDEN_ATTRIBUTION_RE =
  /^[ \t]*[\w-]+-by:.*\b(?:claude|anthropic|opus|sonnet|haiku|fable|gpt|chatgpt|openai|codex|copilot|gemini|bard|llama|mistral|cohere|antigravity|agy|cursor|windsurf|kiro|opencode|qwen|deepseek|grok|devin|aider|cline|junie|amp)\b|\b(?:generated|written|created|made|built|authored|assisted|powered|produced|generad[oa]s?|escrit[oa]s?|cread[oa]s?|hech[oa]s?|asistid[oa]s?|producid[oa]s?)\s+(?:with|by|using|con|por)\W+(?:\w+\W+){0,3}?(?:claude|anthropic|opus|sonnet|haiku|fable|gpt|chatgpt|openai|codex|copilot|gemini|bard|llama|mistral|cohere|antigravity|agy|cursor|windsurf|kiro|opencode|qwen|deepseek|grok|devin|aider|cline|junie|amp)\b|🤖/im;

/** Matches `git commit` commands — used to scope Step 5c (spec drift advisory). */
const GIT_COMMIT_RE = /\bgit\s+commit\b/i;

const SHELL_TOOL_NAMES = new Set([
  "runcommand",
  "runinterminal",
  "runterminalcommand",
  "shell",
  "shellcommand",
  "terminal",
]);

/**
 * The disk rule (#407): `Clear-Disk` and `Format-Volume` in any position, and
 * `format` (or `format.com`/`.exe`) with a drive or volume target only as the
 * command. It is the command when it opens the input or follows a separator
 * or `$x=`, after a chain of wrappers that run their operand, each maybe
 * quoted or with a path. As an argument (`rg format`, `dotnet format`) or in
 * `Format-Table` it is not. Quotes and heredocs are not parsed.
 * Every token boundary has one reading and no token crosses a character that
 * opens a command, so the match stays linear in the command length.
 */
const DISK_FORMAT_RE = (() => {
  const H = String.raw`[^\S\r\n]`;
  const STOP = String.raw`;&|(){}\x60`;
  // No whitespace, quote, comma or command opener: a token never swallows
  // the boundary of the next one.
  const WORD = String.raw`[^\s"',${STOP}]`;
  const VALUE_START = String.raw`[^\s"',${STOP}-]`;
  const QUOTED = String.raw`"[^"\r\n${STOP}]*"`;
  // `-ArgumentList` is never a wrapper's own flag: it is a token of the chain.
  const ARGS = String.raw`-(?:argumentlist|args)`;
  const BARE = String.raw`(?!${ARGS}(?![\w:.=-]))-[\w:.=-]+`;
  // Start-Process's valued flags, read after the launched program too
  // (`Start-Process cmd -WindowStyle Hidden …`).
  const LAUNCH_VALUED = String.raw`windowstyle|verb|workingdirectory|credential|redirectstandard\w+`;
  // `valued` names the flags that take a value; before one it is never a bare flag.
  const flags = (valued) => {
    const names = valued ? `${LAUNCH_VALUED}|${valued}` : LAUNCH_VALUED;
    return String.raw`(?:${H}+(?:-(?:${names})${H}+${VALUE_START}${WORD}*|(?!-(?:${names})${H}+${VALUE_START})${BARE}))*`;
  };
  // [name, flags] of each wrapper that runs its operand.
  const WRAPPERS = [
    [String.raw`(?:sudo|doas|gsudo)(?:\.exe)?`, flags("[ugrtcd]")],
    [String.raw`cmd(?:\.exe)?|%comspec%|\$env:comspec`, flags()],
    ["start-process", flags()],
    ["start", flags()],
    [String.raw`call|pnpm(?:\.cmd|\.exe)?|(?:npm|yarn)(?:\.cmd|\.exe)?${H}+(?:exec|dlx)|bun(?:\.exe)?${H}+(?:run|x)|bunx(?:\.cmd|\.exe)?|iex|invoke-expression|eval|nohup(?:\.exe)?|do|then|else|!`, flags()],
    [String.raw`npx(?:\.cmd|\.exe)?`, flags("p|-package")],
    [String.raw`if(?:${H}+\/i)?(?:${H}+not)?${H}+(?:(?:exist|defined)${H}+(?:${QUOTED}|${WORD}+)|errorlevel${H}+\d+|(?:${QUOTED}|[^\s"',=${STOP}]+)==(?:${QUOTED}|${WORD}+))`, flags()],
    [String.raw`(?:powershell|pwsh)(?:\.exe)?`, flags("ep|ex|executionpolicy|w|wd|configurationname|settingsfile|of|outputformat|if|inputformat|version|v")],
    [String.raw`(?:bash|sh|zsh|dash|ksh)(?:\.exe)?`, flags("o")],
    [String.raw`xargs(?:\.exe)?`, flags("[idnplsea]")],
    [String.raw`command|builtin|(?:nice|runas|timeout)(?:\.exe)?`, flags("s|k")],
    [String.raw`env(?:\.exe)?`, flags("u|c")],
    ["exec", flags("a")],
    ["time", flags("f")],
    [String.raw`wsl(?:\.exe)?`, flags("d|u|-distribution|-user|-cd")],
  ];
  // The name, the quote that may close it, and the flags.
  const NAMED = WRAPPERS.map(([name, f]) => String.raw`(?:${name})["']?${f}`).join("|");
  // A quoted program path with spaces and balanced parentheses
  // (`"…\Program Files (x86)\…\pwsh.exe"`) only opens the chain, and its quote
  // closes right after the name.
  const QUOTED_PROGRAM = String.raw`["'](?:[^"'\r\n${STOP}]|\([^"'\r\n${STOP}]*\))*[\/\\](?:${WRAPPERS.map(([name, f]) => String.raw`(?:${name})["']${f}`).join("|")})`;
  // No `=` in a path, or `A=x/env` would also read as an `env` assignment.
  const PATH = String.raw`(?:[^\s"',=${STOP}]*[\/\\])?`;
  // A slash flag never spells a wrapper, or `/sudo` would also read as `/` + `sudo`.
  const NAME_WORDS = String.raw`sudo|doas|gsudo|cmd|%comspec%|start|start-process|call|pnpm|npm|yarn|bun|bunx|iex|invoke-expression|eval|nohup|do|then|else|npx|if|powershell|pwsh|bash|sh|zsh|dash|ksh|xargs|command|builtin|nice|runas|timeout|env|exec|time|wsl`;
  // A slash flag (`/c`, `/user:x`, Git Bash's `//c`) or a count or duration
  // (`timeout 5`, `1.5m`).
  const OPERAND = String.raw`(?:\/\/?(?!(?:${NAME_WORDS})(?:\.cmd|\.exe)?(?![\w:.=-]))[\w:.=-]+|\d+(?:\.\d+)?[a-z]?)["']?`;
  // `-ArgumentList`, whose string Start-Process runs, with the launched
  // program's bare flags, spaced or in a comma list (`"-NoProfile -Command …"`,
  // `'-NoProfile','-Command',…`).
  const ARGLIST = String.raw`${ARGS}${H}+(?:@\(${H}*)?(?:["']?${BARE}["']?(?:${H}+|,${H}*))*`;
  // A token ends at whitespace, a comma (`'/c','…'`) or a quote.
  const SEP = String.raw`(?:${H}+|,${H}*|(?=["']))`;
  // A `VAR=value` prefix (`MSYS_NO_PATHCONV=1 cmd …`, `env A=1 …`) or an
  // empty title (`start ""`).
  const PREFIX = String.raw`\w+=${WORD}*|""|''`;
  const TOKEN = String.raw`["']?(?:${PATH}(?:${NAMED})|${OPERAND})${SEP}|(?:${PREFIX})${SEP}|${ARGLIST}`;
  const START = String.raw`(?:^|[\r\n;&|({\x60])${H}*@?(?:\$[\w:]+${H}*=${H}*)?`;
  // `format` ends at whitespace, a quote, `(` or `,`, so a word such as
  // `format/format/…` fails at once at each slash. The target is searched up
  // to the next character that opens a command.
  const FORMAT = String.raw`["']?${PATH}format(?:\.com|\.exe)?(?=[\s"'(,])(?!\(\s*[a-z_$][\w$]*\??:\s+[a-z_$])[^\r\n${STOP}]*[\s,(]["']?(?:[a-z]:(?![a-z0-9_])|\\\\\?\\volume\{)`;
  return new RegExp(String.raw`\b(?:clear-disk|format-volume)\b|${START}(?:${QUOTED_PROGRAM}${SEP})?(?:${TOKEN})*${FORMAT}`, "i");
})();

const DENY_RULES = [
  {
    pattern:
      /\brm\b(?=[^\r\n;&|]*\s-[a-z]*r)(?=[^\r\n;&|]*\s-[a-z]*f)[^\r\n;&|]*(?:\s\/(?:\s|$)|--no-preserve-root\b)/i,
    reason: "Recursive forced deletion of the filesystem root is blocked.",
  },
  {
    pattern: /\bgit\s+push\b[^\r\n;&|]*(?:--force(?:=|\s|$)|\s-f(?:\s|$)|\s\+[^\s;&|]+)/i,
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
    pattern: DISK_FORMAT_RE,
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
      /\brm\b(?=[^\r\n;&|]*\s-[a-z]*r)(?=[^\r\n;&|]*\s-[a-z]*f)/i,
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
  {
    pattern:
      /\b(?:curl|wget)\b[^\r\n;&|]*\s(?:-o|-O|--output)\b[^;&|\r\n]*[;&]{1,2}\s*(?:sudo\s+)?(?:sh|bash|zsh|dash|ksh)\b/i,
    reason: "Downloading a file and then executing a shell requires user approval.",
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

// Claude and VS Code use snake_case argument names; OpenCode uses camelCase.
const DECLARED_PATH_KEYS = new Set(["file_path", "filePath", "path", "target_file", "notebook_path"]);
const CONTENT_KEYS = new Set(["content", "contents", "new_string", "newString", "new_str", "old_string", "oldString", "text"]);
// Tools whose result is only what they read; anything else (writes, MCP
// uploads) may move a file without its content passing through PostToolUse.
const READ_TOOLS = new Set(["read", "grep", "glob", "ls", "list", "viewfile", "notebookread"]);

function collectKeyedStrings(value, keys, found = []) {
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string" && keys.has(key)) found.push(child);
    else if (child && typeof child === "object") collectKeyedStrings(child, keys, found);
  }
  return found;
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

// Without an objection the hook stays silent: an affirmative `allow` would skip
// the host's own permission prompt and rules (OSP-017). main() writes nothing.
const NO_DECISION = null;

function makeDecision(permissionDecision, permissionDecisionReason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision,
      permissionDecisionReason,
    },
  };
}

const MARKER_OVERWRITE_REASON =
  "Bloqueado: el contenido lleva el marcador [REDACTED:…] de ospec y el fichero destino guarda secretos reales; escribirlo los destruiría. Edita solo las líneas sin secretos, o pide al usuario que cambie el valor.";

function readSmallFile(filePath) {
  try {
    if (fs.statSync(filePath).size >= MAX_SCAN_SIZE_BYTES) return null;
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

// True when the file on disk holds something the output redaction would hide.
function fileHoldsSecrets(filePath) {
  const content = readSmallFile(filePath);
  const sensitiveFile = classifySensitiveFile(filePath) !== null;
  return content !== null && redactSecrets(content, { sensitiveFile }).kinds.length > 0;
}

// The read exemption holds only when the redacted content leaves nothing the
// secret scan would still ask about (an unreadable or oversized file asks).
function readCoveredByRedaction(filePath) {
  const content = readSmallFile(filePath);
  return content !== null && isCoveredByRedaction(content, { sensitiveFile: classifySensitiveFile(filePath) !== null });
}

// Operands of a shell command that may name a file it writes.
function shellOperands(command) {
  return command.split(/[ \t\r\n\f\v;|&<>"'`]+/).filter(Boolean);
}

function extractPaths(obj) {
  const paths = [];
  function traverse(current) {
    if (!current) return;
    if (typeof current === "string") {
      let cleaned = current.replace(/^file:\/\/\/?/, "");
      try {
        if (fs.existsSync(cleaned) && fs.statSync(cleaned).isFile()) {
          paths.push(path.resolve(cleaned));
        } else {
          const relative = path.join(process.cwd(), cleaned);
          if (fs.existsSync(relative) && fs.statSync(relative).isFile()) {
            paths.push(path.resolve(relative));
          }
        }
      } catch (err) {
        // ignore
      }
    } else if (typeof current === "object") {
      for (const key in current) {
        if (Object.prototype.hasOwnProperty.call(current, key)) {
          traverse(current[key]);
        }
      }
    }
  }
  traverse(obj);
  return paths;
}

const CODE_EXTENSIONS = new Set([
  ".js", ".go", ".json", ".yaml", ".yml", ".md", ".ts", ".py", ".txt", ".rs", ".c", ".cpp", ".h", ".html", ".css"
]);

function estimateTokens(filePath) {
  try {
    const stats = fs.statSync(filePath);
    const bytes = stats.size;
    const ext = path.extname(filePath).toLowerCase();
    if (CODE_EXTENSIONS.has(ext)) {
      return Math.round(bytes / 4);
    } else {
      return Math.round((bytes / 6) * 1.3);
    }
  } catch (err) {
    return 0;
  }
}

function findActiveChangeNameSync() {
  const changesRoot = path.join(process.cwd(), "openspec", "changes");
  try {
    if (!fs.existsSync(changesRoot)) return "unknown";
    const entries = fs.readdirSync(changesRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name !== "archive") {
        const statePath = path.join(changesRoot, entry.name, "state.yaml");
        if (fs.existsSync(statePath)) {
          const content = fs.readFileSync(statePath, "utf8");
          if (content.includes("status: active")) {
            return entry.name;
          }
        }
      }
    }
  } catch (err) {
    // ignore
  }
  return "unknown";
}

function getCumulativeTokensSync(changeName) {
  if (changeName === "unknown") return 0;
  const logPath = path.join(process.cwd(), ".ospec", "session", changeName, "token-events.jsonl");
  try {
    if (!fs.existsSync(logPath)) return 0;
    const content = fs.readFileSync(logPath, "utf8");
    let total = 0;
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) {
        try {
          const obj = JSON.parse(trimmed);
          if (typeof obj.t === "number") {
            total += obj.t;
          }
        } catch (e) {
          // ignore
        }
      }
    }
    return total;
  } catch (err) {
    return 0;
  }
}

function recordTokensSync(changeName, tokens) {
  if (changeName === "unknown" || tokens <= 0) return;
  const logDir = path.join(process.cwd(), ".ospec", "session", changeName);
  const logPath = path.join(logDir, "token-events.jsonl");
  try {
    mkdirOspec(logDir);
    fs.appendFileSync(logPath, JSON.stringify({ t: tokens, ts: Date.now() }) + "\n", "utf8");
  } catch (err) {
    // ignore
  }
}

/**
 * Degrades advisory `ask` decisions to `allow` + top-level systemMessage when
 * the session runs in bypassPermissions: a hook `ask` overrides the user's
 * chosen permission mode, so keeping it would re-introduce the prompts the
 * user explicitly opted out of. `deny` decisions are the hard safety floor
 * and are never degraded.
 */
function applyPermissionMode(result, permissionMode) {
  // REQ-hooks-005: on the codex target, ASK is unsupported by the host. The
  // wrapper signals this via TWO env vars that must both be present:
  // OSPEC_TARGET=codex (target selector) AND OSPEC_CODEX_WRAPPER=1 (a
  // per-invocation marker the codex-generated hooks.json command inlines
  // directly on the command line — see codexHooks in
  // scripts/lib/target-transform.js). Requiring both closes the gap where a
  // leftover shell export, CI env var, or repo .env auto-loaded OSPEC_TARGET
  // alone into an unrelated session would silently degrade every ASK-class
  // decision there too; OSPEC_CODEX_WRAPPER is set fresh by the wrapper's
  // own command string for that single invocation, not inherited ambient
  // state. DENY (Step 5) is untouched by this check either way.
  const codexWrapper =
    process.env.OSPEC_TARGET === "codex" && process.env.OSPEC_CODEX_WRAPPER === "1";
  const bypassEquivalent = permissionMode === "bypassPermissions" || codexWrapper;
  if (!bypassEquivalent) {
    return result;
  }
  const output = result && result.hookSpecificOutput;
  if (!output || output.permissionDecision !== "ask") {
    return result;
  }
  return {
    systemMessage: `[ospec advisory] ${output.permissionDecisionReason}`,
    hookSpecificOutput: {
      hookEventName: output.hookEventName,
      permissionDecision: "allow",
      permissionDecisionReason: output.permissionDecisionReason,
    },
  };
}

function evaluateToolUse(input, opts) {
  return applyPermissionMode(
    evaluateToolUseCore(input, opts),
    input && input.permission_mode
  );
}

function evaluateToolUseCore(input, opts) {
  const injectedGitRunner = opts && opts.gitRunner ? opts.gitRunner : undefined;
  const workspace = (opts && opts.workspace) || process.cwd();
  const commands = extractCommands(input?.tool_input);
  // A secret advisory must never hide a hard command denial, including bypass.
  for (const command of commands) {
    const denyRule = findMatchingRule(command, DENY_RULES);
    const reason = denyRule?.reason || checkCommitAttribution(command);
    if (reason) return makeDecision("deny", reason);
  }

  if (process.env.DISABLE_AGENT_SHIELD !== "true") {
    const paths = [
      ...extractPaths(input?.tool_input),
      ...collectKeyedStrings(input?.tool_input, DECLARED_PATH_KEYS).map((file) => path.resolve(workspace, file)),
      ...commands.flatMap(extractShellReadPaths).map((file) => path.resolve(workspace, file)),
    ];
    // Evaluate every hard file denial before any secret advisory.
    for (const filePath of paths) {
      if (classifySensitiveFile(filePath)?.action === "deny") {
        return makeDecision("deny", "Acceso denegado: El archivo es una clave privada o configuración sensible del sistema y no puede ser leído por el agente.");
      }
    }
    const bodies = collectKeyedStrings(input?.tool_input, CONTENT_KEYS);
    // A redaction marker copied back over a file that keeps real secrets
    // would destroy them: a hard denial, never degraded.
    const targets = [
      ...(bodies.some(containsRedactionMarker) ? collectKeyedStrings(input?.tool_input, DECLARED_PATH_KEYS) : []),
      ...commands.filter(containsRedactionMarker).flatMap(shellOperands),
    ];
    for (const file of targets) {
      if (fileHoldsSecrets(path.resolve(workspace, file))) {
        return makeDecision("deny", MARKER_OVERWRITE_REASON);
      }
    }
    // With output redaction (the launcher's --output-redaction flag) the
    // model only ever sees the redacted result of a read tool, so a read
    // whose content the redaction fully covers needs no prompt. A shell
    // command keeps it: its output may leave the machine instead of reaching
    // the model.
    const readsRedacted = process.env.OSPEC_OUTPUT_REDACTION === "1"
      && process.env.DISABLE_SECRET_REDACTION !== "true"
      && commands.length === 0
      && READ_TOOLS.has(normalizeToolName(input?.tool_name));
    for (const filePath of paths) {
      if (readsRedacted && readCoveredByRedaction(filePath)) continue;
      // Bloqueo/advertencia por nombre de archivo
      const classification = classifySensitiveFile(filePath);
      if (classification && classification.action === "ask") {
        return makeDecision(
          "ask",
          `Advertencia de seguridad: Se detectó un posible archivo de entorno o secreto. ¿Está seguro de permitir su lectura?`
        );
      }

      // Escaneo de contenido (tokens conocidos + credenciales genéricas)
      if (scanFileForSecrets(filePath).matched) {
        return makeDecision(
          "ask",
          `Advertencia de seguridad: El contenido de este archivo parece contener credenciales o tokens. ¿Está seguro de permitir su lectura?`
        );
      }
    }
    for (const body of bodies) {
      if (scanContentForSecrets(body).matched) {
        return makeDecision(
          "ask",
          `Advertencia de seguridad: El contenido de este archivo parece contener credenciales o tokens. ¿Está seguro de permitir su lectura?`
        );
      }
    }
  }

  if (process.env.DISABLE_TOKEN_ADVISOR !== "true") {
    const paths = extractPaths(input?.tool_input);
    let currentTokens = 0;
    for (const filePath of paths) {
      currentTokens += estimateTokens(filePath);
    }

    if (currentTokens > 50000) {
      return makeDecision(
        "ask",
        `El archivo solicitado excede el límite de tokens sugerido de 50,000 (${currentTokens.toLocaleString()} tokens estimados). ¿Desea continuar con su lectura?`
      );
    }

    const changeName = findActiveChangeNameSync();
    const cumulativeTokens = getCumulativeTokensSync(changeName);
    if (cumulativeTokens + currentTokens > 150000) {
      return makeDecision(
        "ask",
        `El consumo acumulado de tokens de la sesión (${(cumulativeTokens + currentTokens).toLocaleString()} tokens) excede el umbral crítico de 150,000 tokens. Se recomienda forzar una compactación antes de continuar.`
      );
    }

    if (currentTokens > 0) {
      recordTokensSync(changeName, currentTokens);
    }
  }

  // Step 5b — Git collaboration guard (fires only for git commit commands;
  // file-write tools no longer trigger it on their own — see git-state.js).
  if (process.env.DISABLE_GIT_COLLABORATION_GUARD !== "true") {
    if (isRiskyAction(commands)) {
      const gitState = resolveGitState(injectedGitRunner);
      const onDefault =
        gitState.defaultBranch !== null &&
        gitState.currentBranch !== null &&
        gitState.defaultBranch === gitState.currentBranch;
      if (onDefault || gitState.dirty === true) {
        const advisory = composeAdvisory(
          onDefault,
          gitState.dirty,
          gitState.currentBranch
        );
        return makeDecision("ask", advisory);
      }
    }
  }

  // No commands present — no objection, so no decision (OSP-017).
  // Step 5b only ever fires for commands matching `git commit`, so tools with
  // no command payload (Edit, Write, etc.) always fall through to here.
  if (commands.length === 0) {
    return NO_DECISION;
  }

  // Step 5c — Spec drift advisory (always `ask`, never `deny`). Independently
  // gated by DISABLE_SPEC_DRIFT_GUARD — the same single kill switch shared
  // with SessionStart's specDrift block (see specs/hooks/spec.md). Hooks are
  // stateless per-invocation processes, so this step independently invokes
  // detectSpecDrift/readStagedFiles rather than reusing SessionStart's result.
  // Wrapped so any git/manifest failure is advisory-only and falls through to
  // Step 6 instead of blocking the tool call.
  if (process.env.DISABLE_SPEC_DRIFT_GUARD !== "true") {
    const hasCommitCommand = commands.some((command) =>
      GIT_COMMIT_RE.test(command)
    );

    if (hasCommitCommand) {
      try {
        const drift = detectSpecDrift({ workspace, gitRunner: injectedGitRunner });

        if (drift) {
          // Best-effort: when staged-file resolution fails, treat it as an
          // empty set (no overlap ⇒ no false fire) rather than throwing.
          const staged = readStagedFiles(injectedGitRunner) ?? [];
          const hits = drift.domains.filter((domain) =>
            staged.some((file) => matchesGlobs(file, domain.sources))
          );

          if (hits.length > 0) {
            const names = hits.map((domain) => domain.domain).join(", ");
            return makeDecision(
              "ask",
              `Vas a commitear con dominios de especificación derivados: ${names}. Considera ejecutar /sdd-reconcile antes de continuar.`
            );
          }
        }
      } catch (_e) {
        // Advisory only — fall through to Step 6 on any failure.
      }
    }
  }

  // Step 6 — ASK rules.
  for (const command of commands) {
    const askRule = findMatchingRule(command, ASK_RULES);
    if (askRule) {
      return makeDecision("ask", askRule.reason);
    }
  }

  return NO_DECISION;
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
    if (decision !== NO_DECISION) {
      process.stdout.write(`${JSON.stringify(decision)}\n`);
    }
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

/**
 * The commands whose text arguments carry a commit message or a pull
 * request: `git commit -m/--message` and `gh pr create|edit -t/--title/-b/--body`.
 */
const ATTRIBUTION_TEXT_COMMANDS = [
  { command: /\bgit\s+commit\b/i, args: /(?:-m|--message)(?:=|\s+)(?:"([^"]*)"|'([^']*)'|([^\s;|&]+))/gi },
  { command: /\bgh\s+pr\s+(?:create|edit)\b/i, args: /(?:-t|--title|-b|--body)(?:=|\s+)(?:"([^"]*)"|'([^']*)'|([^\s;|&]+))/gi },
];

/**
 * Extracts the message of a `git commit` or the title and body of a
 * `gh pr create|edit` command string and checks them for forbidden AI/model
 * attribution.
 * Returns a denial reason string if attribution is found, or null if clean.
 */
function checkCommitAttribution(command) {
  const target = ATTRIBUTION_TEXT_COMMANDS.find((entry) => entry.command.test(command));
  if (!target) {
    return null;
  }

  // An argument may appear several times (one -m per paragraph).
  for (const match of command.matchAll(target.args)) {
    const text = match[1] ?? match[2] ?? match[3] ?? "";
    if (FORBIDDEN_ATTRIBUTION_RE.test(text)) {
      return `Bloqueado: el commit o la PR atribuye el trabajo a una IA o herramienta (trailer *-by: que la nombra, «generated with/by …» o 🤖). Nombrar un agente sí está permitido: quita solo la atribución. Consulta rules/no-model-attribution.instructions.md.`;
    }
  }

  return null;
}

if (require.main === module) {
  void main();
}

module.exports = {
  ASK_RULES,
  DENY_RULES,
  FORBIDDEN_ATTRIBUTION_RE,
  checkCommitAttribution,
  evaluateToolUse,
  extractCommands,
  isShellTool,
  isRiskyAction,
  normalizeToolName,
  findActiveChangeNameSync,
};
