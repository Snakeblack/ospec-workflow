"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { beginLens } = require("../../../../scripts/lib/review-lineage.js");
const { planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");

const outDir = __dirname;
const statePath = path.join(outDir, "..", "state.yaml");
const plannedGate = JSON.parse(fs.readFileSync(path.join(outDir, "planned-gate.json"), "utf8"));
let lineage = JSON.parse(fs.readFileSync(path.join(outDir, "lineage.json"), "utf8"));

lineage = beginLens(lineage, {
  dimension: "risk",
  request_id: "start-risk-harden-sdd-document-contract",
  expected_revision: lineage.revision,
});

const planned = planLineageGate({
  lineage,
  observed_candidate_id: lineage.current_candidate_id,
  downstream_gate: "status",
});

const gate = {
  ...plannedGate.gate,
  lineage,
  selected_reviewers: ["review-risk"],
  selection_rationale:
    "Classifier selected targeted risk from two design-risk facts; generalist clear; other dimensions skipped (no-signal).",
};

fs.writeFileSync(path.join(outDir, "lineage.json"), JSON.stringify(lineage, null, 2));
fs.writeFileSync(path.join(outDir, "planned-lineage.json"), JSON.stringify(planned, null, 2));
fs.writeFileSync(path.join(outDir, "gate.json"), JSON.stringify(gate, null, 2));

let state = fs.readFileSync(statePath, "utf8").replace(/\r\n/g, "\n");
const gateLine = `  4r-review-gate: ${JSON.stringify(gate)}\n`;
if (state.includes("  4r-review-gate:")) {
  state = state.replace(/^  4r-review-gate: .*$/m, gateLine.trimEnd());
} else if (/^gates:\s*$/m.test(state)) {
  state = state.replace(/^gates:\s*$/m, `gates:\n${gateLine.trimEnd()}`);
} else {
  state = state.replace(/\nbaseline_fingerprints:\n/, `\ngates:\n${gateLine}baseline_fingerprints:\n`);
}

fs.writeFileSync(statePath, state.endsWith("\n") ? state : `${state}\n`);

console.log(
  JSON.stringify(
    {
      lens: lineage.lenses.risk.status,
      revision: lineage.revision,
      pending_operation: lineage.pending_operation,
      next_action: planned.next_action,
      dispatch: planned.dispatch,
    },
    null,
    2
  )
);
