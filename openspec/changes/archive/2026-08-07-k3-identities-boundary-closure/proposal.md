# Proposal: K3 Identities Boundary Closure

## Intent

An independent adversarial review of `main@70a52c5` / `v2.42.0` concluded K3 remains **NO-GO**: prior remediations improved structure, but boundary closures are still open. This change closes the remaining fail-open / publication gaps (gates, registry, versioning, crypto bindings) with a focused ~10–15 adversarial test suite — smaller than prior remediations, without re-litigating items already GO.

## Scope

### In Scope

**CRITICAL**
1. **Freeze bypass**: `evaluateCandidateRelation` (and consumers) MUST require a valid frozen Candidate v2 (`kind: candidate/v2`, `schema_version: 2`, `validateCandidateV2`) before relation eval; fail with `reason_code: INVALID_FROZEN_CANDIDATE`. `freezeCandidate` remains the exclusive constructor.
2. **`validateIdentityKind` fail-open**: replace blacklist / optional-`kind` logic with a positive `EXPECTED_KINDS` table; missing or incompatible `kind` → fail closed (Attestation MUST NOT accept SourceSnapshot disguised with `attestation_id`).
3. **Cryptographic bindings**: `validateWorkOrderBinding(sourceSnapshot, workOrder)` and `validateWorkResultBinding(workOrder, workResult)` MUST recompute IDs (`computeWorkOrderId === work_order_id`, `computeSourceSnapshotId === source_snapshot_id`, `computeWorkResultId === work_result_id`) — not string equality alone.
4. **K1 baseline restore**: restore historical pre-K3 `candidate/v1` and `work-order/v1` pins/files from the `02e97a5` era; do **not** only rewrite `K1_SCHEMA_BASELINE` to match drifted files. Verify MUST NOT claim pins intact if files drifted.
5. **v2 schema publication**: publish at `schemas/kernel/candidate/v2.schema.json` and `schemas/kernel/work-order/v2.schema.json` with `$id` `ospec://schemas/kernel/candidate/v2` and `ospec://schemas/kernel/work-order/v2`; register in `manifest.json` and `contract-claims.json`. Remove/replace wrong `candidate-v2/` and `work-order-v2/` paths.

**HIGH**
6. Strict `compute*`: invalid arrays/types MUST throw, never coerce to `[]`; WorkResult required fields MUST NOT be silently defaulted.
7. `freezeCandidate` MUST always produce schema-valid Candidate v2 (`repository_id` minLength 1; `intended_untracked_digest` is `sha256|null`, never `""`).
8. Domain versioning: WorkOrder v2 digest domain MUST be `work-order/v2` (separate from v1); review Candidate domain if needed.

**Tests**: ~10–15 adversarial cases covering the closures above.

### Out of Scope
- K4a graph, K6a workers, K8 attestation emission, K10 delivery authorization product features
- Unrelated harness / SDD workflow changes
- Re-litigating GO items: `DECLARED_ID_MISMATCH` spoofing, WorkOrder canonical `dependencies`/`ownership`/`required_evidence`, `diffText`/`diff_hash` separation (unless regression)

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `execution-identities`: Fail-closed freeze gate; positive-kind table; cryptographic binding recomputation; strict `compute*` / `freezeCandidate` validity; WorkOrder (and Candidate if needed) digest domain `*/v2`.
- `kernel-contract-schemas`: Correct v2 path/`$id` publication + manifest/claims registration; K1 v1 file+pin restore from `02e97a5` era without pin-only retargeting.

## Approach

Close residual gaps in `scripts/lib/execution-identities/` and `schemas/kernel/` only. Apply uses Strict TDD (**RED → GREEN → TRIANGULATE → REFACTOR**). Sequence: (1) relocate/register v2 schemas + restore K1 v1 content/pins from `02e97a5`; (2) RED adversarial tests for each CRITICAL/HIGH gap; (3) GREEN validators (`validateCandidateV2`, `EXPECTED_KINDS`, recomputing bindings, strict `compute*`, freeze schema validity, `work-order/v2` domain). Do not weaken already-GO checks.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `schemas/kernel/candidate/v2.schema.json` | New/Relocate | Canonical Candidate v2 path + `$id` |
| `schemas/kernel/work-order/v2.schema.json` | New/Relocate | Canonical WorkOrder v2 path + `$id` |
| `schemas/kernel/candidate-v2/`, `work-order-v2/` | Removed | Wrong publication layout |
| `schemas/kernel/manifest.json`, `contract-claims.json` | Modified | Register v2 families |
| `schemas/kernel/candidate/v1.schema.json`, `work-order/v1.schema.json` | Restore | Pre-K3 content vs `02e97a5` |
| `scripts/lib/lifecycle-kernel/k1-compat.js` | Modified | Pins match restored v1 files |
| `scripts/lib/execution-identities/index.js` | Modified | Gates, kinds, bindings, compute*, freeze, domains |
| `scripts/lib/execution-identities/index.test.js` | Modified | ~10–15 adversarial closures |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `work-order/v2` domain breaks callers still hashing under `work-order/v1` | Med | Explicit dual-domain; adversarial tests; document migration in design |
| K1 pin restore conflicts with post-`02e97a5` legitimate edits | Med | Diff vs `02e97a5`; restore only drifted identity v1 schemas; verify file digests |
| Signature change of `validateWorkOrderBinding` breaks callers | Med | Update call sites + tests in same apply batch |
| Strict TDD / review budget overrun on schema move | Low | Focused ~10–15 tests; delivery already `exception-ok` |

## Rollback Plan

Revert the feature-branch commits that touch `scripts/lib/execution-identities/`, `scripts/lib/lifecycle-kernel/k1-compat.js`, and `schemas/kernel/{candidate,work-order}*`, `manifest.json`, `contract-claims.json`, restoring tree to pre-change `main` / `v2.42.0` (`70a52c5`). No data migration; identities are computed artifacts.

## Dependencies

- Prior archived K3 work: `2026-08-06-k3-identities-candidate-freeze`, `2026-08-07-k3-identities-remediation` (structure present; closures incomplete)
- Historical baseline commit `02e97a5` for K1 v1 restore reference
- K2a CapabilityProof baseline (unchanged)

## Success Criteria

- [ ] Relation eval rejects non-frozen / invalid Candidate v2 with `INVALID_FROZEN_CANDIDATE`; only `freezeCandidate` constructs v2
- [ ] `validateIdentityKind` uses positive `EXPECTED_KINDS`; Attestation rejects SourceSnapshot+`attestation_id` disguise
- [ ] Bindings recompute digests; string-equal spoofed IDs fail closed
- [ ] K1 v1 files+pins match `02e97a5`-era content; verify does not claim intact pins on drift
- [ ] v2 schemas live at `schemas/kernel/{candidate,work-order}/v2.schema.json` with correct `$id` and manifest/claims entries; wrong `*-v2/` paths gone
- [ ] Invalid `compute*` arrays/types throw; freeze always schema-valid; WorkOrder digest domain is `work-order/v2`
- [ ] ~10–15 adversarial tests pass under `npm test` (Strict TDD evidence complete)

**Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention (e.g. `git checkout -b fix/k3-identities-boundary-closure main`).
