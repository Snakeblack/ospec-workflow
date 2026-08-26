"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { recordLensResult, freezeFindings } = require("../../../../scripts/lib/review-lineage.js");
const { planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");

const dir = __dirname;
let lineage = JSON.parse(fs.readFileSync(path.join(dir, "lineage.json"), "utf8"));
const { requestIds } = JSON.parse(fs.readFileSync(path.join(dir, "request-ids.json"), "utf8"));

const results = {
  reliability: { findings: [] },
  resilience: { findings: [] },
};

for (const dimension of ["reliability", "resilience"]) {
  fs.writeFileSync(path.join(dir, `lens-${dimension}.json`), `${JSON.stringify(results[dimension], null, 2)}\n`);
  lineage = recordLensResult(lineage, {
    dimension,
    request_id: requestIds[dimension],
    expected_revision: lineage.revision,
    result: results[dimension],
  });
}

lineage = freezeFindings(lineage, {
  request_id: `freeze-${crypto.randomBytes(8).toString("hex")}`,
  expected_revision: lineage.revision,
});

const summaryCounts = { BLOCKER: 0, CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
for (const finding of lineage.findings) summaryCounts[finding.severity] += 1;
const findings_summary = `${summaryCounts.BLOCKER} BLOCKER, ${summaryCounts.CRITICAL} CRITICAL, ${summaryCounts.WARNING} WARNING, ${summaryCounts.SUGGESTION} SUGGESTION`;

const lineagePlan = planLineageGate({
  lineage,
  observed_candidate_id: lineage.current_candidate_id,
  downstream_gate: "archive",
});

fs.writeFileSync(path.join(dir, "lineage.json"), `${JSON.stringify(lineage, null, 2)}\n`);
fs.writeFileSync(
  path.join(dir, "findings-summary.json"),
  `${JSON.stringify({ findings_summary, findings: lineage.findings, status: lineage.status, terminal_reason: lineage.terminal_reason, next_action: lineagePlan.next_action, archive_allowed: lineagePlan.archive_allowed }, null, 2)}\n`
);

const gatePath = path.join(dir, "gate.json");
const gate = JSON.parse(fs.readFileSync(gatePath, "utf8"));
gate.status = lineage.status === "approved" ? "approved" : gate.status;
gate.lineage = lineage;
gate.findings_summary = findings_summary;
fs.writeFileSync(gatePath, `${JSON.stringify(gate, null, 2)}\n`);

const statePath = path.join(dir, "..", "state.yaml");
let yaml = fs.readFileSync(statePath, "utf8");
if (!/^gates:/m.test(yaml)) throw new Error("state.yaml missing gates block");
yaml = yaml.replace(/^  4r-review-gate: .*$/m, `  4r-review-gate: ${JSON.stringify(gate)}`);
fs.writeFileSync(statePath, yaml);

console.log(JSON.stringify({
  status: lineage.status,
  terminal_reason: lineage.terminal_reason,
  findings_summary,
  archive_allowed: lineagePlan.archive_allowed,
  next_action: lineagePlan.next_action,
  revision: lineage.revision,
}, null, 2));
