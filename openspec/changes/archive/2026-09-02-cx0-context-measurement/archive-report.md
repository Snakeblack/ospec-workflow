# Archive Report: cx0-context-measurement

**Archive destination (planned)**: `openspec/changes/archive/2026-09-02-cx0-context-measurement/`
**Verified**: 2026-09-01
**Verify verdict**: PASS (12/12 MUST scenarios; 18/18 tasks complete; `npm test` passed)
**Working branch**: `feat/k6d-cx0-parallel`
**4R lineage**: approved (`archive_allowed: true`, `terminal_reason: no-unresolved-blocking-findings`; 0 BLOCKER, 0 CRITICAL, 6 WARNING, 1 SUGGESTION)

## Summary

CX0 instrumenta consumo y amplificación de contexto con telemetría versionada, procedencia y cobertura por campo, KPIs con fórmulas explícitas, percentiles P50/P90 reproducibles por cohorte, y contraste advisory de hipótesis del roadmap — sin convertir observaciones en gates ni alterar autoridades, routing o la ruta crítica K6d.

Entregables principales:
1. Contrato cerrado `ospec-context-measurement/v1` con schema, fixtures y registro de hipótesis.
2. Biblioteca pura `scripts/lib/context-measurement.js` con normalización, KPIs, agregación determinista y comparación advisory.
3. Emisión fail-safe en `SubagentStop` hacia `.ospec/session/{change}/context-measurements.jsonl`, separada de O1.
4. APIs de reporting CX0 en `scripts/evals/lib/benchmark.js` desconectadas de scoring y policy.

Este informe se emite bajo el contrato **Plan-and-Report**: las escrituras vivas en `openspec/specs/**`, la promoción de ADRs a `docs/adr/**` y el movimiento final a `archive/` pertenecen al runtime transaccional (`node scripts/archive-transaction-run.js cx0-context-measurement`).

## Verification Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS |
| `phases.verify.verdict` (state.yaml) | PASS |
| CRITICAL issues (verify) | None (CX0-V001..V003 resueltos y verificados) |
| WARNING issues (verify) | None |
| Apply tasks complete | 18/18 |
| 4R review gate | Approved (`terminal_reason: no-unresolved-blocking-findings`) |
| 4R blocking findings | None (0 BLOCKER, 0 CRITICAL) |
| Baseline fingerprints | `hooks` y `orchestrator-evals` coinciden con specs vivas |
| Destructive delta | No (1 dominio nuevo + 2 ADDED requirements; baseline preservado) |
| Spec integrity validation | Validated (sin tokens corruptos ni dropped REQ IDs) |

El mantenedor eligió archivar sin remediar los hallazgos advisory del gate 4R; se documentan como riesgos aceptados en `accepted_warnings[]`.

## Spec Preparation (change-local)

| Domain | Action | Added | Modified | Removed |
|--------|--------|-------|----------|---------|
| `context-measurement` | New domain | REQ-context-measurement-001..005 (5) | — | — |
| `hooks` | Prepared merge | REQ-hooks-017 (1) | — | — |
| `orchestrator-evals` | Prepared merge | REQ-orchestrator-evals-007 (1) | — | — |

Archivos preparados localmente:
- `prepared-specs/context-measurement/spec.md`
- `prepared-specs/hooks/spec.md`
- `prepared-specs/orchestrator-evals/spec.md`

Las deltas auditadas en `specs/{domain}/spec.md` permanecen intactas. Las escrituras vivas en `openspec/specs/**` son propiedad exclusiva del runtime transaccional.

## ADR Promotions (planned)

| Source | Planned target | Title |
|--------|----------------|-------|
| `decisions/adr-001.md` | `docs/adr/adr-20260902-004-separate-cx0-telemetry-from-legacy-phase-costs.md` | Separate CX0 telemetry from legacy phase costs |
| `decisions/adr-002.md` | `docs/adr/adr-20260902-005-coverage-aware-metric-union-and-versioned-formulas.md` | Coverage-aware metric union and versioned formulas |
| `decisions/adr-003.md` | `docs/adr/adr-20260902-006-canonical-advisory-cohort-reporting.md` | Canonical advisory cohort reporting |

Las copias bajo `decisions/` viajan con la carpeta archivada como auditoría. Ningún ADR fue invalidado durante verify.

## Accepted Risks / Follow-ups

Hallazgos 4R advisory aceptados por el mantenedor al elegir archive sin remediación (`accepted_warnings[]`):

| ID | Severity | Owner | Summary | Disposition |
|----|----------|-------|---------|-------------|
| `F-7e755c339dcb57f4` | WARNING | risk | `validateContextMeasurement` no impone `unit:"count"` ni patrón de `formula_version` en métricas available passthrough. | advisory follow-up |
| `F-45fa99b248db7578` | WARNING | reliability | Ruta `incompatible-components` de `deriveContextKpis` sin prueba normativa. | advisory follow-up |
| `F-7be07dc640d573e6` | WARNING | reliability | `loadCx0Hypotheses` no prueba caminos de error por registro malformado. | advisory follow-up |
| `F-50d43dbc72fc61e4` | WARNING | reliability | `persistContextMeasurement` sin tests para skips `unsupported-agent` y `no-active-change`. | advisory follow-up |
| `F-314a975b2b73ec76` | WARNING | reliability | `validateContextMeasurement` no valida `unit: 'count'` en métricas disponibles. | advisory follow-up |
| `F-54662d85b86880cb` | WARNING | readability | Helpers `count()`, `available()`, `unavailable()` con nombres poco expresivos. | advisory follow-up |
| `F-0803f7bc5efd904b` | SUGGESTION | readability | Regla de compatibilidad de fuentes en `deriveContextKpis` sin comentario inline. | advisory follow-up |

`open_decisions` ausente en `state.yaml` — no se escribió `openspec/memory/decisions.md`.

## Archive Inventory

Rutas relativas al cambio que el runtime debe preservar (28 entradas, incluye auditoría `.4r/`):
- `.4r/candidate.json`, `.4r/decision.json`, `.4r/diff.unified.patch`, `.4r/evidence.json`, `.4r/generalist.json`, `.4r/lens-results.json`, `.4r/lineage.json`, `.4r/next-action.json`, `.4r/paths.json`, `.4r/planned.json`, `.4r/request-ids.json`, `.4r/summary.json`
- `apply-progress.md`
- `archive-report.md`
- `decisions/adr-001.md`, `decisions/adr-002.md`, `decisions/adr-003.md`
- `design.md`
- `prepared-specs/context-measurement/spec.md`, `prepared-specs/hooks/spec.md`, `prepared-specs/orchestrator-evals/spec.md`
- `proposal.md`
- `specs/context-measurement/spec.md`, `specs/hooks/spec.md`, `specs/orchestrator-evals/spec.md`
- `state.yaml`, `tasks.md`, `verify-report.md`

## Runtime Completion (pending)

- Fusión de specs vivas, promoción de ADRs y commit de archivo: `node scripts/archive-transaction-run.js cx0-context-measurement`
- El directorio origen `openspec/changes/cx0-context-measurement/` permanece hasta el recibo de éxito del runtime.
- Este ejecutor no escribió `openspec/specs/**`, `docs/adr/**`, ni movió la carpeta a `archive/`.

## Cost

Estimated token cost per phase, aggregated from
`.ospec/session/cx0-context-measurement/phase-costs.jsonl`. Figures are heuristic estimates
(~4 bytes/token), not exact metering.

| Phase | Invocations | Re-launches | Duration | Model Tiers | Statuses | Estimated Prompt Tokens | Estimated Artifact Tokens | Estimated Tool Output Tokens | Estimated Output Tokens |
|-------|-------------|-------------|----------|-------------|----------|-------------------------|---------------------------|------------------------------|-------------------------|
| propose | 2 | 1 | 0ms | unknown | unknown, success | 139454 (estimated) | 0 (estimated) | 0 (estimated) | 166 (estimated) |
| spec | 2 | 1 | 0ms | unknown | success | 150326 (estimated) | 0 (estimated) | 0 (estimated) | 99 (estimated) |
| clarify | 2 | 1 | 0ms | unknown | success | 179567 (estimated) | 0 (estimated) | 0 (estimated) | 737 (estimated) |
| design | 1 | 0 | 0ms | unknown | success | 93563 (estimated) | 0 (estimated) | 0 (estimated) | 68 (estimated) |
| tasks | 1 | 0 | 0ms | unknown | success | 99231 (estimated) | 0 (estimated) | 0 (estimated) | 29 (estimated) |
| apply | 6 | 5 | 0ms | unknown | success, unknown | 739507 (estimated) | 0 (estimated) | 0 (estimated) | 411 (estimated) |
| verify | 1 | 0 | 0ms | unknown | success | 129442 (estimated) | 0 (estimated) | 0 (estimated) | 71 (estimated) |

**Total user questions asked**: 1
