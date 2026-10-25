"use strict";

// The user's tier -> model assignment per host (E4.12). ospec ships no model
// names: models.yaml keeps Claude's aliases and Codex's effort per tier, and
// every other model comes from this file, which only the user writes (through
// an installer's --model flag or the TUI). It lives outside any project
// because the agents are installed per user, and a file that cannot be read is
// ignored with a warning: its agents inherit the session model.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { KNOWN_TIERS } = require("./model-resolver.js");

// Antigravity always inherits: it is not assignable.
const ASSIGNABLE_HOSTS = ["claude", "codex", "opencode", "cursor", "vscode", "github-copilot"];
// A model name is free text, as the host spells it, but one line of at most
// 200 characters: it ends up in agent frontmatter and TOML.
const MODEL_NAME = /^[^\u0000-\u001f\u007f]{1,200}$/;
const FILE_HEADER = [
  "# ospec: modelo de cada tier por host. Lo escriben `--model <tier>=<modelo>`",
  "# y el TUI del instalador; un tier sin modelo hereda el de la sesión.",
];

function userModelsPath({ env = process.env, platform = process.platform, homedir = os.homedir } = {}) {
  if (platform === "win32") {
    const appData = env.APPDATA && path.win32.isAbsolute(env.APPDATA) ? env.APPDATA : path.win32.join(homedir(), "AppData", "Roaming");
    return path.win32.join(appData, "ospec", "models.yaml");
  }
  const xdg = env.XDG_CONFIG_HOME && path.posix.isAbsolute(env.XDG_CONFIG_HOME) ? env.XDG_CONFIG_HOME : path.posix.join(homedir(), ".config");
  return path.posix.join(xdg, "ospec", "models.yaml");
}

// A strict reader: two levels (host, then tier) and one model per line, as a
// JSON string or a bare scalar. Anything else rejects the whole file.
function parseUserModels(text) {
  const models = {};
  let host = null;
  for (const [index, line] of String(text).split(/\r?\n/).entries()) {
    const fail = (reason) => { throw new Error(`line ${index + 1}: ${reason}`); };
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const hostMatch = line.match(/^([a-z-]+):\s*$/);
    if (hostMatch) {
      host = hostMatch[1];
      if (!ASSIGNABLE_HOSTS.includes(host)) fail(`unknown host "${host}"`);
      if (models[host]) fail(`duplicate host "${host}"`);
      models[host] = {};
      continue;
    }
    const tierMatch = line.match(/^ {2}([a-z]+):\s*(.*?)\s*$/);
    if (!tierMatch) fail("expected `<host>:` or `  <tier>: <model>`");
    if (!host) fail("a tier needs its host above it");
    const [, tier, raw] = tierMatch;
    if (!KNOWN_TIERS.includes(tier)) fail(`unknown tier "${tier}"`);
    if (Object.prototype.hasOwnProperty.call(models[host], tier)) fail(`duplicate tier "${tier}" for ${host}`);
    let value = raw;
    if (raw.startsWith('"')) {
      try { value = JSON.parse(raw); } catch { fail("invalid quoted model"); }
    }
    if (typeof value !== "string" || !isModelName(value.trim())) fail(`invalid model for ${host}.${tier}`);
    models[host][tier] = value.trim();
  }
  return models;
}

function isModelName(value) {
  return typeof value === "string" && MODEL_NAME.test(value);
}

function formatUserModels(models) {
  const lines = [...FILE_HEADER];
  for (const host of ASSIGNABLE_HOSTS) {
    const tiers = KNOWN_TIERS.filter(tier => models[host]?.[tier]);
    if (!tiers.length) continue;
    lines.push(`${host}:`);
    for (const tier of tiers) lines.push(`  ${tier}: ${JSON.stringify(models[host][tier])}`);
  }
  return `${lines.join("\n")}\n`;
}

function readUserModels({ fs: fsImpl = fs, ...pathOptions } = {}) {
  const file = userModelsPath(pathOptions);
  let text;
  try {
    text = fsImpl.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { file, models: {}, warning: null };
    return { file, models: {}, warning: `no se pudo leer ${file} (${error.message}): los agentes heredan el modelo de la sesión` };
  }
  try {
    return { file, models: parseUserModels(text), warning: null };
  } catch (error) {
    return { file, models: {}, warning: `se ignora ${file} (${error.message}): los agentes heredan el modelo de la sesión` };
  }
}

// Sets (a string) or clears (null) tiers of one host, keeping the rest of the
// file. A file that cannot be parsed is never overwritten: the user's other
// assignments would be lost.
function writeUserModels(host, updates, { fs: fsImpl = fs, ...pathOptions } = {}) {
  if (!ASSIGNABLE_HOSTS.includes(host)) throw new Error(`${host} hereda el modelo de la sesión: no admite modelos por tier`);
  const current = readUserModels({ fs: fsImpl, ...pathOptions });
  if (current.warning) throw new Error(`no se guarda la asignación: corrige o borra antes ${current.file} (${current.warning})`);
  const models = structuredClone(current.models);
  const tiers = { ...(models[host] || {}) };
  for (const [tier, value] of Object.entries(updates)) {
    if (!KNOWN_TIERS.includes(tier)) throw new Error(`tier desconocido "${tier}"`);
    if (value === null || !String(value).trim()) delete tiers[tier];
    else if (!isModelName(String(value).trim())) throw new Error(`modelo no válido para ${tier}: una línea de 1 a 200 caracteres`);
    else tiers[tier] = String(value).trim();
  }
  if (Object.keys(tiers).length) models[host] = tiers;
  else delete models[host];
  fsImpl.mkdirSync(path.dirname(current.file), { recursive: true });
  const temp = `${current.file}.${process.pid}.tmp`;
  fsImpl.writeFileSync(temp, formatUserModels(models), "utf8");
  fsImpl.renameSync(temp, current.file);
  return { file: current.file, models };
}

// Takes every `--model <tier>=<model>` (or `--model=<tier>=<model>`) out of an
// installer's argv; an empty model clears that tier.
function parseModelFlags(argv) {
  const rest = [];
  const updates = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    let spec;
    if (arg === "--model") {
      spec = argv[i + 1];
      i += 1;
      if (spec === undefined) return { argv: rest, updates, error: "--model necesita <tier>=<modelo>" };
    } else if (arg.startsWith("--model=")) {
      spec = arg.slice("--model=".length);
    } else {
      rest.push(arg);
      continue;
    }
    const separator = spec.indexOf("=");
    const tier = separator === -1 ? spec : spec.slice(0, separator);
    if (separator === -1 || !KNOWN_TIERS.includes(tier)) return { argv: rest, updates, error: `--model necesita <tier>=<modelo>, con tier ${KNOWN_TIERS.join(", ")}: ${spec}` };
    const value = spec.slice(separator + 1).trim();
    updates[tier] = value || null;
  }
  return { argv: rest, updates, error: null };
}

// One call per installer: persist the --model flags and read the assignment
// for the host. `unassigned` lists the tiers whose agents inherit. With
// `persist: false` (a dry run) the flags apply to this run only.
function prepareUserModels(argv, host, { persist = true, ...options } = {}) {
  const flags = parseModelFlags(argv);
  const result = { argv: flags.argv, userModels: {}, saved: null, warning: null, unassigned: [], file: userModelsPath(options), error: flags.error };
  if (flags.error) return result;
  const updates = Object.keys(flags.updates).length > 0;
  if (updates && !ASSIGNABLE_HOSTS.includes(host)) {
    result.error = `${host} hereda el modelo de la sesión: no admite modelos por tier`;
    return result;
  }
  if (updates && persist) {
    try {
      result.saved = writeUserModels(host, flags.updates, options).file;
    } catch (error) {
      result.error = error.message;
      return result;
    }
  }
  if (!ASSIGNABLE_HOSTS.includes(host)) return result;
  const { models, warning } = readUserModels(options);
  result.warning = warning;
  result.userModels = { ...(models[host] || {}) };
  if (updates && !persist) {
    for (const [tier, value] of Object.entries(flags.updates)) {
      if (value === null) delete result.userModels[tier];
      else result.userModels[tier] = value;
    }
  }
  // Claude's tiers fall back to the aliases of models.yaml, never to inherit.
  result.unassigned = host === "claude" ? [] : KNOWN_TIERS.filter(tier => !result.userModels[tier]);
  return result;
}

module.exports = {
  ASSIGNABLE_HOSTS,
  formatUserModels,
  isModelName,
  parseModelFlags,
  parseUserModels,
  prepareUserModels,
  readUserModels,
  userModelsPath,
  writeUserModels,
};
