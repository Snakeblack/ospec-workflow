# Apply Progress: K5 Core Technical Remediation

## Executive Summary
- **Change**: `k5-core-remediation`
- **Branch**: `feat/k5-core-remediation` ("Working on branch `feat/k5-core-remediation`")
- **TDD Workflow**: RED -> GREEN -> REFACTOR aplicado estrictamente en las 5 fases y 17 tareas.
- **Test Suite Results**: 2396 tests ejecutados, 2389 pasados, 0 fallos, 0 cancelados, 2 omitidos, duración ~45s con 100% de éxito en `npm test`.

---

## Completed Phases & Tasks

### Phase 1: Taxonomy Fail-Closed & Store Concurrency Isolation (Areas 7 & 5)
- **1.1 [RED]**: Unit test en `scripts/lib/causal-failure.test.js` verificando que `mapLegacyRoutingTag()` mapea tags desconocidos a `validation_gap` (`UNKNOWN_ROUTING_TAG`) prohibiendo `repair`.
- **1.2 [GREEN]**: Modificado el default de `mapLegacyRoutingTag()` en `scripts/lib/causal-failure.js` a `CAUSAL_CATEGORIES.VALIDATION_GAP` y `UNKNOWN_ROUTING_TAG`.
- **1.3 [REFACTOR]**: Limpieza de constantes exportadas y documentación en `scripts/lib/causal-failure.js`.
- **1.4 [RED]**: Test en `scripts/lib/authority-store/index.test.js` verificando aislamiento de tickets `midOpTicket` entre escritores concurrentes en `commitJournal()`.
- **1.5 [GREEN]**: Refactorizado `scripts/lib/authority-store/index.js` reemplazando el campo escalar `midOpTicket` por `midOpTickets = new Map()` en `ensureSubject`, guardando `token`, `fromRevision`, `stateDigest` y `journalDigest`, y validando/eliminando selectivamente el ticket ganador en `compareAndSwapLocked`.
- **1.6 [REFACTOR]**: Consolidada la gestión de baseline digests y limpieza de tickets obsoletos al avanzar revisiones con mutación de estado.

### Phase 2: Authoritative Controlled Permit Issuer & Unified Causal Resolution (Areas 6 & 4)
- **2.1 [RED]**: Unit tests en `scripts/lib/lifecycle-kernel/index.test.js` verificando que `issuePermitForSelectedTransition()` falla cerrado con `authoritative-snapshot-required` si falta el snapshot del store (sin fallback a `input.state`) y rechaza transiciones no autorizadas mediante `resolvePrimaryFailure()`.
- **2.2 [GREEN]**: Actualizado `issuePermitForSelectedTransition()` en `scripts/lib/lifecycle-kernel/index.js` para exigir `store.snapshot(subject_id)` y evaluar la matriz causal con `resolvePrimaryFailure()` sobre todos los fallos del nodo y del estado.
- **2.3 [RED]**: Integration test en `scripts/lib/k5-budgets-failures-recovery.test.js` verificando resolución determinista idéntica de fallos mixtos en `transition-selector.js`, `operations.js` y el controlled permit issuer.
- **2.4 [GREEN]**: Refactorizado `scripts/lib/lifecycle-kernel/transition-selector.js` y `scripts/lib/lifecycle-kernel/operations.js` para extraer y resolver fallos primarios estrictamente con `resolvePrimaryFailure()` y emitir `{ kind: "escalate", operation: "escalate" }` ante fallos no reparables.
- **2.5 [REFACTOR]**: Eliminadas verificaciones ad-hoc redundantes de fallos causales en `scripts/lib/lifecycle-kernel/`.

### Phase 3: Multidimensional Carry-Over & Contractual Zero-Delta (Areas 2 & 3)
- **3.1 [RED]**: Unit tests en `scripts/lib/lifecycle-kernel/index.test.js` y `scripts/lib/execution-budgets.test.js` verificando que `createKernelRuntime` acumula las 10 dimensiones (6 de nodo + 4 de autoridad) en `cas-conflict` y las deduce en el reintento, y que la penalización dual de zero-delta se restringe a operaciones sin avance semántico (`reduced.outcome === "unchanged"`).
- **3.2 [GREEN]**: Implementado `mergeDeltas()` y acumulador `pendingCarryOver` de 10 dimensiones en `createKernelRuntime` (`scripts/lib/lifecycle-kernel/index.js`).
- **3.3 [GREEN]**: Delimitada la detección y deducción dual de zero-delta en `runKernelOperation` (`index.js`), eximiendo transiciones de ciclo de vida (`start`, `complete`, `fail`, `recover`, `replan`, `escalate`, `stop`, `status`).
- **3.4 [REFACTOR]**: Sincronizado `scripts/lib/execution-budgets.js`, `scripts/lib/lifecycle-model.js` y `scripts/lib/lifecycle-kernel/reducer.js` para garantizar consistencia simétrica en presupuestos.

### Phase 4: E2E Concurrent CAS Post-Effect Verification & Suite Validation (Area 1)
- **4.1 [RED]**: Test E2E de carrera concurrente multi-writer en `scripts/k5-e2e-budgets-recovery.test.js` donde dos escritores ejecutan efectos en paralelo, uno gana el CAS (`advanced`), el otro recibe `cas-conflict`, retiene el carry-over 10D y reintenta con éxito.
- **4.2 [GREEN]**: Validada la sincronización concurrente entre `AuthorityStore`, `createKernelRuntime` y `permitLedger`.
- **4.3 [REFACTOR]**: Ajustadas aserciones y fixtures de sincronización para tolerar transiciones terminales sin relajar monotonicidad.
- **4.4 [VERIFY]**: Ejecución completa de `npm test` con 2396 tests pasando (0 fallos, 0 errores, código de salida 0).

### Phase 5: Documentation & Canonical Traceability
- **5.1 [DOCS]**: Docstrings y JSDoc actualizados en `causal-failure.js`, `authority-store/index.js`, `lifecycle-kernel/index.js` y `execution-budgets.js`.
- **5.2 [DOCS]**: Trazabilidad completa con `tasks.md`, `specs/`, `design.md` y `state.yaml`.

---

## File Modification Summary
- `scripts/lib/causal-failure.js`: Mapeo fail-closed de routing tags desconocidos a `validation_gap`.
- `scripts/lib/causal-failure.test.js`: Test unitario para fallback de tag desconocido.
- `scripts/lib/authority-store/index.js`: Reemplazo de `midOpTicket` escalar por `midOpTickets = new Map()`, validación y borrado selectivo en CAS.
- `scripts/lib/authority-store/index.test.js`: Tests unitarios de concurrencia multi-writer en `commitJournal` y CAS.
- `scripts/lib/lifecycle-kernel/index.js`: Exigencia de `store.snapshot` en permit issuer, integración de `resolvePrimaryFailure`, carry-over 10D en `createKernelRuntime`, y delimitación contractual de zero-delta.
- `scripts/lib/lifecycle-kernel/index.test.js`: Tests unitarios para controlled issuer fail-closed, carry-over 10D y exención de zero-delta en avance semántico.
- `scripts/lib/lifecycle-kernel/transition-selector.js`: Recolección exhaustiva de fallos y emisión de escalaciones formales.
- `scripts/lib/lifecycle-kernel/operations.js`: Validación en límite con `resolvePrimaryFailure()`.
- `scripts/lib/execution-budgets.test.js`: Test unitario de decremento exhaustivo en 10 dimensiones.
- `scripts/lib/k5-budgets-failures-recovery.test.js`: Test de integración para `resolvePrimaryFailure` unificado.
- `scripts/k5-e2e-budgets-recovery.test.js`: Test E2E de carrera CAS concurrente con efectos reales y carry-over.
- `scripts/lib/lifecycle-model.js`: Ajuste del checker de invariante `inv-k5-zero-delta-consumption` acorde a la semántica contractual.
- `openspec/changes/k5-core-remediation/tasks.md`: 17 tareas marcadas como `[x]`.
- `openspec/changes/k5-core-remediation/state.yaml`: Estado actualizado a `ready-for-verify`.
