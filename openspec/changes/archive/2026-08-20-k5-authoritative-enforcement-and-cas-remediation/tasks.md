# Tasks: K5 Authoritative Enforcement and CAS Remediation

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| `REQ-failure-recovery-002` / Causal Failure Recovery Transition Matrix | MUST | `scripts/lib/lifecycle-kernel/transition-selector.js`, `scripts/lib/failure-recovery.js`, `scripts/lib/lifecycle-kernel/reducer.js` | covered-by-design | Emite `repair` para `code_defect`, alinea `kind`/`operation`, consolida `escalate` en CAS sin aborto |
| `REQ-failure-recovery-004` / Bounded Scope For Repair Transitions | MUST | `scripts/lib/failure-recovery.js`, `scripts/lib/lifecycle-kernel/index.js` | covered-by-design | `args.scope` obligatorio fail-closed en preflight con 0 llamadas a executor; elimina fallback histórico |
| `REQ-execution-budgets-001` / Uniform Node Execution Budget Quotas | MUST | `scripts/lib/execution-budgets.js`, `scripts/lib/lifecycle-kernel/index.js` | covered-by-design | Evaluación 6 dimensiones de nodo en preflight (`isBudgetExhausted`) con 0 llamadas a executor |
| `REQ-execution-budgets-002` / Authority Effect Budgets | MUST | `scripts/lib/execution-budgets.js`, `scripts/lib/lifecycle-kernel/permits.js`, `scripts/lib/lifecycle-kernel/index.js` | covered-by-design | Evaluación 4 dimensiones de autoridad en preflight y emisión de permisos |
| `REQ-execution-budgets-003` / Strict Budget Monotonicity Across Retries And CAS Conflicts | MUST | `scripts/lib/execution-budgets.js`, `scripts/lib/lifecycle-kernel/index.js`, `scripts/lib/lifecycle-model.js` | covered-by-design | Retención de consumo de efectos tras perder carrera CAS y test concurrente de 2 writers |
| `REQ-execution-budgets-004` / Zero-Delta Attempt Consumption And Monotonic Invariants | MUST | `scripts/lib/execution-budgets.js`, `scripts/lib/lifecycle-kernel/index.js`, `scripts/lib/lifecycle-model.js` | covered-by-design | Deducción dual simultánea de `node.turns` y `authority_budget.effect_attempts` más evento `zero-delta-attempt` |
| `REQ-lifecycle-kernel-runtime-025` / Budget Monotonicity Enforcement In Lifecycle Reducers | MUST | `scripts/lib/lifecycle-kernel/reducer.js`, `scripts/lib/lifecycle-kernel/index.js` | covered-by-design | Reducers no reponen presupuestos; preflight bloquea invocaciones a `effectExecutor` |
| `REQ-lifecycle-kernel-runtime-026` / Causal Failure Priority And Transition Routing | MUST | `scripts/lib/lifecycle-kernel/transition-selector.js`, `scripts/lib/lifecycle-kernel/index.js` | covered-by-design | Prioridad causal determinista, `repair` canónico, `escalate` explícito consolidado en CAS |
| `REQ-lifecycle-kernel-runtime-027` / Zero-Delta Consumption And Honest Terminality | MUST | `scripts/lib/lifecycle-kernel/index.js` | covered-by-design | Deducción dual post-efecto, persistencia durable en journal antes de commit CAS |
| `REQ-lifecycle-model-conformance-011` / Executable K5 Invariants Conformance | MUST | `scripts/lib/lifecycle-model.js`, `scripts/lib/k5-lifecycle-model.test.js` | covered-by-design | 7 checkers ejecutables completos, test de 2 writers en CAS conflict y deducción dual |
| `REQ-operation-permits-005` / Controlled Issuer Issues Permits | MUST | `scripts/lib/lifecycle-kernel/permits.js`, `scripts/lib/lifecycle-kernel/internal/permit-authority.js` | covered-by-design | Verificación `isBudgetExhausted` previa a emisión de permisos para nodo y autoridad |

### Reconciliation Verdict

- MUST coverage: complete (11/11 requirements, 23/23 scenarios covered by design allocation).
- SHOULD/MAY gaps: none.
- Ambiguities to track: none.

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 580 - 880 (diff total estimado) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Transiciones) → PR 2 (Preflight Presupuestos) → PR 3 (Scope Repair) → PR 4 (Zero-Delta) → PR 5 (CAS Monotonicity) → PR 6 (Invariantes & Release) |
| Delivery strategy | ask-on-risk |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Transiciones Canónicas y Consolidación de Escalate en CAS | PR 1 | Base: `feat/k5-authoritative-enforcement`; `transition-selector.js`, `reducer.js`, `failure-recovery.js` |
| 2 | Preflight Exhaustivo de Presupuestos (Nodo 6D y Autoridad 4D) | PR 2 | Base: PR 1; `execution-budgets.js`, `permits.js`, `permit-authority.js`, `index.js` |
| 3 | Repair Scope Obligatorio Fail-Closed con 0 Executor Calls | PR 3 | Base: PR 2; `failure-recovery.js`, `index.js` (eliminación de fallbacks muertos) |
| 4 | Contabilidad Zero-Delta Dual y Evento Durable de Journal | PR 4 | Base: PR 3; `index.js`, deducción `turns` + `effect_attempts` pre-CAS |
| 5 | Preservación de Presupuesto ante CAS Conflict y Test 2-Writers | PR 5 | Base: PR 4; `index.js`, store CAS monotonicity y test concurrente |
| 6 | Verificación de Invariantes K5, Bump de Versión 2.45.9 y Sync | PR 6 | Base: PR 5; `lifecycle-model.js`, `k5-lifecycle-model.test.js`, `package.json`, `config.yaml` |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

---

## Phase 1: Transiciones Canónicas y Consolidación de Escalate en CAS

- [x] 1.1 RED: Crear tests unitarios en `scripts/lib/lifecycle-kernel/transition-selector.test.js` y `scripts/lib/failure-recovery.test.js` para verificar que `code_defect` emite `{ kind: "execute", operation: "repair" }` sin degradar a `recover`, y `ambiguous_effect` emite `{ kind: "escalate", operation: "escalate" }` sin sustituir por `decide` [REQ-failure-recovery-002, REQ-lifecycle-kernel-runtime-026]
- [x] 1.2 RED: Crear test de integración en `scripts/lib/lifecycle-kernel/index.test.js` (o suite equivalente) verificando que la operación `escalate` se consolida y persiste en el Authority Store vía CAS como estado terminal [REQ-failure-recovery-002, REQ-lifecycle-kernel-runtime-026]
- [x] 1.3 GREEN: Modificar `scripts/lib/lifecycle-kernel/transition-selector.js` y `scripts/lib/failure-recovery.js` para emitir explícitamente la taxonomía canónica `{ kind: "execute", operation: "repair" }` ante `code_defect` y `{ kind: "escalate", operation: "escalate" }` ante escalación [REQ-failure-recovery-002, REQ-lifecycle-kernel-runtime-026]
- [x] 1.4 GREEN: Modificar `scripts/lib/lifecycle-kernel/reducer.js` y `scripts/lib/lifecycle-kernel/index.js` para procesar transiciones `escalate` y persistir su commit terminal vía CAS en el Authority Store sin abortos tempranos [REQ-failure-recovery-002, REQ-lifecycle-kernel-runtime-026]
- [x] 1.5 REFACTOR: Limpiar ramas muertas de degradación `repair -> recover` en `scripts/lib/failure-recovery.js` y asegurar consistencia de tipos en transiciones de recuperación [REQ-failure-recovery-002]

---

## Phase 2: Preflight Exhaustivo de Presupuestos de Nodo y Autoridad

- [x] 2.1 RED: Crear tests unitarios en `scripts/lib/execution-budgets.test.js` y `scripts/lib/lifecycle-kernel/permits.test.js` para verificar preflight exhaustivo en las 6 dimensiones de nodo (`turns`, `patches`, `commands`, `wall_time_minutes`, `changed_lines`, `allowed_paths`) y 4 de autoridad (`effect_attempts`, `authority_mutations`, `evidence_runs`, `review_sweeps`) [REQ-execution-budgets-001, REQ-execution-budgets-002, REQ-operation-permits-005]
- [x] 2.2 RED: Crear test en `scripts/lib/lifecycle-kernel/index.test.js` verificando que `runKernelOperation` rechaza con `budget-exhausted` y realiza exactamente 0 llamadas a `effectExecutor` cuando cualquier dimensión de presupuesto está agotada [REQ-execution-budgets-001, REQ-execution-budgets-002, REQ-lifecycle-kernel-runtime-025]
- [x] 2.3 GREEN: Implementar en `scripts/lib/execution-budgets.js` el helper unificado `isBudgetExhausted(budget, consumed, options)` cubriendo las 6 dimensiones de nodo y 4 de autoridad con detección de violaciones de cuota [REQ-execution-budgets-001, REQ-execution-budgets-002]
- [x] 2.4 GREEN: Integrar `isBudgetExhausted()` en preflight de `scripts/lib/lifecycle-kernel/permits.js` y `scripts/lib/lifecycle-kernel/internal/permit-authority.js` para denegar permisos ante cuotas agotadas [REQ-operation-permits-005, REQ-execution-budgets-002]
- [x] 2.5 GREEN: Integrar chequeo preflight de `isBudgetExhausted()` en `scripts/lib/lifecycle-kernel/index.js` antes del despacho a `effectExecutor` asegurando 0 llamadas a efectos y retorno de `blockedResult` [REQ-execution-budgets-001, REQ-execution-budgets-002, REQ-lifecycle-kernel-runtime-025]
- [x] 2.6 REFACTOR: Consolidar mapeo de errores de preflight presupuestario y validar poda de transiciones en `scripts/lib/lifecycle-kernel/transition-selector.js` ante autoridad agotada [REQ-execution-budgets-002, REQ-lifecycle-kernel-runtime-025]

---

## Phase 3: Repair Scope Obligatorio Fail-Closed

- [x] 3.1 RED: Crear tests unitarios en `scripts/lib/failure-recovery.test.js` para `validateRepairScope` validando rechazo fail-closed ante `scope` ausente, nulo, vacío o mutaciones fuera de `allowed_paths`/`node_ids` [REQ-failure-recovery-004]
- [x] 3.2 RED: Crear test de integración en `scripts/lib/lifecycle-kernel/index.test.js` verificando que `operation: "repair"` sin `args.scope` (o con scope inválido) retorna `repair-scope-violation` y ejecuta exactamente 0 llamadas a `effectExecutor` sin consultar fallbacks de payloads históricos [REQ-failure-recovery-004, REQ-lifecycle-kernel-runtime-026]
- [x] 3.3 GREEN: Modificar `scripts/lib/failure-recovery.js` para endurecer `validateRepairScope` requiriendo estructura explícita `{ node_ids, allowed_paths, finding_ids }` y fallando cerrado ante cualquier omisión [REQ-failure-recovery-004]
- [x] 3.4 GREEN: Modificar `scripts/lib/lifecycle-kernel/index.js` en preflight de `runKernelOperation` para exigir `args.scope` en `repair`, eliminar el fallback `effectRecords[0]?.payload?.scope` y abortar con `repair-scope-violation` antes de invocar `effectExecutor` [REQ-failure-recovery-004, REQ-lifecycle-kernel-runtime-026]
- [x] 3.5 REFACTOR: Eliminar código y referencias obsoletas de inferencia de scope de efectos pasados en `scripts/lib/lifecycle-kernel/index.js` y `scripts/lib/failure-recovery.js` [REQ-failure-recovery-004]

---

## Phase 4: Contabilidad Zero-Delta Dual y Evento Durable

- [x] 4.1 RED: Crear test en `scripts/lib/lifecycle-kernel/index.test.js` y `scripts/lib/execution-budgets.test.js` para verificar que una mutación de efecto que produce zero-delta decrementa simultáneamente `node.turns` y `authority_budget.effect_attempts` y registra el evento `zero-delta-attempt` en el journal durable antes del commit CAS [REQ-execution-budgets-004, REQ-lifecycle-kernel-runtime-027]
- [x] 4.2 RED: Crear test verificando que inspecciones de solo lectura no son penalizadas como zero-delta [REQ-execution-budgets-004]
- [x] 4.3 GREEN: Implementar en `scripts/lib/execution-budgets.js` la lógica de deducción dual monotónica para mutaciones zero-delta [REQ-execution-budgets-004]
- [x] 4.4 GREEN: Integrar en `scripts/lib/lifecycle-kernel/index.js` la detección post-efecto de zero-delta, el decremento simultáneo en nodo (`turns`) y autoridad (`effect_attempts`), y la emisión del evento durable `zero-delta-attempt` en el journal antes del CAS commit [REQ-execution-budgets-004, REQ-lifecycle-kernel-runtime-027]
- [x] 4.5 REFACTOR: Verificar aislamiento entre métricas de telemetría y estado autoritativo durante la contabilidad zero-delta [REQ-lifecycle-kernel-runtime-027]

---

## Phase 5: Preservación de Presupuesto ante CAS Conflict y Test Concurrente de 2 Writers

- [x] 5.1 RED: Crear test unitario en `scripts/lib/execution-budgets.test.js` verificando que la reconciliación tras un CAS conflict retiene los turnos e intentos consumidos por efectos ejecutados sin reiniciarlos a la cuota inicial [REQ-execution-budgets-003, REQ-lifecycle-kernel-runtime-025]
- [x] 5.2 RED: Crear test concurrente en `scripts/lib/lifecycle-model.js` / `scripts/lib/k5-lifecycle-model.test.js` con 2 writers concurrentes (W1 y W2) compitiendo por la misma revisión head R0, donde W1 gana el CAS (R1) y W2 pierde, verificando que W2 al reintentar contra R1 conserva el presupuesto consumido por su efecto previo [REQ-execution-budgets-003, REQ-lifecycle-model-conformance-011]
- [x] 5.3 GREEN: Ajustar en `scripts/lib/lifecycle-kernel/index.js` la persistencia de cuotas consumidas previo a la resolución CAS para asegurar que reintentos o fallos CAS no restablezcan el presupuesto consumido [REQ-execution-budgets-003, REQ-lifecycle-kernel-runtime-025]
- [x] 5.4 GREEN: Implementar en `scripts/lib/lifecycle-model.js` el checker de concurrencia multi-writer para `inv-k5-budget-monotonicity` ejecutando el escenario determinista de 2 writers con CAS race [REQ-execution-budgets-003, REQ-lifecycle-model-conformance-011]
- [x] 5.5 REFACTOR: Asegurar que el Authority Store en memoria y los adaptadores CAS manejen de forma determinista el código de conflicto `cas-conflict` sin leaks de estado entre instancias de runtime [REQ-execution-budgets-003]

---

## Phase 6: Actualización de Invariantes K5, Versión 2.45.9 y Sincronización de Specs

- [x] 6.1 RED: Ejecutar suite `scripts/lib/k5-lifecycle-model.test.js` y verificar fallos en checkers desactualizados (`inv-k5-budget-monotonicity`, `inv-k5-zero-delta-consumption`, `inv-k5-budget-exhaustion-terminal`, `inv-k5-allowlist-enforcement`) [REQ-lifecycle-model-conformance-011]
- [x] 6.2 GREEN: Actualizar los 7 checkers ejecutables de K5 en `scripts/lib/lifecycle-model.js` alineándolos con los 5 blockers remediados y la composición completa del runtime CAS [REQ-lifecycle-model-conformance-011]
- [x] 6.3 GREEN: Actualizar assertions y fixtures en `scripts/lib/k5-lifecycle-model.test.js`, `scripts/lib/causal-failure.test.js`, `scripts/lib/k5-budgets-failures-recovery.test.js` y `scripts/lib/transition-parity.test.js` para pasar al 100% [REQ-lifecycle-model-conformance-011]
- [x] 6.4 GREEN: Actualizar la versión a `2.45.9` en `package.json` y `openspec/config.yaml` [REQ-lifecycle-model-conformance-011]
- [x] 6.5 REFACTOR: Ejecutar `npm test` completo para confirmar cero regresiones en toda la suite del proyecto [REQ-lifecycle-model-conformance-011]

