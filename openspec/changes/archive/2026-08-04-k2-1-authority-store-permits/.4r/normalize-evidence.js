"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { normalizeReviewEvidence } = require("../../../../scripts/lib/review-dimensions.js");

const outDir = __dirname;
const diff = fs.readFileSync(path.join(outDir, "diff.unified.patch"), "utf8");
const paths = [...new Set([...diff.matchAll(/^diff --git a\/(\S+)/gm)].map((m) => m[1]))].sort();
const plus = (diff.match(/^\+[^+]/gm) || []).length;
const minus = (diff.match(/^-[^-]/gm) || []).length;
const changed = plus + minus;

const input = {
  classification: "high-risk",
  verify: { status: "success", findings: [] },
  diff,
  paths,
  capabilities: ["runtime", "agents", "routing", "skills", "strict-tdd"],
  operationTypes: ["add", "modify"],
  dependencies: [
    "scripts/lib/canonical-json.js",
    "scripts/lib/lifecycle-kernel/journal.js",
    "scripts/lib/lifecycle-kernel/state-digest.js",
  ],
  designRisks: [
    {
      code: "design-risk",
      detail:
        "CAS mid-op commitJournal when state_digest matches load baseline (sdd-apply-001 confirmed).",
    },
    {
      code: "design-risk",
      detail:
        "Models must not mint or self-grant OperationPermit; runtime-owned ledger only.",
    },
    {
      code: "design-risk",
      detail:
        "Irreversible ambiguous effects must decide|stop; no blind retry / false exactly-once.",
    },
    {
      code: "design-risk",
      detail: "OperationReceipt must not reuse receipt/v1 as canonical kind.",
    },
    {
      code: "design-risk",
      detail:
        "K2.1 must not invent K2a HostCapabilities, K3 Candidate, K4a Graph, or K8/K10 delivery.",
    },
  ],
};

const evidence = normalizeReviewEvidence(input);
fs.writeFileSync(path.join(outDir, "evidence.json"), JSON.stringify(evidence, null, 2));
fs.writeFileSync(path.join(outDir, "paths.json"), JSON.stringify(paths, null, 2));
fs.writeFileSync(
  path.join(outDir, "meta.json"),
  JSON.stringify(
    {
      base_tree: "a27a7ddbcf4db711028a84cd493ef86f9218199c",
      candidate_tree: "WORKING-TREE-k2-1-authority-store-permits",
      changed_lines: changed,
      plus,
      minus,
      paths_count: paths.length,
      evidence_fingerprint: evidence.fingerprint,
      diff_hash:
        "sha256:" + crypto.createHash("sha256").update(diff).digest("hex"),
      paths_digest:
        "sha256:" +
        crypto.createHash("sha256").update(JSON.stringify(paths)).digest("hex"),
    },
    null,
    2,
  ),
);

console.log(
  JSON.stringify(
    {
      paths: paths.length,
      changed,
      fingerprint: evidence.fingerprint,
      facts: evidence.sources.facts.map((f) => f.code),
    },
    null,
    2,
  ),
);
