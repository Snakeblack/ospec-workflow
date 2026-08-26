## Exploration: K4b mode-only integrator + baseline projection authority

### Current State

**P1-1 — Mode-only integrator gap**

`parseUnifiedDiffs()` in `patch-integrator.js` already classifies mode-only sections correctly: `isModeOnly()` requires `oldMode`+`newMode`, no create/delete markers, zero hunks, and a non-`/dev/null` `targetPath` (lines 168–181). Parser acceptance aligns with REQ-repair-shadow-010.

The integrator loop (`integrateWorkResultPatches`, ~539–587) does **not** enforce the spec’s “existing path” semantics before apply:

1. **Missing path:** `oldContent = candidateFiles.has(path) ? get : ""` — a mode-only patch on `ghost.js` when the path is absent yields empty content, passes hunk validation (zero hunks), and `applyFileDiff()` copies zero lines → creates `ghost.js` with `""` plus `newMode` in `fileModes`.
2. **Mode mismatch:** No check compares `fd.oldMode` to the authorized base mode in `fileModes` (default effective mode `100644` when absent, matching Git/K6a inventory convention).

K6a `generateUnifiedDiff()` (`worker-executor.js` ~354–357) only emits header-only mode diffs for paths present in `baselineMap`; productive paths are safe, but the integrator must fail-closed on crafted/malicious patches.

**P1-2 — Orchestrator baseline fabrication**

`compareShadowExecution()` already rejects non-canonical inputs (`INVALID_COMPARISON_PROJECTION`). The orchestrator bypasses that guard (~562–569):

```javascript
const baselineProjection = isValidComparisonProjection(baseline)
  ? baseline
  : buildComparisonProjection({
      executionGraph: baseline.executionGraph || executionGraph, // ← live shadow graph fallback
      candidate: baseline.candidate || baseline,
      ...
    });
```

When `baselineResult` is the E2E `fixedBaseline` stub (partial ad-hoc object without `kind` or seven dimensions), `isValidComparisonProjection` is false and the orchestrator rebuilds a projection using the **live** `executionGraph`, treating the stub as `candidate` (`inventory` → `[]` because `paths` is missing; `diffs` → `"sha256:dummy"`). This violates REQ-repair-shadow-006 / ADR-003 graph-bound baseline authority.

### Affected Areas

- `scripts/lib/repair-shadow/patch-integrator.js` — add mode-only base-path + old-mode validation in `integrateWorkResultPatches` before `applyFileDiff`.
- `scripts/lib/repair-shadow/orchestrator.js` — remove `|| executionGraph` (and `baseline.candidate || baseline`) permissive fallbacks; resolve baseline only from canonical projection or baseline-owned graph-bound artifacts.
- `scripts/lib/repair-shadow/index.test.js` — regressions: mode-only on nonexistent path; mode-only with mismatched `old mode`.
- `scripts/k4b-repair-shadow-e2e.test.js` — replace `fixedBaseline` stub with a real canonical/graph-bound baseline (via `buildComparisonProjection` + baseline `executionGraph`/`candidate`/`workResults`/`graphTelemetry`, or a pre-built projection with `kind: repair-shadow-comparison-projection/v1` and all seven dimensions).

### Approaches

1. **Integrator gate (recommended for P1-1)** — After parse, when `fd.hunks.length === 0 && fd.oldMode && fd.newMode && !create && !delete`, require `candidateFiles.has(normTarget)` and `fd.oldMode === (fileModes[normTarget] ?? "100644")`; reject before `applyFileDiff`.
   - Pros: Minimal diff; matches REQ-010 “existing path”; blocks ghost creation at source; K6a unchanged.
   - Cons: Needs two new reason codes or reuse of existing ones (see Recommendation).
   - Effort: Low

2. **Parser-only enforcement** — Reject in `parseUnifiedDiffs` by passing base snapshot into parser.
   - Pros: Centralized classification.
   - Cons: Parser lacks authorized-base context today; would widen API surface; duplicates integrator’s `fileModes` state across predecessor merges.
   - Effort: Medium

3. **Strict baseline resolution (recommended for P1-2)** — If `isValidComparisonProjection(baseline)`, use as-is; else require `baseline.executionGraph` and build **only** from baseline-owned fields; if built projection invalid → pass `invalidProjectionResult()` to `compareShadowExecution` path (no live-graph substitution).
   - Pros: Aligns with ADR-003 and comparator fail-closed behavior; tiny orchestrator change.
   - Cons: Callers with partial stubs (like current E2E) must supply real baseline artifacts.
   - Effort: Low

4. **Fail entire orchestration on invalid baseline** — Return `ok: false` from `orchestrateRepairShadow`.
   - Pros: Loud failure.
   - Cons: Contradicts REQ-006 (“discrepancies recorded … without halting”); out of scope for surgical fix.
   - Effort: Low but wrong contract

### Recommendation

Adopt the reviewer’s surgical fixes (Approaches 1 + 3):

| Fix | Action | Reason codes |
|-----|--------|--------------|
| P1-1 | Gate in `integrateWorkResultPatches` using same predicates as `isModeOnly()` | Nonexistent path → `MALFORMED_UNIFIED_DIFF` (violates “existing path” in REQ-010 table). Old-mode mismatch → `INVALID_FILE_MODE` (consistent with Phase 2.1 invalid-mode handling). |
| P1-2 | Replace orchestrator fallback with baseline-only `buildComparisonProjection`; never inject live `executionGraph` | `shadow_comparison` carries `INVALID_COMPARISON_PROJECTION` when baseline authority insufficient; overall orchestration may still succeed per REQ-006. |
| E2E | Build `fixedBaseline` via `buildComparisonProjection({ executionGraph: graph, candidate, workResults, graphTelemetry })` from a known-good baseline snapshot or inline canonical projection | Restores meaningful comparison telemetry in E2E. |

No K6a changes. No new domain identity. No K4b redesign.

### Risks

- Default mode `100644` when `fileModes` omits a path must stay consistent with K3 freeze semantics; document in test fixtures.
- E2E baseline must use the same graph topology as the shadow run or comparison will correctly diverge — tests should assert projection validity, not necessarily `match: true`, unless baseline mirrors shadow inputs.
- Bugfix route skips spec phase; existing REQ-010/006 text already covers behavior — optional scenario additions in tasks if traceability gaps appear.

### Ready for Proposal

No (bugfix route). **Ready for `sdd-tasks`:** Yes — two focused tasks, ~4 test cases, estimated <100 changed lines.
