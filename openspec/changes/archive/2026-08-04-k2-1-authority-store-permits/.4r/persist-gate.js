"use strict";

const fs = require("node:fs");

const statePath = "openspec/changes/k2-1-authority-store-permits/state.yaml";
const summary = JSON.parse(
  fs.readFileSync(
    "openspec/changes/k2-1-authority-store-permits/.4r/findings-summary.json",
    "utf8",
  ),
);
const lineage = JSON.parse(
  fs.readFileSync(
    "openspec/changes/k2-1-authority-store-permits/.4r/lineage.json",
    "utf8",
  ),
);
const derived = JSON.parse(
  fs.readFileSync(
    "openspec/changes/k2-1-authority-store-permits/.4r/derived.json",
    "utf8",
  ),
);
const generalist = JSON.parse(
  fs.readFileSync(
    "openspec/changes/k2-1-authority-store-permits/.4r/generalist.json",
    "utf8",
  ),
);
const evidence = JSON.parse(
  fs.readFileSync(
    "openspec/changes/k2-1-authority-store-permits/.4r/evidence.json",
    "utf8",
  ),
);

const blockingUnresolved = summary.findings.filter(
  (f) => f.blocking && f.resolution === "unresolved",
).length;

const gate = {
  status: "correction-required",
  schema_version: 1,
  classification: "high-risk",
  evidence,
  generalist,
  depth: derived.depth,
  dimensions: derived.dimensions,
  lineage,
  findings_summary:
    summary.counts.BLOCKER +
    " BLOCKER, " +
    summary.counts.CRITICAL +
    " CRITICAL, " +
    summary.counts.WARNING +
    " WARNING, " +
    summary.counts.SUGGESTION +
    " SUGGESTION (blocking unresolved: " +
    blockingUnresolved +
    ")",
  next_action: summary.next_action,
  surfaced_to_user: true,
  on_blocker: "advisory",
};

let yaml = fs.readFileSync(statePath, "utf8");
yaml = yaml.replace(
  /  4r-review-gate:\n    status: pending/,
  "  4r-review-gate: " + JSON.stringify(gate),
);
yaml = yaml.replace(/^status: .*/m, "status: correction-required");
yaml = yaml.replace(
  /^last_updated: .*/m,
  'last_updated: "' + new Date().toISOString() + '"',
);
fs.writeFileSync(statePath, yaml);
console.log(gate.findings_summary);
console.log(summary.next_action.type, summary.next_action.slice_id);
