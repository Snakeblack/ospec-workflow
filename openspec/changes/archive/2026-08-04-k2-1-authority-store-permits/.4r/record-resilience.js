"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { recordLensResult } = require("../../../../scripts/lib/review-lineage.js");
const { planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");

const outDir = __dirname;
let lineage = JSON.parse(fs.readFileSync(path.join(outDir, "lineage.json"), "utf8"));
const { findings } = JSON.parse(
  fs.readFileSync(path.join(outDir, "lens-resilience.json"), "utf8"),
);

lineage = recordLensResult(lineage, {
  dimension: "resilience",
  request_id: "result-resilience-k21",
  expected_revision: lineage.revision,
  result: { findings },
});

fs.writeFileSync(path.join(outDir, "lineage.json"), JSON.stringify(lineage, null, 2));
const planned = planLineageGate({ lineage });
console.log(
  JSON.stringify(
    {
      resilience: lineage.lenses.resilience.status,
      pending: Object.entries(lineage.lenses)
        .filter(([, l]) => l.selected && l.status !== "completed")
        .map(([k, l]) => [k, l.status]),
      next_action: planned.next_action,
      revision: lineage.revision,
    },
    null,
    2,
  ),
);
