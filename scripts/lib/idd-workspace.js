"use strict";

// Filesystem and git inputs of IDD signal derivation (openspec/specs/idd/spec.md,
// REQ-idd-012, REQ-idd-013): the project's idd/config.yaml, the stack markers
// at its root and the diff of the working tree against a base commit, untracked
// files included. idd-signals.js turns them into signals.

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { CHANGE_ROOT, DECISIONS_ROOT } = require("./idd-contract.js");
const { CONFIG_FILE, parseIddConfig } = require("./idd-config.js");
const { candidateCheckCommand } = require("./idd-checks-config.js");
const { MAP_RELATIVE } = require("./decision-gap.js");
const { lintDecisionRecord, parseAdrMarkdown, parseFitnessChecks } = require("./decision-records.js");
const { resolveContractPatterns } = require("./idd-contracts.js");
const { validateComponentMap } = require("./component-map.js");
const { COMPONENT_MAP_RELATIVE, GLOSSARY_RELATIVE, parseGlossaryTerms } = require("./idd-knowledge.js");
const { evidenceProblem } = require("./repository-evidence.js");
const { detectStacks, normalizePath, publishedPaths, resolvePatterns } = require("./idd-impact.js");

const MAX_UNTRACKED_BYTES = 1024 * 1024;
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

class IddWorkspaceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IddWorkspaceError";
    this.code = code;
  }
}

// package.json at the project root, or null when it is missing or malformed:
// a broken manifest only means no published surface is known.
function readManifest(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  } catch {
    return null;
  }
}

function readProjectContext(root) {
  const { mode, strictTdd, checks, impact, contracts } = parseIddConfig(readIddConfig(root));
  const stacks = detectStacks(fs.readdirSync(root));
  const published = publishedPaths(readManifest(root));
  return {
    mode,
    strictTdd,
    checks,
    candidateCommand: checks.length === 0 ? candidateCheckCommand(root) : null,
    impact,
    stacks,
    patterns: resolvePatterns({ stacks, impact, published }),
    contractPatterns: resolveContractPatterns({ stacks: impact.stack ?? stacks, contracts }),
  };
}

function readIddConfig(root) {
  try {
    return fs.readFileSync(path.join(root, CONFIG_FILE), "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return "";
  }
}

function readOptional(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

/**
 * The architecture references a change can declare (E3.1): the ADRs under
 * docs/architecture/decisions/ by id, and the quality scenario ids of the
 * knowledge map. A project without them has none.
 */
function readArchitecture(root) {
  const dir = path.join(root, ...DECISIONS_ROOT.split("/"));
  const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith(".md")).sort() : [];
  const adrs = new Map();
  for (const name of names) {
    const record = parseAdrMarkdown(fs.readFileSync(path.join(dir, name), "utf8"));
    if (record.id && !adrs.has(record.id)) adrs.set(record.id, { path: `${DECISIONS_ROOT}/${name}`, status: record.status ?? null });
  }
  const scenarios = new Set();
  const raw = readOptional(path.join(root, ...MAP_RELATIVE.split("/")));
  if (raw != null) {
    let map;
    try {
      map = JSON.parse(raw);
    } catch (error) {
      throw new IddWorkspaceError("knowledge-map-unreadable", `${MAP_RELATIVE} is not JSON text (valid YAML 1.2): ${error.message}`);
    }
    for (const scenario of map?.quality_scenarios || []) {
      if (typeof scenario?.id === "string") scenarios.add(scenario.id);
    }
  }
  return { adrs, scenarios };
}

// A JSON-text document of the project, or null when it is missing; a document
// that does not parse adds a warning instead of stopping the caller (E3.2).
function readJsonDocument(root, relative, warnings) {
  const raw = readOptional(path.join(root, ...relative.split("/")));
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch (error) {
    warnings.push(`${relative} is not JSON text (valid YAML 1.2): ${error.message}`);
    return null;
  }
}

/**
 * The inputs of knowledge by reference (E3.2, REQ-idd-021): the component map
 * when it is valid, each ADR with its status and the evidence that no longer
 * resolves, the quality scenarios and slot states of the knowledge map and the
 * glossary terms (null without a glossary). A broken map or knowledge map is a
 * warning, never an error.
 */
function readKnowledgeSources(root) {
  const warnings = [];
  let map = readJsonDocument(root, COMPONENT_MAP_RELATIVE, warnings);
  if (map != null) {
    const result = validateComponentMap(map);
    if (!result.valid) {
      const first = result.errors.slice(0, 3).map((error) => `${error.path || "/"} ${error.message}`);
      warnings.push(`${COMPONENT_MAP_RELATIVE} is not a valid component map: ${first.join("; ")}`);
      map = null;
    }
  }

  const adrs = new Map();
  const dir = path.join(root, ...DECISIONS_ROOT.split("/"));
  const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((name) => name.endsWith(".md")).sort() : [];
  for (const name of names) {
    const record = parseAdrMarkdown(fs.readFileSync(path.join(dir, name), "utf8"));
    if (!record.id || adrs.has(record.id)) continue;
    const evidence = (record.evidence || []).map((ref) => evidenceProblem(root, ref)).filter(Boolean);
    adrs.set(record.id, { path: `${DECISIONS_ROOT}/${name}`, status: record.status ?? null, evidence });
  }

  const knowledge = readJsonDocument(root, MAP_RELATIVE, warnings);
  const scenarios = new Set();
  for (const scenario of knowledge?.quality_scenarios || []) {
    if (typeof scenario?.id === "string") scenarios.add(scenario.id);
  }
  const slots = new Map();
  for (const slot of knowledge?.slots || []) {
    if (typeof slot?.id === "string" && typeof slot.state === "string" && !slots.has(slot.id)) slots.set(slot.id, slot.state);
  }

  const glossary = readOptional(path.join(root, ...GLOSSARY_RELATIVE.split("/")));
  const terms = glossary == null ? null : parseGlossaryTerms(glossary);
  return { map, sources: { adrs, scenarios, slots, terms }, warnings };
}

/**
 * What the CLI reads of each new ADR a declared impact names (E3.1): whether
 * it exists, its decision-record lint errors (evidence resolved against the
 * project), its id and every ADR id its text cites.
 */
function readDecisionRecords(root, files) {
  const records = {};
  for (const file of files) {
    const text = readOptional(path.join(root, ...file.split("/")));
    if (text == null) {
      records[file] = { exists: false };
      continue;
    }
    const record = parseAdrMarkdown(text);
    const lint = lintDecisionRecord(record, { root });
    records[file] = {
      exists: true,
      errors: lint.errors.map((error) => `${error.path || "/"}: ${error.message}`),
      id: record.id ?? null,
      cites: [...new Set([...text.matchAll(/(?<![0-9])([0-9]{4})(?![0-9])/g)].map((match) => match[1]))],
    };
  }
  return records;
}

function git(root, args, { env } = {}) {
  return execFileSync("git", ["-C", root, "-c", "core.quotePath=false", ...args], {
    encoding: "utf8",
    maxBuffer: GIT_MAX_BUFFER,
    stdio: ["ignore", "pipe", "pipe"],
    env: env ? { ...process.env, ...env } : process.env,
  });
}

function nulList(output) {
  return output.split("\0").filter(Boolean);
}

// The change's own state never counts as part of its diff.
function isIddState(file) {
  return file === CHANGE_ROOT || file.startsWith(`${CHANGE_ROOT}/`);
}

function addedLinesByFile(patch) {
  const added = {};
  let current = null;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++ ")) {
      const target = line.slice(4).replace(/\t.*$/, "");
      current = target === "/dev/null" ? null : normalizePath(target.replace(/^b\//, ""));
      if (current && !added[current]) added[current] = [];
    } else if (line.startsWith("diff --git ")) {
      current = null;
    } else if (current && line.startsWith("+")) {
      added[current].push(line.slice(1).replace(/\r$/, ""));
    }
  }
  return added;
}

function readUntracked(root, file) {
  const full = path.join(root, file);
  const stat = fs.statSync(full);
  if (!stat.isFile() || stat.size > MAX_UNTRACKED_BYTES) return [];
  const content = fs.readFileSync(full, "utf8");
  if (content.includes("\0")) return [];
  return content.replace(/\r?\n$/, "").split(/\r?\n/);
}

/**
 * Paths changed between `base` and the working tree (staged, unstaged and
 * untracked), relative to `root`, with the lines each one adds.
 */
function readGitDiff(root, { base = "HEAD" } = {}) {
  try {
    git(root, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    throw new IddWorkspaceError("not-a-git-repo", `${root} is not inside a git work tree`);
  }
  // A leading dash would turn the base into a git option.
  if (typeof base !== "string" || base === "" || base.startsWith("-")) {
    throw new IddWorkspaceError("unknown-base", `unknown diff base: ${JSON.stringify(base)}`);
  }
  try {
    git(root, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`]);
  } catch {
    throw new IddWorkspaceError("unknown-base", `unknown diff base: ${base}`);
  }

  const tracked = nulList(git(root, ["diff", "--relative", "--no-renames", "--name-only", "-z", base, "--"]));
  const untracked = nulList(git(root, ["ls-files", "--others", "--exclude-standard", "-z"]));
  const patch = git(root, ["diff", "--relative", "--no-renames", "--no-color", "--no-ext-diff", "--unified=0", base, "--"]);

  const addedLines = addedLinesByFile(patch);
  for (const file of untracked.map(normalizePath)) {
    if (!isIddState(file)) addedLines[file] = readUntracked(root, file);
  }
  const paths = [...new Set([...tracked, ...untracked].map(normalizePath))].filter((file) => !isIddState(file)).sort();
  for (const file of Object.keys(addedLines)) {
    if (!paths.includes(file)) delete addedLines[file];
  }
  return { paths, addedLines };
}

function requireWorkTree(root) {
  try {
    git(root, ["rev-parse", "--is-inside-work-tree"]);
  } catch {
    throw new IddWorkspaceError("not-a-git-repo", `${root} is not inside a git work tree`);
  }
}

function tryHead(root) {
  try {
    return git(root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]).trim() || null;
  } catch {
    return null;
  }
}

/** The commit a change starts from: HEAD, or null outside git or before the first commit. */
function readHead(root) {
  try {
    requireWorkTree(root);
  } catch {
    return null;
  }
  return tryHead(root);
}

// The tree `git hash-object -t tree /dev/null` names: what a repository
// without commits is compared against.
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/**
 * Digest of the working tree a run executed on (REQ-idd-014): HEAD, the binary
 * diff of tracked files against it and the content of every untracked file.
 * The change's own state under idd/ never counts.
 */
function readTreeFingerprint(root) {
  requireWorkTree(root);
  const head = tryHead(root);
  const hash = crypto.createHash("sha256");
  hash.update(`head\0${head ?? "none"}\0`);
  const exclude = `:(exclude)${CHANGE_ROOT}`;
  hash.update(git(root, ["diff", "--binary", "--no-color", "--no-ext-diff", "--no-renames", head ?? EMPTY_TREE, "--", ".", exclude]));
  const untracked = nulList(git(root, ["ls-files", "--others", "--exclude-standard", "-z", "--", ".", exclude]))
    .map(normalizePath)
    .sort();
  for (const file of untracked) {
    const content = fs.readFileSync(path.join(root, file));
    hash.update(`\0untracked\0${file}\0${crypto.createHash("sha256").update(content).digest("hex")}`);
  }
  return `sha256:${hash.digest("hex")}`;
}

/** Identity for a check run: the source tree plus the effective verifier list. */
function readCheckTreeFingerprint(root, checks = parseIddConfig(readIddConfig(root)).checks) {
  const hash = crypto.createHash("sha256");
  hash.update(`check-tree\0${readTreeFingerprint(root)}\0${JSON.stringify(checks)}`);
  return `sha256:${hash.digest("hex")}`;
}

/**
 * The working tree as a git tree object (REQ-idd-016): tracked and untracked
 * files, never ignored ones nor idd/. A throwaway index keeps the real index
 * untouched; the tree lands in the object store, so a later diff can compare
 * the reviewed candidate with the current tree.
 */
function snapshotTree(root) {
  requireWorkTree(root);
  const head = tryHead(root);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-index-"));
  const env = { GIT_INDEX_FILE: path.join(dir, "index") };
  try {
    git(root, head ? ["read-tree", head] : ["read-tree", "--empty"], { env });
    git(root, ["add", "-A", "--", ".", `:(exclude)${CHANGE_ROOT}`], { env });
    return git(root, ["write-tree"], { env }).trim();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** The tree of a commit, or the empty tree for a change opened without one. */
function commitTree(root, commit) {
  if (!commit) return EMPTY_TREE;
  try {
    return git(root, ["rev-parse", "--verify", "--quiet", `${commit}^{tree}`]).trim();
  } catch {
    throw new IddWorkspaceError("unknown-base", `unknown diff base: ${commit}`);
  }
}

/** Path → blob id of every file in a tree. */
function treeBlobs(root, tree) {
  const blobs = new Map();
  for (const entry of nulList(git(root, ["ls-tree", "-r", "-z", tree]))) {
    const match = /^\d+ \w+ ([0-9a-f]+)\t(.*)$/s.exec(entry);
    if (match) blobs.set(normalizePath(match[2]), match[1]);
  }
  return blobs;
}

/**
 * The fitness functions at a change's base commit (E3.3, REQ-idd-022), never
 * the working tree, so the change cannot weaken them: each ADR directly under
 * docs/architecture/decisions/ with its status, its `Check:` commands and its
 * Fitness function prose, and each quality scenario of a v2 knowledge map that
 * declares `fitness`. A base that cannot be read, or a knowledge map that does
 * not parse, is a warning; a v1 map declares none.
 */
function readFitnessSources(root, base) {
  const adrs = new Map();
  const scenarios = new Map();
  const warnings = [];
  const result = { sources: { adrs, scenarios }, warnings };
  if (!base || base.startsWith("-")) {
    warnings.push("no fitness check runs: the change has no base commit to read them from");
    return result;
  }
  let entries;
  try {
    git(root, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`]);
    entries = nulList(git(root, ["ls-tree", "-r", "-z", base, "--", DECISIONS_ROOT, MAP_RELATIVE]));
  } catch {
    warnings.push(`no fitness check runs: the change's base ${base} cannot be read`);
    return result;
  }
  const blobs = new Map();
  for (const entry of entries) {
    const match = /^\d+ blob ([0-9a-f]+)\t(.*)$/s.exec(entry);
    if (match) blobs.set(normalizePath(match[2]), match[1]);
  }
  const blob = (id) => git(root, ["cat-file", "blob", id]);
  const decisions = [...blobs.keys()].filter((file) => file.startsWith(`${DECISIONS_ROOT}/`) && file.endsWith(".md") && !file.slice(DECISIONS_ROOT.length + 1).includes("/"));
  for (const file of decisions.sort()) {
    const text = blob(blobs.get(file));
    const record = parseAdrMarkdown(text);
    if (!record.id || adrs.has(record.id)) continue;
    adrs.set(record.id, { path: file, status: record.status ?? null, checks: parseFitnessChecks(text), fitness: record.fitness_function ?? null });
  }
  if (!blobs.has(MAP_RELATIVE)) return result;
  let map;
  try {
    map = JSON.parse(blob(blobs.get(MAP_RELATIVE)));
  } catch (error) {
    warnings.push(`no quality scenario fitness: ${MAP_RELATIVE} at the base is not JSON text (valid YAML 1.2): ${error.message}`);
    return result;
  }
  if (map?.schema !== "ospec-knowledge-map/v2") return result;
  for (const scenario of map.quality_scenarios || []) {
    if (typeof scenario?.id !== "string" || !scenario.fitness || scenarios.has(scenario.id)) continue;
    const checks = Array.isArray(scenario.fitness.checks) ? scenario.fitness.checks.filter((command) => typeof command === "string" && command.trim() !== "") : [];
    const description = typeof scenario.fitness.description === "string" && scenario.fitness.description.trim() !== "" ? scenario.fitness.description : null;
    scenarios.set(scenario.id, { path: MAP_RELATIVE, checks, description });
  }
  return result;
}

/** Changed paths between two trees with their added and deleted line counts. */
function treeNumstat(root, from, to) {
  const fields = nulList(git(root, ["diff-tree", "-r", "--no-renames", "--numstat", "-z", from, to]));
  const changes = [];
  for (const field of fields) {
    const match = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(field);
    if (!match) continue;
    const file = normalizePath(match[3]);
    if (isIddState(file)) continue;
    changes.push({ path: file, added: match[1] === "-" ? 0 : Number(match[1]), deleted: match[2] === "-" ? 0 : Number(match[2]) });
  }
  return changes.sort((left, right) => (left.path < right.path ? -1 : 1));
}

module.exports = {
  EMPTY_TREE,
  IddWorkspaceError,
  commitTree,
  readArchitecture,
  readCheckTreeFingerprint,
  readDecisionRecords,
  readFitnessSources,
  readGitDiff,
  readHead,
  readKnowledgeSources,
  readProjectContext,
  readTreeFingerprint,
  snapshotTree,
  treeBlobs,
  treeNumstat,
};
