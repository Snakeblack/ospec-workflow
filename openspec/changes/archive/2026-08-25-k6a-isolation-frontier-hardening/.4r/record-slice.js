"use strict";

const fs = require("node:fs");
const crypto = require("node:crypto");
const path = require("node:path");
const { execSync } = require("node:child_process");
const { recordCorrection, nextLineageAction } = require("../../../../scripts/lib/review-lineage.js");
const { planReviewGate } = require("../../../../scripts/lib/review-gate-state.js");

function sha(buf) {
  return "sha256:" + crypto.createHash("sha256").update(buf).digest("hex");
}

const root = path.resolve(__dirname, "../../../..");
process.chdir(root);

const paths = [
  "scripts/k6a-e2e-worker-isolation.test.js",
  "scripts/lib/capability-proof/index.js",
  "scripts/lib/capability-proof/index.test.js",
  "scripts/lib/host-adapters/claude.js",
  "scripts/lib/host-adapters/claude.test.js",
  "scripts/lib/host-adapters/registry.test.js",
  "scripts/lib/host-contract/index.js",
  "scripts/lib/host-contract/index.test.js",
  "scripts/lib/k6a-lifecycle-model.test.js",
  "scripts/lib/lifecycle-model.js",
  "scripts/lib/lifecycle-model.test.js",
  "scripts/lib/worker-executor.js",
  "scripts/lib/worker-executor.test.js",
  "scripts/lib/worker-sandbox-confine.js",
  "scripts/lib/worker-sandbox-preload.js",
  "scripts/lib/worker-sandbox.js",
  "scripts/lib/worker-sandbox.test.js",
];

const pendingPaths = [
  "scripts/lib/worker-sandbox-preload.js",
  "scripts/lib/worker-sandbox.test.js",
];

const genesisDiff = execSync("git diff HEAD -- " + paths.join(" "), {
  encoding: "buffer",
  maxBuffer: 20 * 1024 * 1024,
});

const preloadLines = fs.readFileSync("scripts/lib/worker-sandbox-preload.js", "utf8").split(/\r?\n/);
const testLinesArr = fs.readFileSync("scripts/lib/worker-sandbox.test.js", "utf8").split(/\r?\n/);
const wrapStart = preloadLines.findIndex((l) => l.includes("Intercept worker_threads"));
const wrapEnd = preloadLines.findIndex((l) => l.includes("wt.Worker = ConfinedWorker"));
const testStart = testLinesArr.findIndex((l) => l.includes("nested worker_threads.Worker with eval"));
let testEnd = -1;
if (testStart >= 0) {
  testEnd = testLinesArr.findIndex((l, i) => i > testStart && l === "});");
}
const wrapLines = wrapStart >= 0 && wrapEnd >= wrapStart ? wrapEnd - wrapStart + 1 : 0;
const testLines = testStart >= 0 && testEnd >= testStart ? testEnd - testStart + 1 : 0;
const importAdded = preloadLines.some((l) => l.includes("createSandboxDenial")) ? 1 : 0;
if (!wrapLines || !testLines) {
  throw new Error("could not isolate slice hunks: wrap=" + wrapLines + " test=" + testLines);
}
const actual = wrapLines + testLines + importAdded;

const blobConcat = Buffer.concat(
  paths.flatMap((p, i) => (i === 0 ? [fs.readFileSync(p)] : [Buffer.from("\0"), fs.readFileSync(p)])),
);

const statePath = "openspec/changes/k6a-isolation-frontier-hardening/state.yaml";
let yaml = fs.readFileSync(statePath, "utf8");
const m = yaml.match(/\n  4r-review-gate: (\{.*\})\n?$/m);
const gate = JSON.parse(m[1]);
const lineage0 = gate.lineage;
if (actual > lineage0.pending_correction.forecast_lines) {
  throw new Error("actual exceeds forecast: " + actual);
}

const corrected = {
  ...lineage0.current_candidate,
  candidate_tree: sha(blobConcat),
  diff_hash: sha(genesisDiff),
};

let lineage = recordCorrection(lineage0, {
  request_id: "4r-record-S-2331116459080264-001",
  expected_revision: lineage0.revision,
  base_candidate_id: lineage0.pending_correction.base_candidate_id,
  paths: pendingPaths,
  actual_changed_lines: actual,
  corrected_candidate: corrected,
});

const decision = {
  schema_version: gate.schema_version,
  classification: gate.classification,
  evidence: gate.evidence,
  generalist: gate.generalist,
  depth: gate.depth,
  escalation_reason: gate.escalation_reason,
  dimensions: gate.dimensions,
  selected_specialists: ["risk", "reliability", "resilience", "readability"],
};
const planned = planReviewGate({
  routeGates: ["clarify", "4r-review-gate"],
  existingGate: gate,
  decision,
  validationErrors: [],
});
const nextGate = { ...planned.gate, status: lineage.status, lineage };
yaml = yaml.replace(/\n  4r-review-gate: (\{.*\})\n?$/m, "\n  4r-review-gate: " + JSON.stringify(nextGate) + "\n");
fs.writeFileSync(statePath, yaml);
fs.writeFileSync(path.join(__dirname, "lineage.json"), JSON.stringify(lineage, null, 2));

console.log(
  JSON.stringify(
    {
      wrapLines,
      testLines,
      importAdded,
      actual,
      old_diff_hash: lineage0.current_candidate.diff_hash,
      new_diff_hash: corrected.diff_hash,
      new_candidate_tree: corrected.candidate_tree,
      status: lineage.status,
      revision: lineage.revision,
      current_candidate_id: lineage.current_candidate_id,
      slice_status: lineage.correction_slices["S-2331116459080264"].status,
      used_lines: lineage.correction_slices["S-2331116459080264"].used_lines,
      next_action: nextLineageAction(lineage),
      planned_next: planned.next_action,
    },
    null,
    2,
  ),
);
