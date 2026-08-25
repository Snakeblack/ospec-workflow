"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { recordLensResult, freezeFindings } = require("../../../../scripts/lib/review-lineage.js");
const { planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");

const outDir = __dirname;
const statePath = path.join(outDir, "..", "state.yaml");
let lineage = JSON.parse(fs.readFileSync(path.join(outDir, "lineage.json"), "utf8"));
const existingGate = JSON.parse(fs.readFileSync(path.join(outDir, "gate.json"), "utf8"));

lineage = recordLensResult(lineage, {
  dimension: "risk",
  expected_revision: lineage.revision,
  request_id: "result-risk-harden-sdd-document-contract",
  result: { findings: [] },
});

lineage = freezeFindings(lineage, {
  expected_revision: lineage.revision,
  request_id: "freeze-harden-sdd-document-contract",
});

const planned = planLineageGate({
  lineage,
  observed_candidate_id: lineage.current_candidate_id,
  downstream_gate: "archive",
});

const findingsSummary = "0 BLOCKER, 0 CRITICAL, 0 WARNING, 0 SUGGESTION";
const gate = {
  ...existingGate,
  status: lineage.status === "approved" ? "approved" : existingGate.status,
  lineage,
  findings_summary: findingsSummary,
  lineage_status: lineage.status,
  terminal_reason: lineage.terminal_reason,
  archive_allowed: planned.archive_allowed,
  blocking_finding_ids: [],
  selected_reviewers: ["review-risk"],
};

fs.writeFileSync(path.join(outDir, "lineage.json"), JSON.stringify(lineage, null, 2));
fs.writeFileSync(path.join(outDir, "planned-lineage.json"), JSON.stringify(planned, null, 2));
fs.writeFileSync(path.join(outDir, "gate.json"), JSON.stringify(gate, null, 2));

let state = fs.readFileSync(statePath, "utf8").replace(/\r\n/g, "\n");
const gateLine = `  4r-review-gate: ${JSON.stringify(gate)}`;
if (state.includes("  4r-review-gate:")) {
  state = state.replace(/^  4r-review-gate: .*$/m, gateLine);
} else {
  throw new Error("missing 4r-review-gate line");
}
fs.writeFileSync(statePath, state.endsWith("\n") ? state : `${state}\n`);

console.log(
  JSON.stringify(
    {
      lineage_status: lineage.status,
      terminal_reason: lineage.terminal_reason,
      findings: lineage.findings.length,
      next_action: planned.next_action,
      archive_allowed: planned.archive_allowed,
      plan_status: planned.status,
    },
    null,
    2
  )
);
