"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { applyTargetedValidation, nextLineageAction } = require("../../../../scripts/lib/review-lineage.js");
const { planReviewGate, planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");

const root = path.resolve(__dirname, "../../../..");
process.chdir(root);

const statePath = "openspec/changes/k6a-isolation-frontier-hardening/state.yaml";
let yaml = fs.readFileSync(statePath, "utf8");
const m = yaml.match(/\n  4r-review-gate: (\{.*\})\n?$/m);
const gate = JSON.parse(m[1]);
const lineage0 = gate.lineage;

let lineage = applyTargetedValidation(lineage0, {
  request_id: "4r-validate-S-2331116459080264-001",
  expected_revision: lineage0.revision,
  slice_id: "S-2331116459080264",
  outcomes: [{ id: "F-a93a0811da865770", status: "resolved" }],
  regression: {
    detected: false,
    evidence: ["node --test scripts/lib/worker-sandbox.test.js → 20 pass / 0 fail"],
  },
  follow_ups: [],
});

const decision = {
  schema_version: gate.schema_version,
  classification: gate.classification,
  evidence: gate.evidence,
  generalist: gate.generalist,
  depth: gate.depth,
  escalation_reason: gate.escalation_reason,
  dimensions: gate.dimensions,
  selected_specialists: ["risk", "reliability", "resilience", "readability"],
};
const planned = planReviewGate({
  routeGates: ["clarify", "4r-review-gate"],
  existingGate: gate,
  decision,
  validationErrors: [],
});
const lineagePlan = planLineageGate({
  lineage,
  observed_candidate_id: lineage.current_candidate_id,
  downstream_gate: "archive",
});
const nextGate = {
  ...planned.gate,
  status: lineage.status,
  lineage,
  next_action: lineagePlan.next_action,
  archive_allowed: lineagePlan.archive_allowed,
};
yaml = yaml.replace(/\n  4r-review-gate: (\{.*\})\n?$/m, "\n  4r-review-gate: " + JSON.stringify(nextGate) + "\n");
fs.writeFileSync(statePath, yaml);
fs.writeFileSync(path.join(__dirname, "lineage.json"), JSON.stringify(lineage, null, 2));

console.log(
  JSON.stringify(
    {
      status: lineage.status,
      revision: lineage.revision,
      terminal_reason: lineage.terminal_reason,
      current_candidate_id: lineage.current_candidate_id,
      finding_resolution: lineage.findings.find((f) => f.id === "F-a93a0811da865770").resolution,
      slice_status: lineage.correction_slices["S-2331116459080264"].status,
      next_action: nextLineageAction(lineage),
      archive_allowed: lineagePlan.archive_allowed,
      lineage_plan_status: lineagePlan.status,
    },
    null,
    2,
  ),
);
