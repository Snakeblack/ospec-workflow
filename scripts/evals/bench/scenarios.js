"use strict";

// Bench scenarios (E4.1): one seed repository per project profile, a change
// request (brief), the facts only the simulated user knows, and hidden checks
// that judge the delivered workspace. Only `repo/` ever reaches the agent.
//
// Four corpora: `default`, the six profiles of E4.1 and E4.2, `greenfield`
// (E4.5), a project built from an almost empty repository, `reserved`
// (OSP-011), a task frozen before the head-to-head runs that judge it, with
// ids of its own, and `knowledge` (E4.17), frozen and not runnable yet: two
// sessions with seeded, empty or contradictory memory, a brownfield repository
// whose ADR has an executable check, and a security sink outside `auth/`. They
// live in separate directories, so adding one never changes another's digest.
//
// A scenario of schema 2 has two sessions, each with its brief and facts, and
// the memory the bench writes before the second; each of its checks declares
// the session after which it judges.
//
// Measurement tooling only: it grants no authority and promotes nothing.

const fs = require("node:fs");
const path = require("node:path");

const { sha256Fingerprint } = require("../../lib/canonical-json.js");

const SCENARIOS_DIR = path.join(__dirname, "scenarios");
const PROFILES = Object.freeze(["cli-local", "saas-small", "regulated", "brownfield", "public-library", "bugfix"]);
const CORPORA = Object.freeze({
  default: Object.freeze({ dir: SCENARIOS_DIR, profiles: PROFILES }),
  greenfield: Object.freeze({ dir: path.join(__dirname, "scenarios-greenfield"), profiles: Object.freeze(["greenfield"]) }),
  reserved: Object.freeze({ dir: path.join(__dirname, "scenarios-reserved"), profiles: Object.freeze(["saas-small"]) }),
  knowledge: Object.freeze({
    dir: path.join(__dirname, "scenarios-knowledge"),
    profiles: Object.freeze(["two-sessions", "architecture", "security"]),
    runnable: false,
  }),
});
const CHECK_KINDS = Object.freeze(["acceptance", "fact", "regression"]);
const SCENARIO_KEYS = Object.freeze({
  1: Object.freeze(["schema_version", "id", "profile", "title", "brief", "facts"]),
  2: Object.freeze(["schema_version", "id", "profile", "title", "sessions", "memory"]),
});
const SESSION_COUNT = 2;
const MEMORY_VARIANTS = Object.freeze(["seeded", "contradictory"]);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

class BenchScenarioError extends Error {
  constructor(message, code = "INVALID_BENCH_SCENARIO") {
    super(message);
    this.name = "BenchScenarioError";
    this.code = code;
  }
}

const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

function hasExactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && [...keys].sort().every((key, index) => key === actual[index]);
}

/**
 * factSessions maps each fact id to the session that discloses it; sessions is
 * the session count of a schema 2 scenario, or null.
 */
function validateChecks(checks, factSessions, where, sessions = null) {
  if (!Array.isArray(checks) || checks.length === 0) throw new BenchScenarioError(`${where}: checks.js must export a non-empty array`);
  const seen = new Set();
  return checks.map((check) => {
    if (!isPlainObject(check) || !isNonEmptyString(check.id) || typeof check.run !== "function" || !isNonEmptyString(check.describe)) {
      throw new BenchScenarioError(`${where}: every check needs an id, a describe text, and a run function`);
    }
    if (seen.has(check.id)) throw new BenchScenarioError(`${where}: duplicate check id ${check.id}`);
    seen.add(check.id);
    if (!CHECK_KINDS.includes(check.kind)) throw new BenchScenarioError(`${where}: check ${check.id} kind must be one of ${CHECK_KINDS.join(", ")}`);
    if (check.kind === "fact" && !factSessions.has(check.fact)) throw new BenchScenarioError(`${where}: check ${check.id} names unknown fact ${check.fact}`);
    if (check.kind !== "fact" && check.fact !== undefined) throw new BenchScenarioError(`${where}: only fact checks name a fact (${check.id})`);
    const entry = { id: check.id, kind: check.kind, fact: check.fact || null, describe: check.describe };
    if (sessions === null) {
      if (check.session !== undefined) throw new BenchScenarioError(`${where}: only a scenario with sessions gives a check its session (${check.id})`);
    } else {
      if (!Number.isInteger(check.session) || check.session < 1 || check.session > sessions) {
        throw new BenchScenarioError(`${where}: check ${check.id} must declare the session it judges, 1 to ${sessions}`);
      }
      if (check.kind === "fact" && factSessions.get(check.fact) > check.session) {
        throw new BenchScenarioError(`${where}: check ${check.id} judges fact ${check.fact} before the session that discloses it`);
      }
      entry.session = check.session;
    }
    return Object.freeze(entry);
  });
}

const isFactList = (facts) => Array.isArray(facts) && facts.length > 0
  && facts.every((fact) => isPlainObject(fact) && hasExactKeys(fact, ["id", "text"]) && /^F\d+$/.test(fact.id) && isNonEmptyString(fact.text));

const freezeFacts = (facts) => Object.freeze(facts.map((fact) => Object.freeze({ ...fact })));

function readSessions(scenario, where) {
  const { sessions, memory } = scenario;
  if (!Array.isArray(sessions) || sessions.length !== SESSION_COUNT
    || !sessions.every((session) => isPlainObject(session) && hasExactKeys(session, ["brief", "facts"]) && isNonEmptyString(session.brief) && isFactList(session.facts))) {
    throw new BenchScenarioError(`${where}: sessions must be ${SESSION_COUNT} entries of { brief, facts }, each with a non-empty brief and facts of { id: F<n>, text }`);
  }
  const ids = sessions.flatMap((session) => session.facts.map((fact) => fact.id));
  if (new Set(ids).size !== ids.length) throw new BenchScenarioError(`${where}: fact ids must be unique across sessions`);
  if (!isPlainObject(memory) || !hasExactKeys(memory, MEMORY_VARIANTS)
    || !MEMORY_VARIANTS.every((variant) => isPlainObject(memory[variant]) && hasExactKeys(memory[variant], ["title", "content"])
      && isNonEmptyString(memory[variant].title) && isNonEmptyString(memory[variant].content))) {
    throw new BenchScenarioError(`${where}: memory must declare ${MEMORY_VARIANTS.join(" and ")}, each { title, content }`);
  }
  return {
    sessions: Object.freeze(sessions.map((session) => Object.freeze({ brief: session.brief, facts: freezeFacts(session.facts) }))),
    memory: Object.freeze(Object.fromEntries(MEMORY_VARIANTS.map((variant) => [variant, Object.freeze({ ...memory[variant] })]))),
  };
}

/** Loads and validates one scenario directory. */
function loadScenario(dir, profiles = PROFILES) {
  const where = path.basename(dir);
  let scenario;
  try {
    scenario = JSON.parse(fs.readFileSync(path.join(dir, "scenario.json"), "utf8"));
  } catch (error) {
    throw new BenchScenarioError(`${where}: could not read scenario.json: ${error.message}`);
  }
  if (!isPlainObject(scenario)) throw new BenchScenarioError(`${where}: scenario.json must hold an object`);
  const keys = SCENARIO_KEYS[scenario.schema_version];
  if (!Number.isInteger(scenario.schema_version) || !keys) {
    throw new BenchScenarioError(`${where}: schema_version must be one of ${Object.keys(SCENARIO_KEYS).join(", ")}`);
  }
  if (!hasExactKeys(scenario, keys)) throw new BenchScenarioError(`${where}: scenario.json must declare exactly ${keys.join(", ")}`);
  if (!ID_PATTERN.test(scenario.id || "") || scenario.id !== where) throw new BenchScenarioError(`${where}: id must be kebab-case and match its directory`);
  if (!profiles.includes(scenario.profile)) throw new BenchScenarioError(`${where}: profile must be one of ${profiles.join(", ")}`);
  if (!isNonEmptyString(scenario.title)) throw new BenchScenarioError(`${where}: title must be non-empty`);
  let content;
  if (scenario.schema_version === 1) {
    if (!isNonEmptyString(scenario.brief)) throw new BenchScenarioError(`${where}: title and brief must be non-empty`);
    if (!isFactList(scenario.facts) || new Set(scenario.facts.map((fact) => fact.id)).size !== scenario.facts.length) {
      throw new BenchScenarioError(`${where}: facts must be a non-empty list of unique { id: F<n>, text }`);
    }
    content = { brief: scenario.brief, facts: freezeFacts(scenario.facts) };
  } else {
    const { sessions, memory } = readSessions(scenario, where);
    content = { facts: Object.freeze(sessions.flatMap((session) => session.facts)), sessions, memory };
  }
  const factSessions = new Map((content.sessions || [content]).flatMap((session, index) => session.facts.map((fact) => [fact.id, index + 1])));
  const repoDir = path.join(dir, "repo");
  if (!fs.existsSync(repoDir) || !fs.statSync(repoDir).isDirectory()) throw new BenchScenarioError(`${where}: repo/ is missing`);
  const checksPath = path.join(dir, "checks.js");
  let checks;
  try {
    delete require.cache[require.resolve(checksPath)];
    checks = require(checksPath);
  } catch (error) {
    throw new BenchScenarioError(`${where}: could not load checks.js: ${error.message}`);
  }
  return Object.freeze({
    id: scenario.id,
    profile: scenario.profile,
    title: scenario.title,
    ...content,
    checks: Object.freeze(validateChecks(checks, factSessions, where, content.sessions ? content.sessions.length : null)),
    dir,
    repoDir,
    checksPath,
  });
}

/** Loads a corpus: every profile covered, in profile order, then by id. */
function loadScenarios(root = SCENARIOS_DIR, profiles = PROFILES) {
  const scenarios = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadScenario(path.join(root, entry.name), profiles));
  const missing = profiles.filter((profile) => !scenarios.some((scenario) => scenario.profile === profile));
  if (missing.length > 0) throw new BenchScenarioError(`corpus has missing profiles: ${missing.join(", ")}`);
  return scenarios.sort((a, b) => profiles.indexOf(a.profile) - profiles.indexOf(b.profile) || a.id.localeCompare(b.id));
}

/** Loads a corpus by name (`default`, `greenfield` or `reserved`). */
function loadCorpus(name = "default") {
  const corpus = CORPORA[name];
  if (!corpus) throw new BenchScenarioError(`unknown corpus ${name}; known corpora: ${Object.keys(CORPORA).join(", ")}`, "UNKNOWN_BENCH_CORPUS");
  return loadScenarios(corpus.dir, corpus.profiles);
}

function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, base);
    return [path.relative(base, full).split(path.sep).join("/")];
  }).sort();
}

/**
 * Content digest of the scenarios (scenario.json, checks.js, and repo/),
 * independent of the checkout's line endings.
 */
function scenariosDigest(scenarios) {
  const content = scenarios.map((scenario) => ({
    id: scenario.id,
    files: listFiles(scenario.dir).map((file) => [
      file,
      fs.readFileSync(path.join(scenario.dir, file), "utf8").replace(/\r\n/g, "\n"),
    ]),
  }));
  return sha256Fingerprint("ospec-bench-scenarios-v1", content).replace(/^sha256:/, "");
}

/**
 * Digest of the bench code itself (driver, persona, host, record, checkpoint),
 * so records produced by different harness versions are never compared.
 * Scenarios, fixtures, records, and tests are excluded.
 */
function harnessDigest(dir = __dirname) {
  const files = listFiles(dir).filter((file) => file.endsWith(".js") && !file.endsWith(".test.js")
    && !/^(scenarios(-[a-z]+)?|__fixtures__|records)\//.test(file));
  const content = files.map((file) => [file, fs.readFileSync(path.join(dir, file), "utf8").replace(/\r\n/g, "\n")]);
  return sha256Fingerprint("ospec-bench-harness-v1", content).replace(/^sha256:/, "");
}

/** Copies the scenario's seed repository (and nothing else) into dest. */
function materializeRepo(scenario, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const file of listFiles(scenario.repoDir)) {
    const target = path.join(dest, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, fs.readFileSync(path.join(scenario.repoDir, file), "utf8").replace(/\r\n/g, "\n"));
  }
}

module.exports = {
  BenchScenarioError,
  CHECK_KINDS,
  CORPORA,
  PROFILES,
  SCENARIOS_DIR,
  harnessDigest,
  listFiles,
  loadCorpus,
  loadScenario,
  loadScenarios,
  materializeRepo,
  scenariosDigest,
};
