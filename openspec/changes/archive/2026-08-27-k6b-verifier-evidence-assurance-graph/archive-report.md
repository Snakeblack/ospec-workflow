# Archive Report: k6b-verifier-evidence-assurance-graph

**Archive destination (planned)**: `openspec/changes/archive/2026-08-27-k6b-verifier-evidence-assurance-graph/`
**Verified**: 2026-08-27
**Verify verdict**: PASS (targeted V001 recheck closed; `npm test` 2708 pass / 0 fail / 2 skipped)

## Summary

Change delivers an independent verifier over frozen `CandidateId` with closed evidence strategies, provenance sufficiency, separate verification verdicts, and a read-only content-addressed Assurance Graph with selective invalidation on successor. Additive kernel schemas (`evidence/v2`, `verification/v2`, `assurance-graph/v1`) preserve K1 v1 byte pins. Implementation spans `scripts/lib/independent-verifier/`, `scripts/lib/assurance-graph/`, kernel schemas/fixtures, boundary/E2E tests, and harness-evolution maturity docs. All 33 tasks complete under `size:exception` delivery.

## Verification Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS |
| CRITICAL issues | None (V001 resolved via targeted recheck) |
| Apply tasks complete | 33/33 |
| 4R review gate | approved (`archive_allowed: true`, `terminal_reason: no-unresolved-blocking-findings`) |
| Candidate identity (read-only) | `sha256:908b136e18c4eddb602f64666095d3551af6e9a070e97180a8b161ff0e66f503` |
| Lineage identity (read-only) | `sha256:d769c1e8387b641641303253879f491080a66772c8b95b23165dccf8ce4ade9a` (generation 3) |
| Baseline fingerprints | Match `state.yaml` (`kernel-contract-schemas`, `harness-authority-canon`) |

## Spec Preparation (change-local)

| Domain | Action | Added | Modified | Removed |
|--------|--------|-------|----------|---------|
| `independent-verification` | New domain | REQ-001–004 (4) | — | — |
| `assurance-graph` | New domain | REQ-001–004 (4) | — | — |
| `kernel-contract-schemas` | Prepared merge | REQ-024, REQ-025, REQ-026 | REQ-001 (K6b family inventory) | — |
| `harness-authority-canon` | Prepared merge | REQ-010, REQ-011 | REQ-001 (Assurance Graph non-authority) | — |

Prepared bytes:

- `prepared-specs/independent-verification/spec.md` (`sha256:8063703bb9860b0fbff8b49894fa17932c222cb58f1dea028bda57a00330fc6d`)
- `prepared-specs/assurance-graph/spec.md` (`sha256:c7d171aab463f80f504aff6706e7847ef44a849ae79a8e06f13a8e4e17a1795d`)
- `prepared-specs/kernel-contract-schemas/spec.md` (`sha256:fabcbc4edb0ab2934414ca9bf5bca0f88c7e5a3759a0c427f739d0475835d25d`)
- `prepared-specs/harness-authority-canon/spec.md` (`sha256:dd46f681af76c7a02ffa6207c934ee62a8e572333895ad1f9e28afd8c4d936d7`)

Live `openspec/specs/**` writes are runtime-owned.

## ADR Promotions (planned)

| Source | Planned target |
|--------|----------------|
| `decisions/adr-001.md` | `docs/adr/adr-20260827-004-additive-evidence-and-verification-v2-contracts.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260827-005-independent-policy-driven-verifier.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260827-006-derived-assurance-graph-with-selective-invalidation.md` |

Change-local copies under `decisions/` travel with the archive folder as audit trail.

## Accepted Risks / Follow-ups

| ID | Severity | Owner | Summary | Disposition |
|----|----------|-------|---------|-------------|
| F-0f916054e8ae73dd | WARNING (4R) | reliability | `INSUFFICIENT_PROVENANCE` rejection for a present anyOf member (contract/integration or install/consume) not tested | Follow-up: add strategy-policy test for admissible anyOf member with inadmissible provenance |
| F-69cc792b6e0ffea3 | WARNING (4R) | reliability | `requiredNegativeRole` provenance inadmissible rejection not tested | Follow-up: add negative test for inadmissible provenance on requiredNegativeRole |
| F-fef962351fabb90b | WARNING (4R) | reliability | Invalidation closure lacks satisfies/verified-by-only dependency cases | Follow-up: add graph tests where closure depends on `satisfies` or `verified-by` edges only |

User explicitly accepted archive with generation-3 4R advisory WARNINGs recorded as non-blocking follow-up work (`k6b-bounded-review-002`).

## Archive Inventory

Origin paths preserved by the planned runtime move (excluding `archive-plan.json` from fingerprint identity). Includes proposal, design, tasks, apply/verify/archive reports, delta and prepared specs, decisions, state, and `.4r/` review lineage artifacts (52 entries at plan emission).

## Runtime Completion (pending)

- Live spec merge and ADR promotion: `node scripts/archive-transaction-run.js k6b-verifier-evidence-assurance-graph`
- Source directory `openspec/changes/k6b-verifier-evidence-assurance-graph/` still exists until runtime receipt confirms full match and delete-after-commit.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k6b-verifier-evidence-assurance-graph/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
