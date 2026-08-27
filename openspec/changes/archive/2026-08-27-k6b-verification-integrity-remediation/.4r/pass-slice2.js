"use strict";

const fs = require("fs");
const path = require("path");
const { applyTargetedValidation, nextLineageAction } = require("../../../../scripts/lib/review-lineage.js");

const lineagePath = path.join(__dirname, "lineage.json");
let lineage = JSON.parse(fs.readFileSync(lineagePath, "utf8"));

lineage = applyTargetedValidation(lineage, {
  request_id: "slice-2-validation-001",
  expected_revision: lineage.revision,
  slice_id: "S-ad5558b5639b6890",
  outcomes: [
    { id: "F-00f97ff647d28eea", status: "resolved" },
    { id: "F-b3d6518c12aa69fe", status: "resolved" },
    { id: "F-ef73f7e16cab6436", status: "resolved" },
  ],
  regression: {
    detected: false,
    evidence: [
      "static: obligation-coverage.js only tightened missing/non-array graph to BINDING_MISMATCH and UNFULFILLED_MUST wording (evidence, not assessment); collector-trust-boundary paths were not in this delta",
      "node --test scripts/lib/independent-verifier/obligation-coverage.test.js → 10 pass / 0 fail; no attributable break of S-ea4088e8a61de9f8 / F-d5739d79237afeb8",
    ],
    impacted_slices: [],
  },
  follow_ups: [
    {
      owner: "readability",
      summary: "F-f979f00ae92cda6f sigue advisory: required_evidence solo comprueba vacío; el matching no usa su contenido.",
    },
  ],
});

const action = nextLineageAction(lineage);
fs.writeFileSync(lineagePath, JSON.stringify(lineage, null, 2));
console.log(JSON.stringify({
  status: lineage.status,
  revision: lineage.revision,
  terminal_reason: lineage.terminal_reason,
  slice1: lineage.correction_slices["S-ea4088e8a61de9f8"].status,
  slice2: lineage.correction_slices["S-ad5558b5639b6890"].status,
  blocking: lineage.findings.filter((f) => f.blocking).map((f) => ({ id: f.id, resolution: f.resolution })),
  follow_ups: lineage.follow_ups.length,
  action,
}, null, 2));
