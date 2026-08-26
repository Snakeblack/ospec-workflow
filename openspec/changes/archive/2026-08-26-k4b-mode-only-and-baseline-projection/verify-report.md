## Verification Report

**Change**: k4b-mode-only-and-baseline-projection
**Version**: N/A (bugfix route; baseline requirements REQ-repair-shadow-010 and REQ-repair-shadow-006)
**Mode**: Focused / Standard verification

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 11 |
| Tasks complete | 11 |
| Tasks incomplete | 0 |

The bugfix override intentionally uses `exploration.md` as the change behavior contract. No proposal or design artifact is required for this route.

### Build & Tests Execution

**Build**: Not configured (`rules.verify.build_command` is empty).

**Targeted tests**: Passed — 49 passed, 0 failed, 0 skipped.

```text
node --test scripts/lib/repair-shadow/index.test.js scripts/k4b-repair-shadow-e2e.test.js
tests 49
pass 49
fail 0
skipped 0
duration_ms 668.7213
```

**Full regression suite**: Passed.

```text
npm test
All checks passed.
exit code: 0
```

**Manual verification**: Not performed; the requested MUST behaviors were exercised through production runtime paths by automated tests.

**Coverage**: Not available (`testing.coverage.available: false`); configured threshold is 0.

### Spec Compliance Matrix

| Requirement | Scenario | Evidence Level | Source | Result | Notes |
|-------------|----------|----------------|--------|--------|-------|
| REQ-repair-shadow-010 | Existing-path mode-only diff remains valid and affects Candidate modes | `runtime-test` | `scripts/lib/repair-shadow/index.test.js` > `mode-only existing-path diff remains valid and changes Candidate modes` | PASS | Confirms the valid path remains accepted after the new gates. |
| REQ-repair-shadow-010 + exploration P1-1 | Mode-only patch on an absent path rejects before freeze | `runtime-test` | `scripts/lib/repair-shadow/index.test.js` > `mode-only patch on nonexistent path rejects MALFORMED_UNIFIED_DIFF` | PASS | Returns `MALFORMED_UNIFIED_DIFF`; no Candidate is emitted. |
| REQ-repair-shadow-003/010 + exploration P1-1 | Mode-only `old mode` must match the authorized base mode | `runtime-test` | `scripts/lib/repair-shadow/index.test.js` > `mode-only patch with mismatched old mode rejects INVALID_FILE_MODE` | PASS | Default effective base mode `100644` is enforced; no Candidate is emitted. |
| REQ-repair-shadow-006 + exploration P1-2 | Partial baseline input must not borrow the live execution graph | `runtime-test` | `scripts/lib/repair-shadow/index.test.js` > `orchestrator does not substitute live graph for partial baseline stub` | PASS | Comparator returns `INVALID_COMPARISON_PROJECTION` and `match: false`. |
| REQ-repair-shadow-006 | Invalid comparison telemetry does not halt successful orchestration | `runtime-test` | Same orchestrator regression test | PASS | The orchestration result remains `ok: true`. |
| REQ-repair-shadow-006 + exploration E2E | E2E baseline is a graph-bound canonical seven-dimension projection | `runtime-test` | `scripts/k4b-repair-shadow-e2e.test.js` > `E2E: N1 multiply() propagates to N2 through real K6a workspaces` | PASS | Asserts canonical kind, all seven dimensions, and no `INVALID_COMPARISON_PROJECTION`. |

**Compliance summary**: 6/6 requested MUST scenarios satisfied with `runtime-test` evidence.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| Mode-only existing-path authority | Implemented | `integrateWorkResultPatches` checks `candidateFiles.has(normTarget)` before context validation, apply, and freeze. |
| Mode-only old-mode authority | Implemented | `fd.oldMode` is compared with `fileModes[normTarget] ?? "100644"` before apply. |
| Baseline projection authority | Implemented | The orchestrator accepts canonical projections as-is or rebuilds only from `baseline.executionGraph` and baseline-owned fields. |
| No live-graph fallback | Implemented | The previous `baseline.executionGraph || executionGraph` and `baseline.candidate || baseline` fallbacks are absent. |
| Invalid projection non-halting behavior | Implemented | Comparison telemetry is attached to the normal success payload; persistence and orchestration success continue. |

### Coherence (Bugfix Contract)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Exploration Approach 1: gate mode-only integration before `applyFileDiff` | Yes | Implemented in `patch-integrator.js` with the specified reason codes. |
| Exploration Approach 3: baseline-only projection resolution | Yes | Implemented in `orchestrator.js` without live graph or candidate substitution. |
| E2E canonical projection fixture | Yes | `fixedBaseline` is produced by `buildComparisonProjection` and validated across seven dimensions. |
| Preserve K6a scope | Yes | The working diff contains exactly the two K4b production files and the two requested tests; no worker/K6a file changed. |

### Traceability Matrix

| REQ | Tasks | Commits | Tests | Status |
|-----|-------|---------|-------|--------|
| REQ-repair-shadow-010 | 1.1–1.4 | working tree | `scripts/lib/repair-shadow/index.test.js` (three mode-only runtime cases) | OK |
| REQ-repair-shadow-006 | 2.1–2.4, 3.1 | working tree | `scripts/lib/repair-shadow/index.test.js`; `scripts/k4b-repair-shadow-e2e.test.js` | OK |

### Issues Found

**CRITICAL**: None.

**WARNING**: None.

**SUGGESTION**: None.

### Quality Gates

No active `quality_gates` policy is declared in `openspec/config.yaml`; this section is a no-op and no `state.yaml` quality-gate audit is required.

### Verdict

**PASS**

All requested P1 behaviors are proven by runtime tests, all 11 tasks are complete, the full regression command exits successfully, and the implementation matches the bugfix contract without scope drift.
