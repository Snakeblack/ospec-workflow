"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  freezeFindings,
  migrateReviewLineage,
} = require("../../../../scripts/lib/review-lineage.js");
const { planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");

const outDir = __dirname;
let lineage = JSON.parse(fs.readFileSync(path.join(outDir, "lineage.json"), "utf8"));

lineage = freezeFindings(lineage, {
  request_id: "freeze-findings-k2a",
  expected_revision: lineage.revision,
  remediation_v2: true,
});

lineage = migrateReviewLineage(lineage);
const planned = planLineageGate({ lineage });

fs.writeFileSync(path.join(outDir, "lineage.json"), JSON.stringify(lineage, null, 2));
fs.writeFileSync(path.join(outDir, "planned-after-freeze.json"), JSON.stringify(planned, null, 2));

const counts = { BLOCKER: 0, CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
for (const f of lineage.findings) counts[f.severity] = (counts[f.severity] || 0) + 1;

const summary = {
  findings_summary: `${counts.BLOCKER} BLOCKER, ${counts.CRITICAL} CRITICAL, ${counts.WARNING} WARNING, ${counts.SUGGESTION} SUGGESTION`,
  counts,
  blocking: lineage.findings
    .filter((f) => f.blocking)
    .map((f) => ({
      id: f.id,
      owner: f.owner,
      severity: f.severity,
      summary: f.summary,
      acceptance_criteria: f.acceptance_criteria,
    })),
  advisory: lineage.findings
    .filter((f) => !f.blocking)
    .map((f) => ({
      id: f.id,
      owner: f.owner,
      severity: f.severity,
      summary: f.summary,
    })),
  next_action: planned.next_action,
  lineage_status: lineage.status,
  budget: lineage.correction_budget,
  slice_order: lineage.slice_order || [],
  active_slices: Object.fromEntries(
    Object.entries(lineage.correction_slices || {}).map(([id, s]) => [
      id,
      {
        status: s.status,
        finding_ids: s.finding_ids,
        root_cause_key: s.root_cause_key,
      },
    ]),
  ),
};

fs.writeFileSync(path.join(outDir, "findings-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
