# Tasks: K4b Correctness Remediation

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-repair-shadow-001 / topo K6a, sin executorFn | MUST | `orchestrator.js`, `index.test.js` | covered-by-design | Allowlist + firma objeto; espías demuestran no invocación de `executorFn` |
| REQ-repair-shadow-001 / binding inválido halt | MUST | `orchestrator.js`, `index.test.js` | covered-by-design | Fail-closed antes de workspace |
| REQ-repair-shadow-001 / fallo de nodo bloquea downstream | MUST | `orchestrator.js`, `index.test.js` | covered-by-design | Cleanup + N2 no ejecutado |
| REQ-repair-shadow-001 / autoridad no sobreescribible | MUST | `orchestrator.js`, `worker-executor.test.js` | covered-by-design | `UNSAFE_EXECUTOR_OPTION` antes de K6a |
| REQ-repair-shadow-003 / hunks, modos, allowed_paths | MUST | `patch-integrator.js`, `index.test.js` | covered-by-design | Integración incremental por nodo |
| REQ-repair-shadow-003 / freeze único anclado a S0 | MUST | `patch-integrator.js`, `orchestrator.js` | covered-by-design | `candidate.base_tree` = digest original |
| REQ-repair-shadow-006 / siete dimensiones sin omisiones | MUST | `shadow-comparator.js`, `index.test.js` | covered-by-design | `skipped_dimensions` vacío para las 7 |
| REQ-repair-shadow-006 / no mutación producción | MUST | `orchestrator.js`, E2E | covered-by-design | Observador read-only |
| REQ-repair-shadow-008 / propagación material N1→N2 | MUST | `orchestrator.js`, `worker-workspace.js`, `k4b-repair-shadow-e2e.test.js` | covered-by-design | `EffectiveShadowBase` + workspace fresco |
| REQ-repair-shadow-008 / digest derivado determinista | MUST | `orchestrator.js`, `index.test.js` | covered-by-design | `computeTreeDigest` reproducible |
| REQ-repair-shadow-009 / persist repair-shadow-execution/v1 | MUST | `execution-record-store.js`, `index.test.js` | covered-by-design | CAS vía `filesystem-store` |
| REQ-repair-shadow-009 / bindings incompletos fail-closed | MUST | `execution-record-store.js`, `orchestrator.js` | covered-by-design | Sin promoción parcial |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none (`sdd-spec-001` resuelta por allowlist de cinco claves en design)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~950–1150 (12 archivos: 4 lib core, 1 store nuevo, 5 suites test, 2 docs) |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | PR único con `size-exception` aprobada; 4 unidades de apply secuenciales |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Allowlist despacho + materialización `effectiveBase` | PR único (batch 1) | Fundación K6a genérica y helpers de autoridad |
| 2 | Integrador estricto + comparador 7 dimensiones | PR único (batch 2) | Lógica core de parches y telemetría |
| 3 | Orquestador + store v1 + exports | PR único (batch 3) | Propagación material, persistencia CAS |
| 4 | E2E real K6a + docs/ADRs + regresión | PR único (batch 4) | N1 `multiply()` → N2 import; roadmap/ADR |
| 5 | Remediación post-verify (K4B-V001–V003) | PR único (batch 5) | Maturity docs, snapshot no-mutación, evidencia npm test |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Foundation — Allowlist, EffectiveBase y Store Skeleton

- [x] 1.1 RED: en `scripts/lib/repair-shadow/index.test.js`, añadir casos que fallen para cada clave prohibida en `executorOptionsByNode` (`budget`, `workerTransport`, `executorFn`, etc.) esperando `UNSAFE_EXECUTOR_OPTION` [REQ-repair-shadow-001]
- [x] 1.2 GREEN: implementar `pickAllowedNodeExecutionInputs` y `EXECUTE_WORK_ORDER_OPTION_ALLOWLIST` en `scripts/lib/repair-shadow/orchestrator.js`; construir objeto `executeWorkOrder` sin spreads de autoridad [REQ-repair-shadow-001]
- [x] 1.3 RED: en `scripts/lib/worker-executor.test.js`, añadir test que falle cuando K4b intenta pasar opciones no allowlisted vía firma objeto [REQ-repair-shadow-001]
- [x] 1.4 GREEN: verificar en tests que `executorFn` en options nunca se invoca (espía) y que la firma es exclusivamente objeto [REQ-repair-shadow-001]
- [x] 1.5 RED: en `scripts/lib/repair-shadow/index.test.js`, añadir test que falle al materializar con `effectiveBase` cuyo digest no coincide con sus bytes [REQ-repair-shadow-008]
- [x] 1.6 GREEN: extender `scripts/lib/worker-workspace.js` con materialización genérica `{ effectiveBase }` verificando `source_snapshot_id` y recomputando `tree_digest` [REQ-repair-shadow-008]
- [x] 1.7 RED: en `scripts/lib/repair-shadow/index.test.js`, esqueleto de tests para `persistRepairShadowExecution` / `loadRepairShadowExecution` (archivo aún inexistente) [REQ-repair-shadow-009]
- [x] 1.8 GREEN: crear `scripts/lib/repair-shadow/execution-record-store.js` con validación de esquema `repair-shadow-execution/v1` y stubs de persist/load [REQ-repair-shadow-009]

## Phase 2: Core — Integrador Estricto y Comparador Completo

- [x] 2.1 RED: en `scripts/lib/repair-shadow/index.test.js`, casos que fallen por contexto/deletion hunk incorrecto, modo inválido y path fuera de `WorkOrder.allowed_paths` [REQ-repair-shadow-003]
- [x] 2.2 GREEN: endurecer `scripts/lib/repair-shadow/patch-integrator.js` — validar context/deletion/counts/overlaps/modes; containment por WorkOrder; integración incremental [REQ-repair-shadow-003]
- [x] 2.3 RED: test que falle cuando dos WorkResults idénticos salvo modo (`100644` vs `100755`) producen el mismo `CandidateId` [REQ-repair-shadow-003]
- [x] 2.4 GREEN: forward de modos a `freezeCandidate()` y freeze único final con `base_tree` del SourceSnapshot original [REQ-repair-shadow-003]
- [x] 2.5 RED: en `scripts/lib/repair-shadow/index.test.js`, test que falle si `compareShadowExecution` omite `dependencies` u `execution_metrics` cuando están vacíos [REQ-repair-shadow-006]
- [x] 2.6 GREEN: modificar `scripts/lib/repair-shadow/shadow-comparator.js` para evaluar siempre steps, dependencies, diffs, inventory, obligations, invariants y execution metrics [REQ-repair-shadow-006]
- [x] 2.7 REFACTOR: consolidar helpers de digest/`EffectiveShadowBase` compartidos entre integrador y orquestador sin cambiar comportamiento verificado [REQ-repair-shadow-008]

## Phase 3: Orchestration — Propagación Material, Despacho y Persistencia

- [x] 3.1 RED: en `scripts/lib/repair-shadow/index.test.js`, test multi-predecesor que falle si dos diffs incompatibles sobre mismo contexto no abortan integración [REQ-repair-shadow-008]
- [x] 3.2 GREEN: refactorizar `scripts/lib/repair-shadow/orchestrator.js` — eliminar `executorFn` y spreads; topo estable; workspace fresco por nodo; integrar tras cada nodo; conservar bases derivadas [REQ-repair-shadow-001, REQ-repair-shadow-008]
- [x] 3.3 GREEN: derivar `EffectiveShadowBase` determinista desde S0 + cierre transitivo de predecesores; materializar en N2 vía K6a `materializeSourceSnapshot(..., { effectiveBase })` [REQ-repair-shadow-008]
- [x] 3.4 RED: tests de store — CAS divergente, bindings incompletos, reintento idempotente byte-idéntico [REQ-repair-shadow-009]
- [x] 3.5 GREEN: completar `execution-record-store.js` con recomputación CandidateId/GraphId/PolicySnapshotId, CAS en `state.repair_shadow_executions`, consulta defensiva [REQ-repair-shadow-009]
- [x] 3.6 GREEN: cablear persistencia al final de `orchestrateRepairShadow` y exportar APIs en `scripts/lib/repair-shadow/index.js` [REQ-repair-shadow-009]
- [x] 3.7 GREEN: escenarios de fallo de nodo — N2 no ejecutado, workspace disposed, outcome con failed node id [REQ-repair-shadow-001]
- [x] 3.8 GREEN: persistencia `repair-shadow-execution/v1` obligatoria tras freeze+linaje; `options.store` ausente o persist fallido fallan cerrado sin promoción [REQ-repair-shadow-009]

## Phase 4: E2E Real K6a y Regresión de Frontera

- [x] 4.1 RED: reescribir `scripts/k4b-repair-shadow-e2e.test.js` — N1 añade/exporta `multiply()`, N2 importa y ejecuta; debe fallar con mocks actuales [REQ-repair-shadow-008]
- [x] 4.2 GREEN: sustituir mocks por `WorkerTransport` + `WorkerIsolation` reales; verificar `multiply(2,3) === 6` y workspaces distintos/disposed [REQ-repair-shadow-008]
- [x] 4.3 GREEN: reutilizar/exportar fixtures de `scripts/k6a-e2e-worker-isolation.test.js` sin semántica Repair en K6a [REQ-repair-shadow-001]
- [x] 4.4 GREEN: actualizar `scripts/lib/roadmap-boundary.test.js` para conservar guarda K4b → K6a tras extensión genérica de materialización [REQ-repair-shadow-001]
- [x] 4.5 VERIFY: ejecutar `node --test scripts/lib/repair-shadow/index.test.js scripts/lib/worker-executor.test.js scripts/k4b-repair-shadow-e2e.test.js` y luego `npm test` [REQ-repair-shadow-001, REQ-repair-shadow-003, REQ-repair-shadow-006, REQ-repair-shadow-008, REQ-repair-shadow-009]

## Phase 5: Documentación y Cierre de Estado K4b

- [x] 5.1 Actualizar `docs/roadmaps/harness-evolution.md` — K4b permanece no terminado hasta archive de este cambio; K6b bloqueado [REQ-repair-shadow-001]
- [x] 5.2 Actualizar `docs/adr/adr-20260825-006-*.md` y `docs/adr/adr-20260825-007-*.md` — status, numeración y decisiones alineadas con ADRs del change [REQ-repair-shadow-008, REQ-repair-shadow-009]
- [x] 5.3 Promover ADRs locales en `openspec/changes/k4b-correctness-remediation/decisions/` a `accepted` o mover metadatos según convención del repo al archivar [REQ-repair-shadow-008]
- [x] 5.4 Dejar nota en apply-progress: reconciliación de `openspec/specs/repair-shadow-orchestration/spec.md` ocurre en `sdd-archive`, no en apply [REQ-repair-shadow-001, REQ-repair-shadow-003, REQ-repair-shadow-006, REQ-repair-shadow-008, REQ-repair-shadow-009]

## Phase 6: Verify Remediation (K4B-V001–V003)

- [x] 6.1 GREEN: en `scripts/lib/k2a-maturity-docs.test.js`, reemplazar aserción obsoleta `Next eligible: K3` por el contrato vigente de `docs/roadmaps/harness-evolution.md` (K3 `done`, K4b `in-progress`, K6b `blocked` / no next-eligible) [K4B-V001]
- [x] 6.2 VERIFY: ejecutar `npm test`; corregir en `openspec/changes/k4b-correctness-remediation/apply-progress.md` la evidencia de tarea 4.5 con conteos reales (pass/fail/skip) — no afirmar suite verde hasta exit 0 [K4B-V002]
- [x] 6.3 RED: en `scripts/k4b-repair-shadow-e2e.test.js`, añadir test que falle capturando `git rev-parse HEAD`, lista de branches (`git branch -a` o equivalente) y defaults de config relevantes (`openspec/config.yaml` u otros surfaces del spec) inmediatamente antes y después de `orchestrateRepairShadow` [REQ-repair-shadow-006, K4B-V003]
- [x] 6.4 GREEN: implementar helper de snapshot y aserciones byte-identical para HEAD, branches y defaults de configuración alrededor del happy-path E2E existente [REQ-repair-shadow-006]
- [x] 6.5 VERIFY: ejecutar `node --test scripts/k4b-repair-shadow-e2e.test.js` y `npm test` (exit 0); registrar evidencia focal y suite completa en apply-progress [REQ-repair-shadow-006, K4B-V002, K4B-V003]
- [ ] 6.6 MAY (opcional): alinear `docs/architecture/harness-evolution.md` con el roadmap autoritativo (K4b in-progress, K6b blocked, no next-eligible) [K4B-W001]
