# Delta for lifecycle-kernel-runtime

## ADDED Requirements

### Requirement: Mutations Require Permit And CAS {#REQ-lifecycle-kernel-runtime-010}

Every authoritative lifecycle mutation MUST require a runtime-minted
`OperationPermit` whose `expected_revision` matches the Authority Store head,
and MUST commit exclusively via `compareAndSwap`. Zero mutations MAY complete
without both permit authorization and CAS success.

#### Scenario: Mutation without permit is rejected

- GIVEN a valid reducer action projection
- AND no runtime-minted OperationPermit
- WHEN the shell attempts to commit the next state
- THEN the commit MUST fail closed
- AND the Authority Store head MUST remain unchanged

#### Scenario: Mutation without CAS is rejected

- GIVEN a valid OperationPermit
- WHEN a commit path that bypasses compareAndSwap is attempted
- THEN the path MUST be rejected or unreachable
- AND the journal MUST NOT record a successful authoritative advance

### Requirement: TransitionOffer Never Authorizes Mutation {#REQ-lifecycle-kernel-runtime-011}

A `TransitionOffer` from `next_transition` MUST NOT authorize mutation by
itself. Authorization MUST require a separately minted `OperationPermit`.
Offers MAY be inputs to permit minting when combined with head revision and
required digests.

#### Scenario: Offer-only authorize fails

- GIVEN a TransitionOffer for operation O
- WHEN authorize is invoked with the offer and no OperationPermit
- THEN authorize MUST fail closed
- AND no compareAndSwap MUST run

### Requirement: Effect Intents Carry Effect Class {#REQ-lifecycle-kernel-runtime-012}

Effect intents returned by the lifecycle reducer MUST include an effect class
from `{pure, idempotent-keyed, probeable, compensatable, irreversible}`. The
imperative shell MUST refuse to execute an effect intent lacking a valid class.

#### Scenario: Reducer emits classed effect intent

- GIVEN a valid authorized action that requires an external effect
- WHEN the reducer runs
- THEN each emitted effect intent MUST include exactly one valid effect class
- AND the shell MUST NOT execute until that class is present

## MODIFIED Requirements

### Requirement: Authority Is Runtime-Owned {#REQ-lifecycle-kernel-runtime-006}

Only authorized kernel operations MAY mutate lifecycle state. Human
projections, model responses, events and host adapters MUST NOT directly set
lifecycle status, grant OperationPermits, mint authority artifacts, or mark
operations approved. A non-empty legacy AuthorityToken MUST NOT be treated as
mutation authority; only a runtime-minted OperationPermit plus CAS MAY authorize
an authoritative advance. Models MUST NOT self-grant permits.
(Previously: non-empty authority tokens could be described as the authorize
surface; K2.1 closes token≠permit and requires OperationPermit + CAS.)

#### Scenario: Model output attempts direct state mutation

- GIVEN model output containing a requested terminal status
- WHEN the output is presented without an authorized kernel operation
- THEN authoritative state MUST remain unchanged
- AND the attempt MUST be rejected or treated as non-authoritative input

#### Scenario: Model-fabricated permit is rejected

- GIVEN model output embedding a self-granted OperationPermit
- WHEN authorize evaluates the mutation
- THEN the permit MUST be rejected
- AND authoritative state MUST remain unchanged

#### Scenario: Non-empty AuthorityToken without permit fails

- GIVEN a non-empty AuthorityToken and no runtime-minted OperationPermit
- WHEN a mutation is requested
- THEN authorize MUST fail closed
- AND MUST NOT treat the token as sufficient authority
