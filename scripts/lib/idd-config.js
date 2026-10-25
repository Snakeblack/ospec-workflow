"use strict";

// IDD project configuration (openspec/specs/idd/spec.md, REQ-idd-013). It lives
// in idd/config.yaml next to the changes: openspec/ belongs to the SDD mode and
// IDD reads neither its configuration nor its state from there. A small YAML
// subset: top-level scalars and one level of nested keys holding scalars,
// inline lists or block lists. Pure: idd-workspace.js reads the file.

const { CHANGE_ROOT, MODES } = require("./idd-contract.js");
const { validateContracts } = require("./idd-contracts.js");
const { validateImpact } = require("./idd-impact.js");
const { BRANCHING_VALUES, teamDefaults, validateTeam } = require("./team-profile.js");

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
  return text.replace(/\s+#.*$/, "").trim();
}

function parseScalar(raw) {
  const text = raw.trim();
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
function parseSection(name, lines) {
  const section = {};
  let listKey = null;
  for (const line of lines) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) {
      section[listKey].push(parseScalar(item[1]));
      continue;
    }
    const entry = /^\s+([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!entry) throw new IddConfigError(`unreadable ${name} line: ${line.trim()}`);
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

// The checks `ospec check` runs, as `name: command`, in declared order
// (REQ-idd-014). A command holding ` #` must be quoted.
function parseChecks(lines) {
  return Object.entries(parseSection("checks", lines)).map(([name, command]) => {
    if (typeof command !== "string" || command === "") throw new IddConfigError(`check ${name} must be one command`);
    return { name, command };
  });
}

// How changes reach the default branch (REQ-idd-023): an explicit choice
// that wins over the team profile.
function parseDelivery(lines) {
  const section = parseSection("delivery", lines);
  for (const key of Object.keys(section)) {
    if (key !== "branching") throw new IddConfigError(`unknown delivery key: ${key}`);
  }
  const { branching = null } = section;
  if (branching !== null && !BRANCHING_VALUES.includes(branching)) {
    const got = typeof branching === "string" ? branching : "nothing";
    throw new IddConfigError(`delivery.branching must be ${BRANCHING_VALUES.join(" or ")}, got ${got}`);
  }
  return { branching };
}

function parseBoolean(key, value) {
  if (value !== "true" && value !== "false") throw new IddConfigError(`${key} must be true or false`);
  return value === "true";
}

function parseIddConfig(text) {
  const raw = {};
  let section = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (line.trim() === "" || /^\s*#/.test(line)) continue;
    if (/^\s/.test(line)) {
      if (!section) throw new IddConfigError(`unreadable idd config line: ${line.trim()}`);
      section.lines.push(line);
      continue;
    }
    const entry = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
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
  const delivery = raw.delivery ? parseDelivery(raw.delivery.lines) : { branching: null };
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
