# Tasks: Reconcile K4a Replay Completion Contract and Formalize ReplayFixtureResult

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-006: Replay Engine Minimal Contract | MUST | `scripts/lib/execution-graph/replay-engine.js` (6 dimensions) | covered-by-design | Formalizes 6 completion dimensions, removes "missing output fields" |
| Scenario 1: Deterministic convergence | MUST | `scripts/lib/execution-graph/replay-engine.js` (`_executeReplay`) | covered-by-design | In-memory DAG execution against pre-recorded fixtures |
| Scenario 2: Claiming completed without evidence | MUST | `scripts/lib/execution-graph/replay-engine.js` (Dimension 4) | covered-by-design | Missing/null/array/primitive evidence fails closed |
| Scenario 3: Non-zero exit_code contradiction | MUST | `scripts/lib/execution-graph/replay-engine.js` (Dimension 3) | covered-by-design | Non-zero exit code contradicts completed status |
| Scenario 4: Tampered graph binding fails closed | MUST | `scripts/lib/execution-graph/replay-engine.js` (`validateExecutionGraphBinding`) | covered-by-design | Fails closed on graph-id mismatch |
| Scenario 5: Missing/mismatched graph_id or work_order_id | MUST | `scripts/lib/execution-graph/replay-engine.js` (Dimension 1) | covered-by-design | Rejects stale or unbound fixture with `stale-fixture-rejected` |
| Scenario 6: Legacy unpinned fixtures segregation | MUST | `scripts/lib/execution-graph/replay-engine.js` (`replayLegacyFixtureGraph`) | covered-by-design | Segregates legacy fixtures to dedicated helper |
| Scenario 7: Node missing required evidence | MUST | `scripts/lib/execution-graph/replay-engine.js` (Dimension 5) | covered-by-design | Unfulfilled node evidence marks node failed & blocks downstream |
| Scenario 8: Cancelled or malformed fixture | MUST | `scripts/lib/execution-graph/replay-engine.js` (Dimension 2) | covered-by-design | Fails closed and generates reproducible counterexample |
| Scenario 9: Invalidation & clarify immunity | MUST | `scripts/lib/execution-graph/replay-engine.js` (`invalidatedNodeIds`) | covered-by-design | Invalidation set rejected; stale fixtures cannot resurrect nodes |
| Scenario 10: Counterexample on obligation failure | MUST | `scripts/lib/execution-graph/replay-engine.js` (Dimension 6) | covered-by-design | Obligation failure emits diagnostic counterexample trace |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~120-180 lines |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | single-pr |
| Chain strategy | single-pr |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: single-pr
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Reconcile canonical spec, harden replay test suite, bump version metadata, and verify quality gates | PR 1 | Autonomous single PR deliverable; low diff budget |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Canonical Specification Reconciliation

- [x] 1.1 Update `openspec/specs/execution-graph-compiler/spec.md` to reconcile REQ-006 with the exact 6-dimension `ReplayFixtureResult` contract, eliminating "missing output fields" and aligning all 10 scenarios [REQ-execution-graph-compiler-006]
- [x] 1.2 Verify canonical spec alignment against `openspec/changes/k4a-replay-completion-contract-reconciliation/specs/execution-graph-compiler/spec.md` [REQ-execution-graph-compiler-006]

## Phase 2: Contractual Replay Test Suite Hardening

- [x] 2.1 Extend `scripts/lib/execution-graph/replay-engine.test.js` with comprehensive contractual unit tests for the 6 completion dimensions of `ReplayFixtureResult` (provenance, terminal status, exit code, evidence object type, required evidence coverage, obligation satisfaction) [REQ-execution-graph-compiler-006]
- [x] 2.2 Add adversarial tests in `scripts/lib/execution-graph/replay-engine.test.js` covering fail-closed rejections for malformed evidence (`null`, array `[]`, primitive values, missing keys) and contradictory terminal statuses (`status: "completed"` with `outcome: "failed"`, `ok: false`, non-zero `exit_code`) [REQ-execution-graph-compiler-006]
- [x] 2.3 Add test cases in `scripts/lib/execution-graph/replay-engine.test.js` validating reproducible counterexample generation, DAG invalidation rejection, and legacy unpinned fixture segregation [REQ-execution-graph-compiler-006]

## Phase 3: Version Bump, Release Notes & Roadmap Reconciliation

- [x] 3.1 Bump version to `2.45.7` in `package.json`, `openspec/config.yaml`, `.plugin.json`, and `.claude-plugin/plugin.json` [REQ-execution-graph-compiler-006]
- [x] 3.2 Add release entry for `[2.45.7] - 2026-08-20` in `CHANGELOG.md` detailing the K4a `ReplayFixtureResult` contract reconciliation, removal of "missing output fields", and test suite hardening [REQ-execution-graph-compiler-006]
- [x] 3.3 Reconcile `docs/roadmaps/harness-evolution.md` with release metadata, K4a gate formal closure, and provenance alignment [REQ-execution-graph-compiler-006]

## Phase 4: Full Test Suite & Quality Gate Verification

- [x] 4.1 Run test suite via `npm test` (`node scripts/check.js`) and ensure 100% pass rate across all unit and integration tests [REQ-execution-graph-compiler-006]
- [x] 4.2 Verify multi-target build and configuration generators across all 7 supported targets (`claude`, `vscode`, `github-copilot`, `opencode`, `codex`, `cursor`, `antigravity`) [REQ-execution-graph-compiler-006]
