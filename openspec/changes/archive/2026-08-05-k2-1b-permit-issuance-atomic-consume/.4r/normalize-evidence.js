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
    "scripts/lib/authority-store/index.js",
  ],
  designRisks: [
    {
      code: "design-risk",
      detail:
        "Public runKernelOperation must default mintPermit=false; auto-mint rejected (CRITICAL 1).",
    },
    {
      code: "design-risk",
      detail:
        "Permit consumed + OperationReceipt must co-commit in same CAS revision as state/journal (CRITICAL 2).",
    },
    {
      code: "design-risk",
      detail:
        "Revision fingerprint remains state_digest+journal_digest; authority bag co-committed outside hash (sdd-design-002 confirmed).",
    },
    {
      code: "design-risk",
      detail:
        "Models must not mint or self-grant OperationPermit; issuer is controlled TransitionOffer+decision/rule+revision.",
    },
    {
      code: "design-risk",
      detail:
        "K2.1b must not invent K2a capability probes, K3 Candidate freeze, or multi-process durable ledger.",
    },
  ],
};

const evidence = normalizeReviewEvidence(input);
fs.writeFileSync(path.join(outDir, "evidence.json"), JSON.stringify(evidence, null, 2));
fs.writeFileSync(path.join(outDir, "paths.json"), JSON.stringify(paths, null, 2));
const base = require("node:child_process")
  .execSync("git merge-base main HEAD", { encoding: "utf8" })
  .trim();
fs.writeFileSync(
  path.join(outDir, "meta.json"),
  JSON.stringify(
    {
      base_tree: base,
      candidate_tree: "WORKING-TREE-k2-1b-permit-issuance-atomic-consume",
      changed_lines: changed,
      plus,
      minus,
      paths_count: paths.length,
      evidence_fingerprint: evidence.fingerprint,
      diff_hash: "sha256:" + crypto.createHash("sha256").update(diff).digest("hex"),
      paths_digest:
        "sha256:" + crypto.createHash("sha256").update(JSON.stringify(paths)).digest("hex"),
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
