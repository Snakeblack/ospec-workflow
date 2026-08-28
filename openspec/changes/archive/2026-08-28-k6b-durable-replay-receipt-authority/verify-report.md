## Verification Report

**Change**: k6b-durable-replay-receipt-authority
**Version**: 2.55.0
**Mode**: Focused (standard verify; Strict TDD inactive)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 24 |
| Tasks complete | 24 |
| Tasks incomplete | 0 |

All tasks in `tasks.md` are `[x]`. Apply progress records the same 24/24 batch. `scripts/lib/independent-verifier/index.js` was not edited (characterization constraint).

### Build & Tests Execution
**Build**: ➖ Not configured (`rules.verify.build_command` empty)

**Tests (targeted)**: ✅ 67 passed / ❌ 0 failed / ⚠️ 0 skipped
```text
node --test scripts/lib/independent-verifier/runner-receipt-store.test.js scripts/lib/independent-verifier/runner-receipt-restart.test.js scripts/lib/assurance-graph/index.test.js scripts/lib/authority-store/index.test.js
# tests 67, pass 67, fail 0, skipped 0, duration_ms 142.9179
```

Terminal blockers in that run:
- B1: `REQ-independent-verification-009 [Adversarial]: persist, empty WeakMap, reissue, same graph_id` PASS
- Missing receipt: `REQ-independent-verification-009 [Adversarial]: missing persisted receipt blocks reissue for that id and replay diverges` PASS
- B2: `REQ-assurance-graph-006 [Adversarial]: mutated assessment role with recomputed assessment_id fails closed` PASS
- Missing persisted record at replay: `REQ-assurance-graph-006 [Adversarial]: missing persisted runner-receipt fails closed` PASS

**Tests (full)**: ✅ 2817 passed / ❌ 0 failed / ⚠️ 2 skipped
```text
npm test
# (node scripts/check.js)
# tests 2819, pass 2817, fail 0, skipped 2, duration_ms 56405.2972
All checks passed.
```

AS-018 disk restart (`scripts/lib/filesystem-store.test.js` — restore both receipt families without `snapshot()`) and unchanged `independent-verifier/index.test.js` characterization ran inside `npm test` and did not fail.

**Manual verification**: not performed
```text
Not required; MUST scenarios are allocated to automated runtime tests.
```

**Coverage**: ➖ Not available / threshold: 0% (`testing.coverage.available: false`)

### Spec Compliance Matrix
| Requirement | Scenario | Evidence Level | Source | Result | Notes |
|-------------|----------|----------------|--------|--------|-------|
| REQ-assurance-graph-006 | Replay from persisted outputs yields the same graph | `runtime-test` | `assurance-graph/index.test.js` > replay from persistable outputs is byte-identical | PASS | Existing replay path; reissued channel accepted |
| REQ-assurance-graph-006 | Cross-runtime replay from persisted receipts yields the same graph_id | `runtime-test` | `runner-receipt-restart.test.js` > persist, empty WeakMap, reissue, same graph_id | PASS | **B1**. In-process FS reload + new channel identity (design-allowed; not child_process) |
| REQ-assurance-graph-006 | Replay without observation material fails closed | `runtime-test` | `assurance-graph/index.test.js` > replay without observation bytes or blob | PASS | Inherited |
| REQ-assurance-graph-006 | Content-addressed observation blob replays byte-identically | `runtime-test` | `assurance-graph/index.test.js` > resolvable content-addressed observation blobs | PASS | Inherited |
| REQ-assurance-graph-006 | Tampered assessment_id fails replay | `runtime-test` | `assurance-graph/index.test.js` > replay and reconcile reject assessment tampering | PASS | Inherited |
| REQ-assurance-graph-006 | Mutated assessment role with recomputed assessment_id fails closed | `runtime-test` | `assurance-graph/index.test.js` > mutated assessment role with recomputed assessment_id | PASS | **B2**. `withAssessmentFields` recomputes `assessment_id` via `computeAssessmentId` |
| REQ-assurance-graph-006 | Assessment fails schema, candidate, or policy revalidation | `runtime-test` | `assurance-graph/index.test.js` > replay rejects every persisted assessment binding mutation | PASS | malformed / candidate / policy cases |
| REQ-assurance-graph-006 | Assessment bound to missing evidence or non-implementing node | `runtime-test` | same binding-mutation table | PASS | missing evidence / unknown obligation / non-implementing node |
| REQ-assurance-graph-006 | Evidence v2 digest mismatch or invalid candidate binding | `runtime-test` | `assurance-graph/index.test.js` > replay rejects evidence and verification mutations | PASS | Inherited |
| REQ-assurance-graph-006 | Tampered evidence_id or failed computeEvidenceId | `runtime-test` | `assurance-graph/index.test.js` > replay rejects tampered evidence_id | PASS | Inherited |
| REQ-assurance-graph-006 | Insufficient provenance during evidence replay | `runtime-test` | `assurance-graph/index.test.js` > replay rejects insufficient provenance | PASS | Inherited |
| REQ-assurance-graph-006 | Verification v2 referencing non-existent evidence_id | `runtime-test` | `assurance-graph/index.test.js` > replay rejects evidence and verification mutations | PASS | Inherited |
| REQ-assurance-graph-006 | Replay without trusted runner receipt authority | `runtime-test` | `assurance-graph/index.test.js` > replay requires trusted runner receipt authority | PASS | missing channel + forged public fields |
| REQ-assurance-graph-006 | Missing persisted runner-receipt record | `runtime-test` | `assurance-graph/index.test.js` > missing persisted runner-receipt; `runner-receipt-restart.test.js` omit-from-store | PASS | Channel omit + CAS omit both → `GRAPH_DIVERGENCE` |
| REQ-assurance-graph-006 | Forged runnerReceiptChannel public fields | `runtime-test` | `assurance-graph/index.test.js` forged authority; `runner-receipt-store.test.js` DTO without reissued channel | PASS | `UNTRUSTED_RUNNER_RECEIPT` / `GRAPH_DIVERGENCE` |
| REQ-assurance-graph-006 | Replay Evidence not exactly bound to a trusted receipt | `runtime-test` | missing-receipt + node_id mismatch cases | PASS | Fail-closed bind in `validateReplayRecords` |
| REQ-assurance-graph-006 | Assessment coverage not attested by the bound receipt | `inspection-proof` | `assurance-graph/index.js` `validateReplayRecords` receipt `satisfied_tokens` check | WARNING | MUST; runtime case hits obligation-token mismatch, not receipt-token mismatch. See issues. |
| REQ-assurance-graph-006 | Null or non-object replay bundle | `runtime-test` | `assurance-graph/index.test.js` > null replay bundle | PASS | Inherited |
| REQ-independent-verification-009 | Restarted runtime reissues a channel and replay matches graph_id | `runtime-test` | `runner-receipt-restart.test.js` > persist, empty WeakMap, reissue, same graph_id | PASS | **B1**. `assert.notEqual(rehydrated.channel, channelA)` |
| REQ-independent-verification-009 | Missing persisted runner-receipt prevents reissue and fails replay | `runtime-test` | `runner-receipt-restart.test.js` > missing persisted receipt blocks reissue | PASS | Reissued set omits dropped id; replay `GRAPH_DIVERGENCE` |
| REQ-independent-verification-009 | Rehydrate fails closed when recomputed receipt_id diverges | `runtime-test` | `runner-receipt-store.test.js` > rehydrate fails closed when recomputed receipt_id diverges | PASS | No channel issued (`channel === undefined`) |
| REQ-independent-verification-009 | verifyCandidate strategy and MUST-walk remain unchanged | `runtime-test` | `independent-verifier/index.test.js` via `npm test`; working tree has no `index.js` diff | PASS | Persist is a side-effect helper |
| REQ-authority-store-018 | Runner-receipt records persist in a distinct CAS collection | `runtime-test` | `authority-store/index.test.js` > distinct bag / OperationReceipt-only `authority.receipts` | PASS | Field `runner_receipts` at record root |
| REQ-authority-store-018 | Kind mismatch with OperationReceipt fails closed | `runtime-test` | `authority-store/index.test.js` > kind mismatch both directions | PASS | `receipt-kind-mismatch`; head unchanged |
| REQ-authority-store-018 | Restart restores runner-receipt records without mixing families | `runtime-test` | `filesystem-store.test.js` > restart load restores both families without snapshot() | PASS | Covered by `npm test` |

**Compliance summary**: 24/25 scenarios satisfied at acceptable evidence levels (1 MUST WARNING: inherited receipt-token attestation branch)

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| AG-006 persistable records + reissued channel | ✅ Implemented | Persistable artifact is `runner-receipt/v1`; channel stays WeakMap-ephemeral |
| AG-006 independent `normalizeRole` bind | ✅ Implemented | After bound receipt resolution; mismatch → `GRAPH_DIVERGENCE` even if `assessment_id` validates |
| IV-009 persist / rehydrate / reissue | ✅ Implemented | `runner-receipt-store.js`; fail-closed on id divergence; new `issueRunnerReceiptChannel` |
| IV-009 verifyCandidate unchanged | ✅ Implemented | No consumption-loop edits |
| AS-018 additive CAS `runner_receipts` | ✅ Implemented | Sibling of `authority`; `runner_receipts_digest` only when map non-empty |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| CAS field `runner_receipts` at record root | ✅ Yes | Not nested under `authority`; `digestAuthority` stays `{permits, receipts}` |
| Additive revision digest; empty bag omitted | ✅ Yes | `computeRevision` 4th arg; empty ≡ 3-arg digest (runtime-tested) |
| Persist as trusted-channel helper, not inside `verifyCandidate` | ✅ Yes | `persistRunnerReceipts` / `rehydrateAndIssueRunnerReceiptChannel` |
| Records only; never persist WeakMap | ✅ Yes | Reissue creates new object identity |
| Replay role bind independent of `assessment_id` | ✅ Yes | B2 runtime-tested |
| Docs: K6b `revise`; K6c blocked until archive | ✅ Yes | `docs/roadmaps/harness-evolution.md` and architecture mirror |

No design deviation that breaks a spec.

### Issues Found
**CRITICAL**: None

**WARNING**:
- Inherited AG-006 scenario "Assessment coverage not attested by the bound receipt" has no dedicated runtime case that places an obligation-legal token outside `receipt.satisfied_tokens`. The live check exists in `validateReplayRecords`; the binding-mutation table exercises `ev:unexpected` (obligation-token mismatch, a different branch). Origin: `tasks-gap` (tasks marked this scenario "existing" / no code change). Does not reopen B1/B2.

**SUGGESTION**:
- B1 restart is simulated with a second `FileSystemStore` on the same file in-process (design-allowed alternative to `child_process`). A's pre-restart channel remains valid until process death, which the test documents. A child-process probe would be stronger process-isolation evidence, not a spec gap.

### Traceability Matrix
| REQ | Tasks | Commits | Tests | Status |
|-----|-------|---------|-------|--------|
| REQ-assurance-graph-006 | 4.1–4.4, 5.1 | uncommitted working tree | `assurance-graph/index.test.js`, `runner-receipt-restart.test.js` | OK (1 scenario WARNING above) |
| REQ-independent-verification-009 | 2.1, 3.1–3.5, 5.1–5.4 | uncommitted working tree | `runner-receipt-store.test.js`, `runner-receipt-restart.test.js`, `independent-verifier/index.test.js` | OK |
| REQ-authority-store-018 | 1.1–1.6, 2.1–2.3, 3.1 | uncommitted working tree | `authority-store/index.test.js`, `filesystem-store.test.js` | OK |

### Assumption Reconciliation
| id | statement | reversibility | outcome |
|----|-----------|----------------|---------|
| sdd-propose-001 | Persistir runner-receipt/v1 en una colección CAS distinta de authority.receipts; el nombre exacto del campo es design-owned. | high | unresolved (no escalation) |
| sdd-design-001 | Persist and rehydrate live in runner-receipt-store.js as a trusted-channel side effect, not inside the verifyCandidate consumption loop. | high | unresolved (no escalation) |
| sdd-design-002 | One reissued channel requires homogeneous issuer_id and transport across loaded runner-receipt/v1 records; mixed identities fail closed. | high | unresolved (no escalation) |

Launch had no `assumption_resolutions` block. All three entries are `reversibility: high`. Per Decision Gates they MUST NOT escalate. Implementation matches all three statements (`runner_receipts`, helper module, homogeneous issuer check in rehydrate). Left unresolved; not auto-confirmed.

### Residual product risk (K6b slice)
This change closes the two v2.54.0 replay blockers (durable receipt authority across restart; assessment.role bind vs RunnerReceipt.role). It does **not** finish K6b. Roadmap and architecture keep **K6b `revise`** and **K6c `blocked` until archive of this change plus terminal 4R**. Verify MUST NOT treat K6b as done.

### Verdict
PASS WITH WARNINGS
B1 and B2 plus missing-receipt `GRAPH_DIVERGENCE` are closed with runtime tests; 24/24 tasks complete; full `npm test` green. One inherited MUST scenario lacks a dedicated receipt-token runtime case. K6b stays `revise` until 4R + archive.
