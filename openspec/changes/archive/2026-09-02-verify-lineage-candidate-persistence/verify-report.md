## Verification Report

**Change**: verify-lineage-candidate-persistence
**Version**: 2.56.7
**Mode**: Focused TDD (standard verification evidence audit)

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 14 |
| Tasks complete | 14 |
| Tasks incomplete | 0 |

### Build & Tests Execution

**Build**: ✅ No build command configured; static repository checks passed

```text
git diff --check
exit 0

Baseline fingerprint:
openspec/specs/verify-lineage/spec.md
expected: b8f49c02ea2aa0e5f5cbfede131e59406b17d2fe3586ca0797cc35d48fcfcadb
actual:   b8f49c02ea2aa0e5f5cbfede131e59406b17d2fe3586ca0797cc35d48fcfcadb
```

**Tests**: ✅ Passed

```text
node --test scripts/lib/verify-lineage-candidate-store.test.js scripts/lib/verify-lineage.test.js
23 passed, 0 failed, 0 skipped; exit 0

node --test scripts/lib/k1-scope-guard.test.js
5 passed, 0 failed, 0 skipped; exit 0

Inline adversarial runtime check
PASS: invalid start publishes no reference; digest mismatch and CandidateId mismatch
block both mutable transitions while preserving byte-equivalent lineage snapshots.

npm test
exit 0; "All checks passed."
```

**Manual verification**: performed

```text
- Inspected same-directory temp creation, file fsync, atomic hard-link no-clobber
  publication, identical-target acceptance, and best-effort directory fsync.
- The focal publication tests executed successfully on Node.js 22 on Windows.
- The portable code path uses Node fs/path primitives and explicitly tolerates the
  documented Windows directory-descriptor errors without weakening file durability.
- K6d and CX0 state files were hashed before report persistence and remained outside
  every verification write target.
```

**Coverage**: ➖ Not available (project configuration declares `testing.coverage.available: false`)

### Spec Compliance Matrix

| Requirement | Scenario | Evidence Level | Source | Result | Notes |
|-------------|----------|----------------|--------|--------|-------|
| REQ-verify-lineage-010 | lineage start persists an exact preimage | `runtime-test` | `verify-lineage.test.js` > reference-bearing start; `verify-lineage-candidate-store.test.js` > canonical bytes | PASS | Stored bytes, digest-derived path, and both lineage Candidate IDs match. |
| REQ-verify-lineage-010 | repeated persistence is byte-stable | `runtime-test` | `verify-lineage-candidate-store.test.js` > repeated publish | PASS | Second publish is idempotent; divergent existing bytes fail closed without clobber. |
| REQ-verify-lineage-011 | remediation resumes in a new process | `runtime-test` | `verify-lineage.test.js` > separate Node process reloads and prepares | PASS | Process B receives only serialized lineage plus `changeRoot`. |
| REQ-verify-lineage-011 | remediation successor survives another restart | `runtime-test` | `verify-lineage.test.js` > successor recovery in second Node process | PASS | Successor resolves to its canonical CandidateId and routes to targeted recheck. |
| REQ-verify-lineage-011 | tampered, missing, or divergent material blocks before mutation | `runtime-test` | focal tests plus inline adversarial runtime check | PASS | Missing, digest-mismatched, and CandidateId-divergent records block both mutable transitions with unchanged lineage snapshots. |
| REQ-verify-lineage-012 | legacy inspection preserves state | `runtime-test` | `verify-lineage.test.js` > ID-only legacy lineages | PASS | Schema-v1 ID-only state remains readable and unchanged. |
| REQ-verify-lineage-012 | legacy remediation is rejected safely | `runtime-test` | `verify-lineage.test.js` > ID-only legacy lineages | PASS | Both transitions return `legacy-candidate-recovery-unavailable`; no attempt, finding, scope, or status changes. |
| REQ-VL-K3-001 | lineage opens against canonical Candidate | `runtime-test` | start and canonical-store focal tests | PASS | `candidate_id` remains the lineage identity; the content digest addresses bytes only. |
| REQ-VL-K3-001 | incomplete candidate fails closed | `runtime-test` | candidate-store incomplete fixture plus inline invalid-start check | PASS | Canonical validation fails before any lineage or recovery reference becomes observable. |
| REQ-VL-K3-001 | recovered bytes disagree with canonical identity | `runtime-test` | divergent Candidate store test plus inline mutable-transition check | PASS | Recomputed CandidateId mismatch returns `candidate-recovery-id-mismatch` and preserves history. |

**Compliance summary**: 10/10 MUST scenarios satisfied at `runtime-test` evidence level.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| Recoverable Candidate records | ✅ Implemented | Canonical UTF-8 bytes are addressed by SHA-256 and re-read before a reference is returned. |
| Mutable-transition rehydration | ✅ Implemented | `prepareRemediation` and `recordRemediationAttempt` recover from `candidate_recovery.current`; inline Candidates cannot bypass recovery. |
| Legacy ID-only compatibility | ✅ Implemented | Inspection remains additive; mutation fails closed with a stable reason. |
| Canonical Candidate authority | ✅ Implemented | K3 `computeCandidateId` is independently recomputed after content-digest validation. |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Change-local immutable Candidate CAS | ✅ Yes | `.verify-lineage/candidates/sha256/<hex>.json`; fixed reference grammar and symlink checks confine resolution. |
| Additive lineage recovery references | ✅ Yes | `schema_version: 1` is preserved; new `candidate_recovery` is additive and IDs remain authoritative. |
| Publish bytes before lineage state | ✅ Yes | Temp file + fsync + atomic no-clobber hard link + read-back precede the returned reference. |
| Structured fail-closed recovery | ✅ Yes | Missing, malformed, conflicting, and legacy-unavailable paths return stable reason codes and cloned original lineage state. |
| Preserve authority/history | ✅ Yes | No K4 authority primitive is introduced; failures do not advance attempts, status, findings, scopes, or Candidate identity. |

### Issues Found

**CRITICAL**: None.

**WARNING**:

- `VLCP-W001` `[tasks-gap]` — The behavior of inherited requirement `REQ-VL-K3-001` is covered by passing runtime tests, but neither focal test file cites that exact stable REQ ID. Mechanical REQ→test traceability is therefore incomplete even though behavioral compliance is proven.

**SUGGESTION**: None.

### Traceability Matrix

| REQ | Tasks | Commits | Tests | Status |
|-----|-------|---------|-------|--------|
| REQ-verify-lineage-010 | 1.1–1.3, 1.5, 2.1–2.2, 3.2–3.3 | working tree; trailers advisory | store tests and lineage tests cite exact ID | OK |
| REQ-verify-lineage-011 | 1.4–1.5, 2.3–2.4, 3.1–3.3 | working tree; trailers advisory | store tests and lineage tests cite exact ID | OK |
| REQ-verify-lineage-012 | 2.5–2.6, 3.3 | working tree; trailers advisory | lineage legacy test cites exact ID | OK |
| REQ-VL-K3-001 | 1.1–1.2, 1.4, 2.1, 2.6, 3.3 | working tree; trailers advisory | behavior covered, exact ID absent from test names/files | WARNING |

The project has no active `traceability.trailers: required` policy, so the uncommitted working-tree state does not independently fail verification. The exact missing test-side REQ tag remains an advisory traceability finding.

### Verdict

PASS WITH WARNINGS

All 10 MUST scenarios pass with real runtime evidence, including cross-process recovery and fail-closed adversarial cases. Archive remains eligible from a behavioral perspective; the sole warning is the missing exact `REQ-VL-K3-001` test-side traceability tag.
