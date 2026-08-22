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


### Requirement: Blocking Fingerprint Advancement And Honest Recovery Enforcement {#REQ-lifecycle-kernel-runtime-005}

A recovery transition MAY be advertised and executed only when executing its named operation from the allowlisted transition matrix advances lifecycle state by producing a distinct `blockingFingerprint` value or reaches an explicit terminal outcome (`stop` or `escalate`). The lifecycle runtime entrypoint (`runKernelOperation`), recovery validator (`validateRecoveryHonesty`), and transition selector MUST wire blocking fingerprint advancement directly into execution and CAS commits. If a recovery execution produces an identical blocking fingerprint without state progression, the runtime MUST reject the cycle fail-closed, log a non-advancing recovery failure, and deterministically force transition to `escalate` or `stop`. A recovery MUST NOT return the same blocking fingerprint with a refreshed attempt counter or equivalent implicit loop.
(Previously: Recovery requirement stated advance or terminate without direct runtime and CAS commit wiring of validateRecoveryHonesty and blockingFingerprint.)

#### Scenario: Named recovery advances

- GIVEN a recoverable interrupted operation
- WHEN the advertised recovery is executed
- THEN the state MUST advance to a different digest
- OR reach an explicit terminal state

#### Scenario: Non-advancing recovery is rejected by runtime before CAS

- GIVEN a proposed recovery that recreates the same blocking state and identical blocking fingerprint
- WHEN `runKernelOperation` or transition selection validates it with `validateRecoveryHonesty`
- THEN the kernel MUST reject the recovery attempt as non-advancing
- AND MUST replace it with an explicit `escalate` or `stop` transition

#### Scenario: Recovery advances blocking fingerprint

- GIVEN a failed state with an active blocking fingerprint
- WHEN an allowlisted recovery transition executes
- THEN the resulting state MUST advance the blocking fingerprint to a distinct value
- OR transition deterministically to an explicit terminal state


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


### Requirement: Internal Permit Issuer Resolution {#REQ-lifecycle-kernel-020}

The lifecycle kernel MUST NOT accept caller-minted or caller-provided permit issuers. Permit authority resolution MUST be strictly internal to runtime composition (`runKernelOperation` and internal kernel bindings). Public API signatures MUST NOT accept an external permit issuer capability parameter.

#### Scenario: Caller-provided permit issuer is rejected

- GIVEN a caller invoking a lifecycle kernel operation
- WHEN the caller attempts to pass a custom, external, or caller-minted permit issuer
- THEN the kernel MUST ignore or reject the external issuer parameter
- AND MUST NOT use caller-supplied capabilities to issue permits

#### Scenario: Internal permit authority resolution

- GIVEN a valid lifecycle kernel operation initiated via `runKernelOperation`
- WHEN permit minting and authorization are evaluated
- THEN the kernel MUST resolve the private permit authority internally within its composition boundary


### Requirement: Forged Permit Issuer Rejection {#REQ-lifecycle-kernel-021}

The lifecycle kernel MUST reject forged permit issuer objects carrying global Symbols (e.g. `Symbol.for(...)`) or mock capability brands. Only genuine private capabilities bound within runtime composition MAY issue valid `OperationPermit` instances.

#### Scenario: Forged permit issuer with global Symbol is rejected

- GIVEN a forged permit issuer object constructed with `Symbol.for("ospec.permitAuthorityIssuer")` or mock brand properties
- WHEN the forged object is presented to kernel authorization or permit issuance mechanisms
- THEN authorization MUST fail closed with an un-authorized or invalid-capability error
- AND no valid OperationPermit MUST be minted


### Requirement: Atomic Failure Rollback {#REQ-lifecycle-kernel-022}

If authority bag materialization or atomic CAS persistence fails during a kernel operation attempt, the operation MUST fail closed. The Authority Store head MUST remain at its previous committed revision intact, with no partial state updates, torn journal entries, or leaked authority bag entries.

#### Scenario: CAS persistence failure leaves head intact

- GIVEN a lifecycle kernel operation attempting an authoritative mutation
- WHEN underlying CAS persistence fails or authority bag materialization throws an error
- THEN the kernel operation MUST fail closed
- AND the previous Authority Store head revision MUST remain unchanged and intact


### Requirement: Post-CAS Receipt Revision Binding {#REQ-lifecycle-kernel-023}

`OperationReceipt.revision` MUST be assigned to the post-CAS winning head revision `R1` (the new head revision resulting from the successful mutation), NOT the pre-CAS expected revision `R0`.

#### Scenario: Receipt revision binds to winning post-CAS revision

- GIVEN an operation executing against head revision R0
- WHEN `compareAndSwap` commits the mutation and advances head to revision R1
- THEN the returned `OperationReceipt.revision` MUST equal R1
- AND MUST NOT equal pre-CAS revision R0

#### Scenario: Replayed operation preserves winning revision receipt

- GIVEN an operation previously committed at revision R1 with recorded `OperationReceipt`
- WHEN the exact same operation is replayed
- THEN the replayed receipt's revision MUST equal R1


### Requirement: Encapsulated Kernel Runtime {#REQ-lifecycle-kernel-024}

`createKernelRuntime(options)` MUST be the sole public entrypoint for runtime operations and transition permit issuance, without revealing internal capabilities (`getPrivateIssuer`, permit authority symbols, or raw minting functions) on its return surface.

#### Scenario: createKernelRuntime serves as sole entrypoint for runtime operations and permit issuance

- GIVEN the `lifecycle-kernel` module
- WHEN external consumers initialize the lifecycle runtime
- THEN `createKernelRuntime(options)` MUST provide the complete capability surface for executing operations and issuing permits
- AND MUST NOT require importing low-level permit issuer factories or internal symbols

#### Scenario: Internal permit issuance capabilities are unexposed outside runtime closure

- GIVEN a runtime instance created via `createKernelRuntime`
- WHEN inspecting the properties and methods on the returned runtime object
- THEN internal capabilities such as `getPrivateIssuer` or raw permit minting functions MUST NOT be accessible

---

### Requirement: Budget Monotonicity Enforcement In Lifecycle Reducers {#REQ-lifecycle-kernel-runtime-025}

Lifecycle reducers, mutation processors, and `runKernelOperation` MUST enforce strict monotonicity and unified exhaustion through `isBudgetExhausted()`. Preflight MUST reject exhausted non-terminal work with zero calls to `effectExecutor`; `escalate` and `stop` MAY commit via CAS. After each physical effect execution, the runtime MUST derive one `ExecutionUsage` delta, apply it once to the reduced state before CAS, and never account journal-reconciled or skipped results as new usage. If no CAS success is confirmed after effect execution, the runtime MUST retain only that invocation's new delta as carry-over for the same subject and node. A required usage absent from the result MUST fail closed without fallback to input arguments. Reducers and wrappers MUST NOT reset, restore, or silently replenish budgets.

(Previously: Runtime-owned carry-over was specified only for an executed effect that lost CAS and did not require successful-CAS or post-effect failure accounting.)

#### Scenario: Reducer decrements budget monotonically across retry attempts

- GIVEN a state with remaining `effect_attempts: 2`
- WHEN an allowlisted retry action is reduced
- THEN the new state MUST record remaining `effect_attempts: 1`
- AND MUST NOT restore the initial quota

#### Scenario: Successful CAS commits current execution usage

- GIVEN an effect reports 4 turns and a decremented attempt quota
- WHEN `runKernelOperation` wins CAS
- THEN the winning state MUST include the 4-turn delta exactly once
- AND MUST NOT place that delta in carry-over

#### Scenario: CAS reconciliation carries only new invocation usage

- GIVEN an operation executes once, reports 4 turns, and loses CAS
- WHEN its retry skips the completed journal record and loses CAS again
- THEN carry-over MUST remain 4 turns
- AND the retry MUST NOT re-execute or re-account the historical result

#### Scenario: Effect failure preserves current execution usage

- GIVEN an effect reports usage and then returns failure before CAS
- WHEN the runtime emits its post-effect failure result
- THEN the usage MUST remain runtime-owned carry-over
- AND the budget MUST NOT be replenished

#### Scenario: Preflight budget exhaustion halts non-terminal runKernelOperation

- GIVEN `isBudgetExhausted()` returns `exhausted: true`
- WHEN a non-terminal operation runs
- THEN it MUST fail closed with zero executor calls

#### Scenario: Terminal control transition commits under exhaustion

- GIVEN exhausted node or authority budget
- WHEN `escalate` or `stop` runs
- THEN the runtime MUST commit terminal state through CAS
- AND MUST NOT block it in preflight

#### Scenario: Reducer marks exhausted node

- GIVEN a node reaches its commands or turns quota
- WHEN the reducer processes the operation
- THEN `isBudgetExhausted()` MUST return `exhausted: true`
- AND the node MUST prevent later `start` or `recover` transitions
### Requirement: Causal Failure Priority And Transition Routing {#REQ-lifecycle-kernel-runtime-026}

The lifecycle kernel runtime, transition selector (`selectTransitions`), boundary validator (`validateOperationTransition`), and execution coordinator (`runKernelOperation`) MUST resolve mixed failure sets according to deterministic causal priority precedence (`environment_tooling > cas_conflict > ambiguous_effect > validation_gap > code_defect`). The runtime and boundary validators MUST strictly enforce the allowlisted recovery transition matrix (`repair`, `replan`, `escalate`, `stop`) for the resolved primary failure code. Both `validateOperationTransition` and `runKernelOperation` preflight MUST validate the operation against `validateRecoveryTransition(primaryFailure.category, operation)` and fail closed with zero calls to `effectExecutor` if unallowlisted. For `code_defect` with positive remaining `effect_attempts`, the selector MUST emit `{ kind: "execute", operation: "repair" }` without degrading or renaming the operation to `recover`. For `operation: "repair"`, `args.scope` MUST be mandatory in preflight; if missing or invalid, `runKernelOperation` MUST fail closed (`repair-scope-violation`) with zero calls to `effectExecutor`. The selector MUST emit `escalate` explicitly when required and MUST NOT silently substitute `decide`. The runtime MUST process `escalate` and `stop` transitions and commit them to the Authority Store via CAS as consolidated terminal outcomes even when execution budgets are exhausted.
(Previously: Boundary validation did not mandate causal allowlist enforcement in validateOperationTransition/preflight and terminal transitions could be blocked by budget exhaustion.)

#### Scenario: Code defect emits canonical repair transition without degrading to recover

- GIVEN a resolved failure of category `code_defect` and positive remaining `effect_attempts`
- WHEN `selectTransitions` or `nextTransition` is evaluated
- THEN the kernel MUST emit transition `{ kind: "execute", operation: "repair" }`
- AND MUST NOT degrade or rename the operation to `recover`

#### Scenario: Environment fault takes precedence over code assertions in transition selection

- GIVEN a node reporting both a host tool execution timeout and an assertion failure
- WHEN the runtime derives the next transition offer
- THEN the primary failure MUST resolve to `environment_tooling`
- AND the offered transition MUST be `replan` (host re-dispatch) or `escalate`, NOT code `repair`

#### Scenario: Repair operation without args.scope fails closed in preflight with zero executor calls

- GIVEN an operation with `operation: "repair"` where `args.scope` is missing or undefined
- WHEN `runKernelOperation` is invoked
- THEN execution MUST fail closed with reason `repair-scope-violation`
- AND MUST execute exactly zero invocations to `effectExecutor`

#### Scenario: Boundary validation rejects unallowlisted recovery operations with zero effectExecutor calls

- GIVEN a resolved failure of category `ambiguous_effect`
- WHEN `validateOperationTransition` or `runKernelOperation` evaluates an unallowlisted operation such as `repair`
- THEN validation MUST fail closed
- AND `runKernelOperation` MUST perform exactly zero calls to `effectExecutor`

#### Scenario: Selector emits explicit escalate without silent decide fallback

- GIVEN a failure state requiring escalation under the transition matrix
- WHEN `selectTransitions` or `nextTransition` is evaluated
- THEN the kernel MUST emit `{ kind: "escalate", operation: "escalate" }`
- AND MUST NOT emit `{ kind: "decide", operation: "decide" }` as a silent substitute

#### Scenario: Escalate and stop operations commit consolidated terminal status to Authority Store via CAS

- GIVEN a kernel operation executing an `escalate` or `stop` transition
- WHEN `runKernelOperation` executes the operation
- THEN the runtime MUST commit the consolidated terminal status to the Authority Store via CAS
- AND MUST NOT abort runtime execution prematurely or fail due to budget exhaustion

---

### Requirement: Zero-Delta Consumption And Honest Terminality {#REQ-lifecycle-kernel-runtime-027}

The runtime MUST record zero-delta consumption on effect-bearing code/file mutations where `effectProgress === false` and no file or content delta exists. It MUST simultaneously decrement node turns and authority `effect_attempts`, and journal `zero-delta-attempt` before CAS. Lifecycle progression is distinct from effect progress: `repair` remains zero-delta when it advances lifecycle state but produces no effect progress. Read-only diagnostics and terminal controls MUST NOT be zero-delta. Exhaustion MUST refuse normal execution and offer terminal handling.

(Previously: Any lifecycle state advance, including a sterile repair, was excluded from zero-delta accounting.)

#### Scenario: Sterile repair consumes dual budgets

- GIVEN `repair` advances lifecycle state but has `effectProgress: false` and zero file delta
- WHEN post-effect accounting runs
- THEN both turns and effect attempts MUST decrement once
- AND the journal MUST contain `zero-delta-attempt` before CAS

#### Scenario: Read-only diagnostics and terminal controls are not penalized

- GIVEN a diagnostic inspection or `escalate` or `stop`
- WHEN post-effect accounting runs
- THEN it MUST NOT classify the action as zero-delta

#### Scenario: Non-effect lifecycle advance is not zero-delta

- GIVEN a lifecycle transition advances state without an effect-bearing mutation
- WHEN accounting runs with zero file changes
- THEN it MUST NOT receive the zero-delta dual penalty

#### Scenario: Budget exhaustion blocks normal execution

- GIVEN remaining turns or effect attempts equal zero
- WHEN `next_transition` is derived
- THEN normal execution MUST NOT be offered
- AND only terminal handling MAY be offered
