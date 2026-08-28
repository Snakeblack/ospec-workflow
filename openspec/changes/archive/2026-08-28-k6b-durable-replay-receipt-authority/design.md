# Design: k6b-durable-replay-receipt-authority

## Technical Approach

Replay-only close of the v2.54.0 blockers. Persist `runner-receipt/v1` in additive CAS field **`runner_receipts`** at the revision-record root (sibling of `authority`, not inside `authority.receipts`). After restart, load → schema → `computeRunnerReceiptId` → fail closed on divergence → `issueRunnerReceiptChannel` (new WeakMap identity). Replay still uses `persistable.runnerReceiptChannel` and adds `normalizeRole(assessment.role) === normalizeRole(receipt.role)` independent of `assessment_id`.

AG-006 / IV-009 / AS-018. `verifyCandidate` consumption, strategy, and MUST-walk stay untouched; persist is a trusted-channel helper side effect.

## Architecture Decisions

| Option | Tradeoff | Decision |
|---|---|---|
| Record-root `runner_receipts` vs `authority.runner_receipts` | Nesting mixes families and drifts `digestAuthority` | **`runner_receipts` sibling of `authority`** |
| Fold bag into `digestAuthority` vs additive digest | Unconditional hash retags every head | **`runner_receipts_digest` only when map non-empty** |
| Persist inside `verifyCandidate` vs helper | Couples strategy tests to the store | **`persistRunnerReceipts` / `rehydrateAndIssueRunnerReceiptChannel`** |
| Serialize channel vs records-only | Channel identity is ADR-014 trust | **Records only; never persist WeakMap** |
| Trust recomputed `assessment_id` vs `normalizeRole` bind | Identity already includes role (the hole) | **Independent bind → `GRAPH_DIVERGENCE`** |

### Decision: CAS collection field is `runner_receipts`

**Choice**: Map keyed by `receipt_id` on the FileSystemStore record root. Values MUST be `kind: "runner-receipt/v1"`.
**Alternatives considered**: `authority.runner_receipts` (mixes families; AS-018 restores the collection *together with* the authority bag); overloading `authority.receipts`; camelCase `runnerReceipts`.
**Rationale**: `digestAuthority` stays `{permits, receipts}` so OperationReceipt revision identity does not move.

### Decision: Additive revision digest, empty bag omitted

**Choice**: `computeRevision(state, journal, authority, runnerReceipts)` adds `runner_receipts_digest` iff the map has keys. Every `inner.commit`/`load` threads the live bag. Kind mismatch → `receipt-kind-mismatch`, head unchanged.
**Alternatives considered**: Always hash `{}` (breaks REQ-013); omit bag from revision (writers could swap receipts silently).
**Rationale**: Absent/`{}` ≡ today's three-component digest.

### Decision: Ephemeral channel; persist records; reissue after rehydrate

**Choice**: New `scripts/lib/independent-verifier/runner-receipt-store.js`. Persist reads WeakMap via `readRunnerReceiptChannel`. Rehydrate validates, recomputes ids, then `createRunnerReceiptAuthority` + `issueRunnerReceiptChannel`. New object identity; copied public fields still fail. One reissue: homogeneous `issuer_id`+`transport`.
**Alternatives considered**: Persist inside `verifyCandidate`; serialize WeakMap; reuse pre-restart channel.
**Rationale**: IV-009 / ADR-014. DTOs remain `UNTRUSTED_RUNNER_RECEIPT`.

### Decision: Replay role bind independent of `assessment_id`

**Choice**: In `validateReplayRecords` (`assurance-graph/index.js`), after the bound receipt is resolved, `normalizeRole(record.role) === normalizeRole(runnerReceipt.role)`. Fail `GRAPH_DIVERGENCE` even when `validateAssessment` succeeds.
**Alternatives considered**: Trust `assessment_id`; bind only when coverage tokens exist; compare raw strings (aliases false-diverge).
**Rationale**: Tamper `acceptance→integration` plus recomputed id is still the v2.54.0 hole.

## Data Flow

```mermaid
sequenceDiagram
  participant Harness
  participant Verify as verifyCandidate
  participant WM as WeakMap
  participant Disk as runner_receipts
  participant B as Runtime B
  participant Replay as replayAssuranceGraph

  Harness->>WM: issueRunnerReceiptChannel
  Harness->>Verify: opaque channel
  Verify-->>Harness: ok + runner_receipt_id
  Harness->>Disk: persistRunnerReceipts(channel)
  Note over Disk: authority.receipts unchanged
  B->>Disk: load() no snapshot()
  B->>B: recompute receipt_id; fail closed if diverge
  B->>WM: NEW issueRunnerReceiptChannel
  B->>Replay: bundle + new channel
  Replay-->>B: same graph_id
```

Role tamper: `validateAssessment` may pass → token ⊆ `satisfied_tokens` → `normalizeRole` mismatch → `GRAPH_DIVERGENCE`.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/authority-store/index.js` | Modify | Carry `runner_receipts`; 4th `computeRevision` arg; `persistRunnerReceipts`; kind guards |
| `scripts/lib/filesystem-store.js` | Modify | load/commit/commitJournal/defaultRecord persist the field; revision uses 4th arg |
| `scripts/lib/independent-verifier/runner-receipt-store.js` | Create | Persist / rehydrate / reissue |
| `scripts/lib/independent-verifier/internal/runner-receipt-channel.js` | Unchanged | WeakMap stays in-process; reissue calls existing `issueRunnerReceiptChannel` |
| `scripts/lib/independent-verifier/index.js` | Unchanged | Consumption / strategy / MUST-walk |
| `scripts/lib/assurance-graph/index.js` | Modify | `normalizeRole` bind in assessment loop |
| `scripts/lib/test-support/k6b-runner-receipt.js` | Modify | Persist / rehydrate test helpers |
| `scripts/lib/authority-store/index.test.js` | Modify | Distinct bag, kind mismatch, snapshot restore |
| `scripts/lib/filesystem-store.test.js` | Modify | Disk restart without `snapshot()` |
| `scripts/lib/assurance-graph/index.test.js` | Modify | Role tamper + recomputed id; missing record |
| `scripts/lib/independent-verifier/runner-receipt-store.test.js` | Create | Divergent id; DTO untrusted; new channel identity |
| `scripts/lib/independent-verifier/runner-receipt-restart.test.js` | Create | Persist → new process or empty WeakMap → same `graph_id` |
| `docs/roadmaps/harness-evolution.md` | Modify | K6b `revise`; K6c blocked until archive |
| `docs/architecture/harness-evolution.md` | Modify | Same gate if duplicated |

No `evidence/v2`, `verification/v2`, `runner-receipt/v1` schema, or K1 pin changes. `runner-receipt.js` reused as-is.

## Interfaces / Contracts

```javascript
// FileSystemStore record — additive
{ state, journal, budgets, authority: { permits, receipts }, runner_receipts: { [receipt_id]: v1 } }

// computeRevision: add runner_receipts_digest iff Object.keys(runnerReceipts).length > 0
// persistRunnerReceipts(store, channel, subjectId?): trusted channel; CAS; receipt-kind-mismatch
// rehydrateAndIssueRunnerReceiptChannel(store, identity?): validate + recompute; issue NEW channel
```

`replay_evidence[].runner_receipt_id` unchanged. Replay still requires `runnerReceiptChannel`.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Empty digest ≡ 3-arg; kind mismatch; role tamper; diverging `receipt_id` | store + assurance-graph + runner-receipt-store tests |
| Integration | Disk restore without `snapshot()`; A persist → B reissue → same `graph_id` | filesystem-store REQ-013 pattern; `runner-receipt-restart.test.js` (child_process or new store + unused prior channel) |
| Characterization | strategy / MUST-walk / `replay_evidence` | Existing `independent-verifier/index.test.js` (no store) |

## MUST scenario allocation

| Spec scenario | Allocation |
|---|---|
| AG same graph / cross-runtime `graph_id` | `replayAssuranceGraph` + FileSystemStore + reissue |
| AG observation/blob/ids/schema/provenance/verification/null | Existing `validateReplayRecords` |
| AG mutated role + recomputed `assessment_id` | New `normalizeRole` check |
| AG no channel / forged fields | Existing WeakMap; reissue ≠ prior identity |
| AG missing persisted record; unbound evidence; tokens | Rehydrate omit + existing maps |
| IV restart same `graph_id`; channel ≠ pre-restart | `runner-receipt-store` + restart test |
| IV missing record; diverging `receipt_id` | Rehydrate fail-closed before issue |
| IV verifyCandidate unchanged | No consumption-loop edits |
| AS distinct collection; kind mismatch; restart both families | `runner_receipts` + kind guard + FS load |

## Migration / Rollout

No head migration. Absent field loads as `{}`. Promote ADRs to `docs/adr/` at archive. K6b stays `revise`; K6c blocked until archive. Rollback: revert runtime + bag + tests + docs; keep OperationReceipt, `runner-receipt/v1` schema, WeakMap, K1/v2 pins.

## Open Questions

None. Field name `runner_receipts` resolves AS-018 / `sdd-propose-001`.
