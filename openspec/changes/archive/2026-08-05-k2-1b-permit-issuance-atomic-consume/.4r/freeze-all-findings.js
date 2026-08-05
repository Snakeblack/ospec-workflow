"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  recordLensResult,
  freezeFindings,
  nextLineageAction,
} = require("../../../../scripts/lib/review-lineage.js");
const { planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");

const outDir = __dirname;
const dims = ["risk", "reliability", "resilience", "readability"];

let lineage = JSON.parse(fs.readFileSync(path.join(outDir, "lineage.json"), "utf8"));

for (const dimension of dims) {
  const payload = JSON.parse(fs.readFileSync(path.join(outDir, `lens-${dimension}.json`), "utf8"));
  lineage = recordLensResult(lineage, {
    dimension,
    request_id: `result-${dimension}-k21b`,
    expected_revision: lineage.revision,
    result: { findings: payload.findings },
  });
}

lineage = freezeFindings(lineage, {
  request_id: "freeze-findings-k21b",
  expected_revision: lineage.revision,
});

const planned = planLineageGate({ lineage });
const next = nextLineageAction(lineage);

fs.writeFileSync(path.join(outDir, "lineage.json"), JSON.stringify(lineage, null, 2));
fs.writeFileSync(path.join(outDir, "planned-after-freeze.json"), JSON.stringify(planned, null, 2));
fs.writeFileSync(
  path.join(outDir, "findings-summary.json"),
  JSON.stringify(
    {
      status: lineage.status,
      terminal_reason: lineage.terminal_reason,
      findings: lineage.findings.map((f) => ({
        id: f.id,
        owner: f.owner,
        severity: f.severity,
        blocking: f.blocking,
        resolution: f.resolution,
        summary: f.summary,
      })),
      counts: {
        BLOCKER: lineage.findings.filter((f) => f.severity === "BLOCKER").length,
        CRITICAL: lineage.findings.filter((f) => f.severity === "CRITICAL").length,
        WARNING: lineage.findings.filter((f) => f.severity === "WARNING").length,
        SUGGESTION: lineage.findings.filter((f) => f.severity === "SUGGESTION").length,
      },
      next_action: planned.next_action,
      next_lineage_action: next,
    },
    null,
    2,
  ),
);

console.log(
  JSON.stringify(
    {
      status: lineage.status,
      revision: lineage.revision,
      counts: {
        BLOCKER: lineage.findings.filter((f) => f.severity === "BLOCKER").length,
        CRITICAL: lineage.findings.filter((f) => f.severity === "CRITICAL").length,
        WARNING: lineage.findings.filter((f) => f.severity === "WARNING").length,
        SUGGESTION: lineage.findings.filter((f) => f.severity === "SUGGESTION").length,
      },
      blocking: lineage.findings.filter((f) => f.blocking).map((f) => `${f.id} [${f.owner}] ${f.summary}`),
      next_action: planned.next_action,
    },
    null,
    2,
  ),
);
