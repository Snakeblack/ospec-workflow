# lifecycle-model-conformance Specification

## Purpose

Explore a bounded lifecycle state/action space and prove K2 invariants against the
real Minimal Kernel Harness without pretending to implement future Candidate,
budget, policy or delivery surfaces.

## Requirements

### Requirement: Reduced Model Is Explicit And Bounded {#REQ-lifecycle-model-conformance-001}

K2 MUST define a reduced lifecycle model with finite state domains, actions and
bounds. The model MUST document every abstraction from production state and MUST
be small enough for exhaustive or near-exhaustive exploration in CI.

#### Scenario: Model bounds are published

- GIVEN the model conformance suite
- WHEN its configuration is inspected
- THEN state domains, action set, depth/visit limits and abstraction mapping MUST
  be explicit and versioned

### Requirement: Executable K2 Invariants {#REQ-lifecycle-model-conformance-002}

The model suite MUST check all executable K2 invariants:

1. Same state produces the same ordered transitions.
2. Invalid transitions fail closed.
3. Replay does not duplicate effects.
4. Named recovery advances or terminates.
5. Models cannot directly mutate lifecycle state.
6. Terminal exhaustion cannot restart the same operation implicitly.
7. Events do not alter authoritative state.
8. A terminal state has no non-recovery execution transition.

#### Scenario: Every executable invariant has a checker

- GIVEN the model suite manifest
- WHEN K2 verification runs
- THEN every invariant above MUST map to an executable checker
- AND no checker MAY be marked optional

### Requirement: Opaque Future Ports {#REQ-lifecycle-model-conformance-003}

K2 MAY model subject-, authority-, budget- and policy-bound invalidation only
through opaque values named `SubjectId`, `AuthorityToken`, `BudgetRef` and
`PolicyRef`. The model MUST NOT inspect or invent the future internal structure of
Candidate, productive budget, PolicySnapshot, attestation or authorization.

#### Scenario: Subject change invalidates bound decision abstractly

- GIVEN a decision bound to opaque SubjectId A
- WHEN the model changes the authoritative subject to opaque SubjectId B
- THEN the previous decision MUST be stale
- AND no Candidate or delivery fields MUST be required

### Requirement: Deferred Invariants Are Not Enforced In K2 {#REQ-lifecycle-model-conformance-004}

The suite MUST list, but MUST NOT claim runtime enforcement for, invariants owned
by later slices, including Candidate mutation invalidation, productive correction
budget monotonicity, delivery authorization and policy-bound attestation
invalidation.

#### Scenario: Deferred invariant cannot satisfy K2 gate

- GIVEN a future invariant represented only by a placeholder or stub
- WHEN K2 conformance is evaluated
- THEN that placeholder MUST NOT be counted as an enforced K2 invariant

### Requirement: Counterexamples Replay Through Harness {#REQ-lifecycle-model-conformance-005}

Every model counterexample MUST emit a stable action trace and seed. The trace MUST
be replayable through the Minimal Kernel Harness, or the report MUST identify the
specific abstraction that prevents direct replay.

#### Scenario: Counterexample is reproducible

- GIVEN the model finds an invariant violation
- WHEN its emitted trace is replayed through the harness
- THEN the same violation MUST reproduce
- OR the result MUST fail with a documented abstraction mismatch rather than
  silently passing

### Requirement: Model Suite Runs In CI {#REQ-lifecycle-model-conformance-006}

The bounded model suite MUST run under the repository's normal test command and
MUST NOT require TLA+, PlusCal, Alloy or an external service.

#### Scenario: Standard test command includes model exploration

- GIVEN a clean repository checkout with Node.js 22+
- WHEN `npm test` runs
- THEN the model conformance suite MUST execute
