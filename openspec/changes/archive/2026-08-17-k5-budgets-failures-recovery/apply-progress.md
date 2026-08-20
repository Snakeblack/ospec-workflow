# Apply Progress: K5 — Budgets, Failures y Recovery Común

## Executive Summary
- **Change Name:** `k5-budgets-failures-recovery`
- **Delivery Strategy:** `exception-ok` (size:exception approved)
- **Implementation Mode:** `standard`
- **Total Tasks:** 31 tasks across 5 phases (100% completed)
- **Status:** Complete (all schema fixtures, contract-lint checkers, pure modules, lifecycle kernel integration, conformance invariants, and E2E suites passing with 0 regressions)
- **Working on branch `feat/k5-budgets-failures-recovery`**

---

## Phase 1: Schemas & Contract-Lint Infrastructure

### 1.1 Schema Definitions & Manifest Registration
Created 4 JSON Schema draft 2020-12 families with `$id`, `$schema`, and `additionalProperties: false`:
1. `schemas/kernel/execution-budget/v1.schema.json`
2. `schemas/kernel/authority-effect-budget/v1.schema.json`
3. `schemas/kernel/causal-failure/v1.schema.json`
4. `schemas/kernel/failure-recovery-transition/v1.schema.json`

Registered in `schemas/kernel/manifest.json` and declared required fields/enums in `schemas/kernel/contract-claims.json`. Enhanced constrained validator `scripts/lib/kernel-schema-validator.js` with numeric bounds keywords (`minimum`, `maximum`, `exclusiveMinimum`).

```json:strict-tdd-evidence
{
  "unit": "Phase 1 - Schema Fixtures",
  "test_file": "scripts/lib/k5-schema-fixtures.test.js",
  "status": "PASS",
  "tests_count": 6,
  "failures_count": 0
}
```

### 1.2 Pure Contract-Lint Checkers
Implemented and registered 2 contract checkers in `scripts/lib/contract-lint.js`:
- `scripts/lib/contract-checkers/k5-failure-transition-matrix.js`: Enforces allowlisted recovery operations per failure category.
- `scripts/lib/contract-checkers/k5-budget-structure.js`: Enforces valid budget schema structures, positive bounds, and repair scope restrictions.

```json:strict-tdd-evidence
{
  "unit": "Phase 1 - Contract Checkers",
  "test_file": "scripts/lib/contract-checkers/k5-checkers.test.js",
  "status": "PASS",
  "tests_count": 6,
  "failures_count": 0
}
```

---

## Phase 2: Pure Budget & Taxonomy Engines (Strict TDD)

### 2.1 Execution Budgets Engine
- **Test File:** `scripts/lib/execution-budgets.test.js` [RED -> GREEN -> REFACTOR]
- **Implementation File:** `scripts/lib/execution-budgets.js`
- **Exports:** `DEFAULT_NODE_BUDGET`, `DEFAULT_AUTHORITY_BUDGET`, `evaluateNodeBudget`, `evaluateAuthorityBudget`, `decrementBudgetMonotonic`, `checkPatchBounds`, `isZeroDeltaMutation`.

```json:strict-tdd-evidence
{
  "unit": "Phase 2 - Execution Budgets Engine",
  "test_file": "scripts/lib/execution-budgets.test.js",
  "status": "PASS",
  "tests_count": 8,
  "failures_count": 0
}
```

### 2.2 Causal Failure Taxonomy Engine
- **Test File:** `scripts/lib/causal-failure.test.js` [RED -> GREEN -> REFACTOR]
- **Implementation File:** `scripts/lib/causal-failure.js`
- **Exports:** `CAUSAL_CATEGORIES`, `CAUSAL_PRIORITY` (deterministic 1-5 ranking), `createCausalFailure`, `mapLegacyRoutingTag`, `resolvePrimaryFailure`.

```json:strict-tdd-evidence
{
  "unit": "Phase 2 - Causal Failure Taxonomy",
  "test_file": "scripts/lib/causal-failure.test.js",
  "status": "PASS",
  "tests_count": 5,
  "failures_count": 0
}
```

---

## Phase 3: Failure Recovery, Kernel Integration & Honesty

### 3.1 Failure Recovery Engine
- **Test File:** `scripts/lib/failure-recovery.test.js` [RED -> GREEN -> REFACTOR]
- **Implementation File:** `scripts/lib/failure-recovery.js`
- **Exports:** `ALLOWLISTED_TRANSITION_MATRIX`, `getAllowlistedTransitions`, `validateRecoveryTransition`, `validateRepairScope`, `requiresReconciliation`, `requiresStateResync`.

```json:strict-tdd-evidence
{
  "unit": "Phase 3 - Failure Recovery Engine",
  "test_file": "scripts/lib/failure-recovery.test.js",
  "status": "PASS",
  "tests_count": 5,
  "failures_count": 0
}
```

### 3.2 Kernel Core Integration
- **`scripts/lib/lifecycle-kernel/state-digest.js`:** Added volatile telemetry and transient consumption keys (`telemetry`, `consumption`, `wall_clock_ms`, `transient_timers`) to `VOLATILE_KEYS`.
- **`scripts/lib/lifecycle-kernel/reducer.js`:** Integrated monotonic budget decrements on node and authority budgets, record zero-delta attempt consumption events, and fail closed on budget exhaustion.
- **`scripts/lib/lifecycle-kernel/transition-selector.js`:** Integrated causal failure priority resolution for mixed failure sets, allowlisted transition filtering, and pruning of recovery on exhausted nodes.
- **`scripts/lib/lifecycle-kernel/recovery.js`:** Enhanced `blockingFingerprint` to strip transient counters and `validateRecoveryHonesty` to fail closed with `recovery-non-advancing` on stagnant cycles.
- **`scripts/lib/authority-store/index.js`:** Preserved monotonic budgets across CAS race retries and store re-synchronization.

---

## Phase 4: Lifecycle Model Conformance & Invariant Verification

### 4.1 Lifecycle Model Invariants
Promoted `def-budget-monotonicity` from `DEFERRED_INVARIANTS` and added `K5_EXECUTABLE_INVARIANTS` (7 executable invariants):
1. `inv-k5-budget-monotonicity`
2. `inv-k5-causal-priority`
3. `inv-k5-allowlist-enforcement`
4. `inv-k5-zero-delta-consumption`
5. `inv-k5-budget-exhaustion-terminal`
6. `inv-k5-honest-recovery-advancement`
7. `inv-k5-telemetry-isolation`

```json:strict-tdd-evidence
{
  "unit": "Phase 4 - Lifecycle Model Conformance",
  "test_file": "scripts/lib/k5-lifecycle-model.test.js",
  "status": "PASS",
  "tests_count": 8,
  "failures_count": 0
}
```

### 4.2 Integration & E2E Verification Suites
- `scripts/k5-e2e-budgets-recovery.test.js` (6/6 passing)
- `scripts/lib/k5-budgets-failures-recovery.test.js` (5/5 passing)
- `scripts/lib/transition-parity.test.js` (8/8 passing)

```json:strict-tdd-evidence
{
  "unit": "Phase 4 - K5 E2E & Combined Scenarios",
  "test_file": "scripts/lib/k5-budgets-failures-recovery.test.js",
  "status": "PASS",
  "tests_count": 5,
  "failures_count": 0
}
```

---

## Phase 5: Documentation & Roadmap Reconciliation
- Updated `docs/roadmaps/harness-evolution.md` marking K5 as delivered and designating K6a as next-eligible.
- Updated `docs/architecture/harness-evolution.md` Section 1, Section 4, and Section 10 documenting the concrete K5 budget evaluator, causal taxonomy, and recovery transition engine.
