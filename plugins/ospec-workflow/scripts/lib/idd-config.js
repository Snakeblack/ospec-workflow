"use strict";

// IDD project configuration (openspec/specs/idd/spec.md, REQ-idd-013). It lives
// in idd/config.yaml next to the changes: openspec/ belongs to the SDD mode and
// IDD reads neither its configuration nor its state from there. A small YAML
// subset: top-level scalars and one level of nested keys holding scalars,
// inline lists or block lists. Pure: idd-workspace.js reads the file.

const { CHANGE_ROOT, MODES } = require("./idd-contract.js");
const { validateContracts } = require("./idd-contracts.js");
const { validateImpact } = require("./idd-impact.js");
const { BRANCHING_VALUES, CHANGELOG_NONE, RELEASE_VALUES, teamDefaults, validateTeam } = require("./team-profile.js");
const { isBlockScalarHeader, opaqueScalarLines } = require("./yaml-lite.js");

const CONFIG_FILE = `${CHANGE_ROOT}/config.yaml`;
const CONFIG_KEYS = Object.freeze(["mode", "strict_tdd", "team", "delivery", "checks", "impact", "contracts"]);
const SECTION_KEYS = new Set(["team", "delivery", "checks", "impact", "contracts"]);

class IddConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "IddConfigError";
    this.code = "config-invalid";
  }
}

function stripComment(text) {
  return text.replace(/(?<!\s)\s+#[^\n]*$/, "").trim();
}

function parseScalar(raw) {
  const text = raw.trim();
  if (isBlockScalarHeader(text)) throw new IddConfigError(`a block scalar (${text}) is not supported: write the value on one line`);
  const quoted = /^(["'])(.*)\1/.exec(text);
  return quoted ? quoted[2] : stripComment(text);
}

function parseInlineList(raw) {
  const body = stripComment(raw).replace(/^\[/, "").replace(/\]$/, "").trim();
  if (body === "") return [];
  return body.split(",").map(parseScalar).filter((item) => item !== "");
}

function parseValue(raw) {
  return stripComment(raw).startsWith("[") ? parseInlineList(raw) : parseScalar(raw);
}

// Nested `key: value`, `key: [a, b]` or `key:` followed by `- item` lines.
// Every entry sits at the indentation of the first one (REQ-idd-013): a key
// indented deeper, as under a plain scalar, is unreadable, never another entry.
function parseSection(name, lines) {
  const section = {};
  let listKey = null;
  let indent = null;
  for (const line of lines) {
    const item = /^\s+-\s+([^\n]*)$/.exec(line);
    if (item && listKey) {
      section[listKey].push(parseScalar(item[1]));
      continue;
    }
    const entry = /^\s+([A-Za-z0-9_-]+):\s*([^\n]*)$/.exec(line);
    if (!entry) throw new IddConfigError(`unreadable ${name} line: ${line.trim()}`);
    const lineIndent = line.length - line.trimStart().length;
    indent ??= lineIndent;
    if (lineIndent !== indent) throw new IddConfigError(`unreadable ${name} line: ${line.trim()} (indented unlike the first entry of ${name})`);
    const [, key, raw] = entry;
    if (stripComment(raw) === "") {
      section[key] = [];
      listKey = key;
    } else {
      section[key] = parseValue(raw);
      listKey = null;
    }
  }
  return section;
}

const CHECK_KEYS = Object.freeze(["run", "paths"]);

// A path of a scoped check stays inside the project: relative, without `..`.
function checkPath(name, raw) {
  const value = raw.replace(/\\/g, "/").replace(/^\.\//, "");
  if (value === "" || /^\/|^[A-Za-z]:/.test(value) || value.split("/").includes("..")) {
    throw new IddConfigError(`check ${name} paths must be relative paths inside the project, got ${raw === "" ? "nothing" : raw}`);
  }
  return value;
}

// `name:` with `run:` and `paths:` below it (E1.67): the check runs only when
// the diff touches one of its paths. Without paths it is a plain check.
function parseScopedCheck(name, body) {
  if (body.length === 0 || /^\s*-\s/.test(body[0])) throw new IddConfigError(`check ${name} must be one command`);
  const fields = parseSection(`check ${name}`, body);
  for (const key of Object.keys(fields)) {
    if (!CHECK_KEYS.includes(key)) throw new IddConfigError(`unknown key ${key} in check ${name}: a check holds ${CHECK_KEYS.join(" and ")}`);
  }
  if (typeof fields.run !== "string" || fields.run === "") throw new IddConfigError(`check ${name} must be one command`);
  if (!("paths" in fields)) return { name, command: fields.run };
  const paths = Array.isArray(fields.paths) ? fields.paths : [fields.paths].filter((item) => item !== "");
  if (paths.length === 0) throw new IddConfigError(`check ${name} paths must list at least one path`);
  return { name, command: fields.run, paths: paths.map((item) => checkPath(name, item)) };
}

// The checks `ospec check` runs, as `name: command`, in declared order
// (REQ-idd-014), or scoped to the paths that justify them (E1.67). A command
// holding ` #` must be quoted. A repeated name keeps its first position and
// its last value, and at least one check runs on every change.
function parseChecks(lines) {
  const groups = [];
  let indent = null;
  for (const line of lines) {
    const lineIndent = line.length - line.trimStart().length;
    indent ??= lineIndent;
    if (groups.length > 0 && (lineIndent > indent || /^\s*-\s/.test(line))) groups.at(-1).body.push(line);
    else groups.push({ line, body: [] });
  }
  const checks = new Map();
  for (const { line, body } of groups) {
    const entry = /^\s+([A-Za-z0-9_-]+):\s*([^\n]*)$/.exec(line);
    if (!entry) throw new IddConfigError(`unreadable checks line: ${line.trim()}`);
    const [, name, raw] = entry;
    if (stripComment(raw) === "") {
      checks.set(name, parseScopedCheck(name, body));
      continue;
    }
    if (body.length > 0) throw new IddConfigError(`unreadable checks line: ${body[0].trim()} (indented unlike the first entry of checks)`);
    const command = parseValue(raw);
    if (typeof command !== "string" || command === "") throw new IddConfigError(`check ${name} must be one command`);
    checks.set(name, { name, command });
  }
  const list = [...checks.values()];
  if (list.length > 0 && list.every((check) => check.paths)) {
    throw new IddConfigError("every check declares paths, so a change that touches none of them could never close: declare at least one check without paths");
  }
  return list;
}

const DELIVERY_KEYS = Object.freeze(["branching", "changelog", "release", "integration_branch", "production_branch"]);
const NO_DELIVERY = Object.freeze({ branching: null, changelog: null, release: null, integration_branch: null, production_branch: null });

function describeGot(value) {
  return typeof value === "string" ? value : "nothing";
}

// A branch name git accepts (git check-ref-format --branch), checked without
// running git: the delivery rules name it.
function validBranch(value) {
  if (typeof value !== "string" || value === "" || value === "@" || value.startsWith("-") || value.endsWith(".")) return false;
  if (/[\x00-\x20\x7f~^:?*[\\]|\.\.|@\{/.test(value)) return false;
  return value.split("/").every((part) => part !== "" && !part.startsWith(".") && !part.endsWith(".lock"));
}

// The changelog close writes to: `none`, or a relative path that stays inside
// the project, since close writes it (REQ-idd-025).
function validChangelog(value) {
  if (typeof value !== "string" || value === "") return false;
  if (value === CHANGELOG_NONE) return true;
  return !/^[\\/]|^[A-Za-z]:|\\/.test(value) && !value.split("/").some((part) => part === "" || part === "." || part === "..");
}

// How changes reach the default branch, or the integration branch that sits
// apart from production, what they leave in the changelog and when a version
// is cut (REQ-idd-023): explicit choices that win over the team profile.
function parseDelivery(lines) {
  const section = parseSection("delivery", lines);
  for (const key of Object.keys(section)) {
    if (!DELIVERY_KEYS.includes(key)) throw new IddConfigError(`unknown delivery key: ${key}`);
  }
  const { branching = null, changelog = null, release = null, integration_branch = null, production_branch = null } = section;
  for (const [key, value] of [["integration_branch", integration_branch], ["production_branch", production_branch]]) {
    if (value !== null && !validBranch(value)) throw new IddConfigError(`delivery.${key} must be a branch name git accepts, got ${describeGot(value)}`);
  }
  if (production_branch !== null && integration_branch === null) {
    throw new IddConfigError("delivery.production_branch needs delivery.integration_branch");
  }
  if (integration_branch !== null && integration_branch === production_branch) {
    throw new IddConfigError(`delivery.integration_branch must differ from delivery.production_branch, got ${integration_branch} for both`);
  }
  // Each promotion to production is a version, never each merge into the
  // integration branch.
  if (integration_branch !== null && release === "per-change") {
    throw new IddConfigError("delivery.release must be batched or none with delivery.integration_branch, got per-change");
  }
  if (branching !== null && !BRANCHING_VALUES.includes(branching)) {
    throw new IddConfigError(`delivery.branching must be ${BRANCHING_VALUES.join(" or ")}, got ${describeGot(branching)}`);
  }
  if (changelog !== null && !validChangelog(changelog)) {
    throw new IddConfigError(`delivery.changelog must be a relative path inside the project or ${CHANGELOG_NONE}, got ${describeGot(changelog)}`);
  }
  if (release !== null && !RELEASE_VALUES.includes(release)) {
    throw new IddConfigError(`delivery.release must be ${RELEASE_VALUES.join(", ")}, got ${describeGot(release)}`);
  }
  return { branching, changelog, release, integration_branch, production_branch };
}

function parseBoolean(key, value) {
  if (value !== "true" && value !== "false") throw new IddConfigError(`${key} must be true or false`);
  return value === "true";
}

// REQ-idd-013: a value that continues on more lines (the content of a block
// scalar, a multi-line quoted or flow scalar, a value on the line after its
// key) is refused, never read as more keys.
function refuseMultiLineValues(text) {
  const { lines, error } = opaqueScalarLines(String(text));
  if (error) throw new IddConfigError(`unreadable idd config: ${error}`);
  const original = String(text).split(/\r?\n/);
  const index = original.findIndex((line, i) => !lines[i] && line.trim() !== "");
  if (index !== -1) throw new IddConfigError(`unreadable idd config line ${index + 1}: a value that continues on more lines is not supported; write it on one line`);
}

function parseIddConfig(text) {
  const raw = {};
  let section = null;
  refuseMultiLineValues(text);
  for (const line of String(text).split(/\r?\n/)) {
    if (line.trim() === "" || /^\s*#/.test(line)) continue;
    if (/^\s/.test(line)) {
      if (!section) throw new IddConfigError(`unreadable idd config line: ${line.trim()}`);
      section.lines.push(line);
      continue;
    }
    const entry = /^([A-Za-z_]+):\s*([^\n]*)$/.exec(line);
    if (!entry) throw new IddConfigError(`unreadable idd config line: ${line.trim()}`);
    const [, key, value] = entry;
    if (!CONFIG_KEYS.includes(key)) throw new IddConfigError(`unknown idd config key: ${key}`);
    if (key in raw) throw new IddConfigError(`duplicate idd config key: ${key}`);
    if (SECTION_KEYS.has(key)) {
      if (stripComment(value) !== "") throw new IddConfigError(`${key} must be a section`);
      section = { lines: [] };
      raw[key] = section;
    } else {
      raw[key] = parseScalar(value);
      section = null;
    }
  }

  const mode = raw.mode ?? null;
  if (mode !== null && !MODES.includes(mode)) throw new IddConfigError(`mode must be ${MODES.join(" or ")}, got ${mode}`);
  let team = null;
  if (raw.team) {
    try {
      team = validateTeam(parseSection("team", raw.team.lines));
    } catch (error) {
      if (error instanceof IddConfigError) throw error;
      throw new IddConfigError(error.message);
    }
  }
  // An explicit strict_tdd wins; without it the team profile decides (REQ-idd-023).
  const strictTdd = "strict_tdd" in raw ? parseBoolean("strict_tdd", raw.strict_tdd) : team ? teamDefaults(team).strict_tdd : false;
  const delivery = raw.delivery ? parseDelivery(raw.delivery.lines) : { ...NO_DELIVERY };
  const checks = raw.checks ? parseChecks(raw.checks.lines) : [];
  const impact = raw.impact ? validateImpact(parseSection("impact", raw.impact.lines)) : {};
  let contracts = {};
  if (raw.contracts) {
    try {
      contracts = validateContracts(parseSection("contracts", raw.contracts.lines));
    } catch (error) {
      if (error instanceof IddConfigError) throw error;
      throw new IddConfigError(error.message);
    }
  }
  return { mode, strictTdd, team, delivery, checks, impact, contracts };
}

module.exports = {
  CONFIG_FILE,
  CONFIG_KEYS,
  IddConfigError,
  parseIddConfig,
};
