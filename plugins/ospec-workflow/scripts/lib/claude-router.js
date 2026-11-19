"use strict";

// The Claude Code router (claude-router). A plugin cannot carry always-on
// text, so the router built into the plugin (global-instructions/CLAUDE.md)
// goes to <config>/rules/ospec-workflow.md, which Claude Code loads at every
// session start exactly like ~/.claude/CLAUDE.md (memory type User, same
// block). The team variant goes to <project>/.claude/rules/ospec-workflow.md,
// with the marketplace and the plugin declared in .claude/settings.json.
//
// One module serves setup:claude, `ospec router`, `ospec doctor` (read-only)
// and the SessionStart launcher. Its state (the user's "no", and the version
// and hash of what ospec wrote) lives in the plugin data directory, which
// Claude Code deletes when the plugin is uninstalled. The CLI does not receive
// CLAUDE_PLUGIN_DATA, so every caller derives that directory from the
// configuration directory, as Claude Code does (CLAUDE_CONFIG_DIR or
// ~/.claude).

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { BEGIN, END, findBlock, removeBlock } = require("./router-block.js");

const RULES_FILE = "ospec-workflow.md";
const MARKETPLACE = "ospec-tools";
const PLUGIN_ID = "ospec-workflow@ospec-tools";
const DATA_DIR = "ospec-workflow-ospec-tools";
const STATE_FILE = "router.json";
const SOURCE_FILE = path.join("global-instructions", "CLAUDE.md");
// What a team file declares when the user's marketplace is a local checkout.
const PUBLIC_MARKETPLACE = Object.freeze({ source: "git", url: "https://github.com/snakeblack/ospec-workflow.git", ref: "release" });
const REMOTE_SOURCES = new Set(["github", "git", "url"]);
// Never `headers` or `headersHelper`: a committed file must not carry credentials.
const SOURCE_FIELDS = ["source", "repo", "url", "ref", "path"];
const NOTICE = "ospec-workflow: the router is not installed, so IDD is not the default flow. Run `! ospec router install`, or `! ospec router off` to stop this notice.";
const SETUP_HOW = "Run `npm run setup:claude` in the ospec-workflow checkout, or the ospec of the installed plugin (`! ospec router install` inside Claude Code).";

class RouterError extends Error {
  constructor(code, message, how) {
    super(message);
    this.code = code;
    if (how) this.how = how;
  }
}

function claudeConfigDir({ env = process.env, homedir = os.homedir } = {}) {
  const custom = env.CLAUDE_CONFIG_DIR;
  return typeof custom === "string" && custom.trim() !== "" ? path.resolve(custom) : path.join(homedir(), ".claude");
}

function userPaths(configDir) {
  return {
    rules: path.join(configDir, "rules", RULES_FILE),
    claudeMd: path.join(configDir, "CLAUDE.md"),
    state: path.join(configDir, "plugins", "data", DATA_DIR, STATE_FILE),
    marketplaces: path.join(configDir, "plugins", "known_marketplaces.json"),
  };
}

function projectPaths(root) {
  return { rules: path.join(root, ".claude", "rules", RULES_FILE), settings: path.join(root, ".claude", "settings.json") };
}

function normalize(text) {
  return String(text).replace(/\r\n/g, "\n");
}

function digest(text) {
  return crypto.createHash("sha256").update(normalize(text)).digest("hex");
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readOptional(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }
}

// null when the file is absent, undefined when it is not valid JSON.
function readJsonOptional(file) {
  const text = readOptional(file);
  if (text === null) return null;
  try {
    return JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return undefined;
  }
}

// Two sessions that start together may both refresh: each writes its own
// temporary file and the rename replaces the target whole.
function writeAtomic(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temp, content, "utf8");
    fs.renameSync(temp, file);
  } catch (error) {
    fs.rmSync(temp, { force: true });
    throw error;
  }
}

function readSource(pluginRoot) {
  const file = path.join(pluginRoot, SOURCE_FILE);
  const text = readOptional(file);
  if (text === null) return null;
  const manifest = readJsonOptional(path.join(pluginRoot, ".claude-plugin", "plugin.json"));
  return { path: file, text: `${normalize(text).trim()}\n`, version: typeof manifest?.version === "string" ? manifest.version : null };
}

function requireSource(pluginRoot) {
  const source = readSource(pluginRoot);
  if (!source) {
    throw new RouterError("router-source-missing", `no router to install: ${path.join(pluginRoot, SOURCE_FILE)} does not exist, so this ospec is not an installed Claude Code plugin`, SETUP_HOW);
  }
  return source;
}

// A corrupt state reads as none: no "no", no record of a write.
function readState(file) {
  const doc = readJsonOptional(file);
  if (!isPlainObject(doc)) return { declined: false, version: null, sha256: null };
  return {
    declined: doc.declined === true,
    version: typeof doc.version === "string" ? doc.version : null,
    sha256: typeof doc.sha256 === "string" ? doc.sha256 : null,
  };
}

function writeState(file, state) {
  writeAtomic(file, `${JSON.stringify({ schema: 1, ...state }, null, 2)}\n`);
}

function legacyBlock(claudeMd, text, source) {
  if (text === null) return null;
  let found;
  try {
    found = findBlock(text);
  } catch {
    return { path: claudeMd, state: "broken" };
  }
  if (!found) return null;
  const body = text.slice(found.start + BEGIN.length, found.end - END.length).trim();
  const state = source ? (`${normalize(body)}\n` === source.text ? "current" : "outdated") : "present";
  return { path: claudeMd, state, bytes: Buffer.byteLength(`${text.slice(found.start, found.end)}\n`) };
}

/**
 * The user scope: `file` is absent, current (the installed router), outdated
 * (what ospec wrote, from another version), modified (anything else: edited by
 * hand, or written without a record) or present (no router to compare with).
 */
function userStatus({ configDir, source }) {
  const paths = userPaths(configDir);
  const state = readState(paths.state);
  const text = readOptional(paths.rules);
  let file;
  if (text === null) file = "absent";
  else if (!source) file = "present";
  else if (normalize(text) === source.text) file = "current";
  else if (state.sha256 && digest(text) === state.sha256) file = "outdated";
  else file = "modified";
  return {
    scope: "user",
    path: paths.rules,
    file,
    bytes: text === null ? 0 : Buffer.byteLength(text),
    legacy: legacyBlock(paths.claudeMd, readOptional(paths.claudeMd), source),
    declined: state.declined,
    written_version: state.version,
    state_path: paths.state,
  };
}

function projectStatus({ root, source }) {
  const paths = projectPaths(root);
  const text = readOptional(paths.rules);
  const file = text === null ? "absent" : !source ? "present" : normalize(text) === source.text ? "current" : "differs";
  const settings = readJsonOptional(paths.settings);
  return {
    scope: "project",
    path: paths.rules,
    file,
    bytes: text === null ? 0 : Buffer.byteLength(text),
    settings: {
      path: paths.settings,
      invalid: settings === undefined,
      marketplace: isPlainObject(settings) && isPlainObject(settings.extraKnownMarketplaces) && settings.extraKnownMarketplaces[MARKETPLACE] !== undefined,
      enabled: isPlainObject(settings) && isPlainObject(settings.enabledPlugins) && settings.enabledPlugins[PLUGIN_ID] === true,
    },
  };
}

function status({ pluginRoot, configDir, root = null }) {
  const source = readSource(pluginRoot);
  return {
    source: source ? { path: source.path, version: source.version } : null,
    user: userStatus({ configDir, source }),
    ...(root ? { project: projectStatus({ root, source }) } : {}),
  };
}

// A router file in the session directory or one of its parents below the
// home directory: the team router of the project.
function findProjectRouter(cwd, homedir = os.homedir) {
  if (typeof cwd !== "string" || cwd === "") return null;
  const home = path.resolve(homedir());
  let dir = path.resolve(cwd);
  for (;;) {
    if (dir === home) return null;
    const file = projectPaths(dir).rules;
    if (fs.existsSync(file)) return file;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function removeLegacyBlock(legacy) {
  const rest = removeBlock(fs.readFileSync(legacy.path, "utf8"));
  if (rest.trim() === "") fs.rmSync(legacy.path, { force: true });
  else writeAtomic(legacy.path, rest);
}

function refuseBrokenBlock(legacy) {
  if (legacy?.state === "broken") {
    throw new RouterError("router-block-broken", `${legacy.path} has "${BEGIN}" but no end marker; nothing was written`, "Fix the block by hand (add the end marker or remove the begin marker), then run the command again.");
  }
}

function refuseModified(file, force, flags) {
  if (!force) {
    throw new RouterError("router-modified", `${file} differs from the router ospec wrote: it was edited by hand or written by something else; nothing was written`, `Run \`ospec router ${flags} --force\` to replace or remove it.`);
  }
}

function installUser({ source, configDir, force }) {
  const paths = userPaths(configDir);
  const current = userStatus({ configDir, source });
  if (current.file === "modified") refuseModified(current.path, force, "install");
  refuseBrokenBlock(current.legacy);
  const changed = current.file !== "current";
  if (changed) writeAtomic(paths.rules, source.text);
  if (current.legacy) removeLegacyBlock(current.legacy);
  writeState(paths.state, { declined: false, version: source.version, sha256: digest(source.text) });
  return { scope: "user", path: paths.rules, changed, migrated: current.legacy ? current.legacy.path : null, version: source.version };
}

// The source of the user's own ospec-tools marketplace when others can reach
// it; a local one (a checkout) gives way to the public release branch.
function marketplaceSource(configDir) {
  const doc = readJsonOptional(userPaths(configDir).marketplaces);
  const entry = isPlainObject(doc) && isPlainObject(doc[MARKETPLACE]) ? doc[MARKETPLACE].source : null;
  if (!isPlainObject(entry) || !REMOTE_SOURCES.has(entry.source)) return { ...PUBLIC_MARKETPLACE };
  const picked = {};
  for (const field of SOURCE_FIELDS) {
    if (typeof entry[field] === "string") picked[field] = field === "url" ? withoutCredentials(entry[field]) : entry[field];
  }
  return picked;
}

// Only what names the repository goes into a committed file: never a
// password (any scheme), an http(s) user (tokens ride there) or a query
// string (`?access_token=`). An ssh user such as `git@` names no secret.
function withoutCredentials(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return url; // scp-like git@host:path takes no password
  }
  const httpUser = /^https?:$/.test(parsed.protocol) && parsed.username;
  if (!parsed.password && !httpUser && !parsed.search) return url;
  parsed.password = "";
  if (httpUser) parsed.username = "";
  parsed.search = "";
  return parsed.toString();
}

function readSettings(file) {
  const text = readOptional(file);
  if (text === null) return {};
  let doc;
  try {
    doc = JSON.parse(text.replace(/^﻿/, ""));
  } catch (error) {
    throw new RouterError("settings-invalid", `${file} is not valid JSON (${error.message}); nothing was written`, "Fix the file, then run `ospec router install --scope project` again.");
  }
  const shaped = isPlainObject(doc)
    && (doc.extraKnownMarketplaces === undefined || isPlainObject(doc.extraKnownMarketplaces))
    && (doc.enabledPlugins === undefined || isPlainObject(doc.enabledPlugins));
  if (!shaped) {
    throw new RouterError("settings-invalid", `${file} is not a settings object with object extraKnownMarketplaces and enabledPlugins; nothing was written`, "Fix the file, then run `ospec router install --scope project` again.");
  }
  return doc;
}

function installProject({ source, configDir, root, force }) {
  const paths = projectPaths(root);
  const settings = readSettings(paths.settings);
  const existing = readOptional(paths.rules);
  if (existing !== null && normalize(existing) !== source.text) refuseModified(paths.rules, force, "install --scope project");
  const marketplace = marketplaceSource(configDir);
  const next = { ...settings };
  const known = settings.extraKnownMarketplaces || {};
  if (known[MARKETPLACE] === undefined) next.extraKnownMarketplaces = { ...known, [MARKETPLACE]: { source: marketplace } };
  const enabled = settings.enabledPlugins || {};
  if (enabled[PLUGIN_ID] !== true) next.enabledPlugins = { ...enabled, [PLUGIN_ID]: true };
  const changed = existing === null || normalize(existing) !== source.text;
  if (changed) writeAtomic(paths.rules, source.text);
  const settingsChanged = JSON.stringify(next) !== JSON.stringify(settings);
  if (settingsChanged) writeAtomic(paths.settings, `${JSON.stringify(next, null, 2)}\n`);
  const entry = (next.extraKnownMarketplaces || known)[MARKETPLACE];
  return {
    scope: "project",
    path: paths.rules,
    changed,
    settings: paths.settings,
    settings_changed: settingsChanged,
    marketplace: isPlainObject(entry) && isPlainObject(entry.source) ? entry.source : null,
    version: source.version,
  };
}

function install({ pluginRoot, configDir, root, scope = "user", force = false }) {
  const source = requireSource(pluginRoot);
  return scope === "project" ? installProject({ source, configDir, root, force }) : installUser({ source, configDir, force });
}

function takeOutUser({ pluginRoot, configDir, force, flags }) {
  const current = userStatus({ configDir, source: readSource(pluginRoot) });
  if (current.file === "modified" || current.file === "present") refuseModified(current.path, force, flags);
  refuseBrokenBlock(current.legacy);
  const removed = [];
  if (current.file !== "absent") {
    fs.rmSync(current.path, { force: true });
    removed.push(current.path);
  }
  if (current.legacy) {
    removeLegacyBlock(current.legacy);
    removed.push(current.legacy.path);
  }
  return { paths: userPaths(configDir), removed };
}

// `off`: no router and no notice until `ospec router install`.
function off({ pluginRoot, configDir, force = false }) {
  const { paths, removed } = takeOutUser({ pluginRoot, configDir, force, flags: "off" });
  writeState(paths.state, { declined: true, version: null, sha256: null });
  return { scope: "user", removed, declined: true };
}

// `remove`: no router and no record of it, before uninstalling the plugin;
// the notice comes back while the plugin stays. The team file goes, the
// settings stay: they belong to the repository.
function remove({ pluginRoot, configDir, root, scope = "user", force = false }) {
  if (scope === "project") {
    const paths = projectPaths(root);
    const existing = readOptional(paths.rules);
    const source = readSource(pluginRoot);
    if (existing !== null && (!source || normalize(existing) !== source.text)) refuseModified(paths.rules, force, "remove --scope project");
    if (existing !== null) fs.rmSync(paths.rules, { force: true });
    return { scope: "project", removed: existing === null ? [] : [paths.rules], settings_kept: paths.settings };
  }
  const { paths, removed } = takeOutUser({ pluginRoot, configDir, force, flags: "remove" });
  fs.rmSync(paths.state, { force: true });
  return { scope: "user", removed, declined: false };
}

function versionParts(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version || ""));
  return match ? match.slice(1).map(Number) : null;
}

// Without a readable version on either side, the hash alone proves ospec wrote it.
function isNewer(running, written) {
  const a = versionParts(running);
  const b = versionParts(written);
  if (!a || !b) return true;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

/**
 * The SessionStart step of the Claude Code build. It refreshes the user
 * router that ospec wrote when the running plugin is newer, and returns the
 * notice for a session that starts with no router, no "no" and no team file.
 * It never migrates a block and never writes in the project.
 */
function sessionStartRouter({ input = {}, env = process.env, pluginRoot, homedir = os.homedir }) {
  const source = readSource(pluginRoot);
  if (!source) return { notice: null, refreshed: false };
  const configDir = claudeConfigDir({ env, homedir });
  const current = userStatus({ configDir, source });
  if (current.file === "outdated" && isNewer(source.version, current.written_version)) {
    const paths = userPaths(configDir);
    writeAtomic(paths.rules, source.text);
    writeState(paths.state, { declined: false, version: source.version, sha256: digest(source.text) });
    return { notice: null, refreshed: true };
  }
  const quiet = current.file !== "absent" || current.legacy || current.declined
    || input.source !== "startup" || env.DISABLE_ROUTER_NOTICE === "true"
    || findProjectRouter(input.cwd, homedir);
  return { notice: quiet ? null : NOTICE, refreshed: false };
}

module.exports = {
  MARKETPLACE,
  NOTICE,
  PLUGIN_ID,
  PUBLIC_MARKETPLACE,
  RouterError,
  claudeConfigDir,
  digest,
  findProjectRouter,
  install,
  isNewer,
  marketplaceSource,
  off,
  projectPaths,
  remove,
  sessionStartRouter,
  status,
  userPaths,
};
