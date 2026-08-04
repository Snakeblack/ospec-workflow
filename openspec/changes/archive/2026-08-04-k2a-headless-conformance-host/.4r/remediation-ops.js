"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  beginCorrection,
  recordCorrection,
  applyTargetedValidation,
  migrateReviewLineage,
} = require("../../../../scripts/lib/review-lineage.js");
const { planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");

const outDir = __dirname;
const cmd = process.argv[2];

function load() {
  return JSON.parse(fs.readFileSync(path.join(outDir, "lineage.json"), "utf8"));
}
function save(lineage, plannedName = "planned.json") {
  fs.writeFileSync(path.join(outDir, "lineage.json"), JSON.stringify(lineage, null, 2));
  const planned = planLineageGate({ lineage });
  fs.writeFileSync(path.join(outDir, plannedName), JSON.stringify(planned, null, 2));
  return planned;
}

if (cmd === "begin") {
  const sliceId = process.argv[3];
  const forecast = Number(process.argv[4] || 80);
  let lineage = migrateReviewLineage(load());
  const slice = lineage.correction_slices[sliceId];
  if (!slice) throw new Error("unknown slice " + sliceId);
  const slicePathHints = {
    "S-68e4f2cc1ecfc32e": [
      "scripts/lib/host-contract/index.js",
      "scripts/lib/host-contract/index.test.js",
      "scripts/lib/headless-conformance-host.js",
      "scripts/lib/headless-conformance-host.test.js",
    ],
    "S-bcc348539b8f5259": [
      "scripts/lib/headless-conformance-host.js",
      "scripts/lib/headless-conformance-host.test.js",
    ],
    "S-c7287ca3d143070a": [
      "scripts/lib/headless-conformance-host.js",
      "scripts/lib/headless-conformance-host.test.js",
      "scripts/lib/host-contract/index.js",
    ],
    "S-d6b71ebf835f1c09": [
      "scripts/lib/capability-proof/index.js",
      "scripts/lib/capability-proof/index.test.js",
    ],
  };
  const preferred = (slicePathHints[sliceId] || []).filter((p) => slice.permitted_paths.includes(p));
  const paths = preferred.length ? preferred : slice.permitted_paths.slice(0, 10);
  lineage = beginCorrection(lineage, {
    slice_id: sliceId,
    request_id: `correct-${sliceId}`,
    expected_revision: lineage.revision,
    finding_ids: slice.finding_ids,
    paths,
    base_candidate_id: lineage.current_candidate_id,
    forecast_lines: forecast,
  });
  const planned = save(lineage, "planned-correcting.json");
  console.log(JSON.stringify({ status: lineage.status, slice_id: sliceId, paths, next: planned.next_action }, null, 2));
} else if (cmd === "record") {
  const actual = Number(process.argv[3]);
  let lineage = load();
  const pending = lineage.pending_correction;
  if (!pending) throw new Error("no pending correction");
  const corrected = {
    ...lineage.current_candidate,
    candidate_tree: `WORKING-TREE-k2a-remediated-${pending.slice_id}`,
  };
  lineage = recordCorrection(lineage, {
    request_id: `record-${pending.slice_id}`,
    expected_revision: lineage.revision,
    base_candidate_id: pending.base_candidate_id,
    paths: pending.paths,
    actual_changed_lines: actual,
    corrected_candidate: corrected,
  });
  const planned = save(lineage, "planned-validating.json");
  console.log(JSON.stringify({ status: lineage.status, slice_id: pending.slice_id, next: planned.next_action }, null, 2));
} else if (cmd === "validate") {
  const outcomesPath = process.argv[3];
  const outcomes = JSON.parse(fs.readFileSync(outcomesPath, "utf8"));
  let lineage = load();
  lineage = applyTargetedValidation(lineage, {
    request_id: `validate-${lineage.active_slice_id}`,
    expected_revision: lineage.revision,
    slice_id: lineage.active_slice_id,
    outcomes: outcomes.outcomes,
    regression: outcomes.regression || { detected: false },
    follow_ups: outcomes.follow_ups || [],
  });
  const planned = save(lineage, "planned-after-validate.json");
  console.log(
    JSON.stringify(
      {
        status: lineage.status,
        active: lineage.active_slice_id,
        slice: lineage.correction_slices[lineage.active_slice_id],
        next: planned.next_action,
      },
      null,
      2,
    ),
  );
} else {
  console.error("Usage: remediation-ops.js begin <sliceId> [forecast] | record <actualLines> | validate <outcomes.json>");
  process.exit(1);
}
