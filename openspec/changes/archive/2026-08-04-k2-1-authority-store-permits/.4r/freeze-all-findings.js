"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  recordLensResult,
  freezeFindings,
  nextLineageAction,
  migrateReviewLineage,
} = require("../../../../scripts/lib/review-lineage.js");
const { planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");

const outDir = __dirname;
const transcripts = {
  risk: "C:/Users/sn4ke/.cursor/projects/c-Users-sn4ke-dev-activos-ospec-workflow/agent-transcripts/ad9daae3-1db4-41ab-a3d5-80251878df3e/subagents/782fb466-6ed8-454e-bd77-a39454aa2da0.jsonl",
  reliability:
    "C:/Users/sn4ke/.cursor/projects/c-Users-sn4ke-dev-activos-ospec-workflow/agent-transcripts/ad9daae3-1db4-41ab-a3d5-80251878df3e/subagents/13d99fea-946e-4771-856a-61b17ffc8013.jsonl",
};

function extractFindings(transcriptPath) {
  const raw = fs.readFileSync(transcriptPath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const row = JSON.parse(lines[i]);
      const text = row?.message?.content?.map((c) => c.text || "").join("\n") || "";
      const marker = "```json:result-envelope";
      const a = text.indexOf(marker);
      if (a < 0) continue;
      const bodyStart = text.indexOf("\n", a) + 1;
      const b = text.indexOf("```", bodyStart);
      if (b < 0) continue;
      const envelope = JSON.parse(text.slice(bodyStart, b));
      const rawFindings =
        envelope.findings ||
        envelope.decision?.result?.findings ||
        envelope.result?.findings ||
        null;
      if (Array.isArray(rawFindings)) {
        return rawFindings.map((f) => ({
          severity: f.severity,
          summary: f.summary,
          acceptance_criteria: Array.isArray(f.acceptance_criteria)
            ? f.acceptance_criteria.join(" ")
            : String(f.acceptance_criteria || ""),
        }));
      }
    } catch {
      // continue
    }
  }
  throw new Error("no findings in " + transcriptPath);
}

const riskFindings = extractFindings(transcripts.risk);
const reliabilityFindings = extractFindings(transcripts.reliability);
fs.writeFileSync(path.join(outDir, "lens-risk.json"), JSON.stringify({ findings: riskFindings }, null, 2));
fs.writeFileSync(
  path.join(outDir, "lens-reliability.json"),
  JSON.stringify({ findings: reliabilityFindings }, null, 2),
);

let lineage = JSON.parse(fs.readFileSync(path.join(outDir, "lineage.json"), "utf8"));

lineage = recordLensResult(lineage, {
  dimension: "risk",
  request_id: "result-risk-k21",
  expected_revision: lineage.revision,
  result: { findings: riskFindings },
});
lineage = recordLensResult(lineage, {
  dimension: "reliability",
  request_id: "result-reliability-k21",
  expected_revision: lineage.revision,
  result: { findings: reliabilityFindings },
});

lineage = freezeFindings(lineage, {
  request_id: "freeze-findings-k21",
  expected_revision: lineage.revision,
});

// migrate before mutable remediation planning
lineage = migrateReviewLineage(lineage);
const planned = planLineageGate({ lineage });

fs.writeFileSync(path.join(outDir, "lineage.json"), JSON.stringify(lineage, null, 2));
fs.writeFileSync(path.join(outDir, "planned-after-freeze.json"), JSON.stringify(planned, null, 2));

const summary = {
  counts: { BLOCKER: 0, CRITICAL: 0, WARNING: 0, SUGGESTION: 0 },
  findings: lineage.findings.map((f) => ({
    id: f.id,
    owner: f.owner,
    severity: f.severity,
    summary: f.summary,
    blocking: f.blocking,
    resolution: f.resolution,
  })),
  next_action: planned.next_action,
  lineage_status: lineage.status,
  budget: lineage.correction_budget,
};
for (const f of lineage.findings) summary.counts[f.severity] = (summary.counts[f.severity] || 0) + 1;
fs.writeFileSync(path.join(outDir, "findings-summary.json"), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
