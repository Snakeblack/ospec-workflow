"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  validateGeneralistDecision,
  deriveReviewDimensions,
  validateReviewDecision,
} = require("../../../../scripts/lib/review-dimensions.js");
const { planReviewGate, planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");
const { startReviewLineage, beginLens } = require("../../../../scripts/lib/review-lineage.js");

const dir = __dirname;
const packed = JSON.parse(fs.readFileSync(path.join(dir, "evidence.json"), "utf8"));
const generalist = {
  status: "needs-specialist",
  specialists: ["risk", "reliability", "resilience"],
  reason: "signals=design-risk,diff-error-flow,metadata-runtime;dimensions=risk,reliability,resilience",
};

const gv = validateGeneralistDecision(generalist);
if (!gv.valid) throw new Error(`generalist invalid: ${gv.errors.join("; ")}`);

const decision = deriveReviewDimensions(packed.evidence, generalist);
const dv = validateReviewDecision(decision);
if (!dv.valid) throw new Error(`decision invalid: ${dv.errors.join("; ")}`);

const planned = planReviewGate({
  routeGates: ["clarify", "4r-review-gate"],
  existingGate: {},
  decision,
  validationErrors: [],
});
if (planned.status === "blocked") throw new Error(`gate blocked: ${JSON.stringify(planned.gate)}`);

let lineage = startReviewLineage({
  classification: "high-risk",
  evidence_fingerprint: packed.evidence.fingerprint,
  selected_dimensions: decision.selected_specialists,
  candidate: packed.candidate,
});

const requestIds = {};
for (const dimension of decision.selected_specialists) {
  const request_id = `lens-${dimension}-${crypto.randomBytes(8).toString("hex")}`;
  requestIds[dimension] = request_id;
  lineage = beginLens(lineage, {
    dimension,
    request_id,
    expected_revision: lineage.revision,
  });
}

const lineagePlan = planLineageGate({ lineage, observed_candidate_id: lineage.current_candidate_id });

const gate = {
  ...planned.gate,
  lineage,
};

fs.writeFileSync(path.join(dir, "gate.json"), `${JSON.stringify(gate, null, 2)}\n`);
fs.writeFileSync(path.join(dir, "lineage.json"), `${JSON.stringify(lineage, null, 2)}\n`);
fs.writeFileSync(path.join(dir, "request-ids.json"), `${JSON.stringify({ requestIds, revision: lineage.revision }, null, 2)}\n`);

const statePath = path.join(dir, "..", "state.yaml");
let yaml = fs.readFileSync(statePath, "utf8");
if (!/^gates:/m.test(yaml)) {
  yaml = yaml.replace(/\s*$/, `\ngates:\n  4r-review-gate: ${JSON.stringify(gate)}\n`);
} else {
  throw new Error("state.yaml already has gates; merge manually");
}
fs.writeFileSync(statePath, yaml);

console.log(JSON.stringify({
  gate_status: planned.status,
  dispatch: planned.dispatch,
  lineage_id: lineage.lineage_id,
  candidate_id: lineage.current_candidate_id,
  revision: lineage.revision,
  next_action: lineagePlan.next_action,
  selected: decision.selected_specialists,
  requestIds,
}, null, 2));
