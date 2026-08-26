# Archive Report: k4b-mode-only-and-baseline-projection

**Archive destination (planned)**: `openspec/changes/archive/2026-08-26-k4b-mode-only-and-baseline-projection/`
**Verified**: 2026-08-26
**Verify verdict**: PASS
**4R lineage**: `sha256:b4d2088a33e3656552d1fded5700d7b601e815f4fe70239b3164056038093dac` — approved (`no-unresolved-blocking-findings`)

## Summary

Bugfix quirúrgico K4b que cierra dos brechas P1 sin ampliar el alcance K6a:

- **P1-1 (REQ-repair-shadow-010)**: el integrador `integrateWorkResultPatches` rechaza diffs mode-only sobre paths ausentes (`MALFORMED_UNIFIED_DIFF`) y con `old mode` distinto al modo autorizado (`INVALID_FILE_MODE`) antes de `applyFileDiff`.
- **P1-2 (REQ-repair-shadow-006)**: el orquestador elimina el fallback al grafo live (`baseline.executionGraph || executionGraph` y `baseline.candidate || baseline`); la proyección baseline es canónica o se construye solo desde campos del baseline; stubs parciales producen `INVALID_COMPARISON_PROJECTION` sin detener la orquestación.
- **E2E**: `fixedBaseline` usa `buildComparisonProjection` con proyección canónica de siete dimensiones.

Contrato conductual: `exploration.md`. Sin delta spec local — los MUST ya están cubiertos por REQ-repair-shadow-010 y REQ-repair-shadow-006 en baseline.

## Verification Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS |
| CRITICAL issues | None |
| WARNING issues | None |
| 4R review | Approved; 0 BLOCKER, 0 CRITICAL, 0 WARNING, 0 SUGGESTION |
| Tasks complete | 11 / 11 |
| Targeted tests | 49 passed / 0 failed |
| Full repository suite | PASS (`npm test`) |
| Quality gates | Not declared (no-op) |

## Spec Preparation (change-local)

No change-local delta specs under `specs/`. Bugfix route relies on existing baseline requirements and `exploration.md`. `spec_writes` in the archive plan is empty.

## ADR Promotions (planned)

None — no `decisions/` directory. Decisions in exploration reference existing ADR-003 authority; no new ADR promotion required.

## Accepted Risks / Follow-ups

None recorded. Verify and 4R returned zero unresolved findings.

## Archive Inventory

Origin paths preserved by the planned runtime move (excluding `archive-plan.json` from fingerprint):

- `.4r/build-evidence.js`
- `.4r/decision.json`
- `.4r/diff.tracked.patch`
- `.4r/evidence.json`
- `.4r/findings-summary.json`
- `.4r/freeze-lineage.js`
- `.4r/gate.json`
- `.4r/lens-reliability.json`
- `.4r/lens-resilience.json`
- `.4r/lineage.json`
- `.4r/record-lenses.js`
- `.4r/request-ids.json`
- `apply-progress.md`
- `archive-report.md`
- `exploration.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

## Runtime Completion (pending)

- Archive transaction: `node scripts/archive-transaction-run.js k4b-mode-only-and-baseline-projection`
- No live `openspec/specs/**` or `docs/adr/**` writes are planned for this change.
- The source directory `openspec/changes/k4b-mode-only-and-baseline-projection/` remains intact until the runtime success receipt confirms full match and performs atomic delete.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k4b-mode-only-and-baseline-projection/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
