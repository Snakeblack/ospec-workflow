"use strict";

const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const root = path.resolve(__dirname, "../../..");
const {
  normalizeReviewEvidence,
  validateGeneralistDecision,
  deriveReviewDimensions,
  validateReviewDecision,
} = require(path.join(root, "scripts/lib/review-dimensions.js"));
const {
  startReviewLineage,
  migrateReviewLineage,
  nextLineageAction,
} = require(path.join(root, "scripts/lib/review-lineage.js"));

process.chdir(root);

const diff = fs.readFileSync(
  "openspec/changes/cursor-native-target/.review-diff.patch",
  "utf8",
);
const paths = [
  ...new Set([...diff.matchAll(/^diff --git a\/(\S+)/gm)].map((m) => m[1])),
].sort();
const plus = (diff.match(/^\+[^+]/gm) || []).length;
const minus = (diff.match(/^-[^-]/gm) || []).length;
const changed = plus + minus;

function sha(s) {
  return "sha256:" + crypto.createHash("sha256").update(s).digest("hex");
}

const input = {
  classification: "high-risk",
  verify: {
    status: "success",
    findings: [
      { code: "verify-risk", detail: "W2 install main non-dry-run untested" },
      { code: "verify-reliability", detail: "W1 missing cursor regression guard" },
      { code: "verify-resilience", detail: "W2 installer error paths unexercised" },
      { code: "verify-readability", detail: "W5 docs table misaligned" },
    ],
  },
  diff,
  paths,
  capabilities: ["generator", "install", "agents", "hooks-runtime"],
  operationTypes: ["add", "modify", "delete"],
  dependencies: ["models.yaml"],
  designRisks: [{ code: "design-risk", detail: "global-home-install" }],
};

const evidence = normalizeReviewEvidence(input);
const generalist = {
  status: "needs-specialist",
  specialists: ["risk", "reliability", "resilience"],
  reason:
    "signals=design-risk,diff-error-flow,diff-global-config-write,metadata-runtime,verify-reliability,verify-resilience,verify-risk;dimensions=risk,reliability,resilience",
};

const g = validateGeneralistDecision(generalist);
if (!g.valid) throw new Error("generalist invalid: " + g.errors.join(", "));

const derived = deriveReviewDimensions(evidence, generalist);
const v = validateReviewDecision(derived);
if (!v.valid) throw new Error("derived invalid: " + (v.errors || []).join(", "));

const candidate = {
  projection: "workspace",
  base_tree: "main",
  candidate_tree: "feat/cursor-native-target",
  paths: evidence.sources.paths,
  diff_hash: sha(diff),
  paths_digest: sha(JSON.stringify(evidence.sources.paths)),
  authored_lines: changed,
  original_changed_lines: changed,
};

let lineage = startReviewLineage({
  candidate,
  classification: "high-risk",
  selected_dimensions: derived.selected_specialists,
  evidence_fingerprint: evidence.fingerprint,
});
lineage = migrateReviewLineage(lineage);

const payload = {
  evidence,
  generalist,
  derived,
  lineage,
  changed_lines: changed,
  summary: {
    changed_lines: changed,
    path_count: paths.length,
    selected: derived.selected_specialists,
    depth: derived.depth,
    escalation_reason: derived.escalation_reason,
    lineage_id: lineage.lineage_id,
    candidate_id: lineage.genesis.candidate_id,
    budget: lineage.correction_budget,
    next_action: nextLineageAction(lineage),
  },
};

fs.writeFileSync(
  "openspec/changes/cursor-native-target/.review-gate-bootstrap.json",
  JSON.stringify(payload, null, 2),
);
process.stdout.write(JSON.stringify(payload.summary, null, 2) + "\n");
