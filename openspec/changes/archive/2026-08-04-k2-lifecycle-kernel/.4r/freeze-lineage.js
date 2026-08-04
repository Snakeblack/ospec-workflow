"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  validateGeneralistDecision,
  deriveReviewDimensions,
  validateReviewDecision,
} = require("../../../../scripts/lib/review-dimensions.js");
const {
  startReviewLineage,
  beginLens,
} = require("../../../../scripts/lib/review-lineage.js");
const {
  planLineageGate,
  planReviewGate,
  mergeReviewGateAudit,
} = require("../../../../scripts/lib/review-gate-state.js");

const ROOT = path.resolve(__dirname, "../../../..");
const outDir = __dirname;
const statePath = path.join(ROOT, "openspec/changes/k2-lifecycle-kernel/state.yaml");

const evidence = JSON.parse(fs.readFileSync(path.join(outDir, "evidence.json"), "utf8"));
const paths = evidence.sources.paths;
const diff = fs.readFileSync(path.join(outDir, "candidate.diff"));
const diffHash = `sha256:${crypto.createHash("sha256").update(diff).digest("hex")}`;
const pathsDigest = `sha256:${crypto
  .createHash("sha256")
  .update(JSON.stringify([...paths].sort()))
  .digest("hex")}`;

const generalist = {
  status: "needs-specialist",
  specialists: ["risk", "reliability", "resilience", "readability"],
  reason:
    "signals=dependency-change,design-risk,diff-auth-permission,diff-error-flow,diff-structural-complexity,metadata-runtime;dimensions=risk,reliability,resilience,readability",
};

const gv = validateGeneralistDecision(generalist);
if (!gv.valid) throw new Error(`generalist invalid: ${gv.errors.join("; ")}`);

const decision = deriveReviewDimensions(evidence, generalist);
const dv = validateReviewDecision(decision);
if (!dv.valid) throw new Error(`decision invalid: ${dv.errors.join("; ")}`);

const changedLines = 3710;
const candidate = {
  projection: "workspace",
  base_tree: "ae6927e1f0e039d7cc1fe2f52f27e2500e83bf66",
  candidate_tree: "WORKING-TREE-k2-lifecycle-kernel",
  paths,
  diff_hash: diffHash,
  paths_digest: pathsDigest,
  authored_lines: changedLines,
  original_changed_lines: changedLines,
};

// Keep schema-v1 through lens execution. Remediation-v2 migration is required
// only before correct/record-correction/targeted-validation (see planLineageGate).
let lineage = startReviewLineage({
  candidate,
  classification: "high-risk",
  selected_dimensions: decision.selected_specialists,
  evidence_fingerprint: evidence.fingerprint,
});

const planned0 = planLineageGate({
  lineage,
  observed_candidate_id: lineage.current_candidate_id,
});
if (planned0.next_action.type !== "run-lenses") {
  throw new Error(`expected run-lenses, got ${planned0.next_action.type}`);
}

const pending = {};
for (const dimension of planned0.next_action.dimensions) {
  const requestId = `start-${dimension}-k2`;
  lineage = beginLens(lineage, {
    dimension,
    expected_revision: lineage.revision,
    request_id: requestId,
  });
  pending[dimension] = {
    request_id: requestId,
    revision_after_begin: lineage.revision,
  };
}

const planned = planReviewGate({
  routeGates: ["4r-review-gate"],
  existingGate: {},
  decision,
  validationErrors: [],
});

const gateWithLineage = mergeReviewGateAudit(planned.gate, {
  lineage,
  status: "in-progress",
  findings_summary: null,
});

fs.writeFileSync(path.join(outDir, "decision.json"), JSON.stringify(decision, null, 2));
fs.writeFileSync(path.join(outDir, "generalist.json"), JSON.stringify(generalist, null, 2));
fs.writeFileSync(path.join(outDir, "lineage.json"), JSON.stringify(lineage, null, 2));
fs.writeFileSync(path.join(outDir, "pending-lenses.json"), JSON.stringify(pending, null, 2));
fs.writeFileSync(path.join(outDir, "gate.json"), JSON.stringify(gateWithLineage, null, 2));

let stateText = fs.readFileSync(statePath, "utf8");
const gateJson = JSON.stringify(gateWithLineage);
if (/4r-review-gate:\s*\n\s*status: pending/.test(stateText)) {
  stateText = stateText.replace(
    /4r-review-gate:\s*\n\s*status: pending/,
    `4r-review-gate: ${gateJson}`
  );
} else if (/^\s*4r-review-gate:/m.test(stateText)) {
  stateText = stateText.replace(/^\s*4r-review-gate:.*$/m, `  4r-review-gate: ${gateJson}`);
} else {
  throw new Error("4r-review-gate key not found in state.yaml");
}
fs.writeFileSync(statePath, stateText);

const after = planLineageGate({
  lineage,
  observed_candidate_id: lineage.current_candidate_id,
});

console.log(
  JSON.stringify(
    {
      generalist_valid: gv.valid,
      decision_valid: dv.valid,
      selected: decision.selected_specialists,
      depth: decision.depth,
      lineage_id: lineage.lineage_id,
      candidate_id: lineage.current_candidate_id,
      correction_budget: lineage.correction_budget,
      pending,
      next_action: after.next_action,
      dispatch: planned.dispatch,
      gate_status: gateWithLineage.status,
    },
    null,
    2
  )
);
