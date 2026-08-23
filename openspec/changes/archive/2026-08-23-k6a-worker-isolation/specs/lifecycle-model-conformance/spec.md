# Delta for lifecycle-model-conformance

## ADDED Requirements

### Requirement: Executable K6a Worker Isolation And Containment Invariants {#REQ-lifecycle-model-conformance-012}

The model suite MUST check all six executable K6a worker isolation invariants against the Minimal Kernel Harness and execution runtime:

1. `inv-k6a-workspace-lifecycle` MUST prove that every created workspace is tracked with status `active` and cleanly disposed with status `disposed` upon completion or teardown without directory or lock leaks.
2. `inv-k6a-capsule-determinism` MUST prove that identical source snapshot and dependency inputs produce byte-identical capsule fingerprints without extraneous files or non-dependency repository artifacts.
3. `inv-k6a-containment-fail-closed` MUST prove that any file operation (write, modify, relative path traversal `../`, or symlink escape) targeting a path outside declared `allowed_paths` halts execution fail-closed and emits a `containment-violation/v1` payload.
4. `inv-k6a-work-result-binding` MUST prove that `CaptureWorkResult` produces a canonical `WorkResult` cryptographically bound to `WorkOrderId` and `SourceSnapshotId`, and that K6a primitives never emit, accept, or return `CandidateId`.
5. `inv-k6a-interrupted-recovery-preservation` MUST prove that execution timeouts or abort signals preserve partial stdout/stderr logs and modified file inventory, producing an executable recovery state with workspace status `interrupted`.
6. `inv-k6a-host-isolation-fallback` MUST prove that host transport reporting isolation capability state as `partial` or `unavailable` executes documented fallback without silent promotion to `enforced`.

#### Scenario: Every K6a worker isolation invariant has an executable checker

- GIVEN the model suite manifest after K6a
- WHEN conformance verification runs
- THEN every invariant above MUST map to an executable checker
- AND no K6a checker MAY be marked optional or deferred

#### Scenario: Model proves containment violation halts execution fail-closed

- GIVEN a worker execution state attempting to write to a path outside declared `allowed_paths`
- WHEN the model suite checks `inv-k6a-containment-fail-closed`
- THEN execution MUST halt immediately
- AND a structured containment violation payload MUST be emitted

#### Scenario: Model proves interrupted execution preserves partial telemetry

- GIVEN a model execution encountering a timeout or process cancellation
- WHEN `inv-k6a-interrupted-recovery-preservation` runs
- THEN partial logs and modified file inventory MUST be recorded in the recovery descriptor
- AND the workspace status MUST transition to `interrupted`

---

## MODIFIED Requirements

### Requirement: Opaque Future Ports {#REQ-lifecycle-model-conformance-003}

K2.1 MAY model subject- and budget-bound invalidation through opaque values named `SubjectId` and `BudgetRef`. `OperationPermit` and Authority Store revision digests MUST be concrete enforceable artifacts, not opaque placeholders. HostCapabilities states and CapabilityProof digests MUST also be concrete enforceable artifacts under K2a. `PolicySnapshot` digests, SourceSnapshot provenance bindings, and Execution Graph compile/replay invariants MUST be concrete enforceable model structures under K4a. Node execution budgets, authority/effects limits, causal failure taxonomy, and recovery transitions MUST be concrete enforceable model structures under K5. Worker workspace lifecycle descriptors, capsule definition fingerprints, allowed_paths containment enforcement, raw WorkResult capture bindings, and interrupted recovery transitions MUST be concrete enforceable model structures under K6a. The model MUST NOT inspect or invent the future internal structure of Candidate mutation, Candidate freeze (`freezeCandidate`), candidate verification, review attestation, or delivery authorization policy.
(Previously: Live worker container execution was opaque; K6a promotes workspace lifecycle, capsule definition, allowed_paths containment, raw WorkResult capture, and interrupted recovery to concrete enforceable model checks while Candidate mutation, verification, review attestation, and delivery policy remain opaque.)

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

#### Scenario: Worker isolation and containment structures are concrete

- GIVEN a model execution state exploring workspace lifecycle, allowed_paths containment, or interrupted recovery
- WHEN the model suite checks isolation invariants
- THEN the structures MUST be evaluated as concrete verifiable model artifacts
- AND MUST NOT require Candidate freeze, review attestation, or delivery policy structures

---

### Requirement: Deferred Invariants Are Not Enforced In K2.1 {#REQ-lifecycle-model-conformance-004}

The suite MUST list, but MUST NOT claim runtime enforcement for, invariants owned by later slices, including Candidate mutation invalidation, candidate verification, review attestation, and delivery authorization. K2.1 Authority Store, OperationPermit/Receipt and effect-class invariants MUST NOT appear in the deferred list. K2a host-contract, CapabilityProof, no-silent-promotion, sole-reference-adapter and host-fault matrix invariants MUST NOT appear in the deferred list. K4a Execution Graph deterministic compile, SourceSnapshot provenance binding, PolicySnapshot digest binding, Obligation Manifest completeness, and fixture replay determinism invariants MUST NOT appear in the deferred list. K5 budget monotonicity, causal priority resolution, transition allowlist enforcement, zero-delta consumption, and honest recovery blocking fingerprint advancement invariants MUST NOT appear in the deferred list. K6a workspace lifecycle management, minimal capsule determinism, allowed_paths containment enforcement, WorkResult cryptographic binding, interrupted execution preservation, and host isolation fallback invariants MUST NOT appear in the deferred list.
(Previously: live worker runtime execution was deferred; K6a promotes workspace lifecycle, capsule determinism, allowed_paths containment, WorkResult binding, interrupted recovery, and host isolation fallback to non-deferred enforced invariants.)

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

#### Scenario: K6a worker isolation and containment invariants are not deferred

- GIVEN the deferred-invariant inventory
- WHEN it is inspected for workspace lifecycle, capsule determinism, allowed_paths containment, WorkResult binding, or interrupted recovery
- THEN those items MUST be absent from the deferred list
- AND MUST appear among executable K6a checkers
