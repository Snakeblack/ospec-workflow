"use strict";

// Bench scenarios (E4.1): one seed repository per project profile, a change
// request (brief), the facts only the simulated user knows, and hidden checks
// that judge the delivered workspace. Only `repo/` ever reaches the agent.
//
// Measurement tooling only: it grants no authority and promotes nothing.

const fs = require("node:fs");
const path = require("node:path");

const { sha256Fingerprint } = require("../../lib/canonical-json.js");

const SCENARIOS_DIR = path.join(__dirname, "scenarios");
const SCENARIO_SCHEMA_VERSION = 1;
const PROFILES = Object.freeze(["cli-local", "saas-small", "regulated", "brownfield", "public-library", "bugfix"]);
const CHECK_KINDS = Object.freeze(["acceptance", "fact", "regression"]);
const SCENARIO_KEYS = Object.freeze(["schema_version", "id", "profile", "title", "brief", "facts"]);
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

function validateChecks(checks, facts, where) {
  if (!Array.isArray(checks) || checks.length === 0) throw new BenchScenarioError(`${where}: checks.js must export a non-empty array`);
  const factIds = new Set(facts.map((fact) => fact.id));
  const seen = new Set();
  return checks.map((check) => {
    if (!isPlainObject(check) || !isNonEmptyString(check.id) || typeof check.run !== "function" || !isNonEmptyString(check.describe)) {
      throw new BenchScenarioError(`${where}: every check needs an id, a describe text, and a run function`);
    }
    if (seen.has(check.id)) throw new BenchScenarioError(`${where}: duplicate check id ${check.id}`);
    seen.add(check.id);
    if (!CHECK_KINDS.includes(check.kind)) throw new BenchScenarioError(`${where}: check ${check.id} kind must be one of ${CHECK_KINDS.join(", ")}`);
    if (check.kind === "fact" && !factIds.has(check.fact)) throw new BenchScenarioError(`${where}: check ${check.id} names unknown fact ${check.fact}`);
    if (check.kind !== "fact" && check.fact !== undefined) throw new BenchScenarioError(`${where}: only fact checks name a fact (${check.id})`);
    return Object.freeze({ id: check.id, kind: check.kind, fact: check.fact || null, describe: check.describe });
  });
}

/** Loads and validates one scenario directory. */
function loadScenario(dir) {
  const where = path.basename(dir);
  let scenario;
  try {
    scenario = JSON.parse(fs.readFileSync(path.join(dir, "scenario.json"), "utf8"));
  } catch (error) {
    throw new BenchScenarioError(`${where}: could not read scenario.json: ${error.message}`);
  }
  if (!isPlainObject(scenario) || !hasExactKeys(scenario, SCENARIO_KEYS)) {
    throw new BenchScenarioError(`${where}: scenario.json must declare exactly ${SCENARIO_KEYS.join(", ")}`);
  }
  if (scenario.schema_version !== SCENARIO_SCHEMA_VERSION) throw new BenchScenarioError(`${where}: schema_version must be ${SCENARIO_SCHEMA_VERSION}`);
  if (!ID_PATTERN.test(scenario.id || "") || scenario.id !== where) throw new BenchScenarioError(`${where}: id must be kebab-case and match its directory`);
  if (!PROFILES.includes(scenario.profile)) throw new BenchScenarioError(`${where}: profile must be one of ${PROFILES.join(", ")}`);
  if (!isNonEmptyString(scenario.title) || !isNonEmptyString(scenario.brief)) throw new BenchScenarioError(`${where}: title and brief must be non-empty`);
  if (!Array.isArray(scenario.facts) || scenario.facts.length === 0
    || !scenario.facts.every((fact) => isPlainObject(fact) && hasExactKeys(fact, ["id", "text"]) && /^F\d+$/.test(fact.id) && isNonEmptyString(fact.text))
    || new Set(scenario.facts.map((fact) => fact.id)).size !== scenario.facts.length) {
    throw new BenchScenarioError(`${where}: facts must be a non-empty list of unique { id: F<n>, text }`);
  }
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
    brief: scenario.brief,
    facts: Object.freeze(scenario.facts.map((fact) => Object.freeze({ ...fact }))),
    checks: Object.freeze(validateChecks(checks, scenario.facts, where)),
    dir,
    repoDir,
    checksPath,
  });
}

/** Loads the corpus: every profile covered, in PROFILES order, then by id. */
function loadScenarios(root = SCENARIOS_DIR) {
  const scenarios = fs.readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadScenario(path.join(root, entry.name)));
  const missing = PROFILES.filter((profile) => !scenarios.some((scenario) => scenario.profile === profile));
  if (missing.length > 0) throw new BenchScenarioError(`corpus has missing profiles: ${missing.join(", ")}`);
  return scenarios.sort((a, b) => PROFILES.indexOf(a.profile) - PROFILES.indexOf(b.profile) || a.id.localeCompare(b.id));
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
    && !/^(scenarios|__fixtures__|records)\//.test(file));
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
  PROFILES,
  SCENARIOS_DIR,
  harnessDigest,
  listFiles,
  loadScenario,
  loadScenarios,
  materializeRepo,
  scenariosDigest,
};
