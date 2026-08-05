# Delta for lifecycle-kernel-runtime

## ADDED Requirements

### Requirement: Public Entrypoint Does Not Auto-Mint Permits {#REQ-lifecycle-kernel-runtime-015}

The public authoritative entrypoint (`runKernelOperation` and equivalent public
mutating APIs) MUST default `mintPermit` to `false`. Mutating operations MUST
require a previously issued OperationPermit from the controlled issuer. Zero
operations MAY be authorized solely because the transition is state-valid. Zero
commits MAY complete without a previously issued permit.

#### Scenario: Default mintPermit is false

- GIVEN a public runKernelOperation call with no mintPermit override
- WHEN the call is constructed
- THEN mintPermit MUST default to false
- AND the call MUST NOT auto-mint an OperationPermit

#### Scenario: State-valid transition without permit fails

- GIVEN a reducer action that is state-valid for the current head
- AND no previously issued OperationPermit is presented
- WHEN the public mutating entrypoint runs
- THEN authorize MUST fail closed
- AND the Authority Store head MUST remain unchanged

#### Scenario: Commit requires previously issued permit

- GIVEN a state-valid mutation request
- AND mintPermit remains false
- AND no issuer-produced permit is supplied
- WHEN commit is attempted
- THEN the commit MUST fail closed
- AND no compareAndSwap success MUST be recorded

### Requirement: Successful Commit Requires Atomic Permit Consume {#REQ-lifecycle-kernel-runtime-016}

The imperative shell MUST commit authoritative mutations only when permit
consumed status and OperationReceipt are part of the same successful
`compareAndSwap` revision as `next_state` and `next_journal`. If consume cannot
be included in that CAS, the operation MUST fail closed without advancing the
head. Exact identical replay MUST return the prior OperationReceipt.

#### Scenario: CAS success includes consumed permit and receipt

- GIVEN an issuer-produced valid permit matching head revision R
- WHEN the public mutating entrypoint completes successfully
- THEN the winning revision MUST record next_state, next_journal, consumed
  permit status, and OperationReceipt together
- AND a post-CAS-only consume map MUST NOT be the sole authority

#### Scenario: Missing atomic consume fails closed

- GIVEN an issuer-produced valid permit
- WHEN CAS cannot persist consume + receipt with next_state/journal
- THEN the operation MUST fail closed
- AND the head MUST remain at the pre-attempt revision
- AND operation_receipt MUST NOT imply a committed advance

#### Scenario: Exact replay returns prior receipt

- GIVEN a completed authorized operation with stored OperationReceipt Rc
- WHEN the exact identical operation is replayed through the public entrypoint
- THEN the response MUST return Rc
- AND MUST NOT mint or consume a new permit for that replay

## MODIFIED Requirements

### Requirement: TransitionOffer Never Authorizes Mutation {#REQ-lifecycle-kernel-runtime-011}

A `TransitionOffer` from `next_transition` MUST NOT authorize mutation by
itself. Authorization MUST require a separately issued `OperationPermit` from
the controlled issuer. Issuance MUST require TransitionOffer plus exactly one of
`PolicyDecision`, `HumanDecision`, or `KernelRule`, plus `expected_revision`.
Offers MUST NOT be sufficient inputs for auto-mint on the public mutating path.
(Previously: offers MAY feed minting with digests; K2.1b requires controlled
issuer inputs and forbids public auto-mint.)

#### Scenario: Offer-only authorize fails

- GIVEN a TransitionOffer for operation O
- WHEN authorize is invoked with the offer and no OperationPermit
- THEN authorize MUST fail closed
- AND no compareAndSwap MUST run

#### Scenario: Offer without decision or rule cannot issue

- GIVEN a TransitionOffer and expected_revision R
- AND no PolicyDecision, HumanDecision, or KernelRule
- WHEN the controlled issuer is invoked
- THEN issuance MUST fail closed
- AND no OperationPermit MUST be returned
