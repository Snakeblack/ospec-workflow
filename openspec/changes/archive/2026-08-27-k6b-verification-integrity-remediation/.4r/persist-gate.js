"use strict";

const fs = require("fs");
const path = require("path");

const dir = __dirname;
const yamlPath = path.resolve(__dirname, "../state.yaml");
const planned = JSON.parse(fs.readFileSync(path.join(dir, "planned-gate.json"), "utf8"));
const lineage = JSON.parse(fs.readFileSync(path.join(dir, "lineage.json"), "utf8"));
const generalist = {
  status: "needs-specialist",
  specialists: ["risk", "reliability"],
  reason: "signals=design-risk,diff-auth-permission,metadata-runtime;dimensions=risk,reliability",
};
fs.writeFileSync(path.join(dir, "generalist.json"), JSON.stringify(generalist, null, 2));

let text = fs.readFileSync(yamlPath, "utf8");
text = text.replace(/last_updated: ".*"/, 'last_updated: "2026-08-27T15:30:00Z"');
if (!/\ngates:/.test(text)) {
  text += [
    "",
    "gates:",
    "  4r-review-gate:",
    "    status: ready",
    "    schema_version: 1",
    "    classification: high-risk",
    "    depth:",
    "      review: strict",
    "    lineage_status: reviewing",
    `    lineage_id: "${lineage.lineage_id}"`,
    `    lineage_revision: ${lineage.revision}`,
    "    lineage_artifact: openspec/changes/k6b-verification-integrity-remediation/.4r/lineage.json",
    "    archive_allowed: false",
    "    selected_specialists: [risk, reliability, resilience, readability]",
    "    evidence:",
    "      schema_version: 1",
    `      fingerprint: "${planned.gate.evidence.fingerprint}"`,
    "    generalist:",
    "      status: needs-specialist",
    "      specialists: [risk, reliability]",
    `      reason: "${generalist.reason}"`,
    "",
  ].join("\n");
  fs.writeFileSync(yamlPath, text);
  console.log("appended 4r-review-gate");
} else {
  console.log("gates already present");
}
