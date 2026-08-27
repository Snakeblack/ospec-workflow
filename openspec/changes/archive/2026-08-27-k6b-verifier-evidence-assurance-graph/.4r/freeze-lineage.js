"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const {
  normalizeReviewEvidence,
  validateGeneralistDecision,
  deriveReviewDimensions,
  validateReviewDecision,
} = require("../../../../scripts/lib/review-dimensions.js");
const {
  startReviewLineage,
  beginLens,
  nextLineageAction,
} = require("../../../../scripts/lib/review-lineage.js");
const { planReviewGate, planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");

const outDir = __dirname;
const ROOT = path.resolve(__dirname, "../../../..");
const diff = fs.readFileSync(path.join(outDir, "working.diff"), "utf8").replace(/\r\n/g, "\n");

const re = /^diff --git a\/(.+) b\/(.+)$/gm;
const paths = [];
let match;
while ((match = re.exec(diff))) paths.push(match[2]);

const evidence = normalizeReviewEvidence({
  classification: "high-risk",
  verify: { status: "success", findings: [] },
  diff,
  paths,
  capabilities: ["runtime"],
  dependencies: [],
  operationTypes: ["add", "modify"],
  designRisks: [{ code: "design-risk", detail: "Independent verifier and Assurance Graph are kernel public contracts" }],
});

const generalist = {
  status: "needs-specialist",
  specialists: ["risk", "reliability", "resilience", "readability"],
  reason:
    "signals=design-risk,diff-auth-permission,diff-error-flow,diff-structural-complexity,metadata-runtime;dimensions=risk,reliability,resilience,readability",
};

const g = validateGeneralistDecision(generalist);
if (!g.valid) throw new Error("generalist invalid: " + g.errors.join("; "));

const derived = deriveReviewDimensions(evidence, generalist);
const v = validateReviewDecision(derived);
if (!v.valid) throw new Error("derived invalid: " + (v.errors || []).join("; "));

const plannedGate = planReviewGate({
  routeGates: ["clarify", "4r-review-gate"],
  existingGate: {},
  decision: derived,
  validationErrors: [],
});

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function digest(domain, value) {
  const stable = JSON.stringify(value);
  return `sha256:${crypto.createHash("sha256").update(`${domain}\0${stable}`).digest("hex")}`;
}

let plus = 0;
let minus = 0;
for (const line of diff.split("\n")) {
  if (line.startsWith("+++") || line.startsWith("---")) continue;
  if (line.startsWith("+")) plus += 1;
  else if (line.startsWith("-")) minus += 1;
}
const changed = plus + minus;

const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" });
const baseTree = head.stdout.trim();

const meta = {
  base_tree: baseTree,
  candidate_tree: "WORKING-TREE-k6b-verifier-evidence-assurance-graph",
  changed_lines: changed,
  plus,
  minus,
  paths_count: paths.length,
  evidence_fingerprint: evidence.fingerprint,
  diff_hash: `sha256:${sha256Hex(diff)}`,
  paths_digest: digest("review-paths-v1", [...paths].sort()),
};

const candidate = {
  projection: "workspace",
  base_tree: meta.base_tree,
  candidate_tree: meta.candidate_tree,
  paths: [...new Set(paths)].sort(),
  diff_hash: meta.diff_hash,
  paths_digest: meta.paths_digest,
  authored_lines: meta.changed_lines,
  original_changed_lines: meta.changed_lines,
};

let lineage = startReviewLineage({
  candidate,
  classification: "high-risk",
  selected_dimensions: derived.selected_specialists,
  evidence_fingerprint: evidence.fingerprint,
});

for (const dimension of derived.selected_specialists) {
  lineage = beginLens(lineage, {
    dimension,
    request_id: `start-${dimension}-k6b`,
    expected_revision: lineage.revision,
  });
}

const plannedLineage = planLineageGate({
  lineage,
  observed_candidate_id: lineage.current_candidate_id,
  downstream_gate: "status",
});

fs.writeFileSync(path.join(outDir, "evidence.json"), JSON.stringify(evidence, null, 2));
fs.writeFileSync(path.join(outDir, "meta.json"), JSON.stringify(meta, null, 2));
fs.writeFileSync(path.join(outDir, "paths.json"), JSON.stringify(candidate.paths, null, 2));
fs.writeFileSync(path.join(outDir, "generalist.json"), JSON.stringify(generalist, null, 2));
fs.writeFileSync(path.join(outDir, "derived.json"), JSON.stringify(derived, null, 2));
fs.writeFileSync(path.join(outDir, "lineage.json"), JSON.stringify(lineage, null, 2));
fs.writeFileSync(path.join(outDir, "planned-gate.json"), JSON.stringify(plannedGate, null, 2));
fs.writeFileSync(path.join(outDir, "planned-lineage.json"), JSON.stringify(plannedLineage, null, 2));

console.log(JSON.stringify({
  generalistValid: g.valid,
  derivedValid: v.valid,
  selected: derived.selected_specialists,
  depth: derived.depth,
  gateStatus: plannedGate.status,
  gateDispatch: plannedGate.dispatch,
  lineage_id: lineage.lineage_id,
  candidate_id: lineage.current_candidate_id,
  budget: lineage.correction_budget,
  next_action: plannedLineage.next_action,
  lineageDispatch: plannedLineage.dispatch,
  revision: lineage.revision,
}, null, 2));
