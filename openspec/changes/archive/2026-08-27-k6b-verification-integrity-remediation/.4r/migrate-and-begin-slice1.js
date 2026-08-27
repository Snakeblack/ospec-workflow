"use strict";

const fs = require("fs");
const path = require("path");
const { migrateReviewLineage, beginCorrection, nextLineageAction } = require("../../../../scripts/lib/review-lineage.js");

const dir = __dirname;
const lineagePath = path.join(dir, "lineage.json");
let lineage = JSON.parse(fs.readFileSync(lineagePath, "utf8"));

const slice1Paths = [
  "openspec/changes/k6b-verification-integrity-remediation/apply-progress.md",
  "scripts/k6b-verifier-assurance-graph-e2e.test.js",
  "scripts/lib/assurance-graph/index.js",
  "scripts/lib/assurance-graph/index.test.js",
  "scripts/lib/assurance-graph/projector.js",
  "scripts/lib/independent-verifier/collector-provenance.js",
  "scripts/lib/independent-verifier/evidence.js",
  "scripts/lib/independent-verifier/index.js",
  "scripts/lib/independent-verifier/index.test.js",
];
const slice2Paths = [
  "openspec/changes/k6b-verification-integrity-remediation/apply-progress.md",
  "scripts/lib/independent-verifier/obligation-coverage.js",
  "scripts/lib/independent-verifier/obligation-coverage.test.js",
];

const manifest = {
  slices: [
    {
      root_cause_key: "collector-trust-boundary",
      finding_ids: ["F-d5739d79237afeb8"],
      permitted_paths: slice1Paths,
    },
    {
      root_cause_key: "must-walk-coverage",
      finding_ids: ["F-b3d6518c12aa69fe", "F-00f97ff647d28eea", "F-ef73f7e16cab6436"],
      permitted_paths: slice2Paths,
    },
  ],
};

lineage = migrateReviewLineage(lineage, manifest);
fs.writeFileSync(path.join(dir, "manifest-v2.json"), JSON.stringify(manifest, null, 2));

const action = nextLineageAction(lineage);
const sliceId = action.slice_id;
const slice = lineage.correction_slices[sliceId];

lineage = beginCorrection(lineage, {
  request_id: "slice-1-correction-start",
  expected_revision: lineage.revision,
  slice_id: sliceId,
  finding_ids: slice.finding_ids,
  paths: slice.permitted_paths,
  base_candidate_id: lineage.current_candidate_id,
  forecast_lines: 180,
});

fs.writeFileSync(lineagePath, JSON.stringify(lineage, null, 2));
console.log(JSON.stringify({
  status: lineage.status,
  revision: lineage.revision,
  active_slice_id: lineage.active_slice_id,
  slice_order: lineage.slice_order,
  slices: Object.fromEntries(Object.entries(lineage.correction_slices).map(([id, s]) => [id, { root_cause_key: s.root_cause_key, finding_ids: s.finding_ids, status: s.status, limit_lines: s.limit_lines }])),
  pending_correction: lineage.pending_correction,
  next_before_begin: action,
}, null, 2));
