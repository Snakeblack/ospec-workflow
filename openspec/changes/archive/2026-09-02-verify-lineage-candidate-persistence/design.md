# Design: Recoverable Candidate Persistence for Verify Lineage

## Technical Approach

Use `design-after-spec`. Add a synchronous Candidate recovery store beside each OpenSpec change and publish references only after their canonical bytes are durable and re-readable. The lineage remains the sole authority: only a lineage-carried reference can select a blob.

Before mutation, recovery validates the relative path, exact-byte SHA-256, canonical JSON form, and K3 `Candidate/v2.candidate_id`. This extends the synchronous API without K4a/K4b authority primitives.

## Architecture Decisions

### Decision: Change-local immutable Candidate CAS

| Option | Trade-off | Decision |
|---|---|---|
| `.verify-lineage/candidates/sha256/<hex>.json` under `changeRoot` | Travels with OpenSpec archive; may leave harmless orphan blobs after a crash | **Chosen** |
| Inline full Candidate in `state.yaml` | Simple read path, but duplicates large evidence and makes byte addressing ambiguous | Rejected |
| Global or authority-store CAS | Reusable, but creates a second lifecycle/authority dependency outside scope | Rejected |

Canonical bytes are UTF-8 `stableSerialize(candidate)` without a trailing newline; `content_digest` is SHA-256 over those bytes. The target path is digest-derived. Existing directory components and the target are rejected when symbolic links.

### Decision: Additive lineage recovery references

`verify_lineage.schema_version` remains `1`. New lineages add `candidate_recovery.schema_version: 1` with `genesis` and `current` references; readers accept reference-bearing and ID-only states. Existing Candidate ID fields remain authoritative.

No `candidate_id` lookup, blob scan, or inferred path is permitted.

### Decision: Publish bytes before publishing lineage state

The store flushes a unique same-directory temp file, then atomically creates the final digest path without replacement. An existing target is accepted only when identical and valid. The directory is flushed where supported.

`startVerifyLineage` persists and re-reads genesis before returning. `recordRemediationAttempt` recovers baseline, validates scope, persists and re-reads the successor, then returns updated state. The caller atomically writes `state.yaml`. A crash before it leaves only an inert blob; retry is idempotent.

### Decision: Structured fail-closed recovery and legacy compatibility

Store failures use stable reason codes: `candidate-recovery-missing`, `candidate-recovery-digest-mismatch`, `candidate-recovery-noncanonical`, `candidate-recovery-id-mismatch`, `candidate-recovery-path-invalid`, `candidate-recovery-conflict`, and `legacy-candidate-recovery-unavailable`. Mutable public operations return `{ valid: false, action: "block-candidate-recovery", reason_code, lineage: clone(state) }`; lineage creation throws before returning state and carries the same `code`.

ID-only lineages remain valid for inspection, but mutable transitions never accept inline Candidate substitution. Mutation requires an independently attached valid reference; no discovery, backfill, or history rewrite occurs.

## Data Flow

```text
Full verify                         OpenSpec change
Candidate/v2 ──validate/canonicalize──→ temp + fsync
                                          │ atomic no-clobber publish
                                          ▼
                               .verify-lineage/candidates/sha256/<hex>.json
                                          │ read + digest + CandidateId
                                          ▼
startVerifyLineage ──returns ref-bearing lineage──→ atomic state.yaml write

Reloaded state.yaml ──current ref──→ recover + double validation
                                          │
prepareRemediation ────────────────────────┘
recordRemediationAttempt ─→ persist successor first ─→ return next lineage
```

All recovery errors exit before mutation. Blob deletion or tampering after state publication is observable as a structured block, never as Candidate drift or a consumed attempt.

## File Changes

| File | Action | Description |
|---|---|---|
| `scripts/lib/verify-lineage-candidate-store.js` | Create | Canonicalize, atomically persist, resolve, and double-validate change-local Candidate records. |
| `scripts/lib/verify-lineage-candidate-store.test.js` | Create | Unit tests for byte stability, no-clobber publication, confinement, tampering, missing data, and idempotency. |
| `scripts/lib/verify-lineage.js` | Modify | Add recovery references at start; recover baseline internally; persist successor before returning mutated state. |
| `scripts/lib/verify-lineage.test.js` | Modify | Contract, legacy, immutability, and real cross-process restart coverage. |
| `scripts/lib/k1-scope-guard.test.js` | Modify | Register both new verify-lineage successor files without expanding K1 authority. |
| `skills/sdd-apply/SKILL.md` | Modify | Replace in-memory baseline requirement with recovery from the lineage reference and `changeRoot`. |
| `skills/sdd-verify/SKILL.md` | Modify | State that lineage creation must complete Candidate persistence before writing `state.yaml`. |

No K6d or CX0 artifact or implementation file is modified by this change.

## Interfaces / Contracts

```js
// Persisted under verify_lineage.candidate_recovery.{genesis,current}
{
  kind: "candidate-recovery-ref/v1",
  schema_version: 1,
  candidate_id: "sha256:<canonical CandidateId>",
  content_digest: "sha256:<digest of exact canonical bytes>",
  relative_path: ".verify-lineage/candidates/sha256/<content hex>.json"
}

persistCandidateRecord(changeRoot, candidate)
// -> { ok: true, reference, candidate, idempotent }
// -> { ok: false, reason_code, error }

recoverCandidateRecord(changeRoot, reference, expectedCandidateId)
// -> { ok: true, candidate, reference }
// -> { ok: false, reason_code, error }

prepareRemediation(lineage, { changeRoot })
recordRemediationAttempt(lineage, { changeRoot, candidate, rootDir, git_trees })
```

Legacy baseline arguments may be compared diagnostically but never bypass recovery. Git delta uses the recovered baseline and supplied frozen successor.

## MUST Scenario Allocation

| Spec scenario | Component / flow | Verification |
|---|---|---|
| Lineage start persists exact preimage | store + `startVerifyLineage` | Resolve reference; exact canonical bytes and both IDs match. |
| Repeated persistence is byte-stable | store | Persist twice; one target, same bytes/ref, `idempotent: true`. |
| Remediation resumes in new process | store + `prepareRemediation` | Process A writes state/blob; process B reloads without Candidate and prepares. |
| Successor survives another restart | `recordRemediationAttempt` + store | Process B records successor; process C reloads, resolves it, and obtains recheck action. |
| Tampered/missing/divergent material blocks | resolver + both transitions | Table-driven corruption cases; deep-equal lineage before/after. |
| Legacy inspection preserves state | `assertVerifyLineage` / router | ID-only fixture remains readable and byte-equivalent. |
| Legacy remediation rejects safely | both transitions | Stable legacy reason; zero attempts and unchanged findings/scopes/status. |
| Lineage opens against canonical Candidate | start path | Existing K3 validation plus persisted reference assertions. |
| Incomplete Candidate fails closed | start/resolver | Schema-invalid or unresolved Candidate produces no lineage/state reference. |
| Recovered bytes disagree with identity | resolver | Recomputed CandidateId mismatch blocks with immutable lineage history. |

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Canonical bytes, digest/path derivation, safe path confinement, atomic no-clobber, idempotency, corrupt/missing records | `node:test` with isolated temp change roots and injected fs failure seams where needed. |
| Integration | All 10 MUST scenarios and preservation of current FSM behavior | Extend `verify-lineage.test.js`; assert complete state snapshots before and after every failed transition. |
| Cross-process | Start/reload/prepare and attempt/reload/recheck | Spawn separate Node processes; persist a minimal JSON-form YAML `state.yaml` plus actual blob files so no module cache or in-memory Candidate crosses the boundary. |
| Regression | K1 scope and full harness | Run focal store/lineage tests, K1 scope guard, then `npm test`. |

Crash tests cover temp write, final publish, post-publish/pre-state, and state-write boundaries. A new dangling reference is never valid.

## Migration / Rollout

This is additive with no bulk migration. New lineages carry references; ID-only states load unchanged and fail closed on mutation. K6d/CX0 supersession and recreation remain a later orchestrator action.

Rollback reverts runtime and skill consumers together. Existing blobs and additive reference fields remain inert audit material; they are never deleted or rewritten during rollback.

## Open Questions

None.
