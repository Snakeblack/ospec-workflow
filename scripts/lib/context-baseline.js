"use strict";

// Static context baseline (roadmap E0.0). Measures, from each target's
// generated tree, what a host loads before any work starts: instructions it
// injects on every request, the orchestrator, the skill listing, and what each
// agent is told to read (agent + named skills + named `_shared` files, without
// following references between `_shared` files). Classification reads the
// generated output itself, so a transform change shows up here unchanged.

const fs = require("node:fs");
const path = require("node:path");
const frontmatter = require("./frontmatter.js");

const SCHEMA = "ospec-context-baseline/v1";
const GLOBAL_APPLY_TO = new Set(["**", "**/*"]);
const SKILL_REF = /skills\/([a-z0-9][a-z0-9-]*)\/SKILL\.md/g;
const SHARED_REF = /_shared\/([A-Za-z0-9][A-Za-z0-9._-]*\.md)/g;
const ORCHESTRATOR = /(^|\/)sdd-orchestrator(\/SKILL\.md|\.agent\.md|\.md|\.toml)$/;
const AGENT_FILE = /(^|\/)agents\/([^/]+?)(\.agent\.md|\.md|\.toml)$/;
const SKILL_FILE = /^skills\/(.+\/)?SKILL\.md$/;
const CEILING_METRICS = ["always_on_bytes", "orchestrator_bytes", "skills_installed", "skills_listed", "skill_listing_bytes"];

function bytes(content) {
  return Buffer.byteLength(String(content ?? ""), "utf8");
}

function field(text, key) {
  return frontmatter.getField(frontmatter.parse(text).frontmatter, key);
}

function globToRegExp(glob) {
  const source = glob.split("**").map((part) => part.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*")).join(".*");
  return new RegExp(`^${source}$`);
}

function opencodeInstructionGlobs(byPath) {
  const config = byPath.get("opencode.json");
  if (config === undefined) return [];
  const instructions = JSON.parse(config).instructions;
  return Array.isArray(instructions) ? instructions.map(globToRegExp) : [];
}

function isAlwaysOn(filePath, content, opencodeGlobs) {
  if (filePath === "AGENTS.md") return true;
  if (opencodeGlobs.some((glob) => glob.test(filePath))) return true;
  if (filePath.endsWith(".mdc")) return field(content, "alwaysApply")?.value === "true";
  if (filePath.endsWith(".instructions.md")) return GLOBAL_APPLY_TO.has(field(content, "applyTo")?.value);
  return false;
}

function listingEntry(content) {
  const fields = ["name", "description"].map((key) => field(content, key)).filter(Boolean);
  return fields.map((entry) => entry.rawLines.join("\n")).join("\n");
}

function refs(text, pattern, toPath) {
  return [...String(text).matchAll(pattern)].map((match) => toPath(match[1]));
}

function measureAgent(content, byPath) {
  const skills = refs(content, SKILL_REF, (name) => `skills/${name}/SKILL.md`);
  const sources = [content, ...skills.map((skill) => byPath.get(skill) ?? "")];
  const shared = sources.flatMap((text) => refs(text, SHARED_REF, (name) => `skills/_shared/${name}`));
  const wanted = [...new Set([...skills, ...shared])].sort();
  const reads = {};
  const missing = [];
  for (const wantedPath of wanted) {
    if (byPath.has(wantedPath)) reads[wantedPath] = bytes(byPath.get(wantedPath));
    else missing.push(wantedPath);
  }
  const agentBytes = bytes(content);
  const readBytes = Object.values(reads).reduce((sum, value) => sum + value, agentBytes);
  return { agent_bytes: agentBytes, read_bytes: readBytes, reads, missing };
}

function measureTarget(files) {
  // LF-normalized so a CRLF checkout (core.autocrlf) measures the same as CI.
  const byPath = new Map(files.map((entry) => [entry.path, String(entry.content ?? "").replace(/\r\n/g, "\n")]));
  const opencodeGlobs = opencodeInstructionGlobs(byPath);
  // OpenCode renames the orchestrator to its primary agent; Codex folds it into AGENTS.md.
  const orchestratorPath = [...byPath.keys()].find((filePath) => ORCHESTRATOR.test(filePath))
    || [...byPath.keys()].find((filePath) => AGENT_FILE.test(filePath) && field(byPath.get(filePath), "mode")?.value === "primary")
    || (byPath.has("AGENTS.md") ? "AGENTS.md" : null);

  const alwaysOnFiles = {};
  const agents = {};
  let skillsInstalled = 0;
  let skillsListed = 0;
  let skillListingBytes = 0;
  for (const [filePath, content] of [...byPath].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (isAlwaysOn(filePath, content, opencodeGlobs)) alwaysOnFiles[filePath] = bytes(content);
    if (SKILL_FILE.test(filePath)) {
      // Installed counts real skills only: not the `_shared` support package nor Codex's command skills.
      if (!/^skills\/(_shared|commands)\//.test(filePath)) skillsInstalled += 1;
      if (field(content, "disable-model-invocation")?.value !== "true") {
        skillsListed += 1;
        skillListingBytes += bytes(listingEntry(content));
      }
    }
    const agent = filePath.match(AGENT_FILE);
    if (agent && filePath !== orchestratorPath) agents[agent[2]] = measureAgent(content, byPath);
  }

  return {
    always_on_bytes: Object.values(alwaysOnFiles).reduce((sum, value) => sum + value, 0),
    always_on_files: alwaysOnFiles,
    orchestrator: { path: orchestratorPath, bytes: orchestratorPath ? bytes(byPath.get(orchestratorPath)) : 0 },
    skills_installed: skillsInstalled,
    skills_listed: skillsListed,
    skill_listing_bytes: skillListingBytes,
    agents,
  };
}

function buildTargetFiles(sourceDir, profile) {
  // Lazy: cli.js pulls in the installer engine, which pure callers never need.
  const { loadTree, parseModels, SOURCE_ROOTS } = require("../configure/cli.js");
  const { transform } = require("./target-transform.js");
  const modelsPath = path.join(sourceDir, "models.yaml");
  const models = fs.existsSync(modelsPath) ? parseModels(fs.readFileSync(modelsPath, "utf8")) : {};
  const files = loadTree(sourceDir, [...SOURCE_ROOTS, ...(profile.sourceRoots || [])]);
  return transform({ files, profile, models }).files;
}

function measureSource(sourceDir) {
  const { PROFILES } = require("../configure/cli.js");
  const targets = {};
  for (const [target, profile] of Object.entries(PROFILES)) {
    targets[target] = measureTarget(buildTargetFiles(sourceDir, profile));
  }
  return { schema: SCHEMA, targets };
}

function targetCeilings(measured) {
  return {
    always_on_bytes: measured.always_on_bytes,
    orchestrator_bytes: measured.orchestrator.bytes,
    skills_installed: measured.skills_installed,
    skills_listed: measured.skills_listed,
    skill_listing_bytes: measured.skill_listing_bytes,
    agent_read_bytes: Object.fromEntries(Object.entries(measured.agents).map(([name, agent]) => [name, agent.read_bytes])),
  };
}

function ceilingsFrom(report) {
  return {
    schema: SCHEMA,
    targets: Object.fromEntries(Object.entries(report.targets).map(([target, measured]) => [target, targetCeilings(measured)])),
  };
}

// A metric regresses when it exceeds its ceiling or has none: new targets and
// agents need an explicit `--update`, so growth is always a reviewed decision.
function findRegressions(report, ceilings) {
  const regressions = [];
  for (const [target, measured] of Object.entries(report.targets)) {
    const ceiling = ceilings.targets?.[target];
    if (!ceiling) {
      regressions.push({ target, metric: "target", value: null, ceiling: null });
      continue;
    }
    const current = targetCeilings(measured);
    const checks = [
      ...CEILING_METRICS.map((metric) => [metric, current[metric], ceiling[metric]]),
      ...Object.entries(current.agent_read_bytes).map(([name, value]) => [`agent_read_bytes.${name}`, value, ceiling.agent_read_bytes?.[name]]),
    ];
    for (const [metric, value, limit] of checks) {
      if (typeof limit !== "number") regressions.push({ target, metric, value, ceiling: null });
      else if (value > limit) regressions.push({ target, metric, value, ceiling: limit });
    }
  }
  return regressions;
}

module.exports = { SCHEMA, buildTargetFiles, ceilingsFrom, findRegressions, measureSource, measureTarget };
