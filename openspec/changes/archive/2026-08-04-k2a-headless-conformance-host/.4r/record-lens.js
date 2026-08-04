"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { recordLensResult, nextLineageAction } = require("../../../../scripts/lib/review-lineage.js");
const { planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");

const outDir = __dirname;
const dimension = process.argv[2];
if (!dimension) {
  console.error("Usage: record-lens.js <dimension>");
  process.exit(1);
}

const lensPath = path.join(outDir, `lens-${dimension}.json`);
const lineagePath = path.join(outDir, "lineage.json");
const result = JSON.parse(fs.readFileSync(lensPath, "utf8"));
let lineage = JSON.parse(fs.readFileSync(lineagePath, "utf8"));

lineage = recordLensResult(lineage, {
  dimension,
  request_id: `start-${dimension}-k2a`,
  expected_revision: lineage.revision,
  result,
});

fs.writeFileSync(lineagePath, JSON.stringify(lineage, null, 2));
const planned = planLineageGate({ lineage });
fs.writeFileSync(path.join(outDir, "planned.json"), JSON.stringify(planned, null, 2));

console.log(
  JSON.stringify(
    {
      dimension,
      revision: lineage.revision,
      lens_status: lineage.lenses[dimension].status,
      findings: result.findings.length,
      next_action: planned.next_action,
      lenses: Object.fromEntries(
        Object.entries(lineage.lenses).map(([k, v]) => [k, v.status]),
      ),
    },
    null,
    2,
  ),
);
