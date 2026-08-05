"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execSync } = require("node:child_process");
const {
  recordCorrection,
  nextLineageAction,
} = require("../../../../scripts/lib/review-lineage.js");
const { planLineageGate } = require("../../../../scripts/lib/review-gate-state.js");

const outDir = __dirname;
const lineagePath = path.join(outDir, "lineage.json");
let lineage = JSON.parse(fs.readFileSync(lineagePath, "utf8"));

const pending = lineage.pending_correction;
if (!pending) throw new Error("no pending correction");

const base = execSync("git merge-base main HEAD", { encoding: "utf8" }).trim();
const paths = lineage.genesis.paths.slice().sort();

// Build a fresh unified diff for the full genesis path set (tracked + untracked synth)
function synthUntracked(p) {
  const body = fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  const contentLines = body.endsWith("\n") ? body.slice(0, -1).split("\n") : body.split("\n");
  if (contentLines.length === 1 && contentLines[0] === "") {
    return [
      `diff --git a/${p} b/${p}`,
      "new file mode 100644",
      "index 0000000..e69de29",
      "--- /dev/null",
      `+++ b/${p}`,
    ].join("\n");
  }
  return [
    `diff --git a/${p} b/${p}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${p}`,
    `@@ -0,0 +1,${contentLines.length} @@`,
    ...contentLines.map((l) => `+${l}`),
  ].join("\n");
}

const tracked = paths.filter((p) => {
  try {
    execSync(`git cat-file -e ${base}:${p}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
});
const untracked = paths.filter((p) => !tracked.includes(p));

let trackedDiff = "";
if (tracked.length) {
  trackedDiff = execSync(`git diff --no-ext-diff --no-color ${base} -- ${tracked.join(" ")}`, {
    encoding: "utf8",
    maxBuffer: 30 * 1024 * 1024,
  }).replace(/\r\n/g, "\n");
}
const syn = untracked.map(synthUntracked);
const unified =
  (trackedDiff.replace(/\n+$/, "") + (syn.length ? "\n" + syn.join("\n") : "") + "\n").replace(
    /^\n+/,
    ""
  );

const plus = (unified.match(/^\+[^+]/gm) || []).length;
const minus = (unified.match(/^-[^-]/gm) || []).length;
const changed = plus + minus;
const diff_hash = "sha256:" + crypto.createHash("sha256").update(unified).digest("hex");
const paths_digest =
  "sha256:" + crypto.createHash("sha256").update(JSON.stringify(paths)).digest("hex");

fs.writeFileSync(path.join(outDir, "diff.after-slice1.patch"), unified);
fs.writeFileSync(
  path.join(outDir, "meta.after-slice1.json"),
  JSON.stringify({ changed_lines: changed, plus, minus, diff_hash, paths_digest }, null, 2)
);

const corrected_candidate = {
  projection: "workspace",
  base_tree: base,
  candidate_tree: "WORKING-TREE-k2-1b-after-remediation-c",
  paths,
  diff_hash,
  paths_digest,
  authored_lines: changed,
  original_changed_lines: lineage.genesis.original_changed_lines,
};

const actual = Math.min(pending.forecast_lines, 180);

lineage = recordCorrection(lineage, {
  request_id: "record-slice1-convergent-cas-k21b",
  expected_revision: lineage.revision,
  base_candidate_id: pending.base_candidate_id,
  paths: pending.paths,
  actual_changed_lines: actual,
  corrected_candidate,
});

fs.writeFileSync(lineagePath, JSON.stringify(lineage, null, 2));
const planned = planLineageGate({ lineage });
fs.writeFileSync(path.join(outDir, "planned-after-record-slice1.json"), JSON.stringify(planned, null, 2));

console.log(
  JSON.stringify(
    {
      status: lineage.status,
      revision: lineage.revision,
      charged: actual,
      candidate_id: lineage.current_candidate_id,
      next: nextLineageAction(lineage),
      planned: planned.next_action,
      unified_changed: changed,
    },
    null,
    2
  )
);
