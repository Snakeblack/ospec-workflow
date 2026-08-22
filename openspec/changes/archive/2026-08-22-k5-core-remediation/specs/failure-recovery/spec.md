# Failure Recovery Specification

## Purpose

Define a structured causal failure taxonomy and a deterministic priority resolver for mixed failure sets. Establish an allowlisted recovery transition matrix (`repair`, `replan`, `escalate`, `stop`), enforce bounded repair scopes, prevent misclassifying infrastructure/CAS/ambiguity faults as code defects, and guarantee honest recovery via blocking fingerprint advancement or terminal stop.

## Requirements

### Requirement: Causal Failure Taxonomy And Canonical Code Mapping {#REQ-failure-recovery-001}

The runtime MUST classify all execution, verification, and environmental faults into a typed causal failure taxonomy with five closed categories:
1. `environment_tooling`: Host timeouts, tool launch failures, process crashes, and transport dropouts.
2. `cas_conflict`: Optimistic concurrency race conditions on Authority Store revisions.
3. `ambiguous_effect`: Operations whose mutation outcome is unknown or unverified.
4. `validation_gap`: Specification, design, or schema ambiguity and missing acceptance criteria.
5. `code_defect`: Syntax errors, assertion failures, and test suite verification failures.

Legacy routing tags (`spec`, `design`, `tasks`, `code`, `evidence-format`, etc.) MUST deterministically map to these canonical categories and codes. Environment, tooling, CAS, and ambiguous effect failures MUST NOT be labeled as code defects. Any unknown or unmapped legacy routing tag evaluated by `mapLegacyRoutingTag` MUST fail closed by mapping to category `validation_gap` with canonical code `UNKNOWN_ROUTING_TAG`, strictly prohibiting automatic `repair` transitions.
(Previously: Default case in mapLegacyRoutingTag mapped unmapped tags to code_defect with UNKNOWN_FAILURE_CODE, permitting inappropriate repair transitions.)

#### Scenario: Tool timeout classified as environment failure not code defect

- GIVEN a worker tool invocation that terminates with an external process timeout
- WHEN the failure classifier evaluates the termination result
- THEN the failure MUST be assigned category `environment_tooling`
- AND MUST NOT be classified as a `code_defect`

#### Scenario: Legacy verify routing tag maps to canonical causal taxonomy

- GIVEN a verification outcome emitting legacy tag `evidence-format`
- WHEN taxonomy mapping is executed
- THEN the tag MUST resolve to category `validation_gap` with canonical code `VERIFY_EVIDENCE_FORMAT_INVALID`
- AND MUST NOT be dropped as an unknown code

#### Scenario: Unknown legacy routing tag maps fail-closed to validation gap and prohibits repair

- GIVEN an unmapped or unrecognized legacy routing tag `unknown-tag-xyz`
- WHEN `mapLegacyRoutingTag` evaluates the tag
- THEN it MUST return category `validation_gap` and canonical code `UNKNOWN_ROUTING_TAG`
- AND the transition selector MUST NOT offer `repair` for that failure

---

### Requirement: Causal Failure Recovery Transition Matrix {#REQ-failure-recovery-002}

The runtime, boundary validator (`validateOperationTransition`), transition selector (`selectTransitions`), controlled permit issuer (`issuePermitForSelectedTransition`), and host boundary MUST map and enforce resolved causal failures deterministically against explicit allowlisted recovery transitions from `{repair, replan, escalate, stop}`:
- `code_defect`: when remaining effect attempts > 0, the selector MUST emit `{ kind: "execute", operation: "repair" }` without degrading or renaming the operation to `recover`. If attempts are exhausted, it MUST emit `replan`, `escalate`, or `stop`.
- `validation_gap`: allows `replan`, `escalate`, `stop` (MUST NOT allow `repair` without design or specification update).
- `ambiguous_effect`: allows `escalate`, `stop` (MUST NOT allow blind `repair` or blind retry).
- `cas_conflict`: allows `replan` (re-sync/rebase), `escalate`, `stop`.
- `environment_tooling`: allows `replan` (host retry/re-dispatch), `escalate`, `stop`.

All components MUST resolve primary failures uniformly using `resolvePrimaryFailure()`. The taxonomies of `kind` (`execute`, `decide`, `stop`) and `operation` (`repair`, `recover`, `replan`, `escalate`, `stop`) MUST remain harmonized. When a failure category requires escalation or cannot be repaired within remaining budget quotas, the selector MUST explicitly emit `{ kind: "escalate", operation: "escalate" }` and MUST NOT silently substitute `decide`. The runtime MUST commit `escalate` and `stop` transitions to the Authority Store via CAS as a consolidated terminal outcome without premature abort and without being blocked by budget exhaustion. Transitions not explicitly allowlisted for the resolved failure category MUST fail closed at boundary validation (`validateOperationTransition` and `runKernelOperation`).
(Previously: Failure resolution was fragmented across selector, permit issuer, and host boundary without enforcing uniform resolvePrimaryFailure invocation.)

#### Scenario: Code defect routes to repair without degrading to recover

- GIVEN a resolved failure of category `code_defect` and positive remaining `effect_attempts`
- WHEN transition selection executes
- THEN the selector MUST emit transition `{ kind: "execute", operation: "repair" }`
- AND MUST NOT degrade or rename the operation to `recover`

#### Scenario: Explicit escalate emitted for ambiguous effect without silent decide substitution

- GIVEN a resolved causal failure of category `ambiguous_effect`
- WHEN transition selection evaluates the next available operations
- THEN the selector MUST emit `{ kind: "escalate", operation: "escalate" }` and `stop`
- AND MUST NOT silently substitute `decide` in place of `escalate`
- AND MUST NOT offer `repair` or blind re-execution

#### Scenario: Escalate and stop transitions consolidate and commit via CAS even under budget exhaustion

- GIVEN a kernel operation executing an `escalate` or `stop` transition under exhausted budgets
- WHEN `runKernelOperation` processes the transition
- THEN the runtime MUST commit the consolidated terminal status to the Authority Store via CAS
- AND MUST NOT abort execution prematurely or fail due to budget exhaustion

#### Scenario: Boundary validation rejects unallowlisted recovery transitions fail-closed

- GIVEN an active failure category `ambiguous_effect`
- WHEN an unallowlisted transition `repair` is submitted to `validateOperationTransition` or `runKernelOperation`
- THEN the operation MUST fail closed with zero calls to `effectExecutor`

#### Scenario: Environment fault takes precedence and routes to replan or escalate

- GIVEN an execution failure classified as `environment_tooling`
- WHEN the transition selector derives available recovery transitions
- THEN the selector MUST offer `replan` or `escalate`
- AND MUST NOT classify the fault as a `code_defect` or offer `repair`

#### Scenario: Unified resolvePrimaryFailure resolves mixed failures identically across components

- GIVEN a mixed set of failures containing `code_defect` and `environment_tooling`
- WHEN evaluated by `selectTransitions`, `issuePermitForSelectedTransition`, and host boundary error handling
- THEN all components MUST identify `environment_tooling` as the primary failure via `resolvePrimaryFailure()`
- AND MUST restrict candidate recovery transitions to `replan`, `escalate`, or `stop`

---

### Requirement: Allowlisted Recovery Transition Matrix {#REQ-failure-recovery-003}

The kernel, controlled permit issuer (`issuePermitForSelectedTransition`), boundary validator (`validateOperationTransition`), and execution coordinator (`runKernelOperation`) MUST map and enforce each canonical failure code strictly to an allowlisted set of valid recovery operations from `{repair, replan, escalate, stop}` based on the primary failure resolved by `resolvePrimaryFailure()`:
- `code_defect`: allows `repair` (if attempts remain), `replan`, `escalate`, `stop`.
- `validation_gap`: allows `replan`, `escalate`, `stop` (MUST NOT allow `repair` without design/spec update).
- `ambiguous_effect`: allows `escalate`, `stop` (MUST NOT allow blind `repair` or blind retry).
- `cas_conflict`: allows `replan` (re-sync/rebase), `escalate`, `stop`.
- `environment_tooling`: allows `replan` (host retry/re-dispatch), `escalate`, `stop`.

Terminal control operations (`escalate`, `stop`) MUST be allowlisted across all causal failure categories. Any transition not explicitly allowlisted for the resolved primary failure code MUST fail closed during transition selection, permit issuance, and kernel runtime execution with zero calls to `effectExecutor`.
(Previously: Causal allowlist enforcement across permit issuance and boundary execution did not guarantee unified primary failure derivation using resolvePrimaryFailure.)

#### Scenario: Code defect routes to repair when budget allows

- GIVEN a resolved failure of category `code_defect` and positive remaining `effect_attempts`
- WHEN transition selection executes
- THEN `repair` MUST be advertised as a valid transition
- AND unallowlisted operations MUST NOT be offered

#### Scenario: Ambiguous effect rejects blind repair across selector, permit issuer, and runtime

- GIVEN a resolved failure of category `ambiguous_effect`
- WHEN transition selection, permit issuance, or `validateOperationTransition` runs
- THEN `repair` MUST NOT be offered or permitted
- AND the kernel MUST allow only `escalate` or `stop`

#### Scenario: Kernel operation boundary rejects unallowlisted transition for active failure category

- GIVEN an active failure state of category `validation_gap`
- WHEN a caller attempts to execute `operation: "repair"` via `runKernelOperation`
- THEN the runtime MUST fail closed with zero calls to `effectExecutor`

#### Scenario: Terminal control transitions are universally allowlisted

- GIVEN any active causal failure category in the taxonomy
- WHEN `escalate` or `stop` is evaluated
- THEN the transition MUST be accepted as allowlisted
- AND MUST NOT be rejected by causal matrix validation

---

### Requirement: Bounded Scope For Repair Transitions {#REQ-failure-recovery-004}

Every `repair` transition MUST enforce a bounded mutation scope provided explicitly in `args.scope` restricting execution authority to:
1. `node_ids`: Only the specific failed graph node(s).
2. `allowed_paths`: Bounded file glob patterns matching the declared ownership of the failed node.
3. `finding_ids`: The frozen immutable finding IDs that caused the failure.

The runtime MUST evaluate `args.scope` fail-closed in preflight prior to invoking `effectExecutor`. If `args.scope` is missing, empty, or undefined, or if mutations or target node IDs fall outside `allowed_paths` or `node_ids`, validation MUST fail closed (`ok: false`, reason `repair-scope-violation`) with zero invocations to `effectExecutor`. The runtime MUST NOT fall back to historical or payload effect records (`effectRecords[0]?.payload?.scope`) to infer missing scope.
(Previously: Scope validator permitted historical payload fallbacks and did not strictly guarantee zero effectExecutor calls in preflight on missing args.scope.)

#### Scenario: Missing args.scope fails closed with zero effect executor calls

- GIVEN an operation with `operation: "repair"` where `args.scope` is missing or undefined
- WHEN `runKernelOperation` executes preflight validation
- THEN the runtime MUST reject the repair attempt fail-closed with reason `repair-scope-violation`
- AND MUST perform exactly zero calls to `effectExecutor`
- AND MUST NOT fall back to historical effect payload scopes

#### Scenario: Empty or undefined scope with mutations fails closed

- GIVEN an empty or undefined repair scope `{}`
- WHEN `validateRepairScope` evaluates a non-empty `modifiedPaths` or `targetNodeId`
- THEN validation MUST fail closed with `ok: false`
- AND the runtime MUST reject the repair attempt before CAS commit

#### Scenario: Repair pass confined to failed node ownership paths

- GIVEN a repair transition for node `apply-auth` with allowed paths `src/auth/**`
- WHEN the repair worker attempts to mutate `src/billing/invoice.js`
- THEN the mutation MUST be rejected fail-closed
- AND the repair attempt MUST fail with a scope boundary violation

#### Scenario: Repair addresses only frozen finding IDs

- GIVEN a repair transition initialized with frozen finding IDs `[F-001, F-002]`
- WHEN verification is rerun after repair
- THEN the validator MUST verify resolution specifically for `F-001` and `F-002`
- AND unrelated new observations MUST NOT block the frozen repair lineage

---

### Requirement: Honest E2E Recovery Via Blocking Fingerprint Advancement Or Terminal Stop {#REQ-failure-recovery-005}

Every recovery transition execution MUST either advance the `blockingFingerprint` (producing a new, distinct non-empty fingerprint representing real progress or updated diagnostic state) or transition to an explicit terminal state (`stop` or `escalate`). If a recovery execution produces an identical blocking fingerprint, the runtime MUST reject the cycle as an honest recovery failure and force an immediate transition to `stop`.

#### Scenario: Advancing recovery updates blocking fingerprint

- GIVEN a failed state with blocking fingerprint `FP-ALPHA`
- WHEN a repair transition executes and resolves two of three failing assertions
- THEN the resulting state MUST yield a distinct blocking fingerprint `FP-BETA`
- AND the recovery step MUST be recorded as advancing

#### Scenario: Stagnant recovery with identical fingerprint forces stop

- GIVEN a failed state with blocking fingerprint `FP-ALPHA`
- WHEN a repair attempt executes but reproduces the exact same failures and fingerprint `FP-ALPHA`
- THEN the runtime MUST detect non-advancement
- AND MUST deterministically force transition to `stop` or `escalate`

---

### Requirement: Ambiguous Effect And CAS Conflict Recovery Non-Mutation {#REQ-failure-recovery-006}

Recovery procedures for `ambiguous_effect` and `cas_conflict` MUST NOT execute blind destructive mutations. `ambiguous_effect` recovery MUST require state reconciliation or explicit authority confirmation before mutation. `cas_conflict` recovery MUST perform state re-synchronization against the winning Authority Store revision before any subsequent attempt.

#### Scenario: Ambiguous effect requires reconciliation before re-execution

- GIVEN an operation that terminated with an unknown mutation outcome (`ambiguous_effect`)
- WHEN recovery transition selection runs
- THEN the runtime MUST require reconciliation against target state
- AND MUST NOT re-dispatch the same mutation blind

#### Scenario: CAS conflict re-syncs state without resetting consumed budget

- GIVEN a CAS conflict at revision R1
- WHEN CAS recovery executes
- THEN the runtime MUST re-synchronize local state to winning revision R2
- AND MUST decrement the remaining retry budget monotonically

