"use strict";

const fs = require("node:fs");
const path = require("node:path");

const changeDir = path.join(__dirname, "..");
const yamlPath = path.join(changeDir, "state.yaml");
const lineage = JSON.parse(fs.readFileSync(path.join(__dirname, "lineage.json"), "utf8"));
const derived = JSON.parse(fs.readFileSync(path.join(__dirname, "derived.json"), "utf8"));

let text = fs.readFileSync(yamlPath, "utf8");
if (/^gates:/m.test(text)) {
  console.log("gates already present");
  process.exit(0);
}

const dims = derived.selected_specialists.join(", ");
const gateBlock = `
gates:
  clarify:
    status: skipped
    skip_reason: residual_ambiguity false; ambiguity arrays empty
  4r-review-gate:
    status: reviewing
    lineage_status: reviewing
    lineage_id: "${lineage.lineage_id}"
    lineage_revision: ${lineage.revision}
    candidate_id: "${lineage.genesis.candidate_id}"
    selected_dimensions: [${dims}]
    depth: strict
    correction_budget_limit: ${lineage.correction_budget.limit_lines}
    lineage_artifact: openspec/changes/k2a-headless-conformance-host/.4r/lineage.json
    evidence_fingerprint: "${lineage.genesis.evidence_fingerprint}"
`;

text = text.replace(/\nbaseline_fingerprints:/, `${gateBlock}\nbaseline_fingerprints:`);
fs.writeFileSync(yamlPath, text);
console.log("gates inserted");
