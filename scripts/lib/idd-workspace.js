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
const { RECEIPTS_DIR } = require("./review-receipt.js");
const { CONFIG_FILE, parseIddConfig } = require("./idd-config.js");
const { candidateCheckCommand } = require("./idd-checks-config.js");
const { MAP_RELATIVE } = require("./decision-gap.js");
const { lintDecisionRecord, parseAdrMarkdown, parseFitnessChecks } = require("./decision-records.js");
const { resolveContractPatterns } = require("./idd-contracts.js");
const { validateComponentMap } = require("./component-map.js");
const { COMPONENT_MAP_RELATIVE, GLOSSARY_RELATIVE, parseGlossaryTerms } = require("./idd-knowledge.js");
const { evidenceProblem } = require("./repository-evidence.js");
const { detectStacks, normalizePath, publishedPaths, resolvePatterns } = require("./idd-impact.js");
const { classifyPath, isTestPath } = require("./idd-signals.js");

const MAX_UNTRACKED_BYTES = 1024 * 1024;
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

class IddWorkspaceError extends Error {
  constructor(code, message, how) {
    super(message);
    this.name = "IddWorkspaceError";
    this.code = code;
    if (how) this.how = how;
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
    contracts,
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

// Never part of a change's diff: its own state under idd/ and the review
// receipts the SubagentStop hook writes (REQ-hooks-027), even where .ospec/
// is not ignored.
const OWN_ROOTS = [CHANGE_ROOT, RECEIPTS_DIR];
const OWN_EXCLUDES = OWN_ROOTS.map((own) => `:(exclude)${own}`);

function isIddState(file) {
  return OWN_ROOTS.some((own) => file === own || file.startsWith(`${own}/`));
}

// The project's files under root that git sees, tracked or untracked and not
// ignored, without its own state (E4.10). Null when git cannot list them: the
// foundation suggestion it feeds never fails a command.
function readProjectFiles(root) {
  try {
    return nulList(git(root, ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ".", ...OWN_EXCLUDES])).map(normalizePath);
  } catch {
    return null;
  }
}

function headerPath(line, prefix) {
  const target = line.slice(4).replace(/\t.*$/, "");
  return target === "/dev/null" ? null : normalizePath(target.startsWith(prefix) ? target.slice(prefix.length) : target);
}

// The added lines of each file by its new path and the removed ones by its old
// path (B9). Headers come before the first hunk of a file, so a `+++` or `---`
// inside a hunk is an added `++` or a removed `--` line.
function changedLinesByFile(patch) {
  const added = {};
  const removed = {};
  let oldPath = null;
  let newPath = null;
  let inHunk = false;
  for (const line of patch.split("\n")) {
    if (line.startsWith("diff --git ")) {
      oldPath = null;
      newPath = null;
      inHunk = false;
    } else if (!inHunk && line.startsWith("--- ")) {
      oldPath = headerPath(line, "a/");
    } else if (!inHunk && line.startsWith("+++ ")) {
      newPath = headerPath(line, "b/");
      if (newPath && !added[newPath]) added[newPath] = [];
    } else if (line.startsWith("@@")) {
      inHunk = true;
    } else if (inHunk && newPath && line.startsWith("+")) {
      added[newPath].push(line.slice(1).replace(/\r$/, ""));
    } else if (inHunk && oldPath && line.startsWith("-")) {
      (removed[oldPath] ||= []).push(line.slice(1).replace(/\r$/, ""));
    }
  }
  return { added, removed };
}

// git's own test for a binary file: a NUL byte in its first 8000 bytes. A
// symlink is never followed.
const BINARY_PROBE_BYTES = 8000;

function isBinaryFile(root, file) {
  const full = path.join(root, file);
  let fd;
  try {
    if (!fs.lstatSync(full).isFile()) return false;
    fd = fs.openSync(full, "r");
    const probe = Buffer.alloc(BINARY_PROBE_BYTES);
    return probe.subarray(0, fs.readSync(fd, probe, 0, BINARY_PROBE_BYTES, 0)).includes(0);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return false;
    throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function readUntracked(root, file) {
  const full = path.join(root, file);
  const stat = fs.lstatSync(full);
  // A symlink is its target, as git stores it; it is never followed.
  if (stat.isSymbolicLink()) return [fs.readlinkSync(full)];
  if (!stat.isFile() || stat.size > MAX_UNTRACKED_BYTES) return [];
  const content = fs.readFileSync(full, "utf8");
  if (content.includes("\0")) return [];
  return content.replace(/\r?\n$/, "").split(/\r?\n/);
}

// Relative imports of a product file (E1.36, OSP-036): JS/TS `require`,
// `import`, `export ... from` and `import()`, and Python relative
// `from ... import`. Each specifier gives its candidate files in resolution
// order; packages and namespaces are never followed.
const JS_SOURCE = /\.[cm]?[jt]sx?$/i;
const JS_IMPORTS = [
  /\brequire\(\s*["'](\.\.?\/[^"']+)["']\s*\)/g,
  /\b(?:import|export)\b[^"';]*?\bfrom\s*["'](\.\.?\/[^"']+)["']/g,
  /\bimport\s*\(?\s*["'](\.\.?\/[^"']+)["']/g,
];
const JS_SUFFIXES = ["", ".js", ".ts", ".tsx", ".jsx", ".mjs", ".cjs", ".mts", ".cts"];
const PY_FROM = /^\s*from\s+(\.+)([\w.]*)\s+import\s+\(?([^#)]*)/;

function jsCandidates(target) {
  const found = JS_SUFFIXES.map((suffix) => `${target}${suffix}`);
  // TypeScript ESM names the emitted .js file of a .ts source.
  if (/\.[cm]?js$/i.test(target)) found.push(...[".ts", ".tsx", ".mts", ".cts"].map((ext) => target.replace(/\.[cm]?js$/i, ext)));
  found.push(...JS_SUFFIXES.slice(1).map((ext) => `${target}/index${ext}`));
  return found;
}

function relativeImports(file, lines) {
  const dir = path.posix.dirname(file);
  const specifiers = [];
  if (JS_SOURCE.test(file)) {
    const text = lines.join("\n");
    for (const pattern of JS_IMPORTS) {
      for (const match of text.matchAll(pattern)) specifiers.push(jsCandidates(path.posix.join(dir, match[1])));
    }
  } else if (/\.py$/i.test(file)) {
    for (const line of lines) {
      const match = PY_FROM.exec(line);
      if (!match) continue;
      let base = dir;
      for (let level = 1; level < match[1].length; level += 1) base = path.posix.join(base, "..");
      if (match[2]) base = path.posix.join(base, ...match[2].split("."));
      const names = match[2] ? [""] : match[3].split(",").map((name) => name.trim().split(/\s+/)[0]).filter((name) => /^\w+$/.test(name));
      for (const name of names) {
        const target = name ? path.posix.join(base, name) : base;
        specifiers.push([`${target}.py`, `${target}/__init__.py`]);
      }
    }
  }
  return specifiers.map((candidates) => candidates.map((candidate) => path.posix.normalize(candidate)));
}

// The lines of a regular text file inside `root`, or null. A symlink, or a
// path through one, is never read.
function readSourceLines(root, file) {
  if (file === ".." || file.startsWith("../") || path.posix.isAbsolute(file)) return null;
  const full = path.join(root, file);
  try {
    if (fs.realpathSync(full) !== path.join(fs.realpathSync(root), file)) return null;
    const stat = fs.lstatSync(full);
    if (!stat.isFile() || stat.size > MAX_UNTRACKED_BYTES) return null;
    const content = fs.readFileSync(full, "utf8");
    if (content.includes("\0")) return null;
    return content.replace(/\r?\n$/, "").split(/\r?\n/);
  } catch {
    return null;
  }
}

// Each changed product file with the product modules it imports by relative
// path, as the working tree holds them.
function readSources(root, paths) {
  const cache = new Map();
  const read = (file) => {
    if (!cache.has(file)) cache.set(file, readSourceLines(root, file));
    return cache.get(file);
  };
  const sources = {};
  for (const file of paths) {
    if (classifyPath(file) !== "product") continue;
    const lines = read(file);
    if (!lines) continue;
    const imports = {};
    for (const candidates of relativeImports(file, lines)) {
      const target = candidates.find((candidate) => read(candidate));
      if (target && target !== file && classifyPath(target) === "product") imports[target] = read(target);
    }
    sources[file] = { lines, imports };
  }
  return sources;
}

/**
 * Paths changed between `base` and the working tree (staged, unstaged and
 * untracked), relative to `root`, with the lines each one adds and the
 * sources of the product files among them.
 */
function readGitDiff(root, { base = "HEAD" } = {}) {
  requireWorkTree(root);
  // A leading dash would turn the base into a git option.
  if (typeof base !== "string" || base === "" || base.startsWith("-")) {
    throw new IddWorkspaceError("unknown-base", `unknown diff base: ${JSON.stringify(base)}`);
  }
  if (base !== EMPTY_TREE) {
    try {
      git(root, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`]);
    } catch {
      throw new IddWorkspaceError("unknown-base", `unknown diff base: ${base}`);
    }
  }

  const tracked = nulList(git(root, ["diff", "--relative", "--no-renames", "--name-only", "-z", base, "--"]));
  const untracked = nulList(git(root, ["ls-files", "--others", "--exclude-standard", "-z"]));
  // The repository's diff settings never hide a line (E1.53): fixed prefixes
  // over diff.mnemonicPrefix, diff.noprefix and diff.srcPrefix, and raw text
  // over -diff, binary and textconv attributes.
  const patch = git(root, ["diff", "--relative", "--no-renames", "--no-color", "--no-ext-diff", "--no-textconv", "--text", "--src-prefix=a/", "--dst-prefix=b/", "--unified=0", base, "--"]);

  const { added: addedLines, removed: removedLines } = changedLinesByFile(patch);
  // A binary file read as text has no lines, as an untracked one has none.
  for (const file of new Set([...Object.keys(addedLines), ...Object.keys(removedLines)])) {
    if (isBinaryFile(root, file) || [addedLines[file], removedLines[file]].some((lines) => lines?.some((line) => line.includes("\0")))) {
      delete addedLines[file];
      delete removedLines[file];
    }
  }
  for (const file of untracked.map(normalizePath)) {
    if (!isIddState(file)) addedLines[file] = readUntracked(root, file);
  }
  const paths = [...new Set([...tracked, ...untracked].map(normalizePath))].filter((file) => !isIddState(file)).sort();
  for (const lines of [addedLines, removedLines]) {
    for (const file of Object.keys(lines)) {
      if (!paths.includes(file)) delete lines[file];
    }
  }
  return { paths, addedLines, removedLines, sources: readSources(root, paths) };
}

// What to do when there is no project to work in (E4.8): IDD needs a git work
// tree, and the router sends a system fix or a loose script to direct work.
const NO_REPO_HOW =
  "IDD works only inside a project, a git work tree. For a system fix or a loose script, work directly without IDD. " +
  "To build or change a project, set up its repository first: git init -b main here or in a new project folder, " +
  "and with existing code commit a baseline once the user approves it; then open the change again.";
const NO_GIT_HOW = "git is not installed or not on PATH. For a system fix, work directly without IDD; to build a project, install git first.";

function requireWorkTree(root) {
  try {
    git(root, ["rev-parse", "--is-inside-work-tree"]);
  } catch (error) {
    if (error.code === "ENOENT") throw new IddWorkspaceError("git-not-found", "git is not installed or not on PATH", NO_GIT_HOW);
    throw new IddWorkspaceError("not-a-git-repo", `${root} is not inside a git work tree`, NO_REPO_HOW);
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
 * The change's own state under idd/ and the review receipts never count.
 */
function readTreeFingerprint(root) {
  requireWorkTree(root);
  const head = tryHead(root);
  const hash = crypto.createHash("sha256");
  hash.update(`head\0${head ?? "none"}\0`);
  hash.update(git(root, ["diff", "--binary", "--no-color", "--no-ext-diff", "--no-renames", head ?? EMPTY_TREE, "--", ".", ...OWN_EXCLUDES]));
  const untracked = nulList(git(root, ["ls-files", "--others", "--exclude-standard", "-z", "--", ".", ...OWN_EXCLUDES]))
    .map(normalizePath)
    .sort();
  for (const file of untracked) {
    const full = path.join(root, file);
    const link = fs.lstatSync(full).isSymbolicLink();
    const content = link ? fs.readlinkSync(full) : fs.readFileSync(full);
    const kind = link ? "untracked-symlink" : "untracked";
    hash.update(`\0${kind}\0${file}\0${crypto.createHash("sha256").update(content).digest("hex")}`);
  }
  return `sha256:${hash.digest("hex")}`;
}

/**
 * idd/config.yaml as the change's `base` declared it (B7, E1.53): the empty
 * configuration before the first commit, without the file or when it cannot
 * be parsed.
 */
function readBaseConfig(root, base) {
  const none = parseIddConfig("");
  if (!base || base === EMPTY_TREE) return none;
  let text;
  try {
    text = git(root, ["show", `${base}:./${CONFIG_FILE}`]);
  } catch {
    return none;
  }
  try {
    return parseIddConfig(text);
  } catch {
    return none;
  }
}

/** Identity for a check run: the source tree plus the effective verifier list. */
function readCheckTreeFingerprint(root, checks = parseIddConfig(readIddConfig(root)).checks) {
  const hash = crypto.createHash("sha256");
  hash.update(`check-tree\0${readTreeFingerprint(root)}\0${JSON.stringify(checks)}`);
  return `sha256:${hash.digest("hex")}`;
}

/**
 * The working tree as a git tree object (REQ-idd-016): tracked and untracked
 * files, never ignored ones, idd/ nor the review receipts. A throwaway index keeps the real index
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
    // git add refuses an exclude pathspec that names an ignored path, so the
    // receipts go back to their HEAD state in the throwaway index instead.
    git(root, head ? ["reset", "-q", head, "--", RECEIPTS_DIR] : ["rm", "--cached", "-r", "-q", "--ignore-unmatch", "--", RECEIPTS_DIR], { env });
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
 * The line count of a path in the first of the trees that holds it, or null
 * when none does. An empty file has the one line an editor shows.
 */
function treeLineCounter(root, trees) {
  const blobs = trees.map((tree) => treeBlobs(root, tree));
  return (file) => {
    const id = blobs.map((entries) => entries.get(file)).find(Boolean);
    if (!id) return null;
    const text = git(root, ["cat-file", "blob", id]);
    return text === "" ? 1 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
  };
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

// The test side of a counterproof (E1.48): the tests of the diff and the test
// data beside them. Every other path stays as the change's base holds it.
const TEST_DATA = /(?:^|\/)(?:testdata|__snapshots__|fixtures|__fixtures__)\//i;
// Ignored dependency directories a counterproof links in from the project, so
// a missing install never stands for a red. Build outputs (dist, build,
// target) hold the candidate's product and are never linked.
const DEPENDENCY_DIRS = Object.freeze(["node_modules", ".venv", "venv", "vendor"]);

/** The paths of the diff a counterproof takes from the working tree. */
function counterproofPaths(diff) {
  return (diff.paths || []).filter((file) => isTestPath(file) || TEST_DATA.test(file));
}

/**
 * Digest of what a counterproof puts on the base: each path's content, the
 * target of a symlink, or its absence where the diff deletes it.
 */
function counterproofMount(root, paths) {
  const hash = crypto.createHash("sha256");
  for (const file of [...paths].sort()) {
    const full = path.join(root, file);
    let entry = "deleted";
    try {
      const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) entry = `symlink\0${fs.readlinkSync(full)}`;
      else if (stat.isFile()) entry = `file\0${crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex")}`;
      else entry = "other";
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    hash.update(`${file}\0${entry}\0`);
  }
  return `sha256:${hash.digest("hex")}`;
}

function isIgnored(top, full) {
  try {
    git(top, ["check-ignore", "-q", "--", full]);
    return true;
  } catch {
    return false;
  }
}

// A link or junction goes, never what it points to.
function removeLink(link) {
  try {
    fs.unlinkSync(link);
  } catch {
    fs.rmdirSync(link);
  }
}

/**
 * A temporary worktree of `base` for a counterproof (E1.48): the counterproof
 * paths as the working tree holds them, absent where the diff deletes them,
 * and the ignored dependency directories of the project and of the repository
 * root linked in. No hook runs and no LFS object is downloaded. `cwd` is the
 * project root inside it; `mask` lists the spellings of the worktree a command
 * may print, which runCommand masks so that two worktrees compare; `remove`
 * deletes it and prunes its git entry.
 */
function mountCounterproof(root, { base, paths }) {
  requireWorkTree(root);
  if (typeof base !== "string" || base === "" || base.startsWith("-")) {
    throw new IddWorkspaceError("counterproof-unmounted", `unknown counterproof base: ${JSON.stringify(base)}`);
  }
  const top = git(root, ["rev-parse", "--show-toplevel"]).trim();
  const prefix = git(root, ["rev-parse", "--show-prefix"]).trim();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ospec-counterproof-"));
  const tree = path.join(dir, "tree");
  const links = [];
  const remove = () => {
    for (const link of links.splice(0)) removeLink(link);
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    try {
      git(top, ["worktree", "prune"]);
    } catch {
      // A stale entry only lists a missing worktree; the next prune drops it.
    }
  };
  try {
    const hooks = path.join(dir, "hooks");
    fs.mkdirSync(hooks);
    git(top, ["-c", `core.hooksPath=${hooks}`, "-c", "core.longpaths=true", "worktree", "add", "--detach", tree, base], { env: { GIT_LFS_SKIP_SMUDGE: "1" } });
    // A project root the base lacks still runs the command, against nothing.
    const cwd = path.join(tree, prefix);
    fs.mkdirSync(cwd, { recursive: true });
    for (const file of paths) {
      const from = path.join(root, file);
      const to = path.join(cwd, file);
      fs.rmSync(to, { recursive: true, force: true });
      let stat = null;
      try {
        stat = fs.lstatSync(from);
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (!stat || !(stat.isFile() || stat.isSymbolicLink())) continue;
      fs.mkdirSync(path.dirname(to), { recursive: true });
      if (stat.isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(from), to);
      else fs.copyFileSync(from, to);
    }
    const places = [[root, cwd], [top, tree]];
    for (const [from, to] of places) {
      for (const name of DEPENDENCY_DIRS) {
        const source = path.join(from, name);
        const target = path.join(to, name);
        if (!fs.statSync(source, { throwIfNoEntry: false })?.isDirectory() || fs.lstatSync(target, { throwIfNoEntry: false })) continue;
        if (!isIgnored(top, source)) continue;
        fs.symlinkSync(source, target, "junction");
        links.push(target);
      }
    }
    const real = fs.realpathSync(tree);
    const mask = [...new Set([tree, real, tree.replace(/\\/g, "/"), real.replace(/\\/g, "/")])];
    return { cwd, mask, remove };
  } catch (error) {
    remove();
    const detail = String(error.stderr || error.message || error).trim().split("\n")[0];
    throw new IddWorkspaceError("counterproof-unmounted", `the base ${base.slice(0, 12)} cannot be mounted: ${detail}`);
  }
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
  DEPENDENCY_DIRS,
  EMPTY_TREE,
  IddWorkspaceError,
  commitTree,
  counterproofMount,
  counterproofPaths,
  mountCounterproof,
  readArchitecture,
  readBaseConfig,
  readCheckTreeFingerprint,
  readDecisionRecords,
  readFitnessSources,
  readGitDiff,
  readHead,
  readKnowledgeSources,
  readProjectContext,
  readProjectFiles,
  readTreeFingerprint,
  requireWorkTree,
  snapshotTree,
  treeBlobs,
  treeLineCounter,
  treeNumstat,
};
