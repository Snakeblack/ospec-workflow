# Tasks: K5 Usage Accounting Integrity

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-execution-budgets-003 | MUST | `lifecycle-kernel/index.js`, `reducer.js`, `execution-budgets.js`; runtime/E2E tests | covered-by-design | Two buckets P/N, fail-closed usage, carry-over partitionado y preflight monotónico cubren success, failure, CAS, retry y exhaustion. |
| REQ-execution-budgets-004 | MUST | effect-progress derivation and pre-CAS journal in `lifecycle-kernel/index.js`; budget/runtime tests | covered-by-design | Repair estéril y mutación sin delta reciben penalización dual; inspección y terminales quedan excluidos. |
| REQ-lifecycle-kernel-runtime-025 | MUST | `lifecycle-kernel/index.js`, `reducer.js`, `execution-budgets.js` | covered-by-design | Disposición `none/pending/committed` impide doble débito o replenishment. |
| REQ-lifecycle-kernel-runtime-027 | MUST | `lifecycle-kernel/index.js`; focused runtime tests | covered-by-design | `lifecycleProgress` se separa de `effectProgress`, con exhaustion terminal-only. |
| REQ-authority-store-003 | MUST | `journal-merge.js`, Authority/Memory/FileSystem stores | covered-by-design | CAS conserva peer tickets y status `completed` absorbente por `effect_id`. |
| REQ-authority-store-011 | MUST | shared merge primitive and atomic commit paths | covered-by-design | State, journal, authority y budgets se comprometen juntos. |
| REQ-lifecycle-model-conformance-011 | MUST | `lifecycle-model.js`, harness y K5 E2E/model tests | covered-by-design | Los invariantes observan composición runtime/store real, usage ausente y journal monotónico. |

### Reconciliation Verdict

- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none; K6a y cambios de trust boundary permanecen fuera de alcance.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 650–900 lines (runtime/reducer/budget: 220–300; stores/journal: 120–180; tests/harness/model: 260–360; ADR/documentation reconciliation: 50–60) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Un único PR `size-exception`, con work units internos ordenados y evidencia TDD por unidad |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

## Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Fijar contratos RED y primitivas de usage/journal | Single size-exception PR | RED focal antes de tocar implementación; incluye `journal-merge.js` y fixtures explícitos. |
| 2 | Implementar accounting runtime/reducer/budgets | Single size-exception PR | GREEN para CAS success, post-effect, carry-over, fail-closed, zero-delta y exhaustion. |
| 3 | Integrar merge monotónico en Authority/Memory/FileSystem stores | Single size-exception PR | GREEN de CAS atómico, peer tickets y preservación de evidencia `completed`. |
| 4 | Completar modelo, E2E, ADRs y verificación | Single size-exception PR | Refactor, reconciliación documental y `npm test` completo; K6a sigue bloqueado. |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: RED — Contracts, Fixtures, and Shared Primitives

- [x] 1.1 Add failing focused tests in `scripts/lib/lifecycle-kernel/index.test.js` for CAS-success exactly-once debit, post-effect carry-over, repeated CAS loss without re-execution, missing usage, ignored `input.consumed`, partition isolation, and sterile repair [REQ-execution-budgets-003, REQ-execution-budgets-004, REQ-lifecycle-kernel-runtime-025, REQ-lifecycle-kernel-runtime-027]
- [x] 1.2 Add failing store tests in `scripts/lib/authority-store/index.test.js` and `scripts/lib/filesystem-store.test.js` for completed non-degradation, unchanged result evidence, distinct effects, peer tickets, and unified atomic record [REQ-authority-store-003, REQ-authority-store-011]
- [x] 1.3 Add shared journal-merge contract tests in `scripts/lib/lifecycle-kernel/journal.test.js` and update `scripts/lib/minimal-kernel-harness.test.js` fixtures so physical executors emit explicit measured or zero usage [REQ-authority-store-003, REQ-lifecycle-model-conformance-011]

## Phase 2: GREEN — Runtime Accounting and Monotonic Journal

- [x] 2.1 Modify `scripts/lib/lifecycle-kernel/index.js` to separate physical executions from reconciled history, normalize only `usage`/`execution_usage`, apply P+N once before CAS, and consume `none/pending/committed` disposition on every post-effect exit [REQ-execution-budgets-003, REQ-lifecycle-kernel-runtime-025]
- [x] 2.2 Modify `scripts/lib/lifecycle-kernel/reducer.js` and `scripts/lib/execution-budgets.js` to remove caller delta authority, preserve monotonic decrements, reject malformed/absent usage with `execution-usage-required`, and distinguish effect from lifecycle progress [REQ-execution-budgets-003, REQ-execution-budgets-004, REQ-lifecycle-kernel-runtime-027]
- [x] 2.3 Implement zero-delta classification and pre-CAS `zero-delta-attempt` journaling in `scripts/lib/lifecycle-kernel/index.js`, including sterile `repair`, while excluding read-only and terminal controls [REQ-execution-budgets-004, REQ-lifecycle-kernel-runtime-027]
- [x] 2.4 Implement the shared absorbing merge in existing `scripts/lib/lifecycle-kernel/journal.js`; wire it into `scripts/lib/authority-store/index.js`, `scripts/lib/lifecycle-kernel/memory-store.js`, and `scripts/lib/filesystem-store.js` under existing atomic/lock paths [REQ-authority-store-003, REQ-authority-store-011]

## Phase 3: GREEN — Integration and Model Evidence

- [x] 3.1 Extend `scripts/k5-e2e-budgets-recovery.test.js` and the focused runtime fixtures to prove an `effect-failed` result with measured usage is journal-reconciled and charged exactly once on the exact retry, including the retained carry-over and exhaustive concurrent dimensions; preserve the one-executor and repair-retry assertions [K5-SV-001, REQ-execution-budgets-003, REQ-lifecycle-kernel-runtime-025]
- [x] 3.2 Update `scripts/lib/lifecycle-model.js`, `scripts/lib/lifecycle-model.test.js`, and `scripts/lib/k5-lifecycle-model.test.js` so all seven K5 invariants execute through the full runtime, selector, reducer, permit-ledger, and store composition, with direct observations for exact success debit, two consecutive CAS losses, failed effect, missing usage, sterile repair, and completed-status monotonicity [K5-SV-002, REQ-lifecycle-model-conformance-011]
- [x] 3.3 Update `scripts/lib/minimal-kernel-harness.js` and its tests for trusted explicit usage without expanding executor authority boundaries [REQ-lifecycle-model-conformance-011]

## Phase 4: REFACTOR, Documentation, and Verification

- [x] 4.1 Refactor shared normalization/disposition code for one accounting path, preserve public response shape, and remove obsolete fallback branches; rerun focused K5/store tests [REQ-execution-budgets-003, REQ-authority-store-011]
- [x] 4.2 Reconcile `docs/adr/adr-20260821-004-*.md` and `docs/adr/adr-20260822-{007,009,011}-*.md` with carry-over, fail-closed usage, monotonic journal, and sterile-repair semantics [REQ-execution-budgets-003, REQ-execution-budgets-004, REQ-authority-store-003]
- [x] 4.3 Run `npm test` (`node --test scripts/**/*.test.js`) and verify every REQ scenario, no K6a files/scope, and no regression in existing journal/store contracts [REQ-lifecycle-model-conformance-011]
