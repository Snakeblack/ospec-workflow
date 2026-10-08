"use strict";

// `ospec doctor` (openspec/specs/idd/spec.md, REQ-idd-019): a read-only
// diagnosis of the installed hosts and the project. Every check reports a
// status (ok, info, warn, error); warnings and errors carry their cause and the
// action that fixes them. Nothing here writes: state files are parsed, never
// read through the store (which recovers interrupted writes), and the only
// processes spawned are `git check-ignore` and the read-only Engram probes.
//
// The Claude Code checks live here; the other six hosts, in ospec-doctor-hosts.js.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { DEFAULT_MODE, STATE_FILE, resolveMode, validateState } = require("./idd-contract.js");
const { CONFIG_FILE, CONFIG_KEYS, IddConfigError, parseIddConfig } = require("./idd-config.js");
const { statusOf } = require("./idd-next.js");
const { TARGETS: ENGRAM_TARGETS, isConfigured, isUnknown, detectEngram, parseJsonc } = require("./engram-detect.js");
const { binaryCandidates, hostBinarySuffix } = require("../hooks/ospec-hooks-launch.js");
const hosts = require("./ospec-doctor-hosts.js");

const DOCTOR_TARGETS = ["claude", ...hosts.HOST_TARGETS];
const ROUTER_BEGIN = "<!-- ospec-workflow:router:begin -->";
const ROUTER_END = "<!-- ospec-workflow:router:end -->";
// E0.4: what a host loads before any work starts must fit in 4 KB per target.
const ALWAYS_ON_BUDGET_BYTES = 4000;
const HOOK_GUARDS = [
  "DISABLE_AGENT_SHIELD",
  "DISABLE_GIT_COLLABORATION_GUARD",
  "DISABLE_OSPEC_ATTRIBUTION_CHECK",
  "DISABLE_OSPEC_PRECOMMIT",
  "DISABLE_SPEC_DRIFT_GUARD",
  "DISABLE_TOKEN_ADVISOR",
];
const SKILL_REFERENCE = /ospec-workflow:(?:sdd-orchestrator|idd)\b/;
const SDD_AGENT = /^sdd-[a-z0-9-]+\.md$/;
const ENGRAM_TIMEOUT_MS = 30000;

class DoctorUsageError extends Error {
  constructor(message) {
    super(message);
    this.code = "usage";
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  } catch {
    return null;
  }
}

function readJson(file) {
  const text = readText(file);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function listDirs(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

function defaultSpawn(bin, args, options = {}) {
  return spawnSync(bin, args, { encoding: "utf8", shell: false, ...options });
}

// The version of the plugin or checkout the running CLI belongs to.
function runtimeVersion(runtimeRoot) {
  const plugin = readJson(path.join(runtimeRoot, ".claude-plugin", "plugin.json"));
  if (plugin?.version) return plugin.version;
  const pkg = readJson(path.join(runtimeRoot, "package.json"));
  return pkg?.name === "ospec-workflow" ? pkg.version : null;
}

function checkoutVersion(root) {
  const pkg = readJson(path.join(root, "package.json"));
  if (pkg?.name !== "ospec-workflow" || !fs.existsSync(path.join(root, "scripts", "configure", "cli.js"))) return null;
  return pkg.version;
}

function findRouterBlock(text) {
  const start = text.indexOf(ROUTER_BEGIN);
  if (start === -1) return null;
  const end = text.indexOf(ROUTER_END, start);
  if (end === -1) return null;
  const stop = end + ROUTER_END.length;
  return {
    body: text.slice(start + ROUTER_BEGIN.length, end).trim(),
    bytes: Buffer.byteLength(`${text.slice(start, stop)}\n`),
    outside: text.slice(0, start) + text.slice(stop),
  };
}

// --- Claude Code --------------------------------------------------------------

function detectClaude(home) {
  const file = path.join(home, ".claude", "plugins", "installed_plugins.json");
  if (!fs.existsSync(file)) return null;
  const doc = readJson(file);
  if (!doc || typeof doc.plugins !== "object") return { file, installs: [], unreadable: true };
  const installs = [];
  for (const [id, entries] of Object.entries(doc.plugins)) {
    if (!id.startsWith("ospec-workflow@") || !Array.isArray(entries)) continue;
    for (const entry of entries) installs.push({ id, scope: entry.scope, version: entry.version, installPath: entry.installPath });
  }
  if (installs.length === 0) return null;
  for (const install of installs) {
    const manifest = install.installPath ? readJson(path.join(install.installPath, ".claude-plugin", "plugin.json")) : null;
    install.valid = Boolean(manifest);
    if (manifest?.version) install.version = manifest.version;
  }
  return { file, installs, primary: installs.find((install) => install.valid) || null };
}

function hasSddPackage(installPath) {
  try {
    return fs.readdirSync(path.join(installPath, "agents")).some((name) => SDD_AGENT.test(name));
  } catch {
    return false;
  }
}

// The same lookup as setup:claude: an npm `.cmd` shim cannot be spawned without
// a shell, so on Windows the WinGet package's claude.exe is the fallback.
function resolveClaudeBin({ spawn, env, platform }) {
  const candidates = ["claude", "claude.exe", "claude.cmd"];
  if (platform === "win32" && env.LOCALAPPDATA) {
    const packages = path.join(env.LOCALAPPDATA, "Microsoft", "WinGet", "Packages");
    for (const entry of listDirs(packages).filter((name) => name.startsWith("Anthropic.ClaudeCode"))) {
      candidates.push(path.join(packages, entry, "claude.exe"));
    }
  }
  for (const bin of candidates) {
    const result = spawn(bin, ["--version"], { timeout: 10000 }) || {};
    if (!result.error && result.status === 0) return bin;
  }
  return null;
}

function claudePluginChecks(claude, add) {
  const label = (install) => `${install.id} (${install.scope || "?"}, ${install.version || "?"})`;
  const broken = claude.installs.filter((install) => !install.valid);
  if (claude.unreadable || broken.length) {
    add({
      id: "plugin",
      status: "error",
      cause: claude.unreadable
        ? `${claude.file} is not readable JSON`
        : broken.map((install) => `${label(install)} points to ${install.installPath}, which has no .claude-plugin/plugin.json`).join("; "),
      action: "Reinstall the plugin: `npm run setup:claude` in the ospec-workflow checkout, or `claude plugin install ospec-workflow@<marketplace>`.",
    });
  } else if (claude.installs.length > 1) {
    add({
      id: "plugin",
      status: "warn",
      detail: claude.primary.version,
      cause: `${claude.installs.length} installations: ${claude.installs.map(label).join(", ")}; Claude Code may load the outdated one`,
      action: "Keep one: `claude plugin uninstall <id> --scope <scope>` for the others.",
    });
  } else {
    add({ id: "plugin", status: "ok", detail: claude.primary.version });
  }
}

function claudeHookChecks(primary, { platform, arch }, add) {
  const hooksJson = readText(path.join(primary.installPath, "hooks", "hooks.json"));
  const hooksDir = path.join(primary.installPath, "scripts", "hooks");
  if (!hooksJson || !hooksJson.includes("ospec-hooks-launch.js") || !fs.existsSync(path.join(hooksDir, "ospec-hooks-launch.js"))) {
    add({
      id: "hooks",
      status: "error",
      cause: `the installed plugin has no hooks/hooks.json wired to scripts/hooks/ospec-hooks-launch.js (${primary.installPath})`,
      action: "Reinstall the plugin (`npm run setup:claude`); without hooks there is no session memory, guard or token advisor.",
    });
    return;
  }
  const native = binaryCandidates(hooksDir, hostBinarySuffix(platform, arch)).some((file) => fs.existsSync(file));
  add(native
    ? { id: "hooks", status: "ok" }
    : {
        id: "hooks",
        status: "info",
        detail: `no native ospec-hooks binary for ${platform}/${arch}; hooks run on the Node fallback`,
        action: "Install from the marketplace release, or copy a built ospec-hooks binary into scripts/hooks/, for faster hooks.",
      });
}

function claudeRouterChecks(primary, home, add) {
  const claudeMd = path.join(home, ".claude", "CLAUDE.md");
  const text = readText(claudeMd) || "";
  const block = findRouterBlock(text);
  const source = readText(path.join(primary.installPath, "global-instructions", "CLAUDE.md"));
  if (!block) {
    add({
      id: "router",
      status: "warn",
      cause: `${claudeMd} has no ospec router block, so IDD is not the default flow in Claude Code`,
      action: "Run `npm run setup:claude` in the ospec-workflow checkout; it writes the block (`--no-router` removes it).",
    });
  } else if (source !== null && block.body !== source.trim()) {
    add({
      id: "router",
      status: "warn",
      cause: `the router block in ${claudeMd} differs from the router of the installed plugin (${primary.version})`,
      action: "Run `npm run setup:claude` to rewrite the block from the installed plugin.",
    });
  } else {
    add({ id: "router", status: "ok" });
  }
  const outside = block ? block.outside : text;
  const reference = SKILL_REFERENCE.exec(outside);
  add(reference
    ? {
        id: "router-duplicate",
        status: "warn",
        cause: `text outside the router block in ${claudeMd} also loads ospec skills (${reference[0]}), duplicating the router`,
        action: "Remove that section from ~/.claude/CLAUDE.md; the router block already routes IDD and SDD.",
      }
    : { id: "router-duplicate", status: "ok" });
  add(block && block.bytes > ALWAYS_ON_BUDGET_BYTES
    ? {
        id: "budget",
        status: "warn",
        detail: `${block.bytes} B`,
        cause: `the router block is ${block.bytes} B, over the ${ALWAYS_ON_BUDGET_BYTES} B always-on budget of E0.4`,
        action: "Reinstall the current router (`npm run setup:claude`); if it is still over budget, report it.",
      }
    : { id: "budget", status: "ok", detail: `${block ? block.bytes : 0} B` });
}

function claudeEngramCheck({ spawn, home, env, platform }, add) {
  const detection = detectEngram({
    target: "claude",
    spawn,
    hostBin: resolveClaudeBin({ spawn, env, platform }),
    homedir: () => home,
    env,
    platform,
    timeoutMs: ENGRAM_TIMEOUT_MS,
  });
  if (!detection.binary.found) {
    add({
      id: "engram",
      status: "info",
      detail: "engram binary not found; session memory is optional",
      action: "To enable it, install Engram and run `npm run setup:claude` again.",
    });
  } else if (isUnknown(detection)) {
    add({
      id: "engram",
      status: "warn",
      cause: "the Claude Code plugin or MCP list could not be read",
      action: "Make sure the `claude` CLI is on PATH and run `ospec doctor` again.",
    });
  } else if (!isConfigured(detection)) {
    const missing = [detection.protocol !== "registered" ? "engram@engram plugin" : null, detection.mcp !== "registered" ? "MCP server" : null].filter(Boolean);
    add({
      id: "engram",
      status: "warn",
      cause: `Engram ${detection.binary.version || ""} is installed but Claude Code lacks: ${missing.join(", ")}`.replace("  ", " "),
      action: "Run `engram setup claude-code`.",
    });
  } else if (detection.doctor === "warn" || detection.doctor === "error") {
    add({ id: "engram", status: "warn", cause: `\`engram doctor\` reports ${detection.doctor}`, action: "Run `engram doctor` and follow its advice." });
  } else {
    add({ id: "engram", status: "ok", detail: detection.binary.version || "" });
  }
}

// --- Engram on the other hosts ------------------------------------------------

// Engram binaries are probed once for every host: `engram version` and
// `engram doctor` answer the same whichever host asks.
function sharedEngramSpawn(spawn) {
  const cache = new Map();
  return (bin, args, options) => {
    if (!/^engram(?:\.exe)?$/i.test(path.basename(String(bin))) || args[0] === "hook") return spawn(bin, args, options);
    const key = [bin, ...args].join("\0");
    if (!cache.has(key)) cache.set(key, spawn(bin, args, options));
    return cache.get(key);
  };
}

// The Codex CLI lists its plugins (the Engram protocol). On Windows npm installs
// a `.cmd` shim that cannot be spawned without a shell: run its JS entry instead.
function resolveCodexBin({ spawn, env, platform, execPath }) {
  const candidates = ["codex"];
  if (platform === "win32") {
    for (const dir of String(env.PATH || env.Path || "").split(";").filter(Boolean)) {
      const exe = path.join(dir, "codex.exe");
      if (fs.existsSync(exe)) candidates.push(exe);
      const entry = path.join(dir, "node_modules", "@openai", "codex", "bin", "codex.js");
      if (fs.existsSync(path.join(dir, "codex.cmd")) && fs.existsSync(entry)) candidates.push({ command: execPath, args: [entry] });
    }
  }
  for (const bin of candidates) {
    const [command, prefix] = typeof bin === "string" ? [bin, []] : [bin.command, bin.args];
    const result = spawn(command, [...prefix, "--version"], { timeout: 10000 }) || {};
    if (!result.error && result.status === 0) return bin;
  }
  return null;
}

function hostEngramCheck(target, context, add) {
  const spec = ENGRAM_TARGETS[target];
  const detection = detectEngram({
    target,
    spawn: context.engramSpawn,
    hostBin: target === "codex" ? resolveCodexBin(context) : null,
    homedir: () => context.home,
    env: context.env,
    platform: context.platform,
    timeoutMs: context.engramTimeoutMs,
  });
  const setup = spec.agent ? `\`engram setup ${spec.agent}\`` : `\`npm run ${spec.script}\` in the ospec-workflow checkout`;
  if (!detection.binary.found) {
    add({
      id: "engram",
      status: "info",
      detail: "engram binary not found; session memory is optional",
      action: `To enable it, install Engram and run \`npm run ${spec.script}\` again.`,
    });
  } else if (isUnknown(detection)) {
    add({
      id: "engram",
      status: "warn",
      cause: `the ${spec.label} Engram configuration could not be read`,
      action: target === "codex" ? "Make sure the `codex` CLI is on PATH and run `ospec doctor` again." : `Check the ${spec.label} configuration files, then run ${setup}.`,
    });
  } else if (!isConfigured(detection)) {
    const missing = [
      detection.protocol === "absent" ? spec.protocol : null,
      detection.mcp !== "registered" ? "MCP server" : null,
    ].filter(Boolean);
    add({
      id: "engram",
      status: "warn",
      cause: `Engram ${detection.binary.version || ""} is installed but ${spec.label} lacks: ${missing.join(", ")}`.replace("  ", " "),
      action: `Run ${setup}.`,
    });
  } else if (target === "codex" && detection.lifecycle === "unsupported") {
    add({
      id: "engram",
      status: "warn",
      cause: "the Engram binary does not support the Codex session hooks (`engram hook codex-*`)",
      action: "Update Engram, then run `engram setup codex`.",
    });
  } else if (detection.doctor === "warn" || detection.doctor === "error") {
    add({ id: "engram", status: "warn", cause: `\`engram doctor\` reports ${detection.doctor}`, action: "Run `engram doctor` and follow its advice." });
  } else {
    add({ id: "engram", status: "ok", detail: detection.binary.version || "" });
  }
}

// --- project ----------------------------------------------------------------

function readConfig(root, add) {
  const file = path.join(root, ...CONFIG_FILE.split("/"));
  const text = readText(file);
  if (text === null) {
    add({ id: "idd-config", status: "ok", detail: `no ${CONFIG_FILE}; defaults apply` });
    return {};
  }
  try {
    const config = parseIddConfig(text);
    add({ id: "idd-config", status: "ok" });
    return config;
  } catch (error) {
    if (!(error instanceof IddConfigError)) throw error;
    add({
      id: "idd-config",
      status: "error",
      cause: `${CONFIG_FILE}: ${error.message}`,
      action: `Fix ${CONFIG_FILE}: its keys are ${CONFIG_KEYS.join(", ")} (REQ-idd-013).`,
    });
    return null;
  }
}

function iddChangeChecks(root, add) {
  const base = path.join(root, "idd");
  for (const id of listDirs(base).filter((name) => name !== "archive")) {
    const file = path.join(base, id, STATE_FILE);
    const text = readText(file);
    const rel = `idd/${id}/${STATE_FILE}`;
    if (text === null) {
      add(fs.existsSync(`${file}.bak`)
        ? {
            id: "idd-change",
            subject: id,
            status: "warn",
            cause: `an interrupted write left only ${rel}.bak`,
            action: `Run \`ospec status --change ${id}\`; the CLI restores the last committed state.`,
          }
        : {
            id: "idd-change",
            subject: id,
            status: "warn",
            cause: `idd/${id}/ has no ${STATE_FILE}`,
            action: `Open it with \`ospec record intent --change ${id} …\`, or remove the directory if it is not a change.`,
          });
      continue;
    }
    let state = null;
    let problem = null;
    try {
      state = JSON.parse(text);
      const { ok, errors } = validateState(state);
      if (!ok) problem = errors.join("; ");
      else if (state.change !== id) problem = `declares change ${state.change}`;
    } catch (error) {
      problem = `not readable idd-state (${error.message})`;
    }
    if (problem) {
      add({
        id: "idd-change",
        subject: id,
        status: "error",
        cause: `${rel}: ${problem}`,
        action: `Restore ${rel} from version control; only the ospec CLI writes it.`,
      });
    } else if (state.status === "closed") {
      add({
        id: "idd-change",
        subject: id,
        status: "warn",
        cause: `closed at ${state.closed_at} but still outside idd/archive/: the close was interrupted`,
        action: `Run \`ospec close --change ${id}\`; it finishes the move.`,
      });
    } else {
      const [summary] = statusOf([state]).changes;
      const pending = summary.obligations.pending.join(", ") || "none";
      const gates = summary.open_gates.join(", ") || "none";
      add({
        id: "idd-change",
        subject: id,
        status: "info",
        detail: `open; pending: ${pending}; open gates: ${gates}`,
        action: `Continue with \`ospec next --change ${id}\`.`,
      });
    }
  }
}

function sddChanges(root) {
  const base = path.join(root, "openspec", "changes");
  return listDirs(base)
    .filter((name) => name !== "archive")
    .map((name) => {
      const status = /^status:\s*(.+)$/m.exec(readText(path.join(base, name, "state.yaml")) || "");
      return { name, status: status ? status[1].trim().replace(/^["']|["']$/g, "") : null };
    });
}

function sddPackageCheck({ mode, changes, hostsWithoutSdd }, add) {
  if (mode !== "sdd" && changes.length === 0) return;
  if (hostsWithoutSdd.length === 0) {
    add({ id: "sdd-package", status: "ok" });
    return;
  }
  const action = "Reinstall ospec-workflow with `--with-sdd` (for example `npm run setup:claude -- --with-sdd` in the ospec-workflow checkout).";
  const hosts = hostsWithoutSdd.join(", ");
  add(mode === "sdd"
    ? { id: "sdd-package", status: "error", cause: `mode: sdd, but ${hosts} has no SDD package installed`, action }
    : { id: "sdd-package", status: "warn", cause: `openspec/changes/ holds SDD changes, but ${hosts} has no SDD package to continue them`, action });
}

function gitHookText(root, name) {
  return readText(path.join(root, ".git", "hooks", name)) || "";
}

function strictTddCheck(root, config, add) {
  if (!config?.strictTdd) return;
  if (!gitHookText(root, "pre-commit").includes("pre-commit-hook.js")) {
    add({ id: "strict-tdd-hook", status: "ok", detail: "no ospec pre-commit hook installed" });
    return;
  }
  const openspec = readText(path.join(root, "openspec", "config.yaml")) || "";
  add(/tdd_mode\s*:\s*["']?strict\b/i.test(openspec)
    ? { id: "strict-tdd-hook", status: "ok" }
    : {
        id: "strict-tdd-hook",
        status: "warn",
        cause: "idd/config.yaml sets strict_tdd, but the pre-commit hook reads Strict TDD only from openspec/config.yaml, so commits are not checked for it",
        action: "Declare `testing.tdd_mode: strict` in openspec/config.yaml too, or rely on the tdd-red-green obligation of `ospec check`.",
      });
}

function sessionDirCheck(root, spawn, add) {
  if (!fs.existsSync(path.join(root, ".ospec"))) return;
  const result = spawn("git", ["check-ignore", "-q", ".ospec/"], { cwd: root, timeout: 10000 }) || {};
  if (result.error || (result.status !== 0 && result.status !== 1)) return; // not a git work tree
  add(result.status === 0
    ? { id: "session-dir", status: "ok" }
    : {
        id: "session-dir",
        status: "warn",
        cause: "the ospec hooks write session data to .ospec/, which git does not ignore",
        action: "Add `.ospec/` to .gitignore.",
      });
}

function hookGuardCheck(env, add) {
  const off = HOOK_GUARDS.filter((name) => env[name] === "true");
  add(off.length
    ? {
        id: "hook-guards",
        status: "warn",
        detail: off.join(", "),
        cause: `${off.join(", ")} switch off ospec guards for every hook run from this environment`,
        action: `Unset them (for example \`unset ${off[0]}\`) unless they are off on purpose.`,
      }
    : { id: "hook-guards", status: "ok" });
}

// --- checkout -----------------------------------------------------------------

function checkoutChecks(root, version, claude, others, add) {
  const dist = readJson(path.join(root, "dist", "claude-marketplace", "plugins", "ospec-workflow", ".claude-plugin", "plugin.json"));
  if (dist?.version) {
    add(dist.version === version
      ? { id: "dist-drift", subject: "claude", status: "ok", detail: version }
      : {
          id: "dist-drift",
          subject: "claude",
          status: "warn",
          cause: `dist/claude-marketplace was built from ${dist.version}; the checkout is ${version}`,
          action: "Run `npm run setup:claude`; it rebuilds dist/ and reinstalls.",
        });
  }
  if (claude?.primary) {
    add(claude.primary.version === version
      ? { id: "install-drift", subject: "claude", status: "ok", detail: version }
      : {
          id: "install-drift",
          subject: "claude",
          status: "warn",
          cause: `Claude Code runs ospec-workflow ${claude.primary.version}; the checkout is ${version}`,
          action: "Run `npm run setup:claude`, then /reload-plugins or restart Claude Code.",
        });
  }
  hosts.installDriftChecks(version, others, add);
  if (!fs.existsSync(path.join(root, ".git", "hooks"))) return;
  const missing = [
    gitHookText(root, "pre-commit").includes("pre-commit-hook.js") ? null : "pre-commit",
    gitHookText(root, "commit-msg").includes("commit-msg-hook.js") ? null : "commit-msg",
  ].filter(Boolean);
  add(missing.length
    ? {
        id: "git-hooks",
        status: "warn",
        cause: `the repository's ${missing.join(" and ")} hook is not installed`,
        action: "Run `npm run setup:git-hooks`.",
      }
    : { id: "git-hooks", status: "ok" });
}

// --- entry ------------------------------------------------------------------

async function runDoctor({
  root = process.cwd(),
  home = os.homedir(),
  env = process.env,
  platform = process.platform,
  arch = process.arch,
  spawn = defaultSpawn,
  target = null,
  runtimeRoot = path.resolve(__dirname, "..", ".."),
  execPath = process.execPath,
} = {}) {
  if (target && !DOCTOR_TARGETS.includes(target)) {
    throw new DoctorUsageError(`unknown target: ${target} (one of ${DOCTOR_TARGETS.join(", ")})`);
  }
  const checks = [];
  const adder = (scope) => (check) => checks.push({ scope, ...check });

  const version = runtimeVersion(runtimeRoot);
  adder("runtime")({ id: "runtime", status: "info", detail: `${version || "unknown version"} at ${runtimeRoot}` });

  const claude = detectClaude(home);
  const others = hosts.detectHosts({ home, env, platform, parseJsonc });
  const checkout = checkoutVersion(root);
  if (checkout) checkoutChecks(root, checkout, claude, others, adder("checkout"));

  const project = adder("project");
  const config = readConfig(root, project);
  const mode = config ? resolveMode({ projectMode: config.mode }) : DEFAULT_MODE;
  project({ id: "mode", status: "info", detail: mode });
  const changes = sddChanges(root);
  const hostsWithoutSdd = [
    ...(claude?.primary && !hasSddPackage(claude.primary.installPath) ? ["claude"] : []),
    ...hosts.hostsWithoutSdd(others),
  ];
  sddPackageCheck({ mode, changes, hostsWithoutSdd }, project);
  iddChangeChecks(root, project);
  for (const change of changes) {
    project({
      id: "sdd-change",
      subject: change.name,
      status: "info",
      detail: `status ${change.status || "unknown"}`,
      action: `Continue with \`/sdd-continue ${change.name}\`.`,
    });
  }
  strictTddCheck(root, config, project);
  sessionDirCheck(root, spawn, project);
  hookGuardCheck(env, project);
  hosts.codexRepoCheck(root, others, project);

  const engramSpawn = sharedEngramSpawn(spawn);
  if (target ? target === "claude" : claude) {
    const add = adder("claude");
    if (!claude) {
      add({
        id: "plugin",
        status: "error",
        cause: `no ospec-workflow plugin in ${path.join(home, ".claude", "plugins", "installed_plugins.json")}`,
        action: "Install it: `npm run setup:claude` in the ospec-workflow checkout, or `/plugin install` from its marketplace.",
      });
    } else {
      claudePluginChecks(claude, add);
      if (claude.primary) {
        claudeHookChecks(claude.primary, { platform, arch }, add);
        claudeRouterChecks(claude.primary, home, add);
        claudeEngramCheck({ spawn: engramSpawn, home, env, platform }, add);
      }
    }
  }

  const engramContext = { home, env, platform, execPath, spawn, engramSpawn, engramTimeoutMs: ENGRAM_TIMEOUT_MS };
  const context = {
    home,
    env,
    platform,
    budgetBytes: ALWAYS_ON_BUDGET_BYTES,
    memoryCheck: (host, add) => hostEngramCheck(host, engramContext, add),
  };
  for (const host of hosts.HOST_TARGETS) {
    if (target ? target === host : others[host]) hosts.hostChecks(host, others[host], context, adder(host));
  }

  const errors = checks.filter((check) => check.status === "error").length;
  const warnings = checks.filter((check) => check.status === "warn").length;
  return { checks, summary: { errors, warnings }, exit_code: errors ? 1 : 0 };
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function renderDoctor(result) {
  const lines = [];
  for (const check of result.checks) {
    const name = `${check.scope}/${check.id}${check.subject ? ` ${check.subject}` : ""}`;
    lines.push(`${check.status.padEnd(5)}  ${name}${check.detail ? `: ${check.detail}` : ""}`);
    if (check.cause) lines.push(`       cause: ${check.cause}`);
    if (check.action && check.status !== "ok") lines.push(`       action: ${check.action}`);
  }
  lines.push("", `${plural(result.summary.errors, "error")}, ${plural(result.summary.warnings, "warning")}`);
  return lines.join("\n");
}

module.exports = { DOCTOR_TARGETS, DoctorUsageError, renderDoctor, runDoctor };
