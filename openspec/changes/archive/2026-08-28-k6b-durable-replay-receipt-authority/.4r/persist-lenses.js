"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { recordLensResult, freezeFindings } = require("../../../../scripts/lib/review-lineage.js");
const { planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");

const DIR = __dirname;
const lineagePath = path.join(DIR, "lineage.json");
const results = JSON.parse(fs.readFileSync(path.join(DIR, "lens-results.json"), "utf8"));

let lineage = JSON.parse(fs.readFileSync(lineagePath, "utf8"));
const order = ["risk", "reliability", "resilience", "readability"];
for (const dimension of order) {
  lineage = recordLensResult(lineage, {
    dimension,
    request_id: results[dimension].request_id,
    expected_revision: lineage.revision,
    result: { findings: results[dimension].findings },
  });
}

lineage = freezeFindings(lineage, {
  request_id: "freeze-findings-001",
  expected_revision: lineage.revision,
});

fs.writeFileSync(lineagePath, `${JSON.stringify(lineage, null, 2)}\n`);

const planned = planLineageGate({
  lineage,
  observed_candidate_id: lineage.current_candidate_id,
  downstream_gate: "archive",
});

const counts = { BLOCKER: 0, CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
for (const finding of lineage.findings) counts[finding.severity] += 1;

console.log(JSON.stringify({
  status: lineage.status,
  revision: lineage.revision,
  findings_digest: lineage.findings_digest,
  counts,
  findings: lineage.findings.map((f) => ({
    id: f.id,
    owner: f.owner,
    severity: f.severity,
    blocking: f.blocking,
    resolution: f.resolution,
    summary: f.summary,
  })),
  next_action: planned.next_action,
  archive_allowed: planned.archive_allowed,
  slice_ids: lineage.correction_slices ? Object.keys(lineage.correction_slices) : [],
}, null, 2));
