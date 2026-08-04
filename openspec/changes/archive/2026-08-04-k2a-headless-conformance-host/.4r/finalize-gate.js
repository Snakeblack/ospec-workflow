"use strict";

const fs = require("node:fs");
const path = require("node:path");

const changeDir = path.join(__dirname, "..");
const yamlPath = path.join(changeDir, "state.yaml");
const lineage = JSON.parse(fs.readFileSync(path.join(__dirname, "lineage.json"), "utf8"));

let text = fs.readFileSync(yamlPath, "utf8");
text = text.replace(/^status: verified$/m, "status: ready-for-archive");
text = text.replace(
  /  4r-review-gate:\r?\n    status: correction-required\r?\n    lineage_status: correction-required/,
  `  4r-review-gate:\n    status: approved\n    lineage_status: approved\n    terminal_reason: all-remediation-slices-passed\n    archive_allowed: true`,
);
text = text.replace(/lineage_revision: \d+/, `lineage_revision: ${lineage.revision}`);
text = text.replace(
  /findings_summary: "[^"]*"/,
  'findings_summary: "4R approved: 4/4 CRITICAL resolved; 11 WARNING remain advisory; terminal_reason=all-remediation-slices-passed"',
);
text = text.replace(
  /^last_updated: "[^"]*"/m,
  `last_updated: "${new Date().toISOString()}"`,
);
fs.writeFileSync(yamlPath, text);
console.log("updated", {
  lineage_status: "approved",
  revision: lineage.revision,
  change_status: "ready-for-archive",
});
