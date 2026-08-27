"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const {
  deriveReviewDimensions,
  validateReviewDecision,
  validateGeneralistDecision,
} = require("../../../../scripts/lib/review-dimensions.js");
const { planReviewGate, planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");
const { createSuccessor, beginLens } = require("../../../../scripts/lib/review-lineage.js");

const DIR = __dirname;
const ROOT = path.resolve(__dirname, "../../../..");
const packed = JSON.parse(fs.readFileSync(path.join(DIR, "evidence.json"), "utf8"));
const evidence = packed.evidence;
const predecessor = JSON.parse(fs.readFileSync(path.join(DIR, "predecessor-lineage.json"), "utf8"));
const generalist = JSON.parse(fs.readFileSync(path.join(DIR, "generalist.json"), "utf8"));

const gv = validateGeneralistDecision(generalist);
if (!gv.valid) {
  console.error(gv);
  process.exit(1);
}

const decision = deriveReviewDimensions(evidence, generalist);
const dv = validateReviewDecision(decision);
if (!dv.valid) {
  console.error(dv);
  process.exit(1);
}

fs.writeFileSync(path.join(DIR, "derived.json"), JSON.stringify(decision, null, 2));

const planned = planReviewGate({
  routeGates: ["clarify", "4r-review-gate"],
  existingGate: {},
  decision,
  validationErrors: [],
});
fs.writeFileSync(path.join(DIR, "planned-gate.json"), JSON.stringify(planned, null, 2));

function sha256Bytes(buf) {
  return `sha256:${crypto.createHash("sha256").update(buf).digest("hex")}`;
}

const diff = fs.readFileSync(path.join(DIR, "unified.diff"));
const paths = packed.paths.slice().sort();
const fileDigests = {};
for (const rel of paths) {
  fileDigests[rel] = sha256Bytes(fs.readFileSync(path.join(ROOT, rel)));
}
const candidateTree = sha256Bytes(Buffer.from(JSON.stringify(fileDigests)));
const pathsDigest = sha256Bytes(Buffer.from(paths.join("\n")));
const baseTree = execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: ROOT, encoding: "utf8" }).trim();

const candidate = {
  projection: "workspace",
  base_tree: baseTree,
  candidate_tree: candidateTree,
  paths,
  diff_hash: sha256Bytes(diff),
  paths_digest: pathsDigest,
  authored_lines: packed.changed_lines.added,
  original_changed_lines: packed.changed_lines.total,
};

const approvals = [
  {
    id: "k6b-verification-integrity-remediation-bounded-review-001",
    applies_to: ["sdd-design", "sdd-tasks", "sdd-apply", "sdd-verify"],
  },
];

let lineage = createSuccessor(predecessor, {
  classification: "high-risk",
  evidence_fingerprint: evidence.fingerprint,
  selected_dimensions: decision.selected_specialists,
  candidate,
  authority_kind: "new-candidate",
  reason: "new-candidate after harness collector migration and remaining advisory closures",
  approval_reference: "k6b-verification-integrity-remediation-bounded-review-001",
  approvals,
});

const dimensions = decision.selected_specialists;
for (const dimension of dimensions) {
  lineage = beginLens(lineage, {
    dimension,
    request_id: `lens-${dimension}-001`,
    expected_revision: lineage.revision,
  });
}

fs.writeFileSync(path.join(DIR, "lineage.json"), JSON.stringify(lineage, null, 2));
const lineagePlan = planLineageGate({
  lineage,
  observed_candidate_id: lineage.current_candidate_id,
  downstream_gate: "status",
});
fs.writeFileSync(path.join(DIR, "planned-lineage.json"), JSON.stringify(lineagePlan, null, 2));

console.log(
  JSON.stringify(
    {
      predecessor_id: predecessor.lineage_id,
      predecessor_status: predecessor.status,
      generation: lineage.generation,
      lineage_id: lineage.lineage_id,
      candidate_id: lineage.current_candidate_id,
      revision: lineage.revision,
      selected: decision.selected_specialists,
      budget: lineage.correction_budget,
      next_action: lineagePlan.next_action || lineagePlan,
    },
    null,
    2
  )
);
