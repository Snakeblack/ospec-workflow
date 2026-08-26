# Apply Progress: k4b-mode-only-and-baseline-projection

- Batch: 1 (first; no previous apply-progress)
- Mode: Focused TDD (RED → GREEN). `testing.tdd_mode: focused`. Not Strict TDD.
- Delivery: `exception-ok` / `size:exception` (pre-approved). Full task list in one batch.
- Branch: `fix/k4b-mode-only-and-baseline-projection`

## Workload

- Forecast: ~60–90 changed lines; 400-line budget risk Low
- Live: 4 files, 116 insertions / 15 deletions (tests dominate). Under 400-line budget; no `workload-escalation`.
- Scope: integrator + orchestrator + listed tests only. No K6a/worker production path edits.

## Phase 1: P1-1 mode-only integrator fail-closed

| Task | Status | Notes |
|------|--------|-------|
| 1.1 | [x] | RED: mode-only on `src/ghost.js` (path omitted from `files`) currently `ok: true`. Fail: `true !== false`. |
| 1.2 | [x] | RED: `old mode 100755` vs default `100644` currently `ok: true`. Fail: `true !== false`. |
| 1.3 | [x] | GREEN: gate in `integrateWorkResultPatches` after hunk validation, before `applyFileDiff`. Missing path → `MALFORMED_UNIFIED_DIFF` (no freeze). `oldMode !== (fileModes[path] ?? "100644")` → `INVALID_FILE_MODE`. |
| 1.4 | [x] | Existing `REQ-repair-shadow-010: mode-only existing-path diff remains valid` still passes. |

RED command (before production edits):

```text
node --test --test-name-pattern "mode-only patch on nonexistent|mode-only patch with mismatched|does not substitute live graph" scripts/lib/repair-shadow/index.test.js
```

RED result: 3 fail / 0 pass. Failures were the intended missing gates (ok true / reason_code undefined), not setup errors.

## Phase 2: P1-2 baseline projection authority

| Task | Status | Notes |
|------|--------|-------|
| 2.1 | [x] | RED: ad-hoc stub `{ steps: ["n1"], diff_hash: "sha256:dummy" }` previously rebuilt from live `executionGraph`; `reason_code` was `undefined`. After GREEN: `ok: true`, `shadow_comparison.reason_code === "INVALID_COMPARISON_PROJECTION"`, `match === false`. |
| 2.2 | [x] | E2E `fixedBaseline` replaced with `buildComparisonProjection({ executionGraph: graph, candidate: {}, workResults: [], graphTelemetry: {} })`. Asserts `kind: repair-shadow-comparison-projection/v1`, seven dimensions, and `reason_code !== INVALID_COMPARISON_PROJECTION`. |
| 2.3 | [x] | Orchestrator: canonical projection as-is; else `baseline.executionGraph` → `buildComparisonProjection` from baseline-owned fields only (no `\|\| executionGraph`, no `baseline.candidate \|\| baseline`); else pass partial object to `compareShadowExecution`. Orchestration remains `ok: true` (REQ-006). |
| 2.4 | [x] | Targeted suite green. |

## Phase 3: Regression sweep

| Task | Status | Notes |
|------|--------|-------|
| 3.1 | [x] | `npm test -- scripts/lib/repair-shadow/index.test.js scripts/k4b-repair-shadow-e2e.test.js` → All checks passed. `2672` tests, `2670` pass, `0` fail. |
| 3.2 | [x] | `git diff --name-only` production+tests: `patch-integrator.js`, `orchestrator.js`, `index.test.js`, `k4b-repair-shadow-e2e.test.js`. No `worker-executor.js` / `worker-workspace.js` / K6a edits. |

GREEN verification command:

```text
npm test -- scripts/lib/repair-shadow/index.test.js scripts/k4b-repair-shadow-e2e.test.js
```

GREEN result: All checks passed.

Passing contract tests:

- `REQ-repair-shadow-010: mode-only existing-path diff remains valid and changes Candidate modes`
- `REQ-repair-shadow-010: mode-only patch on nonexistent path rejects MALFORMED_UNIFIED_DIFF`
- `REQ-repair-shadow-010: mode-only patch with mismatched old mode rejects INVALID_FILE_MODE`
- `REQ-repair-shadow-006: orchestrator does not substitute live graph for partial baseline stub`
- `E2E: N1 multiply() propagates to N2 through real K6a workspaces`

## Files changed

| File | Action | What was done |
|------|--------|---------------|
| `scripts/lib/repair-shadow/index.test.js` | Modified | Added 1.1, 1.2, 2.1 RED tests |
| `scripts/lib/repair-shadow/patch-integrator.js` | Modified | Mode-only path + old-mode gate before `applyFileDiff` |
| `scripts/lib/repair-shadow/orchestrator.js` | Modified | Baseline resolution without live-graph fallback |
| `scripts/k4b-repair-shadow-e2e.test.js` | Modified | Canonical `buildComparisonProjection` fixture + validity asserts |

## Deviations

None — implementation matches exploration.md Approaches 1 + 3.

## Issues

None.

## Remaining tasks

None. Ready for `sdd-verify`.
