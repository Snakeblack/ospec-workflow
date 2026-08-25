"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  validateGeneralistDecision,
  deriveReviewDimensions,
  validateReviewDecision,
} = require("../../../../scripts/lib/review-dimensions.js");
const { startReviewLineage, nextLineageAction } = require("../../../../scripts/lib/review-lineage.js");
const { planReviewGate, planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");

const outDir = __dirname;
const evidence = JSON.parse(fs.readFileSync(path.join(outDir, "evidence.json"), "utf8"));
const meta = JSON.parse(fs.readFileSync(path.join(outDir, "meta.json"), "utf8"));
const paths = JSON.parse(fs.readFileSync(path.join(outDir, "paths.json"), "utf8"));

const generalist = {
  status: "clear",
  specialists: [],
  reason: "signals=none;dimensions=none",
};

const g = validateGeneralistDecision(generalist);
if (!g.valid) throw new Error("generalist invalid: " + g.errors.join("; "));

const derived = deriveReviewDimensions(evidence, generalist);
const v = validateReviewDecision(derived);
if (!v.valid) throw new Error("derived invalid: " + (v.errors || []).join("; "));

const plannedGate = planReviewGate({
  routeGates: ["clarify", "4r-review-gate"],
  existingGate: {},
  decision: derived,
  validationErrors: [],
});

const candidate = {
  projection: "workspace",
  base_tree: meta.base_tree,
  candidate_tree: meta.candidate_tree,
  paths,
  diff_hash: meta.diff_hash,
  paths_digest: meta.paths_digest,
  authored_lines: meta.changed,
  original_changed_lines: meta.changed,
};

const lineage = startReviewLineage({
  candidate,
  classification: "normal",
  selected_dimensions: derived.selected_specialists,
  evidence_fingerprint: evidence.fingerprint,
});

const plannedLineage = planLineageGate({
  lineage,
  observed_candidate_id: lineage.current_candidate_id,
  downstream_gate: "status",
});

fs.writeFileSync(path.join(outDir, "generalist.json"), JSON.stringify(generalist, null, 2));
fs.writeFileSync(path.join(outDir, "derived.json"), JSON.stringify(derived, null, 2));
fs.writeFileSync(path.join(outDir, "lineage.json"), JSON.stringify(lineage, null, 2));
fs.writeFileSync(path.join(outDir, "planned-gate.json"), JSON.stringify(plannedGate, null, 2));
fs.writeFileSync(path.join(outDir, "planned-lineage.json"), JSON.stringify(plannedLineage, null, 2));

console.log(
  JSON.stringify(
    {
      generalistValid: g.valid,
      derivedValid: v.valid,
      selected: derived.selected_specialists,
      depth: derived.depth,
      gateStatus: plannedGate.status,
      gateDispatch: plannedGate.dispatch,
      archive_allowed: plannedGate.archive_allowed,
      lineage_id: lineage.lineage_id,
      candidate_id: lineage.current_candidate_id,
      budget: lineage.correction_budget,
      next_action: plannedLineage.next_action,
      lineageDispatch: plannedLineage.dispatch,
    },
    null,
    2
  )
);
console.log("nextLineageAction", JSON.stringify(nextLineageAction(lineage)));
