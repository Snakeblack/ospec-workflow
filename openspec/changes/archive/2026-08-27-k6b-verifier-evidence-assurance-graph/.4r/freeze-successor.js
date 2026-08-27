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
  createSuccessor,
  beginLens,
  nextLineageAction,
} = require("../../../../scripts/lib/review-lineage.js");
const { planReviewGate, planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");

const outDir = __dirname;
const ROOT = path.resolve(__dirname, "../../../..");
const diff = fs.readFileSync(path.join(outDir, "working.diff"), "utf8").replace(/\r\n/g, "\n");
const predecessor = JSON.parse(fs.readFileSync(path.join(outDir, "lineage.generation-2.json"), "utf8"));

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
  candidate_tree: "WORKING-TREE-k6b-warning-g3",
  changed_lines: changed,
  plus,
  minus,
  paths_count: paths.length,
  evidence_fingerprint: evidence.fingerprint,
  diff_hash: `sha256:${sha256Hex(diff)}`,
  paths_digest: digest("review-paths-v1", [...paths].sort()),
};

const uniquePaths = [...new Set(paths)].sort();
const candidate = {
  projection: "workspace",
  base_tree: meta.base_tree,
  candidate_tree: meta.candidate_tree,
  paths: uniquePaths,
  diff_hash: meta.diff_hash,
  paths_digest: digest("review-paths-v1", uniquePaths),
  authored_lines: meta.changed_lines,
  original_changed_lines: meta.changed_lines,
};

const approvals = [
  {
    id: "k6b-bounded-review-002",
    gate: "review-workload",
    decision: "new-candidate",
    applies_to: ["sdd-apply", "sdd-verify", "sdd-tasks"],
  },
];

let lineage = createSuccessor(predecessor, {
  candidate,
  classification: "high-risk",
  selected_dimensions: derived.selected_specialists,
  evidence_fingerprint: evidence.fingerprint,
  reason: "generation-2 advisory reliability WARNING remediations change the candidate identity",
  authority_kind: "new-candidate",
  approval_reference: "k6b-bounded-review-002",
  approvals,
});

for (const dimension of derived.selected_specialists) {
  lineage = beginLens(lineage, {
    dimension,
    request_id: `start-${dimension}-k6b-g3`,
    expected_revision: lineage.revision,
  });
}

const plannedLineage = planLineageGate({
  lineage,
  observed_candidate_id: lineage.current_candidate_id,
  downstream_gate: "status",
});

fs.writeFileSync(path.join(outDir, "evidence.json"), JSON.stringify(evidence, null, 2));
fs.writeFileSync(path.join(outDir, "meta.generation-3.json"), JSON.stringify(meta, null, 2));
fs.writeFileSync(path.join(outDir, "generalist.generation-3.json"), JSON.stringify(generalist, null, 2));
fs.writeFileSync(path.join(outDir, "derived.generation-3.json"), JSON.stringify(derived, null, 2));
fs.writeFileSync(path.join(outDir, "lineage.json"), JSON.stringify(lineage, null, 2));
fs.writeFileSync(path.join(outDir, "planned-gate.generation-3.json"), JSON.stringify(plannedGate, null, 2));
fs.writeFileSync(path.join(outDir, "planned-lineage.generation-3.json"), JSON.stringify(plannedLineage, null, 2));

console.log(JSON.stringify({
  generalistValid: g.valid,
  derivedValid: v.valid,
  selected: derived.selected_specialists,
  depth: derived.depth,
  predecessor: predecessor.lineage_id,
  lineage_id: lineage.lineage_id,
  generation: lineage.generation,
  candidate_id: lineage.current_candidate_id,
  status: lineage.status,
  next_action: plannedLineage.next_action,
  dispatch: plannedLineage.dispatch,
  revision: lineage.revision,
}, null, 2));
