"use strict";

const fs = require("fs");
const path = require("path");
const {
  applyTargetedValidation,
  beginCorrection,
  nextLineageAction,
} = require("../../../../scripts/lib/review-lineage.js");

const lineagePath = path.join(__dirname, "lineage.json");
let lineage = JSON.parse(fs.readFileSync(lineagePath, "utf8"));

lineage = applyTargetedValidation(lineage, {
  request_id: "slice-1-validation-002",
  expected_revision: lineage.revision,
  slice_id: "S-ea4088e8a61de9f8",
  outcomes: [{ id: "F-d5739d79237afeb8", status: "resolved" }],
  regression: {
    detected: false,
    evidence: [
      "static: resolveEvidenceProvenance(raw, harnessCollector) returns UNTRUSTED_COLLECTOR if raw.collector exists; deriveProvenanceClass uses only harnessCollector; trusted mismatch (including weak vs allowlisted) fails closed",
      "node --test --test-name-pattern \"envelope collector fails closed\" scripts/lib/independent-verifier/index.test.js → GREEN (apply-progress Batch 3)",
      "index.test.js 10 pass / 25 fail because raw() still attaches collector to the envelope; no passed slices exist",
    ],
    impacted_slices: [],
  },
  follow_ups: [
    {
      owner: "reliability",
      summary: "raw(), e2e y assurance-graph tests siguen inyectando collector en el sobre del worker; index.test.js queda 10/25 y el camino harness no cubre claims débiles en el test focal.",
    },
    {
      owner: "risk",
      summary: "input.collector worker con claim human-decision|external-unverified se reescribe a model-reported sin UNTRUSTED_COLLECTOR; no escala a clase fuerte.",
    },
  ],
});

const action = nextLineageAction(lineage);
if (action.type !== "correct" || action.slice_id !== "S-ad5558b5639b6890") {
  fs.writeFileSync(lineagePath, JSON.stringify(lineage, null, 2));
  console.log(JSON.stringify({ status: lineage.status, action, slice1: lineage.correction_slices["S-ea4088e8a61de9f8"].status }, null, 2));
  process.exit(1);
}

const slice = lineage.correction_slices[action.slice_id];
lineage = beginCorrection(lineage, {
  request_id: "slice-2-correction-start",
  expected_revision: lineage.revision,
  slice_id: action.slice_id,
  finding_ids: slice.finding_ids,
  paths: slice.permitted_paths,
  base_candidate_id: lineage.current_candidate_id,
  forecast_lines: 130,
});

fs.writeFileSync(lineagePath, JSON.stringify(lineage, null, 2));
console.log(JSON.stringify({
  status: lineage.status,
  revision: lineage.revision,
  slice1: lineage.correction_slices["S-ea4088e8a61de9f8"].status,
  slice2: lineage.correction_slices["S-ad5558b5639b6890"].status,
  pending: lineage.pending_correction,
  follow_ups: lineage.follow_ups.length,
}, null, 2));
