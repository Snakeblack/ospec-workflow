#!/usr/bin/env node

"use strict";

const fs = require("node:fs");
const os = require("node:os");
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
const { extractShellReadPaths, shellTokens } = require("./lib/shell-file-access.js");

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
  // A character outside ASCII but whitespace, so a name may hold `Zoë`. The
  // Go engine reads all of them as one placeholder (internal/rules/rules.go):
  // a pattern names them only through this class or a negated one.
  const NON_ASCII = String.raw`[^\x00-\x7f\s]`;
  const NAME_CHAR = String.raw`(?:[\w:.=@%$-]|${NON_ASCII})`;
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
  // A slash flag never spells a wrapper or `format`, or `/sudo` would also
  // read as `/` + `sudo`, and `/format` at every token would search the target
  // again up to the end of the line.
  const NAME_WORDS = String.raw`sudo|doas|gsudo|cmd|%comspec%|\$env:comspec|start|start-process|call|pnpm|npm|yarn|bun|bunx|iex|invoke-expression|eval|nohup|do|then|else|npx|if|powershell|pwsh|bash|sh|zsh|dash|ksh|xargs|command|builtin|nice|runas|timeout|env|exec|time|wsl`;
  const NOT_NAME = String.raw`(?!(?:(?:${NAME_WORDS})(?:\.cmd|\.exe)?|format(?:\.com|\.exe)?)(?![\w:.=@%$\\-]|${NON_ASCII}))`;
  // A slash flag (`/c`, `/user:x`, Git Bash's `//c`) or a count or duration
  // (`timeout 5`, `1.5m`). A slash flag's value takes a domain, an address or
  // a variable (`/user:CORP\admin`, `/user:a@b`, `/user:%USERDOMAIN%\a`), and
  // no segment after a `\` spells a wrapper either, or `/user:a\sudo` would
  // also read as a path + `sudo`.
  const OPERAND = String.raw`(?:\/\/?${NOT_NAME}${NAME_CHAR}+(?:\\${NOT_NAME}${NAME_CHAR}+)*|\d+(?:\.\d+)?[a-z]?)["']?`;
  // `-ArgumentList`, whose string Start-Process runs, with the launched
  // program's bare flags, spaced or in a comma list (`"-NoProfile -Command …"`,
  // `'-NoProfile','-Command',…`).
  const FLAG_LIST = String.raw`(?:["']?${BARE}["']?(?:${H}+|,${H}*))*`;
  const ARGLIST = String.raw`${ARGS}${H}+${FLAG_LIST}`;
  // An array (`-ArgumentList @('-NoProfile',…)`) crosses its `(`, which also
  // opens a command, so a chain crosses one at most; otherwise the chain of
  // every `(` would run to the end of the line.
  const ARGLIST_ARRAY = String.raw`${ARGS}${H}+@\(${H}*${FLAG_LIST}`;
  // A token ends at whitespace, a comma (`'/c','…'`) or a quote. After
  // whitespace, cmd's doubled quote may open the next token
  // (`cmd /c ""…\format.com" D:"`); glued to the previous token it would also
  // read as that token's closing quote, so `/c""…` is not recognised.
  const SEP = String.raw`(?:${H}+(?:""(?=${WORD}))?|,${H}*|(?=["']))`;
  // A `VAR=value` prefix (`MSYS_NO_PATHCONV=1 cmd …`, `env A=1 …`) or an
  // empty title (`start ""`).
  const PREFIX = String.raw`(?:\w|${NON_ASCII})+=${WORD}*|""|''`;
  const TOKEN = String.raw`["']?(?:${PATH}(?:${NAMED})|${OPERAND})${SEP}|(?:${PREFIX})${SEP}|${ARGLIST}`;
  const START = String.raw`(?:^|[\r\n;&|({\x60])${H}*@?(?:\$(?:[\w:]|${NON_ASCII})+${H}*=${H}*)?`;
  // `format` ends at whitespace, a quote, `(` or `,`, so a word such as
  // `format/format/…` fails at once at each slash. The target is searched up
  // to the next character that opens a command.
  const FORMAT = String.raw`["']?${PATH}format(?:\.com|\.exe)?(?=[\s"'(,])(?!\(\s*[a-z_$][\w$]*\??:\s+[a-z_$])[^\r\n${STOP}]*[\s,(]["']?(?:[a-z]:(?![a-z0-9_])|\\\\\?\\volume\{)`;
  return new RegExp(String.raw`\b(?:clear-disk|format-volume)\b|${START}(?:${QUOTED_PROGRAM}${SEP})?(?:${TOKEN})*(?:${ARGLIST_ARRAY}(?:${TOKEN})*)?${FORMAT}`, "i");
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

// The ospec CLI owns the state of an IDD change, its archive and the review
// receipts (E1.43, ADR 0002): a tool that writes a file never touches them,
// whatever the permission mode. A tool writes when its name says so; a patch
// tool names its files in the patch headers. Shell commands are left to the
// revalidation of ospec close.
const CLI_OWNED_REASON =
  "Bloqueado: este fichero es del CLI de ospec (el estado de un cambio IDD, su archivo, un recibo de review o la cuenta de turnos). Avanza con los comandos de ospec (record, run, check, review, close); no lo edites a mano.";
// copy, append, save and upload cover third-party MCP tools (E1.46).
const WRITE_TOOL_RE = /write|edit|patch|create|replace|insert|delete|remove|move|rename|copy|append|save|upload/;
// A move or a copy names both ends (MCP filesystem move_file); both count.
const OWNED_PATH_KEYS = new Set(["file_path", "filePath", "path", "target_file", "notebook_path", "source", "destination"]);
// The state, and the .tmp and .bak the atomic write leaves, which reading
// the change restores as the state.
const STATE_FILE_RE = /^state\.yaml(?:\.|$)/;
const PATCH_FILE_RE = /^[ \t]*\*\*\* (?:(?:Add|Update|Delete) File|Move to): (.+)$/gm;

function collectStrings(value, found = []) {
  if (typeof value === "string") found.push(value);
  else if (value && typeof value === "object") for (const child of Object.values(value)) collectStrings(child, found);
  return found;
}

// idd/<change>/state.yaml (with its .tmp and .bak), idd/archive/ or
// .ospec/review-receipts/ and anything under them, and the turn count
// .ospec/turns (E1.49), wherever the path holds them and in any case.
function isCliOwnedPath(filePath) {
  const segments = filePath.toLowerCase().split(/[\\/]+/).filter(Boolean);
  return segments.some((segment, index) => {
    const after = segments.length - index - 1;
    if (segment === "idd") return (segments[index + 1] === "archive" && after >= 1) || (after === 2 && STATE_FILE_RE.test(segments[index + 2]));
    return segment === ".ospec" && ((segments[index + 1] === "review-receipts" && after >= 1) || (segments[index + 1] === "turns" && after === 1));
  });
}

function writesCliOwnedFile(input, workspace) {
  const name = normalizeToolName(input?.tool_name);
  if (READ_TOOLS.has(name) || !WRITE_TOOL_RE.test(name)) return false;
  const files = collectKeyedStrings(input?.tool_input, OWNED_PATH_KEYS);
  if (name.includes("patch")) {
    for (const text of collectStrings(input?.tool_input)) files.push(...[...text.matchAll(PATCH_FILE_RE)].map((match) => match[1].trim()));
  }
  return files.some((file) => isCliOwnedPath(path.resolve(workspace, file)));
}

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
    const reason = denyRule?.reason || checkCommitAttribution(command, workspace);
    if (reason) return makeDecision("deny", reason);
  }
  if (writesCliOwnedFile(input, workspace)) return makeDecision("deny", CLI_OWNED_REASON);

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

const ATTRIBUTION_REASON =
  "Bloqueado: el commit o la PR atribuye el trabajo a una IA o herramienta (trailer *-by: que la nombra, «generated with/by …» o 🤖). Nombrar un agente sí está permitido: quita solo la atribución. Consulta rules/no-model-attribution.instructions.md.";

function unreadableStdinReason(program) {
  return `Bloqueado: el mensaje llega por stdin desde \`${program}\`, cuya salida el guard no puede leer para comprobar que el commit o la PR no atribuye el trabajo a una IA o herramienta. Pasa el texto en la propia orden: -m o --body, o -F - / --body-file - con un heredoc.`;
}

function unreadableMessageReason(file) {
  return `Bloqueado: no se pudo leer \`${file}\` para comprobar que el commit o la PR no atribuye el trabajo a una IA o herramienta (no existe, no es un fichero, supera 1 MiB o depende de una variable). Pasa el texto en la propia orden: -m o --body, o -F - / --body-file - con un heredoc.`;
}

// What may come before the program of a simple command: environment
// assignments and reserved words or groups, which the program follows, and
// wrappers, whose options and values end at the first git, gh or shell word.
const ENV_ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;
const RESERVED_WORDS = new Set(["if", "then", "elif", "else", "do", "while", "until", "!", "{", "("]);
const COMMAND_WRAPPERS = new Set(["env", "command", "exec", "sudo", "doas", "nohup", "time", "timeout", "nice", "ionice", "stdbuf", "xargs"]);
const SHELLS = new Set(["sh", "bash", "zsh", "dash", "ksh"]);
const DIRECTORY_COMMANDS = new Set(["cd", "pushd", "popd"]);
// git options before the subcommand that take the next word (-C moves the directory).
const GIT_VALUE_OPTIONS = new Set(["-c", "--git-dir", "--work-tree", "--namespace", "--config-env", "--super-prefix"]);
const GH_PR_VALUE_OPTIONS = new Set(["-R", "--repo"]);
const STDIN_FILES = new Set(["-", "/dev/stdin"]);
// Programs piped into a message read from stdin: file readers, whose files are
// read (with the options that take a value), and printers, whose text is the
// command's own.
const READER_COUNT_OPTIONS = new Set(["-n", "-c", "--lines", "--bytes"]);
const READER_CONTENT_OPTIONS = new Set(["-encoding", "-totalcount", "-tail", "-readcount"]);
const FILE_READERS = new Map([
  ["cat", new Set()], ["tac", new Set()], ["type", new Set()],
  ["head", READER_COUNT_OPTIONS], ["tail", READER_COUNT_OPTIONS],
  ["get-content", READER_CONTENT_OPTIONS], ["gc", READER_CONTENT_OPTIONS],
]);
const PRINTERS = new Set(["echo", "printf"]);
const MAX_SHELL_DEPTH = 2;

/**
 * The commands whose text carries a commit message or a pull request's title,
 * body or comment (attribution-guard-gaps), with the options whose value is message text
 * (skipped when looking for a file) and those whose value names the file that
 * holds it. git takes a unique abbreviation of a long option (`--fil`), gh
 * does not.
 */
const GH_PR_MESSAGE = { text: ["-t", "--title", "-b", "--body", "--subject", "-R", "--repo"], short: ["-F", "-T"], long: ["--body-file", "--template"], abbreviate: false };
const MESSAGE_COMMANDS = new Map([
  ["git commit", { text: ["-m", "--message", "-c", "-C", "--reuse-message", "--reedit-message"], short: ["-F", "-t"], long: ["--file", "--template"], abbreviate: true }],
  ["git merge", { text: ["-m", "--message"], short: ["-F"], long: ["--file"], abbreviate: true }],
  ...["create", "new", "edit", "comment", "review", "merge"].map((sub) => [`gh pr ${sub}`, GH_PR_MESSAGE]),
  // Closing or reopening a pull request posts its -c/--comment.
  ...["close", "reopen"].map((sub) => [`gh pr ${sub}`, { text: ["-c", "--comment"], short: [], long: [], abbreviate: false }]),
]);

// Every quoted string, read apart from the tokenizer.
const QUOTED_RE = /"((?:[^"\\]|\\[\s\S])*)"|'([^']*)'/g;

// The simple commands of a command line: its words split at `;`, `&`, `|` and
// line breaks, without the `)` that closes a subshell on the last word. Each
// keeps apart the files its `<` redirections read, whether a heredoc or a
// here-string feeds it (`stdinText`), and whether a lone `|` pipes the
// previous one into it.
function commandSegments(tokens) {
  const segments = [];
  let current = null;
  let between = "";
  let redirect = null;
  for (const token of tokens) {
    if (token.operator) {
      if (";&|\n".includes(token.value)) {
        current = null;
        between += token.value;
        redirect = null;
      } else {
        redirect = token.value;
      }
      continue;
    }
    if (!current) {
      current = { words: [], inputs: [], stdinText: false, piped: between === "|" };
      segments.push(current);
      between = "";
    }
    if (redirect === null) current.words.push(token);
    else if (redirect === "<") current.inputs.push(token);
    else if (redirect.startsWith("<<")) current.stdinText = true;
    redirect = null;
  }
  for (const { words } of segments) {
    const last = words[words.length - 1];
    if (last && !last.value.includes("(") && last.value.endsWith(")")) words[words.length - 1] = { ...last, value: last.value.replace(/\)+$/, "") };
  }
  return segments;
}

// A command line that only mentions one of those commands, wherever it sits
// (`git … commit|merge`, `gh … pr … <sub>`), still has its text checked
// (decision 1a of attribution-guard-gaps). Searched from the first match on, in linear time.
function mentionsMessageCommand(command) {
  const git = command.search(/\bgit\b/i);
  if (git >= 0 && /\b(?:commit|merge)\b/i.test(command.slice(git))) return true;
  const gh = command.search(/\bgh\b/i);
  if (gh < 0) return false;
  const rest = command.slice(gh);
  const pr = rest.search(/\bpr\b/i);
  return pr >= 0 && /\b(?:create|new|edit|comment|review|merge|close|reopen)\b/i.test(rest.slice(pr));
}

// A program word without its path, a leading `\`, `(`, `{` or `$(`, and `.exe`.
function programName(value) {
  return value.replace(/^[\\$({]+/, "").split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/, "");
}

// The program of a simple command and the words after it, or null.
function simpleCommand(words) {
  let i = 0;
  while (i < words.length && (ENV_ASSIGNMENT_RE.test(words[i].value) || RESERVED_WORDS.has(words[i].value))) i += 1;
  if (i < words.length && COMMAND_WRAPPERS.has(programName(words[i].value))) {
    do i += 1;
    while (i < words.length && !["git", "gh"].includes(programName(words[i].value)) && !SHELLS.has(programName(words[i].value)));
  }
  return i < words.length ? { program: programName(words[i].value), args: words.slice(i + 1) } : null;
}

// The directory a `cd`, `pushd` or `git -C` operand names from `base`, or null
// when it cannot be told (an expansion or an unknown base).
function resolveDirectory(base, word) {
  if (base === null || !word || !word.literal || !word.value) return null;
  const value = word.value === "~" ? os.homedir() : /^~[\\/]/.test(word.value) ? path.join(os.homedir(), word.value.slice(2)) : word.value;
  return path.resolve(base, value);
}

// The directory after a `cd`, `pushd` or `popd` simple command.
function changeDirectory(base, program, args) {
  if (program === "popd") return null;
  const operands = args.filter((word) => !/^-[LPe@]+$/.test(word.value));
  if (operands.length === 0) return program === "cd" ? os.homedir() : null;
  if (operands.length > 1 || operands[0].value === "-") return null;
  return resolveDirectory(base, operands[0]);
}

// The files a file reader reads: its operands, without options and their values.
function readerFiles({ program, args }) {
  const valueOptions = FILE_READERS.get(program);
  const files = [];
  for (let i = 0; i < args.length; i += 1) {
    if (valueOptions.has(args[i].value.toLowerCase())) i += 1;
    else if (!args[i].value.startsWith("-")) files.push(args[i]);
  }
  return files;
}

// The script word of `sh|bash|zsh|dash|ksh [options] -c <script>`, or null.
function shellScript(args) {
  for (let i = 0; i < args.length; i += 1) {
    const { value } = args[i];
    if (value === "-o" || value === "+o") {
      i += 1;
      continue;
    }
    if (!/^-[A-Za-z]+$/.test(value)) return null;
    if (value.includes("c")) return args[i + 1] || null;
  }
  return null;
}

// The message options of a `git commit|merge` or `gh pr <sub>` simple command,
// with the directory git reads its files from (`git -C <dir>`), or null.
function messageTarget({ program, args }, cwd) {
  let i = 0;
  let base = cwd;
  let key = null;
  if (program === "git") {
    while (i < args.length && args[i].value.startsWith("-")) {
      if (args[i].value === "-C") {
        base = resolveDirectory(base, args[i + 1]);
        i += 2;
      } else {
        i += GIT_VALUE_OPTIONS.has(args[i].value) ? 2 : 1;
      }
    }
    key = `git ${args[i]?.value}`;
  } else if (program === "gh" && args[0]?.value === "pr") {
    i = 1;
    while (i < args.length && args[i].value.startsWith("-")) i += GH_PR_VALUE_OPTIONS.has(args[i].value) ? 2 : 1;
    key = `gh pr ${args[i]?.value}`;
  }
  const options = key && MESSAGE_COMMANDS.get(key);
  return options ? { ...options, args: args.slice(i + 1), cwd: base } : null;
}

// The long option of `names` a word names, as written (`--name`, `--name=…`,
// or with `abbreviate` a prefix of at least `--xy` such as `--fil`), or null.
function longOption(value, names, abbreviate) {
  if (!value.startsWith("--")) return null;
  const name = value.split("=", 1)[0];
  const known = names.some((option) => option.startsWith("--") && (option === name || (abbreviate && name.length >= 4 && option.startsWith(name))));
  return known ? name : null;
}

// The words a message option names as its file; a missing value is null.
function messageFiles({ args, text, short, long, abbreviate }) {
  const files = [];
  for (let i = 0; i < args.length; i += 1) {
    const { value, literal } = args[i];
    if (value === "--") break;
    const textOption = text.includes(value) ? value : longOption(value, text, abbreviate);
    if (textOption) {
      if (value === textOption) i += 1;
      continue;
    }
    const option = longOption(value, long, abbreviate) || short.find((name) => value.startsWith(name));
    if (!option) continue;
    if (value === option) {
      files.push(args[i + 1] || null);
      i += 1;
    } else {
      files.push({ value: value.slice(option.length + (option.startsWith("--") ? 1 : 0)), literal });
    }
  }
  return files;
}

// A regular file under 1 MiB, its path resolved against `base` (the directory
// git reads it from; null when unknown) and ~/ against the home directory;
// anything else is null.
function readMessageFile(file, base) {
  if (!file || !file.literal || !file.value) return null;
  const name = /^~[\\/]/.test(file.value) ? path.join(os.homedir(), file.value.slice(2)) : file.value;
  const target = path.isAbsolute(name) ? name : base === null ? null : path.resolve(base, name);
  if (target === null) return null;
  try {
    const stat = fs.statSync(target);
    if (!stat.isFile() || stat.size >= MAX_SCAN_SIZE_BYTES) return null;
    return fs.readFileSync(target, "utf8");
  } catch {
    return null;
  }
}

// printf, echo -e and $'…' escapes: \n, \t, \r, \xHH, \uHHHH, \UHHHHHHHH, \NNN.
const ESCAPE_RE = /\\(?:x([0-9A-Fa-f]{1,2})|u([0-9A-Fa-f]{1,4})|U([0-9A-Fa-f]{1,8})|0?([0-7]{1,3})|([ntr]))/g;

function decodeEscapes(text) {
  return text.replace(ESCAPE_RE, (all, hex, u4, u8, octal, letter) => {
    if (letter) return letter === "n" ? "\n" : letter === "t" ? "\t" : "\r";
    const code = hex !== undefined ? parseInt(hex, 16) : u4 !== undefined ? parseInt(u4, 16) : u8 !== undefined ? parseInt(u8, 16) : parseInt(octal, 8);
    // A surrogate or a code point past Unicode stays as written, as in the Go hook.
    return code <= 0x10ffff && (code < 0xd800 || code > 0xdfff) ? String.fromCodePoint(code) : all;
  });
}

// A text as written and as the shell or git reads it: escapes decoded, the
// backslashes an unquoted word drops dropped, and a `--trailer token=value`
// read as `token: value`.
function hasAttribution(text) {
  return [text, decodeEscapes(text), text.replace(/\\([\s\S])/g, "$1")]
    .some((spelling) => FORBIDDEN_ATTRIBUTION_RE.test(spelling.replace(/^([ \t]*[\w-]+-by)[ \t]*=/gim, "$1:")));
}

/**
 * Checks the message of a `git commit|merge` and the title, body or comment of
 * a `gh pr create|new|edit|comment|review|merge` for forbidden AI/model
 * attribution, wherever it travels (attribution-guard-gaps): the whole command text (heredocs
 * included), its quoted strings and words, the scripts of `sh -c`, the files
 * the message options name, read from the directory git uses (`cd`,
 * `git -C`), and, for a message read from stdin, the file of its `<` or of a
 * file reader piped into it (other programs but echo and printf deny).
 * A bounded literal recognizer, not a shell interpreter: command substitution
 * and variables are not followed, and a file it cannot read is denied
 * (ADR 0008). Returns a denial reason string, or null if clean or not such a
 * command.
 */
function checkCommitAttribution(command, workspace = process.cwd(), depth = 0) {
  if (!/\b(?:git|gh)\b/i.test(command)) return null;
  const tokens = shellTokens(command);
  const targets = [];
  const scripts = [];
  let cwd = workspace;
  let previous = null;
  for (const segment of commandSegments(tokens)) {
    const simple = simpleCommand(segment.words);
    const feeder = segment.piped ? previous : null;
    previous = simple ? { ...simple, cwd } : null;
    if (!simple) continue;
    if (DIRECTORY_COMMANDS.has(simple.program)) {
      cwd = changeDirectory(cwd, simple.program, simple.args);
    } else if (SHELLS.has(simple.program)) {
      const script = shellScript(simple.args);
      if (script) scripts.push({ script: script.value, cwd });
    } else {
      const target = messageTarget(simple, cwd);
      if (target) targets.push({ ...target, shellCwd: cwd, inputs: segment.inputs, stdinText: segment.stdinText, feeder });
    }
  }
  if (targets.length === 0 && scripts.length === 0 && !mentionsMessageCommand(command)) return null;

  const texts = [command];
  for (const match of command.matchAll(QUOTED_RE)) texts.push(match[1] ?? match[2]);
  for (const token of tokens) {
    if (token.operator) continue;
    texts.push(token.value);
    const equals = token.value.indexOf("=");
    if (token.value.startsWith("-") && equals > 0) texts.push(token.value.slice(equals + 1));
  }
  if (texts.some(hasAttribution)) return ATTRIBUTION_REASON;

  if (depth < MAX_SHELL_DEPTH) {
    for (const { script, cwd: directory } of scripts) {
      const reason = checkCommitAttribution(script, directory, depth + 1);
      if (reason) return reason;
    }
  }
  const fromStdin = (file) => Boolean(file && file.literal && STDIN_FILES.has(file.value));
  for (const target of targets) {
    const files = messageFiles(target);
    // Message files are read where git runs (git -C); what feeds stdin, where
    // the shell runs.
    const toRead = files.filter((file) => !fromStdin(file)).map((file) => ({ file, base: target.cwd }));
    if (files.some(fromStdin) && !target.stdinText) {
      if (target.inputs.length > 0) {
        toRead.push(...target.inputs.map((file) => ({ file, base: target.shellCwd })));
      } else if (target.feeder && FILE_READERS.has(target.feeder.program)) {
        toRead.push(...readerFiles(target.feeder).map((file) => ({ file, base: target.feeder.cwd })));
      } else if (target.feeder && !PRINTERS.has(target.feeder.program)) {
        return unreadableStdinReason(target.feeder.program);
      }
    }
    for (const { file, base } of toRead) {
      const content = readMessageFile(file, base);
      if (content === null) return unreadableMessageReason(file?.value || "");
      if (FORBIDDEN_ATTRIBUTION_RE.test(content)) return ATTRIBUTION_REASON;
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
