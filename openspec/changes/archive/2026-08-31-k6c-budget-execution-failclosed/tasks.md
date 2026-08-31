# Tasks: K6c Budget and Execution Fail-Closed Remediation

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| `REQ-adversarial-challenges-003`: Monotonic budget consumption during challenge execution | MUST | `scripts/lib/adversarial-challenges/runner.js` (`executeChallengePlan`, `runIsolatedMutation`), `budget.js` | covered-by-design | Decrements challenge and mutation counters monotonically |
| `REQ-adversarial-challenges-003`: Mutation budget exhaustion halts focal mutation and emits causal failure | MUST | `scripts/lib/adversarial-challenges/runner.js` (`runIsolatedMutation`), `budget.js` (`buildExhaustionFailure`) | covered-by-design | Emits `CHALLENGE_BUDGET_EXHAUSTED` with dimension `mutation_budget` |
| `REQ-adversarial-challenges-003`: Budget exhaustion triggers causal failure transition without blind restart | MUST | `scripts/lib/adversarial-challenges/runner.js` (`executeChallengePlan`) | covered-by-design | Returns causal failure directly to caller without retrying loop |
| `REQ-adversarial-challenges-004`: Focal mutation detects seeded defect and challenge passes | MUST | `scripts/lib/adversarial-challenges/runner.js` (`runIsolatedMutation`), `runWorkspaceTests` | covered-by-design | Increments `defects_detected` on assertion failures (`exitCode !== 0` without `failure_class`) |
| `REQ-adversarial-challenges-004`: Complacent test suite passes on seeded defect and challenge fails | MUST | `scripts/lib/adversarial-challenges/runner.js` (`runIsolatedMutation`) | covered-by-design | Emits `outcome: "failed"` with `COMPLACENT_TEST_DETECTED` on `exitCode === 0` |
| `REQ-adversarial-challenges-004`: Test inspection detects tautological assertion | MUST | `scripts/lib/adversarial-challenges/runner.js`, `mutator.js` (`inspectTestAssertions`) | covered-by-design | Rejects tautological tests with `TAUTOLOGICAL_TEST_DETECTED` |
| `REQ-adversarial-challenges-004`: Missing capability or deadline expiry fails closed | MUST | `scripts/lib/adversarial-challenges/runner.js` (`withDeadline`, capability check) | covered-by-design | Emits `CHALLENGE_TIMEOUT` or capability failure without pass |
| `REQ-adversarial-challenges-004`: Foreign scope or candidate mutation is rejected | MUST | `scripts/lib/adversarial-challenges/runner.js`, `diff-scope.js`, `candidateIdentityIntact` | covered-by-design | Validates pre/post tree digest and rejects widening |
| `REQ-adversarial-challenges-004`: Missing tests fail closed without a passed outcome | MUST | `scripts/lib/adversarial-challenges/runner.js` (`runWorkspaceTests`, `runIsolatedMutation`) | covered-by-design | Returns `outcome: "error"` with `MISSING_TESTS` |
| `REQ-adversarial-challenges-004`: Zero mutations or no-op revert/mutation fail closed | MUST | `scripts/lib/adversarial-challenges/runner.js` (`runIsolatedMutation`) | covered-by-design | Returns `outcome: "error"` with `NO_MUTATION_APPLIED` or `CHALLENGE_NOOP` |
| `REQ-adversarial-challenges-004`: Spawn error or infrastructure failure emits error and never increments defects | MUST | `scripts/lib/worker-sandbox.js` (`executeSandboxedCommand`), `runner.js` (`runWorkspaceTests`, `runIsolatedMutation`) | covered-by-design | Explicit `failure_class: "spawn_error"`, emits `outcome: "error"` `CHALLENGE_EXECUTION_ERROR`, zero defects |
| `REQ-adversarial-challenges-004`: Timeout or sandbox rejection emits error outcome without passed result | MUST | `scripts/lib/adversarial-challenges/runner.js` (`runWorkspaceTests`, `runIsolatedMutation`) | covered-by-design | Maps `timeout` to `CHALLENGE_TIMEOUT` and `sandbox_rejection` to `CHALLENGE_EXECUTION_ERROR` |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~80-120 lines |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Fail-closed budget and execution error remediation | PR 1 | Single PR covering `worker-sandbox.js`, `runner.js`, and associated test suites |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Worker Sandbox Spawn and Infrastructure Error Classification

- [x] 1.1 (RED) Add unit test in `scripts/lib/worker-sandbox.test.js` verifying that process spawn errors and child process launch failures return explicit `failure_class: "spawn_error"`. [REQ-adversarial-challenges-004]
- [x] 1.2 (GREEN) Modify `scripts/lib/worker-sandbox.js` to assign `failure_class: "spawn_error"` in `child.on("error")` handler and synchronous `spawn` catch block. [REQ-adversarial-challenges-004]
- [x] 1.3 (REFACTOR) Normalize error message extraction and ensure clean encapsulation in `executeSandboxedCommand`. [REQ-adversarial-challenges-004]

## Phase 2: Monotonic Mutation Budget Enforcement in Challenge Runner

- [x] 2.1 (RED) Add unit tests in `scripts/lib/adversarial-challenges/runner.test.js` verifying that `focal-mutation` execution decrements `mutation_budget` monotonically via `tracker.consumeMutations(1)` and halts immediately with `causal-failure/v1` (`CHALLENGE_BUDGET_EXHAUSTED`, dimension `mutation_budget`) upon exhaustion. [REQ-adversarial-challenges-003]
- [x] 2.2 (GREEN) Update `scripts/lib/adversarial-challenges/runner.js` to pass `tracker` and `plan` into `runIsolatedMutation`, invoke `tracker.consumeMutations(1)` before applying each mutation, and immediately halt returning `tracker.buildExhaustionFailure` when consumption returns `false`. [REQ-adversarial-challenges-003]
- [x] 2.3 (REFACTOR) Streamline budget tracker propagation and causal failure error handling across `executeChallengePlan` and `runIsolatedMutation`. [REQ-adversarial-challenges-003]

## Phase 3: Fail-Closed Tooling and Execution Error Handling in Runner

- [x] 3.1 (RED) Add adversarial unit tests in `scripts/lib/adversarial-challenges/runner.test.js` verifying that spawn errors, timeouts, and sandbox rejections during `focal-mutation` or `revert` produce `outcome: "error"` (`CHALLENGE_EXECUTION_ERROR` / `CHALLENGE_TIMEOUT`) and strictly do not increment `defects_detected` or result in `outcome: "passed"`. [REQ-adversarial-challenges-004]
- [x] 3.2 (GREEN) Update `scripts/lib/adversarial-challenges/runner.js` (`runWorkspaceTests` and `runIsolatedMutation`) to strictly classify `failure_class: "spawn_error"`, `failure_class: "sandbox_rejection"`, `failure_class: "cancel"`, and `failure_class: "timeout"`, incrementing `defects_detected` only when `exitCode !== 0` with no `failure_class`. [REQ-adversarial-challenges-004]
- [x] 3.3 (REFACTOR) Consolidate test run outcome gating logic and eliminate redundant error checks in `runIsolatedMutation`. [REQ-adversarial-challenges-004]

## Phase 4: Verification and Test Suite Validation

- [x] 4.1 Run targeted test suites for worker sandbox and adversarial challenges (`node --test scripts/lib/worker-sandbox.test.js scripts/lib/adversarial-challenges/runner.test.js`). [REQ-adversarial-challenges-003, REQ-adversarial-challenges-004]
- [x] 4.2 Run complete project test suite (`node --test`) to confirm zero regressions across all subsystems. [REQ-adversarial-challenges-003, REQ-adversarial-challenges-004]
