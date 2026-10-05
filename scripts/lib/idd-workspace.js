"use strict";

// Filesystem and git inputs of IDD signal derivation (openspec/specs/idd/spec.md,
// REQ-idd-012): the project's openspec/config.yaml, the stack markers at its
// root and the diff of the working tree against a base commit, untracked files
// included. idd-signals.js turns them into signals.

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const { CHANGE_ROOT } = require("./idd-contract.js");
const { detectStacks, normalizePath, parseProjectConfig, resolvePatterns } = require("./idd-impact.js");

const CONFIG_FILE = path.join("openspec", "config.yaml");
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
  const { strictTdd, impact } = parseProjectConfig(text);
  const stacks = detectStacks(fs.readdirSync(root));
  return { strictTdd, impact, stacks, patterns: resolvePatterns({ stacks, impact }) };
}

function git(root, args) {
  return execFileSync("git", ["-C", root, "-c", "core.quotePath=false", ...args], {
    encoding: "utf8",
    maxBuffer: GIT_MAX_BUFFER,
    stdio: ["ignore", "pipe", "pipe"],
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

module.exports = {
  IddWorkspaceError,
  readGitDiff,
  readProjectContext,
};
