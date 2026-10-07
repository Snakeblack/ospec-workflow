"use strict";

// What an agent delivered in a bench workspace: the change it left on top of
// the `setup` commit (HEAD), split into workflow artifacts and the product
// (source, tests, types, docs). Pure helpers plus the git reads; nothing here
// modifies a workspace.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const CATEGORIES = Object.freeze(["source", "test", "types", "docs", "other"]);

// Workflow state and artifacts of either mode, never product.
const WORKFLOW = /^(\.ospec|openspec|idd|\.claude|\.agents|\.codex|\.cursor|\.opencode)\//;
const TEST = /(^|\/)(test|tests|__tests__)\/|\.(test|spec)\.[cm]?[jt]sx?$/;
const TYPES = /\.d\.[cm]?ts$/;
const DOCS = /\.(md|mdx|txt|rst)$|(^|\/)(CHANGELOG|LICENSE)[^/]*$/i;

function normalize(file) {
  return String(file).replace(/\\/g, "/");
}

function classifyPath(file) {
  const normalized = normalize(file);
  if (WORKFLOW.test(normalized)) return "workflow";
  if (TEST.test(normalized)) return "test";
  if (TYPES.test(normalized)) return "types";
  if (DOCS.test(normalized)) return "docs";
  return "source";
}

function zeroCounts() {
  return Object.fromEntries(CATEGORIES.map((category) => [category, 0]));
}

// `git diff --numstat` → file and line counts per category; binary files
// ("-\t-") count as `other`.
function metricsFromNumstat(numstat) {
  const files = zeroCounts();
  const added = zeroCounts();
  const removed = zeroCounts();
  let workflowFiles = 0;
  for (const line of String(numstat).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [plus, minus, ...rest] = line.split("\t");
    const file = rest.join("\t");
    const category = classifyPath(file);
    if (category === "workflow") {
      workflowFiles += 1;
      continue;
    }
    if (plus === "-") {
      files.other += 1;
      continue;
    }
    files[category] += 1;
    added[category] += Number(plus);
    removed[category] += Number(minus);
  }
  const ratio = added.source > 0 ? Math.round((added.test / added.source) * 100) / 100 : null;
  return { files, added, removed, workflow_files: workflowFiles, test_to_source: ratio };
}

// New-side line numbers of every added line, per file, from a `-U0` diff.
function addedLines(diff) {
  const result = {};
  let file = null;
  let next = 0;
  for (const line of String(diff).split(/\r?\n/)) {
    if (line.startsWith("+++ ")) {
      file = line === "+++ /dev/null" ? null : line.slice(4).replace(/^b\//, "");
      if (file) result[file] = result[file] || [];
      continue;
    }
    const hunk = /^@@ -\S+ \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      next = Number(hunk[1]);
      continue;
    }
    if (!file || line.startsWith("---")) continue;
    if (line.startsWith("+")) {
      result[file].push(next);
      next += 1;
    }
  }
  for (const key of Object.keys(result)) if (result[key].length === 0) delete result[key];
  return result;
}

// Words that would tell a blind judge which workflow produced a delivery.
const WORKFLOW_WORDS = /\b(openspec|ospec|idd|sdd)\b/gi;

function scrubDiff(diff) {
  return String(diff).replace(WORKFLOW_WORDS, "[process]");
}

// --- git reads ----------------------------------------------------------------

function git(cwd, args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${result.stderr}`);
  return result.stdout;
}

// A scenario's workspace, `<root>/<record>/<scenario>` or its first repetition.
function locateWorkspace(benchRoot, record, scenario) {
  for (const candidate of [path.join(benchRoot, record, scenario), path.join(benchRoot, record, scenario, "r1")]) {
    if (fs.existsSync(path.join(candidate, ".git"))) return candidate;
  }
  throw new Error(`no workspace for ${record}/${scenario} under ${benchRoot}`);
}

// Untracked files are added with intent-to-add so the diff shows them; the
// index is restored afterwards.
function readDelivery(workspace) {
  const untracked = git(workspace, ["ls-files", "--others", "--exclude-standard"]).split(/\r?\n/).filter(Boolean);
  if (untracked.length > 0) git(workspace, ["add", "--intent-to-add", "--", ...untracked]);
  try {
    const numstat = git(workspace, ["diff", "HEAD", "--numstat"]);
    const files = numstat
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => line.split("\t").slice(2).join("\t"));
    const product = files.filter((file) => classifyPath(file) !== "workflow");
    const diff = product.length ? git(workspace, ["diff", "HEAD", "--", ...product]) : "";
    const zeroContext = product.length ? git(workspace, ["diff", "HEAD", "-U0", "--", ...product]) : "";
    return { numstat, files, product, diff, zeroContext };
  } finally {
    if (untracked.length > 0) git(workspace, ["reset", "-q", "--", ...untracked]);
  }
}

module.exports = {
  CATEGORIES,
  addedLines,
  classifyPath,
  locateWorkspace,
  metricsFromNumstat,
  readDelivery,
  scrubDiff,
};
