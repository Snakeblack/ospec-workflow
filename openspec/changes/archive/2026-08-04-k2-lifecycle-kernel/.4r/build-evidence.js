"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { normalizeReviewEvidence } = require("../../../../scripts/lib/review-dimensions.js");

const ROOT = path.resolve(__dirname, "../../../..");
const outDir = __dirname;

const paths = [
  "openspec/memory/known-issues.md",
  "scripts/lib/k1-scope-guard.test.js",
  "scripts/lib/lifecycle-kernel/bridges.js",
  "scripts/lib/lifecycle-kernel/bridges.test.js",
  "scripts/lib/lifecycle-kernel/events.js",
  "scripts/lib/lifecycle-kernel/events.test.js",
  "scripts/lib/lifecycle-kernel/index.js",
  "scripts/lib/lifecycle-kernel/index.test.js",
  "scripts/lib/lifecycle-kernel/journal.js",
  "scripts/lib/lifecycle-kernel/journal.test.js",
  "scripts/lib/lifecycle-kernel/k1-compat.js",
  "scripts/lib/lifecycle-kernel/k1-compat.test.js",
  "scripts/lib/lifecycle-kernel/operations.js",
  "scripts/lib/lifecycle-kernel/operations.test.js",
  "scripts/lib/lifecycle-kernel/recovery.js",
  "scripts/lib/lifecycle-kernel/recovery.test.js",
  "scripts/lib/lifecycle-kernel/reducer.js",
  "scripts/lib/lifecycle-kernel/reducer.test.js",
  "scripts/lib/lifecycle-kernel/scope-guard.js",
  "scripts/lib/lifecycle-kernel/scope-guard.test.js",
  "scripts/lib/lifecycle-kernel/state-digest.js",
  "scripts/lib/lifecycle-kernel/state-digest.test.js",
  "scripts/lib/lifecycle-kernel/transition-selector.js",
  "scripts/lib/lifecycle-kernel/transition-selector.test.js",
  "scripts/lib/lifecycle-model.js",
  "scripts/lib/lifecycle-model.test.js",
  "scripts/lib/minimal-kernel-harness.js",
  "scripts/lib/minimal-kernel-harness.test.js",
  "scripts/lib/transition-parity.js",
  "scripts/lib/transition-parity.k2.test.js",
];

function trackedDiff(rel) {
  const r = spawnSync("git", ["diff", "--no-color", "--", rel], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`git diff failed for ${rel}: ${r.stderr}`);
  return r.stdout;
}

function syntheticNewFileDiff(rel) {
  const abs = path.join(ROOT, rel);
  const content = fs.readFileSync(abs, "utf8");
  const lines = content.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const body = lines.map((l) => `+${l}`).join("\n");
  const count = lines.length;
  return [
    `diff --git a/${rel} b/${rel}`,
    "new file mode 100644",
    "index 0000000..1111111",
    "--- /dev/null",
    `+++ b/${rel}`,
    `@@ -0,0 +1,${count} @@`,
    body,
  ].join("\n") + "\n";
}

const sections = [];
for (const rel of paths) {
  const status = spawnSync("git", ["ls-files", "--error-unmatch", "--", rel], {
    cwd: ROOT,
    encoding: "utf8",
  });
  if (status.status === 0) {
    const d = trackedDiff(rel);
    if (!d.trim()) continue;
    sections.push(d.endsWith("\n") ? d : `${d}\n`);
  } else {
    sections.push(syntheticNewFileDiff(rel));
  }
}

const diff = sections.join("");
fs.writeFileSync(path.join(outDir, "candidate.diff"), diff);
fs.writeFileSync(path.join(outDir, "paths.json"), JSON.stringify(paths, null, 2));

const evidenceInput = {
  classification: "high-risk",
  verify: { status: "success", findings: [] },
  paths,
  capabilities: ["runtime", "routing", "strict-tdd", "agents", "skills"],
  dependencies: [
    "scripts/lib/canonical-json.js",
    "scripts/lib/review-lineage.js",
    "scripts/lib/archive-transaction.js",
    "scripts/lib/route-dispatcher.js",
  ],
  operationTypes: ["add", "modify"],
  designRisks: [
    {
      code: "design-risk",
      detail:
        "Lifecycle authority and deterministic transitions must remain fail-closed under interruption and recovery.",
    },
    {
      code: "design-risk",
      detail: "Events must stay non-authoritative; journal/state own truth.",
    },
    {
      code: "design-risk",
      detail:
        "K2 must not invent HostCapabilities/Candidate/budget/attestation/delivery enforcement.",
    },
  ],
  diff,
};

const normalized = normalizeReviewEvidence(evidenceInput);
fs.writeFileSync(path.join(outDir, "evidence.json"), JSON.stringify(normalized, null, 2));
fs.writeFileSync(
  path.join(outDir, "evidence-input.json"),
  JSON.stringify(
    {
      classification: evidenceInput.classification,
      verify: evidenceInput.verify,
      paths: evidenceInput.paths,
      capabilities: evidenceInput.capabilities,
      dependencies: evidenceInput.dependencies,
      operationTypes: evidenceInput.operationTypes,
      designRisks: evidenceInput.designRisks,
      diff_path: "openspec/changes/k2-lifecycle-kernel/.4r/candidate.diff",
    },
    null,
    2
  )
);

const added = (diff.match(/^\+[^+]/gm) || []).length;
const removed = (diff.match(/^-[^-]/gm) || []).length;
console.log(
  JSON.stringify(
    {
      paths: paths.length,
      diffBytes: Buffer.byteLength(diff),
      addedLines: added,
      removedLines: removed,
      changedLines: added + removed,
      fingerprint: normalized.fingerprint,
      facts: normalized.sources.facts.map((f) => f.code),
    },
    null,
    2
  )
);
