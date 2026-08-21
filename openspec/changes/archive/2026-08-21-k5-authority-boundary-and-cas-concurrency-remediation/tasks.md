# Tasks: K5 Authority Boundary and CAS Concurrency Remediation

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| `REQ-operation-permits-005` / Controlled Issuer Issues Permits | MUST | `scripts/lib/lifecycle-kernel/index.js`, `permits.js`, `issuePermitForSelectedTransition` | covered-by-design | Consulta Authority Store (`expected_revision`), evalúa `isBudgetExhausted()` y `validateRecoveryTransition()` fail-closed. |
| `REQ-operation-permits-005` / Scenario: Issuer produces permit when store head, budget, allowlist pass | MUST | `scripts/lib/lifecycle-kernel/index.js`, `permits.js` | covered-by-design | Emite `OperationPermit` autoritativo enlazado a la revisión esperada confirmada. |
| `REQ-operation-permits-005` / Scenario: State-valid offer alone does not issue | MUST | `scripts/lib/lifecycle-kernel/permits.js` | covered-by-design | Requiere decisión vinculante (`PolicyDecision`, `HumanDecision`, o `KernelRule`). |
| `REQ-operation-permits-005` / Scenario: Issuer refuses permit when budget exhausted | MUST | `scripts/lib/lifecycle-kernel/index.js`, `permits.js` | covered-by-design | Falla closed con código `budget-exhausted` ante agotamiento en store. |
| `REQ-operation-permits-005` / Scenario: Issuer refuses permit on revision mismatch or causal violation | MUST | `scripts/lib/lifecycle-kernel/index.js` | covered-by-design | Falla closed con `stale-revision` o `unallowlisted-recovery-transition`. |
| `REQ-lifecycle-kernel-runtime-025` / Budget Monotonicity Enforcement In Lifecycle Reducers | MUST | `scripts/lib/lifecycle-kernel/index.js`, `reducer.js` | covered-by-design | Preservación presupuestaria monótona y preflight exhaustion bypass para transiciones terminales. |
| `REQ-lifecycle-kernel-runtime-025` / Scenario: Reducer decrements budget monotonically across retries | MUST | `scripts/lib/lifecycle-kernel/reducer.js` | covered-by-design | Cuotas de nodo y autoridad no se restauran ni reponen silenciosamente. |
| `REQ-lifecycle-kernel-runtime-025` / Scenario: CAS reconciliation applies runtime-owned carry-over | MUST | `scripts/lib/lifecycle-kernel/index.js` (`createKernelRuntime`) | covered-by-design | Tracking de carry-over en memoria del runtime tras `cas-conflict` sin argumentos fabricados. |
| `REQ-lifecycle-kernel-runtime-025` / Scenario: Preflight budget exhaustion halts non-terminal ops | MUST | `scripts/lib/lifecycle-kernel/index.js` (`runKernelOperation`) | covered-by-design | Falla closed en preflight con exactamente 0 invocaciones a `effectExecutor`. |
| `REQ-lifecycle-kernel-runtime-025` / Scenario: Terminal control transitions execute and commit via CAS | MUST | `scripts/lib/lifecycle-kernel/index.js` (`runKernelOperation`) | covered-by-design | Bypass de preflight para `escalate` y `stop`, permitiendo consolidación y commit CAS terminal. |
| `REQ-lifecycle-kernel-runtime-025` / Scenario: Reducer marks node exhausted when isBudgetExhausted triggers | MUST | `scripts/lib/lifecycle-kernel/reducer.js` | covered-by-design | Marca `node.exhausted = true` bloqueando subsiguientes operaciones normales. |
| `REQ-lifecycle-kernel-runtime-026` / Causal Failure Priority And Transition Routing | MUST | `scripts/lib/lifecycle-kernel/operations.js`, `index.js`, `transition-selector.js` | covered-by-design | Precedencia determinista, validación causal en boundary y persistencia CAS terminal. |
| `REQ-lifecycle-kernel-runtime-026` / Scenario: Code defect emits canonical repair transition | MUST | `scripts/lib/lifecycle-kernel/transition-selector.js` | covered-by-design | Emite `{ kind: "execute", operation: "repair" }` sin degradar a `recover`. |
| `REQ-lifecycle-kernel-runtime-026` / Scenario: Environment fault takes precedence in selection | MUST | `scripts/lib/lifecycle-kernel/recovery.js`, `transition-selector.js` | covered-by-design | Resuelve a `environment_tooling` y ofrece `replan` o `escalate`. |
| `REQ-lifecycle-kernel-runtime-026` / Scenario: Repair operation without args.scope fails closed | MUST | `scripts/lib/lifecycle-kernel/index.js` | covered-by-design | Falla closed con `repair-scope-violation` y 0 llamadas a `effectExecutor`. |
| `REQ-lifecycle-kernel-runtime-026` / Scenario: Boundary validation rejects unallowlisted recovery ops | MUST | `scripts/lib/lifecycle-kernel/operations.js`, `index.js` | covered-by-design | `validateOperationTransition` invoca `validateRecoveryTransition` fail-closed. |
| `REQ-lifecycle-kernel-runtime-026` / Scenario: Selector emits explicit escalate without decide fallback | MUST | `scripts/lib/lifecycle-kernel/transition-selector.js` | covered-by-design | Emite `{ kind: "escalate", operation: "escalate" }` canónicamente. |
| `REQ-lifecycle-kernel-runtime-026` / Scenario: Escalate and stop commit consolidated terminal via CAS | MUST | `scripts/lib/lifecycle-kernel/index.js` | covered-by-design | Ejecuta commit CAS durable en Authority Store para transiciones terminales. |
| `REQ-lifecycle-kernel-runtime-027` / Zero-Delta Consumption And Honest Terminality | MUST | `scripts/lib/lifecycle-kernel/index.js`, `reducer.js` | covered-by-design | Zero-delta acotado a mutaciones sin avance (`reduced.outcome === "unchanged"`). |
| `REQ-lifecycle-kernel-runtime-027` / Scenario: Zero-delta effect mutation decrements turns and attempts | MUST | `scripts/lib/lifecycle-kernel/index.js` | covered-by-design | Descuento dual (`turns` + `effect_attempts`) y evento `zero-delta-attempt` en journal. |
| `REQ-lifecycle-kernel-runtime-027` / Scenario: Lifecycle advance without file changes not penalized | MUST | `scripts/lib/lifecycle-kernel/index.js` | covered-by-design | Omite penalización zero-delta cuando `reduced.outcome !== "unchanged"`. |
| `REQ-lifecycle-kernel-runtime-027` / Scenario: Read-only diagnostics and control not penalized | MUST | `scripts/lib/lifecycle-kernel/index.js` | covered-by-design | Operaciones de control e inspección quedan totalmente exentas de zero-delta. |
| `REQ-lifecycle-kernel-runtime-027` / Scenario: Budget exhaustion blocks execution transitions | MUST | `scripts/lib/lifecycle-kernel/transition-selector.js` | covered-by-design | Ofrece únicamente `escalate` o `stop` ante cuotas agotadas. |
| `REQ-failure-recovery-002` / Causal Failure Recovery Transition Matrix | MUST | `scripts/lib/lifecycle-kernel/operations.js`, `index.js`, `recovery.js` | covered-by-design | Mapeo determinista contra la matriz de transiciones de recuperación permitidas. |
| `REQ-failure-recovery-002` / Scenario: Code defect routes to repair without degrading | MUST | `scripts/lib/lifecycle-kernel/transition-selector.js` | covered-by-design | Preserva semántica canónica de reparación de código. |
| `REQ-failure-recovery-002` / Scenario: Explicit escalate emitted for ambiguous effect | MUST | `scripts/lib/lifecycle-kernel/transition-selector.js` | covered-by-design | Bloquea reparación a ciegas y emite `escalate` o `stop`. |
| `REQ-failure-recovery-002` / Scenario: Escalate and stop consolidate and commit via CAS | MUST | `scripts/lib/lifecycle-kernel/index.js` | covered-by-design | Persistencia CAS terminal garantizada bajo presupuestos agotados. |
| `REQ-failure-recovery-002` / Scenario: Boundary validation rejects unallowlisted transitions | MUST | `scripts/lib/lifecycle-kernel/operations.js`, `index.js` | covered-by-design | Falla closed con 0 ejecuciones de efectos ante transiciones no permitidas. |
| `REQ-failure-recovery-002` / Scenario: Environment fault routes to replan or escalate | MUST | `scripts/lib/lifecycle-kernel/transition-selector.js` | covered-by-design | Evita culpar a código por errores de herramientas o infraestructura. |
| `REQ-failure-recovery-003` / Allowlisted Recovery Transition Matrix | MUST | `scripts/lib/lifecycle-kernel/operations.js`, `index.js`, `permits.js` | covered-by-design | Enforcement consistente a lo largo de selector, issuer de permisos y boundary de ejecución. |
| `REQ-failure-recovery-003` / Scenario: Code defect routes to repair when budget allows | MUST | `scripts/lib/lifecycle-kernel/transition-selector.js` | covered-by-design | Ofrece `repair` cuando restan `effect_attempts > 0`. |
| `REQ-failure-recovery-003` / Scenario: Ambiguous effect rejects blind repair | MUST | `scripts/lib/lifecycle-kernel/operations.js`, `index.js`, `permits.js` | covered-by-design | Rechaza `repair` en selector, emisión de permits y runtime. |
| `REQ-failure-recovery-003` / Scenario: Kernel boundary rejects unallowlisted transition | MUST | `scripts/lib/lifecycle-kernel/operations.js`, `index.js` | covered-by-design | Bloquea llamadas directas que eludan el selector. |
| `REQ-failure-recovery-003` / Scenario: Terminal control transitions are universally allowlisted | MUST | `scripts/lib/lifecycle-kernel/recovery.js`, `operations.js` | covered-by-design | `escalate` y `stop` siempre permitidas para cualquier categoría de fallo. |
| `REQ-execution-budgets-003` / Strict Budget Monotonicity Across Retries And CAS Conflicts | MUST | `scripts/lib/lifecycle-kernel/index.js`, `scripts/lib/lifecycle-model.js` | covered-by-design | Monotonicidad estricta y carry-over de presupuestos gestionado 100% por el runtime. |
| `REQ-execution-budgets-003` / Scenario: CAS conflict reconciliation preserves consumed budget | MUST | `scripts/lib/lifecycle-kernel/index.js` | covered-by-design | Preserva cuotas consumidas tras `cas-conflict` y las deduce en reintentos. |
| `REQ-execution-budgets-003` / Scenario: Concurrent multi-writer CAS preserves consumed attempt | MUST | `scripts/lib/lifecycle-kernel/index.js`, `scripts/lib/lifecycle-model.js` | covered-by-design | Writer perdedor retiene consumo al resincronizar contra el head ganador. |
| `REQ-execution-budgets-003` / Scenario: Retry in repair loop decrements attempt budget | MUST | `scripts/lib/lifecycle-kernel/reducer.js` | covered-by-design | Descuento monótono de intentos sin reposición implícita. |
| `REQ-execution-budgets-004` / Zero-Delta Attempt Consumption And Monotonic Invariants | MUST | `scripts/lib/lifecycle-kernel/index.js`, `reducer.js` | covered-by-design | Zero-delta acotado a mutaciones efectivas sin avance semántico. |
| `REQ-execution-budgets-004` / Scenario: Zero-delta patch consumes dual turns and attempts | MUST | `scripts/lib/lifecycle-kernel/index.js` | covered-by-design | Descuenta `turns` y `effect_attempts` registrando evento en journal antes de CAS. |
| `REQ-execution-budgets-004` / Scenario: Lifecycle progress without file mod does not consume | MUST | `scripts/lib/lifecycle-kernel/index.js` | covered-by-design | No penaliza transiciones de estado válidas con 0 cambios en disco. |
| `REQ-execution-budgets-004` / Scenario: Read-only inspection does not consume zero-delta | MUST | `scripts/lib/lifecycle-kernel/index.js` | covered-by-design | Acciones de inspección o diagnóstico quedan exentas de consumo zero-delta. |
| `REQ-execution-budgets-004` / Scenario: Zero-delta consumption persists across CAS race | MUST | `scripts/lib/lifecycle-kernel/index.js` | covered-by-design | Preserva la deducción zero-delta en el carry-over ante conflicto CAS. |
| `REQ-lifecycle-model-conformance-011` / Executable K5 Budget Monotonicity And Causal Invariants | MUST | `scripts/lib/lifecycle-model.js` | covered-by-design | Chequeo ejecutable de los 7 invariantes K5 con composición real de runtime y CAS. |
| `REQ-lifecycle-model-conformance-011` / Scenario: Every K5 invariant has executable checker | MUST | `scripts/lib/lifecycle-model.js` | covered-by-design | Los 7 checkers verifican composición integral sin stubs. |
| `REQ-lifecycle-model-conformance-011` / Scenario: Budget monotonicity verified across 2-writer race | MUST | `scripts/lib/lifecycle-model.js` | covered-by-design | Invariante `inv-k5-budget-monotonicity` ejecuta carrera concurrente real con 2 writers. |
| `REQ-lifecycle-model-conformance-011` / Scenario: Zero-delta checker verifies dual decrement | MUST | `scripts/lib/lifecycle-model.js` | covered-by-design | Invariante `inv-k5-zero-delta-consumption` valida mutaciones sin avance vs avances de estado. |
| `REQ-lifecycle-model-conformance-011` / Scenario: Causal priority resolver prevents code blame | MUST | `scripts/lib/lifecycle-model.js` | covered-by-design | Invariante `inv-k5-causal-priority` valida resolución de fallos mixtos. |
| `REQ-lifecycle-model-conformance-011` / Scenario: Exhausted budget halts non-terminal, allows terminal | MUST | `scripts/lib/lifecycle-model.js` | covered-by-design | Invariante `inv-k5-budget-exhaustion-terminal` valida preflight halt y commit CAS terminal. |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~360-440 lines (across runtime, tests, model & ADRs) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single coherent remediation batch (atomic integrity across runtime + model invariants) |
| Delivery strategy | ask-on-risk |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Remediation completa de boundary autoritativo K5, transiciones terminales CAS, carry-over runtime-owned, zero-delta acotado y promoción de ADRs | PR 1 | Base branch: `main` (o feature branch `feat/k5-authority-boundary-and-cas-concurrency-remediation`). Mantiene integridad atómica de invariantes de modelo y kernel runtime. |

---

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

---

## Phase 1: Controlled Issuer Autoritativo con Store Query y Preflight Causal (`REQ-operation-permits-005`, `REQ-failure-recovery-003`)

- [x] 1.1 RED: Crear tests unitarios en `scripts/lib/lifecycle-kernel/permits.test.js` que verifiquen que `createKernelRuntime().issuePermitForSelectedTransition()` consulta el snapshot autoritativo de `AuthorityStore`, rechaza con `stale-revision` ante discrepancia de revisión, rechaza con `budget-exhausted` cuando el store reporta cuotas de nodo o autoridad agotadas, y rechaza con `unallowlisted-recovery-transition` ante violaciones de la matriz causal. [REQ-operation-permits-005, REQ-failure-recovery-003]
- [x] 1.2 GREEN: Implementar en `scripts/lib/lifecycle-kernel/index.js` y `scripts/lib/lifecycle-kernel/permits.js` la consulta a `store.snapshot(subject_id)` / `store.load(subject_id)`, validación de `expected_revision === currentRevision`, evaluación de `isBudgetExhausted()` sobre el snapshot del store y validación fail-closed de `validateRecoveryTransition()` antes de delegar en `issueOperationPermit()`. [REQ-operation-permits-005, REQ-failure-recovery-003]
- [x] 1.3 REFACTOR: Refactorizar helpers de emisión de permisos en `scripts/lib/lifecycle-kernel/permits.js` y normalizar la firma de `issuePermitForSelectedTransition` preservando fallback a estado inyectado en tests aislados. [REQ-operation-permits-005]

---

## Phase 2: Distinción y Commit CAS de Operaciones Terminales bajo Agotamiento Presupuestario (`REQ-lifecycle-kernel-runtime-025`, `REQ-lifecycle-kernel-runtime-026`, `REQ-failure-recovery-002`)

- [x] 2.1 RED: Crear tests de integración en `scripts/lib/lifecycle-kernel/index.test.js` que verifiquen que `runKernelOperation()` permite la ejecución y consolidación de transiciones terminales de control (`escalate`, `stop`) persistiendo su commit CAS durable en el Authority Store aun cuando `isBudgetExhausted()` sea `true`, mientras que cualquier operación no terminal falla en preflight con exactamente 0 llamadas a `effectExecutor`. [REQ-lifecycle-kernel-runtime-025, REQ-lifecycle-kernel-runtime-026, REQ-failure-recovery-002]
- [x] 2.2 GREEN: Modificar `runKernelOperation()` en `scripts/lib/lifecycle-kernel/index.js` para discriminar operaciones terminales (`operation === "escalate" || operation === "stop"`) del bloqueo preflight de agotamiento de presupuesto, permitiendo que el reducer genere el estado terminal consolidado y se ejecute `compareAndSwap` en el Authority Store. [REQ-lifecycle-kernel-runtime-025, REQ-lifecycle-kernel-runtime-026, REQ-failure-recovery-002]
- [x] 2.3 REFACTOR: Limpiar el flujo de control del preflight de presupuestos en `scripts/lib/lifecycle-kernel/index.js` asegurando que la discriminación de operaciones terminales sea unívoca y centralizada. [REQ-lifecycle-kernel-runtime-025]

---

## Phase 3: Enforcement Causal en Boundary Autoritativo (`REQ-failure-recovery-002`, `REQ-failure-recovery-003`, `REQ-lifecycle-kernel-runtime-026`)

- [x] 3.1 RED: Crear tests unitarios en `scripts/lib/lifecycle-kernel/operations.test.js` e `index.test.js` que verifiquen que `validateOperationTransition()` y el preflight de `runKernelOperation()` invocan `validateRecoveryTransition(primaryFailure.category, operation)` y fallan closed ante transiciones no allowlisteadas (ej. `repair` ante `ambiguous_effect` o `validation_gap`), asegurando 0 llamadas a `effectExecutor`. [REQ-failure-recovery-002, REQ-failure-recovery-003, REQ-lifecycle-kernel-runtime-026]
- [x] 3.2 GREEN: Integrar `validateRecoveryTransition(primaryFailure.category, operation)` dentro de `validateOperationTransition()` en `scripts/lib/lifecycle-kernel/operations.js` y en la validación preflight de `runKernelOperation()` en `scripts/lib/lifecycle-kernel/index.js`. [REQ-failure-recovery-002, REQ-failure-recovery-003, REQ-lifecycle-kernel-runtime-026]
- [x] 3.3 REFACTOR: Unificar la extracción jerárquica de fallo primario (`node.failure || args.failure || state.failure`) y los códigos de error unificados en `operations.js` e `index.js`. [REQ-failure-recovery-003, REQ-lifecycle-kernel-runtime-026]

---

## Phase 4: Carry-Over Presupuestario y Monotonicidad CAS Runtime-Owned (`REQ-execution-budgets-003`, `REQ-lifecycle-kernel-runtime-025`, `REQ-lifecycle-model-conformance-011`)

- [x] 4.1 RED: Crear test de concurrencia en `scripts/lib/lifecycle-kernel/index.test.js` y actualizar el checker `inv-k5-budget-monotonicity` en `scripts/lib/lifecycle-model.js` para ejecutar una carrera real de 2 writers concurrentes vía `Promise.all` contra la revisión inicial `R0`, verificando que el writer perdedor de CAS (`cas-conflict`) tras ejecutar efectos preserva el consumo de turnos/intentos y lo deduce automáticamente en el reintento sobre `R1` sin requerir argumentos fabricados (`args.consumed`). [REQ-execution-budgets-003, REQ-lifecycle-kernel-runtime-025, REQ-lifecycle-model-conformance-011]
- [x] 4.2 GREEN: Implementar la retención y aplicación de carry-over en `createKernelRuntime()` y `runKernelOperation()` en `scripts/lib/lifecycle-kernel/index.js`, acumulando cuotas consumidas por efectos en `pendingCarryOver` tras `cas-conflict` y deduciéndolas monótonamente en el siguiente intento sobre el nuevo head; actualizar `checkK5BudgetMonotonicity()` en `scripts/lib/lifecycle-model.js`. [REQ-execution-budgets-003, REQ-lifecycle-kernel-runtime-025, REQ-lifecycle-model-conformance-011]
- [x] 4.3 REFACTOR: Modularizar `mergeConsumed()` y la limpieza del mapa de carry-over tras commits exitosos en `scripts/lib/lifecycle-kernel/index.js`. [REQ-execution-budgets-003, REQ-lifecycle-kernel-runtime-025]

---

## Phase 5: Refinamiento Semántico de Zero-Delta Bounded a Mutaciones de Código (`REQ-execution-budgets-004`, `REQ-lifecycle-kernel-runtime-027`, `REQ-lifecycle-model-conformance-011`)

- [x] 5.1 RED: Crear tests en `scripts/lib/lifecycle-kernel/index.test.js` y `scripts/lib/lifecycle-model.js` verificando que las mutaciones effect-bearing de código sin avance semántico (`reduced.outcome === "unchanged"` con 0 archivos modificados) aplican descuento dual (`node.turns` + `authority_budget.effect_attempts`) y registran un evento durable `zero-delta-attempt` en el journal antes del commit CAS, mientras que transiciones válidas de ciclo de vida con avance (`reduced.outcome !== "unchanged"`), operaciones de control terminal (`escalate`, `stop`) y diagnósticos de lectura quedan exentos de penalización zero-delta. [REQ-execution-budgets-004, REQ-lifecycle-kernel-runtime-027, REQ-lifecycle-model-conformance-011]
- [x] 5.2 GREEN: Modificar la detección post-effect de zero-delta en `scripts/lib/lifecycle-kernel/index.js` y `scripts/lib/lifecycle-kernel/reducer.js` para exigir `reduced.outcome === "unchanged"` junto con 0 archivos modificados para mutaciones de código, persistir el evento en journal y actualizar `checkK5ZeroDeltaConsumption()` en `scripts/lib/lifecycle-model.js`. [REQ-execution-budgets-004, REQ-lifecycle-kernel-runtime-027, REQ-lifecycle-model-conformance-011]
- [x] 5.3 REFACTOR: Consolidar predicados y constantes de zero-delta en `scripts/lib/lifecycle-kernel/index.js` y `reducer.js`. [REQ-execution-budgets-004, REQ-lifecycle-kernel-runtime-027]

---

## Phase 6: Promoción Formal de ADRs y Verificación Global (`REQ-lifecycle-model-conformance-011`)

- [x] 6.1 RED: Crear test estático en `scripts/lib/lifecycle-kernel/index.test.js` que verifique que `docs/adr/adr-20260820-007` a `011` tienen `Status: accepted` y que las decisiones locales en `decisions/adr-001.md` a `adr-005.md` están sincronizadas. [REQ-lifecycle-model-conformance-011]
- [x] 6.2 GREEN: Actualizar el encabezado a `Status: accepted` en `docs/adr/adr-20260820-007-canonical-recovery-transitions.md`, `docs/adr/adr-20260820-008-exhaustive-budget-preflight.md`, `docs/adr/adr-20260820-009-mandatory-repair-scope-preflight.md`, `docs/adr/adr-20260820-010-dual-zero-delta-accounting-and-journaling.md` y `docs/adr/adr-20260820-011-cas-conflict-budget-preservation.md`. [REQ-lifecycle-model-conformance-011]
- [x] 6.3 REFACTOR: Ejecutar la suite completa de pruebas unitarias y de modelo (`npm test`) para validar que el 100% de los tests pasan limpiamente con 0 advertencias y total conformidad de los 7 invariantes K5. [REQ-lifecycle-model-conformance-011]
