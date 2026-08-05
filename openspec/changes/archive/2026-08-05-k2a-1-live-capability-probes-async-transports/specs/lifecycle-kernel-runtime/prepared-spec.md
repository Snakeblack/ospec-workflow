# lifecycle-kernel-runtime Specification

## Purpose

Provide one host-agnostic, authoritative lifecycle runtime that derives status,
ordered transitions, recovery and events from persisted state while keeping
effects explicit and replay-safe.

## Requirements

### Requirement: Deterministic Status And Ordered Transitions {#REQ-lifecycle-kernel-runtime-001}

For the same normalized authoritative state and kernel version, the runtime MUST
produce the same status digest and the same ordered list of valid transitions.
Transition ordering MUST NOT depend on object insertion order, filesystem listing
order, timestamps generated during evaluation, model output or target host.

#### Scenario: Equivalent state produces identical transitions

- GIVEN two lifecycle states with identical semantic content but different JSON
  property insertion order
- WHEN `status` and `next_transition` are evaluated
- THEN their state digests MUST match
- AND their ordered transition projections MUST be byte-equivalent

#### Scenario: Material state change changes the projection

- GIVEN one committed lifecycle state
- AND a second state with a materially different operation status
- WHEN both are evaluated
- THEN the status digest or ordered transitions MUST differ


### Requirement: Invalid Transitions Fail Closed {#REQ-lifecycle-kernel-runtime-002}

The kernel MUST reject an operation that is not valid for the current state. The
rejection MUST include a stable reason code, current state digest and allowed
next operations. Rejection MUST NOT mutate state, journal or events.

#### Scenario: Completing an operation that was never started

- GIVEN an operation in `pending`
- WHEN `complete` is requested without a valid preceding `start`
- THEN the request MUST fail closed
- AND the state digest MUST remain unchanged
- AND the response MUST expose a stable invalid-transition reason


### Requirement: Pure Reducer And Explicit Effects {#REQ-lifecycle-kernel-runtime-003}

The lifecycle reducer MUST be a pure function of normalized state and authorized
action. It MUST return a new state plus ordered effect intents and derived event
descriptors. It MUST NOT perform filesystem, process, network, clock or random
I/O directly.

#### Scenario: Reducer emits effect intent without executing it

- GIVEN a valid action that requires persistence or a command
- WHEN the reducer runs
- THEN it MUST return an explicit effect intent
- AND no external effect MUST occur until the imperative shell executes it


### Requirement: Replay-Safe Operation Journal {#REQ-lifecycle-kernel-runtime-004}

Every effectful operation MUST have stable operation and effect idempotency keys.
The journal MUST distinguish planned, started, completed and failed effects.
Reconciliation after interruption MUST NOT execute a completed effect twice.

#### Scenario: Replay after effect completion before state finalization

- GIVEN an effect was journaled as completed
- AND interruption occurred before final state persistence
- WHEN reconciliation replays the operation
- THEN the completed effect MUST NOT execute again
- AND the authoritative state MUST converge to the expected post-effect state


### Requirement: Recovery Advances Or Terminates {#REQ-lifecycle-kernel-runtime-005}

A recovery transition MAY be advertised only when executing its named operation
can either advance lifecycle state or produce an explicit terminal outcome. A
recovery MUST NOT return the same blocking state with a refreshed attempt counter
or equivalent implicit loop.

#### Scenario: Named recovery advances

- GIVEN a recoverable interrupted operation
- WHEN the advertised recovery is executed
- THEN the state MUST advance to a different digest
- OR reach an explicit terminal state

#### Scenario: Non-advancing recovery is rejected

- GIVEN a proposed recovery that recreates the same blocking state
- WHEN transition selection validates it
- THEN the kernel MUST reject or replace it with `decide` or `stop`


### Requirement: Authority Is Runtime-Owned {#REQ-lifecycle-kernel-runtime-006}

Only authorized kernel operations MAY mutate lifecycle state. Human
projections, model responses, events and host adapters MUST NOT directly set
lifecycle status, grant OperationPermits, mint authority artifacts, or mark
operations approved. A non-empty legacy AuthorityToken MUST NOT be treated as
mutation authority; only a runtime-minted OperationPermit plus CAS MAY authorize
an authoritative advance. Models MUST NOT self-grant permits.
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


### Requirement: Events Are Derived And Non-Authoritative {#REQ-lifecycle-kernel-runtime-007}

Lifecycle events MUST be derived from committed transitions and journal records.
Event ordering and identity MUST be deterministic for the same committed history.
Deleting or replaying an event projection MUST NOT change authoritative state or
valid transition selection.

#### Scenario: Event projection is rebuilt

- GIVEN committed lifecycle state and journal records
- WHEN the event projection is regenerated
- THEN it MUST reproduce equivalent event identities and ordering
- AND transition decisions MUST remain unchanged


### Requirement: Terminal Exhaustion Is Honest {#REQ-lifecycle-kernel-runtime-008}

A terminal state MUST expose no ordinary `execute` transition. It MAY expose only
a separately authorized recovery, a human `decide` transition or `stop`. Exhausted
operations MUST NOT restart implicitly.

#### Scenario: Exhausted operation cannot auto-restart

- GIVEN an operation whose terminal attempt/budget condition is exhausted
- WHEN status is requested
- THEN the kernel MUST NOT return an ordinary execute transition for the same operation
- AND MUST return `decide`, authorized recovery or `stop`


### Requirement: Existing Kernels Remain Compatible {#REQ-lifecycle-kernel-runtime-009}

K2 MUST integrate with existing routing, review-lineage and archive behavior
through compatibility boundaries. It MUST NOT reset review lineage, rewrite
archive transaction history or create a second lifecycle authority inside those
subsystems.

#### Scenario: Review and archive no-regression fixture

- GIVEN a fixture accepted by the current review-lineage or archive runtime
- WHEN the fixture is exercised through the K2 compatibility bridge
- THEN the existing terminal outcome and immutable history MUST be preserved


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
itself. Authorization MUST require a separately issued `OperationPermit` from
the controlled issuer. Issuance MUST require TransitionOffer plus exactly one of
`PolicyDecision`, `HumanDecision`, or `KernelRule`, plus `expected_revision`.
Offers MUST NOT be sufficient inputs for auto-mint on the public mutating path.
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


### Requirement: Effect Intents Carry Effect Class {#REQ-lifecycle-kernel-runtime-012}

Effect intents returned by the lifecycle reducer MUST include an effect class
from `{pure, idempotent-keyed, probeable, compensatable, irreversible}`. The
imperative shell MUST refuse to execute an effect intent lacking a valid class.

#### Scenario: Reducer emits classed effect intent

- GIVEN a valid authorized action that requires an external effect
- WHEN the reducer runs
- THEN each emitted effect intent MUST include exactly one valid effect class
- AND the shell MUST NOT execute until that class is present


### Requirement: Host Contract Consumed Via Ports Only {#REQ-lifecycle-kernel-runtime-013}

The lifecycle kernel MUST consume host behavior exclusively through the
host-agnostic contract ports (`HostCapabilities` and the five transports). It
MUST NOT branch on concrete host product identities for transition selection,
permit minting, or CAS commits. K2.1 OperationPermit + compareAndSwap mutation
semantics MUST remain unchanged.

#### Scenario: Transition selection uses ports not host brand

- GIVEN two HostAdapters exposing equivalent HostCapabilities and transport
  outcomes
- WHEN `status` and `next_transition` are evaluated
- THEN results MUST NOT differ solely because of concrete host product id
- AND permit + CAS requirements MUST still apply

#### Scenario: Host port failure does not bypass permit CAS

- GIVEN a transport fault reported through a host port
- WHEN the kernel continues after the fault
- THEN authoritative mutation MUST still require OperationPermit + CAS
- AND MUST NOT invent a host-local mutation path


### Requirement: No Concrete Host Imports In Lifecycle Graph Receipt {#REQ-lifecycle-kernel-runtime-014}

Lifecycle, Graph, and receipt modules MUST NOT import concrete host product APIs
or concrete host-adapter implementations. Host integration MUST occur only at
explicit port/adapter boundaries outside those modules. A scope-guard MUST fail
closed when such an import is detected.

#### Scenario: Concrete host import in lifecycle module fails guard

- GIVEN a lifecycle module that imports a concrete `claude` host API or adapter
  implementation
- WHEN the host-import scope-guard runs
- THEN the guard MUST fail closed
- AND MUST identify the offending module path

#### Scenario: Port-only consumption passes guard

- GIVEN lifecycle modules that depend only on host-contract port types/interfaces
- WHEN the host-import scope-guard runs
- THEN the guard MUST pass
- AND Graph/receipt modules MUST likewise remain free of concrete host imports


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


### Requirement: Host Boundary Awaits And Catches Transport Promises {#REQ-lifecycle-kernel-runtime-017}

The lifecycle kernel host-boundary MUST invoke host contract transports through
an async observe path that `await`s `Promise<TransportOutcome>` and `catch`es
rejections. A rejected Promise MUST be observed as a structured failure
(`ok: false`) and MUST NEVER be treated as a successful transport outcome.
Host-boundary fault observation MUST NOT bypass OperationPermit + CAS
requirements for authoritative mutation.

#### Scenario: Rejected transport Promise is observed as failure

- GIVEN a host transport port whose Promise rejects
- WHEN the host-boundary observes the invoke
- THEN the observed outcome MUST have `ok: false`
- AND MUST NOT be treated as success

#### Scenario: Successful transport Promise is observed as success

- GIVEN a host transport port that resolves `{ ok: true, ... }`
- WHEN the host-boundary awaits the invoke
- THEN the observed outcome MUST preserve `ok: true`
- AND MUST remain consumable by subsequent kernel decisions without host-brand
  branching

#### Scenario: Transport rejection does not mint authority

- GIVEN a rejected transport Promise observed at the host-boundary
- WHEN the kernel continues after the failure
- THEN authoritative mutation MUST still require OperationPermit + CAS
- AND MUST NOT invent a host-local success path from the rejection
