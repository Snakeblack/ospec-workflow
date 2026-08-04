# Delta for lifecycle-model-conformance

## ADDED Requirements

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

## MODIFIED Requirements

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
