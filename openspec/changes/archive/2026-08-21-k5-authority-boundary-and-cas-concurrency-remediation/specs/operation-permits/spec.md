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

---

### Requirement: Controlled Issuer Issues Permits {#REQ-operation-permits-005}

Permit issuance MUST occur only through a controlled runtime issuer that accepts a `TransitionOffer` plus exactly one of `PolicyDecision`, `HumanDecision`, or `KernelRule`, plus `expected_revision`, and returns an `OperationPermit`. The controlled issuer MUST query the Authority Store for `expected_revision`, evaluate node budget and authority effect budget exhaustion via `isBudgetExhausted()`, and validate causal recovery allowlists via `validateRecoveryTransition()` prior to issuing an `OperationPermit`. If `expected_revision` does not match the Authority Store head revision, if any node or authority budget is exhausted, or if the offered transition is not allowlisted for the active causal failure, the issuer MUST fail closed and refuse permit issuance. State-validity of the offered transition alone MUST NOT authorize issuance or mutation. Models, hosts, and public mutating entrypoints MUST NOT self-grant or auto-mint permits.
(Previously: Controlled issuer evaluated offer and decision with budget checks but did not mandate querying Authority Store head revision or enforcing causal recovery allowlists prior to permit issuance.)

#### Scenario: Issuer produces permit from offer plus decision when Authority Store head, budget, and causal allowlist pass

- GIVEN a valid TransitionOffer, positive remaining budget quotas, and a PolicyDecision (or HumanDecision or KernelRule) bound to expected_revision R
- AND the Authority Store head revision matches R
- AND the transition is allowlisted under the causal recovery matrix
- WHEN the controlled issuer runs
- THEN it MUST return a runtime-owned OperationPermit with expected_revision R
- AND the permit MUST NOT be minted by the public mutating entrypoint

#### Scenario: State-valid offer alone does not issue

- GIVEN a TransitionOffer that is state-valid for the current head
- AND no PolicyDecision, HumanDecision, or KernelRule is supplied
- WHEN issuance is attempted
- THEN the issuer MUST fail closed
- AND no OperationPermit MUST exist for that attempt

#### Scenario: Issuer refuses permit when node or authority budget is exhausted in Authority Store

- GIVEN a valid TransitionOffer and PolicyDecision
- AND the target node or authority budget in the Authority Store state is exhausted (`isBudgetExhausted()` returns `exhausted: true`)
- WHEN permit issuance is attempted through the controlled issuer
- THEN the issuer MUST fail closed
- AND MUST NOT return or mint an OperationPermit

#### Scenario: Issuer refuses permit on Authority Store revision mismatch or causal allowlist violation

- GIVEN a valid TransitionOffer and PolicyDecision
- AND expected_revision differs from the Authority Store head OR the transition violates the causal recovery allowlist
- WHEN permit issuance is attempted through the controlled issuer
- THEN the issuer MUST fail closed
- AND MUST NOT return or mint an OperationPermit

---

### Requirement: Consume And Receipt Are Revision Authoritative {#REQ-operation-permits-006}

Consuming an OperationPermit and emitting its OperationReceipt MUST be recorded
in the same Authority Store revision that commits `next_state` and
`next_journal`. A failed consume MUST NOT leave committed authoritative state
without a consumed permit. Exact identical replay of a completed authorized
operation MUST return the prior OperationReceipt and MUST NOT mint a second
ledger entry or receipt. After in-process restart under the K2.1 process-local
durability model, permit consumed status and receipt MUST remain verifiable
from the Authority Store revision.

#### Scenario: Successful consume records receipt in winning revision

- GIVEN a valid unused issuer-produced permit matching head revision R
- WHEN the authorized mutation commits successfully
- THEN the winning revision MUST record permit status consumed
- AND MUST record the OperationReceipt referencing that permit_id
- AND MUST record next_state and next_journal in that same revision

#### Scenario: Failed consume does not leave orphan committed state

- GIVEN a valid unused permit matching head revision R
- WHEN consume cannot be recorded as part of the successful CAS
- THEN the authoritative head MUST remain at R
- AND no OperationReceipt MUST be treated as committed for that attempt

#### Scenario: Exact identical replay returns prior receipt

- GIVEN a completed mutation whose OperationReceipt is already recorded in the
  authority-store revision
- WHEN the exact same authorized operation is replayed
- THEN the runtime MUST return that prior OperationReceipt
- AND MUST NOT mint a new permit consume or second receipt

#### Scenario: In-process restart keeps permit and receipt verifiable

- GIVEN a process-local Authority Store revision that recorded consumed permit
  status and OperationReceipt
- WHEN the process restarts and reloads that subject
- THEN permit consumed status and receipt MUST remain verifiable from the
  loaded revision
- AND multi-process durable ledger behavior MUST NOT be required
