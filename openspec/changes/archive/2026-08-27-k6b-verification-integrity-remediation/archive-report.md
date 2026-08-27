# Archive Report: k6b-verification-integrity-remediation

**Archive destination (planned)**: `openspec/changes/archive/2026-08-27-k6b-verification-integrity-remediation/`
**Verified**: 2026-08-27
**Verify verdict**: PASS (re-verify after 4R successor; 35/35 MUST scenarios; focal 75/75; `npm test` 2754 pass / 0 fail)

## Summary

Remediation change closes six K6b verification-integrity defects: Obligation Manifest MUST coverage after strategy evaluation, persistable assessment/binding distinct from evidence/v2, collector-derived strong provenance, canonical `graph_id` fingerprinting, fail-closed facade projection, and `rejectForbidden` by kind/namespace. Additive kernel family `assessment/v1` preserves evidence/v2, verification/v2, and K1 v1 byte pins. Implementation spans `scripts/lib/independent-verifier/`, `scripts/lib/assurance-graph/`, kernel schemas/fixtures, E2E replay tests, and harness-evolution roadmap docs. All 30 tasks complete under approved `size:exception` delivery. Candidate excludes `models.yaml`.

## Verification Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS |
| CRITICAL issues | None |
| WARNING issues (verify) | None |
| SUGGESTION issues (verify) | 2 (non-blocking; recorded below) |
| Apply tasks complete | 30/30 |
| 4R review gate | approved (`archive_allowed: true`; successor lineage generation 2) |
| Successor lineage (read-only) | `sha256:a051818ce2bb310c5fa3a29c8a7b730a564dd5b44ff1da238a73089fcce94c02` |
| Predecessor lineage (read-only) | `sha256:262dda4ab0b3ec0fe60b7db34683c55d3c4d2590fe69282c40197cbc95aacf42` |
| Baseline fingerprints | Match `state.yaml` for all three delta domains |

## Spec Preparation (change-local)

| Domain | Action | Added | Modified | Removed |
|--------|--------|-------|----------|---------|
| `independent-verification` | Prepared merge | REQ-005, REQ-006, REQ-007 (3) | REQ-003, REQ-004 (2) | — |
| `assurance-graph` | Prepared merge | REQ-005, REQ-006 (2) | REQ-001, REQ-002 (2) | — |
| `kernel-contract-schemas` | Prepared merge | REQ-027 (1) | REQ-001 (1) | — |

Prepared bytes:

- `prepared-specs/independent-verification/spec.md` (`sha256:3207ce8b5b280472b9b505378cf91df22b1ae22e007adb9dbf8a173405c5b0a0`)
- `prepared-specs/assurance-graph/spec.md` (`sha256:81f10f2046ae5519aead34f0f945275e99bfefbc03f9a898d80ce8bcbc437f56`)
- `prepared-specs/kernel-contract-schemas/spec.md` (`sha256:0f6c1f85aaff2f9b7a60320a66830bbc23feeb01a29ce4e6a8ef8f5d59ef4cec`)

Live `openspec/specs/**` writes are runtime-owned.

## ADR Promotions (planned)

| Source | Planned target |
|--------|----------------|
| `decisions/adr-001.md` | `docs/adr/adr-20260827-007-additive-assessment-family-id.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260827-008-must-walk-after-strategy-assessment-identity.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260827-009-collector-transport-provenance-allowlist.md` |
| `decisions/adr-004.md` | `docs/adr/adr-20260827-010-canonical-graph-id-fail-closed-projection.md` |

Change-local copies under `decisions/` travel with the archive folder as audit trail.

## Accepted Risks / Follow-ups

| ID | Severity | Owner | Summary | Disposition |
|----|----------|-------|---------|-------------|
| verify-suggestion-001 | SUGGESTION | independent-verifier | Worker-collector MUST case accepts `INSUFFICIENT_PROVENANCE` or `UNTRUSTED_COLLECTOR`; pinning one code would sharpen contract | Non-blocking follow-up |
| verify-suggestion-002 | SUGGESTION | assurance-graph | Mismatched `canonicalInputs` accepts `GRAPH_DIVERGENCE` or `BINDING_MISMATCH`; design prefers `GRAPH_DIVERGENCE` | Non-blocking follow-up |

4R advisory WARNINGs (FABRICATED_EVIDENCE tests, INVALID_ASSESSMENT, comments/renames) remain advisory. Covering runtime tests pass; not escalated to verify CRITICAL and not archive blockers.

## Archive Inventory

Origin paths preserved by the planned runtime move (excluding `archive-plan.json` from fingerprint identity). Includes proposal, design, tasks, apply/verify/archive reports, delta and prepared specs, four decisions, state, `.4r/` review lineage artifacts, and remediation scripts (42 entries at plan emission).

## Runtime Completion (pending)

- Live spec merge and ADR promotion: `node scripts/archive-transaction-run.js k6b-verification-integrity-remediation`
- Source directory `openspec/changes/k6b-verification-integrity-remediation/` still exists until runtime receipt confirms full match and delete-after-commit.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k6b-verification-integrity-remediation/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
