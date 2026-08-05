# Delta for lifecycle-model-conformance

## ADDED Requirements

### Requirement: Executable K2.1b Issuance And Consume Invariants {#REQ-lifecycle-model-conformance-009}

The model suite MUST check these executable K2.1b invariants against the real
Minimal Kernel Harness:

1. No operation is authorized solely because the transition is state-valid.
2. No commit completes without a previously issued OperationPermit.
3. No state commit succeeds without permit consumed status recorded in the same
   Authority Store revision as next_state / next_journal / OperationReceipt.
4. Exact identical replay returns the prior OperationReceipt (no second ledger
   or receipt).
5. After in-process restart, permit consumed status and receipt remain
   verifiable from the Authority Store revision.

#### Scenario: Every K2.1b invariant has a checker

- GIVEN the model suite manifest after K2.1b
- WHEN conformance verification runs
- THEN every invariant above MUST map to an executable checker
- AND no K2.1b checker MAY be marked optional or deferred

#### Scenario: State-valid alone cannot authorize

- GIVEN a model action that is state-valid but supplies no issuer-produced permit
- WHEN the model suite explores that action
- THEN authorize MUST fail closed
- AND the checker for invariant 1 MUST pass only if rejection holds

#### Scenario: Commit without same-revision consume fails checker

- GIVEN a model trace that advances head without consumed permit in that revision
- WHEN the suite evaluates invariant 3
- THEN the checker MUST fail the trace
- AND MUST pass only when consume and receipt share the winning revision

## MODIFIED Requirements

### Requirement: Executable K2.1 Authority Invariants {#REQ-lifecycle-model-conformance-007}

The model suite MUST check these executable K2.1 invariants against the real
Minimal Kernel Harness:

1. No authoritative mutation without successful compareAndSwap.
2. Stale permits (`expected_revision` ≠ head) are rejected.
3. Consumed permits cannot be reused.
4. Ambiguous irreversible effects never blind-retry; next kind is `decide` or
   `stop`.
5. Exact replay on the same revision converges.
6. Models cannot mint or self-grant OperationPermits.
7. Direct-write paths without permit + CAS + effect class are rejected.
8. Public auto-mint is not a valid authorization path; positive advances use
   controlled-issuer permits.
9. Exact replay returns the prior OperationReceipt without a second consume.

K2.1b checkers for invariants 8–9 MUST NOT be deferred.
(Previously: seven K2.1 checkers; K2.1b adds issuer-first and receipt-stable
replay.)

#### Scenario: Every K2.1 invariant has a checker

- GIVEN the model suite manifest after K2.1
- WHEN conformance verification runs
- THEN every invariant above MUST map to an executable checker
- AND no K2.1 checker MAY be marked optional or deferred

#### Scenario: Model cannot self-grant permits

- GIVEN a model action that fabricates an OperationPermit
- WHEN the model suite explores that action
- THEN authorize MUST fail closed
- AND the checker for invariant 6 MUST record a pass only if rejection holds

#### Scenario: Auto-mint path is rejected by checker

- GIVEN a model action that relies on public mintPermit defaulting to true
- WHEN the model suite explores that action
- THEN the checker for invariant 8 MUST fail the path
- AND MUST pass only when issuer-produced permits are required
