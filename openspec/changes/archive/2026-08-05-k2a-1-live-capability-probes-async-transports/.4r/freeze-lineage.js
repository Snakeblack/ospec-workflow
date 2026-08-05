"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const {
  validateGeneralistDecision,
  deriveReviewDimensions,
  validateReviewDecision,
} = require("../../../../scripts/lib/review-dimensions.js");
const { startReviewLineage, beginLens } = require("../../../../scripts/lib/review-lineage.js");
const { planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");

const outDir = __dirname;
const evidence = JSON.parse(fs.readFileSync(path.join(outDir, "evidence.json"), "utf8"));
const paths = JSON.parse(fs.readFileSync(path.join(outDir, "paths.json"), "utf8"));
const diff = fs.readFileSync(path.join(outDir, "diff.unified.patch"));
const plus = (String(diff).match(/^\+[^+]/gm) || []).length;
const minus = (String(diff).match(/^-[^-]/gm) || []).length;
const changed = plus + minus;

const generalist = JSON.parse(fs.readFileSync(path.join(outDir, "generalist.json"), "utf8"));
const g = validateGeneralistDecision(generalist);
if (!g.valid) throw new Error("generalist invalid: " + g.errors.join("; "));

const derived = deriveReviewDimensions(evidence, generalist);
const v = validateReviewDecision(derived);
if (!v.valid) throw new Error("derived invalid: " + (v.errors || []).join("; "));

const baseTree = spawnSync("git", ["rev-parse", "main"], { encoding: "utf8" }).stdout.trim();
const diffHash = "sha256:" + crypto.createHash("sha256").update(diff).digest("hex");
const pathsDigest =
  "sha256:" + crypto.createHash("sha256").update(JSON.stringify(paths)).digest("hex");

const meta = {
  base_tree: baseTree,
  candidate_tree: "WORKING-TREE-k2a-1-live-capability-probes-async-transports",
  changed_lines: changed,
  plus,
  minus,
  paths_count: paths.length,
  evidence_fingerprint: evidence.fingerprint,
  diff_hash: diffHash,
  paths_digest: pathsDigest,
  head: spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim(),
  branch: spawnSync("git", ["branch", "--show-current"], { encoding: "utf8" }).stdout.trim(),
};
fs.writeFileSync(path.join(outDir, "meta.json"), JSON.stringify(meta, null, 2));

const candidate = {
  projection: "workspace",
  base_tree: meta.base_tree,
  candidate_tree: meta.candidate_tree,
  paths,
  diff_hash: meta.diff_hash,
  paths_digest: meta.paths_digest,
  authored_lines: meta.changed_lines,
  original_changed_lines: meta.changed_lines,
};

let lineage = startReviewLineage({
  candidate,
  classification: "high-risk",
  selected_dimensions: derived.selected_specialists,
  evidence_fingerprint: evidence.fingerprint,
});

for (const dimension of derived.selected_specialists) {
  lineage = beginLens(lineage, {
    dimension,
    request_id: `start-${dimension}-k2a1`,
    expected_revision: lineage.revision,
  });
}

const planned = planLineageGate({ lineage });

fs.writeFileSync(path.join(outDir, "derived.json"), JSON.stringify(derived, null, 2));
fs.writeFileSync(path.join(outDir, "lineage.json"), JSON.stringify(lineage, null, 2));
fs.writeFileSync(path.join(outDir, "planned.json"), JSON.stringify(planned, null, 2));

console.log(
  JSON.stringify(
    {
      selected: derived.selected_specialists,
      depth: derived.depth,
      next_action: planned.next_action,
      dispatch: planned.dispatch,
      lineage_id: lineage.lineage_id,
      revision: lineage.revision,
      budget: lineage.correction_budget,
      candidate_id: lineage.genesis.candidate_id,
    },
    null,
    2
  )
);
