# Apply Progress: k5-concurrency-hardening

## Phase 1: Foundation & Store Hardening
- **Task 1.1 [RED]**: Added unit tests in `scripts/lib/authority-store/index.test.js` and `scripts/lib/filesystem-store.test.js` verifying merge-safe journal upsert by `effect_id` and concurrent ticket preservation.
- **Task 1.2 [GREEN]**: Implemented `upsertJournalEntries` helper across `scripts/lib/authority-store/index.js`, `scripts/lib/filesystem-store.js`, and `scripts/lib/lifecycle-kernel/memory-store.js`.
- **Task 1.3 [GREEN]**: Updated `compareAndSwapLocked` in `AuthorityStore` to delete winning ticket only via `entry.midOpTickets.delete(midOpTicket)`, eliminating disruptive `midOpTickets.clear()`.
- **Task 1.4 [REFACTOR]**: Unified store journaling invariants and circular require safety across all 3 stores.

## Phase 2: Kernel Runtime Usage Ownership, Carry-Over Partitioning & Zero-Delta Contract
- **Task 2.1 [RED]**: Added unit tests in `scripts/lib/lifecycle-kernel/index.test.js` for `result.usage` ownership, carry-over isolation by `${subjectId}:${nodeId}`, and zero-delta dual penalty boundary.
- **Task 2.2 [GREEN]**: Modified `runKernelOperation` in `scripts/lib/lifecycle-kernel/index.js` to compute `executedDelta` strictly from `result.usage` / `result.execution_usage` emitted by `effectExecutor`, purging `input.consumed`.
- **Task 2.3 [GREEN]**: Implemented `getCarryOverKey(subjectId, nodeId)` indexing `pendingCarryOver` by `${subjectId}:${nodeId}` across `runOperation` and `issuePermitForSelectedTransition`.
- **Task 2.4 [GREEN]**: Updated zero-delta deduction to evaluate `effect-bearing mutation AND effectProgress === false`, exempting semantic lifecycle progress.
- **Task 2.5 [REFACTOR]**: Extracted `extractExecutionUsage` helper and purged obsolete `input.consumed` authorities.

## Phase 3: Host Boundary Causal Integration & Recovery Mapping
- **Task 3.1 [RED]**: Added unit tests in `scripts/lib/lifecycle-kernel/host-boundary.test.js` for failure normalization via `resolvePrimaryFailure`.
- **Task 3.2 [GREEN]**: Integrated `resolvePrimaryFailure` in `observeHostPort` and `requirePermitCasAfterHostFault` in `scripts/lib/lifecycle-kernel/host-boundary.js`.
- **Task 3.3 [REFACTOR]**: Harmonized failure classification mapping to `environment_tooling` with fallback protection in `scripts/lib/host-contract/index.js`.

## Phase 4: End-to-End Concurrency, Idempotency & Zero-Duplication Verification
- **Task 4.1 [RED]**: Created E2E test suite in `scripts/k5-e2e-budgets-recovery.test.js` with CAS race, retry and 0 additional `effectExecutor` calls assertion.
- **Task 4.2 [GREEN]**: Verified journal reconciliation skips already completed effect via `deriveEffectId` preserving `effect.effect_id`.
- **Task 4.3 [GREEN]**: Verified cross-node carry-over partition isolation (`S1:N1` vs `S1:N2`).
- **Task 4.4 [REFACTOR]**: Full project test suite passes with 0 failures across all 21 test files.

## Phase 5: Governance, ADR Promotion & Final Suite Validation
- **Task 5.1**: Promoted ADR-001 through ADR-006 to `docs/adr/` with `Status: accepted`.
- **Task 5.2**: Full test suite validation executed (`npm test`) with 100% pass rate.
- **Task 5.3**: Workflow state updated to `status: ready-for-verify` and `phases.apply.status: done`.
