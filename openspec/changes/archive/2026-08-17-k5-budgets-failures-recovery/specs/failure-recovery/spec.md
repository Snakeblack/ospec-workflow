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

### Requirement: Deterministic Causal Priority Resolution For Mixed Failures {#REQ-failure-recovery-002}

When a batch or execution node produces multiple concurrent or cascading failures, the runtime MUST resolve the primary causal failure using strict deterministic priority order:
`environment_tooling (Priority 1) > cas_conflict (Priority 2) > ambiguous_effect (Priority 3) > validation_gap (Priority 4) > code_defect (Priority 5)`.
Lower-priority failures MUST NOT override higher-priority infrastructure or concurrency faults.

#### Scenario: Mixed tooling crash and test failure resolves to environment fault

- GIVEN an execution step that suffers both a container tooling crash and a failing test assertion
- WHEN the causal priority resolver evaluates the failure set
- THEN the primary failure MUST resolve to category `environment_tooling`
- AND recovery routing MUST address the environment fault before code defect analysis

#### Scenario: CAS conflict co-occurring with verification failure resolves to CAS race

- GIVEN a concurrent state commit that experiences a CAS revision mismatch alongside an incomplete verify check
- WHEN causal priority resolution runs
- THEN the primary failure MUST resolve to category `cas_conflict`
- AND the runtime MUST NOT report a code defect

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

Mutations outside the bounded scope during a repair pass MUST be rejected fail-closed.

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
