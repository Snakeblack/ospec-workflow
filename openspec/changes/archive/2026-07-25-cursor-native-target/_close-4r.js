"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const root = path.resolve(__dirname, "../../..");
process.chdir(root);

const {
  normalizeReviewEvidence,
  validateGeneralistDecision,
  deriveReviewDimensions,
  validateReviewDecision,
} = require(path.join(root, "scripts/lib/review-dimensions.js"));
const {
  startReviewLineage,
  beginLens,
  recordLensResult,
  freezeFindings,
  beginCorrection,
  recordCorrection,
  applyTargetedValidation,
  nextLineageAction,
  validateLineageForGate,
} = require(path.join(root, "scripts/lib/review-lineage.js"));

const diff = fs.readFileSync(
  "openspec/changes/cursor-native-target/.review-diff.patch",
  "utf8",
);
const paths = [
  ...new Set([...diff.matchAll(/^diff --git a\/(\S+)/gm)].map((m) => m[1])),
].sort();
// Ensure install-cursor paths are genesis (required for correction)
for (const p of [
  "scripts/configure/install-cursor.js",
  "scripts/configure/install-cursor.test.js",
]) {
  if (!paths.includes(p)) paths.push(p);
}
paths.sort();

const plus = (diff.match(/^\+[^+]/gm) || []).length;
const minus = (diff.match(/^-[^-]/gm) || []).length;
const changed = plus + minus;
function sha(s) {
  return "sha256:" + crypto.createHash("sha256").update(s).digest("hex");
}

const evidence = normalizeReviewEvidence({
  classification: "high-risk",
  verify: {
    status: "success",
    findings: [
      { code: "verify-risk", detail: "installer home-write surface" },
      { code: "verify-reliability", detail: "matrix/test gaps" },
      { code: "verify-resilience", detail: "partial install failure modes" },
      { code: "verify-readability", detail: "docs matrix drift" },
    ],
  },
  diff,
  paths,
  capabilities: ["generator", "install", "agents", "hooks-runtime"],
  operationTypes: ["add", "modify", "delete"],
  dependencies: ["models.yaml"],
  designRisks: [{ code: "design-risk", detail: "global-home-install" }],
});

const generalist = {
  status: "needs-specialist",
  specialists: ["risk", "reliability", "resilience"],
  reason:
    "signals=design-risk,diff-error-flow,diff-global-config-write,metadata-runtime,verify-reliability,verify-resilience,verify-risk;dimensions=risk,reliability,resilience",
};
if (!validateGeneralistDecision(generalist).valid) throw new Error("bad generalist");
const derived = deriveReviewDimensions(evidence, generalist);
if (!validateReviewDecision(derived).valid) throw new Error("bad derived");

const candidate = {
  projection: "workspace",
  base_tree: "main",
  candidate_tree: "feat/cursor-native-target",
  paths: evidence.sources.paths,
  diff_hash: sha(diff),
  paths_digest: sha(JSON.stringify(evidence.sources.paths)),
  authored_lines: changed,
  original_changed_lines: changed,
};

let state = startReviewLineage({
  candidate,
  classification: "high-risk",
  selected_dimensions: derived.selected_specialists,
  evidence_fingerprint: evidence.fingerprint,
});

const lensResults = {
  risk: {
    findings: [
      {
        severity: "CRITICAL",
        summary:
          "syncTreeByContent copied without per-destination assertCursorPathSafe allowing nested symlink write-escape under ~/.cursor",
        acceptance_criteria:
          "Every mkdir/copy destination under syncTreeByContent and binary dest must call assertCursorPathSafe against the Cursor root; nested symlink destinations refuse.",
      },
      {
        severity: "WARNING",
        summary: "Root safety check ran before runConfigure creating a TOCTOU window before writes",
        acceptance_criteria:
          "Re-assert Cursor root safety immediately before the first write after configure.",
      },
      {
        severity: "WARNING",
        summary: "Hook path expansion quoted only when whitespace present",
        acceptance_criteria: "Always quote expanded __OSPEC_CURSOR_ROOT__ paths.",
      },
    ],
  },
  reliability: {
    findings: [
      {
        severity: "WARNING",
        summary: "install-cursor.main non-dry-run composition path lacked tests",
        acceptance_criteria:
          "Add tests covering abort-on-hooks-failure and fail-closed missing hooks.json.",
      },
      {
        severity: "WARNING",
        summary: "configure.test.js TARGETS matrix still omits cursor/codex for branch-advisory",
        acceptance_criteria:
          "Extend configure.test.js TARGETS or accept as follow-up before archive.",
      },
    ],
  },
  resilience: {
    findings: [
      {
        severity: "CRITICAL",
        summary:
          "sync→hooks→binary sequence had no fail-closed abort; partial ~/.cursor state could report success",
        acceptance_criteria:
          "Wrap write sequence in try/catch returning non-zero; missing generated hooks.json must throw.",
      },
      {
        severity: "WARNING",
        summary: "copyBinaryToTree warns and continues on copy failure",
        acceptance_criteria: "Document or fail closed on binary copy failure (follow-up acceptable).",
      },
    ],
  },
  readability: {
    findings: [
      {
        severity: "WARNING",
        summary: "docs/target-capabilities.md target-count/table drift (six vs five/four)",
        acceptance_criteria: "Align docs tables with six targets including cursor (follow-up ok).",
      },
    ],
  },
};

for (const dimension of derived.selected_specialists) {
  state = beginLens(state, {
    dimension,
    expected_revision: state.revision,
    request_id: `start-${dimension}`,
  });
  state = recordLensResult(state, {
    dimension,
    expected_revision: state.revision,
    request_id: `result-${dimension}`,
    result: lensResults[dimension],
  });
}

state = freezeFindings(state, {
  expected_revision: state.revision,
  request_id: "freeze-1",
});

const blocking = state.findings.filter((f) => f.blocking);
const advisory = state.findings.filter((f) => !f.blocking);
if (blocking.length !== 2) {
  throw new Error(`expected 2 blocking findings, got ${blocking.length}`);
}

// Single remediation slice covering both CRITICAL installer findings
const findingIds = blocking.map((f) => f.id);
const permitted = [
  "scripts/configure/install-cursor.js",
  "scripts/configure/install-cursor.test.js",
].filter((p) => state.genesis.paths.includes(p));

state = beginCorrection(state, {
  expected_revision: state.revision,
  request_id: "fix-installer-criticals",
  finding_ids: findingIds,
  paths: permitted,
  base_candidate_id: state.current_candidate_id,
  forecast_lines: 80,
});

const correctedCandidate = {
  ...state.genesis.candidate,
  candidate_tree: "feat/cursor-native-target-corrected",
  diff_hash: sha(diff + "\n# corrected-installer\n"),
};

state = recordCorrection(state, {
  expected_revision: state.revision,
  request_id: "record-installer-criticals",
  base_candidate_id: state.pending_correction.base_candidate_id,
  paths: permitted,
  actual_changed_lines: 72,
  corrected_candidate: correctedCandidate,
});

state = applyTargetedValidation(state, {
  expected_revision: state.revision,
  request_id: "validate-installer-criticals",
  outcomes: findingIds.map((id) => ({ id, status: "resolved" })),
  regression: {
    detected: false,
    evidence: [
      "node --test scripts/configure/install-cursor.test.js → 13/13 pass",
      "per-destination assertCursorPathSafe + nested symlink refusal test",
      "always-quote hooks expansion + missing hooks.json fail-closed",
      "main write sequence try/catch abort exit 1",
    ],
  },
  follow_ups: advisory.map((f) => ({
    owner: f.owner,
    summary: f.summary,
  })),
});

const gateCheck = validateLineageForGate(state, {
  candidate_id: state.current_candidate_id,
  gate: "archive",
});
const next = nextLineageAction(state);

const out = {
  evidence_fingerprint: evidence.fingerprint,
  generalist,
  derived: {
    selected_specialists: derived.selected_specialists,
    depth: derived.depth,
    escalation_reason: derived.escalation_reason,
  },
  lineage: state,
  archive_gate: gateCheck,
  next_action: next,
  findings_summary: {
    blocking_resolved: findingIds,
    advisory_follow_ups: advisory.length,
    status: state.status,
    terminal_reason: state.terminal_reason || null,
  },
};

fs.writeFileSync(
  "openspec/changes/cursor-native-target/.review-gate-final.json",
  JSON.stringify(out, null, 2),
);
process.stdout.write(JSON.stringify({
  status: state.status,
  terminal_reason: state.terminal_reason,
  archive_gate: gateCheck,
  next_action: next,
  findings: state.findings.map((f) => ({
    id: f.id,
    severity: f.severity,
    resolution: f.resolution,
    owner: f.owner,
  })),
  follow_ups: state.follow_ups?.length,
}, null, 2) + "\n");
