# Archive Report: k4b-repair-shadow-execution

**Archive destination (planned)**: `openspec/changes/archive/2026-08-25-k4b-repair-shadow-execution/`
**Verified**: 2026-08-25
**Verify verdict**: PASS (18/18 MUST scenarios; 17 passed / 0 failed, `npm test` 0 regressions)

## Summary

Orquestación de la primera vertical shadow de ejecución para la ruta de Repair en el runtime de OSPEC (`orchestrateRepairShadow`):
- Consumo del `ExecutionGraph` compilado por K4a con validación criptográfica de bindings (`validateExecutionGraphBinding`) y rechazo estricto de grafos cíclicos fail-closed.
- Despacho topológico de órdenes de trabajo (`WorkOrder` v2) a través de workspaces efímeros por nodo gestionados exclusivamente vía primitivas K6a (`createWorkspace`, `materializeSourceSnapshot`, `executeWorkOrder`, `captureWorkResult`, `disposeWorkspace`).
- Puerta estricta de aislamiento verificado (`isolationReported === "enforced"`), rechazando fallbacks no confinados.
- Integración determinista de parches/diffs sobre la base autorizada (`SourceSnapshot`) y congelación de `Candidate` v2 mediante K3 (`freezeCandidate`), manteniendo la separación estricta $WorkResult \neq Candidate$.
- Validación E2E de la cadena de 4 identidades (`SourceSnapshotId` → `WorkOrderId` → `WorkResultId` → `CandidateId`) con recomputación criptográfica de digests.
- Máquina de estados estricta por nodo (`pending` → `in_flight` → `completed` | `failed` | `blocked`) con telemetría estructurada.
- Comparación shadow no mutante frente a baseline de control (`fixed`) evaluando 5 dimensiones (steps, diffs, obligations, invariants, inventory) sin alterar producción.
- Frontera arquitectónica unidireccional K4b → K6a verificada formalmente con test de guard estático.

## Verification Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS |
| CRITICAL issues | None |
| WARNING issues | None |
| Tasks complete | 35/35 |
| Focal Test Suite | 17 passed / 0 failed (`repair-shadow/index.test.js`, `k4b-repair-shadow-e2e.test.js`, `roadmap-boundary.test.js`) |
| K1 Scope Guard | 5 passed / 0 failed (`k1-scope-guard.test.js`) |
| Boundary Guard | PASS (cero referencias a K4b o Repair en módulos K6a) |
| Full Repository Suite (`npm test`) | PASS (0 regressions) |

## Spec Preparation (change-local)

| Domain | Action | Added | Modified | Removed |
|--------|--------|-------|----------|---------|
| `repair-shadow-orchestration` | New spec | REQ-repair-shadow-001, REQ-repair-shadow-002, REQ-repair-shadow-003, REQ-repair-shadow-004, REQ-repair-shadow-005, REQ-repair-shadow-006, REQ-repair-shadow-007 | — | — |

Prepared bytes under `specs/repair-shadow-orchestration/spec.md`. Target is `openspec/specs/repair-shadow-orchestration/spec.md` (nueva capacidad, `target_before_sha256: null`). Las escrituras en `openspec/specs/**` en vivo pertenecen a la transacción de archivo ejecutada por el runtime.

## ADR Promotions (planned)

| Source | Planned target |
|--------|----------------|
| `decisions/adr-001.md` | `docs/adr/adr-20260825-006-topological-dispatch-and-ephemeral-k6a-workspace-lifecycle.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260825-007-workresult-candidate-separation-and-deterministic-patch-integration.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260825-008-non-mutating-shadow-comparator-with-structured-telemetry.md` |
| `decisions/adr-004.md` | `docs/adr/adr-20260825-009-unidirectional-architectural-boundary-k4b-to-k6a.md` |

Las copias locales bajo `decisions/` viajan con el directorio archivado como pista de auditoría.

## Accepted Risks / Follow-ups

None. (35/35 tareas completas, 18/18 escenarios verificados con 0 issues CRITICAL y 0 WARNINGs).

## Archive Inventory

Origin paths preserved by the planned runtime move (excluding `archive-plan.json` from fingerprint):

- `apply-progress.md`
- `archive-report.md`
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `decisions/adr-003.md`
- `decisions/adr-004.md`
- `design.md`
- `proposal.md`
- `specs/repair-shadow-orchestration/spec.md`
- `state.yaml`
- `tasks.md`
- `verify-report.md`

## Runtime Completion (pending)

- Promoción de especificaciones vivas y ADRs: `node scripts/archive-transaction-run.js k4b-repair-shadow-execution`
- El directorio fuente `openspec/changes/k4b-repair-shadow-execution/` permanece intacto hasta que el recibo de éxito del runtime confirme la coincidencia completa y efectúe el borrado atómico.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k4b-repair-shadow-execution/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
