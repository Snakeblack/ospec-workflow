# Tasks: K6c Integrity Remediation

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-adversarial-challenges-002: proportional selection, canonical bindings and IDs | MUST | `integrity.js`, `planner.js`, plan schema | covered-by-design | Verify FAIL: changed-binding scenario needs two rebound plans with distinct IDs. |
| REQ-adversarial-challenges-004: seeded defects, capability gate, timeout, scope and Candidate integrity | MUST | `diff-scope.js`, `runner.js`, K6a workspace/sandbox | covered-by-design | Verify FAIL: focal/revert bypass workspace bytes; post-run `computeCandidateId` missing. |
| REQ-independent-verification-010: exact plan/result set and fail-closed verdict | MUST | `challenge-evidence.js`, verifier shared core | covered-by-design | Verify FAIL: `challenge_verification.status` not returned; K6d gate not e2e-asserted. |
| REQ-assurance-graph-009: deterministic projection and replay | MUST | `projector.js`, graph `index.js`, graph schema | covered-by-design | Verify FAIL: verifier uses unsupported keys; K6c replay path untested. |
| REQ-kernel-contract-schemas-029: schemas, fixtures, registrations and pair integrity | MUST | kernel schemas, fixtures, `k6c-schema-fixtures.test.js` | covered-by-design | Verify FAIL: malformed-hash and cross-bound pair fixtures absent. |

### Reconciliation Verdict
- MUST coverage: complete (design allocation unchanged; verify exposed proof gaps)
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 350–550 (runner fix, verifier wiring, fixtures, targeted e2e tests) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Single remediation slice under size-exception (prior units 1–4 shipped) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

## Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 5A | Runner workspace execution and Candidate revalidation | Remediation PR | Fix `runLegacyMutation`; post-run `computeCandidateId`; RED/GREEN runner tests. |
| 5B | Verifier accepted status and graph contract wiring | Remediation PR | Return `challenge_verification`; forward `challengePlan`/`challengeResults`. |
| 5C | Fixture inventory and K6c replay e2e | Remediation PR | Malformed-hash/cross-bound fixtures; verifier→graph→replay byte identity. |

## Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Contracts and canonical integrity (RED → GREEN → REFACTOR)

- [x] 1.1 RED: add table-driven negative fixtures/tests for missing bindings, forged IDs, duplicate/foreign selections and cross-bound plan/result pairs in `scripts/lib/k6c-schema-fixtures.test.js` and `schemas/kernel/challenge-{plan,result}/fixtures/**` [REQ-kernel-contract-schemas-029, REQ-adversarial-challenges-002]
- [x] 1.2 GREEN: create `scripts/lib/adversarial-challenges/integrity.js` with cached schema loading, canonical bodies/IDs, Candidate/node/policy/strategy binding checks, catalog partition and exact result-set validation [REQ-adversarial-challenges-002, REQ-kernel-contract-schemas-029]
- [x] 1.3 GREEN: strengthen `schemas/kernel/challenge-plan/v1.schema.json`, `challenge-result/v1.schema.json`, Assurance Graph schema, `manifest.json` and `contract-claims.json`; add valid bound fixtures [REQ-kernel-contract-schemas-029]
- [x] 1.4 REFACTOR: export only public integrity/scope APIs from `scripts/lib/adversarial-challenges/index.js`; preserve byte pins for unaffected K1/evidence/verification contracts [REQ-kernel-contract-schemas-029]

## Phase 2: Planner, authoritative scope and isolated execution

- [x] 2.1 RED: add planner mutation tests for strategy-proportional catalog partitions, deterministic byte equality and changed node/policy bindings in `scripts/lib/adversarial-challenges/planner.test.js` [REQ-adversarial-challenges-002]
- [x] 2.2 GREEN: modify `planner.js` to require/validate `nodeId`, Candidate and PolicySnapshot, emit canonical v1 plan order, IDs, reasons and budget [REQ-adversarial-challenges-002]
- [x] 2.3 RED: add `diff-scope.js` tests proving diff-hash verification, normalized changed paths/line ranges, Candidate-path intersection and rejection of caller widening [REQ-adversarial-challenges-004]
- [x] 2.4 GREEN: create `scripts/lib/adversarial-challenges/diff-scope.js` and wire runner scope exclusively to verified unified-diff bytes [REQ-adversarial-challenges-004]
- [x] 2.5 RED: add real temp-workspace and non-cooperative executor tests for missing/partial capabilities, timeout finality, cancellation propagation, disposal and Candidate tree/diff digest mutation [REQ-adversarial-challenges-004]
- [x] 2.6 GREEN: modify `runner.js` to validate before effects, materialize one K6a workspace per selected type, require enforced challenge/isolation/cancellation capabilities, apply monotonic plan deadline, and verify/dispose after each run [REQ-adversarial-challenges-004]
- [x] 2.7 REFACTOR: remove duplicate integrity checks and retain existing catalog/selection and public runner compatibility; update exports [REQ-adversarial-challenges-002, REQ-adversarial-challenges-004]

## Phase 3: Verifier and Assurance Graph integration

- [x] 3.1 RED: add table-driven verifier tests for complete success, failed result, challenge-only evidence, absent/duplicate/foreign exact sets, and K6d suppression [REQ-independent-verification-010]
- [x] 3.2 GREEN: create `scripts/lib/independent-verifier/challenge-evidence.js`; modify `independent-verifier/index.js` to require canonical K6c entrypoint, exact set gate before verdict, typed status, `challenge_verification` and `replay_challenges` [REQ-independent-verification-010]
- [x] 3.3 RED: add projection/replay tests for input permutation stability, duplicate/foreign tamper, mandatory-plan absence, graph identity equality and `GRAPH_DIVERGENCE` [REQ-assurance-graph-009]
- [x] 3.4 GREEN: modify `scripts/lib/assurance-graph/projector.js` and `index.js` to validate material, project non-authoritative plan/result nodes and edges, and revalidate persisted replay bundles [REQ-assurance-graph-009]
- [x] 3.5 REFACTOR: ensure legacy verification remains compatible only when not routed through required K6c; accepted K6c is the sole K6d-eligible state [REQ-independent-verification-010, REQ-assurance-graph-009]

## Phase 4: Full adversarial verification

- [x] 4.1 Expand adversarial regressions across planner, runner, verifier and graph tests, mutating one canonical field at a time and recomputing forged IDs where required [REQ-adversarial-challenges-002, REQ-adversarial-challenges-004, REQ-independent-verification-010, REQ-assurance-graph-009]
- [x] 4.2 Run `npm test` and confirm schema/claim fixtures, byte pins, workspace disposal, timeout finality, exact coverage and deterministic replay; leave K6d blocked until terminal verification [REQ-kernel-contract-schemas-029, REQ-assurance-graph-009]

## Phase 5: Verify remediation — close MUST proof gaps (RED → GREEN → REFACTOR)

Maps CRITICAL findings 1–5 from `verify-report.md`. K6d remains blocked until terminal verify PASS.

### Changed-binding identity [CRITICAL-4 / REQ-adversarial-challenges-002]

- [x] 5.1 RED: extend `planner.test.js` or `integrity.test.js` to generate two otherwise identical plans with changed `node_id` and changed `policy_snapshot_id`, recompute canonical bindings, and assert distinct `plan_id` values [REQ-adversarial-challenges-002]

### Isolated workspace execution and Candidate revalidation [CRITICAL-1, CRITICAL-2 / REQ-adversarial-challenges-004]

- [x] 5.2 RED: add `runner.test.js` integration cases where focal-mutation seeds a defect inside materialized workspace bytes and asserts bound `outcome: "passed"`; complacent suite on seeded defect asserts `COMPLACENT_TEST_DETECTED`; test-inspection via isolated runner asserts `TAUTOLOGICAL_TEST_DETECTED` [REQ-adversarial-challenges-004]
- [x] 5.3 RED: add runner test mutating Candidate identity fields after execution while repository bytes stay unchanged; assert fail-closed before approving result [REQ-adversarial-challenges-004]
- [x] 5.4 GREEN: refactor `scripts/lib/adversarial-challenges/runner.js` so focal/revert paths mutate and run tests only against K6a materialized workspace bytes via `executeSandboxedCommand`; remove `context.sourceCode` / caller-callback mutation path [REQ-adversarial-challenges-004]
- [x] 5.5 GREEN: recompute `computeCandidateId(candidate)` after each challenge alongside existing tree/diff digest checks; reject mismatch with fail-closed result [REQ-adversarial-challenges-004]

### Verifier accepted status and K6d gate [CRITICAL-3, CRITICAL-4 / REQ-independent-verification-010]

- [x] 5.6 RED: add `independent-verifier/index.test.js` end-to-end cases through `verifyCandidateWithChallenges` asserting `challenge_verification.status === "accepted"` only on complete exact set; missing/duplicate/foreign results suppress K6d eligibility [REQ-independent-verification-010]
- [x] 5.7 GREEN: modify `scripts/lib/independent-verifier/index.js` to return `challenge_verification` with typed status on required K6c path; forward `challengePlan` and `challengeResults` (not `challenge_verification`/`replay_challenges`) to `projectAssuranceGraph` [REQ-independent-verification-010, REQ-assurance-graph-009]

### K6c graph projection and replay [CRITICAL-3, CRITICAL-4 / REQ-assurance-graph-009]

- [x] 5.8 RED: add assurance-graph test exercising verifier-emitted K6c material through projection and persisted replay; assert byte-identical `graph_id` and K6c-derived records [REQ-assurance-graph-009]
- [x] 5.9 GREEN: align any remaining verifier→graph wiring in `scripts/lib/assurance-graph/index.js` to consume `challengePlan`/`challengeResults` contract fields [REQ-assurance-graph-009]

### Contract fixture inventory [CRITICAL-5 / REQ-kernel-contract-schemas-029]

- [x] 5.10 RED: extend `scripts/lib/k6c-schema-fixtures.test.js` to require persisted malformed-hash plan/result fixtures and a cross-bound plan/result pair fixture with pair-level rejection [REQ-kernel-contract-schemas-029]
- [x] 5.11 GREEN: add negative fixtures under `schemas/kernel/challenge-plan/fixtures/**` and `schemas/kernel/challenge-result/fixtures/**` for malformed hashes and cross-bound substitution [REQ-kernel-contract-schemas-029]

### Terminal regression gate

- [x] 5.12 Run focal K6c suite and full `npm test`; confirm all seven previously failing MUST scenarios have acceptable runtime proof; leave K6d blocked pending terminal verify PASS [REQ-adversarial-challenges-002, REQ-adversarial-challenges-004, REQ-independent-verification-010, REQ-assurance-graph-009, REQ-kernel-contract-schemas-029]
