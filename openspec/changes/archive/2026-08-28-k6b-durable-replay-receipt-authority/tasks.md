# Tasks: k6b-durable-replay-receipt-authority

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-AG-006 / Replay same graph | MUST | `assurance-graph/index.js` + reissued channel | covered-by-design | Existing replay path; channel from rehydrate |
| REQ-AG-006 / Cross-runtime same graph_id | MUST | `runner-receipt-store.js`, `filesystem-store.js`, restart test | covered-by-design | A persist → B load → reissue |
| REQ-AG-006 / No observation material | MUST | `validateReplayRecords` (existing) | covered-by-design | No code change |
| REQ-AG-006 / Content-addressed blob replay | MUST | `validateReplayRecords` (existing) | covered-by-design | No code change |
| REQ-AG-006 / Tampered assessment_id | MUST | `validateReplayRecords` (existing) | covered-by-design | No code change |
| REQ-AG-006 / Mutated role + recomputed assessment_id | MUST | `assurance-graph/index.js` `normalizeRole` bind | covered-by-design | ADR-004 |
| REQ-AG-006 / Assessment schema/candidate/policy | MUST | `validateReplayRecords` (existing) | covered-by-design | No code change |
| REQ-AG-006 / Missing evidence or bad node bind | MUST | `validateReplayRecords` (existing) | covered-by-design | No code change |
| REQ-AG-006 / Evidence digest/candidate mismatch | MUST | `validateReplayRecords` (existing) | covered-by-design | No code change |
| REQ-AG-006 / Tampered evidence_id | MUST | `validateReplayRecords` (existing) | covered-by-design | No code change |
| REQ-AG-006 / Insufficient provenance | MUST | `validateReplayRecords` (existing) | covered-by-design | No code change |
| REQ-AG-006 / Verification bad evidence_ids | MUST | `validateReplayRecords` (existing) | covered-by-design | No code change |
| REQ-AG-006 / No trusted channel | MUST | `runner-receipt-channel.js` WeakMap (existing) | covered-by-design | Reissue ≠ prior identity |
| REQ-AG-006 / Missing persisted runner-receipt | MUST | `runner-receipt-store.js` rehydrate omit | covered-by-design | → GRAPH_DIVERGENCE |
| REQ-AG-006 / Forged channel public fields | MUST | `runner-receipt-channel.js` (existing) | covered-by-design | No serialize WeakMap |
| REQ-AG-006 / Evidence receipt binding | MUST | `validateReplayRecords` (existing) | covered-by-design | No code change |
| REQ-AG-006 / Coverage not attested | MUST | `validateReplayRecords` (existing) | covered-by-design | No code change |
| REQ-AG-006 / Null/non-object bundle | MUST | `validateReplayRecords` (existing) | covered-by-design | No code change |
| REQ-IV-009 / Restart reissue same graph_id | MUST | `runner-receipt-store.js`, `runner-receipt-restart.test.js` | covered-by-design | Terminal adversarial #1 |
| REQ-IV-009 / Missing record blocks reissue | MUST | `rehydrateAndIssueRunnerReceiptChannel` fail-closed | covered-by-design | Terminal adversarial #2 |
| REQ-IV-009 / Diverging receipt_id on rehydrate | MUST | `runner-receipt-store.js` recompute check | covered-by-design | Before channel issue |
| REQ-IV-009 / verifyCandidate unchanged | MUST | No edits to `independent-verifier/index.js` | covered-by-design | Characterization green |
| REQ-AS-018 / Distinct CAS collection | MUST | `authority-store/index.js` `runner_receipts` root field | covered-by-design | ADR-001 |
| REQ-AS-018 / Kind mismatch fail closed | MUST | CAS kind guards in authority-store | covered-by-design | `receipt-kind-mismatch` |
| REQ-AS-018 / Restart restore both families | MUST | `filesystem-store.js` load/commit threading | covered-by-design | No manual snapshot |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none (field name `runner_receipts` resolved in design)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 550–700 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Single PR with size-exception (logical units 1→3 for apply order) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | CAS `runner_receipts` + revision digest + FileSystemStore threading | PR 1 (size-exception) | Foundation; all `inner.commit` paths carry live bag |
| 2 | `runner-receipt-store.js` persist / rehydrate / reissue | PR 1 (continued) | Trusted-channel side effect; no verifyCandidate edits |
| 3 | Replay role bind + adversarial tests + roadmap docs | PR 1 (continued) | Three terminal scenarios + characterization |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Authority Store & Revision Foundation

- [x] 1.1 Extend `computeRevision(state, journal, authority, runnerReceipts)` in `scripts/lib/authority-store/index.js`: add `runner_receipts_digest` only when `Object.keys(runnerReceipts).length > 0`; empty/absent bag MUST match today's 3-arg digest [REQ-authority-store-018]
- [x] 1.2 Add record-root `runner_receipts: {}` default on load; keep `digestAuthority({permits, receipts})` OperationReceipt-only [REQ-authority-store-018]
- [x] 1.3 Implement kind guards in CAS: reject `runner-receipt/v1` in `authority.receipts` and OperationReceipt in `runner_receipts` with `receipt-kind-mismatch`, head unchanged [REQ-authority-store-018]
- [x] 1.4 Thread live `runner_receipts` through every `computeRevision` and `entry.inner.commit` call in `authority-store/index.js` (including `commitJournal`, heal, compareAndSwap win path) so lifecycle CAS cannot drop the bag [REQ-authority-store-018]
- [x] 1.5 RED: `scripts/lib/authority-store/index.test.js` — empty digest ≡ 3-arg; distinct bag; kind mismatch; OperationReceipt-only in `authority.receipts` [REQ-authority-store-018]
- [x] 1.6 GREEN: make 1.1–1.4 pass authority-store tests [REQ-authority-store-018]

## Phase 2: FileSystemStore Persistence

- [x] 2.1 Persist `runner_receipts` in `scripts/lib/filesystem-store.js` `defaultRecord`, `load`, `commit`, and `commitJournal`; pass bag as 4th arg to `computeRevision` [REQ-authority-store-018, REQ-independent-verification-009]
- [x] 2.2 RED: `scripts/lib/filesystem-store.test.js` — committed head restores both `authority.receipts` and `runner_receipts` via fresh `load()` without `snapshot()` [REQ-authority-store-018]
- [x] 2.3 GREEN: implement 2.1 until filesystem-store restart test passes [REQ-authority-store-018]

## Phase 3: Runner Receipt Store (Persist / Rehydrate / Reissue)

- [x] 3.1 Create `scripts/lib/independent-verifier/runner-receipt-store.js` with `persistRunnerReceipts(store, channel, subjectId?)` reading WeakMap via `readRunnerReceiptChannel`; write schema-valid `runner-receipt/v1` keyed by `receipt_id` into CAS `runner_receipts` [REQ-independent-verification-009, REQ-authority-store-018]
- [x] 3.2 Implement `rehydrateAndIssueRunnerReceiptChannel(store, identity?)`: load records → schema validate → `computeRunnerReceiptId` → fail closed on divergence → homogeneous `issuer_id`+`transport` check → `createRunnerReceiptAuthority` + `issueRunnerReceiptChannel` (new WeakMap identity) [REQ-independent-verification-009]
- [x] 3.3 RED: `scripts/lib/independent-verifier/runner-receipt-store.test.js` — diverging `receipt_id`; caller DTO without reissued channel → `UNTRUSTED_RUNNER_RECEIPT`; reissued channel ≠ pre-restart object [REQ-independent-verification-009]
- [x] 3.4 GREEN: implement 3.1–3.2 until runner-receipt-store tests pass [REQ-independent-verification-009]
- [x] 3.5 Update `scripts/lib/test-support/k6b-runner-receipt.js` with persist / rehydrate helpers for integration fixtures [REQ-independent-verification-009]

## Phase 4: Assurance Graph Replay Role Binding

- [x] 4.1 In `scripts/lib/assurance-graph/index.js` `validateReplayRecords`, after bound receipt resolution, require `normalizeRole(assessment.role) === normalizeRole(runnerReceipt.role)`; mismatch → `GRAPH_DIVERGENCE` even when `assessment_id` validates [REQ-assurance-graph-006]
- [x] 4.2 RED: `scripts/lib/assurance-graph/index.test.js` — **terminal adversarial #2**: bound `runner_receipt_id` absent from store → `GRAPH_DIVERGENCE` [REQ-assurance-graph-006, REQ-independent-verification-009]
- [x] 4.3 RED: `scripts/lib/assurance-graph/index.test.js` — **terminal adversarial #3**: `acceptance→integration` role tamper with recomputed `assessment_id` → `GRAPH_DIVERGENCE` [REQ-assurance-graph-006]
- [x] 4.4 GREEN: implement 4.1 until 4.2–4.3 pass; confirm existing replay characterization scenarios remain green [REQ-assurance-graph-006]

## Phase 5: Cross-Runtime Integration & Characterization

- [x] 5.1 RED: create `scripts/lib/independent-verifier/runner-receipt-restart.test.js` — **terminal adversarial #1**: runtime A verify + `persistRunnerReceipts` → destroy A / empty WeakMap → runtime B `rehydrateAndIssueRunnerReceiptChannel` → `replayAssuranceGraph` → same `graph_id`; channel identity MUST differ from A [REQ-independent-verification-009, REQ-assurance-graph-006]
- [x] 5.2 GREEN: wire persist/rehydrate into restart test path until 5.1 passes [REQ-independent-verification-009]
- [x] 5.3 Run `scripts/lib/independent-verifier/index.test.js` unchanged — confirm `verifyCandidate`, strategy, MUST-walk, and `replay_evidence[].runner_receipt_id` behavior unchanged (no store coupling) [REQ-independent-verification-009]
- [x] 5.4 Run full `npm test`; fix regressions without mutating `evidence/v2`, `verification/v2`, or K1 pins [REQ-independent-verification-009]

## Phase 6: Documentation

- [x] 6.1 Update `docs/roadmaps/harness-evolution.md`: K6b status `revise`; K6c `blocked` until archive of this change [proposal success criteria]
- [x] 6.2 Mirror same K6b/K6c gate in `docs/architecture/harness-evolution.md` if that file duplicates the roadmap entry [proposal success criteria]
