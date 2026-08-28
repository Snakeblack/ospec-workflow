"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execSync } = require("node:child_process");
const {
  normalizeReviewEvidence,
  validateGeneralistDecision,
  deriveReviewDimensions,
  validateReviewDecision,
} = require("../../../../scripts/lib/review-dimensions.js");
const { startReviewLineage, beginLens } = require("../../../../scripts/lib/review-lineage.js");
const { planReviewGate, planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");

const ROOT = path.resolve(__dirname, "../../../..");
const CHANGE = "k6b-durable-replay-receipt-authority";
const DIR = path.join(ROOT, "openspec/changes", CHANGE);
const DIFF_PATH = path.join(DIR, ".4r/diff.unified.patch");

const generalist = {
  status: "needs-specialist",
  specialists: ["risk", "reliability", "resilience", "readability"],
  reason: "signals=design-risk,diff-auth-permission,diff-error-flow,diff-structural-complexity,metadata-runtime,verify-reliability;dimensions=risk,reliability,resilience,readability",
};

const gv = validateGeneralistDecision(generalist);
if (!gv.valid) {
  console.error("generalist invalid", gv.errors);
  process.exit(1);
}

let diff = fs.readFileSync(DIFF_PATH, "utf8");
if (diff.charCodeAt(0) === 0xfeff) diff = diff.slice(1);
diff = diff.replace(/\r\n/g, "\n");

const paths = [...new Set(
  [...diff.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)].map((m) => m[2].replace(/\\/g, "/"))
)].sort();

const changedLines = diff.split("\n").filter((line) =>
  (line.startsWith("+") || line.startsWith("-")) && !line.startsWith("+++") && !line.startsWith("---")
).length;

const evidence = normalizeReviewEvidence({
  classification: "high-risk",
  verify: {
    status: "success",
    findings: [{ code: "verify-reliability", detail: "PASS WITH WARNINGS inherited token attestation inspection-proof" }],
  },
  diff,
  paths,
  capabilities: ["runtime", "assurance-graph", "independent-verification", "authority-store"],
  dependencies: [],
  operationTypes: ["add", "modify"],
  designRisks: [{ code: "design-risk", detail: "durable runner-receipt CAS plus ephemeral channel reissue" }],
});

const decision = deriveReviewDimensions(evidence, generalist);
const dv = validateReviewDecision(decision);
if (!dv.valid) {
  console.error("decision invalid", dv.errors);
  process.exit(1);
}

const planned = planReviewGate({
  routeGates: ["clarify", "4r-review-gate"],
  existingGate: {},
  decision,
  validationErrors: [],
});
if (planned.status === "blocked") {
  console.error("gate blocked", planned.gate);
  process.exit(1);
}

const baseTree = execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8" }).trim();
const diffHash = `sha256:${crypto.createHash("sha256").update(diff).digest("hex")}`;
const pathsDigest = `sha256:${crypto.createHash("sha256").update(paths.join("\n")).digest("hex")}`;

const candidate = {
  projection: "workspace",
  base_tree: baseTree,
  candidate_tree: diffHash,
  paths,
  diff_hash: diffHash,
  paths_digest: pathsDigest,
  authored_lines: changedLines,
  original_changed_lines: changedLines,
};

let lineage = startReviewLineage({
  classification: "high-risk",
  evidence_fingerprint: evidence.fingerprint,
  candidate,
  selected_dimensions: decision.selected_specialists,
});

const requestIds = {};
for (const dimension of decision.selected_specialists) {
  const request_id = `lens-${dimension}-001`;
  requestIds[dimension] = request_id;
  lineage = beginLens(lineage, {
    dimension,
    request_id,
    expected_revision: lineage.revision,
  });
}

fs.writeFileSync(path.join(DIR, ".4r/evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
fs.writeFileSync(path.join(DIR, ".4r/decision.json"), `${JSON.stringify(decision, null, 2)}\n`);
fs.writeFileSync(path.join(DIR, ".4r/lineage.json"), `${JSON.stringify(lineage, null, 2)}\n`);
fs.writeFileSync(path.join(DIR, ".4r/request-ids.json"), `${JSON.stringify(requestIds, null, 2)}\n`);

const lineagePlan = planLineageGate({ lineage, observed_candidate_id: lineage.current_candidate_id });
console.log(JSON.stringify({
  fingerprint: evidence.fingerprint,
  selected: decision.selected_specialists,
  depth: decision.depth,
  gate_status: planned.status,
  dispatch: planned.dispatch,
  lineage_id: lineage.lineage_id,
  revision: lineage.revision,
  next_action: lineagePlan.next_action,
  changed_lines: changedLines,
  path_count: paths.length,
}, null, 2));
