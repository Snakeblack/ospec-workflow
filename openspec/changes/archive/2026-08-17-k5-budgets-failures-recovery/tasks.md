# Tasks: K5 — Budgets, Causal Failures, and Common Recovery

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| `REQ-execution-budgets-001`: Uniform Node Execution Budgets | MUST | `scripts/lib/execution-budgets.js`, `evaluateNodeBudget` & `checkPatchBounds` | covered-by-design | Enforces turns, patches, commands, wall time, changed lines, and path boundaries |
| `REQ-execution-budgets-002`: Authority And Effect Execution Budgets | MUST | `scripts/lib/execution-budgets.js`, `evaluateAuthorityBudget` | covered-by-design | Enforces effect attempts, authority mutations, evidence runs, and review sweeps |
| `REQ-execution-budgets-003`: Strict Budget Monotonicity Across Retries And CAS Conflicts | MUST | `scripts/lib/execution-budgets.js`, `decrementBudgetMonotonic` & `scripts/lib/authority-store/index.js` | covered-by-design | Non-increasing decrement math preserved across retry loops and CAS conflict reconciliations |
| `REQ-execution-budgets-004`: Zero-Delta Attempt Consumption | MUST | `scripts/lib/execution-budgets.js`, `isZeroDeltaMutation` & `scripts/lib/lifecycle-kernel/reducer.js` | covered-by-design | Counts attempts on non-advancing mutations while exempting read-only inspection steps |
| `REQ-execution-budgets-005`: Exhausted Budget Terminality And Re-Launch Prohibition | MUST | `scripts/lib/lifecycle-kernel/transition-selector.js` & `reducer.js` | covered-by-design | Prunes normal execution transitions when budget=0; advertises only `escalate`, `replan`, or `stop` |
| `REQ-execution-budgets-006`: Non-Semantic Telemetry Isolation | MUST | `scripts/lib/lifecycle-kernel/state-digest.js`, `stripVolatile` | covered-by-design | Isolates consumption counters and transient timers outside semantic digest hashing |
| `REQ-failure-recovery-001`: Causal Failure Taxonomy And Canonical Code Mapping | MUST | `scripts/lib/causal-failure.js`, `createCausalFailure` & `mapLegacyRoutingTag` | covered-by-design | Typed 5-category taxonomy (`environment_tooling`, `cas_conflict`, `ambiguous_effect`, `validation_gap`, `code_defect`) |
| `REQ-failure-recovery-002`: Deterministic Causal Priority Resolution For Mixed Failures | MUST | `scripts/lib/causal-failure.js`, `resolvePrimaryFailure` | covered-by-design | Priority order: Env (P1) > CAS (P2) > Ambiguous (P3) > Gap (P4) > Defect (P5) |
| `REQ-failure-recovery-003`: Allowlisted Recovery Transition Matrix | MUST | `scripts/lib/failure-recovery.js`, `getAllowlistedTransitions` & `validateRecoveryTransition` | covered-by-design | Strict mapping to `{repair, replan, escalate, stop}` per category |
| `REQ-failure-recovery-004`: Bounded Scope For Repair Transitions | MUST | `scripts/lib/failure-recovery.js`, `validateRepairScope` | covered-by-design | Restricts repair authority to failed `node_ids`, `allowed_paths`, and frozen `finding_ids` |
| `REQ-failure-recovery-005`: Honest E2E Recovery Via Blocking Fingerprint Advancement Or Terminal Stop | MUST | `scripts/lib/lifecycle-kernel/recovery.js`, `validateRecoveryHonesty` | covered-by-design | Validates `FP_after != FP_before`; identical fingerprint forces terminal stop |
| `REQ-failure-recovery-006`: Ambiguous Effect And CAS Conflict Recovery Non-Mutation | MUST | `scripts/lib/failure-recovery.js` & `scripts/lib/authority-store/index.js` | covered-by-design | Requires reconciliation before re-execution for ambiguous effects; re-syncs state for CAS |
| `REQ-contract-lint-014`: Causal Failure Taxonomy And Transition Matrix Checker | MUST | `scripts/lib/contract-checkers/k5-failure-transition-matrix.js` | covered-by-design | Lint checker validating taxonomy fields and allowlisted transition mappings |
| `REQ-contract-lint-015`: Execution Budget And Monotonicity Structure Checker | MUST | `scripts/lib/contract-checkers/k5-budget-structure.js` | covered-by-design | Lint checker validating non-negative quotas and budget hierarchy monotonicity |
| `REQ-kernel-contract-schemas-001`: Versioned Schema Families With Id And Version | MUST | `schemas/kernel/manifest.json` & `schemas/kernel/contract-claims.json` | covered-by-design | Registers K5 schema families with stable `$id` and explicit `schema_version: 1` |
| `REQ-kernel-contract-schemas-019`: Execution Budget And Authority Effect Budget Schema Families | MUST | `schemas/kernel/execution-budget/` & `schemas/kernel/authority-effect-budget/` | covered-by-design | Schemas and valid/invalid fixtures for node and authority budgets |
| `REQ-kernel-contract-schemas-020`: Causal Failure And Recovery Transition Schema Families | MUST | `schemas/kernel/causal-failure/` & `schemas/kernel/failure-recovery-transition/` | covered-by-design | Schemas and valid/invalid fixtures for causal failures and recovery transitions |
| `REQ-lifecycle-kernel-runtime-005`: Recovery Advances Or Terminates | MUST | `scripts/lib/lifecycle-kernel/recovery.js` | covered-by-design | Modifies existing recovery contract to require blocking fingerprint progression |
| `REQ-lifecycle-kernel-runtime-025`: Budget Monotonicity Enforcement In Lifecycle Reducers | MUST | `scripts/lib/lifecycle-kernel/reducer.js` | covered-by-design | Enforces non-increasing remaining quotas across retries and CAS reconciliations |
| `REQ-lifecycle-kernel-runtime-026`: Causal Failure Priority And Transition Routing | MUST | `scripts/lib/lifecycle-kernel/transition-selector.js` | covered-by-design | Selects next transitions from allowlisted matrix based on deterministic primary failure |
| `REQ-lifecycle-kernel-runtime-027`: Zero-Delta Consumption And Honest Terminality | MUST | `scripts/lib/lifecycle-kernel/reducer.js` | covered-by-design | Decrements attempts on zero-delta mutations; forces terminal transitions when exhausted |
| `REQ-lifecycle-model-conformance-003`: Opaque Future Ports | MUST | `scripts/lib/lifecycle-model.js` | covered-by-design | Promotes execution budgets and causal recovery structures from opaque to concrete model artifacts |
| `REQ-lifecycle-model-conformance-004`: Deferred Invariants Are Not Enforced In K2.1 | MUST | `scripts/lib/lifecycle-model.js` | covered-by-design | Removes budget monotonicity and recovery invariants from deferred list |
| `REQ-lifecycle-model-conformance-011`: Executable K5 Budget Monotonicity And Causal Recovery Invariants | MUST | `scripts/lib/lifecycle-model.js` | covered-by-design | Implements 7 executable invariant checkers for K5 in lifecycle model |

### Reconciliation Verdict
- MUST coverage: complete (24/24 requirements mapped to design components)
- SHOULD/MAY gaps: none
- Ambiguities to track: none

---

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1,950 lines (additions + deletions) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Single PR (delivery strategy: exception-ok; size:exception approved) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Versioned Schemas, Fixtures & Contract-Lint Checkers | PR 1 (Slice 1) | `schemas/kernel/` budgets, failures, transitions schemas + valid/invalid fixtures + lint checkers |
| 2 | Pure Budget & Taxonomy Engines (TDD) | PR 2 (Slice 2) | `execution-budgets.js` & `causal-failure.js` pure evaluators with unit tests |
| 3 | Failure Recovery, Kernel Integration, Model Conformance & Docs | PR 3 (Slice 3) | Kernel reducers, recovery honesty, model invariants, E2E tests, roadmap reconciliation |

*(Note: Under delivery strategy `exception-ok`, all work units are executed and merged in a single coordinated PR with maintainer `size:exception` pre-approved).*

---

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

---

## Phase 1: Schemas & Contract-Lint Infrastructure

- [x] 1.1 Create `schemas/kernel/execution-budget/v1.schema.json` ($id: `ospec://schemas/kernel/execution-budget/v1`) with required `schema_version`, positive `turns`, non-negative `patches`/`commands`, positive `wall_time_minutes`/`changed_lines`, `allowed_paths` string array, and `additionalProperties: false` [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-019]
- [x] 1.2 Create `schemas/kernel/execution-budget/fixtures/` containing valid (`valid-minimal.json`, `valid-full.json`) and invalid (`invalid-negative-turns.json`, `invalid-missing-changed-lines.json`, `invalid-extra-prop.json`) fixture files [REQ-kernel-contract-schemas-019]
- [x] 1.3 Create `schemas/kernel/authority-effect-budget/v1.schema.json` ($id: `ospec://schemas/kernel/authority-effect-budget/v1`) with required `schema_version`, positive `effect_attempts`, non-negative `authority_mutations`/`evidence_runs`/`review_sweeps`, and `additionalProperties: false` [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-019]
- [x] 1.4 Create `schemas/kernel/authority-effect-budget/fixtures/` containing valid (`valid-minimal.json`, `valid-full.json`) and invalid (`invalid-negative-attempts.json`, `invalid-missing-mutations.json`, `invalid-extra-prop.json`) fixture files [REQ-kernel-contract-schemas-019]
- [x] 1.5 Create `schemas/kernel/causal-failure/v1.schema.json` ($id: `ospec://schemas/kernel/causal-failure/v1`) with required `schema_version`, string `failure_id`, 5-category enum, string `code`, integer `priority` (1-5), string `blocking_fingerprint`, object `details`, and `additionalProperties: false` [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-020]
- [x] 1.6 Create `schemas/kernel/causal-failure/fixtures/` containing valid (`valid-environment-fault.json`, `valid-code-defect.json`, `valid-cas-conflict.json`) and invalid (`invalid-category-enum.json`, `invalid-priority-range.json`, `invalid-missing-fingerprint.json`) fixture files [REQ-kernel-contract-schemas-020]
- [x] 1.7 Create `schemas/kernel/failure-recovery-transition/v1.schema.json` ($id: `ospec://schemas/kernel/failure-recovery-transition/v1`) with required `schema_version`, string `transition_id`, string `failure_code`, target operation enum (`repair`, `replan`, `escalate`, `stop`), `scope` object (`node_ids`, `allowed_paths`, `finding_ids`), boolean `expected_advancement`, and `additionalProperties: false` [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-020]
- [x] 1.8 Create `schemas/kernel/failure-recovery-transition/fixtures/` containing valid (`valid-repair-transition.json`, `valid-escalate-transition.json`) and invalid (`invalid-operation-enum.json`, `invalid-missing-scope.json`, `invalid-extra-prop.json`) fixture files [REQ-kernel-contract-schemas-020]
- [x] 1.9 Register new K5 schema families in `schemas/kernel/manifest.json` and declare required field claims in `schemas/kernel/contract-claims.json` [REQ-kernel-contract-schemas-001]
- [x] 1.10 Create `scripts/lib/k5-schema-fixtures.test.js` validating schema registration and running positive/negative fixture assertions for all four K5 schema families [REQ-kernel-contract-schemas-001, REQ-kernel-contract-schemas-019, REQ-kernel-contract-schemas-020]
- [x] 1.11 Implement contract-lint checker `scripts/lib/contract-checkers/k5-failure-transition-matrix.js` verifying causal failure descriptor completeness and transition allowlist compliance [REQ-contract-lint-014]
- [x] 1.12 Implement contract-lint checker `scripts/lib/contract-checkers/k5-budget-structure.js` verifying non-negative budget quotas and hierarchy non-inflation, register both K5 checkers in `scripts/lib/contract-lint.js`, and write tests in `scripts/lib/contract-checkers/k5-checkers.test.js` [REQ-contract-lint-014, REQ-contract-lint-015]

---

## Phase 2: Pure Budget & Taxonomy Engines (TDD)

- [x] 2.1 [RED] Write failing unit tests in `scripts/lib/execution-budgets.test.js` covering `evaluateNodeBudget`, `evaluateAuthorityBudget`, `decrementBudgetMonotonic`, `checkPatchBounds` (changed lines and allowed paths globs), and `isZeroDeltaMutation` [REQ-execution-budgets-001, REQ-execution-budgets-002, REQ-execution-budgets-003, REQ-execution-budgets-004, REQ-execution-budgets-006]
- [x] 2.2 [GREEN] Implement pure functional budget evaluator in `scripts/lib/execution-budgets.js` exporting quota evaluators, monotonic decrement math, patch bounds checkers, zero-delta mutation detectors, and default budget definitions [REQ-execution-budgets-001, REQ-execution-budgets-002, REQ-execution-budgets-003, REQ-execution-budgets-004, REQ-execution-budgets-006]
- [x] 2.3 [RED] Write failing unit tests in `scripts/lib/causal-failure.test.js` covering 5-category classification, legacy verify routing tag mapping (`spec`, `design`, `tasks`, `code`, `evidence-format`), and deterministic priority resolution of mixed failure sets [REQ-failure-recovery-001, REQ-failure-recovery-002]
- [x] 2.4 [GREEN] Implement causal failure taxonomy descriptor constructor, legacy routing tag mapper, and deterministic priority resolver in `scripts/lib/causal-failure.js` [REQ-failure-recovery-001, REQ-failure-recovery-002]
- [x] 2.5 [REFACTOR] Clean up, optimize exports, and verify 100% test pass and branch coverage across `scripts/lib/execution-budgets.js` and `scripts/lib/causal-failure.js` [REQ-execution-budgets-001, REQ-failure-recovery-001]

---

## Phase 3: Failure Recovery, Kernel Integration & Honesty

- [x] 3.1 [RED] Write failing unit tests in `scripts/lib/failure-recovery.test.js` covering allowlisted transition matrix mappings for each failure category, bounded repair scope validation (`node_ids`, `allowed_paths`, `finding_ids`), and non-mutation recovery policies for ambiguous effects and CAS conflicts [REQ-failure-recovery-003, REQ-failure-recovery-004, REQ-failure-recovery-006]
- [x] 3.2 [GREEN] Implement recovery transition matrix query helpers, recovery operation validator, and bounded repair scope checker in `scripts/lib/failure-recovery.js` [REQ-failure-recovery-003, REQ-failure-recovery-004, REQ-failure-recovery-006]
- [x] 3.3 Update `scripts/lib/lifecycle-kernel/state-digest.js` to ensure transient telemetry keys (`telemetry`, `consumption`, `wall_clock_ms`) are strictly stripped from state objects prior to semantic digest computation [REQ-execution-budgets-006]
- [x] 3.4 Update `scripts/lib/lifecycle-kernel/reducer.js` to enforce monotonic budget decrements on node and authority quotas, record zero-delta attempt consumption on non-advancing mutation steps, and force terminal states on budget exhaustion [REQ-execution-budgets-003, REQ-execution-budgets-004, REQ-execution-budgets-005, REQ-lifecycle-kernel-runtime-025, REQ-lifecycle-kernel-runtime-027]
- [x] 3.5 Update `scripts/lib/lifecycle-kernel/transition-selector.js` to incorporate causal failure priority resolution for mixed failure sets and prune unallowlisted or budget-exhausted execution transitions [REQ-execution-budgets-005, REQ-failure-recovery-003, REQ-lifecycle-kernel-runtime-026]
- [x] 3.6 Update `scripts/lib/lifecycle-kernel/recovery.js` to integrate honest E2E recovery verification by asserting blocking fingerprint advancement (`FP_after != FP_before`) or forcing deterministic termination to `stop`/`escalate` on stagnant cycles [REQ-failure-recovery-005, REQ-lifecycle-kernel-runtime-005]
- [x] 3.7 Update `scripts/lib/authority-store/index.js` and `scripts/lib/lifecycle-kernel/index.js` to guarantee monotonic budget preservation across CAS race retries and re-sync cycles [REQ-execution-budgets-003, REQ-failure-recovery-006, REQ-lifecycle-kernel-runtime-025]
- [x] 3.8 Update lifecycle kernel unit and integration tests (`scripts/lib/lifecycle-kernel/*.test.js`) verifying monotonic decrements, causal failure transition selection, zero-delta accounting, and recovery honesty [REQ-lifecycle-kernel-runtime-005, REQ-lifecycle-kernel-runtime-025, REQ-lifecycle-kernel-runtime-026, REQ-lifecycle-kernel-runtime-027]

---

## Phase 4: Model Conformance & Invariant Verification

- [x] 4.1 Update `scripts/lib/lifecycle-model.js` to promote `def-budget-monotonicity` from `DEFERRED_INVARIANTS` and implement `K5_EXECUTABLE_INVARIANTS` checking budget monotonicity, causal priority resolution, transition allowlist enforcement, zero-delta consumption, budget exhaustion terminality, honest recovery blocking fingerprint advancement, and non-semantic telemetry isolation [REQ-lifecycle-model-conformance-003, REQ-lifecycle-model-conformance-004, REQ-lifecycle-model-conformance-011]
- [x] 4.2 Update `scripts/lib/lifecycle-model.test.js` and add model test suite `scripts/lib/k5-lifecycle-model.test.js` validating all 7 K5 executable invariants against state exploration traces [REQ-lifecycle-model-conformance-011]
- [x] 4.3 Update `scripts/lib/transition-parity.js` and `scripts/lib/transition-parity.test.js` ensuring transition parity checks and recovery action simulations cover K5 causal failure codes and allowlisted recovery operations [REQ-failure-recovery-003, REQ-lifecycle-model-conformance-011]
- [x] 4.4 Create comprehensive E2E integration test suite `scripts/lib/k5-budgets-failures-recovery.test.js` exercising combined scenarios: node execution budgets, authority/effect quotas, CAS conflict preservation, causal priority resolution, bounded repair scopes, zero-delta attempt consumption, and honest fingerprint progression [REQ-execution-budgets-001, REQ-execution-budgets-002, REQ-execution-budgets-003, REQ-execution-budgets-004, REQ-execution-budgets-005, REQ-execution-budgets-006, REQ-failure-recovery-001, REQ-failure-recovery-002, REQ-failure-recovery-003, REQ-failure-recovery-004, REQ-failure-recovery-005, REQ-failure-recovery-006]

---

## Phase 5: Documentation & Roadmap Reconciliation

- [x] 5.1 Update `docs/roadmaps/harness-evolution.md` lines 854-894 and roadmap summary tables to mark K5 as delivered/completed, update invariant status table (budget monotonicity and causal recovery invariants promoted to enforced), and designate K6a as next-eligible [REQ-lifecycle-model-conformance-004]
- [x] 5.2 Update `docs/architecture/harness-evolution.md` Section 1 status tables, Section 4 execution DAG/budget architecture, and Section 10 recovery architecture to document the concrete K5 budget evaluator, causal taxonomy, and recovery transition engine [REQ-lifecycle-model-conformance-003]
