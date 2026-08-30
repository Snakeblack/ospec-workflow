# Tasks: K6c Integrity Remediation

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-adversarial-challenges-002: proportional selection, canonical bindings and IDs | MUST | `integrity.js`, `planner.js`, plan schema | covered-by-design | Catalog partition and byte-stable canonical order are explicit. |
| REQ-adversarial-challenges-004: seeded defects, capability gate, timeout, scope and Candidate integrity | MUST | `diff-scope.js`, `runner.js`, K6a workspace/sandbox | covered-by-design | Sticky deadline, cancellation and pre/post digest checks are allocated. |
| REQ-independent-verification-010: exact plan/result set and fail-closed verdict | MUST | `challenge-evidence.js`, verifier shared core | covered-by-design | Gate runs before verdict and suppresses approval/K6d on failure. |
| REQ-assurance-graph-009: deterministic projection and replay | MUST | `projector.js`, graph `index.js`, graph schema | covered-by-design | Full records are revalidated; divergence is explicit. |
| REQ-kernel-contract-schemas-029: schemas, fixtures, registrations and pair integrity | MUST | kernel schemas, fixtures, `k6c-schema-fixtures.test.js` | covered-by-design | Closed families and cross-bound rejection are covered. |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 900–1,300 (runtime, schemas, fixtures, adversarial tests) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 contracts/integrity; PR 2 runner/isolation; PR 3 verifier/graph; PR 4 adversarial regression suite |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

## Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Canonical K6c integrity gate and closed schemas | PR 1 | RED fixtures/tests, then `integrity.js`, schema/manifest updates. |
| 2 | Diff-derived scope and K6a-isolated runner | PR 2 | Includes capability enforcement, deadline, cancellation and digest cleanup. |
| 3 | Exact verifier gate and Assurance Graph projection/replay | PR 3 | Preserve legacy non-K6c verifier compatibility; block K6d. |
| 4 | Full adversarial/integration regression matrix and byte pins | PR 4 | Run `npm test`; no new behavior beyond specified coverage. |

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
