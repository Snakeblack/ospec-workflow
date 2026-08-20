# Delta for lifecycle-model-conformance

## ADDED Requirements

### Requirement: Executable K5 Budget Monotonicity And Causal Recovery Invariants {#REQ-lifecycle-model-conformance-011}

The model suite MUST check these executable K5 invariants against the Minimal Kernel Harness:

1. Budget monotonicity: no execution or authority budget increases across retries, CAS race reconciliations, or repair loops.
2. Causal priority resolution: mixed failure sets always resolve to the highest-priority causal category (`environment_tooling > cas_conflict > ambiguous_effect > validation_gap > code_defect`) without blaming code for environment faults.
3. Allowlisted transition enforcement: failure recovery transitions strictly follow the allowlisted transition matrix (`repair`, `replan`, `escalate`, `stop`).
4. Zero-delta attempt consumption: zero-delta mutations decrement attempt quotas monotonically.
5. Exhausted budget terminality: exhausted budgets deterministically prevent identical worker re-launch and force `escalate` or `stop`.
6. Honest recovery: every recovery transition advances the `blockingFingerprint` or terminates.
7. Non-semantic telemetry isolation: consumption counters and metrics do not mutate semantic state digests.

#### Scenario: Every K5 invariant has an executable checker

- GIVEN the model suite manifest after K5
- WHEN conformance verification runs
- THEN every invariant above MUST map to an executable checker
- AND no K5 checker MAY be marked optional or deferred

#### Scenario: Budget monotonicity verified across CAS conflict traces

- GIVEN a model execution exploring CAS race reconciliation
- WHEN the model suite checks budget monotonicity
- THEN the checker MUST verify that remaining budgets are non-increasing and never reset

#### Scenario: Causal priority resolver prevents code blame on tooling fault

- GIVEN a model trace with co-occurring tool timeout and code assertion failure
- WHEN the causal priority checker runs
- THEN the checker MUST verify that the primary failure resolves to `environment_tooling`

---

## MODIFIED Requirements

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

---

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
