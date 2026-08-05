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

K2.1 MAY model subject-, budget- and policy-bound invalidation through opaque
values named `SubjectId`, `BudgetRef` and `PolicyRef`. `OperationPermit` and
Authority Store revision digests MUST be concrete enforceable artifacts, not
opaque placeholders. HostCapabilities states and CapabilityProof digests MUST
also be concrete enforceable artifacts under K2a. The model MUST NOT inspect or
invent the future internal structure of Candidate, productive budget envelopes,
PolicySnapshot, attestation or delivery authorization policy.
(Previously: HostCapabilities remained future/opaque; K2a promotes capability
states and CapabilityProof to concrete checks while Candidate/attestation/
delivery policy remain opaque.)

#### Scenario: Subject change invalidates bound decision abstractly

- GIVEN a decision bound to opaque SubjectId A
- WHEN the model changes the authoritative subject to opaque SubjectId B
- THEN the previous decision MUST be stale
- AND no Candidate or delivery fields MUST be required

#### Scenario: Opaque AuthorityToken is insufficient for mutation

- GIVEN only an opaque non-empty AuthorityToken without a concrete permit
- WHEN the model attempts an authoritative mutation
- THEN the attempt MUST fail closed under K2.1 checkers
- AND MUST NOT count as an authorized advance

#### Scenario: CapabilityProof fields are concrete

- GIVEN a CapabilityProof missing evidence_digest
- WHEN the model suite checks enforcement eligibility
- THEN enforcement MUST fail closed
- AND MUST NOT require Candidate or delivery authorization fields

### Requirement: Deferred Invariants Are Not Enforced In K2.1 {#REQ-lifecycle-model-conformance-004}

The suite MUST list, but MUST NOT claim runtime enforcement for, invariants
owned by later slices, including Candidate mutation invalidation, productive
correction budget monotonicity, delivery authorization and policy-bound
attestation invalidation. K2.1 Authority Store, OperationPermit/Receipt and
effect-class invariants MUST NOT appear in the deferred list. K2a host-contract,
CapabilityProof, no-silent-promotion, sole-reference-adapter and host-fault
matrix invariants MUST NOT appear in the deferred list.
(Previously: deferred list excluded only K2.1 CAS/permit/effect surfaces; K2a
host-agnostic invariants are now also enforced.)

#### Scenario: Deferred invariant cannot satisfy K2.1 gate

- GIVEN a future invariant represented only by a placeholder or stub
- WHEN K2.1 conformance is evaluated
- THEN that placeholder MUST NOT be counted as an enforced K2.1 invariant

#### Scenario: CAS and permit invariants are not deferred

- GIVEN the deferred-invariant inventory
- WHEN it is inspected for Authority Store CAS, OperationPermit single-use, or
  ambiguous irreversible retry bans
- THEN those items MUST be absent from the deferred list
- AND MUST appear among executable K2.1 checkers

#### Scenario: K2a host invariants are not deferred

- GIVEN the deferred-invariant inventory
- WHEN it is inspected for no concrete host imports, CapabilityProof-gated
  enforcement, or no silent promotion
- THEN those items MUST be absent from the deferred list
- AND MUST appear among executable K2a checkers

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

### Requirement: Executable K2a Host-Agnostic Invariants {#REQ-lifecycle-model-conformance-008}

The model suite MUST check these executable K2a invariants against the real
Minimal Kernel Harness and/or Headless Conformance Host public entrypoints:

1. Lifecycle/Graph/receipt modules have zero concrete host product imports.
2. Capabilities in `unavailable` or `instructional` never silently become
   `enforced`.
3. `enforced` requires a verifying CapabilityProof
   (adapter_version + host_version + fixture + evidence_digest).
4. Adapters that duplicate lifecycle or Graph semantics are rejected.
5. Exactly one real product adapter (`claude`) is activated; others remain
   inactive.
6. Host-fault matrix covers timeout, cancel, worker fail, and interrupt.

#### Scenario: Every K2a invariant has a checker

- GIVEN the model suite manifest after K2a
- WHEN conformance verification runs
- THEN every invariant above MUST map to an executable checker
- AND no K2a checker MAY be marked optional or deferred

#### Scenario: Silent promotion is rejected by checker

- GIVEN a model action that promotes `unavailable` to `enforced` without proof
- WHEN the model suite explores that action
- THEN the checker for invariant 2 MUST fail the promotion
- AND MUST record a pass only if refusal holds

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
