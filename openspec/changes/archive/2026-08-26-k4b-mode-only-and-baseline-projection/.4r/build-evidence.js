"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { normalizeReviewEvidence } = require("../../../../scripts/lib/review-dimensions.js");

function sha256(s) {
  return `sha256:${crypto.createHash("sha256").update(s).digest("hex")}`;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" });
}

const tracked = git(["diff", "--name-only"]).split(/\r?\n/).filter(Boolean);
const untracked = git(["ls-files", "--others", "--exclude-standard"])
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((p) => !p.startsWith("openspec/changes/") && !p.startsWith(".4r/"));

let diff = tracked.length ? git(["diff", "--no-color", "--", ...tracked]) : "";
if (diff && !diff.endsWith("\n")) diff += "\n";

if (!diff.trim()) {
  throw new Error("empty unified diff");
}

const paths = [...new Set([...tracked, ...untracked])]
  .filter((p) => fs.existsSync(p) && fs.statSync(p).isFile())
  .sort();

const plus = (diff.match(/^\+/gm) || []).filter((l) => !l.startsWith("+++")).length;
const minus = (diff.match(/^-/gm) || []).filter((l) => !l.startsWith("---")).length;

const evidence = normalizeReviewEvidence({
  classification: "normal",
  verify: { status: "success", findings: [] },
  diff,
  paths,
  capabilities: ["runtime"],
  dependencies: [],
  operationTypes: ["modify"],
  designRisks: [],
});

const outDir = __dirname;
fs.writeFileSync(path.join(outDir, "diff.tracked.patch"), diff);
fs.writeFileSync(
  path.join(outDir, "evidence.json"),
  `${JSON.stringify(
    {
      evidence,
      candidate: {
        projection: "workspace",
        base_tree: git(["rev-parse", "HEAD"]).trim(),
        candidate_tree: "workspace-uncommitted",
        paths,
        diff_hash: sha256(diff),
        paths_digest: sha256(JSON.stringify(paths)),
        authored_lines: plus,
        original_changed_lines: plus + minus,
      },
    },
    null,
    2
  )}\n`
);

console.log(`paths=${paths.length}`);
console.log(`authored=${plus} changed=${plus + minus}`);
console.log(`fingerprint=${evidence.fingerprint}`);
console.log(`facts=${evidence.sources.facts.map((f) => f.code).join(",") || "(none)"}`);
