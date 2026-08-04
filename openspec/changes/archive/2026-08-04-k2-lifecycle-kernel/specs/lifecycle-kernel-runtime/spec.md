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

Only authorized kernel operations MAY mutate lifecycle state. Human projections,
model responses, events and host adapters MUST NOT directly set lifecycle status,
grant authority tokens or mark operations approved.

#### Scenario: Model output attempts direct state mutation

- GIVEN model output containing a requested terminal status
- WHEN the output is presented without an authorized kernel operation
- THEN authoritative state MUST remain unchanged
- AND the attempt MUST be rejected or treated as non-authoritative input

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
