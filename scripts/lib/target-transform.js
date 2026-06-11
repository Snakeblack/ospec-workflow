"use strict";

// Pure transform: reshapes the canonical VS Code-format plugin source into a
// target-native file collection. NO filesystem, network, or process side
// effects; the input `files` is never mutated. All IO lives in
// scripts/configure/cli.js. Composes the per-concern transforms below, driven
// entirely by the declarative target profile. See design.md / specs/target-generator.

const { parse, serialize, getField, stripKeys, setScalar, setArray } = require("./frontmatter.js");
const { resolveModel, OMIT } = require("./model-resolver.js");

// A file collection is an array of { path, content:string }.

function transform({ files, profile, models }) {
  const rulesContent = collectRules(files, profile);
  const out = [];

  for (const file of files) {
    const handled = handleFile(file, profile, models, rulesContent);
    if (handled === null) {
      continue; // dropped (e.g. rules inlined elsewhere)
    }
    out.push(handled);
  }

  return { files: out };
}

function handleFile(file, profile, models, rulesContent) {
  const { path } = file;

  if (profile.manifest && path === profile.manifest.location) {
    return reshapeManifest(file, profile);
  }

  if (profile.hooks && profile.hooks.shape === "nested" && path === (profile.hooks.location || "hooks/hooks.json")) {
    return nestHooks(file);
  }

  if (isRulesFile(path)) {
    if (profile.rules && profile.rules.strategy === "inline-into-agent") {
      return null; // content folded into the orchestrator agent
    }
    return { path, content: file.content };
  }

  if (isAgent(path, profile)) {
    return handleAgent(file, profile, models, rulesContent);
  }

  if (isCommand(path, profile)) {
    return handleCommand(file, profile);
  }

  return { path, content: file.content };
}

// --- dispatch helpers ------------------------------------------------------

function isRulesFile(path) {
  return path.startsWith("rules/");
}

function isAgent(path, profile) {
  return path.startsWith("agents/") && path.endsWith(profile.agentFile.from);
}

function isCommand(path, profile) {
  return path.startsWith("commands/") && path.endsWith(profile.commandFile.from);
}

function renameExtension(path, { from, to }) {
  return from === to ? path : path.slice(0, path.length - from.length) + to;
}

// --- manifest --------------------------------------------------------------

function reshapeManifest(file, profile) {
  const obj = JSON.parse(file.content);
  const { omitFields = [], dropFields = [] } = profile.manifest;

  for (const key of omitFields) {
    if (typeof obj[key] === "string") {
      delete obj[key];
    }
  }
  for (const key of dropFields) {
    delete obj[key];
  }

  return { path: file.path, content: JSON.stringify(obj, null, 2) };
}

// --- hooks -----------------------------------------------------------------

function nestHooks(file) {
  const obj = JSON.parse(file.content);
  const events = obj.hooks || {};
  const nested = {};

  for (const [event, entries] of Object.entries(events)) {
    nested[event] = [{ hooks: entries }];
  }

  return { path: file.path, content: JSON.stringify({ ...obj, hooks: nested }, null, 2) };
}

// --- rules inlining --------------------------------------------------------

function collectRules(files, profile) {
  if (!profile.rules || profile.rules.strategy !== "inline-into-agent") {
    return "";
  }

  const parts = [];
  for (const file of files) {
    if (isRulesFile(file.path)) {
      parts.push(parse(file.content).body.trim());
    }
  }

  return parts.join("\n\n");
}

// --- agents ----------------------------------------------------------------

function handleAgent(file, profile, models, rulesContent) {
  const newPath = renameExtension(file.path, profile.agentFile);
  let { frontmatter, body } = parse(file.content);
  const nameField = getField(frontmatter, "name");
  const agentName = nameField ? nameField.value : undefined;

  if (profile.frontmatter && profile.frontmatter.stripKeys) {
    frontmatter = stripKeys(frontmatter, profile.frontmatter.stripKeys);
  }

  if (profile.toolMap) {
    frontmatter = mapToolsFrontmatter(frontmatter, profile.toolMap);
    body = substituteProse(body, profile.toolMap);
  }

  if (profile.model && agentName) {
    const resolved = resolveModel(agentName, profile.id, models);
    if (resolved !== OMIT) {
      frontmatter = Array.isArray(resolved)
        ? setArray(frontmatter, "model", resolved)
        : setScalar(frontmatter, "model", resolved);
    }
  }

  if (rulesContent && profile.rules && profile.rules.agent && agentName === profile.rules.agent) {
    body = body.replace(/\s*$/, "") + "\n\n" + rulesContent + "\n";
  }

  return { path: newPath, content: serialize({ frontmatter, body }) };
}

// --- commands --------------------------------------------------------------

function handleCommand(file, profile) {
  const newPath = renameExtension(file.path, profile.commandFile);
  let { frontmatter, body } = parse(file.content);

  if (profile.frontmatter && profile.frontmatter.stripKeys) {
    frontmatter = stripKeys(frontmatter, profile.frontmatter.stripKeys);
  }

  if (profile.toolMap) {
    frontmatter = mapToolsFrontmatter(frontmatter, profile.toolMap);
    body = substituteProse(body, profile.toolMap);
  }

  if (profile.commandVars) {
    const named = [];
    body = body.replace(/\$\{input:([A-Za-z0-9_-]+)\}/g, (_match, name) => {
      named.push(name);
      return "$" + name;
    });
    body = body.replace(/\$\{input\}/g, "$ARGUMENTS");
    if (named.length > 0) {
      frontmatter = setScalar(frontmatter, "argument-hint", named.join(" "));
    }
  }

  if (profile.frontmatter && profile.frontmatter.commandRouting) {
    const addKeys = profile.frontmatter.commandRouting.addKeys || {};
    for (const [key, value] of Object.entries(addKeys)) {
      frontmatter = setScalar(frontmatter, key, value);
    }
  }

  return { path: newPath, content: serialize({ frontmatter, body }) };
}

// --- tool-name substitution ------------------------------------------------

function mapToolsFrontmatter(frontmatter, toolMap) {
  const field = getField(frontmatter, "tools");
  if (!field || !Array.isArray(field.value)) {
    return frontmatter;
  }

  const mapped = [];
  for (const tool of field.value) {
    const replacement = toolMap[tool];
    if (replacement === undefined) {
      mapped.push(tool);
    } else if (Array.isArray(replacement)) {
      mapped.push(...replacement);
    } else {
      mapped.push(replacement);
    }
  }

  return setArray(frontmatter, "tools", mapped);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}

// Match a tool name as a distinct token: not flanked by word chars or a slash,
// so generic names (read, edit) don't corrupt substrings like "already".
function tokenRegExp(key) {
  return new RegExp(`(?<![\\w/])${escapeRegExp(key)}(?![\\w/])`, "g");
}

function substituteProse(body, toolMap) {
  let out = body;
  // Longest keys first so namespaced names match before any bare prefix.
  const keys = Object.keys(toolMap).sort((a, b) => b.length - a.length);

  for (const key of keys) {
    const replacement = toolMap[key];
    const primary = Array.isArray(replacement) ? replacement[0] : replacement;
    out = out.replace(tokenRegExp(key), primary);
  }

  return out;
}

module.exports = { transform };
