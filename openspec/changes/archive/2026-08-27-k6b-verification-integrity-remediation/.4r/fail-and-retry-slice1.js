"use strict";

const fs = require("fs");
const path = require("path");
const { applyTargetedValidation, beginCorrection, nextLineageAction } = require("../../../../scripts/lib/review-lineage.js");

const lineagePath = path.join(__dirname, "lineage.json");
let lineage = JSON.parse(fs.readFileSync(lineagePath, "utf8"));

lineage = applyTargetedValidation(lineage, {
  request_id: "slice-1-validation-001",
  expected_revision: lineage.revision,
  slice_id: lineage.active_slice_id,
  outcomes: [{ id: "F-d5739d79237afeb8", status: "unresolved" }],
  regression: {
    detected: false,
    evidence: [
      "static: resolveEvidenceProvenance still reads raw.collector from the same object as bytes/origin",
      "apply-progress: 48 focal tests pass; no passed slices exist",
    ],
    impacted_slices: [],
  },
  follow_ups: [],
});

const action = nextLineageAction(lineage);
const remaining = 200 - lineage.correction_slices["S-ea4088e8a61de9f8"].used_lines;

if (action.type === "correct" && action.slice_id === "S-ea4088e8a61de9f8") {
  const slice = lineage.correction_slices[action.slice_id];
  lineage = beginCorrection(lineage, {
    request_id: "slice-1-correction-start-002",
    expected_revision: lineage.revision,
    slice_id: action.slice_id,
    finding_ids: slice.finding_ids,
    paths: slice.permitted_paths,
    base_candidate_id: lineage.current_candidate_id,
    forecast_lines: remaining,
  });
}

fs.writeFileSync(lineagePath, JSON.stringify(lineage, null, 2));
console.log(JSON.stringify({
  status: lineage.status,
  revision: lineage.revision,
  failed_attempts: lineage.correction_slices["S-ea4088e8a61de9f8"].failed_attempts,
  used_lines: lineage.correction_slices["S-ea4088e8a61de9f8"].used_lines,
  remaining,
  pending: lineage.pending_correction,
  action_before_begin: action,
}, null, 2));
