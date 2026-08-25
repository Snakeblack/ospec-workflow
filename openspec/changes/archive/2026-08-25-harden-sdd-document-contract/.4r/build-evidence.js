"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { normalizeReviewEvidence } = require("../../../../scripts/lib/review-dimensions.js");

const ROOT = path.resolve(__dirname, "../../../..");
const outDir = __dirname;

function run(cmd, args) {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout || "";
}

const trackedPaths = [
  "scripts/sdd-document.test.js",
  "scripts/starlight-web-doc-contract.test.js",
  "skills/_shared/route-document.md",
  "skills/sdd-document/SKILL.md",
  "skills/sdd-document/references/option-d-starlight.md",
];

const untrackedPaths = [
  "openspec/changes/harden-sdd-document-contract/apply-progress.md",
  "openspec/changes/harden-sdd-document-contract/decisions/adr-001.md",
  "openspec/changes/harden-sdd-document-contract/decisions/adr-002.md",
  "openspec/changes/harden-sdd-document-contract/design.md",
  "openspec/changes/harden-sdd-document-contract/proposal.md",
  "openspec/changes/harden-sdd-document-contract/specs/agents/spec.md",
  "openspec/changes/harden-sdd-document-contract/specs/sdd-document/spec.md",
  "openspec/changes/harden-sdd-document-contract/tasks.md",
  "openspec/changes/harden-sdd-document-contract/verify-report.md",
];

function synthNewFile(filePath) {
  const body = fs.readFileSync(path.join(ROOT, filePath), "utf8");
  const contentLines = body.endsWith("\n") ? body.slice(0, -1).split("\n") : body.split("\n");
  const n = contentLines.length;
  let out = `diff --git a/${filePath} b/${filePath}\n`;
  out += "new file mode 100644\n";
  out += "--- /dev/null\n";
  out += `+++ b/${filePath}\n`;
  out += `@@ -0,0 +1,${n} @@\n`;
  for (const line of contentLines) out += `+${line}\n`;
  return out;
}

let unified = "";
for (const rel of trackedPaths) {
  const d = run("git", ["diff", "--no-color", "--", rel]);
  if (!d.trim()) continue;
  unified += d.endsWith("\n") ? d : `${d}\n`;
}
for (const rel of untrackedPaths) unified += synthNewFile(rel);

fs.writeFileSync(path.join(outDir, "diff.unified.patch"), unified);

const paths = [...new Set([...unified.matchAll(/^diff --git a\/(\S+)/gm)].map((m) => m[1]))].sort();
const plus = (unified.match(/^\+[^+]/gm) || []).length;
const minus = (unified.match(/^-[^-]/gm) || []).length;

const input = {
  classification: "normal",
  verify: { status: "success", findings: [] },
  paths,
  capabilities: ["skills", "agents", "testing", "docs"],
  dependencies: [],
  operationTypes: ["add", "modify"],
  designRisks: [
    {
      code: "design-risk",
      detail: "L2 Mermaid heuristic may accept invalid blocks; deep render delegated to J6.",
    },
    {
      code: "design-risk",
      detail: "J6 behavioral golden eval deferred (sdd-design-003); no live orchestrator QA proof in this change.",
    },
  ],
  diff: unified,
};

const normalized = normalizeReviewEvidence(input);
fs.writeFileSync(path.join(outDir, "evidence.json"), JSON.stringify(normalized, null, 2));
fs.writeFileSync(path.join(outDir, "paths.json"), JSON.stringify(paths, null, 2));
fs.writeFileSync(
  path.join(outDir, "evidence-input.json"),
  JSON.stringify(
    {
      classification: input.classification,
      verify: input.verify,
      paths: input.paths,
      capabilities: input.capabilities,
      dependencies: input.dependencies,
      operationTypes: input.operationTypes,
      designRisks: input.designRisks,
      diff_path: "openspec/changes/harden-sdd-document-contract/.4r/diff.unified.patch",
    },
    null,
    2
  )
);

const head = run("git", ["rev-parse", "HEAD"]).trim();
const base = run("git", ["rev-parse", "HEAD"]).trim();
const meta = {
  plus,
  minus,
  changed: plus + minus,
  path_count: paths.length,
  head,
  base_tree: base,
  candidate_tree: `WORKING-TREE-harden-sdd-document-contract`,
  branch: run("git", ["branch", "--show-current"]).trim(),
  diff_hash: `sha256:${crypto.createHash("sha256").update(unified).digest("hex")}`,
  paths_digest: `sha256:${crypto.createHash("sha256").update(JSON.stringify(paths)).digest("hex")}`,
  evidence_fingerprint: normalized.fingerprint,
};
fs.writeFileSync(path.join(outDir, "meta.json"), JSON.stringify(meta, null, 2));

console.log(
  JSON.stringify(
    {
      fingerprint: normalized.fingerprint,
      facts: normalized.sources.facts.map((f) => f.code),
      plus,
      minus,
      changed: plus + minus,
      paths: paths.length,
    },
    null,
    2
  )
);
