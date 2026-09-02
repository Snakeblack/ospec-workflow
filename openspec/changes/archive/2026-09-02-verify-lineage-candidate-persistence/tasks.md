# Tasks: Recoverable Candidate Persistence for Verify Lineage

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-verify-lineage-010 / start exact preimage | MUST | `verify-lineage-candidate-store.js`, `startVerifyLineage` | covered-by-design | Canonical UTF-8 bytes, digest-derived path, read-back validation. |
| REQ-verify-lineage-010 / repeated persistence | MUST | candidate store idempotent no-clobber publish | covered-by-design | Identical existing bytes accepted; divergent bytes rejected. |
| REQ-verify-lineage-011 / restart preparation | MUST | `prepareRemediation` recovery reference | covered-by-design | No in-memory Candidate required after reload. |
| REQ-verify-lineage-011 / successor restart | MUST | `recordRemediationAttempt` persist-before-state | covered-by-design | Successor reference is durable before returned state. |
| REQ-verify-lineage-011 / tamper or missing blocks | MUST | resolver + immutable transition snapshots | covered-by-design | Stable reason codes and zero mutation. |
| REQ-verify-lineage-012 / legacy inspection | MUST | ID-only reader compatibility | covered-by-design | No preimage synthesis or history rewrite. |
| REQ-verify-lineage-012 / legacy mutation rejection | MUST | mutable transition guard | covered-by-design | Returns `legacy-candidate-recovery-unavailable`. |
| REQ-VL-K3-001 / canonical identity | MUST | K3 validation in store and lineage flow | covered-by-design | Content digest never replaces `candidate_id`. |
| REQ-VL-K3-001 / incomplete Candidate | MUST | start validation before reference publication | covered-by-design | Invalid input yields no observable lineage reference. |
| REQ-VL-K3-001 / recovered identity disagreement | MUST | double validation in resolver | covered-by-design | Digest and recomputed Candidate ID both checked. |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

Estimated changed lines: 650–850 (runtime, skills, K1 registration, and adversarial/cross-process tests).
Delivery strategy: exception-ok.
Suggested split: three autonomous work units; retain as one size-exception PR if preferred.

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

## Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Candidate CAS and canonical validation | PR 1 | RED→GREEN→REFACTOR for store unit tests; create `verify-lineage-candidate-store.js` and tests. |
| 2 | Lineage integration and consumer contracts | PR 2 | Depends on Unit 1; update `verify-lineage.js`, `verify-lineage.test.js`, `sdd-apply/SKILL.md`, `sdd-verify/SKILL.md`, and K1 scope registration. |
| 3 | Restart/crash/adversarial verification | PR 3 | Depends on Unit 2; add spawned-process and crash-boundary tests, then run `npm test`. |

## Phase 1: Candidate Store (TDD)

- [x] 1.1 RED: add `scripts/lib/verify-lineage-candidate-store.test.js` fixtures for canonical bytes, digest/path derivation, confinement, symlink rejection, and incomplete Candidates [REQ-verify-lineage-010, REQ-VL-K3-001].
- [x] 1.2 GREEN: create `scripts/lib/verify-lineage-candidate-store.js` with stable serialization, SHA-256 references, UTF-8 byte persistence, and path validation [REQ-verify-lineage-010, REQ-VL-K3-001].
- [x] 1.3 RED/GREEN: test and implement atomic temp-file flush, no-clobber idempotency, conflict detection, and Windows/POSIX-compatible directory handling [REQ-verify-lineage-010].
- [x] 1.4 RED/GREEN: test resolver double-checks stored digest, canonical form, and expected `candidate_id`, including missing, tampered, noncanonical, and divergent records [REQ-verify-lineage-011, REQ-VL-K3-001].
- [x] 1.5 REFACTOR: isolate stable reason codes and ensure failed store operations leave no published reference [REQ-verify-lineage-010, REQ-verify-lineage-011].

## Phase 2: Lineage Integration

- [x] 2.1 RED: extend `scripts/lib/verify-lineage.test.js` for reference-bearing start state and exact genesis/current identity assertions [REQ-verify-lineage-010, REQ-VL-K3-001].
- [x] 2.2 GREEN: update `scripts/lib/verify-lineage.js` so `startVerifyLineage` persists and re-reads genesis before returning [REQ-verify-lineage-010].
- [x] 2.3 RED/GREEN: make `prepareRemediation` recover the lineage-carried baseline and block before mutation on every recovery failure; assert deep-equal pre/post lineage snapshots [REQ-verify-lineage-011].
- [x] 2.4 RED/GREEN: make `recordRemediationAttempt` persist and validate successor material before returning updated lineage, preserving attempts/findings/scopes on failure [REQ-verify-lineage-011].
- [x] 2.5 RED/GREEN: add ID-only legacy fixtures for unchanged inspection and safe mutable rejection; update `skills/sdd-apply/SKILL.md`, `skills/sdd-verify/SKILL.md`, and `scripts/lib/k1-scope-guard.test.js` [REQ-verify-lineage-012].
- [x] 2.6 REFACTOR: preserve schema-version-1 additive compatibility and keep `candidate_id` as the only identity authority [REQ-VL-K3-001, REQ-verify-lineage-012].

## Phase 3: Restart and Verification

- [x] 3.1 Add spawned Node-process tests in `scripts/lib/verify-lineage.test.js` for start→serialize→reload→prepare and successor→reload→recheck without in-memory Candidate [REQ-verify-lineage-011].
- [x] 3.2 Add crash-boundary tests for temp write, final publish, post-publish/pre-state, and state-write failure; assert dangling references never validate and history remains unchanged [REQ-verify-lineage-010, REQ-verify-lineage-011].
- [x] 3.3 Run focal store, lineage, and K1 tests, then `npm test`; record evidence for all ten MUST scenarios and confirm no K6d/CX0 files changed [REQ-verify-lineage-010, REQ-verify-lineage-011, REQ-verify-lineage-012, REQ-VL-K3-001].

## Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally
