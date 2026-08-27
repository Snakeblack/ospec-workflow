"use strict";

const fs = require("fs");
const path = require("path");
const { recordLensResult, freezeFindings } = require("../../../../scripts/lib/review-lineage.js");

const dir = __dirname;
let lineage = JSON.parse(fs.readFileSync(path.join(dir, "lineage.json"), "utf8"));

const lenses = {
  risk: require("./lens-risk-findings.json"),
  reliability: require("./lens-reliability-findings.json"),
  resilience: require("./lens-resilience-findings.json"),
  readability: require("./lens-readability-findings.json"),
};

for (const dimension of ["risk", "reliability", "resilience", "readability"]) {
  lineage = recordLensResult(lineage, {
    dimension,
    request_id: `lens-${dimension}-001`,
    expected_revision: lineage.revision,
    result: { findings: lenses[dimension] },
  });
}

lineage = freezeFindings(lineage, {
  request_id: "freeze-findings-001",
  expected_revision: lineage.revision,
});

fs.writeFileSync(path.join(dir, "lineage.json"), JSON.stringify(lineage, null, 2));

const counts = { BLOCKER: 0, CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
for (const f of lineage.findings) counts[f.severity] += 1;
const summary = `${counts.BLOCKER} BLOCKER, ${counts.CRITICAL} CRITICAL, ${counts.WARNING} WARNING, ${counts.SUGGESTION} SUGGESTION`;
console.log(JSON.stringify({
  status: lineage.status,
  terminal_reason: lineage.terminal_reason,
  revision: lineage.revision,
  findings_summary: summary,
  findings: lineage.findings.map((f) => ({ id: f.id, owner: f.owner, severity: f.severity, blocking: f.blocking })),
}, null, 2));
