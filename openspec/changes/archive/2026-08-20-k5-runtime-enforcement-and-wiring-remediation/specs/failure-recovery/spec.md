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

Legacy routing tags (`spec`, `design`, `tasks`, `code`, `evidence-format`) MUST deterministically map to these canonical categories and codes. Environment, tooling, CAS, and ambiguous effect failures MUST NOT be labeled as code defects.

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

---

### Requirement: Causal Failure Recovery Transition Matrix {#REQ-failure-recovery-002}

The runtime and transition selector MUST map resolved causal failures deterministically to explicit allowlisted recovery transitions from `{repair, replan, escalate, stop}` according to the failure transition matrix:
- `code_defect`: allows `repair` (when remaining effect attempts > 0), `replan`, `escalate`, `stop`.
- `validation_gap`: allows `replan`, `escalate`, `stop` (MUST NOT allow `repair` without design or specification update).
- `ambiguous_effect`: allows `escalate`, `stop` (MUST NOT allow blind `repair` or blind retry).
- `cas_conflict`: allows `replan` (re-sync/rebase), `escalate`, `stop`.
- `environment_tooling`: allows `replan` (host retry/re-dispatch), `escalate`, `stop`.

When a failure category requires escalation or cannot be repaired/replanned within remaining budget quotas, the transition selector MUST explicitly emit `escalate` and MUST NOT silently substitute `decide` in place of `escalate`. Transitions not explicitly allowlisted for the resolved failure category MUST fail closed.
(Previously: Transition matrix allowed transitions without explicitly forbidding silent substitution of escalate by decide in runtime and selector.)

#### Scenario: Explicit escalate emitted for ambiguous effect without silent decide substitution

- GIVEN a resolved causal failure of category `ambiguous_effect`
- WHEN transition selection evaluates the next available operations
- THEN the selector MUST emit `escalate` and `stop`
- AND MUST NOT silently substitute `decide` in place of `escalate`
- AND MUST NOT offer `repair` or blind re-execution

#### Scenario: Code defect routes to repair when budget allows

- GIVEN a resolved failure of category `code_defect` and positive remaining `effect_attempts`
- WHEN transition selection executes
- THEN `repair` MUST be advertised as a valid transition
- AND unallowlisted operations MUST NOT be offered

#### Scenario: Environment fault takes precedence and routes to replan or escalate

- GIVEN an execution failure classified as `environment_tooling`
- WHEN the transition selector derives available recovery transitions
- THEN the selector MUST offer `replan` or `escalate`
- AND MUST NOT classify the fault as a `code_defect` or offer `repair`

---

### Requirement: Allowlisted Recovery Transition Matrix {#REQ-failure-recovery-003}

The kernel MUST map each canonical failure code strictly to an allowlisted set of valid recovery operations from `{repair, replan, escalate, stop}`:
- `code_defect`: allows `repair` (if attempts remain), `replan`, `escalate`, `stop`.
- `validation_gap`: allows `replan`, `escalate`, `stop` (MUST NOT allow `repair` without design/spec update).
- `ambiguous_effect`: allows `escalate`, `stop` (MUST NOT allow blind `repair` or blind retry).
- `cas_conflict`: allows `replan` (re-sync/rebase), `escalate`, `stop`.
- `environment_tooling`: allows `replan` (host retry/re-dispatch), `escalate`, `stop`.

Any transition not explicitly allowlisted for the resolved failure code MUST fail closed.

#### Scenario: Code defect routes to repair when budget allows

- GIVEN a resolved failure of category `code_defect` and positive remaining `effect_attempts`
- WHEN transition selection executes
- THEN `repair` MUST be advertised as a valid transition
- AND unallowlisted operations MUST NOT be offered

#### Scenario: Ambiguous effect rejects blind repair transition

- GIVEN a resolved failure of category `ambiguous_effect`
- WHEN transition selection executes
- THEN `repair` MUST NOT be offered
- AND the kernel MUST advertise only `escalate` or `stop`

---

### Requirement: Bounded Scope For Repair Transitions {#REQ-failure-recovery-004}

Every `repair` transition MUST enforce a bounded mutation scope restricting execution authority to:
1. `node_ids`: Only the specific failed graph node(s).
2. `allowed_paths`: Bounded file glob patterns matching the declared ownership of the failed node.
3. `finding_ids`: The frozen immutable finding IDs that caused the failure.

The scope validator (`validateRepairScope`) MUST operate strictly fail-closed: if `scope` is empty, undefined, or missing required bounding arrays when mutations (`modifiedPaths`), `targetNodeId`, or `resolvedFindingIds` are present, or if any mutation occurs outside declared paths, or if target node ID is outside `node_ids`, validation MUST fail closed (`ok: false`). The lifecycle runtime MUST validate repair scopes fail-closed prior to executing mutations or committing state via CAS.
(Previously: Repair scope validation permitted empty or undefined scopes to pass open without runtime fail-closed enforcement before CAS.)

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
