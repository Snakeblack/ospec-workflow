# Archive Report: k3-identities-boundary-closure

**Change**: k3-identities-boundary-closure  
**Date**: 2026-08-07  
**Status**: VERIFIED & READY FOR ARCHIVE  

## Summary of Accomplishments

All 42 implementation and remediation tasks across Phases 1–5 have been successfully executed and verified against strict TDD rules and full test suite execution (`node scripts/check.js`: 2085 pass / 0 fail).

### Core Boundaries Closed (K3)
1. **Freeze Gate & Candidate Validation**: `evaluateCandidateRelation` enforces valid frozen `candidate/v2` inputs (`kind: "candidate/v2"`, `schema_version: 2`, passing `validateCandidateV2`) returning `INVALID_FROZEN_CANDIDATE` on non-frozen or invalid inputs before relation computation.
2. **Positive Identity Kind Discrimination**: `validateIdentityKind` utilizes a closed `EXPECTED_KINDS` table fail-closing on missing or incompatible `kind`.
3. **Cryptographic Binding Recompute**: `validateWorkOrderBinding` and `validateWorkResultBinding` recompute digests fail-closing on payload spoofing.
4. **Canonical V2 Schema Publication**: Schemas published at canonical paths `schemas/kernel/candidate/v2.schema.json` and `schemas/kernel/work-order/v2.schema.json` with stable `$id` values.
5. **K1 Historical Restore**: Restored `candidate/v1` and `work-order/v1` schema bytes and `K1_SCHEMA_BASELINE` pins to `02e97a5`-era state.
6. **WorkOrder V2 Digest Domain Separation**: WorkOrder v2 digests use `work-order/v2` domain string while Candidate remains `candidate/v1`.
7. **Strict Digest Compute Validation**: `computeSourceSnapshotId`, `computeWorkOrderId`, `computeWorkResultId`, and `computeCandidateId` fail closed on invalid inputs without silent `[]` coercion.

## Proposed ADR Promotions

- `openspec/changes/k3-identities-boundary-closure/decisions/adr-001.md` → `docs/adr/adr-20260807-001-canonical-v2-identity-schemas-and-registry.md`
- `openspec/changes/k3-identities-boundary-closure/decisions/adr-002.md` → `docs/adr/adr-20260807-002-two-argument-cryptographic-binding-validation.md`
- `openspec/changes/k3-identities-boundary-closure/decisions/adr-003.md` → `docs/adr/adr-20260807-003-k1-schema-and-baseline-pin-restoration.md`
- `openspec/changes/k3-identities-boundary-closure/decisions/adr-004.md` → `docs/adr/adr-20260807-004-work-order-v2-digest-domain-separation.md`
- `openspec/changes/k3-identities-boundary-closure/decisions/adr-005.md` → `docs/adr/adr-20260807-005-expected-kinds-positive-identity-discrimination.md`

## Cost

No per-phase cost data was recorded for this change (`.ospec/session/k3-identities-boundary-closure/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
