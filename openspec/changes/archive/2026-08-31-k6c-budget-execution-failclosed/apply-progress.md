# Apply Progress: K6c Budget and Execution Fail-Closed Remediation

## Execution Mode
- Mode: Focused TDD (`testing.tdd_mode: focused`)
- Test runner: `node --test`
- Strategy: `size-exception` (Single PR, review workload ~60 changed lines)

## Completed Tasks

### Phase 1: Worker Sandbox Spawn and Infrastructure Error Classification
- [x] 1.1 (RED) Add unit test in `scripts/lib/worker-sandbox.test.js` verifying that process spawn errors and child process launch failures return explicit `failure_class: "spawn_error"`. [REQ-adversarial-challenges-004]
  - *Evidence*: `scripts/lib/worker-sandbox.test.js` added test failing with `actual: undefined, expected: 'spawn_error'`.
- [x] 1.2 (GREEN) Modify `scripts/lib/worker-sandbox.js` to assign `failure_class: "spawn_error"` in `child.on("error")` handler and synchronous `spawn` catch block. [REQ-adversarial-challenges-004]
  - *Evidence*: 23/23 tests pass in `scripts/lib/worker-sandbox.test.js`.
- [x] 1.3 (REFACTOR) Normalize error message extraction and ensure clean encapsulation in `executeSandboxedCommand`. [REQ-adversarial-challenges-004]
  - *Evidence*: Clean `msg` resolution across asynchronous and synchronous handlers.

### Phase 2: Monotonic Mutation Budget Enforcement in Challenge Runner
- [x] 2.1 (RED) Add unit tests in `scripts/lib/adversarial-challenges/runner.test.js` verifying that `focal-mutation` execution decrements `mutation_budget` monotonically via `tracker.consumeMutations(1)` and halts immediately with `causal-failure/v1` (`CHALLENGE_BUDGET_EXHAUSTED`, dimension `mutation_budget`) upon exhaustion. [REQ-adversarial-challenges-003]
  - *Evidence*: Initial test with `mutation_budget: 0` failed expecting `false` but received `true`.
- [x] 2.2 (GREEN) Update `scripts/lib/adversarial-challenges/runner.js` to pass `tracker` and `plan` into `runIsolatedMutation`, invoke `tracker.consumeMutations(1)` before applying each mutation, and immediately halt returning `tracker.buildExhaustionFailure` when consumption returns `false`. [REQ-adversarial-challenges-003]
  - *Evidence*: Immediate halt and emission of typed causal failure verified with test pass.
- [x] 2.3 (REFACTOR) Streamline budget tracker propagation and causal failure error handling across `executeChallengePlan` and `runIsolatedMutation`. [REQ-adversarial-challenges-003]
  - *Evidence*: Multi-mutation budget decrement and clean causal failure propagation verified (14/14 tests pass).

### Phase 3: Fail-Closed Tooling and Execution Error Handling in Runner
- [x] 3.1 (RED) Add adversarial unit tests in `scripts/lib/adversarial-challenges/runner.test.js` verifying that spawn errors, timeouts, and sandbox rejections during `focal-mutation` or `revert` produce `outcome: "error"` (`CHALLENGE_EXECUTION_ERROR` / `CHALLENGE_TIMEOUT`) and strictly do not increment `defects_detected` or result in `outcome: "passed"`. [REQ-adversarial-challenges-004]
  - *Evidence*: 3 tests failed as expected (`spawn_error` and `timeout` during `focal-mutation` previously yielded false positive passes, and `timeout` in `revert` yielded `CHALLENGE_EXECUTION_ERROR` instead of `CHALLENGE_TIMEOUT`).
- [x] 3.2 (GREEN) Update `scripts/lib/adversarial-challenges/runner.js` (`runWorkspaceTests` and `runIsolatedMutation`) to strictly classify `failure_class: "spawn_error"`, `failure_class: "sandbox_rejection"`, `failure_class: "cancel"`, and `failure_class: "timeout"`, incrementing `defects_detected` only when `exitCode !== 0` with no `failure_class`. [REQ-adversarial-challenges-004]
  - *Evidence*: 20/20 tests pass in `scripts/lib/adversarial-challenges/runner.test.js`.
- [x] 3.3 (REFACTOR) Consolidate test run outcome gating logic and eliminate redundant error checks in `runIsolatedMutation`. [REQ-adversarial-challenges-004]
  - *Evidence*: Unified failure classification structure in `runIsolatedMutation` across both `revert` and `focal-mutation`.

### Phase 4: Verification and Test Suite Validation
- [x] 4.1 Run targeted test suites for worker sandbox and adversarial challenges (`node --test scripts/lib/worker-sandbox.test.js scripts/lib/adversarial-challenges/runner.test.js`). [REQ-adversarial-challenges-003, REQ-adversarial-challenges-004]
  - *Evidence*: 43/43 tests pass cleanly.
- [x] 4.2 Run complete project test suite (`node --test`) to confirm zero regressions across all subsystems. [REQ-adversarial-challenges-003, REQ-adversarial-challenges-004]
  - *Evidence*: Full test suite passed (exit code 0).
