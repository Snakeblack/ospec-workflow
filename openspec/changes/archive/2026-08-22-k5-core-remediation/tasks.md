# Tasks: K5 Core Technical Remediation

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| `REQ-authority-store-003` / Concurrent writers race on same revision | MUST | `scripts/lib/authority-store/index.js`, `compareAndSwapLocked` | covered-by-design | CAS-conflict estable sin inflación de presupuestos |
| `REQ-authority-store-003` / Multi-writer mid-op ticket isolation | MUST | `scripts/lib/authority-store/index.js`, `midOpTickets = new Map()` | covered-by-design | Coexistencia de tickets concurrentes por escritor/revisión en `commitJournal` |
| `REQ-authority-store-011` / Single atomic CAS record commit | MUST | `scripts/lib/authority-store/index.js`, `compareAndSwapLocked` | covered-by-design | Commit atómico de estado, journal, authority bag y presupuestos |
| `REQ-authority-store-011` / Atomic commit cleans up matched mid-op ticket | MUST | `scripts/lib/authority-store/index.js`, `compareAndSwapLocked` | covered-by-design | Eliminación selectiva del ticket ganador preservando tickets en vuelo |
| `REQ-execution-budgets-003` / CAS conflict preserves budget via carry-over | MUST | `scripts/lib/lifecycle-kernel/index.js`, `createKernelRuntime` | covered-by-design | Acumulador `pendingCarryOver` runtime-owned tras `cas-conflict` |
| `REQ-execution-budgets-003` / Concurrent multi-writer CAS conflict preserves attempts | MUST | `scripts/lib/lifecycle-kernel/index.js`, `mergeDeltas` | covered-by-design | Retención de decrementos en escritor perdedor |
| `REQ-execution-budgets-003` / Exhaustive multidimensional carry-over | MUST | `scripts/lib/lifecycle-kernel/index.js`, `scripts/lib/execution-budgets.js` | covered-by-design | 10 dimensiones completas (6 de nodo + 4 de autoridad) acumuladas |
| `REQ-execution-budgets-003` / Retry in repair loop decrements monotonically | MUST | `scripts/lib/lifecycle-kernel/reducer.js`, `scripts/lib/execution-budgets.js` | covered-by-design | Monotonicidad estricta sin reposición implícita |
| `REQ-execution-budgets-004` / Zero-delta code patch consumes dual turns & attempts | MUST | `scripts/lib/lifecycle-kernel/index.js`, post-effect zero-delta check | covered-by-design | Penalización dual (`node.turns` y `effect_attempts`) con evento en journal |
| `REQ-execution-budgets-004` / Lifecycle progress does not consume zero-delta | MUST | `scripts/lib/lifecycle-kernel/index.js`, `reduced.outcome !== "unchanged"` | covered-by-design | Exención para transiciones semánticas de ciclo de vida |
| `REQ-execution-budgets-004` / Read-only inspection does not consume zero-delta | MUST | `scripts/lib/lifecycle-kernel/index.js`, filtro de operaciones | covered-by-design | Exención para diagnósticos y lecturas |
| `REQ-execution-budgets-004` / Zero-delta consumption persists across CAS race | MUST | `scripts/lib/lifecycle-kernel/index.js`, carry-over integration | covered-by-design | Monotonicidad de cuotas zero-delta ante colisión CAS |
| `REQ-failure-recovery-001` / Tool timeout classified as environment failure | MUST | `scripts/lib/causal-failure.js`, `mapLegacyRoutingTag` | covered-by-design | Mapeo a `environment_tooling` |
| `REQ-failure-recovery-001` / Legacy verify routing tag maps to canonical taxonomy | MUST | `scripts/lib/causal-failure.js`, `mapLegacyRoutingTag` | covered-by-design | Mapeo determinista de tags conocidos |
| `REQ-failure-recovery-001` / Unknown legacy tag maps fail-closed to validation gap | MUST | `scripts/lib/causal-failure.js`, `mapLegacyRoutingTag` default case | covered-by-design | Default a `validation_gap` / `UNKNOWN_ROUTING_TAG` prohibiendo repair |
| `REQ-failure-recovery-002` / Code defect routes to repair without degrading | MUST | `scripts/lib/lifecycle-kernel/transition-selector.js` | covered-by-design | Emisión de `{ kind: "execute", operation: "repair" }` |
| `REQ-failure-recovery-002` / Explicit escalate emitted for ambiguous effect | MUST | `scripts/lib/lifecycle-kernel/transition-selector.js` | covered-by-design | Emisión de `{ kind: "escalate", operation: "escalate" }` |
| `REQ-failure-recovery-002` / Escalate and stop commit via CAS under budget exhaustion | MUST | `scripts/lib/lifecycle-kernel/index.js`, bypass de presupuesto | covered-by-design | Commit terminal consolidado sin abort prematuro |
| `REQ-failure-recovery-002` / Boundary validation rejects unallowlisted transitions | MUST | `scripts/lib/lifecycle-kernel/operations.js`, `validateOperationTransition` | covered-by-design | Validación fail-closed en límite de ejecución |
| `REQ-failure-recovery-002` / Environment fault takes precedence and routes to replan | MUST | `scripts/lib/causal-failure.js`, `resolvePrimaryFailure` | covered-by-design | Precedencia causal estricta |
| `REQ-failure-recovery-002` / Unified resolvePrimaryFailure across components | MUST | `scripts/lib/causal-failure.js`, `transition-selector.js`, `index.js`, `operations.js` | covered-by-design | Uso homogéneo del resolvedor centralizado |
| `REQ-failure-recovery-003` / Code defect routes to repair when budget allows | MUST | `scripts/lib/lifecycle-kernel/transition-selector.js` | covered-by-design | Validación de attempts restantes antes de emitir repair |
| `REQ-failure-recovery-003` / Ambiguous effect rejects blind repair | MUST | `scripts/lib/lifecycle-kernel/transition-selector.js`, `index.js`, `operations.js` | covered-by-design | Restricción estricta a escalate y stop |
| `REQ-failure-recovery-003` / Kernel boundary rejects unallowlisted transition | MUST | `scripts/lib/lifecycle-kernel/operations.js`, `validateOperationTransition` | covered-by-design | Fallo cerrado con 0 ejecuciones de efecto |
| `REQ-failure-recovery-003` / Terminal control transitions universally allowlisted | MUST | `scripts/lib/lifecycle-kernel/operations.js`, `validateRecoveryTransition` | covered-by-design | `escalate` y `stop` permitidos universalmente |
| `REQ-operation-permits-005` / Controlled issuer produces permit when checks pass | MUST | `scripts/lib/lifecycle-kernel/index.js`, `issuePermitForSelectedTransition` | covered-by-design | Emisión respaldada por snapshot autoritativo |
| `REQ-operation-permits-005` / State-valid offer alone does not issue | MUST | `scripts/lib/lifecycle-kernel/index.js`, exigencia de decisión | covered-by-design | Rechazo sin `policyDecision`, `humanDecision` o `kernelRule` |
| `REQ-operation-permits-005` / Issuer refuses permit on budget exhaustion | MUST | `scripts/lib/lifecycle-kernel/index.js`, evaluación `isBudgetExhausted` | covered-by-design | Rechazo por agotamiento en store autoritativo |
| `REQ-operation-permits-005` / Issuer refuses permit on revision mismatch or causal violation | MUST | `scripts/lib/lifecycle-kernel/index.js`, `currentRevision` y allowlist | covered-by-design | Rechazo por `stale-revision` o `unallowlisted-recovery-transition` |
| `REQ-operation-permits-005` / Controlled issuer fails closed without store snapshot | MUST | `scripts/lib/lifecycle-kernel/index.js`, `store.snapshot` check | covered-by-design | Rechazo con `authoritative-snapshot-required`, sin fallback a `input.state` |
| `REQ-operation-permits-005` / Controlled issuer validates causal allowlists via resolvePrimaryFailure | MUST | `scripts/lib/lifecycle-kernel/index.js`, integración `resolvePrimaryFailure` | covered-by-design | Validación causal unificada previa a emisión |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 210-260 lines (approx. +170/-50) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Remediación integral del núcleo K5 (7 áreas técnicas) | Single PR | Cambios modulares acotados en `scripts/lib/` con suite de tests unitarios, de integración y E2E |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

---

## Phase 1: Taxonomy Fail-Closed & Store Concurrency Isolation (Areas 7 & 5)

- [x] 1.1 [RED] Write unit tests in `scripts/lib/causal-failure.test.js` asserting that `mapLegacyRoutingTag()` maps unknown routing tags to `validation_gap` (`UNKNOWN_ROUTING_TAG`) and rejects `repair` (~20 lines in 1 file) [REQ-failure-recovery-001]
- [x] 1.2 [GREEN] Update `mapLegacyRoutingTag()` default case in `scripts/lib/causal-failure.js` to return `{ category: CAUSAL_CATEGORIES.VALIDATION_GAP, code: "UNKNOWN_ROUTING_TAG" }` (~6 lines in 1 file) [REQ-failure-recovery-001]
- [x] 1.3 [REFACTOR] Clean up taxonomy mappings and export constants in `scripts/lib/causal-failure.js` (~5 lines in 1 file) [REQ-failure-recovery-001]
- [x] 1.4 [RED] Write unit tests in `scripts/lib/authority-store/index.test.js` verifying concurrent `commitJournal()` calls issue isolated mid-op tickets via Map and that CAS commit deletes matched ticket without invalidating concurrent peers (~35 lines in 1 file) [REQ-authority-store-003, REQ-authority-store-011]
- [x] 1.5 [GREEN] Refactor `scripts/lib/authority-store/index.js` replacing scalar `midOpTicket` with `midOpTickets = new Map()` in `ensureSubject`, storing records in `commitJournal` and verifying/deleting tickets in `compareAndSwapLocked` (~30 lines in 1 file) [REQ-authority-store-003, REQ-authority-store-011]
- [x] 1.6 [REFACTOR] Consolidate baseline digest management and ticket lifecycle cleanup in `scripts/lib/authority-store/index.js` (~8 lines in 1 file) [REQ-authority-store-003, REQ-authority-store-011]

## Phase 2: Authoritative Controlled Permit Issuer & Unified Causal Resolution (Areas 6 & 4)

- [x] 2.1 [RED] Write unit tests in `scripts/lib/lifecycle-kernel/index.test.js` verifying `issuePermitForSelectedTransition()` rejects requests without authoritative `store.snapshot()` (returning `authoritative-snapshot-required`) and rejects unallowlisted transitions derived from `resolvePrimaryFailure()` (~35 lines in 1 file) [REQ-operation-permits-005, REQ-failure-recovery-002, REQ-failure-recovery-003]
- [x] 2.2 [GREEN] Update `issuePermitForSelectedTransition()` in `scripts/lib/lifecycle-kernel/index.js` to require `store.snapshot(subject_id)`, eliminate fallback to `input.state`, and evaluate causal allowlists via `resolvePrimaryFailure()` and `validateRecoveryTransition()` (~25 lines in 1 file) [REQ-operation-permits-005, REQ-failure-recovery-002, REQ-failure-recovery-003]
- [x] 2.3 [RED] Write integration tests in `scripts/lib/k5-budgets-failures-recovery.test.js` verifying that `transition-selector.js`, `operations.js`, and `host-boundary.js` resolve mixed failure arrays identically using `resolvePrimaryFailure()` (~25 lines in 1 file) [REQ-failure-recovery-002, REQ-failure-recovery-003]
- [x] 2.4 [GREEN] Refactor `scripts/lib/lifecycle-kernel/transition-selector.js` and `scripts/lib/lifecycle-kernel/operations.js` to extract and validate failure categories strictly through `resolvePrimaryFailure()` and emit `{ kind: "escalate", operation: "escalate" }` on unrepairable faults (~20 lines in 2 files) [REQ-failure-recovery-002, REQ-failure-recovery-003]
- [x] 2.5 [REFACTOR] Clean up error handling and remove redundant ad-hoc failure resolution checks across `scripts/lib/lifecycle-kernel/` (~10 lines in 2 files) [REQ-failure-recovery-002, REQ-operation-permits-005]

## Phase 3: Multidimensional Carry-Over & Contractual Zero-Delta (Areas 2 & 3)

- [x] 3.1 [RED] Write unit tests in `scripts/lib/lifecycle-kernel/index.test.js` and `scripts/lib/execution-budgets.test.js` verifying that `createKernelRuntime` accumulates deltas across all 10 dimensions (6 node + 4 authority) on `cas-conflict` and deducts them on retry, and that zero-delta dual penalty is triggered only when `reduced.outcome === "unchanged"` with 0 modified files (~40 lines in 2 files) [REQ-execution-budgets-003, REQ-execution-budgets-004]
- [x] 3.2 [GREEN] Update `createKernelRuntime` in `scripts/lib/lifecycle-kernel/index.js` to calculate real executed `consumed_delta` across 10 dimensions, accumulate in `pendingCarryOver`, and apply monotonically on subsequent attempts (~30 lines in 1 file) [REQ-execution-budgets-003]
- [x] 3.3 [GREEN] Update zero-delta detection in `scripts/lib/lifecycle-kernel/index.js` to condition dual deduction (`node.turns` and `effect_attempts`) and `zero-delta-attempt` journal recording strictly to code mutations where `reduced.outcome === "unchanged"` and modified files/lines equal 0 (~15 lines in 1 file) [REQ-execution-budgets-004]
- [x] 3.4 [REFACTOR] Align `scripts/lib/execution-budgets.js` and `scripts/lib/lifecycle-kernel/reducer.js` to ensure symmetrical multi-dimensional decrement and budget exhaustion checks across node and authority bags (~15 lines in 2 files) [REQ-execution-budgets-003, REQ-execution-budgets-004]

## Phase 4: E2E Concurrent CAS Post-Effect Verification & Suite Validation (Area 1)

- [x] 4.1 [RED] Write E2E concurrent CAS post-effect test in `scripts/k5-e2e-budgets-recovery.test.js` where two writers execute side effects in parallel prior to CAS, verifying that writer 1 commits (`R0 -> R1`), writer 2 receives `cas-conflict`, retains 10D carry-over, and succeeds on retry against `R1` without duplicate effect execution (~50 lines in 1 file) [REQ-authority-store-003, REQ-execution-budgets-003]
- [x] 4.2 [GREEN] Run and tune E2E integration in `scripts/k5-e2e-budgets-recovery.test.js` ensuring full synchronization between `AuthorityStore`, `createKernelRuntime`, and `permitLedger` under concurrency (~15 lines in 1 file) [REQ-authority-store-003, REQ-execution-budgets-003]
- [x] 4.3 [REFACTOR] Polish assertions and test fixtures in `scripts/k5-e2e-budgets-recovery.test.js` (~10 lines in 1 file) [REQ-authority-store-003, REQ-execution-budgets-003]
- [x] 4.4 [VERIFY] Run full project test suite (`npm test`) confirming 100% pass rate and zero regressions across all K5 modules [REQ-authority-store-003, REQ-authority-store-011, REQ-execution-budgets-003, REQ-execution-budgets-004, REQ-failure-recovery-001, REQ-failure-recovery-002, REQ-failure-recovery-003, REQ-operation-permits-005]

## Phase 5: Documentation & Canonical Traceability

- [x] 5.1 [DOCS] Verify and update docstrings and inline JSDoc comments across modified runtime modules (`causal-failure.js`, `authority-store/index.js`, `lifecycle-kernel/index.js`) (~15 lines in 3 files) [REQ-failure-recovery-001, REQ-authority-store-003, REQ-operation-permits-005]
- [x] 5.2 [DOCS] Validate traceability links and schema consistency between `openspec/changes/k5-core-remediation/` artifacts and codebase (~5 lines in 1 file) [REQ-execution-budgets-003, REQ-failure-recovery-002]
