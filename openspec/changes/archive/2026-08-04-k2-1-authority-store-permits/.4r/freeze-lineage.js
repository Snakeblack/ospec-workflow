"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  validateGeneralistDecision,
  deriveReviewDimensions,
  validateReviewDecision,
} = require("../../../../scripts/lib/review-dimensions.js");
const {
  startReviewLineage,
  nextLineageAction,
  migrateReviewLineage,
  beginLens,
} = require("../../../../scripts/lib/review-lineage.js");
const { planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");

const outDir = __dirname;
const evidence = JSON.parse(fs.readFileSync(path.join(outDir, "evidence.json"), "utf8"));
const meta = JSON.parse(fs.readFileSync(path.join(outDir, "meta.json"), "utf8"));
const paths = JSON.parse(fs.readFileSync(path.join(outDir, "paths.json"), "utf8"));

const generalist = {
  status: "needs-specialist",
  specialists: ["risk", "reliability", "resilience"],
  reason:
    "signals=dependency-change,design-risk,diff-auth-permission,diff-error-flow,metadata-runtime;dimensions=risk,reliability,resilience",
};

const g = validateGeneralistDecision(generalist);
if (!g.valid) throw new Error("generalist invalid: " + g.errors.join("; "));

const derived = deriveReviewDimensions(evidence, generalist);
const v = validateReviewDecision(derived);
if (!v.valid) throw new Error("derived invalid: " + (v.errors || []).join("; "));

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

// Persist pending launches for all selected lenses before dispatch (v1 lineage; migrate only before mutable remediation)
for (const dimension of derived.selected_specialists) {
  lineage = beginLens(lineage, {
    dimension,
    request_id: `start-${dimension}-k21`,
    expected_revision: lineage.revision,
  });
}

const planned = planLineageGate({ lineage });

fs.writeFileSync(path.join(outDir, "generalist.json"), JSON.stringify(generalist, null, 2));
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
    2,
  ),
);
