"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { normalizeReviewEvidence } = require("../../../../scripts/lib/review-dimensions.js");

const ROOT = path.resolve(__dirname, "../../../..");
const OUT_DIR = __dirname;
const EXCLUDE = new Set(["models.yaml"]);
const EXCLUDE_PREFIX = "openspec/changes/k6b-verification-integrity-remediation/.4r/";

function posix(p) {
  return p.replace(/\\/g, "/");
}

function listFilesRecursive(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listFilesRecursive(abs));
    else out.push(abs);
  }
  return out;
}

function gitStatus() {
  const status = execFileSync("git", ["status", "--short", "-u"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const files = [];
  for (const line of status.split(/\r?\n/).filter(Boolean)) {
    const raw = line.slice(3);
    const name = raw.includes(" -> ") ? raw.split(" -> ").pop() : raw;
    if (EXCLUDE.has(name) || name.startsWith(EXCLUDE_PREFIX)) continue;
    files.push({ status: line.slice(0, 2), name });
  }
  const expanded = [];
  for (const f of files) {
    const abs = path.join(ROOT, f.name);
    if (f.status.includes("?") && fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
      for (const p of listFilesRecursive(abs)) {
        const rel = posix(path.relative(ROOT, p));
        if (rel.startsWith(EXCLUDE_PREFIX)) continue;
        expanded.push({ status: "??", name: rel });
      }
    } else {
      expanded.push({ ...f, name: posix(f.name) });
    }
  }
  const unique = [...new Map(expanded.map((f) => [f.name, f])).values()];
  unique.sort((a, b) => a.name.localeCompare(b.name));
  return unique;
}

function syntheticDiff(rel) {
  const abs = path.join(ROOT, rel);
  const text = fs.readFileSync(abs, "utf8").replace(/\r\n/g, "\n");
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  const lines = body.length ? body.split("\n") : [];
  const hunkCount = Math.max(lines.length, 1);
  const parts = [
    `diff --git a/${rel} b/${rel}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${rel}`,
    `@@ -0,0 +1,${lines.length || 1} @@`,
  ];
  if (lines.length === 0) parts.push("+");
  else parts.push(...lines.map((l) => `+${l}`));
  return `${parts.join("\n")}\n`;
}

const unique = gitStatus();
const modified = unique.filter((f) => !f.status.includes("?"));
const untracked = unique.filter((f) => f.status.includes("?"));
const sections = [];

if (modified.length) {
  const tracked = execFileSync(
    "git",
    ["diff", "--no-color", "HEAD", "--", ...modified.map((f) => f.name)],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }
  ).replace(/\r\n/g, "\n");
  if (tracked.trim()) sections.push(tracked.endsWith("\n") ? tracked : `${tracked}\n`);
}
for (const f of untracked) {
  sections.push(syntheticDiff(f.name));
}

const diff = sections.join("");
fs.writeFileSync(path.join(OUT_DIR, "unified.diff"), diff);

const paths = unique.map((f) => f.name);
const operationTypes = [];
if (modified.length) operationTypes.push("modify");
if (untracked.length) operationTypes.push("add");

const evidence = normalizeReviewEvidence({
  classification: "high-risk",
  verify: { status: "success", findings: [] },
  diff,
  paths,
  capabilities: ["runtime"],
  dependencies: [],
  operationTypes,
  designRisks: [{ code: "design-risk", detail: "verification-integrity-trust-boundary" }],
});

const added = (diff.match(/^\+/gm) || []).filter((l) => !l.startsWith("+++")).length;
const removed = (diff.match(/^-/gm) || []).filter((l) => !l.startsWith("---")).length;

fs.writeFileSync(
  path.join(OUT_DIR, "evidence.json"),
  JSON.stringify(
    {
      evidence,
      paths,
      operationTypes,
      changed_lines: { added, removed, total: added + removed },
      file_count: paths.length,
      facts: evidence.sources.facts,
    },
    null,
    2
  )
);

console.log(
  JSON.stringify(
    {
      files: paths.length,
      added,
      removed,
      total: added + removed,
      fingerprint: evidence.fingerprint,
      facts: evidence.sources.facts.map((f) => f.code),
      operationTypes,
      diffBytes: Buffer.byteLength(diff),
    },
    null,
    2
  )
);
