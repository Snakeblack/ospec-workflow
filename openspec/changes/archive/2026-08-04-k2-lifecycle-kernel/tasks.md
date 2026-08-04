# Tasks: K2 — Lifecycle Kernel, Minimal Harness y Model-Based Conformance

## Spec/Design Reconciliation

| Requirement group | Priority | Design allocation | Status |
|------------------|----------|-------------------|--------|
| Deterministic status/transitions | MUST | state digest + transition selector | covered-by-design |
| Invalid transitions fail closed | MUST | operation registry + reducer guards | covered-by-design |
| Pure reducer / explicit effects | MUST | functional core / imperative shell | covered-by-design |
| Replay-safe journal | MUST | stable operation/effect IDs + reconciliation | covered-by-design |
| Recovery advances/terminates | MUST | harness recovery E2E | covered-by-design |
| Runtime-owned authority | MUST | authorized operation boundary | covered-by-design |
| Derived events | MUST | event projection after commit | covered-by-design |
| Terminal exhaustion | MUST | selector terminal guard | covered-by-design |
| Review/archive compatibility | MUST | bridges + no-regression fixtures | covered-by-design |
| Public API harness | MUST | Minimal Kernel Harness | covered-by-design |
| Interruption/replay matrix | MUST | deterministic interruption points | covered-by-design |
| Snapshot round-trip | MUST | store snapshot fixtures | covered-by-design |
| Reduced model + 8 invariants | MUST | lifecycle-model.js + CI tests | covered-by-design |
| Opaque future ports | MUST | equality-only model values | covered-by-design |
| Deferred invariants not enforced | MUST | scope guards + model manifest | covered-by-design |
| Runtime surface parity | MUST | transition-parity integration | covered-by-design |

### Reconciliation Verdict

- MUST coverage: complete.
- Blocking ambiguity: none.
- Apply-time inventory required: existing state readers/writers and exact bridge
  entrypoints; mapping must be recorded before implementation edits.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1800–2800 |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |
| Logical review order | authority/state → reducer → journal → harness → model → compatibility bridges |

Decision needed before apply: No  
Chained PRs recommended: No  
400-line budget risk: High

### Checklist Status Legend

- `[ ]` Not implemented.
- `[~]` Implemented but not fully verified.
- `[x]` Implemented and verified.

## Phase 1: Apply Inventory And Scope Guards

- [x] 1.1 Inventory existing OpenSpec state readers/writers, orchestrator operation
  entrypoints, review-lineage and archive runtime bridges; record exact paths in
  `apply-progress.md`.
- [x] 1.2 RED: add scope-guard tests rejecting host APIs, Candidate/Execution Graph,
  productive budget, attestation and delivery modules inside K2.
- [x] 1.3 RED: add a test proving existing K1 schemas/aliases remain unchanged.

## Phase 2: State Canonicalization And Operation Registry

- [x] 2.1 RED: state semantic-equivalence fixtures with different property order
  produce identical digest.
- [x] 2.2 GREEN: implement lifecycle state canonicalization/digest using K1
  canonical JSON helpers.
- [x] 2.3 RED: invalid `start/complete/fail/invalidate-node/recover` transitions
  fail closed with stable codes and no mutation.
- [x] 2.4 GREEN: implement operation registry and authorization boundary.

## Phase 3: Pure Reducer And Ordered Transition Selection

- [x] 3.1 RED: reducer purity tests reject direct filesystem/process/clock/random I/O.
- [x] 3.2 GREEN: implement pure reducer returning immutable state, effects, events
  and outcome.
- [x] 3.3 RED: equivalent states produce byte-equivalent ordered transitions.
- [x] 3.4 GREEN: implement explicit total transition priority and stable secondary
  ordering.
- [x] 3.5 RED→GREEN: terminal states expose no ordinary execute transition and
  exhausted operations cannot restart implicitly.

## Phase 4: Journal, Idempotency And Reconciliation

- [x] 4.1 RED: stable operation/effect ID golden vectors.
- [x] 4.2 GREEN: implement journal record shapes and ID derivation.
- [x] 4.3 RED: interruption after completed effect but before final state commit
  does not execute the effect twice.
- [x] 4.4 GREEN: implement reconciliation for planned/started/completed/failed effects.
- [x] 4.5 RED→GREEN: unknown outcomes fail closed and require exact reconciliation.

## Phase 5: Derived Events

- [x] 5.1 RED: rebuilding events from identical committed state/journal yields
  equivalent event IDs and order.
- [x] 5.2 GREEN: implement non-authoritative event projection.
- [x] 5.3 RED→GREEN: deleting/reordering event projection cannot change status or
  selected transitions.

## Phase 6: Minimal Kernel Harness

- [x] 6.1 RED: harness must use public kernel API; reducer-only test cannot satisfy
  conformance.
- [x] 6.2 GREEN: implement deterministic harness with injected store, executor and clock.
- [x] 6.3 RED→GREEN: interruption matrix before/after journal, effect and state commits.
- [x] 6.4 RED→GREEN: snapshot/digest round-trip.
- [x] 6.5 RED→GREEN: `decide` halts without auto-approval.
- [x] 6.6 RED→GREEN: every named execute/recover fixture is actually invoked.

## Phase 7: Recovery Honesty

- [x] 7.1 RED: syntactically valid recovery returning the same blocking digest fails.
- [x] 7.2 GREEN: integrate advance-or-terminal validation.
- [x] 7.3 TRIANGULATE: recoverable, human-decision and terminal-stop fixtures.

## Phase 8: Reduced Model And Invariant Exploration

- [x] 8.1 Define versioned bounded state domains, action set, exploration limits and
  abstraction mapping.
- [x] 8.2 RED: one seeded faulty reducer/selector produces a stable counterexample.
- [x] 8.3 GREEN: implement deterministic bounded exploration and trace emission.
- [x] 8.4 Implement checkers for all eight executable K2 invariants.
- [x] 8.5 Add opaque `SubjectId`, `AuthorityToken`, `BudgetRef`, `PolicyRef` scenarios.
- [x] 8.6 Add deferred-invariant manifest and tests proving placeholders do not count
  as K2 enforcement.
- [x] 8.7 Replay counterexamples through the Minimal Kernel Harness.
- [x] 8.8 Register the model suite under normal `npm test`.

## Phase 9: Runtime Surface Parity

- [x] 9.1 RED: human and negotiated projections derived independently can diverge.
- [x] 9.2 GREEN: derive both projections from the same K2-selected transition and
  state digest.
- [x] 9.3 RED→GREEN: projection attempting to override selected operation fails closed.
- [x] 9.4 RED→GREEN: command honesty uses harness result, not only shape validation.

## Phase 10: Compatibility Bridges

- [x] 10.1 RED→GREEN: routing bridge consumes structured K2 operation without changing
  fixed route defaults.
- [x] 10.2 RED→GREEN: review-lineage fixture preserves candidate/findings/attempt history.
- [x] 10.3 RED→GREEN: archive fixture preserves transaction history and rollback semantics.
- [x] 10.4 RED→GREEN: orchestrator stops interpreting prose for operations covered by K2.
- [x] 10.5 Verify no subsystem contains a second lifecycle reducer.

## Phase 11: Verification And Evidence

- [x] 11.1 Run focused K2 tests and capture Strict TDD RED/GREEN cycles.
- [x] 11.2 Run full `npm test`.
  <!-- RE-VERIFY 2026-08-04: PASS — 1819 pass / 0 fail / 2 skipped after K1 successor carve-out + non-vacuous inv-no-duplicate-effects -->
  <!-- VERIFY 2026-08-04 (prior): FAIL — k1-scope-guard unmanifested K2 inventory (1816 pass / 1 fail) -->
- [x] 11.3 Execute mutation/seed cases for duplicate effects, dead-end recovery,
  terminal restart, event authority and model direct mutation.
- [x] 11.4 Produce `verify-report.md` mapping every MUST requirement to runtime evidence.
  <!-- RE-VERIFY: verify-report.md overwritten with PASS after remediation -->
- [x] 11.5 Run bounded 4R review without relaunching reviewers after findings freeze.
  <!-- Orchestrator-owned after verify PASS; not launched by sdd-verify -->
