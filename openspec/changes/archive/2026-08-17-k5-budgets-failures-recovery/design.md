# Design: K5 — Budgets, Causal Failures, and Common Recovery

## Technical Approach

K5 implements Block 5 of the OpenSpec Harness Evolution architecture (`docs/roadmaps/harness-evolution.md`, lines 854-894; `docs/architecture/harness-evolution.md`). It establishes a unified execution budget engine, a structured causal failure taxonomy with deterministic priority resolution, an allowlisted recovery transition matrix, strict budget monotonicity across retries and CAS conflicts, zero-delta attempt accounting, and honest recovery validation.

The design is decomposed into four modular layers:
1. **Budget Enforcement Engine (`scripts/lib/execution-budgets.js`)**: Pure functional budget evaluation for node-level operational quotas (`turns`, `patches`, `commands`, `wall_time_minutes`, `changed_lines`, `allowed_paths`) and authoritative effect quotas (`effect_attempts`, `authority_mutations`, `evidence_runs`, `review_sweeps`). Decrements are monotonically non-increasing and isolated from transient telemetry counters.
2. **Causal Failure Classifier & Priority Resolver (`scripts/lib/causal-failure.js`)**: Typed 5-category failure taxonomy (`environment_tooling`, `cas_conflict`, `ambiguous_effect`, `validation_gap`, `code_defect`) with deterministic priority precedence (`environment_tooling > cas_conflict > ambiguous_effect > validation_gap > code_defect`) that prevents infrastructure or race faults from being blamed on code defects.
3. **Allowlisted Transition Matrix & Recovery Engine (`scripts/lib/failure-recovery.js` & `scripts/lib/lifecycle-kernel/recovery.js`)**: State transition table mapping resolved failure codes strictly to allowlisted operations (`repair`, `replan`, `escalate`, `stop`), enforcing bounded repair scopes (`node_ids`, `allowed_paths`, `finding_ids`), zero-delta attempt consumption, and honest recovery validation via blocking fingerprint advancement.
4. **Kernel Integration, Schemas, Lint, and Model Conformance**: Versioned JSON schemas in `schemas/kernel/`, contract-lint checkers in `scripts/lib/contract-checkers/`, lifecycle reducer/selector updates in `scripts/lib/lifecycle-kernel/`, and concrete executable invariant proofs in `scripts/lib/lifecycle-model.js`.

---

## Architecture Decisions

### Decision: Pure Decoupled Budget Evaluator with Telemetry Isolation

| Option | Tradeoff | Decision |
|---|---|---|
| A. Embed counters directly in semantic lifecycle state digests | Blurs semantic state boundary; causes CAS churn and non-deterministic state digests | Rejected |
| B. Externalize budget accounting into a stateful external daemon | Adds async network complexity and single-point-of-failure to kernel operations | Rejected |
| C. Pure decoupled budget evaluator (`scripts/lib/execution-budgets.js`) with isolated consumption telemetry | Keeps kernel reducers pure and deterministic; keeps state digests invariant to volatile execution timings | **Chosen** |

**Choice**: Pure functional evaluator `scripts/lib/execution-budgets.js` evaluating immutable budget envelopes against consumption deltas. Volatile telemetry is stripped prior to canonical digest computation via `stripVolatile`.
**Alternatives considered**: Embedding execution counters directly into `state.nodes[n].telemetry` without stripping (rejected due to digest volatility).
**Rationale**: Guarantees deterministic state hashing and replayability while strictly enforcing decrement-only quotas across retries and CAS reconciliations.

### Decision: Structured 5-Category Causal Failure Taxonomy with Precedence

| Option | Tradeoff | Decision |
|---|---|---|
| A. Free-form string error codes with heuristic retry loops | Unpredictable recovery loops; misidentifies tool crashes as code bugs | Rejected |
| B. Binary classification (Transient vs Permanent) | Lacks nuance for CAS re-syncs, ambiguous effects, and validation gaps | Rejected |
| C. Typed 5-category taxonomy with deterministic priority resolution | Closed enum with strict precedence: `environment_tooling (P1) > cas_conflict (P2) > ambiguous_effect (P3) > validation_gap (P4) > code_defect (P5)` | **Chosen** |

**Choice**: Canonical 5-category failure taxonomy in `scripts/lib/causal-failure.js` with deterministic priority sorting.
**Alternatives considered**: Dynamic priority assignment based on runtime history (rejected due to non-determinism).
**Rationale**: Eliminates "blaming the code" for environmental timeouts, container failures, or CAS races, ensuring appropriate recovery transitions are selected.

### Decision: Closed Allowlisted Transition Matrix and Honest Recovery Guard

| Option | Tradeoff | Decision |
|---|---|---|
| A. Unrestricted recovery transitions allowing arbitrary self-repair | Risk of infinite repair loops and unconstrained repository mutations | Rejected |
| B. Static single-retry policy for all failures | Inadequate for validation gaps (which require replanning) and ambiguous effects | Rejected |
| C. Allowlisted transition matrix with bounded scopes and blocking fingerprint advancement | Bounded repair paths/findings; requires distinct blocking fingerprint or forces `stop` | **Chosen** |

**Choice**: Recovery transition table mapping failure categories strictly to `{repair, replan, escalate, stop}`. Repair transitions enforce bounded `allowed_paths`, `node_ids`, and `finding_ids`. Stagnant fingerprints force terminal stop.
**Alternatives considered**: Attempt-only bounds without fingerprint checking (rejected because infinite loops can occur with identical failure output).
**Rationale**: Satisfies REQ-failure-recovery-003, REQ-failure-recovery-004, and REQ-failure-recovery-005, guaranteeing honest progress.

---

## Data Flow

### 1. Execution Budget and Monotonicity Flow

```
   ┌─────────────────────────────────────────────────────────────┐
   │ WorkOrder / Graph Node Execution Request                   │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ execution-budgets.js: evaluateNodeBudget()                  │
   │  - Checks turns, patches, commands, wall_time, lines        │
   │  - Validates patch bounds against allowed_paths             │
   └──────────────┬───────────────────────────────┬──────────────┘
                  │ [Quota Remaining]             │ [Exhausted (0)]
                  ▼                               ▼
   ┌──────────────────────────────┐ ┌────────────────────────────┐
   │ Authorize Execution Step     │ │ Reject Fail-Closed         │
   │ - Mint Operation Permit      │ │ - Force `escalate` | `stop`│
   └──────────────┬───────────────┘ └────────────────────────────┘
                  │
                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ Lifecycle Reducer: reduceLifecycle()                        │
   │  - Decrements budget monotonically: B_new = B_old - Δ       │
   │  - Zero-delta check: if Δ_semantic == 0, count attempt      │
   │  - Telemetry isolation: counters stripped from digest       │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ Authority Store: compareAndSwap()                           │
   │  - CAS Conflict? Re-sync with preserved decremented budget  │
   └─────────────────────────────────────────────────────────────┘
```

### 2. Causal Failure Classification & Recovery Routing Flow

```
   ┌─────────────────────────────────────────────────────────────┐
   │ Execution / Verification Fault Outcome                      │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ causal-failure.js: createCausalFailure() & resolvePrimary() │
   │  - Classify into 5 categories; map legacy tags              │
   │  - Priority: Env (1) > CAS (2) > Ambiguous (3) > Gap (4) > Defect (5) │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ failure-recovery.js: getAllowlistedTransitions()            │
   │  - code_defect:      [repair (if budget), replan, escalate, stop] │
   │  - validation_gap:   [replan, escalate, stop] (NO repair)   │
   │  - ambiguous_effect: [escalate, stop] (NO blind repair)     │
   │  - cas_conflict:     [replan (rebase), escalate, stop]      │
   │  - env_tooling:      [replan (re-dispatch), escalate, stop] │
   └──────────────────────────────┬──────────────────────────────┘
                                  │
                                  ▼
   ┌─────────────────────────────────────────────────────────────┐
   │ recovery.js: validateRecoveryHonesty()                      │
   │  - Compute blockingFingerprint(before) vs (after)           │
   │  - FP_after != FP_before  ──> Advanced (Recovery Accepted)  │
   │  - FP_after == FP_before  ──> Non-advancing (Force STOP)    │
   └─────────────────────────────────────────────────────────────┘
```

---

## File Changes

| File | Action | Description |
|---|---|---|
| `schemas/kernel/execution-budget/v1.schema.json` | Create | Schema for node execution budgets ($id: `ospec://schemas/kernel/execution-budget/v1`) |
| `schemas/kernel/execution-budget/fixtures/` | Create | Valid and invalid fixtures for execution-budget schema |
| `schemas/kernel/authority-effect-budget/v1.schema.json` | Create | Schema for authority & effect budgets ($id: `ospec://schemas/kernel/authority-effect-budget/v1`) |
| `schemas/kernel/authority-effect-budget/fixtures/` | Create | Valid and invalid fixtures for authority-effect-budget schema |
| `schemas/kernel/causal-failure/v1.schema.json` | Create | Schema for causal failure descriptors ($id: `ospec://schemas/kernel/causal-failure/v1`) |
| `schemas/kernel/causal-failure/fixtures/` | Create | Valid and invalid fixtures for causal-failure schema |
| `schemas/kernel/failure-recovery-transition/v1.schema.json` | Create | Schema for recovery transitions ($id: `ospec://schemas/kernel/failure-recovery-transition/v1`) |
| `schemas/kernel/failure-recovery-transition/fixtures/` | Create | Valid and invalid fixtures for failure-recovery-transition schema |
| `schemas/kernel/manifest.json` | Modify | Register new K5 schema families in schema manifest |
| `schemas/kernel/contract-claims.json` | Modify | Add contract claims and required fields for K5 schema families |
| `scripts/lib/execution-budgets.js` | Create | Budget evaluation, patch bounds check, zero-delta detection, and monotonicity helpers |
| `scripts/lib/execution-budgets.test.js` | Create | Unit tests for pure budget evaluator and patch limit enforcement |
| `scripts/lib/causal-failure.js` | Create | Causal failure taxonomy constructor, legacy tag resolver, and priority precedence resolver |
| `scripts/lib/causal-failure.test.js` | Create | Unit tests for failure taxonomy and deterministic priority resolution |
| `scripts/lib/failure-recovery.js` | Create | Allowlisted transition matrix, bounded repair scope validator, and recovery router |
| `scripts/lib/failure-recovery.test.js` | Create | Unit tests for transition allowlist and repair scope validation |
| `scripts/lib/contract-checkers/k5-failure-transition-matrix.js` | Create | Contract lint checker for causal taxonomy and transition allowlist |
| `scripts/lib/contract-checkers/k5-budget-structure.js` | Create | Contract lint checker for budget schema structure and non-inflation |
| `scripts/lib/contract-checkers/k5-checkers.test.js` | Create | Tests for K5 contract lint checkers |
| `scripts/lib/contract-lint.js` | Modify | Register K5 checkers in unified contract-lint aggregator |
| `scripts/lib/lifecycle-kernel/state-digest.js` | Modify | Ensure telemetry keys (`telemetry`, `consumption`, `wall_clock_ms`) are stripped from digests |
| `scripts/lib/lifecycle-kernel/reducer.js` | Modify | Enforce monotonic budget decrement, zero-delta attempt consumption, and terminal transitions |
| `scripts/lib/lifecycle-kernel/recovery.js` | Modify | Integrate blocking fingerprint advancement verification and allowlisted recovery validation |
| `scripts/lib/lifecycle-kernel/transition-selector.js` | Modify | Incorporate causal failure priority resolution and budget-exhausted transition pruning |
| `scripts/lib/lifecycle-kernel/index.js` | Modify | Connect budget evaluator and causal failure handlers into kernel runtime execution |
| `scripts/lib/authority-store/index.js` | Modify | Preserve monotonic budget accounting across CAS conflicts and retries |
| `scripts/lib/lifecycle-model.js` | Modify | Implement executable K5 conformance invariant checkers and promote deferred invariants |
| `scripts/lib/lifecycle-model.test.js` | Modify | Test executable K5 model conformance invariants |
| `scripts/lib/k5-budgets-failures-recovery.test.js` | Create | Comprehensive integration suite covering K5 E2E scenarios |

---

## Interfaces / Contracts

### 1. Execution Budgets (`scripts/lib/execution-budgets.js`)

```javascript
/**
 * @typedef {Object} NodeExecutionBudget
 * @property {number} schema_version - 1
 * @property {number} turns - integer > 0
 * @property {number} patches - integer >= 0
 * @property {number} commands - integer >= 0
 * @property {number} wall_time_minutes - number > 0
 * @property {number} changed_lines - integer > 0
 * @property {string[]} allowed_paths - array of glob string patterns
 */

/**
 * @typedef {Object} AuthorityEffectBudget
 * @property {number} schema_version - 1
 * @property {number} effect_attempts - integer > 0
 * @property {number} authority_mutations - integer >= 0
 * @property {number} evidence_runs - integer >= 0
 * @property {number} review_sweeps - integer >= 0
 */

/**
 * Pure evaluator for node execution budget against consumed telemetry.
 * @param {NodeExecutionBudget} budget
 * @param {Object} consumed
 * @returns {{ ok: boolean, exhausted: boolean, dimension?: string, remaining: Object, code?: string }}
 */
function evaluateNodeBudget(budget, consumed = {});

/**
 * Pure evaluator for authority effect budget.
 * @param {AuthorityEffectBudget} budget
 * @param {Object} consumed
 * @returns {{ ok: boolean, exhausted: boolean, dimension?: string, remaining: Object, code?: string }}
 */
function evaluateAuthorityBudget(budget, consumed = {});

/**
 * Monotonically decrements a budget by consumed delta without negative underflow.
 * @param {Object} budget
 * @param {Object} delta
 * @returns {Object} newBudget
 */
function decrementBudgetMonotonic(budget, delta);

/**
 * Checks patch diff lines and paths against node budget quotas.
 * @param {Object} params
 * @param {string|Object} params.patch
 * @param {number} params.changedLinesLimit
 * @param {string[]} params.allowedPaths
 * @returns {{ ok: boolean, code?: string, changed_lines: number, violations?: string[] }}
 */
function checkPatchBounds({ patch, changedLinesLimit, allowedPaths });

/**
 * Detects whether an effect-bearing mutation step produced zero semantic progress.
 * @param {Object} params
 * @param {number} params.modifiedFilesCount
 * @param {number} params.changedLines
 * @param {boolean} params.stateAdvanced
 * @returns {boolean}
 */
function isZeroDeltaMutation({ modifiedFilesCount, changedLines, stateAdvanced });
```

### 2. Causal Failure Taxonomy (`scripts/lib/causal-failure.js`)

```javascript
/**
 * Closed causal failure categories with strict priority ranking (1 = highest).
 */
const CAUSAL_CATEGORIES = Object.freeze({
  ENVIRONMENT_TOOLING: "environment_tooling", // Priority 1
  CAS_CONFLICT: "cas_conflict",               // Priority 2
  AMBIGUOUS_EFFECT: "ambiguous_effect",       // Priority 3
  VALIDATION_GAP: "validation_gap",           // Priority 4
  CODE_DEFECT: "code_defect",                 // Priority 5
});

const CAUSAL_PRIORITY = Object.freeze({
  environment_tooling: 1,
  cas_conflict: 2,
  ambiguous_effect: 3,
  validation_gap: 4,
  code_defect: 5,
});

/**
 * Constructs a canonical CausalFailure descriptor.
 * @param {Object} params
 * @param {string} params.failure_id
 * @param {string} params.category - from CAUSAL_CATEGORIES
 * @param {string} params.code - canonical failure code
 * @param {string} params.blocking_fingerprint
 * @param {Object} [params.details]
 * @returns {Object} CausalFailure payload
 */
function createCausalFailure({ failure_id, category, code, blocking_fingerprint, details = {} });

/**
 * Maps legacy verify routing tags to canonical causal category and code.
 * @param {string} legacyTag - 'spec' | 'design' | 'tasks' | 'code' | 'evidence-format'
 * @returns {{ category: string, code: string }}
 */
function mapLegacyRoutingTag(legacyTag);

/**
 * Deterministically resolves the primary failure from a mixed set of failures.
 * @param {Array<Object>} failures
 * @returns {Object} primaryFailure
 */
function resolvePrimaryFailure(failures);
```

### 3. Allowlisted Recovery Transitions (`scripts/lib/failure-recovery.js`)

```javascript
const ALLOWLISTED_TRANSITION_MATRIX = Object.freeze({
  code_defect: Object.freeze(["repair", "replan", "escalate", "stop"]),
  validation_gap: Object.freeze(["replan", "escalate", "stop"]),
  ambiguous_effect: Object.freeze(["escalate", "stop"]),
  cas_conflict: Object.freeze(["replan", "escalate", "stop"]),
  environment_tooling: Object.freeze(["replan", "escalate", "stop"]),
});

/**
 * Returns allowlisted recovery transitions for a causal category.
 * @param {string} category
 * @param {Object} context - { remainingAttempts: number }
 * @returns {string[]} allowlisted operations
 */
function getAllowlistedTransitions(category, context = {});

/**
 * Validates whether a target recovery operation is valid for a failure category.
 * @param {string} category
 * @param {string} operation - 'repair' | 'replan' | 'escalate' | 'stop'
 * @param {Object} context
 * @returns {{ ok: boolean, code?: string }}
 */
function validateRecoveryTransition(category, operation, context = {});

/**
 * Validates that a repair operation mutates only within bounded scope.
 * @param {Object} params
 * @param {Object} params.scope - { node_ids: string[], allowed_paths: string[], finding_ids: string[] }
 * @param {string} params.targetNodeId
 * @param {string[]} params.modifiedPaths
 * @param {string[]} params.resolvedFindingIds
 * @returns {{ ok: boolean, violations?: string[] }}
 */
function validateRepairScope({ scope, targetNodeId, modifiedPaths, resolvedFindingIds });
```

---

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | `execution-budgets.js`: quota evaluation, bounds check, zero-delta detection, monotonicity math | Comprehensive mocha/assert test suite with boundary and negative cases |
| Unit | `causal-failure.js`: classification of 5 categories, legacy tag mapping, priority sorting | Multi-failure permutation tests verifying deterministic primary resolution |
| Unit | `failure-recovery.js`: transition allowlist enforcement, bounded repair scope verification | Matrix tests covering all (category x transition) pairs and path glob bounds |
| Unit | `contract-lint.js` checkers: `k5-failure-transition-matrix.js`, `k5-budget-structure.js` | Fixture-based tests verifying offenders on negative quotas and unallowlisted ops |
| Integration | `lifecycle-kernel`: reducer monotonicity, zero-delta attempt count, blocking fingerprint advance | End-to-end lifecycle runs through `runKernelOperation` verifying CAS and retries |
| Integration | Schema conformance: `schemas/kernel/` v1 schemas and fixtures | `kernel-schema-fixtures.test.js` exercising valid and invalid fixtures |
| Conformance | `lifecycle-model.js`: executable K5 invariants (monotonicity, priority, honesty, telemetry) | Minimal Kernel Harness scenario sweeps verifying zero-regression K2.1-K5 invariants |

---

## Migration / Rollout

No data migration required. K5 introduces pure contracts, schema definitions, and in-memory lifecycle evaluation logic.
- Backward compatibility: Graph nodes without explicit budget objects fall back to declarative default quotas (`DEFAULT_WORK_ORDER_BUDGET`).
- Legacy verify routing tags (`spec`, `design`, `tasks`, `code`, `evidence-format`) are automatically translated into canonical causal taxonomy codes.
- Rollback: Safe to revert to predecessor state as K5 does not alter external persistence stores.

---

## Open Questions

None. All technical requirements and design allocations are fully resolved.
