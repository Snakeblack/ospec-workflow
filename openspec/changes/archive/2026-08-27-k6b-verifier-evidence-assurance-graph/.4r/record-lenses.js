"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { recordLensResult, freezeFindings, nextLineageAction } = require("../../../../scripts/lib/review-lineage.js");
const { planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");

const outDir = __dirname;
let lineage = JSON.parse(fs.readFileSync(path.join(outDir, "lineage.json"), "utf8"));

function slim(findings) {
  return findings.map((f) => ({
    severity: f.severity,
    summary: f.summary,
    acceptance_criteria: f.acceptance_criteria,
  }));
}

const results = {
  risk: [],
  reliability: slim(JSON.parse(fs.readFileSync(path.join(outDir, "lens-reliability-findings.json"), "utf8"))),
  resilience: [],
  readability: slim(JSON.parse(fs.readFileSync(path.join(outDir, "lens-readability-findings.json"), "utf8"))),
};

for (const dimension of ["risk", "reliability", "resilience", "readability"]) {
  lineage = recordLensResult(lineage, {
    dimension,
    request_id: `start-${dimension}-k6b`,
    expected_revision: lineage.revision,
    result: { findings: results[dimension] },
  });
}

lineage = freezeFindings(lineage, {
  request_id: "freeze-k6b-4r",
  expected_revision: lineage.revision,
});

const planned = planLineageGate({
  lineage,
  observed_candidate_id: lineage.current_candidate_id,
  downstream_gate: "status",
});

fs.writeFileSync(path.join(outDir, "lineage.json"), JSON.stringify(lineage, null, 2));
fs.writeFileSync(path.join(outDir, "planned-lineage.json"), JSON.stringify(planned, null, 2));

const summary = {
  BLOCKER: 0, CRITICAL: 0, WARNING: 0, SUGGESTION: 0,
};
for (const f of lineage.findings) summary[f.severity] += 1;

console.log(JSON.stringify({
  status: lineage.status,
  terminal_reason: lineage.terminal_reason,
  revision: lineage.revision,
  findings_summary: `${summary.BLOCKER} BLOCKER, ${summary.CRITICAL} CRITICAL, ${summary.WARNING} WARNING, ${summary.SUGGESTION} SUGGESTION`,
  blocking: lineage.findings.filter((f) => f.blocking).map((f) => ({ id: f.id, owner: f.owner, summary: f.summary })),
  next_action: planned.next_action,
  budget: lineage.correction_budget,
}, null, 2));
