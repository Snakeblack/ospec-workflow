# Tasks: K4b mode-only integrator + baseline projection authority

## Lite Change Contract

- Change class: small
- Behavioral contract: `exploration.md` — P1-1 fail-closed mode-only path/mode gates in `integrateWorkResultPatches`; P1-2 remove live-graph baseline fallback in orchestrator; E2E uses canonical baseline projection.
- Acceptance checks:
  - Mode-only patch on absent path → `MALFORMED_UNIFIED_DIFF` before freeze
  - Mode-only patch with wrong `old mode` → `INVALID_FILE_MODE`
  - Partial baseline stub → `shadow_comparison.reason_code: INVALID_COMPARISON_PROJECTION`; orchestration still `ok: true`
  - E2E `fixedBaseline` is graph-bound canonical projection, not ad-hoc dimension stub
- Escalation trigger: K6a/worker diff changes, repositoryDir split, K4b redesign, or fail-closed halt on invalid baseline (contradicts REQ-006)

## Requirement Mapping

| Requirement / Scenario | Priority | Allocation | Status | Notes |
|------------------------|----------|------------|--------|-------|
| REQ-repair-shadow-010 mode-only existing path | MUST | `patch-integrator.js` gate before `applyFileDiff` | covered-by-exploration | Reuse `MALFORMED_UNIFIED_DIFF` / `INVALID_FILE_MODE` |
| REQ-repair-shadow-010 happy path (existing test) | MUST | `index.test.js` ~1799 | covered-by-exploration | Must stay green after gate |
| REQ-repair-shadow-006 canonical baseline authority | MUST | `orchestrator.js` baseline resolution | covered-by-exploration | No `|| executionGraph` / `|| baseline` |
| REQ-repair-shadow-006 orchestration non-halt on discrepancy | MUST | `orchestrator.js` success payload | covered-by-exploration | Invalid projection in telemetry only |

### Reconciliation Verdict

- MUST coverage: complete (via exploration + baseline specs)
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~60–90 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR (`size:exception` pre-approved) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | P1-1 mode-only gates + P1-2 baseline authority + E2E fixture | PR único | 4 archivos; `npm test` en index + e2e |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: P1-1 — Mode-only integrator fail-closed

- [x] 1.1 RED — `scripts/lib/repair-shadow/index.test.js`: add `REQ-repair-shadow-010: mode-only patch on nonexistent path rejects MALFORMED_UNIFIED_DIFF` — `files` omits `src/ghost.js`; header-only mode diff targets that path; assert `ok: false`, `reason_code: "MALFORMED_UNIFIED_DIFF"`, `candidate` undefined [REQ-repair-shadow-010]
- [x] 1.2 RED — `scripts/lib/repair-shadow/index.test.js`: add `REQ-repair-shadow-010: mode-only patch with mismatched old mode rejects INVALID_FILE_MODE` — `src/app.js` present without explicit `file_modes` (default `100644`); patch declares `old mode 100755` / `new mode 100755`; assert `ok: false`, `reason_code: "INVALID_FILE_MODE"` [REQ-repair-shadow-010]
- [x] 1.3 GREEN — `scripts/lib/repair-shadow/patch-integrator.js`: in `integrateWorkResultPatches`, after containment/hunk validation and **before** `applyFileDiff`, when mode-only (`fd.hunks.length === 0 && fd.oldMode && fd.newMode`, not create/delete): require `candidateFiles.has(normTarget)` else `MALFORMED_UNIFIED_DIFF`; require `fd.oldMode === (fileModes[normTarget] ?? "100644")` else `INVALID_FILE_MODE` [REQ-repair-shadow-010]
- [x] 1.4 VERIFY — run `npm test -- scripts/lib/repair-shadow/index.test.js`; confirm existing `REQ-repair-shadow-010: mode-only existing-path diff remains valid` still passes

## Phase 2: P1-2 — Baseline projection authority

- [x] 2.1 RED — `scripts/lib/repair-shadow/index.test.js`: add `REQ-repair-shadow-006: orchestrator does not substitute live graph for partial baseline stub` — mock successful execution; pass `baselineResult` ad-hoc stub (no `kind`, no `executionGraph`, e.g. `{ steps: ["n1"], diff_hash: "sha256:dummy" }`); assert `result.ok === true`, `shadow_comparison.reason_code === "INVALID_COMPARISON_PROJECTION"`, `shadow_comparison.match === false` [REQ-repair-shadow-006]
- [x] 2.2 RED — `scripts/k4b-repair-shadow-e2e.test.js`: replace `fixedBaseline` object (~L202–208) with `buildComparisonProjection({ executionGraph: graph, candidate, workResults, graphTelemetry })` built from a baseline-aligned snapshot (same graph topology as shadow run); assert projection has `kind: "repair-shadow-comparison-projection/v1"` and seven dimensions; assert `result.shadow_comparison.reason_code` is not `INVALID_COMPARISON_PROJECTION` when baseline mirrors shadow inputs [REQ-repair-shadow-006]
- [x] 2.3 GREEN — `scripts/lib/repair-shadow/orchestrator.js` (~L562–569): remove `baseline.executionGraph || executionGraph` and `baseline.candidate || baseline`; if `isValidComparisonProjection(baseline)` use as-is; else if `baseline.executionGraph` build **only** from baseline-owned `executionGraph`, `candidate`, `workResults`, `graphTelemetry`; else build invalid partial projection (no live-graph injection); always call `compareShadowExecution(shadowProjection, baselineProjection)` [REQ-repair-shadow-006]
- [x] 2.4 VERIFY — run `npm test -- scripts/lib/repair-shadow/index.test.js scripts/k4b-repair-shadow-e2e.test.js`

## Phase 3: Regression sweep

- [x] 3.1 Run targeted suite: `npm test -- scripts/lib/repair-shadow/index.test.js scripts/k4b-repair-shadow-e2e.test.js`
- [x] 3.2 Confirm no edits under K6a/worker paths; K4b scope limited to integrator + orchestrator + tests
