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

const { CHANGE_ROOT } = require("./idd-contract.js");
const { CONFIG_FILE, parseIddConfig } = require("./idd-config.js");
const { resolveContractPatterns } = require("./idd-contracts.js");
const { detectStacks, normalizePath, resolvePatterns } = require("./idd-impact.js");

const MAX_UNTRACKED_BYTES = 1024 * 1024;
const GIT_MAX_BUFFER = 64 * 1024 * 1024;

class IddWorkspaceError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "IddWorkspaceError";
    this.code = code;
  }
}

function readProjectContext(root) {
  let text = "";
  try {
    text = fs.readFileSync(path.join(root, CONFIG_FILE), "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const { mode, strictTdd, checks, impact, contracts } = parseIddConfig(text);
  const stacks = detectStacks(fs.readdirSync(root));
  return {
    mode,
    strictTdd,
    checks,
    impact,
    stacks,
    patterns: resolvePatterns({ stacks, impact }),
    contractPatterns: resolveContractPatterns({ stacks: impact.stack ?? stacks, contracts }),
  };
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
  readGitDiff,
  readHead,
  readProjectContext,
  readTreeFingerprint,
  snapshotTree,
  treeBlobs,
  treeNumstat,
};
