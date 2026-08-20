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

K2.1 MAY model subject- and budget-bound invalidation through opaque values named `SubjectId` and `BudgetRef`. `OperationPermit` and Authority Store revision digests MUST be concrete enforceable artifacts, not opaque placeholders. HostCapabilities states and CapabilityProof digests MUST also be concrete enforceable artifacts under K2a. `PolicySnapshot` digests, SourceSnapshot provenance bindings, and Execution Graph compile/replay invariants MUST be concrete enforceable model structures under K4a. Node execution budgets, authority/effects limits, causal failure taxonomy, and recovery transitions MUST be concrete enforceable model structures under K5. The model MUST NOT inspect or invent the future internal structure of Candidate mutation, live worker container runtime execution authority, attestation or delivery authorization policy.
(Previously: Productive budget envelopes and causal recovery structures were opaque; K5 promotes execution budgets, authority/effects limits, causal failure taxonomy, and recovery transitions to concrete enforceable model checks while Candidate mutation, live worker authority, and delivery policy remain opaque.)

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

#### Scenario: PolicySnapshot and Execution Graph compile structures are concrete

- GIVEN a PolicySnapshot missing policy_bundle_digest or effective_rules
- WHEN the model suite checks graph compile validity
- THEN compile validation MUST fail closed
- AND MUST NOT require live worker execution authority

#### Scenario: Execution budget and causal recovery structures are concrete

- GIVEN a model execution state exploring node budget exhaustion or causal failure recovery
- WHEN the model suite checks budget monotonicity and recovery transitions
- THEN the structures MUST be evaluated as concrete verifiable model artifacts
- AND MUST NOT require live worker container execution authority

### Requirement: Deferred Invariants Are Not Enforced In K2.1 {#REQ-lifecycle-model-conformance-004}

The suite MUST list, but MUST NOT claim runtime enforcement for, invariants owned by later slices, including Candidate mutation invalidation, delivery authorization, and live worker runtime container execution. K2.1 Authority Store, OperationPermit/Receipt and effect-class invariants MUST NOT appear in the deferred list. K2a host-contract, CapabilityProof, no-silent-promotion, sole-reference-adapter and host-fault matrix invariants MUST NOT appear in the deferred list. K4a Execution Graph deterministic compile, SourceSnapshot provenance binding, PolicySnapshot digest binding, Obligation Manifest completeness, and fixture replay determinism invariants MUST NOT appear in the deferred list. K5 budget monotonicity, causal priority resolution, transition allowlist enforcement, zero-delta consumption, and honest recovery blocking fingerprint advancement invariants MUST NOT appear in the deferred list.
(Previously: correction budget monotonicity and recovery invariants were deferred; K5 promotes budget monotonicity, causal priority resolution, zero-delta consumption, and honest recovery blocking fingerprint advancement to non-deferred enforced invariants.)

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

#### Scenario: K4a Execution Graph and replay invariants are not deferred

- GIVEN the deferred-invariant inventory
- WHEN it is inspected for deterministic Graph ID binding, PolicySnapshot effective rules, Obligation Manifest completeness, or fixture replay convergence
- THEN those items MUST be absent from the deferred list
- AND MUST appear among executable K4a checkers

#### Scenario: K5 budget and recovery invariants are not deferred

- GIVEN the deferred-invariant inventory
- WHEN it is inspected for budget monotonicity, causal priority resolution, zero-delta consumption, or honest recovery fingerprint advancement
- THEN those items MUST be absent from the deferred list
- AND MUST appear among executable K5 checkers

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

### Requirement: Executable K4a Execution Graph Compile And Replay Invariants {#REQ-lifecycle-model-conformance-010}

The model suite MUST check these executable K4a invariants against the Minimal Kernel Harness and Execution Graph compiler:

1. Deterministic Graph ID binding: identical change contract digest + identical PolicySnapshot + identical SourceSnapshot ID produce identical Graph ID.
2. Policy divergence: identical change contract + divergent effectiveRules produce distinct PolicySnapshot and Graph IDs.
3. Obligation Manifest coverage: every contract MUST obligation has non-empty `implemented_by` and `required_evidence`, or explicit recorded deferral.
4. Clarify invalidation boundary: ClarifyEvent invalidates strictly declared descendant nodes in the DAG, preserving unaffected ancestor and sibling states.
5. Replay convergence: fixture replay under identical inputs produces identical outcome state without state mutation.
6. Shadow non-interference: shadow compilation executes alongside fixed routing on identical inputs with zero mutation of active workflow state.
7. No live worker execution authority and atomic provenance binding: compilation and replay operate strictly on declarative shapes without issuing runtime execution authority, enforcing atomic graph validation and exact SourceSnapshot binding.

#### Scenario: Every K4a invariant has an executable checker

- GIVEN the model suite manifest after K4a
- WHEN conformance verification runs
- THEN every invariant above MUST map to an executable checker
- AND no K4a checker MAY be marked optional or deferred

#### Scenario: Graph ID divergence upon policy rule modification

- GIVEN a model execution with fixed contract and modified effectiveRules in PolicySnapshot
- WHEN the model suite checks compile invariants
- THEN the checker for invariant 2 MUST verify that distinct Graph IDs are generated

#### Scenario: Non-interference checker verifies zero active state mutation

- GIVEN a model execution exploring shadow comparison paths
- WHEN the model suite checks invariant 6
- THEN the checker MUST verify that active state and journal remain unmodified

---

### Requirement: Executable K5 Budget Monotonicity And Causal Recovery Invariants {#REQ-lifecycle-model-conformance-011}

The model suite MUST check all seven executable K5 invariants against full runtime composition (including `createKernelRuntime`, `runKernelOperation`, Authority Store CAS, `transition-selector`, `reducer`, and `permit-authority` ledger), verifying end-to-end integration rather than isolated pure functions:

1. `inv-k5-budget-monotonicity`: verifies that no execution or authority budget increases across runtime operations, CAS race reconciliations, or repair loops under real store/CAS execution.
2. `inv-k5-causal-priority`: verifies that mixed failure sets resolve to the highest-priority causal category (`environment_tooling > cas_conflict > ambiguous_effect > validation_gap > code_defect`) through the runtime resolver without blaming code for environment faults.
3. `inv-k5-allowlist-enforcement`: verifies that the runtime and selector strictly emit and enforce allowlisted recovery transitions (`repair`, `replan`, `escalate`, `stop`) without unallowlisted operations or silent `decide` substitutions.
4. `inv-k5-zero-delta-consumption`: verifies that zero-delta mutations decrement attempt and turn quotas monotonically within `runKernelOperation` before CAS commit.
5. `inv-k5-budget-exhaustion-terminal`: verifies that unified `isBudgetExhausted()` evaluation across all 6 node and 4 authority dimensions deterministically prevents identical worker re-launch and forces `escalate` or `stop` in selector and runtime.
6. `inv-k5-honest-recovery-advancement`: verifies that recovery transitions advance the `blockingFingerprint` or terminate, rejecting stagnant recovery loops fail-closed in runtime execution.
7. `inv-k5-telemetry-isolation`: verifies that transient consumption counters and telemetry metrics do not alter authoritative semantic state digests or CAS revision hashes.

(Previously: K5 invariant checkers evaluated unit-level helper functions in isolation rather than full runtime, store, permit ledger, and CAS composition.)

#### Scenario: Every K5 invariant has an executable checker evaluating real runtime composition

- GIVEN the model suite manifest after K5
- WHEN conformance verification runs
- THEN every one of the 7 invariants above MUST map to an executable checker executing real runtime/CAS composition
- AND no K5 checker MAY be marked optional, stubbed, or deferred

#### Scenario: Budget monotonicity verified across real CAS conflict traces

- GIVEN a model execution exploring CAS race reconciliation against an Authority Store
- WHEN the model suite checks invariant `inv-k5-budget-monotonicity`
- THEN the checker MUST verify through runtime execution that remaining budgets are strictly non-increasing and never reset

#### Scenario: Causal priority resolver prevents code blame on tooling fault

- GIVEN a model trace with co-occurring tool timeout and code assertion failure
- WHEN the causal priority checker `inv-k5-causal-priority` runs
- THEN the checker MUST verify that the primary failure resolves to `environment_tooling`

#### Scenario: Exhausted budget terminality evaluates full six-node and four-authority dimensions

- GIVEN a model execution with exhausted budget dimensions evaluated via `isBudgetExhausted()`
- WHEN `inv-k5-budget-exhaustion-terminal` executes
- THEN the checker MUST verify that the runtime and selector reject normal execution transitions and force terminal `escalate` or `stop`
