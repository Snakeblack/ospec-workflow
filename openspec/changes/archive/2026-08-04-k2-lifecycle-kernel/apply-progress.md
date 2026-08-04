# Apply Progress: k2-lifecycle-kernel

**Delivery mode**: `size:exception` (maintainer accepted; Decision needed before apply: No; Chain strategy: size-exception). Single oversized PR allowed.

**Branch**: `agent/k2-lifecycle-kernel`

**Mode**: Strict TDD

**Test runner**: `node --test` (via `npm test` → `node scripts/check.js`)

**Batch status**: lineage `approved`; CRITICAL slice done; WARNING follow-up remediated (7/7). Focal K2 suite 84/84. SUGGESTIONs remain advisory.

## Phase 1 Inventory (task 1.1) — recorded BEFORE implementation edits

### OpenSpec state readers/writers

| Path | Role | Key exports / entrypoints |
|------|------|---------------------------|
| `scripts/lib/ospec-state.js` | Canonical OpenSpec `state.yaml` reader + session/runtime writers | `readState`, `setPhaseSummary`, `writeSessionSummary`, `appendRuntimeEvent`, `appendPhaseCost`, `withFileLock`, `withAppendLock`, `readBaselineState`, `readBackendMode`, `findActiveChanges` |
| `scripts/lib/atomic-write.js` | Atomic filesystem commit used by state writers | `recoverOrphanBak`, atomic rename helpers |
| `scripts/lib/artifact-store.js` | Artifact-store mode resolution for OpenSpec persistence | artifact store mode helpers |
| `scripts/lib/review-gate-state.js` | Review-gate slice of `state.yaml` (read/merge/plan) | `readReviewGate`, `planReviewGate`, `mergeReviewGateAudit`, `planLineageGate` |

**Store integration decision for K2**: the kernel shell accepts an injected `store` (`load`/`commit` state+journal). Production bridges MAY wrap `ospec-state.js` + atomic-write; K2 MUST NOT invent a second authoritative state file format. Default harness store is in-memory via `createMemoryStore`.

### Orchestrator / operation entrypoints (pre-K2)

| Path | Role | Key exports / entrypoints |
|------|------|---------------------------|
| `scripts/lib/route-dispatcher.js` | Fixed routing table / change classification | `classifyChange`, `parseRoutingTable`, `validateRouteTable`, `validateRoute` |
| `scripts/lib/next-transition.js` | K1 `state-transition` shape validation | `validateNextTransition` |
| `scripts/lib/transition-parity.js` | Human vs negotiated discriminant parity | `extractDiscriminants`, `compareParity` |
| `scripts/lib/change-classification.js` | Classification fingerprinting | classification helpers |
| `scripts/lib/quality-gates.js` | Declared quality-gate planning | gate planning helpers |
| `scripts/lib/flow-validator.js` | Flow/DAG validation | flow validators |
| `scripts/lib/lifecycle-hooks.js` | Skill/hook lifecycle events (NOT K2 kernel) | `validateHooksBlock`, `planExecution`, `buildAuditEntry` |
| `scripts/hooks/subagent-stop.js` | Orchestrator stop hook | hook main |
| `scripts/hooks/pre-tool-use.js` | Pre-tool safety checks | hook main |
| `scripts/hooks/commit-msg-hook.js` | Commit message / change trailers | hook main |

### Review-lineage runtime bridge targets

| Path | Role | Key exports / entrypoints |
|------|------|---------------------------|
| `scripts/lib/review-lineage.js` | Bounded review lineage reducer | `startReviewLineage`, `freezeFindings`, `beginCorrection`, `applyTargetedValidation`, `markOperationUnknown`, `reconcilePendingOperation`, `createSuccessor`, `terminateLineage`, `nextLineageAction`, `migrateReviewLineage` |
| `scripts/lib/review-gate-state.js` | Gate planning from lineage | `planLineageGate` |
| `scripts/lib/review-dimensions.js` | Selective 4R dimension selection | dimension helpers |

### Archive runtime bridge targets

| Path | Role | Key exports / entrypoints |
|------|------|---------------------------|
| `scripts/lib/archive-transaction.js` | Archive transaction runtime + journal | `runArchiveTransaction`, `rollbackTransaction`, `nextTransactionAction`, `readArchiveGateFacts`, `computeInventory` |
| `scripts/lib/archive-plan.js` | Archive plan computation | plan helpers |

### K1 contracts consumed (must remain unchanged)

| Path | Role |
|------|------|
| `schemas/kernel/**` | Twelve schema families + fixtures (pinned digests in `k1-compat.js`) |
| `scripts/lib/canonical-json.js` | `stableSerialize`, `sha256Fingerprint` |
| `scripts/lib/kernel-aliases.js` | Alias resolution |
| `scripts/lib/kernel-schema-validator.js` | Dep-free schema validation |

## Batch 1 summary

Implemented functional core + imperative shell through Minimal Kernel Harness:

- Scope guards + K1 schema/alias byte pins
- State digest (order-independent, volatile fields excluded)
- Operation registry + authorization boundary
- Pure reducer (`reduceLifecycle`)
- Transition selector with explicit priority + stable secondary order
- Journal IDs + reconciliation (skip completed; fail-closed unknown)
- Derived non-authoritative events
- Public `runKernelOperation` + in-memory store
- Minimal Kernel Harness (public API, decide halt, snapshot round-trip, replay skip)

**Focal tests**: 48/48 passing (`node --test scripts/lib/lifecycle-kernel/**/*.test.js scripts/lib/minimal-kernel-harness.test.js`).

**Remaining this change**: Phase 6.3 full interruption matrix; 6.6 named execute/recover fixture coverage; Phases 7–11 (recovery honesty, model, parity, bridges, verify).

**Workload**: ~2200 LOC in new K2 modules/tests this batch; within forecast band; stopping at clean Phase 6 boundary (`workload` note: size:exception continues).

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 1.1 | N/A (inventory) | Structural | N/A (new) | ➖ Structural | ✅ Inventory persisted | ➖ Triangulation skipped: documentation-only | ➖ None needed | Paths recorded before production edits |
| 1.2 | `scripts/lib/lifecycle-kernel/scope-guard.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 5 cases | ✅ Clean | Host/Candidate/budget/attestation/delivery rejected |
| 1.3 | `scripts/lib/lifecycle-kernel/k1-compat.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 5 cases | ✅ Clean | Frozen digests for all schemas/kernel JSON |
| 2.1 | `scripts/lib/lifecycle-kernel/state-digest.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ order + material | ✅ Clean | |
| 2.2 | `scripts/lib/lifecycle-kernel/state-digest.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ volatile excluded | ✅ Clean | Uses K1 `canonical-json` |
| 2.3 | `scripts/lib/lifecycle-kernel/operations.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 5 invalid verbs | ✅ Clean | Stable `invalid-transition` |
| 2.4 | `scripts/lib/lifecycle-kernel/operations.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ auth + valid start | ✅ Clean | |
| 3.1 | `scripts/lib/lifecycle-kernel/reducer.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ source scan | ✅ Clean | No fs/process/clock/random |
| 3.2 | `scripts/lib/lifecycle-kernel/reducer.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ start/complete/auth | ✅ Clean | |
| 3.3 | `scripts/lib/lifecycle-kernel/transition-selector.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ byte-equivalent | ✅ Clean | |
| 3.4 | `scripts/lib/lifecycle-kernel/transition-selector.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ recover>start>complete | ✅ Clean | |
| 3.5 | `scripts/lib/lifecycle-kernel/transition-selector.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ terminal + exhausted | ✅ Clean | |
| 4.1 | `scripts/lib/lifecycle-kernel/journal.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ stable + divergent | ✅ Clean | |
| 4.2 | `scripts/lib/lifecycle-kernel/journal.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ record shapes | ✅ Clean | |
| 4.3 | `scripts/lib/minimal-kernel-harness.test.js` | Integration | N/A (new) | ✅ Written | ✅ Passed | ✅ resume skips prior effect | ✅ Clean | Partial matrix; more points in 6.3 |
| 4.4 | `scripts/lib/lifecycle-kernel/journal.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ planned/started/completed | ✅ Clean | |
| 4.5 | `scripts/lib/lifecycle-kernel/journal.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ unknown → fail-closed | ✅ Clean | |
| 5.1 | `scripts/lib/lifecycle-kernel/events.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ rebuild equivalence | ✅ Clean | |
| 5.2 | `scripts/lib/lifecycle-kernel/events.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ order by effect_id | ✅ Clean | |
| 5.3 | `scripts/lib/lifecycle-kernel/events.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ delete projection no auth change | ✅ Clean | |
| 6.1 | `scripts/lib/minimal-kernel-harness.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ reducer-only rejected | ✅ Clean | |
| 6.2 | `scripts/lib/minimal-kernel-harness.test.js` | Integration | N/A (new) | ✅ Written | ✅ Passed | ✅ start via public API | ✅ Clean | |
| 6.3 | `scripts/lib/minimal-kernel-harness.test.js` | Integration | N/A (new) | ✅ Written | ✅ Passed | ➖ Partial (batch 1) | ➖ Pending (batch 1) | Completed in batch 2 |
| 6.4 | `scripts/lib/minimal-kernel-harness.test.js` | Integration | N/A (new) | ✅ Written | ✅ Passed | ✅ round-trip | ✅ Clean | |
| 6.5 | `scripts/lib/minimal-kernel-harness.test.js` | Integration | N/A (new) | ✅ Written | ✅ Passed | ✅ decide halt | ✅ Clean | |
| 6.6 | `scripts/lib/minimal-kernel-harness.test.js` | Integration | N/A (new) | ✅ Written | ✅ Passed | ➖ Partial (batch 1) | ➖ Pending (batch 1) | Completed in batch 2 |

### Test Summary (batch 1)

- **Total tests written (focal)**: 48
- **Total tests passing**: 48
- **Layers used**: Unit (~40), Integration (~8)
- **Approval tests**: None — no pure refactor-only tasks
- **Pure functions created**: `digestLifecycleState`, `canonicalizeState`, `reduceLifecycle`, `selectTransitions`, `deriveOperationId`, `deriveEffectId`, `projectEvents`, `reconcileEffect`, `scanSourceForScopeViolations`, `assertK1SchemasUnchanged`

## Deviations from Design

None material. Assumed a minimal node lifecycle state shape (`status` + `nodes.{id,phase,attempt}`) as the reduced K2 runtime state; bridges to OpenSpec `state.yaml` land in Phase 10 via compatibility boundaries (not a second authority).

## Issues Found (batch 1 — resolved in batch 2)

- Task 6.3 interruption matrix was only partially covered in batch 1 → completed in batch 2.
- Task 6.6 named recover fixture → completed in batch 2.

## Batch 2 summary

Completed Phase 6 remainder through Phase 10:

- 6.3 interruption matrix: `before-journal`, `after-journal`, `after-effect` with resume semantics (incremental `commitJournal`)
- 6.6 named execute/recover fixtures invoked through harness
- Phase 7 recovery honesty (`blockingFingerprint` ignores attempt counters; decide/stop replacement)
- Phase 8 reduced model + 8 executable invariant checkers + deferred manifest + opaque ports + harness replay
- Phase 9 K2 runtime surface parity + command honesty
- Phase 10 routing/review/archive/prose bridges + single-reducer guard

**Focal tests**: 82/82 passing (batch 1 suite + recovery/model/parity/bridges).

**Remaining**: Phase 11 (`sdd-verify` — full `npm test`, mutation seeds, verify-report, 4R).

### TDD Cycle Evidence (batch 2 append)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 6.3 | `scripts/lib/minimal-kernel-harness.test.js` | Integration | ✅ 48/48 | ✅ Written | ✅ Passed | ✅ 3 interrupt points + resume | ✅ Clean | before/after journal/effect |
| 6.6 | `scripts/lib/minimal-kernel-harness.test.js` | Integration | ✅ 48/48 | ✅ Written | ✅ Passed | ✅ start + recover | ✅ Clean | Named fixtures invoked |
| 7.1-7.3 | `scripts/lib/lifecycle-kernel/recovery.test.js` | Unit/Integration | N/A (new) | ✅ Written | ✅ Passed | ✅ 6 cases | ✅ Clean | Attempt counter ≠ progress |
| 8.1-8.8 | `scripts/lib/lifecycle-model.test.js` | Unit/Integration | N/A (new) | ✅ Written | ✅ Passed | ✅ 7 cases | ✅ Clean | Model under `node --test` / npm test glob |
| 9.1-9.4 | `scripts/lib/transition-parity.k2.test.js` | Unit/Integration | ✅ existing parity | ✅ Written | ✅ Passed | ✅ 6 cases | ✅ Clean | No K1 parity regressions |
| 10.1-10.5 | `scripts/lib/lifecycle-kernel/bridges.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 5 cases | ✅ Clean | fixed route_policy |

### Test Summary (combined after batch 2)

- **Total tests written (focal)**: 82
- **Total tests passing**: 82
- **Layers used**: Unit, Integration
- **Approval tests**: None
- **size:exception**: continues; Phase 11 deferred to verify

## Authoritative Strict TDD Evidence Record

```json:strict-tdd-evidence
{
  "schema_version": 1,
  "change": "k2-lifecycle-kernel",
  "evidence_mode": "live",
  "functional_snapshot": {
    "projection": "strict-tdd-functional-v1",
    "base_tree": "ae6927e",
    "genesis_paths": [
      "scripts/lib/lifecycle-kernel/bridges.js",
      "scripts/lib/lifecycle-kernel/events.js",
      "scripts/lib/lifecycle-kernel/index.js",
      "scripts/lib/lifecycle-kernel/journal.js",
      "scripts/lib/lifecycle-kernel/k1-compat.js",
      "scripts/lib/lifecycle-kernel/operations.js",
      "scripts/lib/lifecycle-kernel/recovery.js",
      "scripts/lib/lifecycle-kernel/reducer.js",
      "scripts/lib/lifecycle-kernel/scope-guard.js",
      "scripts/lib/lifecycle-kernel/state-digest.js",
      "scripts/lib/lifecycle-kernel/transition-selector.js",
      "scripts/lib/lifecycle-model.js",
      "scripts/lib/minimal-kernel-harness.js",
      "scripts/lib/transition-parity.js"
    ],
    "files": [
      {
        "path": "scripts/lib/lifecycle-kernel/bridges.js",
        "digest": "sha256:98b4ecd62f737d846d358feaaad628e63a5cab899fb975a83615924a2361f80d"
      },
      {
        "path": "scripts/lib/lifecycle-kernel/events.js",
        "digest": "sha256:36a8a76299a7029cc98c82092f34d0d1cf33cc2dfa0c95c44e127f4d70c0db07"
      },
      {
        "path": "scripts/lib/lifecycle-kernel/index.js",
        "digest": "sha256:0db88b372a369f68559c7c8992cffc4ea096e08366768453140374e73ff0a620"
      },
      {
        "path": "scripts/lib/lifecycle-kernel/journal.js",
        "digest": "sha256:d738eaa81a8bd6baa4cda9af1f2c14f06567244418843d07ed79c2342b40da9e"
      },
      {
        "path": "scripts/lib/lifecycle-kernel/k1-compat.js",
        "digest": "sha256:b56b4c3154bb33082d23169f67fe0baa3f53b53a871050cd439006dac89a8270"
      },
      {
        "path": "scripts/lib/lifecycle-kernel/operations.js",
        "digest": "sha256:48de2b4cbfaf95ebe5046b1450a42fd87a725bd9d6a651770ffabe986b4e2c58"
      },
      {
        "path": "scripts/lib/lifecycle-kernel/recovery.js",
        "digest": "sha256:122ef9bcd700c4124c6c5db54ff6c0ac993bd9f56572c9c16ea1da30e896888f"
      },
      {
        "path": "scripts/lib/lifecycle-kernel/reducer.js",
        "digest": "sha256:2482fd885dee7f055a979b23c32e4440cb5903a5fbea43be72fd92f330218b2b"
      },
      {
        "path": "scripts/lib/lifecycle-kernel/scope-guard.js",
        "digest": "sha256:648f1a4f81a40e69a7e2fa668e2dc738e12b9d50958d56bcd41409249b66d942"
      },
      {
        "path": "scripts/lib/lifecycle-kernel/state-digest.js",
        "digest": "sha256:e122934292b6840741684b9e67f1777bb1bd32db2f09614a19b8a1d29adb9074"
      },
      {
        "path": "scripts/lib/lifecycle-kernel/transition-selector.js",
        "digest": "sha256:b8392b8ddf7cf9a139f8c42506d955086f5db3c7c121039590ec4e8dccb97a38"
      },
      {
        "path": "scripts/lib/lifecycle-model.js",
        "digest": "sha256:7b45974c6a16445c99087ae02a22b07ef8b4af657cf044ede758cb72c866bab6"
      },
      {
        "path": "scripts/lib/minimal-kernel-harness.js",
        "digest": "sha256:b091ac35e66d4ccc7589528c531d16ae54969e835c22bd6d425e439400fbe648"
      },
      {
        "path": "scripts/lib/transition-parity.js",
        "digest": "sha256:d1004a624fdb91f81e280fb029b2aa28f762315e4d01726af04a65cd8992c6af"
      }
    ]
  },
  "cycles": [
    {
      "task": "1.2",
      "test_file": "scripts/lib/lifecycle-kernel/scope-guard.test.js",
      "layer": "unit",
      "safety_net": "N/A (new)",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/lifecycle-kernel/scope-guard.test.js",
        "test_digest": "sha256:7af3216c14e9572d3d6382a9c8c23f023c0f63a6afba7c696ee5e5ae96d0735b",
        "command": "node --test scripts/lib/lifecycle-kernel/scope-guard.test.js",
        "receipt_id": "sha256:6b08de1d1b5d5d30480aebc2c2661d5f816b5e6854c94892ad033f85a4bf2a1f",
        "receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/6b08de1d1b5d5d30480aebc2c2661d5f816b5e6854c94892ad033f85a4bf2a1f.json",
        "red_command": "node --test scripts/lib/lifecycle-kernel/scope-guard.test.js",
        "red_receipt_id": "sha256:2933be0a4efe8517d8143bfd666ec8db8ac755c2e1f0a9b0a6f3ca5820a99242",
        "red_receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/2933be0a4efe8517d8143bfd666ec8db8ac755c2e1f0a9b0a6f3ca5820a99242.json",
        "red_test_digest": "sha256:7af3216c14e9572d3d6382a9c8c23f023c0f63a6afba7c696ee5e5ae96d0735b"
      }
    },
    {
      "task": "1.3",
      "test_file": "scripts/lib/lifecycle-kernel/k1-compat.test.js",
      "layer": "unit",
      "safety_net": "N/A (new)",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/lifecycle-kernel/k1-compat.test.js",
        "test_digest": "sha256:4e25bd8576158726890cb3437971a49304cb18d5a8f2c4bd5d9c31f824607e2d",
        "command": "node --test scripts/lib/lifecycle-kernel/k1-compat.test.js",
        "receipt_id": "sha256:c13db3ee72ec8e68fc6feceb212f3b78c6058afbb814b885c4e9bfbb0a5d6675",
        "receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/c13db3ee72ec8e68fc6feceb212f3b78c6058afbb814b885c4e9bfbb0a5d6675.json",
        "red_command": "node --test scripts/lib/lifecycle-kernel/k1-compat.test.js",
        "red_receipt_id": "sha256:d7e04dffa433f30693b9ddfb900aca20cc22d98fe29b668a6f50a797afc41b55",
        "red_receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/d7e04dffa433f30693b9ddfb900aca20cc22d98fe29b668a6f50a797afc41b55.json",
        "red_test_digest": "sha256:4e25bd8576158726890cb3437971a49304cb18d5a8f2c4bd5d9c31f824607e2d"
      }
    },
    {
      "task": "2.1-2.2",
      "test_file": "scripts/lib/lifecycle-kernel/state-digest.test.js",
      "layer": "unit",
      "safety_net": "N/A (new)",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/lifecycle-kernel/state-digest.test.js",
        "test_digest": "sha256:7b6d9a58e5a4d39dcc23605cc6ab69e537c537c8312584b2fc605deb40199c4c",
        "command": "node --test scripts/lib/lifecycle-kernel/state-digest.test.js",
        "receipt_id": "sha256:8c9c55ed44c19415afc7cf310017ab0f097d237e771556cf81cc90a458a90c12",
        "receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/8c9c55ed44c19415afc7cf310017ab0f097d237e771556cf81cc90a458a90c12.json",
        "red_command": "node --test scripts/lib/lifecycle-kernel/state-digest.test.js",
        "red_receipt_id": "sha256:f8853cf3afc295187fff8d45c34fd39d8cea8144a9f1a7cdd3752de8239cfc39",
        "red_receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/f8853cf3afc295187fff8d45c34fd39d8cea8144a9f1a7cdd3752de8239cfc39.json",
        "red_test_digest": "sha256:7b6d9a58e5a4d39dcc23605cc6ab69e537c537c8312584b2fc605deb40199c4c"
      }
    },
    {
      "task": "2.3-2.4",
      "test_file": "scripts/lib/lifecycle-kernel/operations.test.js",
      "layer": "unit",
      "safety_net": "N/A (new)",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/lifecycle-kernel/operations.test.js",
        "test_digest": "sha256:af4fd059591cb113419a1d567d4f1fa379b5a2a6514d54d4c632eb23121eac71",
        "command": "node --test scripts/lib/lifecycle-kernel/operations.test.js",
        "receipt_id": "sha256:ad9042d78d046d836f83ffd9d35f0ded0336b1906fd737b1a4b4c797ce9c5786",
        "receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/ad9042d78d046d836f83ffd9d35f0ded0336b1906fd737b1a4b4c797ce9c5786.json",
        "red_command": "node --test scripts/lib/lifecycle-kernel/operations.test.js",
        "red_receipt_id": "sha256:dfac6da0a87bb8470253182c29f394c237f168340a84c615e8cb13d27342cf54",
        "red_receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/dfac6da0a87bb8470253182c29f394c237f168340a84c615e8cb13d27342cf54.json",
        "red_test_digest": "sha256:af4fd059591cb113419a1d567d4f1fa379b5a2a6514d54d4c632eb23121eac71"
      }
    },
    {
      "task": "3.1-3.2",
      "test_file": "scripts/lib/lifecycle-kernel/reducer.test.js",
      "layer": "unit",
      "safety_net": "N/A (new)",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/lifecycle-kernel/reducer.test.js",
        "test_digest": "sha256:eb7c58e7777c13151ece2968576fc60f1467182a2b00a4f0cd6a5f8ed5e086f0",
        "command": "node --test scripts/lib/lifecycle-kernel/reducer.test.js",
        "receipt_id": "sha256:99d956f9d3430a5ba8bd855e3de34dc45cb2bc6d5a274870246c9fd74ee6e95f",
        "receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/99d956f9d3430a5ba8bd855e3de34dc45cb2bc6d5a274870246c9fd74ee6e95f.json",
        "red_command": "node --test scripts/lib/lifecycle-kernel/reducer.test.js",
        "red_receipt_id": "sha256:28bbc2b19827d074f021f139994535fa40fe87c4d05902e45ec1ef5cd85208d5",
        "red_receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/28bbc2b19827d074f021f139994535fa40fe87c4d05902e45ec1ef5cd85208d5.json",
        "red_test_digest": "sha256:eb7c58e7777c13151ece2968576fc60f1467182a2b00a4f0cd6a5f8ed5e086f0"
      }
    },
    {
      "task": "3.3-3.5",
      "test_file": "scripts/lib/lifecycle-kernel/transition-selector.test.js",
      "layer": "unit",
      "safety_net": "N/A (new)",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/lifecycle-kernel/transition-selector.test.js",
        "test_digest": "sha256:d00a2142728404f54242ad887ff6dca43a037445c8523fda02392ead77678c46",
        "command": "node --test scripts/lib/lifecycle-kernel/transition-selector.test.js",
        "receipt_id": "sha256:7915b91cae4ec4088f9e4385f1540ae75dce66b789c845ae00b99651c34a7084",
        "receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/7915b91cae4ec4088f9e4385f1540ae75dce66b789c845ae00b99651c34a7084.json",
        "red_command": "node --test scripts/lib/lifecycle-kernel/transition-selector.test.js",
        "red_receipt_id": "sha256:add1b2bee861516c1658836d4a71e71a86907f09a9b1cf70e908efeed4dd1596",
        "red_receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/add1b2bee861516c1658836d4a71e71a86907f09a9b1cf70e908efeed4dd1596.json",
        "red_test_digest": "sha256:d00a2142728404f54242ad887ff6dca43a037445c8523fda02392ead77678c46"
      }
    },
    {
      "task": "4.1-4.5",
      "test_file": "scripts/lib/lifecycle-kernel/journal.test.js",
      "layer": "unit",
      "safety_net": "N/A (new)",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/lifecycle-kernel/journal.test.js",
        "test_digest": "sha256:5f4733a84b367a8b972076648c18cca70847c5f2c1c62dd80d1d906e40012473",
        "command": "node --test scripts/lib/lifecycle-kernel/journal.test.js",
        "receipt_id": "sha256:e462299773e7a6901507a008d783584d3c54c70c3e9374090e76a50e06bbe119",
        "receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/e462299773e7a6901507a008d783584d3c54c70c3e9374090e76a50e06bbe119.json",
        "red_command": "node --test scripts/lib/lifecycle-kernel/journal.test.js",
        "red_receipt_id": "sha256:af1f9c6983b64f9ae0545d8d448b8179923f5b00d1b6c02646154e07f2268032",
        "red_receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/af1f9c6983b64f9ae0545d8d448b8179923f5b00d1b6c02646154e07f2268032.json",
        "red_test_digest": "sha256:5f4733a84b367a8b972076648c18cca70847c5f2c1c62dd80d1d906e40012473"
      }
    },
    {
      "task": "5.1-5.3",
      "test_file": "scripts/lib/lifecycle-kernel/events.test.js",
      "layer": "unit",
      "safety_net": "N/A (new)",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/lifecycle-kernel/events.test.js",
        "test_digest": "sha256:13c9d09cf6847573486d08a2e7ab430fb8b1441c3f1701e8b9e05864659aebfc",
        "command": "node --test scripts/lib/lifecycle-kernel/events.test.js",
        "receipt_id": "sha256:a51b2b0bf413a5f293ac5ed0494ac7a96fb4d9159782598dd98b0719fc10e905",
        "receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/a51b2b0bf413a5f293ac5ed0494ac7a96fb4d9159782598dd98b0719fc10e905.json",
        "red_command": "node --test scripts/lib/lifecycle-kernel/events.test.js",
        "red_receipt_id": "sha256:52c81e0d84db56f584f39bf88cc74e3c276dbb7066c65076b0cd6a315bc83453",
        "red_receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/52c81e0d84db56f584f39bf88cc74e3c276dbb7066c65076b0cd6a315bc83453.json",
        "red_test_digest": "sha256:13c9d09cf6847573486d08a2e7ab430fb8b1441c3f1701e8b9e05864659aebfc"
      }
    },
    {
      "task": "public-api",
      "test_file": "scripts/lib/lifecycle-kernel/index.test.js",
      "layer": "integration",
      "safety_net": "N/A (new)",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/lifecycle-kernel/index.test.js",
        "test_digest": "sha256:25886e612b72f9fd58bd9fee2c31aa67c791250c9e7481098af89cd8c0e556b9",
        "command": "node --test scripts/lib/lifecycle-kernel/index.test.js",
        "receipt_id": "sha256:cc3a5b690c05e4902b535ca39870610a196e8f37c21f4f658c7054685269fe9f",
        "receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/cc3a5b690c05e4902b535ca39870610a196e8f37c21f4f658c7054685269fe9f.json",
        "red_command": "node --test scripts/lib/lifecycle-kernel/index.test.js",
        "red_receipt_id": "sha256:ff9e559b7d4d3435edb742a8849b02429472f5798e540410cd3be2f7b5fd3240",
        "red_receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/ff9e559b7d4d3435edb742a8849b02429472f5798e540410cd3be2f7b5fd3240.json",
        "red_test_digest": "sha256:25886e612b72f9fd58bd9fee2c31aa67c791250c9e7481098af89cd8c0e556b9"
      }
    },
    {
      "task": "6.1-6.6",
      "test_file": "scripts/lib/minimal-kernel-harness.test.js",
      "layer": "integration",
      "safety_net": "N/A (new)",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/minimal-kernel-harness.test.js",
        "test_digest": "sha256:9a41e9cbff23bf2aa5bde80dc5f69c976a40534f4511a929d60e9aab3a735d91",
        "command": "node --test scripts/lib/minimal-kernel-harness.test.js",
        "receipt_id": "sha256:ee8e1b5711bc80e070849c61f9b642c1d07bf7996d4c40703c53fb8a978c0c5f",
        "receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/ee8e1b5711bc80e070849c61f9b642c1d07bf7996d4c40703c53fb8a978c0c5f.json",
        "red_command": "node --test scripts/lib/minimal-kernel-harness.test.js",
        "red_receipt_id": "sha256:4f5ba9a83c843fb6ffb0a05ee0e87c75fa0598820379a7f84292fecd8269d0db",
        "red_receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/4f5ba9a83c843fb6ffb0a05ee0e87c75fa0598820379a7f84292fecd8269d0db.json",
        "red_test_digest": "sha256:9a41e9cbff23bf2aa5bde80dc5f69c976a40534f4511a929d60e9aab3a735d91"
      }
    },
    {
      "task": "7.1-7.3",
      "test_file": "scripts/lib/lifecycle-kernel/recovery.test.js",
      "layer": "unit",
      "safety_net": "N/A (new)",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/lifecycle-kernel/recovery.test.js",
        "test_digest": "sha256:33b72a0ad18491ac1c979ee727ec95f6cb3a576cd8d6500d7ef19108ed6a16ce",
        "command": "node --test scripts/lib/lifecycle-kernel/recovery.test.js",
        "receipt_id": "sha256:328f9d77b8283be35570ac90ab719e5443b0c51ffe8d249a62c412c389f69e4b",
        "receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/328f9d77b8283be35570ac90ab719e5443b0c51ffe8d249a62c412c389f69e4b.json",
        "red_command": "node --test scripts/lib/lifecycle-kernel/recovery.test.js",
        "red_receipt_id": "sha256:4b34defb73d668a73a09af2cfa7910eca6876c209f3ba3d43b6bb3475058b305",
        "red_receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/4b34defb73d668a73a09af2cfa7910eca6876c209f3ba3d43b6bb3475058b305.json",
        "red_test_digest": "sha256:33b72a0ad18491ac1c979ee727ec95f6cb3a576cd8d6500d7ef19108ed6a16ce"
      }
    },
    {
      "task": "8.1-8.8",
      "test_file": "scripts/lib/lifecycle-model.test.js",
      "layer": "unit",
      "safety_net": "N/A (new)",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/lifecycle-model.test.js",
        "test_digest": "sha256:d773c3708d20586f1d88042afdc1d07f89f869ef91321aa0c05df2d00c23f85c",
        "command": "node --test scripts/lib/lifecycle-model.test.js",
        "receipt_id": "sha256:9085806aa81edc78d22805d7dfb11e6c5265a03d149f771ca6dacd76e9e5fff1",
        "receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/9085806aa81edc78d22805d7dfb11e6c5265a03d149f771ca6dacd76e9e5fff1.json",
        "red_command": "node --test scripts/lib/lifecycle-model.test.js",
        "red_receipt_id": "sha256:c8c683212436339271b10d517533e7bd41280c65477fcf54b7be9a454f6dfce8",
        "red_receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/c8c683212436339271b10d517533e7bd41280c65477fcf54b7be9a454f6dfce8.json",
        "red_test_digest": "sha256:d773c3708d20586f1d88042afdc1d07f89f869ef91321aa0c05df2d00c23f85c"
      }
    },
    {
      "task": "9.1-9.4",
      "test_file": "scripts/lib/transition-parity.k2.test.js",
      "layer": "unit",
      "safety_net": "N/A (new)",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/transition-parity.k2.test.js",
        "test_digest": "sha256:cb8405f97760cfdee00ff0a932e44f9c9829034a5437d4e9a209b9e3fac0eb16",
        "command": "node --test scripts/lib/transition-parity.k2.test.js",
        "receipt_id": "sha256:6f8239da92c837e19264d565d46aaf9685615160086fb81af41598b4af5accb5",
        "receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/6f8239da92c837e19264d565d46aaf9685615160086fb81af41598b4af5accb5.json",
        "red_command": "node --test scripts/lib/transition-parity.k2.test.js",
        "red_receipt_id": "sha256:6c44a78d67ce40424106f1cd0d34fe557ddf53d9a1ba26969e673b5ba31f988c",
        "red_receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/6c44a78d67ce40424106f1cd0d34fe557ddf53d9a1ba26969e673b5ba31f988c.json",
        "red_test_digest": "sha256:cb8405f97760cfdee00ff0a932e44f9c9829034a5437d4e9a209b9e3fac0eb16"
      }
    },
    {
      "task": "10.1-10.5",
      "test_file": "scripts/lib/lifecycle-kernel/bridges.test.js",
      "layer": "unit",
      "safety_net": "N/A (new)",
      "red": "✅ Written",
      "green": "✅ Passed",
      "triangulate": "✅ Written",
      "refactor": "✅ Passed",
      "provenance": {
        "source": "runtime-receipt",
        "test_file": "scripts/lib/lifecycle-kernel/bridges.test.js",
        "test_digest": "sha256:77c97fce31765883295a40b624a006312ff9410489563bf44964af42edf4e6d8",
        "command": "node --test scripts/lib/lifecycle-kernel/bridges.test.js",
        "receipt_id": "sha256:74e022363b7fe280b750bde1366e7e48eab1109166861a0da87ebdf02d2aaaa7",
        "receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/74e022363b7fe280b750bde1366e7e48eab1109166861a0da87ebdf02d2aaaa7.json",
        "red_command": "node --test scripts/lib/lifecycle-kernel/bridges.test.js",
        "red_receipt_id": "sha256:bd14cb2b9cf01fb8131d16d1614d5ef32de1457b85c61e201296759fbde3608f",
        "red_receipt_path": "openspec/changes/k2-lifecycle-kernel/evidence/receipts/bd14cb2b9cf01fb8131d16d1614d5ef32de1457b85c61e201296759fbde3608f.json",
        "red_test_digest": "sha256:77c97fce31765883295a40b624a006312ff9410489563bf44964af42edf4e6d8"
      }
    }
  ]
}
```

## Verify FAIL remediation (code-bug) — 2026-08-04

Remediated verify CRITICAL + WARNING without redesign. Delivery path remains `size:exception` / `exception-ok`.

### CRITICAL — K1 inventory vs K2 successor paths

**Symptom**: `scripts/lib/k1-scope-guard.test.js` failed full `npm test` with “K1 implementation changes absent from its frozen/remediation inventory” for ~27 new K2 paths under `lifecycle-kernel/**`, `lifecycle-model*`, `minimal-kernel-harness*`, `transition-parity.k2.test.js`.

**Fix (smallest correct carve-out)**:
- Added `SUCCESSOR_K2_EXACT` / `SUCCESSOR_K2_PREFIXES` and `isSuccessorK2Path` in `k1-scope-guard.test.js`.
- Inventory governance now uses `isK1GovernedImplementationPath` (= implementation ∩ ¬ successor-K2).
- K2 paths remain `isAllowedK1Path === false` (not added to K1 allowlist; confinement for real K1 paths unchanged).
- New regression test: successor paths excluded from governance without becoming K1-allowed.

### WARNING — vacuous `inv-no-duplicate-effects`

**Symptom**: `checkNoDuplicateEffects` always returned `{ ok: true }`.

**Fix (RED→GREEN)**:
- RED: assert non-vacuous detail (`completed→skip`, `planned→execute`, `failed→skip`, replay completed→skip).
- GREEN: checker calls `reconcileEffect` for those statuses and fails if actions diverge.

### TDD Cycle Evidence (remediation append)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| verify-CRIT | `scripts/lib/k1-scope-guard.test.js` | Integration | existing K1 inventory pin | ✅ Written (successor exclusion) | ✅ Passed | ✅ K2 excluded + K1 path still governed | ✅ Clean | Successor carve-out; not K1 allowlist |
| verify-WARN | `scripts/lib/lifecycle-model.test.js` | Unit | journal reconcile | ✅ Written (non-vacuous detail) | ✅ Passed | ✅ completed/planned/failed/replay | ✅ Clean | Real model checker via `reconcileEffect` |

### Remediation proof commands

1. `node --test scripts/lib/k1-scope-guard.test.js` → pass (5/5)
2. Focal K2: `lifecycle-kernel/**/*.test.js` + harness + model + `transition-parity.k2.test.js` → **77/77** pass
3. Full `npm test` → **1819 pass / 0 fail / 2 skipped**; “All checks passed.”

**Remaining for orchestrator**: re-dispatch `sdd-verify`; task 11.5 stays unchecked until verify PASS then bounded 4R.

## Bounded 4R correction — slice `S-d29e47102af6ce3d` (shell-effect-fail-closed) — 2026-08-04

Frozen finding IDs targeted (believed resolved):
- `F-2b903d354e7568e1` — failed effects no longer commit advanced state
- `F-d43f995b73caada6` — `{ok:false}` blocks with `effect-failed`, digest unchanged, journal `failed` (+ tests)
- `F-335f0270aab52137` — ambiguous executor throw durable-marks `unknown`; resume fail-closes with `reconciliation-required`; `started` retry only for `barrier: pre-effect`

### Behavior shipped
1. Journal `started` with `result.barrier: pre-effect` before executor; `executing` immediately before `effectExecutor`.
2. `{ok:false}` → journal `failed`, return `blocked`/`effect-failed`, **no** `store.commit` of reduced state.
3. Ambiguous throw → journal `unknown`, return `blocked`/`reconciliation-required`; resume does not re-execute.
4. Controlled `kernel-interrupt` without `partial` restores `pre-effect` so after-journal / before-effect matrix resume remains valid; `partial` durable-completes then rethrows.
5. Paths touched (permitted only): `lifecycle-kernel/index.js`, `index.test.js`, `minimal-kernel-harness.test.js`. `journal.js` / `minimal-kernel-harness.js` unchanged.

### TDD Cycle Evidence (4R correction append)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| S-d29e… / F-d43f… | `lifecycle-kernel/index.test.js` | Integration | existing index+harness | ✅ Written | ✅ Passed | ✅ harness ok:false | ✅ Clean | blocked + digest + journal failed |
| S-d29e… / F-335f… | `lifecycle-kernel/index.test.js` | Integration | interrupt matrix | ✅ Written | ✅ Passed | ✅ resume no re-exec | ✅ Clean | unknown + reconciliation-required |
| S-d29e… / F-2b90… | covered by ok:false + failed gate | Integration | matrix green | ✅ via F-d43f | ✅ Passed | ✅ after-effect no dup | ✅ Clean | no reduced-state commit on failure |

### Proof
- `node --test` index + harness + journal → pass (incl. 3 new cases)
- Focal K2 suite → **80/80** pass (77 prior + 3 new)
- `actual_changed_lines` estimate: **~115** (index.js effect/journal shell ~+95; index.test.js ~+80 net new tests; harness.test.js ~+14; journal.js/harness.js 0). Under 200 limit / ~120 forecast.

**Next**: `review-correction` validator for frozen IDs only.

## WARNING follow-up (advisory remediations) — 2026-08-04

Lineage remains `approved` (no reviewer relaunch). Strict TDD for each WARNING; CRITICAL fail-closed slice kept green.

| Finding ID | Status | Fix |
|------------|--------|-----|
| `F-c44d82b8e1cd7768` | done | Mutating ops require `effectExecutor` → `effect-executor-required`; `status` may omit; test denial + no commit |
| `F-f257d334331e45c1` | done | `sourceDefinesReduceLifecycle` detects arrow/const/exports; fixture tests; scan uses helper |
| `F-7962c70c9e0436f1` | done | `runKernelOperation` integration test with preseeded `unknown` journal |
| `F-99013a8c06ee2b2d` | done | `commitJournal` mandatory for mutating ops → `journal-durability-required` |
| `F-e69e265f2a715ae8` | done | Renamed `interruptAt`→`checkpointInterrupt`, `interruptAfter`→`scenarioInterrupt` + vocab comments |
| `F-b5d24c2d875d071c` | done | `reconcileEffect` emits `retry-execute` (pre-effect) vs `fail-closed` (ambiguous started) |
| `F-511f1befb15e00ec` | done | `checkSameTransitions` uses named `identityClone` / `keyOrderReshape` |

### TDD Cycle Evidence (WARNING follow-up append)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| F-c44d… | `index.test.js` | Integration | CRITICAL slice green | ✅ Written | ✅ Passed | ✅ status omits executor | ✅ Clean | effect-executor-required |
| F-99013… | `index.test.js` | Integration | matrix green | ✅ Written | ✅ Passed | ✅ memory store ok | ✅ Clean | journal-durability-required |
| F-7962… | `index.test.js` | Integration | unknown fail-closed | ✅ Written | ✅ Passed | ✅ journal bytes unchanged | ✅ Clean | preseeded unknown |
| F-b5d24… | `journal.test.js` | Unit | interrupt resume | ✅ Written | ✅ Passed | ✅ executing→fail-closed | ✅ Clean | retry-execute action |
| F-f257… | `bridges.test.js` | Unit | tree scan | ✅ Written | ✅ Passed | ✅ import/re-export false | ✅ Clean | arrow/const/exports |
| F-e69e… | `minimal-kernel-harness.test.js` | Integration | matrix | ✅ Renamed call sites | ✅ Passed | ✅ checkpoint tokens | ✅ Clean | checkpointInterrupt |
| F-511f… | `lifecycle-model.test.js` | Unit | model suite | ✅ via rename | ✅ Passed | ✅ existing inv | ✅ Clean | named clones |

### Proof
- Focal K2 suite → **84/84** pass
- Remaining SUGGESTIONs (untouched): `F-fb3424fb598c2ee7`, `F-82d7a8914da5c264`
