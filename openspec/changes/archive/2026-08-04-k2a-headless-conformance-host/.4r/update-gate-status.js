"use strict";

const fs = require("node:fs");
const path = require("node:path");

const changeDir = path.join(__dirname, "..");
const yamlPath = path.join(changeDir, "state.yaml");
const summary = JSON.parse(fs.readFileSync(path.join(__dirname, "findings-summary.json"), "utf8"));
const lineage = JSON.parse(fs.readFileSync(path.join(__dirname, "lineage.json"), "utf8"));

let text = fs.readFileSync(yamlPath, "utf8");
text = text.replace(
  /status: reviewing\r?\n    lineage_status: reviewing\r?\n    lineage_id: "[^"]+"\r?\n    lineage_revision: \d+/,
  `status: correction-required\n    lineage_status: correction-required\n    lineage_id: "${lineage.lineage_id}"\n    lineage_revision: ${lineage.revision}`,
);

if (!/findings_summary:/.test(text)) {
  text = text.replace(
    /(evidence_fingerprint: "[^"]+")/,
    `$1\n    findings_summary: "${summary.findings_summary}"\n    blocking_count: 4\n    advisory_count: 11\n    next_action: correct`,
  );
}

fs.writeFileSync(yamlPath, text);
console.log(JSON.stringify({ status: lineage.status, revision: lineage.revision, summary: summary.findings_summary }, null, 2));
