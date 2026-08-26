# Archive Report: k4b-correctness-remediation

**Archive destination (planned)**: `openspec/changes/archive/2026-08-26-k4b-correctness-remediation/`
**Verified**: 2026-08-26
**Verify verdict**: PASS WITH WARNINGS (20/20 MUST scenarios; `npm test` 2649 passed / 0 failed / 2 skipped)
**4R lineage**: `sha256:817e20a321a85f150da6df8d86a2acbebfaf416d0316ae6a5e84b4687f72b236` — approved (`all-remediation-slices-passed`)

## Summary

Remediación de corrección K4b sobre la implementación publicada en v2.48.0 para cumplir los criterios de cierre reales:

- Despacho exclusivo K6a mediante contrato cerrado (`executeWorkOrder` con firma de objeto; `executorFn` prohibido; allowlist de cinco claves).
- Propagación material de dependencias vía `EffectiveShadowBase` derivada y workspace fresco por nodo.
- Integración incremental estricta por `WorkOrder.allowed_paths` con validación de hunks, modos y freeze único anclado al `SourceSnapshot` original.
- Comparación shadow obligatoria en siete dimensiones sin omisiones (`skipped_dimensions` vacío).
- Persistencia auditable `repair-shadow-execution/v1` sobre `filesystem-store` con bindings fail-closed.
- E2E real K6a (N1 exporta `multiply()`, N2 importa y ejecuta) con snapshot de no-mutación de HEAD, branches y `openspec/config.yaml`.

## Verification Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS WITH WARNINGS |
| CRITICAL issues | None |
| WARNING issues | K4B-W001 (architecture doc stale — follow-up) |
| 4R review | Approved; 3 CRITICAL slices remediated; advisory WARNINGs accepted |
| Core tasks complete | 37 / 37 |
| Total tasks | 37 / 38 (6.6 optional skipped) |
| Full repository suite | PASS — 2649 passed / 0 failed / 2 skipped |

## Spec Preparation (change-local)

| Domain | Action | Added | Modified | Removed |
|--------|--------|-------|----------|---------|
| `repair-shadow-orchestration` | Merge delta into baseline | REQ-repair-shadow-008, REQ-repair-shadow-009 | REQ-repair-shadow-001, REQ-repair-shadow-003, REQ-repair-shadow-006 | — |

Prepared merged bytes: `prepared-specs/repair-shadow-orchestration/spec.md`
Delta audit trail: `specs/repair-shadow-orchestration/spec.md`
Live target: `openspec/specs/repair-shadow-orchestration/spec.md`
`target_before_sha256`: `sha256:ddfe382fb56e92758557e4a25d3048aecf9b9e5b4019c158f04e348706bb498d` (matches `baseline_fingerprints` in `state.yaml`)

## ADR Promotions (planned)

| Source | Planned target |
|--------|----------------|
| `decisions/adr-001.md` | `docs/adr/adr-20260826-001-derived-shadow-base-with-stable-origin-identity.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260826-002-closed-k6a-dispatch-contract.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260826-003-incremental-integration-and-single-final-freeze.md` |
| `decisions/adr-004.md` | `docs/adr/adr-20260826-004-repair-shadow-execution-record-on-filesystem-store.md` |

Las copias locales bajo `decisions/` viajan con el directorio archivado como pista de auditoría.

## Accepted Risks / Follow-ups

| ID | Severity | Summary | Disposition |
|----|----------|---------|-------------|
| K4B-W001 | WARNING | `docs/architecture/harness-evolution.md` permanece desalineado respecto al roadmap autoritativo (K4b in-progress / K6b blocked vs K4b done / K6b next-eligible) | **Follow-up** — tarea opcional 6.6 omitida fuera del allowlist de remediación 4R; no bloquea archivo |
| 4R advisory WARNINGs | WARNING | Bindings `source_snapshot_id`, CAS conflict, `policySnapshot` preflight, readability nesting | **Advisory** — aceptados; no bloquean archivo tras remediación de CRITICALs |

## Archive Inventory

Origin paths preserved by the planned runtime move (excluding `archive-plan.json` from fingerprint):

- `.4r/candidate.json`
- `.4r/diff.tracked.patch`
- `.4r/gate.json`
- `.4r/lens-readability.json`
- `.4r/lens-reliability.json`
- `.4r/lens-resilience.json`
- `.4r/lens-risk.json`
- `.4r/lineage.json`
- `apply-progress.md`
- `archive-report.md`
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `decisions/adr-003.md`
- `decisions/adr-004.md`
- `design.md`
- `prepared-specs/repair-shadow-orchestration/spec.md`
- `proposal.md`
- `specs/repair-shadow-orchestration/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

## Runtime Completion (pending)

- Promoción de especificaciones vivas y ADRs: `node scripts/archive-transaction-run.js k4b-correctness-remediation`
- El directorio fuente `openspec/changes/k4b-correctness-remediation/` permanece intacto hasta que el recibo de éxito del runtime confirme la coincidencia completa y efectúe el borrado atómico.

## Spec merge correction

El `prepared-specs/repair-shadow-orchestration/spec.md` emitido por el executor era un stub (cabecera + `## Requirements` vacío). El runtime copió esos bytes al spec vivo. Tras el recibo de éxito, el spec vivo se restauró desde HEAD y se fusionó el delta (REQ-001/003/006 modificados; REQ-008/009 añadidos; REQ-002/004/005/007 conservados). La copia de auditoría en `prepared-specs/` se sincronizó con el merge correcto.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k4b-correctness-remediation/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
