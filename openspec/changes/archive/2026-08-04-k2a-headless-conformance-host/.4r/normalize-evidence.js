"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { normalizeReviewEvidence } = require("../../../../scripts/lib/review-dimensions.js");

const outDir = __dirname;
const baseWt = fs
  .readFileSync(path.join(outDir, "diff.base-wt.patch"), "utf8")
  .replace(/\r\n/g, "\n");
const untr = fs
  .readFileSync(path.join(outDir, "diff.untracked.patch"), "utf8")
  .replace(/\r\n/g, "\n");

// Join patches; drop bare empty lines (invalid hunk content for the parser).
const combined = `${baseWt.replace(/\n+$/, "")}\n${untr.replace(/^\n+/, "")}`
  .split("\n")
  .filter((line) => line !== "")
  .join("\n");
const diff = `${combined}\n`;
fs.writeFileSync(path.join(outDir, "diff.unified.patch"), diff);

const paths = [...new Set([...diff.matchAll(/^diff --git a\/(\S+)/gm)].map((m) => m[1]))].sort();
const plus = (diff.match(/^\+[^+]/gm) || []).length;
const minus = (diff.match(/^-[^-]/gm) || []).length;
const changed = plus + minus;

const input = {
  classification: "high-risk",
  verify: {
    status: "success",
    findings: [
      {
        code: "verify-reliability",
        detail:
          "WARNING tasks-gap: harness-alone host-fault negative path lacks explicit runtime test (REQ-minimal-kernel-harness-009)",
      },
    ],
  },
  diff,
  paths,
  capabilities: ["runtime", "agents", "routing", "skills", "strict-tdd", "host-contract"],
  operationTypes: ["add", "modify"],
  dependencies: [
    "scripts/lib/lifecycle-kernel/scope-guard.js",
    "scripts/lib/authority-canon.js",
    "scripts/lib/minimal-kernel-harness.js",
    "scripts/lib/lifecycle-model.js",
    "schemas/kernel/manifest.json",
  ],
  designRisks: [
    {
      code: "design-risk",
      detail:
        "Host adapters must not mint permits or own CAS; OpenSpec+Git remain semantic authority.",
    },
    {
      code: "design-risk",
      detail:
        "CapabilityProof required before enforced; no silent unavailable/instructional promotion.",
    },
    {
      code: "design-risk",
      detail:
        "Headless Conformance Host is peer to Minimal Kernel Harness, not a replacement.",
    },
    {
      code: "design-risk",
      detail: "Sole real adapter is claude; other targets must remain inactive until K11a.",
    },
    {
      code: "design-risk",
      detail: "Lifecycle/Graph/receipt modules must not import concrete host APIs.",
    },
  ],
};

const evidence = normalizeReviewEvidence(input);
fs.writeFileSync(path.join(outDir, "evidence.json"), JSON.stringify(evidence, null, 2));
fs.writeFileSync(path.join(outDir, "paths.json"), JSON.stringify(paths, null, 2));
const meta = {
  base_tree: "9b03b2fb84e0420f100ed047e1fb4083efc238ca",
  candidate_tree: "WORKING-TREE-k2a-headless-conformance-host",
  changed_lines: changed,
  plus,
  minus,
  paths_count: paths.length,
  evidence_fingerprint: evidence.fingerprint,
  diff_hash: "sha256:" + crypto.createHash("sha256").update(diff).digest("hex"),
  paths_digest:
    "sha256:" + crypto.createHash("sha256").update(JSON.stringify(paths)).digest("hex"),
};
fs.writeFileSync(path.join(outDir, "meta.json"), JSON.stringify(meta, null, 2));
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
