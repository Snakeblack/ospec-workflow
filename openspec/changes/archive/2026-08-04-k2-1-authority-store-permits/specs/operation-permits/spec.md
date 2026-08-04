# operation-permits Specification

## Purpose

Define revision-bound, single-use `OperationPermit` and mechanical
`OperationReceipt` artifacts that authorize and acknowledge mutations without
conflating them with `TransitionOffer`, attestation, or delivery authorization.

## Requirements

### Requirement: Three Distinct Authority Artifacts {#REQ-operation-permits-001}

The runtime MUST treat `TransitionOffer`, `OperationPermit`, and
`OperationReceipt` as distinct kinds. A `TransitionOffer` MUST describe a
possible operation only. An `OperationPermit` MUST authorize one concrete
mutation. An `OperationReceipt` MUST record mechanical completion only. None of
these three MUST be accepted as Candidate Evaluation Attestation or Delivery
Authorization.

#### Scenario: TransitionOffer alone cannot mutate

- GIVEN a valid TransitionOffer for an operation
- AND no OperationPermit has been minted
- WHEN a mutation is requested using only the offer
- THEN the authorize boundary MUST reject the mutation
- AND authoritative state MUST remain unchanged

#### Scenario: OperationReceipt is not attestation or delivery

- GIVEN a valid OperationReceipt for a completed mutation
- WHEN attestation or delivery authorization is evaluated
- THEN the receipt MUST NOT satisfy those gates
- AND the evaluator MUST require the distinct later-slice artifact

### Requirement: Permit Schema Is Revision Bound And Single Use {#REQ-operation-permits-002}

An `OperationPermit` MUST include at least: `permit_id`, `domain`, `operation`,
`subject_id`, `expected_revision`, `arguments_digest`, `scope_digest`,
`policy_digest`, `budget_ref`, and `single_use=true`. The permit MUST bind to the
head revision at mint time. Consuming a permit MUST be single-use.

#### Scenario: Valid permit carries required fields

- GIVEN a runtime-minted OperationPermit
- WHEN the permit is validated against the permit schema
- THEN validation MUST succeed
- AND `single_use` MUST be true
- AND `expected_revision` MUST equal the subject head at mint

#### Scenario: Stale permit is rejected

- GIVEN a permit whose `expected_revision` differs from the current head
- WHEN authorize or consume runs
- THEN the permit MUST be rejected as stale
- AND no mutation MUST occur

#### Scenario: Permit reuse is rejected

- GIVEN a permit already consumed into an OperationReceipt
- WHEN the same permit_id is presented again to authorize a mutation
- THEN the attempt MUST fail closed
- AND the head MUST remain unchanged

### Requirement: Runtime Owns Permit Minting {#REQ-operation-permits-003}

Only the kernel runtime MUST mint OperationPermits. Models, human projections,
events, and host adapters MUST NOT mint or self-grant permits. A non-empty
legacy AuthorityToken MUST NOT be treated as an OperationPermit.

#### Scenario: Model self-grant is rejected

- GIVEN model output that embeds a fabricated OperationPermit
- WHEN the authorize boundary evaluates the mutation
- THEN the permit MUST be rejected as non-runtime-issued
- AND authoritative state MUST remain unchanged

#### Scenario: Non-empty AuthorityToken is not a permit

- GIVEN a non-empty AuthorityToken without a runtime-minted OperationPermit
- WHEN a mutation is requested
- THEN authorize MUST fail closed
- AND MUST NOT treat the token as sufficient authority

### Requirement: Receipt Records Mechanical Completion Only {#REQ-operation-permits-004}

Consuming a valid permit on mechanical completion MUST emit an
`OperationReceipt` distinct from schema family `receipt/v1`. The receipt MUST
reference the consumed `permit_id` and MUST NOT claim evaluation or delivery
authority. `receipt/v1` MUST NOT be reused as OperationReceipt.

#### Scenario: Successful consume emits OperationReceipt

- GIVEN a valid unused permit matching the head revision
- WHEN the authorized mutation completes mechanically
- THEN an OperationReceipt MUST be emitted
- AND it MUST reference the consumed permit_id
- AND its kind MUST NOT equal receipt/v1

#### Scenario: receipt/v1 is not accepted as OperationReceipt

- GIVEN a payload valid only as receipt/v1
- WHEN it is presented as an OperationReceipt
- THEN validation MUST fail
- AND the payload MUST NOT authorize further mutation
