"use strict";

// `ospec doctor` for the hosts other than Claude Code (REQ-idd-019, E1.7 b):
// Codex, Cursor, Antigravity, OpenCode and GitHub Copilot CLI, which their
// installers own through `.ospec-workflow-install.json`, and VS Code, which
// loads a plugin tree named in `chat.pluginLocations`. Read-only, like the rest
// of the doctor: files are parsed, never written. The session-memory probe of
// each host stays in ospec-doctor.js (adr-20261002-003), which passes it in as
// `context.memoryCheck`, with `context.parseJsonc` for VS Code's settings.

const fs = require("node:fs");
const path = require("node:path");

// The label and the setup script of each host, as the installers name them.
const HOST_SETUP = {
  codex: { label: "Codex", script: "setup:codex" },
  cursor: { label: "Cursor", script: "setup:cursor" },
  antigravity: { label: "Antigravity", script: "setup:antigravity" },
  opencode: { label: "OpenCode", script: "setup:opencode" },
  "github-copilot": { label: "Copilot CLI", script: "setup:copilot" },
  vscode: { label: "VS Code", script: "setup:vscode" },
};

const MANIFEST = ".ospec-workflow-install.json";
// Placeholders an installer must render before a host can use the files: the
// installed runtime and `_shared` directories (E0.4 b, E1.6 a) and the source
// form of the ospec CLI command, which only an unbuilt tree still carries.
// Spelled in parts: the installers substitute the whole markers in every file
// they copy, and this module ships in the runtime.
const MARKERS = [["__OSPEC_", "RUNTIME_DIR__"], ["__OSPEC_", "SHARED_DIR__"], ["{{ospec", "-cli}}"]].map((parts) => parts.join(""));
const TEXT_FILE = /\.(?:md|mdc|toml)$/;
const SDD_AGENT = /^sdd-[a-z0-9-]+\.(?:md|toml)$/;
const LEGACY_ORCHESTRATOR = /^# SDD Orchestrator$/m;
const ROUTER_BEGIN = "<!-- ospec-workflow:router:begin -->";
const ROUTER_END = "<!-- ospec-workflow:router:end -->";
const OPENCODE_INSTRUCTIONS = "instructions/*.md";

function absEnv(env, name) {
  const value = env[name] && String(env[name]).trim();
  return value && path.isAbsolute(value) ? value : null;
}

// Where each global installer (scripts/configure/install-*.js) leaves its files.
const MANIFEST_HOSTS = {
  codex: {
    root: ({ home, env }) => absEnv(env, "CODEX_HOME") || path.join(home, ".codex"),
    runtime: "ospec-workflow/scripts/ospec.js",
    skills: ({ home }) => path.join(home, ".agents", "skills"),
    router: { block: "AGENTS.md" },
    hooks: "hooks.json",
  },
  cursor: {
    root: ({ home }) => path.join(home, ".cursor"),
    runtime: "scripts/ospec.js",
    router: { file: "rules/ospec-router.mdc" },
    hooks: "hooks.json",
  },
  antigravity: {
    root: ({ home }) => path.join(home, ".gemini", "config"),
    runtime: "scripts/ospec.js",
    router: { file: "rules/ospec-router.instructions.md" },
    hooks: "hooks.json",
  },
  opencode: {
    root: ({ home }) => path.join(home, ".config", "opencode"),
    runtime: "scripts/ospec.js",
    router: { file: "instructions/ospec-router.instructions.md", config: "opencode.json" },
    hooks: "plugins/ospec.js",
  },
  "github-copilot": {
    root: ({ home }) => path.join(home, ".copilot"),
    runtime: "scripts/ospec.js",
    router: { file: "instructions/ospec-router.instructions.md" },
    hooks: "hooks/hooks.json",
  },
};

const VSCODE = {
  runtime: "scripts/ospec.js",
  router: { file: "rules/ospec-router.instructions.md" },
  hooks: "hooks/hooks.json",
};

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

function isDir(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function label(target) {
  return HOST_SETUP[target].label;
}

function setupAction(target, extra = "") {
  return `Run \`npm run ${HOST_SETUP[target].script}\` in the ospec-workflow checkout${extra}.`;
}

function hasSddPackage(agentsDir) {
  try {
    return fs.readdirSync(agentsDir).some((name) => SDD_AGENT.test(name));
  } catch {
    return false;
  }
}

// --- detection ----------------------------------------------------------------

function detectManifestHost(target, context) {
  const spec = MANIFEST_HOSTS[target];
  const root = spec.root(context);
  const manifestFile = path.join(root, MANIFEST);
  const text = readText(manifestFile);
  if (text === null) return null;
  let manifest = null;
  try {
    manifest = JSON.parse(text);
  } catch {
    // Reported by the install check.
  }
  return {
    target,
    root,
    manifestFile,
    manifest,
    version: manifest && typeof manifest.version === "string" ? manifest.version : null,
    skills: spec.skills ? spec.skills(context) : path.join(root, "skills"),
    agents: path.join(root, "agents"),
    spec,
  };
}

function vscodeSettingsFiles({ home, env, platform }) {
  const editions = ["Code", "Code - Insiders"];
  let base;
  if (platform === "win32") base = absEnv(env, "APPDATA") || path.join(home, "AppData", "Roaming");
  else if (platform === "darwin") base = path.join(home, "Library", "Application Support");
  else base = absEnv(env, "XDG_CONFIG_HOME") || path.join(home, ".config");
  return editions.map((edition) => path.join(base, edition, "User", "settings.json"));
}

// `chat.pluginLocations` and `chat.agentFilesLocations` are an array of paths
// in older settings and a { path: enabled } map in Agent Plugins 1.0.
function locationList(value) {
  if (Array.isArray(value)) return value.filter((entry) => typeof entry === "string");
  if (value && typeof value === "object") return Object.keys(value).filter((key) => value[key] !== false);
  return typeof value === "string" ? [value] : [];
}

function pluginName(dir) {
  for (const file of [path.join(dir, ".claude-plugin", "plugin.json"), path.join(dir, ".plugin.json")]) {
    const manifest = readJson(file);
    if (manifest?.name) return { name: manifest.name, version: manifest.version || null };
  }
  return null;
}

function isSourceCheckout(dir) {
  return readJson(path.join(dir, "package.json"))?.name === "ospec-workflow" && fs.existsSync(path.join(dir, "scripts", "configure", "cli.js"));
}

function detectVscode(context) {
  const { parseJsonc } = context;
  const settings = [];
  for (const file of vscodeSettingsFiles(context)) {
    const text = readText(file);
    if (text === null) continue;
    let doc = null;
    try {
      doc = parseJsonc(text);
    } catch {
      settings.push({ file, unreadable: true, entries: [], agentFiles: [] });
      continue;
    }
    const entries = locationList(doc["chat.pluginLocations"]).map((location) => {
      const dir = path.resolve(location);
      const exists = isDir(dir);
      const plugin = exists ? pluginName(dir) : null;
      const kind = !exists ? (/ospec-workflow/i.test(location) ? "missing" : null)
        : isSourceCheckout(dir) ? "source"
        : plugin?.name === "ospec-workflow" ? "build" : null;
      return kind ? { location, dir, kind, version: plugin?.version || null } : null;
    }).filter(Boolean);
    settings.push({ file, entries, agentFiles: locationList(doc["chat.agentFilesLocations"]) });
  }
  if (!settings.some((entry) => entry.unreadable || entry.entries.length)) return null;
  const builds = settings.flatMap((entry) => entry.entries).filter((entry) => entry.kind === "build");
  const primary = builds[0] || null;
  return {
    target: "vscode",
    settings,
    primary,
    version: primary?.version || null,
    root: primary?.dir || null,
    skills: primary ? path.join(primary.dir, "skills") : null,
    agents: primary ? path.join(primary.dir, "agents") : null,
    spec: VSCODE,
  };
}

function detectHosts(context) {
  const hosts = {};
  for (const target of Object.keys(MANIFEST_HOSTS)) {
    const host = detectManifestHost(target, context);
    if (host) hosts[target] = host;
  }
  const vscode = context.parseJsonc ? detectVscode(context) : null;
  if (vscode) hosts.vscode = vscode;
  return hosts;
}

// --- checks -------------------------------------------------------------------

function installCheck(host, add) {
  const { target } = host;
  if (!host.manifest) {
    add({
      id: "install",
      status: "error",
      cause: `${host.manifestFile} is not readable JSON`,
      action: setupAction(target, "; it rewrites the manifest"),
    });
  } else if (!host.version || host.version === "0.0.0") {
    add({
      id: "install",
      status: "error",
      cause: `${host.manifestFile} records version ${host.version || "none"} and ${(host.manifest.files || []).length} files: it was not written by a release install (a stub or test install left it)`,
      action: setupAction(target, `; if you do not use ospec in ${label(target)}, delete the manifest and the files it lists`),
    });
  } else {
    add({ id: "install", status: "ok", detail: host.version });
  }
}

function runtimeCheck(host, add) {
  const file = path.join(host.root, host.spec.runtime);
  add(fs.existsSync(file)
    ? { id: "runtime", status: "ok" }
    : {
        id: "runtime",
        status: "error",
        cause: `${file} is missing, so the IDD protocol cannot run the ospec CLI in ${label(host.target)}`,
        action: setupAction(host.target, "; it installs the runtime"),
      });
}

function markerFiles(dir, found, limit) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (found.length >= limit) return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) markerFiles(full, found, limit);
    else if (TEXT_FILE.test(entry.name)) {
      const text = readText(full) || "";
      const marker = MARKERS.find((value) => text.includes(value));
      if (marker) found.push({ file: full, marker });
    }
  }
}

function markersCheck(host, add) {
  const found = [];
  for (const dir of [host.skills, host.agents]) markerFiles(dir, found, 3);
  add(found.length
    ? {
        id: "markers",
        status: "error",
        cause: `unrendered placeholders: ${found.map(({ file, marker }) => `${marker} in ${file}`).join("; ")}; the skills cannot find the ospec runtime or their shared files`,
        action: setupAction(host.target, "; the installer renders them"),
      }
    : { id: "markers", status: "ok" });
}

function routerText(host) {
  const { router } = host.spec;
  if (router.block) {
    const file = path.join(host.root, router.block);
    const text = readText(file) || "";
    const start = text.indexOf(ROUTER_BEGIN);
    const end = start === -1 ? -1 : text.indexOf(ROUTER_END, start);
    if (end !== -1) return { file, text: `${text.slice(start, end + ROUTER_END.length)}\n` };
    return { file, text: null, legacy: LEGACY_ORCHESTRATOR.test(text) };
  }
  const file = path.join(host.root, router.file);
  return { file, text: readText(file) };
}

function routerChecks(host, add, budgetBytes) {
  const { target } = host;
  const router = routerText(host);
  if (router.text === null) {
    add({
      id: "router",
      status: "warn",
      cause: router.legacy
        ? `${router.file} holds the pre-E0.4 orchestrator copy instead of the router block`
        : `${router.file} has no ospec router, so IDD is not the default flow in ${label(target)}`,
      action: setupAction(target, "; it writes the router"),
    });
  } else {
    const config = host.spec.router.config && readJson(path.join(host.root, host.spec.router.config));
    const loaded = !host.spec.router.config || (Array.isArray(config?.instructions) && config.instructions.includes(OPENCODE_INSTRUCTIONS));
    add(loaded
      ? { id: "router", status: "ok" }
      : {
          id: "router",
          status: "warn",
          cause: `${path.join(host.root, host.spec.router.config)} does not list "${OPENCODE_INSTRUCTIONS}" in instructions, so ${label(target)} never loads the router`,
          action: setupAction(target, "; it merges the instructions entry"),
        });
  }
  const bytes = router.text === null ? 0 : Buffer.byteLength(router.text);
  add(bytes > budgetBytes
    ? {
        id: "budget",
        status: "warn",
        detail: `${bytes} B`,
        cause: `the router is ${bytes} B, over the ${budgetBytes} B always-on budget of E0.4`,
        action: setupAction(target, "; if it is still over budget, report it"),
      }
    : { id: "budget", status: "ok", detail: `${bytes} B` });
}

function hooksCheck(host, add) {
  const file = path.join(host.root, host.spec.hooks);
  add(fs.existsSync(file)
    ? { id: "hooks", status: "ok" }
    : {
        id: "hooks",
        status: "error",
        cause: `${file} is missing; without hooks there is no session memory, guard or token advisor in ${label(host.target)}`,
        action: setupAction(host.target, "; it installs the hooks"),
      });
}

function vscodeLocationChecks(host, add) {
  for (const settings of host.settings) {
    if (settings.unreadable) {
      add({
        id: "plugin-locations",
        subject: settings.file,
        status: "error",
        cause: `${settings.file} is not readable JSONC`,
        action: "Fix the syntax of VS Code's settings.json, then run `ospec doctor` again.",
      });
      continue;
    }
    for (const entry of settings.entries.filter((item) => item.kind !== "build")) {
      add(entry.kind === "source"
        ? {
            id: "plugin-locations",
            subject: entry.location,
            status: "error",
            cause: `chat.pluginLocations in ${settings.file} loads the ospec-workflow source checkout, whose skills still carry the unrendered ospec CLI placeholder and the whole SDD package`,
            action: "Remove that entry and run `npm run setup:vscode` in the ospec-workflow checkout, which builds dist/vscode and registers it.",
          }
        : {
            id: "plugin-locations",
            subject: entry.location,
            status: "error",
            cause: `chat.pluginLocations in ${settings.file} names ${entry.location}, which does not exist`,
            action: "Remove that entry; `npm run setup:vscode` in the ospec-workflow checkout registers the current build.",
          });
    }
  }
  const builds = host.settings.flatMap((settings) => settings.entries.map((entry) => ({ ...entry, file: settings.file }))).filter((entry) => entry.kind === "build");
  const distinct = [...new Map(builds.map((entry) => [entry.dir.toLowerCase(), entry])).values()];
  if (distinct.length > 1) {
    add({
      id: "plugin-locations",
      status: "warn",
      detail: host.version,
      cause: `${distinct.length} ospec-workflow plugins are registered: ${distinct.map((entry) => `${entry.location} (${entry.version || "?"})`).join(", ")}; VS Code loads every one`,
      action: "Keep only the dist/vscode of your checkout in chat.pluginLocations.",
    });
  } else if (distinct.length === 1) {
    add({ id: "plugin-locations", status: "ok", detail: host.version });
  }
  const inside = host.root
    ? host.settings.flatMap((settings) => settings.agentFiles).filter((location) => {
        const rel = path.relative(host.root, path.resolve(location));
        return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
      })
    : [];
  if (inside.length) {
    add({
      id: "agent-files",
      status: "warn",
      cause: `chat.agentFilesLocations also names ${inside.join(", ")}, inside the ospec plugin, so VS Code loads those agents twice`,
      action: "Remove those entries from chat.agentFilesLocations; the plugin already provides its agents.",
    });
  }
}

function missingHost(target, context, add) {
  if (target === "vscode") {
    add({
      id: "plugin-locations",
      status: "error",
      cause: `no ospec-workflow plugin in chat.pluginLocations of ${vscodeSettingsFiles(context).join(" or ")}`,
      action: setupAction("vscode", "; it builds dist/vscode and registers it"),
    });
    return;
  }
  add({
    id: "install",
    status: "error",
    cause: `no ospec-workflow installation in ${MANIFEST_HOSTS[target].root(context)} (${MANIFEST} not found)`,
    action: setupAction(target),
  });
}

function hostChecks(target, host, context, add) {
  if (!host) {
    missingHost(target, context, add);
    return;
  }
  if (target === "vscode") {
    vscodeLocationChecks(host, add);
    if (!host.primary) return;
  } else {
    installCheck(host, add);
  }
  runtimeCheck(host, add);
  markersCheck(host, add);
  routerChecks(host, add, context.budgetBytes);
  hooksCheck(host, add);
  if (context.memoryCheck) context.memoryCheck(target, add);
}

// --- project and checkout -----------------------------------------------------

// `install:codex -- <repo>` writes the router into the repository and its
// agents into <repo>/.codex, but no runtime and no IDD protocol: the router then
// works only through a global Codex install.
function codexRepoCheck(root, hosts, add) {
  const agents = readText(path.join(root, "AGENTS.md")) || "";
  const repoInstall = agents.includes(ROUTER_BEGIN) || isDir(path.join(root, ".codex", "agents"));
  if (!repoInstall) return;
  if (fs.existsSync(path.join(root, ".agents", "skills", "idd", "SKILL.md"))) {
    add({ id: "codex-repo", status: "ok" });
    return;
  }
  const global = hosts.codex;
  add(global && fs.existsSync(path.join(global.skills, "idd", "SKILL.md"))
    ? { id: "codex-repo", status: "info", detail: "repository Codex install; the IDD protocol and runtime come from the global install" }
    : {
        id: "codex-repo",
        status: "warn",
        cause: "this repository has a Codex install (`install:codex -- <repo>`), which carries no ospec runtime or IDD protocol, and no global Codex install provides them",
        action: "Run `npm run setup:codex` in the ospec-workflow checkout for the global install.",
      });
}

function hostsWithoutSdd(hosts) {
  return Object.values(hosts).filter((host) => host.agents && !hasSddPackage(host.agents)).map((host) => host.target);
}

function installDriftChecks(version, hosts, add) {
  for (const host of Object.values(hosts)) {
    if (!host.version) continue;
    add(host.version === version
      ? { id: "install-drift", subject: host.target, status: "ok", detail: version }
      : {
          id: "install-drift",
          subject: host.target,
          status: "warn",
          cause: `${label(host.target)} runs ospec-workflow ${host.version}; the checkout is ${version}`,
          action: setupAction(host.target, host.target === "vscode" ? ", then reload VS Code" : ""),
        });
  }
}

module.exports = {
  HOST_TARGETS: [...Object.keys(MANIFEST_HOSTS), "vscode"],
  codexRepoCheck,
  detectHosts,
  hostChecks,
  hostsWithoutSdd,
  installDriftChecks,
};
