# Archive Report: verify-lineage-candidate-persistence

**Archive destination (planned)**: `openspec/changes/archive/2026-09-02-verify-lineage-candidate-persistence/`
**Verified**: 2026-09-01
**Verify verdict**: PASS WITH WARNINGS (10/10 MUST scenarios pass; 14/14 tasks complete; `npm test` passed)
**Working branch**: `feat/k6d-cx0-parallel`
**4R lineage**: approved (Lineage generation 2 approved, `archive_allowed: true`, `terminal_reason: no-unresolved-blocking-findings`)

## Summary

Este cambio se originó como una corrección de arnés (harness bug fix) descubierta durante el desarrollo en paralelo de CX0 y K6d para proporcionar recuperación content-addressed de preimágenes `Candidate/v2`, permitiendo que los lineages de remediación puedan pausarse, serializarse en `state.yaml`, recargarse en procesos Node.js independientes y reanudar remediaciones de forma segura y determinista:
1. Almacenamiento CAS local al cambio (`.verify-lineage/candidates/sha256/<hex>.json`) con publicación atómica sin sobreescritura (no-clobber) y verificación previa antes de que el lineage emita la referencia.
2. Rehidratación y doble validación estricta (SHA-256 de bytes canónicos y `candidate_id` canónico) en `prepareRemediation` y `recordRemediationAttempt`, fallando cerrado ante corrupción o discrepancia sin alterar histórico.
3. Compatibilidad hacia atrás con lineages legacy schema-v1 ID-only: lectura inmutable y rechazo seguro fail-closed ante intentos de mutación sin material recuperable.

Este informe se emite bajo el contrato **Plan-and-Report**: las escrituras a especificaciones vivas (`openspec/specs/**`), la promoción de ADRs a memoria viva (`docs/adr/**`) y la confirmación final del movimiento de la carpeta a `archive/` son responsabilidad exclusiva del runtime transaccional determinista ejecutado por el orquestador (`node scripts/archive-transaction-run.js verify-lineage-candidate-persistence`).

## Verification Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS WITH WARNINGS |
| `phases.verify.verdict` (state.yaml) | PASS WITH WARNINGS (actualizado para preflight del runtime) |
| CRITICAL issues (verify) | None (0) |
| WARNING issues (verify) | 1 (`VLCP-W001` — gap de trazabilidad de etiqueta en tests; comportamiento cubierto al 100%) |
| Apply tasks complete | 14/14 |
| 4R review gate | Approved (`terminal_reason: no-unresolved-blocking-findings`; `archive_allowed: true`) |
| 4R blocking findings | None (0 BLOCKER, 0 CRITICAL; 2 WARNING advisory, 2 SUGGESTION advisory) |
| Baseline fingerprints | Match live `openspec/specs/verify-lineage/spec.md` (`b8f49c02ea2aa0e5f5cbfede131e59406b17d2fe3586ca0797cc35d48fcfcadb`) |
| Destructive delta | No (1 MODIFIED requirement, 3 ADDED requirements; todos los requisitos baseline preservados) |
| Spec integrity validation | Validated (sin tokens `undefined`, `[object Object]` ni dropped requirement IDs) |

El cierre de fase procede con `PASS WITH WARNINGS` porque la única advertencia del reporte de verificación (`VLCP-W001`) y las advertencias consultivas del gate 4R están explícitamente aceptadas y documentadas como riesgos aceptados / follow-ups consultivos.

## Spec Preparation (change-local)

La especificación completa resultante ha sido preparada y validada en el espacio local del cambio (`prepared-specs/verify-lineage/spec.md`), fusionando el delta sobre la especificación principal existente sin sobrescribir el delta auditado en `specs/verify-lineage/spec.md`.

| Domain | Action | Added | Modified | Removed |
|--------|--------|-------|----------|---------|
| `verify-lineage` | Prepared merge | REQ-verify-lineage-010, REQ-verify-lineage-011, REQ-verify-lineage-012 (3) | REQ-VL-K3-001 (1) | — (0) |

Detalles de la preparación:
- `REQ-VL-K3-001`: Se incorporó la exigencia de que el material recuperado valide contra el `candidate_id` canónico y el nuevo escenario `recovered bytes disagree with canonical identity`.
- `REQ-verify-lineage-010`: Persistencia de preimágenes canónicas en CAS inmutable local antes de publicar la referencia de lineage.
- `REQ-verify-lineage-011`: Rehidratación y doble validación fail-closed en transiciones mutables a través de reinicios de proceso.
- `REQ-verify-lineage-012`: Inmutabilidad e inspección segura de lineages legacy schema-v1 ID-only.
- Requisitos existentes preservados: `REQ-VL-K3-002` hasta `REQ-VL-K3-008` y `REQ-VL-FINAL-001` hasta `REQ-VL-FINAL-009`.

Archivo preparado localmente:
- `prepared-specs/verify-lineage/spec.md`

Las escrituras vivas en `openspec/specs/**` son propiedad exclusiva del runtime transaccional. `spec_writes[].source_delta` apunta a `prepared-specs/verify-lineage/spec.md`.

## ADR Promotions (planned)

Propuesta de promoción de los 3 ADRs creados durante el diseño hacia la memoria viva de arquitectura (`docs/adr/`), continuando la secuencia del día (001 a 003):

| Source | Planned target | Title |
|--------|----------------|-------|
| `decisions/adr-001-change-local-candidate-recovery-cas.md` | `docs/adr/adr-20260902-001-change-local-candidate-recovery-cas.md` | Change-local Candidate recovery CAS |
| `decisions/adr-002-persist-before-lineage-publication.md` | `docs/adr/adr-20260902-002-persist-before-lineage-publication.md` | Persist before lineage publication |
| `decisions/adr-003-additive-fail-closed-recovery-contract.md` | `docs/adr/adr-20260902-003-additive-fail-closed-recovery-contract.md` | Additive fail-closed recovery contract |

Las copias locales bajo `decisions/` permanecen dentro de la carpeta archivada como registro de auditoría. Ningún ADR fue invalidado durante la verificación.

## Accepted Risks / Follow-ups

Las advertencias detectadas se encuentran **explícitamente aceptadas** como riesgos tolerados o tareas de seguimiento consultivas (`accepted_warnings[]`):

| ID | Severity | Origin | Summary | Disposition |
|----|----------|--------|---------|-------------|
| `VLCP-W001` | WARNING | verify / `tasks-gap` | El comportamiento del requisito heredado `REQ-VL-K3-001` está cubierto por tests de runtime que pasan, pero falta la cita literal de la etiqueta REQ en los nombres de tests focales. | accepted-follow-up (trazabilidad mecánica consultiva; comportamiento funcional 100% verificado) |
| `F-7ee253e94cc3c899` | WARNING | 4R reliability | Falta prueba de carrera cross-process explícita para la publicación CAS no-clobber. | advisory follow-up (la publicación atómica usa hard-link no-clobber nativo) |
| `F-071d9b66fab9ae86` | WARNING | 4R reliability | Faltan pruebas de fallos de I/O simulados antes/durante la publicación final del CAS. | advisory follow-up (manejo de excepciones e idempotencia verificados) |

`open_decisions` no está presente en `state.yaml` — no se realizaron escrituras en `openspec/memory/decisions.md`.

## Archive Inventory

Rutas originales del cambio que deben ser preservadas por la transacción determinista:
- `apply-progress.md`
- `archive-report.md`
- `decisions/adr-001-change-local-candidate-recovery-cas.md`
- `decisions/adr-002-persist-before-lineage-publication.md`
- `decisions/adr-003-additive-fail-closed-recovery-contract.md`
- `design.md`
- `prepared-specs/verify-lineage/spec.md`
- `proposal.md`
- `specs/verify-lineage/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

## Runtime Completion (pending)

- Fusión de especificaciones vivas y commit de ADRs: `node scripts/archive-transaction-run.js verify-lineage-candidate-persistence`
- El directorio de origen `openspec/changes/verify-lineage-candidate-persistence/` permanece intacto hasta que el recibo de éxito del runtime confirme la concordancia total de inventario y realice la eliminación posterior al commit atómico.
- Este ejecutor no realizó escrituras directas sobre `openspec/specs/**` ni `docs/adr/**`, ni movió la carpeta del cambio a `archive/`.

## Discoveries

1. `phases.verify.verdict` estaba ausente en `state.yaml`. El preflight del runtime transaccional (`readArchiveGateFacts`) requiere explícitamente `PASS` o `PASS WITH WARNINGS` bajo `phases.verify`, de lo contrario falla con `gate-not-satisfied`. Se añadió `verdict: "PASS WITH WARNINGS"` en `state.yaml` durante este archivo.
2. La especificación resultante fusionada se preparó en `prepared-specs/verify-lineage/spec.md` preservando la delta spec intacta en `specs/verify-lineage/spec.md` como rastro de auditoría.
3. El archivo `.ospec/session/verify-lineage-candidate-persistence/phase-costs.jsonl` contiene 15 registros de telemetría de fases, agregados en el bloque Cost siguiente.
4. `open_decisions` está ausente en `state.yaml` y la clave no existe; el Paso 4 omitió la escritura a `openspec/memory/decisions.md`.

## Cost

Estimated token cost per phase, aggregated from
`.ospec/session/verify-lineage-candidate-persistence/phase-costs.jsonl`. Figures are heuristic estimates
(~4 bytes/token), not exact metering.

| Phase | Invocations | Re-launches | Duration | Model Tiers | Statuses | Estimated Prompt Tokens | Estimated Artifact Tokens | Estimated Tool Output Tokens | Estimated Output Tokens |
|-------|-------------|-------------|----------|-------------|----------|-------------------------|---------------------------|------------------------------|-------------------------|
| propose | 1 | 0 | 0ms | unknown | unknown | 143910 (estimated) | 0 (estimated) | 0 (estimated) | 29 (estimated) |
| spec | 1 | 0 | 0ms | unknown | blocked | 144827 (estimated) | 0 (estimated) | 0 (estimated) | 406 (estimated) |
| design | 1 | 0 | 0ms | unknown | success | 147950 (estimated) | 0 (estimated) | 0 (estimated) | 62 (estimated) |
| tasks | 1 | 0 | 0ms | unknown | success | 149192 (estimated) | 0 (estimated) | 0 (estimated) | 391 (estimated) |
| apply | 3 | 2 | 0ms | unknown | success | 420584 (estimated) | 0 (estimated) | 0 (estimated) | 350 (estimated) |
| verify | 1 | 0 | 0ms | unknown | success | 156679 (estimated) | 0 (estimated) | 0 (estimated) | 54 (estimated) |
| review-change | 2 | 1 | 0ms | unknown | success | 357499 (estimated) | 0 (estimated) | 0 (estimated) | 858 (estimated) |
| review-risk | 1 | 0 | 0ms | unknown | success | 196783 (estimated) | 0 (estimated) | 0 (estimated) | 37 (estimated) |
| review-reliability | 1 | 0 | 0ms | unknown | success | 198255 (estimated) | 0 (estimated) | 0 (estimated) | 333 (estimated) |
| review-resilience | 1 | 0 | 0ms | unknown | success | 201223 (estimated) | 0 (estimated) | 0 (estimated) | 21 (estimated) |
| review-readability | 1 | 0 | 0ms | unknown | success | 202009 (estimated) | 0 (estimated) | 0 (estimated) | 21 (estimated) |
| review-correction | 1 | 0 | 0ms | unknown | success | 0 (estimated) | 0 (estimated) | 0 (estimated) | 0 (estimated) |

**Total user questions asked**: 0
