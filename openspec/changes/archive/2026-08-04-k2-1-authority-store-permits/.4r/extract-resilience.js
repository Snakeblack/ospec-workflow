"use strict";

const fs = require("node:fs");
const path = require("node:path");

const transcript =
  "C:/Users/sn4ke/.cursor/projects/c-Users-sn4ke-dev-activos-ospec-workflow/agent-transcripts/ad9daae3-1db4-41ab-a3d5-80251878df3e/subagents/e396662e-3fba-4cd8-8a73-eb6b6cc93205.jsonl";
const outDir = path.resolve(
  "openspec/changes/k2-1-authority-store-permits/.4r",
);
const raw = fs.readFileSync(transcript, "utf8");

function unescapeJsonString(s) {
  return JSON.parse('"' + s + '"');
}

// Prefer parsing the last assistant message JSONL row
const lines = raw.split(/\r?\n/).filter(Boolean);
let findings = null;
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
    if (Array.isArray(envelope.findings)) {
      findings = envelope.findings;
      break;
    }
  } catch {
    // keep scanning
  }
}

if (!findings) {
  // fallback: search escaped findings in raw
  const m = raw.match(/\\"findings\\":\s*(\[[\s\S]*?\])\s*\}\\n```/);
  if (!m) {
    console.error("could not extract findings");
    process.exit(1);
  }
  findings = JSON.parse(unescapeJsonString(m[1].replace(/\\n/g, "\\n")));
}

const normalized = findings.map((f) => ({
  severity: f.severity,
  summary: f.summary,
  acceptance_criteria: Array.isArray(f.acceptance_criteria)
    ? f.acceptance_criteria.join(" ")
    : f.acceptance_criteria,
}));

fs.writeFileSync(
  path.join(outDir, "lens-resilience.json"),
  JSON.stringify({ findings: normalized }, null, 2),
);
console.log(JSON.stringify({ count: normalized.length, severities: normalized.map((f) => f.severity) }, null, 2));
