# Apply Progress: k6b-durable-replay-receipt-authority

Mode: Focused TDD
Delivery: size:exception (review-workload-001; exception-ok)
Branch: `fix/k6b-durable-replay-receipt-authority`

## Batch 1 — all 24 tasks

| Task | Status | Local verification |
| ---- | ------ | ------------------ |
| 1.1 | [x] | `computeRevision` 4th arg; empty bag ≡ 3-arg digest |
| 1.2 | [x] | `load()`/`snapshot()` default `runner_receipts: {}`; `digestAuthority` still `{permits, receipts}` |
| 1.3 | [x] | `receipt-kind-mismatch`; head unchanged |
| 1.4 | [x] | live bag on every `inner.commit` / `computeRevision` (CAS, heal, journal, persist) |
| 1.5 | [x] | RED tests in `scripts/lib/authority-store/index.test.js` |
| 1.6 | [x] | authority-store suite green |
| 2.1 | [x] | FileSystemStore `defaultRecord`/`load`/`commit`/`commitJournal` persist field; 4th `computeRevision` arg |
| 2.2 | [x] | RED restart test without `snapshot()` |
| 2.3 | [x] | filesystem-store suite green |
| 3.1 | [x] | `persistRunnerReceipts` reads WeakMap, writes `runner-receipt/v1` keyed by `receipt_id` |
| 3.2 | [x] | `rehydrateAndIssueRunnerReceiptChannel` schema → recompute id → homogeneous issuer → new channel |
| 3.3 | [x] | RED tests in `runner-receipt-store.test.js` |
| 3.4 | [x] | runner-receipt-store suite green |
| 3.5 | [x] | `persistTestRunnerReceipts` / `rehydrateTestRunnerReceiptChannel` helpers |
| 4.1 | [x] | `normalizeRole` bind in `validateReplayRecords` |
| 4.2 | [x] | terminal adversarial #2: missing bound receipt → `GRAPH_DIVERGENCE` |
| 4.3 | [x] | terminal adversarial #3: `acceptance→integration` + recomputed `assessment_id` → `GRAPH_DIVERGENCE` |
| 4.4 | [x] | existing replay characterization remains green |
| 5.1 | [x] | terminal adversarial #1 in `runner-receipt-restart.test.js` |
| 5.2 | [x] | persist → fresh store → reissue → same `graph_id` |
| 5.3 | [x] | `independent-verifier/index.test.js` unchanged (53 pass); no `index.js` edits |
| 5.4 | [x] | `npm test` → 2817 pass, 2 skipped, 0 fail; `All checks passed.` |
| 6.1 | [x] | roadmap: K6b `revise`; K6c blocked until archive of this change |
| 6.2 | [x] | architecture mirror of the same gate |

## Runtime evidence

Targeted command:

```
node --test scripts/lib/authority-store/index.test.js scripts/lib/filesystem-store.test.js scripts/lib/independent-verifier/runner-receipt-store.test.js scripts/lib/independent-verifier/runner-receipt-restart.test.js scripts/lib/assurance-graph/index.test.js
```

Result: 82 pass, 0 fail.

```
node --test scripts/lib/independent-verifier/index.test.js scripts/lib/k6b-schema-fixtures.test.js
```

Result: 66 pass, 0 fail (includes unchanged verifier characterization + K6b schema fixtures / K1 pin check).

```
npm test
```

Result: Native Node tests 2817 pass / 2 skipped / 0 fail; `All checks passed.`

## Files changed

| File | Action | What was done |
|------|--------|---------------|
| `scripts/lib/authority-store/index.js` | Modified | 4th `computeRevision` arg; `runner_receipts` bag; kind guards; thread bag through CAS |
| `scripts/lib/authority-store/index.test.js` | Modified | Digest, kind-mismatch, persist-and-keep-bag tests |
| `scripts/lib/filesystem-store.js` | Modified | Persist `runner_receipts`; 4th revision arg |
| `scripts/lib/filesystem-store.test.js` | Modified | Restart restores both receipt families without `snapshot()` |
| `scripts/lib/independent-verifier/runner-receipt-store.js` | Created | persist / rehydrate / reissue helpers |
| `scripts/lib/independent-verifier/runner-receipt-store.test.js` | Created | Divergent id; DTO untrusted; new channel identity |
| `scripts/lib/independent-verifier/runner-receipt-restart.test.js` | Created | Terminal #1 same `graph_id`; missing receipt → `GRAPH_DIVERGENCE` |
| `scripts/lib/assurance-graph/index.js` | Modified | `normalizeRole` bind after bound receipt resolution |
| `scripts/lib/assurance-graph/index.test.js` | Modified | Terminal #2 and #3 |
| `scripts/lib/test-support/k6b-runner-receipt.js` | Modified | Persist/rehydrate test helpers |
| `docs/roadmaps/harness-evolution.md` | Modified | K6b `revise`; K6c blocked until archive |
| `docs/architecture/harness-evolution.md` | Modified | Same K6b/K6c gate |

Not edited: `scripts/lib/independent-verifier/index.js`, `evidence/v2`, `verification/v2`, K1 schema pins.

## Deviations from Design

None — implementation matches design. Persist lives in `runner-receipt-store.js` as a trusted-channel side effect; CAS field is record-root `runner_receipts`.

## Issues Found

None.

## Workload / PR Boundary

- Mode: size:exception
- Current work unit: all 24 tasks (single PR)
- Boundary: authority-store → filesystem-store → runner-receipt-store → assurance-graph → integration → docs
- Estimated review budget impact: High (accepted exception)
