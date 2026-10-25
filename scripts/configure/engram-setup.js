"use strict";

// Automatic, non-authoritative Engram session-memory step shared by every global
// installer (`setup:claude`, `setup:codex`, `setup:antigravity`, `setup:opencode`,
// `setup:cursor`, `setup:vscode`, `setup:copilot`; engram-per-target, adr-20261003-001).
// ospec composes with the official upstream Engram integration: generated output
// never carries an Engram MCP entry or memory hook. This module only (1) detects
// what is installed for the target host, (2) plans the registration action and
// (3) runs it — by default whenever the engram binary is on PATH; `--no-engram`
// turns the step off. Without the binary it only prints install guidance: it never
// downloads Engram. With it, a read-only check names a newer upstream release and
// how to upgrade (REQ-install-043); it never upgrades anything.
//
// Each host needs the `mem_*` MCP server plus a piece that delivers the memory
// protocol. For hosts with an upstream `engram setup <agent>` (idempotent, adds
// whichever piece is missing) that command is the single mutating action:
//   claude      -> claude-code      `claude mcp list` + `engram@engram` plugin (hooks)
//   codex       -> codex            [mcp_servers.engram] in config.toml + Codex plugin
//   antigravity -> antigravity-cli  ~/.gemini/config/mcp_config.json + GEMINI.md block
//   opencode    -> opencode         opencode.json(c) `mcp.engram` + plugins/engram.ts
//   cursor      -> cursor           ~/.cursor/mcp.json + engram-memory-protocol.md
//                                  projected to rules/engram-memory-protocol.mdc
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
// CreateProcess does not read a script shebang. Upstream hooks.json launches some
// .sh files directly, so Windows opens them with the associated program. A bare
// `bash` is no better: Claude runs hooks in PowerShell when it finds no Git Bash,
// and there `bash` resolves to the WSL launcher, where the Windows engram binary
// does not exist. Once Claude is configured, every .sh hook command and every
// command led by a bare bash or sh in the installed engram@engram plugin is
// rewritten to exec form (`command` = absolute bash.exe, `args` = the words), so
// no shell sits in between. The launcher is the Git Bash the fork probe uses, or
// else a bash.exe on PATH that is not the WSL launcher; with neither the hooks are
// left alone. The patch does not depend on the probe's verdict: without bash the
// script never starts, safe mode included.
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
const { createReporter, splitVerbose } = require("./install-output.js");
const { prepareUserModels } = require("../lib/user-models.js");

const MARKETPLACE_NAME = "engram";
// E1.9: the step is the last phase of every installer's common output.
const ENGRAM_PHASE = "Memoria Engram";
const SETUP_TIMEOUT_MS = 120000;
const SAFE_MODE_VAR = "ENGRAM_CLAUDE_WINDOWS_BASH_SAFE_MODE";
const ENGRAM_PLUGIN_ID = "engram@engram";
const BASH_NAMES = new Set(["bash", "bash.exe"]);
const SH_NAMES = new Set(["sh", "sh.exe"]);
const WSL_BASH_RE = /[\\/](?:system32|sysnative|windowsapps)[\\/]bash\.exe$/i;
// A double-quoted or plain word; `${NAME}` placeholders are the only expansion a
// command may hold to be rewritten, since exec form runs no shell.
const HOOK_WORD_RE = /\s*(?:"((?:[^"\\$`]|\$\{\w+\})*)"|((?:[^\s"'\\$`|&;<>()]|\$\{\w+\})+))/y;
// The upstream hook's full path forks dirname, date, jq and curl on every prompt.
// Three rounds must finish well under the time a user would notice on submit.
const FORK_PROBE_SCRIPT = "for i in 1 2 3; do dirname /a/b; date +%s; jq -n 1; curl --version; done >/dev/null";
const FORK_PROBE_TIMEOUT_MS = 5000;
const FORK_PROBE_BUDGET_MS = 1500;
// The update notice asks the same endpoint engram's own check uses and honors its
// opt-out variable. A child node process does the request so the step stays
// synchronous; the spawn timeout bounds it.
const ENGRAM_REPO = "Gentleman-Programming/engram";
const UPDATE_CHECK_VAR = "ENGRAM_NO_UPDATE_CHECK";
const UPDATE_CHECK_TIMEOUT_MS = 3000;
const LATEST_RELEASE_SCRIPT = `fetch("https://api.github.com/repos/${ENGRAM_REPO}/releases/latest", { headers: { accept: "application/vnd.github+json", "user-agent": "ospec-workflow" } })
  .then((res) => (res.ok ? res.json() : Promise.reject(new Error("HTTP " + res.status))))
  .then((release) => process.stdout.write(String(release.tag_name || "")))
  .catch((error) => { process.stderr.write(String(error.message || error)); process.exitCode = 1; });`;
const RELEASE_VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)(-[\w.]+)?(?:\+[\w.]+)?$/;

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
  // `engram setup` and the Copilot merge both reject a blank JSON file.
  const prepare = detection.blankMcpFile ? [{ id: "init-mcp-json", kind: "init-json", file: detection.blankMcpFile }] : [];
  if (agent) return [...prepare, { id: `setup-${agent}`, kind: "spawn", bin: detection.binary.bin, argv: ["setup", agent] }];
  return [...prepare, {
    id: "register-copilot-mcp",
    kind: "mcp-json",
    file: copilotMcpFile(homedir),
    entry: { type: "stdio", command: detection.binary.bin, args: ["mcp", "--tools=agent"] },
  }];
}

function describe(action) {
  if (action.kind === "init-json") return `escribir {} en ${action.file}, que estaba vacío`;
  return action.kind === "mcp-json" ? `registrar el MCP de engram en ${action.file}` : `${action.bin} ${action.argv.join(" ")}`;
}

function missingPieces(spec, detection) {
  return [
    detection.protocol !== "registered" && detection.protocol !== NOT_APPLICABLE ? spec.protocol : null,
    detection.mcp !== "registered" ? "servidor MCP" : null,
  ].filter(Boolean);
}

const CURSOR_RULE_DESCRIPTION = "Engram persistent memory: when to save, search and close a session.";

// Cursor loads ~/.cursor/rules/*.mdc when the frontmatter is valid. Upstream
// `engram setup cursor` only writes the protocol markdown, which /rule ignores.
// Project that body into an always-apply global rule. Fail-open, like the rest
// of this step: a missing file is the unconfigured case; empty or unreadable
// content warns and skips the write.
function cursorMemoryRule(body) {
  return `---\ndescription: "${CURSOR_RULE_DESCRIPTION}"\nalwaysApply: true\n---\n\n${body}`;
}

function projectCursorMemoryRule({ fs: fsImpl, homedir, stdout, stderr }) {
  const cursor = path.join(homedir(), ".cursor");
  const source = path.join(cursor, "engram-memory-protocol.md");
  const dest = path.join(cursor, "rules", "engram-memory-protocol.mdc");
  let body;
  try {
    const raw = fsImpl.readFileSync(source);
    body = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    stderr.write(`aviso: no se pudo leer ${source} (${error && error.message}); no se escribe la regla de Cursor.\n`);
    return;
  }
  if (!String(body).trim()) {
    stderr.write(`aviso: ${source} está vacío; no se escribe la regla de Cursor.\n`);
    return;
  }
  const rule = cursorMemoryRule(body);
  try {
    let current = null;
    try {
      const existing = fsImpl.readFileSync(dest);
      current = Buffer.isBuffer(existing) ? existing.toString("utf8") : String(existing);
    } catch (error) {
      if (!error || error.code !== "ENOENT") throw error;
    }
    if (current === rule) return;
    if (typeof fsImpl.mkdirSync === "function") fsImpl.mkdirSync(path.dirname(dest), { recursive: true });
    fsImpl.writeFileSync(dest, rule);
    stdout.write(`  - Regla de Engram escrita en ${dest} (Always Apply, global).\n`);
  } catch (error) {
    stderr.write(`aviso: no se pudo escribir la regla de Cursor en ${dest} (${error && error.message}); se continúa.\n`);
  }
}

function manualFix(spec) {
  return spec.agent ? `\`engram setup ${spec.agent}\`` : "`npm run setup:copilot` con el binario engram en el PATH";
}

function guidance(spec, detection, enabled) {
  const lines = [];
  if (!detection.binary.found) {
    lines.push(
      "  - No se encontró el binario engram. La memoria de sesión es opcional; ospec-workflow funciona sin ella.",
      `    Para activarla: instala Engram (https://github.com/Gentleman-Programming/engram) y vuelve a ejecutar \`npm run ${spec.script}\`.`,
    );
    if (spec.host === "claude") lines.push("    Los hooks del plugin upstream necesitan bash, jq y curl (Git Bash en Windows).");
  } else if (spec.agent === "codex" && detection.lifecycle !== "available") {
    const detail = detection.lifecycle === "unsupported" ? "no es compatible con" : "no pudo verificar";
    lines.push(
      `  - Engram ${detection.binary.version || "(binario)"} ${detail} los comandos de ciclo de vida de Codex: ${CODEX_LIFECYCLE.join(", ")}.`,
      ...(detection.lifecycleChecks || []).filter((check) => check.state !== "available")
        .map((check) => `    engram hook ${check.action}: ${check.state} (${check.reason}).`),
      "    Que el plugin y el MCP estén presentes no confirma el registro de la sesión en ejecución; setup no puede reparar una incompatibilidad de ciclo de vida.",
      "    Usa un binario de Engram compatible y ejecuta `engram setup codex` en el CODEX_HOME activo del host (incluido un home de runtime gestionado).",
      "    Reinicia o reanuda Codex y comprueba que el hook SessionStart confirma su identidad de ejecución antes de escrituras atribuidas al agente.",
    );
  } else if (isConfigured(detection) && spec.agent === "codex") {
    lines.push(
      "  - El plugin y el MCP de Engram están presentes para Codex; esta comprobación estática no verifica el registro de la sesión.",
      "    Los comandos de ciclo de vida están disponibles. Comprueba que SessionStart, al arrancar o al reanudar (resume), confirma una identidad de ejecución antes de escrituras atribuidas al agente.",
    );
  } else if (isConfigured(detection)) {
    lines.push(`  - Engram ya está configurado para ${spec.label}; nada que hacer.`);
  } else if (isUnknown(detection)) {
    lines.push(`  - Hay binario engram, pero no se pudo leer el estado de memoria de ${spec.label}; no se ha cambiado nada.`);
    if (spec.host) lines.push(`    Comprueba que la CLI \`${spec.host}\` está en el PATH y vuelve a ejecutar \`npm run ${spec.script}\`.`);
  } else if (!enabled) {
    lines.push(
      `  - Engram no está configurado para ${spec.label} (falta: ${missingPieces(spec, detection).join(", ")}); omitido por --no-engram.`,
      `    Ejecuta ${manualFix(spec)} o vuelve a ejecutar \`npm run ${spec.script}\` sin --no-engram.`,
    );
  }
  if (detection.binary.found && spec.agent === "codex") {
    lines.push("    Ante `Hook failed`, recoge el evento del hook, el comando, el código de salida y stderr; un aviso del doctor sobre todo el almacén no identifica el hook que falló.");
  }
  return lines.length ? `${lines.join("\n")}\n` : "";
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
  if (action.kind === "init-json") {
    try {
      // Re-read: only a file that is still blank is replaced.
      if (fsImpl.readFileSync(action.file, "utf8").trim()) return "the file is no longer blank";
      fsImpl.writeFileSync(action.file, "{}\n", "utf8");
      return null;
    } catch (error) {
      return error.code || error.message;
    }
  }
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

function windowsSafeModeStep({ bash, spawn, fs: fsImpl, homedir, env, now, stdout, stderr }) {
  const settingsFile = path.join(homedir(), ".claude", "settings.json");
  const settings = readJsonObject(fsImpl, settingsFile);
  if (!settings.ok) {
    stderr.write(`aviso: no se puede leer ${settingsFile} (${settings.reason}); el modo seguro de Windows de Engram se deja como está.\n`);
    return;
  }
  const userValue = settings.value.env && Object.hasOwn(settings.value.env, SAFE_MODE_VAR)
    ? settings.value.env[SAFE_MODE_VAR]
    : env[SAFE_MODE_VAR];
  if (userValue !== undefined) {
    stdout.write(`  - Modo seguro de Windows: ${SAFE_MODE_VAR}=${userValue} ya está definido; se deja igual.\n`);
    return;
  }

  if (!bash) {
    stdout.write("  - Se mantiene el modo seguro de Windows: no se encontró Git Bash, así que la captura de prompts y los recordatorios de guardado siguen desactivados.\n");
    return;
  }
  const started = now();
  const probe = safeSpawn(spawn, bash, ["-c", FORK_PROBE_SCRIPT], FORK_PROBE_TIMEOUT_MS);
  const elapsed = now() - started;
  if (probe.error || probe.status !== 0 || elapsed > FORK_PROBE_BUDGET_MS) {
    const reason = probe.error || probe.status !== 0 ? "falló la sonda de fork (falta jq/curl o está bloqueado)" : `los fork son lentos (${elapsed} ms)`;
    stdout.write(
      `  - Se mantiene el modo seguro de Windows: ${reason}. La captura de prompts y los recordatorios de guardado siguen desactivados para evitar bloqueos.\n` +
        `    Para forzarlos, define ${SAFE_MODE_VAR}=0 en el bloque env de ${settingsFile}.\n`,
    );
    return;
  }

  try {
    writeJsonObject(fsImpl, settingsFile, { ...settings.value, env: { ...(settings.value.env || {}), [SAFE_MODE_VAR]: "0" } });
  } catch (error) {
    stderr.write(`aviso: no se puede escribir ${settingsFile} (${error.code || error.message}); el modo seguro de Windows de Engram se deja como está.\n`);
    return;
  }
  stdout.write(
    `  - Modo seguro de Windows desactivado (sonda de fork ${elapsed} ms): ${SAFE_MODE_VAR}=0 escrito en ${settingsFile}.\n` +
      "    La captura de prompts y los recordatorios de guardado se activan en las nuevas sesiones de Claude Code; quita la línea si los prompts empiezan a ir lentos.\n",
  );
}

// --- Windows: launch upstream .sh hooks with an absolute bash -----------------

function commandBasename(executable) {
  const normalized = String(executable).replace(/\\/g, "/");
  const slash = normalized.lastIndexOf("/");
  return (slash === -1 ? normalized : normalized.slice(slash + 1)).toLowerCase();
}

function forwardSlashes(file) {
  return String(file).replace(/\\/g, "/");
}

function pathBash({ fs: fsImpl, env }) {
  for (const dir of String(env.PATH || env.Path || "").split(path.delimiter).filter(Boolean)) {
    const file = path.join(dir, "bash.exe");
    if (probeExists(fsImpl, file) === "registered") return file;
  }
  return null;
}

// { bash, sh } as absolute paths (sh is null without a sibling sh.exe), or
// { reason } when no bash is safe to launch the hooks with.
function hookLauncher({ gitBash, fs: fsImpl, env }) {
  const bash = gitBash || pathBash({ fs: fsImpl, env });
  if (!bash) return { reason: "no se encontró Git Bash ni un bash.exe en el PATH" };
  if (!gitBash && WSL_BASH_RE.test(bash)) return { reason: `no se encontró Git Bash y el bash del PATH (${bash}) es el lanzador de WSL` };
  const sh = bash.replace(/bash\.exe$/i, "sh.exe");
  const hasSh = sh !== bash && probeExists(fsImpl, sh) === "registered";
  return { bash: forwardSlashes(bash), sh: hasSh ? forwardSlashes(sh) : null };
}

// The words of a shell-form command, or null when it uses any shell syntax.
function hookWords(command) {
  const text = command.trimEnd();
  const words = [];
  HOOK_WORD_RE.lastIndex = 0;
  while (HOOK_WORD_RE.lastIndex < text.length) {
    const match = HOOK_WORD_RE.exec(text);
    if (!match) return null;
    words.push(match[1] ?? match[2]);
  }
  return words;
}

function execLaunch(command, launcher) {
  if (typeof command !== "string") return null;
  const words = hookWords(command);
  if (!words || words.length === 0) return null;
  const [first, ...rest] = words;
  const name = first.toLowerCase();
  if (BASH_NAMES.has(name)) return rest.length ? { command: launcher.bash, args: rest } : null;
  if (SH_NAMES.has(name)) return rest.length && launcher.sh ? { command: launcher.sh, args: rest } : null;
  return commandBasename(first).endsWith(".sh") ? { command: launcher.bash, args: words } : null;
}

function launchShellHooks(node, launcher) {
  if (Array.isArray(node)) return node.reduce((count, item) => count + launchShellHooks(item, launcher), 0);
  if (!node || typeof node !== "object") return 0;
  let count = 0;
  const exec = Object.hasOwn(node, "args") ? null : execLaunch(node.command, launcher);
  if (exec) {
    node.command = exec.command;
    node.args = exec.args;
    count += 1;
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === "object") count += launchShellHooks(value, launcher);
  }
  return count;
}

function engramHookFiles(fsImpl, homedir) {
  const registry = path.join(homedir(), ".claude", "plugins", "installed_plugins.json");
  const presence = probeExists(fsImpl, registry);
  if (presence === "absent") return { ok: false, missing: true, file: registry, hooks: [] };
  if (presence !== "registered") return { ok: false, reason: "unreadable", file: registry, hooks: [] };
  const doc = readJsonObject(fsImpl, registry);
  if (!doc.ok) return { ok: false, reason: doc.reason, file: registry, hooks: [] };
  const plugins = doc.value.plugins;
  if (!plugins || typeof plugins !== "object" || Array.isArray(plugins) || !Object.hasOwn(plugins, ENGRAM_PLUGIN_ID)) {
    return { ok: true, file: registry, hooks: [] };
  }
  const entries = plugins[ENGRAM_PLUGIN_ID];
  if (!Array.isArray(entries)) return { ok: false, reason: "engram@engram is not an install list", file: registry, hooks: [] };
  const hooks = [];
  for (const entry of entries) {
    if (!entry || typeof entry.installPath !== "string" || entry.installPath.trim() === "") continue;
    hooks.push(path.join(entry.installPath, "hooks", "hooks.json"));
  }
  return { ok: true, file: registry, hooks };
}

function patchHookFile(fsImpl, file, launcher, stdout, stderr) {
  const presence = probeExists(fsImpl, file);
  if (presence !== "registered") {
    stderr.write(`aviso: no está ${file}; los hooks .sh de Engram se dejan como están.\n`);
    return;
  }
  const doc = readJsonObject(fsImpl, file);
  if (!doc.ok) {
    stderr.write(`aviso: no se puede leer ${file} (${doc.reason}); los hooks .sh de Engram se dejan como están.\n`);
    return;
  }
  const changed = launchShellHooks(doc.value, launcher);
  if (changed === 0) {
    stdout.write(`  - Los hooks .sh de Engram no necesitan cambios (${file}).\n`);
    return;
  }
  try {
    writeJsonObject(fsImpl, file, doc.value);
  } catch (error) {
    stderr.write(`aviso: no se puede escribir ${file} (${error.code || error.message}); los hooks .sh de Engram se dejan como están.\n`);
    return;
  }
  stdout.write(`  - Hooks .sh de Engram: ${changed} comando(s) ahora arrancan con ${launcher.bash} (${file}).\n`);
}

function windowsBashHooksStep({ launcher, fs: fsImpl, homedir, stdout, stderr }) {
  const found = engramHookFiles(fsImpl, homedir);
  if (!found.ok) {
    const reason = found.missing ? "no existe" : found.reason;
    stderr.write(`aviso: no se puede leer ${found.file} (${reason}); los hooks .sh de Engram se dejan como están.\n`);
    return;
  }
  if (found.hooks.length === 0) {
    stdout.write("  - No hay una instalación engram@engram en el registro de plugins; no se parchean hooks .sh.\n");
    return;
  }
  if (!launcher.bash) {
    stderr.write(
      `aviso: ${launcher.reason}; los hooks .sh de Engram necesitan Git Bash en Windows y se dejan como están.\n` +
        "  Instala Git for Windows (o define CLAUDE_CODE_GIT_BASH_PATH) y vuelve a ejecutar `npm run setup:claude`.\n",
    );
    return;
  }
  for (const file of found.hooks) patchHookFile(fsImpl, file, launcher, stdout, stderr);
}

// --- update notice -----------------------------------------------------------

// [major, minor, patch, prerelease] or null; `go install` builds report "dev".
function parseRelease(version) {
  const match = RELEASE_VERSION_RE.exec(String(version || "").trim());
  return match ? [Number(match[1]), Number(match[2]), Number(match[3]), match[4] || ""] : null;
}

// A prerelease of the same version is older than the release itself.
function isNewer(latest, installed) {
  for (let index = 0; index < 3; index += 1) {
    if (latest[index] !== installed[index]) return latest[index] > installed[index];
  }
  return installed[3] !== "" && latest[3] === "";
}

// The binary the PATH resolves, followed through its symlinks (Homebrew links
// bin/engram into its Cellar). null when it cannot be found.
function resolveBinary(bin, { fs: fsImpl, env }) {
  for (const dir of String(env.PATH || "").split(path.delimiter).filter(Boolean)) {
    const file = path.join(dir, bin);
    if (probeExists(fsImpl, file) !== "registered") continue;
    try {
      return { dir, real: typeof fsImpl.realpathSync === "function" ? fsImpl.realpathSync(file) : file };
    } catch {
      return { dir, real: file };
    }
  }
  return null;
}

// How to upgrade depends on how engram was installed; the release page otherwise.
// The tap also carries a legacy `engram` cask: Homebrew 7 loads it for a bare name
// and refuses it while the tap is untrusted, so the formula is named in full.
function upgradeHint(binary, latest, tag, { fs: fsImpl, env, homedir }) {
  const found = resolveBinary(binary.bin, { fs: fsImpl, env });
  if (found && /[\\/]Cellar[\\/]engram[\\/]/.test(found.real)) return "`brew upgrade --formula gentleman-programming/tap/engram`";
  const goBins = [env.GOBIN, ...String(env.GOPATH || path.join(homedir(), "go")).split(path.delimiter).filter(Boolean).map((dir) => path.join(dir, "bin"))];
  if (found && goBins.some((dir) => dir && path.resolve(dir) === path.resolve(found.dir))) {
    const major = latest[0] >= 2 ? `/v${latest[0]}` : "";
    return `\`go install github.com/${ENGRAM_REPO}${major}/cmd/engram@latest\``;
  }
  return `https://github.com/${ENGRAM_REPO}/releases/tag/${tag}`;
}

// Read-only and fail-open: prints one line when a newer release exists, nothing
// when engram is up to date or newer, and a --verbose note when the check fails.
function updateNoticeStep({ binary, spawn, fs: fsImpl, env, homedir, stdout, detail }) {
  if (!binary.found || String(env[UPDATE_CHECK_VAR] || "").trim()) return;
  const installed = parseRelease(binary.version);
  if (!installed) return;
  const result = safeSpawn(spawn, process.execPath, ["-e", LATEST_RELEASE_SCRIPT], UPDATE_CHECK_TIMEOUT_MS);
  const tag = String(result.stdout || "").trim();
  const latest = parseRelease(tag);
  if (result.error || result.status !== 0 || !latest) {
    const reason = result.error ? result.error.code || result.error.message
      : result.status !== 0 ? String(result.stderr || "").trim().split("\n")[0] || `exit ${result.status}`
        : "respuesta ilegible";
    detail.write(`  - No se pudo comprobar si hay una versión nueva de engram (${reason}).\n`);
    return;
  }
  if (!isNewer(latest, installed)) return;
  const hint = upgradeHint(binary, latest, tag, { fs: fsImpl, env, homedir });
  stdout.write(`  - engram ${binary.version} instalado, ${tag.replace(/^v/, "")} disponible: actualiza con ${hint}.\n`);
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
  detail = { write() { return true; } },
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  try {
    const spec = targetSpec(target);
    const enabled = !(Array.isArray(argv) && argv.includes("--no-engram"));
    const probe = () => detectEngram({ target, spawn, hostBin: hostBin || claudeBin, fs: fsImpl, homedir, env, platform, timeoutMs, includeDoctor: false });
    const detection = probe();
    if (enabled) updateNoticeStep({ binary: detection.binary, spawn, fs: fsImpl, env, homedir, stdout, detail });

    const plan = planEngramActions(detection, { enabled, homedir });
    let configured = isConfigured(detection);
    if (plan.length === 0) {
      stdout.write(guidance(spec, detection, enabled));
    } else {
      stdout.write(`  Configurando la memoria Engram para ${spec.label} (desactívala con --no-engram):\n`);
      for (const action of plan) {
        const failure = runAction(action, { spawn, fs: fsImpl });
        if (failure) {
          stderr.write(`aviso: \`${describe(action)}\` falló (${failure}); se continúa. Engram es opcional.\n`);
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
        stdout.write(`  - Engram configurado para ${spec.label}. Reinicia ${spec.label} para cargar las herramientas mem_*.\n`);
      } else {
        stderr.write(
          `aviso: Engram sigue incompleto para ${spec.label} (falta: ${missingPieces(spec, after).join(", ") || "estado ilegible"}).\n` +
            `  Ejecuta ${manualFix(spec)} a mano y revisa su salida. Engram es opcional.\n`,
        );
      }
    }

    if (enabled && target === "cursor") {
      projectCursorMemoryRule({ fs: fsImpl, homedir, stdout, stderr });
    }
    if (enabled && configured && target === "claude" && platform === "win32") {
      const gitBash = findGitBash({ spawn, fs: fsImpl, env, timeoutMs });
      windowsSafeModeStep({ bash: gitBash, spawn, fs: fsImpl, homedir, env, now, stdout, stderr });
      windowsBashHooksStep({ launcher: hookLauncher({ gitBash, fs: fsImpl, env }), fs: fsImpl, homedir, stdout, stderr });
    }
  } catch (error) {
    try {
      stderr.write(`aviso: paso Engram omitido (${error && error.message}); se continúa.\n`);
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
//
// E1.9: the wrapper also owns the common output. It consumes `--verbose`, hands
// the installer a reporter (`deps.reporter`), runs the step as the last phase
// and prints the final summary.
function withEngramStep(target, install, { eligible = () => true, hostBin = () => null } = {}) {
  targetSpec(target);
  return function main(argv = process.argv.slice(2), deps = {}) {
    const { verbose, argv: raw } = splitVerbose(argv);
    // `--model <tier>=<model>` is consumed here too (E4.12): the installer gets
    // the host's assignment in deps.models, and a dry run saves nothing.
    // A test that fakes the home also gets a clean environment, so it never
    // reads the developer's own assignment.
    const userModelsOptions = deps.userModelsOptions || (deps.homedir ? { homedir: deps.homedir, env: deps.env || {} } : {});
    const models = prepareUserModels(raw.filter((arg) => arg !== "--no-engram" && arg !== "--with-engram"), target, {
      ...userModelsOptions,
      persist: !raw.includes("--dry-run"),
    });
    const forwarded = models.argv;
    const stdout = deps.stdout || process.stdout;
    const stderr = deps.stderr || process.stderr;
    let runStep = false;
    if (typeof deps.engramStep === "function") {
      try {
        runStep = Boolean(eligible(forwarded, deps));
      } catch (error) {
        stderr.write(`aviso: paso Engram omitido (${error.message}); se continúa.\n`);
      }
    }
    const reporter = deps.reporter || createReporter({ target, stdout, stderr, verbose, trailing: runStep ? [ENGRAM_PHASE] : [] });
    if (models.error) {
      reporter.err.write(`error: ${models.error}\n`);
      return reporter.finish(2);
    }
    let exitCode;
    try {
      exitCode = install(forwarded, { ...deps, reporter, models });
    } catch (error) {
      reporter.err.write(`error: ${(verbose && error && error.stack) || (error && error.message) || error}\n`);
      exitCode = 1;
    }
    if (exitCode === 0 && runStep) {
      reporter.begin(ENGRAM_PHASE);
      try {
        deps.engramStep({ target, argv: raw, hostBin: hostBin(deps), stdout: reporter.out, stderr: reporter.err, detail: reporter.detail });
      } catch (error) {
        reporter.err.write(`aviso: paso Engram omitido (${error.message}); se continúa.\n`);
      }
    }
    return reporter.finish(exitCode);
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
  ENGRAM_PHASE,
};
