# Tasks: K5 Concurrency Hardening

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| `REQ-execution-budgets-003` / CAS conflict reconciliation preserves consumed budget via runtime-owned carry-over after executed effect | MUST | `scripts/lib/lifecycle-kernel/index.js`, `runKernelOperation` & `createKernelRuntime` | covered-by-design | Extracción desde `result.usage` y retención de carry-over en retry |
| `REQ-execution-budgets-003` / Concurrent multi-writer CAS conflict preserves consumed attempt on retry | MUST | `scripts/lib/lifecycle-kernel/index.js`, `createKernelRuntime` | covered-by-design | Monotonicidad de `effect_attempts` preservada tras CAS conflict |
| `REQ-execution-budgets-003` / Exhaustive multidimensional carry-over retained across concurrent writer CAS loss | MUST | `scripts/lib/lifecycle-kernel/index.js`, `scripts/lib/execution-budgets.js` | covered-by-design | Acumulador multidimensional completo (`turns`, `commands`, `patches`, etc.) |
| `REQ-execution-budgets-003` / Retry in repair loop decrements attempt budget monotonically | MUST | `scripts/lib/lifecycle-kernel/index.js`, `runKernelOperation` | covered-by-design | Decremento estricto sin reabastecimiento |
| `REQ-execution-budgets-003` / Caller-supplied input.consumed is rejected as usage authority | MUST | `scripts/lib/lifecycle-kernel/index.js`, `runKernelOperation` | covered-by-design | Purga de `input.consumed` a favor de `result.usage` de `effectExecutor` |
| `REQ-execution-budgets-003` / Partitioned carry-over prevents budget contamination between concurrent nodes | MUST | `scripts/lib/lifecycle-kernel/index.js`, `getCarryOverKey` | covered-by-design | Clave `${subjectId}:${nodeId}` para aislamiento multi-nodo |
| `REQ-execution-budgets-004` / Zero-delta code patch consumes dual turns and effect attempts with journal event before CAS commit | MUST | `scripts/lib/lifecycle-kernel/index.js`, `scripts/lib/execution-budgets.js` | covered-by-design | Evaluación `effect-bearing mutation AND effectProgress === false` |
| `REQ-execution-budgets-004` / Lifecycle progress without file modification does not consume zero-delta attempt | MUST | `scripts/lib/lifecycle-kernel/index.js`, `reduceLifecycle` | covered-by-design | Exención para transiciones con `reduced.outcome === "advanced"` |
| `REQ-execution-budgets-004` / Read-only inspection step does not consume zero-delta attempt | MUST | `scripts/lib/lifecycle-kernel/index.js`, `scripts/lib/execution-budgets.js` | covered-by-design | Inspecciones no mutantes excluidas de deducción zero-delta |
| `REQ-execution-budgets-004` / Zero-delta consumption persists monotonically across CAS race | MUST | `scripts/lib/lifecycle-kernel/index.js`, `createKernelRuntime` | covered-by-design | Deducción zero-delta integrada en el carry-over ante conflicto CAS |
| `REQ-authority-store-003` / Concurrent writers race on same revision | MUST | `scripts/lib/authority-store/index.js`, `compareAndSwapLocked` | covered-by-design | Single writer wins atómico con código `cas-conflict` |
| `REQ-authority-store-003` / Multi-writer mid-op ticket isolation during concurrent commitJournal | MUST | `scripts/lib/authority-store/index.js`, `commitJournal` | covered-by-design | Indexación independiente de tickets por writer y revisión |
| `REQ-authority-store-003` / Winning CAS deletes winning ticket while preserving concurrent peer tickets | MUST | `scripts/lib/authority-store/index.js`, `compareAndSwapLocked` | covered-by-design | `entry.midOpTickets.delete(winner)` reemplazando `clear()` |
| `REQ-authority-store-003` / Merge-safe commitJournal upserts journal records by effect_id | MUST | `scripts/lib/authority-store/index.js`, `upsertJournalEntries` | covered-by-design | Merge/upsert idempotente por `effect_id` en store |
| `REQ-authority-store-011` / Single atomic CAS record commit | MUST | `scripts/lib/authority-store/index.js`, `compareAndSwapLocked` | covered-by-design | Commit unificado de state, journal, authority y budgets |
| `REQ-authority-store-011` / Atomic commit cleans up matched mid-op ticket without invalidating concurrent writer tickets | MUST | `scripts/lib/authority-store/index.js`, `compareAndSwapLocked` | covered-by-design | Eliminación exclusiva del ticket ganador en commit atómico |
| `REQ-authority-store-011` / Atomic CAS merges journal records by effect_id | MUST | `scripts/lib/authority-store/index.js`, `upsertJournalEntries` | covered-by-design | Deduplicación y ordenamiento por `effect_id` en CAS |
| `REQ-failure-recovery-002` / Code defect routes to repair without degrading to recover | MUST | `scripts/lib/lifecycle-kernel/transition-selector.js` | covered-by-design | Enrutamiento a `{ kind: "execute", operation: "repair" }` |
| `REQ-failure-recovery-002` / Explicit escalate emitted for ambiguous effect without silent decide substitution | MUST | `scripts/lib/lifecycle-kernel/transition-selector.js` | covered-by-design | Emisión explícita de `escalate` ante fallo ambiguo |
| `REQ-failure-recovery-002` / Escalate and stop transitions consolidate and commit via CAS even under budget exhaustion | MUST | `scripts/lib/lifecycle-kernel/index.js`, `runKernelOperation` | covered-by-design | Commit terminal consolidado libre de bloqueo por cuotas |
| `REQ-failure-recovery-002` / Boundary validation rejects unallowlisted recovery transitions fail-closed | MUST | `scripts/lib/lifecycle-kernel/operations.js`, `validateOperationTransition` | covered-by-design | Fallo cerrado con 0 ejecuciones de efecto |
| `REQ-failure-recovery-002` / Environment fault takes precedence and routes to replan or escalate | MUST | `scripts/lib/causal-failure.js`, `resolvePrimaryFailure` | covered-by-design | Precedencia de infraestructura sobre defecto de código |
| `REQ-failure-recovery-002` / Unified resolvePrimaryFailure resolves mixed failures identically across components | MUST | `scripts/lib/causal-failure.js`, `scripts/lib/lifecycle-kernel/host-boundary.js` | covered-by-design | Normalización uniforme en selector, permits y host |
| `REQ-failure-recovery-002` / Host boundary catches transport failure and normalizes via resolvePrimaryFailure | MUST | `scripts/lib/lifecycle-kernel/host-boundary.js`, `normalizeHostTransportFault` | covered-by-design | Mapeo determinista a `environment_tooling` |
| `REQ-failure-recovery-003` / Code defect routes to repair when budget allows | MUST | `scripts/lib/lifecycle-kernel/transition-selector.js`, `selectTransitions` | covered-by-design | Matriz allowlisted para `code_defect` |
| `REQ-failure-recovery-003` / Ambiguous effect rejects blind repair across selector, permit issuer, and runtime | MUST | `scripts/lib/lifecycle-kernel/transition-selector.js`, `permits.js` | covered-by-design | Restricción estricta a `escalate` o `stop` |
| `REQ-failure-recovery-003` / Kernel operation boundary rejects unallowlisted transition for active failure category | MUST | `scripts/lib/lifecycle-kernel/operations.js` | covered-by-design | Validación fail-closed en frontera del kernel |
| `REQ-failure-recovery-003` / Terminal control transitions are universally allowlisted | MUST | `scripts/lib/lifecycle-kernel/transition-selector.js`, `operations.js` | covered-by-design | `escalate` y `stop` universalmente admitidos |
| `REQ-failure-recovery-003` / Host boundary port failure maps to environment tooling and enforces allowlisted transitions via resolvePrimaryFailure | MUST | `scripts/lib/lifecycle-kernel/host-boundary.js` | covered-by-design | Integración directa con `resolvePrimaryFailure` |
| `REQ-operation-permits-005` / Issuer produces permit from offer plus decision when Authority Store head, budget, and causal allowlist pass | MUST | `scripts/lib/lifecycle-kernel/permits.js`, `issuePermitForSelectedTransition` | covered-by-design | Emisión runtime-owned sujeta a snapshot autoritativo |
| `REQ-operation-permits-005` / State-valid offer alone does not issue | MUST | `scripts/lib/lifecycle-kernel/permits.js` | covered-by-design | Requisito de decisión explícita vinculada |
| `REQ-operation-permits-005` / Issuer refuses permit when node or authority budget is exhausted in Authority Store | MUST | `scripts/lib/lifecycle-kernel/permits.js`, `isBudgetExhausted` | covered-by-design | Validación contra cuotas autoritativas |
| `REQ-operation-permits-005` / Issuer refuses permit on Authority Store revision mismatch or causal allowlist violation | MUST | `scripts/lib/lifecycle-kernel/permits.js` | covered-by-design | Rechazo por drift de revisión o violación de matriz |
| `REQ-operation-permits-005` / Controlled issuer fails closed without authoritative store snapshot | MUST | `scripts/lib/lifecycle-kernel/permits.js` | covered-by-design | Prohibición de fallback a `input.state` no verificado |
| `REQ-operation-permits-005` / Controlled issuer validates causal allowlists using unified resolvePrimaryFailure | MUST | `scripts/lib/lifecycle-kernel/permits.js` | covered-by-design | Validación causal mediante `resolvePrimaryFailure` |
| `REQ-operation-permits-005` / Permit evaluation isolates node budget carry-over by subject and node key | MUST | `scripts/lib/lifecycle-kernel/permits.js`, `getCarryOverKey` | covered-by-design | Evaluación de presupuestos aislada por `${subjectId}:${nodeId}` |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~270 lines (+220 / -50) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Hardening integral de concurrencia K5 (ownership de usage, particionado `${subjectId}:${nodeId}`, journal merge-safe, preservación de tickets CAS, zero-delta, host boundary y ADRs) | PR 1 | Base branch main; suite completa de tests y documentación de decisiones incluidas |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

---

## Phase 1: Foundation & Store Hardening (Journal Merge-Safe & Mid-Op Ticket Preservation)

- [x] 1.1 [RED] Escribir tests unitarios en `scripts/lib/authority-store/index.test.js`, `scripts/lib/filesystem-store.test.js` y `scripts/lib/lifecycle-kernel/internal/` validando merge/upsert por `effect_id` en `commitJournal` y preservación de `midOpTickets` de writers perdedores tras CAS exitoso [REQ-authority-store-003, REQ-authority-store-011] (~45 líneas, 3 archivos)
- [x] 1.2 [GREEN] Implementar función helper `upsertJournalEntries` e integrarla en `commitJournal` y `commit` en `scripts/lib/authority-store/index.js`, `scripts/lib/filesystem-store.js` y `scripts/lib/lifecycle-kernel/memory-store.js` garantizando deduplicación por `effect_id` [REQ-authority-store-003, REQ-authority-store-011] (~35 líneas, 3 archivos)
- [x] 1.3 [GREEN] Modificar `compareAndSwapLocked` en `scripts/lib/authority-store/index.js` para eliminar exclusivamente el ticket ganador (`entry.midOpTickets.delete(midOpTicket)`) en lugar de `clear()`, preservando intactos los tickets de peers concurrentes [REQ-authority-store-003, REQ-authority-store-011] (~15 líneas, 1 archivo)
- [x] 1.4 [REFACTOR] Unificar contratos de journaling e invariantes de tickets entre `AuthorityStore`, `MemoryStore` y `FileSystemStore` sin duplicar lógica de merge [REQ-authority-store-003, REQ-authority-store-011] (~20 líneas, 3 archivos)

---

## Phase 2: Kernel Runtime Usage Ownership, Carry-Over Partitioning & Zero-Delta Contract

- [x] 2.1 [RED] Escribir tests unitarios en `scripts/lib/lifecycle-kernel/index.test.js`, `scripts/lib/lifecycle-kernel/permits.test.js` y `scripts/lib/execution-budgets.test.js` verificando extracción exclusiva de `result.usage` / `result.execution_usage` (rechazo de `input.consumed`), aislamiento de `pendingCarryOver` por clave `${subjectId}:${nodeId}`, y evaluación dual de zero-delta para mutaciones sin progreso [REQ-execution-budgets-003, REQ-execution-budgets-004, REQ-operation-permits-005] (~50 líneas, 3 archivos)
- [x] 2.2 [GREEN] Modificar `runKernelOperation` en `scripts/lib/lifecycle-kernel/index.js` para computar `executedDelta` estrictamente desde `result.usage` o `result.execution_usage` emitido por `effectExecutor` y purgar `input.consumed` como autoridad contable [REQ-execution-budgets-003] (~25 líneas, 1 archivo)
- [x] 2.3 [GREEN] Implementar la función `getCarryOverKey(subjectId, nodeId)` en `scripts/lib/lifecycle-kernel/index.js` y `scripts/lib/lifecycle-kernel/permits.js`, indexando `pendingCarryOver` bajo `${subjectId}:${nodeId}` para aislar presupuestos entre nodos concurrentes del mismo sujeto [REQ-execution-budgets-003, REQ-operation-permits-005] (~20 líneas, 2 archivos)
- [x] 2.4 [GREEN] Actualizar la deducción de zero-delta en `scripts/lib/lifecycle-kernel/index.js` y `scripts/lib/execution-budgets.js` para evaluar `effect-bearing mutation AND effectProgress === false`, deduciendo turnos de nodo y `effect_attempts` durablemente en journal antes de CAS y eximiendo `repair` con `outcome: "advanced"` [REQ-execution-budgets-004] (~25 líneas, 2 archivos)
- [x] 2.5 [REFACTOR] Limpiar parámetros obsoletos de `input.consumed` en llamadas internas del kernel y encapsular la normalización de `ExecutionUsage` en un helper reutilizable [REQ-execution-budgets-003, REQ-execution-budgets-004] (~20 líneas, 2 archivos)

---

## Phase 3: Host Boundary Causal Integration & Recovery Mapping

- [x] 3.1 [RED] Escribir tests de integración en `scripts/lib/lifecycle-kernel/host-boundary.test.js` verificando que fallos de transporte, desconexión de puertos y timeouts son normalizados mediante `resolvePrimaryFailure()` hacia la categoría `environment_tooling` [REQ-failure-recovery-002, REQ-failure-recovery-003] (~30 líneas, 1 archivo)
- [x] 3.2 [GREEN] Integrar `resolvePrimaryFailure` y `createCausalFailure` de `scripts/lib/causal-failure.js` en `scripts/lib/lifecycle-kernel/host-boundary.js` para estandarizar la captura y clasificación causal de errores de host [REQ-failure-recovery-002, REQ-failure-recovery-003] (~20 líneas, 1 archivo)
- [x] 3.3 [REFACTOR] Armonizar la taxonomía de fallos y códigos de salida entre `host-boundary.js`, `failure-recovery.js` y `transition-selector.js` garantizando transiciones allowlisted deterministas [REQ-failure-recovery-002, REQ-failure-recovery-003] (~15 líneas, 3 archivos)

---

## Phase 4: End-to-End Concurrency, Idempotency & Zero-Duplication Verification

- [x] 4.1 [RED] Escribir suite de pruebas E2E en `scripts/k5-e2e-budgets-recovery.test.js` simulando carreras CAS multi-writer con aserciones estrictas de 0 invocaciones duplicadas a `effectExecutor` (`callCount === 1`) en reintentos post-conflicto [REQ-execution-budgets-003, REQ-authority-store-003] (~45 líneas, 1 archivo)
- [x] 4.2 [GREEN] Validar que el flujo de reconciliación en `runKernelOperation` consulte el journal autoritativo (`action: "skip"`) evitando re-ejecución de efectos completados y aplicando carry-over particionado sobre la nueva revisión head [REQ-execution-budgets-003, REQ-authority-store-003, REQ-operation-permits-005] (~20 líneas, 2 archivos)
- [x] 4.3 [GREEN] Integrar en `scripts/k5-e2e-budgets-recovery.test.js` escenarios de verificación cruzada para preservación de tickets concurrentes, no-contaminación entre `S1:N1` y `S1:N2`, y penalización dual en zero-delta [REQ-execution-budgets-003, REQ-execution-budgets-004, REQ-operation-permits-005] (~35 líneas, 1 archivo)
- [x] 4.4 [REFACTOR] Consolidar helpers de prueba concurrentes y mocks de `effectExecutor` en `scripts/k5-e2e-budgets-recovery.test.js` para máxima legibilidad y estabilidad [REQ-execution-budgets-003, REQ-authority-store-003] (~15 líneas, 1 archivo)

---

## Phase 5: Governance, ADR Promotion & Final Suite Validation

- [x] 5.1 Formalizar y consolidar ADRs (ADR-001 a ADR-006) en `openspec/changes/k5-concurrency-hardening/decisions/` y `docs/adr/` con metadatos completos y `Status: accepted` (~10 líneas, 6 archivos)
- [x] 5.2 Ejecución completa de la suite de pruebas del proyecto (`npm test`) verificando 100% de tests pasando limpiamente sin regresiones (~0 líneas)
- [x] 5.3 Actualizar `openspec/changes/k5-concurrency-hardening/state.yaml` reflejando la finalización de `apply` y estado `ready-for-verify` (~10 líneas, 1 archivo)
