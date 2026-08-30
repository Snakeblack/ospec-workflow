# Apply Progress: K6c Integrity Remediation

## 2026-08-29 — completed size-exception workstream

- [x] Tasks 1.1–1.4: added canonical K6c schema fixtures and a shared integrity boundary that recomputes plan/result IDs, validates complete catalog partitions, and rejects foreign or duplicate result sets.
- [x] Tasks 2.1–2.7: made planner node-bound and deterministic; derived focal scope only from the Candidate-bound unified diff; runner now gates enforced capabilities before effects, allocates/disposes a K6a workspace per type, checks Candidate bytes, and applies a monotonic wall-clock deadline with abort propagation.
- [x] Tasks 3.1–3.5: added required-K6c verifier entrypoint with exact set validation and typed accepted replay material; Assurance Graph projects non-authoritative plan/result nodes and revalidates them on replay.
- [x] Tasks 4.1–4.2: added adversarial fixture, integrity, runner, verifier, and graph cases. Focal verification passed with `node --test scripts/lib/adversarial-challenges/*.test.js scripts/lib/k6c-schema-fixtures.test.js scripts/lib/independent-verifier/index.test.js scripts/lib/assurance-graph/index.test.js` (121 passing). Full verification passed with `npm test` (exit 0; `All checks passed.`).

Delivery: `size:exception` accepted by the maintainer. K6d was not started and remains gated on terminal verification.

## 2026-08-29 — final focused-TDD recheck

- [x] Added the verified-diff scope and post-run Candidate-mutation regressions, plus explicit timeout-disposal assertion. The focal K6c command now reports 123 passing tests.
- [x] Re-ran `npm test` after the final regression additions: exit code 0 and `All checks passed.`

## 2026-08-30 — Phase 5 verify-FAIL remediation (size:exception)

Delivery: `size:exception` accepted; exception-ok overrides chained PRs. K6d remains blocked until terminal verify PASS.

- [x] 5.1 RED: two rebound plans with distinct `node_id` / `policy_snapshot_id` now assert distinct `plan_id` in `planner.test.js`.
- [x] 5.2 RED: runner integration cases mutate/run against K6a workspace bytes; focal `passed`, complacent `COMPLACENT_TEST_DETECTED`, tautological `TAUTOLOGICAL_TEST_DETECTED`.
- [x] 5.3 RED: mutating Candidate identity after a run with unchanged repo bytes fails closed (`CHALLENGE_INTEGRITY_INVALID`).
- [x] 5.4 GREEN: `runner.js` focal/revert/test-inspection operate only on materialized workspace files via `executeSandboxedCommand`; `context.sourceCode` / `runTests` mutation path removed.
- [x] 5.5 GREEN: `computeCandidateId(candidate)` is recomputed after each challenge and rejected on mismatch.
- [x] 5.6 RED: `verifyCandidateWithChallenges` e2e asserts `challenge_verification.status === "accepted"` only on the exact set; missing/duplicate/foreign suppress K6d eligibility.
- [x] 5.7 GREEN: required K6c path returns `challenge_verification`; projector receives `challengePlan`/`challengeResults`.
- [x] 5.8 RED: verifier-emitted K6c material projects and replays with byte-identical `graph_id`.
- [x] 5.9 GREEN: projector/replay already consume `challengePlan`/`challengeResults`; verifier forwarding aligned (no leftover `challenge_verification`/`replay_challenges` keys).
- [x] 5.10–5.11: malformed-hash fixtures under `fixtures/invalid/`; schema-valid cross-bound pair under `fixtures/pairs/` (pair-level `validateChallengeResultSet` rejection). `invalid/` cannot hold schema-valid pair fixtures because `k1-schema-compat` requires those files to fail schema validation.
- [x] 5.12: focal suite 130 passing; `npm test` exit 0, `All checks passed.`
- [x] Reopened 1.1, 2.5, 2.6, 3.1–3.3, 4.1–4.2 closed: MUST proof now exists.

Discovery: nested `node --test` inside an outer `node --test` skips child files (`NODE_TEST_CONTEXT`). Workspace suites execute as sandboxed `node <file>` via `executeSandboxedCommand` so candidate tests actually run.
