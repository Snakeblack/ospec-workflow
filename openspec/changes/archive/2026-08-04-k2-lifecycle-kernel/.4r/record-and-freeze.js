"use strict";

const fs = require("fs");
const path = require("path");
const {
  recordLensResult,
  freezeFindings,
  nextLineageAction,
} = require("../../../../scripts/lib/review-lineage.js");
const {
  planLineageGate,
  mergeReviewGateAudit,
} = require("../../../../scripts/lib/review-gate-state.js");

const outDir = __dirname;
const statePath = path.join(outDir, "..", "state.yaml");

let lineage = JSON.parse(fs.readFileSync(path.join(outDir, "lineage.json"), "utf8"));
const gateBase = JSON.parse(fs.readFileSync(path.join(outDir, "gate.json"), "utf8"));

const lensResults = {
  risk: {
    findings: [
      {
        severity: "CRITICAL",
        summary: "runKernelOperation commits advanced lifecycle state even when an effect is journaled as failed",
        acceptance_criteria:
          "Any failed effect must block state commit, preserve prior authoritative state (or explicit reconcile), and return blocked with a stable code—never advanced/terminal.",
      },
      {
        severity: "WARNING",
        summary: "Missing effectExecutor synthesizes completed effects and still mutates state",
        acceptance_criteria:
          "Mutating operations without effectExecutor fail closed; only non-mutating status may omit it; regression tests cover denial and no commit.",
      },
      {
        severity: "WARNING",
        summary: "assertSingleLifecycleReducer misses arrow/const reducer definitions",
        acceptance_criteria:
          "Checker flags arrow/assignment/exported reduceLifecycle definitions outside reducer.js; fixture test proves detection.",
      },
      {
        severity: "SUGGESTION",
        summary: "K2 scope-guard module bans can be bypassed via string concatenation",
        acceptance_criteria:
          "Detect concatenated require/import toward banned module names or tighten allowlisted K2 file set with regression fixture.",
      },
    ],
  },
  reliability: {
    findings: [
      {
        severity: "CRITICAL",
        summary:
          "effectExecutor {ok:false} journals failed then still commits reduced success state with no covering test",
        acceptance_criteria:
          "Add a runtime test where effectExecutor returns {ok:false} and assert blocked/failed outcome, state digest does not advance to the success post-state, and journal records failure without committing the reduced success state.",
      },
      {
        severity: "WARNING",
        summary: "journal status unknown fail-closed lacks public runKernelOperation integration test",
        acceptance_criteria:
          "Add runKernelOperation test with initial journal status unknown expecting outcome blocked, code reconciliation-required, and unchanged store state digest/journal material content.",
      },
    ],
  },
  resilience: {
    findings: [
      {
        severity: "CRITICAL",
        summary:
          "Ambiguous effectExecutor failure leaves journal started and resume blindly re-executes without unknown/fail-closed",
        acceptance_criteria:
          "Ambiguous executor failure after started must durable-mark unknown (or equivalent) and resume must block with reconciliation-required until exact outcome; started re-execute only when effect is proven not to have run.",
      },
      {
        severity: "WARNING",
        summary: "Optional commitJournal allows after-effect interrupt to duplicate effects",
        acceptance_criteria:
          "Require durable journal commits before effect start and after effect completion, or fail-closed when the store cannot provide mid-operation journal durability.",
      },
    ],
  },
  readability: {
    findings: [
      {
        severity: "WARNING",
        summary: "Near-identical interruptAt vs interruptAfter hide distinct barrier vocabularies",
        acceptance_criteria:
          "Rename to mechanism-revealing names or document each parameter's accepted token vocabulary with examples next to the destructuring.",
      },
      {
        severity: "WARNING",
        summary: "Silent reconcile→execute remap hides replay-once policy",
        acceptance_criteria:
          "Emit distinct self-describing journal actions or comment the remap citing the replay invariant and why started is not immediate fail-closed.",
      },
      {
        severity: "WARNING",
        summary: "Opaque stableSerialize&&JSON.stringify expression in checkSameTransitions",
        acceptance_criteria:
          "Replace with named clones that state intent and remove decorative stableSerialize&&, or comment why the form is deliberate.",
      },
      {
        severity: "SUGGESTION",
        summary: "Public barrel re-exports reduceLifecycle blurring core/shell conformance boundary",
        acceptance_criteria:
          "Stop re-exporting the reducer from the shell barrel, or explicitly label conformance API vs internal/model utilities.",
      },
    ],
  },
};

for (const dimension of ["risk", "reliability", "resilience", "readability"]) {
  lineage = recordLensResult(lineage, {
    dimension,
    expected_revision: lineage.revision,
    request_id: `result-${dimension}-k2`,
    result: lensResults[dimension],
  });
}

lineage = freezeFindings(lineage, {
  expected_revision: lineage.revision,
  request_id: "freeze-k2-findings",
});

const counts = { BLOCKER: 0, CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
for (const finding of lineage.findings) {
  counts[finding.severity] = (counts[finding.severity] || 0) + 1;
}
const findingsSummary = `${counts.BLOCKER} BLOCKER, ${counts.CRITICAL} CRITICAL, ${counts.WARNING} WARNING, ${counts.SUGGESTION} SUGGESTION`;

const planned = planLineageGate({
  lineage,
  observed_candidate_id: lineage.current_candidate_id,
});

const gate = mergeReviewGateAudit(gateBase, {
  lineage,
  status: lineage.status,
  findings_summary: findingsSummary,
  next_action: planned.next_action,
});

fs.writeFileSync(path.join(outDir, "lineage.json"), JSON.stringify(lineage, null, 2));
fs.writeFileSync(path.join(outDir, "gate.json"), JSON.stringify(gate, null, 2));
fs.writeFileSync(path.join(outDir, "findings.json"), JSON.stringify(lineage.findings, null, 2));

let stateText = fs.readFileSync(statePath, "utf8");
const gateJson = JSON.stringify(gate);
if (/^\s*4r-review-gate:/m.test(stateText)) {
  stateText = stateText.replace(/^\s*4r-review-gate:.*$/m, `  4r-review-gate: ${gateJson}`);
} else {
  throw new Error("4r-review-gate key not found");
}
fs.writeFileSync(statePath, stateText);

// Update tasks 11.5
const tasksPath = path.join(outDir, "..", "tasks.md");
let tasks = fs.readFileSync(tasksPath, "utf8");
tasks = tasks.replace(
  /- \[ \] 11\.5 Run bounded 4R review without relaunching reviewers after findings freeze\./,
  "- [x] 11.5 Run bounded 4R review without relaunching reviewers after findings freeze."
);
fs.writeFileSync(tasksPath, tasks);

console.log(
  JSON.stringify(
    {
      lineage_status: lineage.status,
      findings_summary: findingsSummary,
      findings_count: lineage.findings.length,
      blocking_ids: lineage.findings.filter((f) => f.blocking).map((f) => f.id),
      next_action: planned.next_action,
      next_lineage: nextLineageAction(lineage),
    },
    null,
    2
  )
);
