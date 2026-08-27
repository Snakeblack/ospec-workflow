# Archive Report: k6b-semantic-integrity-remediation

**Archive destination (planned)**: `openspec/changes/archive/2026-08-28-k6b-semantic-integrity-remediation/`
**Verified**: 2026-08-27
**Verify verdict**: PASS (26/26 tasks; 22/22 MUST scenarios at runtime-test; focused 82/82; `npm test` 2762 pass / 0 fail)

## Summary

Post-v2.51.0 semantic integrity remediation closes six defects (B1–B3, H1–H3): invert REQ-006 aliasing so incompatible strategy roles MUST NOT share one EvidenceId; enforce token-subset MUST coverage persisted on `assessment/v1`; gate contract digest before strategy; harden `projectAssuranceGraph`, `replayAssuranceGraph`, and `reconcileAssuranceGraph` fail-closed. Frozen `evidence/v2`, `verification/v2`, and K1 v1 bytes remain unchanged. Implementation spans verifier, Assurance Graph, kernel assessment schema/fixtures, adversarial tests, and harness-evolution docs. All 26 tasks complete under approved `size:exception` delivery. Candidate excludes pre-existing `models.yaml`.

## Verification Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS |
| CRITICAL issues | None |
| WARNING issues (verify) | None |
| Apply tasks complete | 26/26 |
| 4R review gate | approved (`archive_allowed: true`; lineage `sha256:8c6808007fb67e490cfd80cf38a8d40cef42bcf0f0e6b1a87bd73c7ee661906d`) |
| 4R findings | 0 BLOCKER, 0 CRITICAL, 4 WARNING, 0 SUGGESTION |
| Baseline fingerprints | Match `state.yaml` for all three delta domains |

## Spec Preparation (change-local)

| Domain | Action | Added | Modified | Removed |
|--------|--------|-------|----------|---------|
| `independent-verification` | Prepared merge | REQ-008 (1) | REQ-005, REQ-006 (2) | — |
| `assurance-graph` | Prepared merge | REQ-007, REQ-008 (2) | REQ-006 (1) | — |
| `kernel-contract-schemas` | Prepared merge | — | REQ-027 (1) | — |

Prepared bytes:

- `prepared-specs/independent-verification/spec.md` (`sha256:4458c5773ceefc0453b0ca5ff73da7bc916aab239e7f5203c748e4a9db519da2`)
- `prepared-specs/assurance-graph/spec.md` (`sha256:c06f59378d4acb1bfefa17bf02e4df98e423a6a26540d75fdb6bd820b6aed73d`)
- `prepared-specs/kernel-contract-schemas/spec.md` (`sha256:0ef263964a2212696ea724c4c3bc51774e8b5d739cf9dbd49b43cdf7e7f2b6d1`)

Live `target_before_sha256` values (from `state.yaml` `baseline_fingerprints`):

- `independent-verification`: `sha256:3207ce8b5b280472b9b505378cf91df22b1ae22e007adb9dbf8a173405c5b0a0`
- `assurance-graph`: `sha256:81f10f2046ae5519aead34f0f945275e99bfefbc03f9a898d80ce8bcbc437f56`
- `kernel-contract-schemas`: `sha256:0f6c1f85aaff2f9b7a60320a66830bbc23feeb01a29ce4e6a8ef4cec`

Live `openspec/specs/**` writes are runtime-owned.

## ADR Promotions (planned)

| Source | Planned target |
|--------|----------------|
| `decisions/adr-001.md` | `docs/adr/adr-20260828-001-persist-token-coverage-on-assessment-v1.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260828-002-ordered-non-aliased-strategy-evidence.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260828-003-canonical-integrity-validation-across-graph-operations.md` |

Change-local copies under `decisions/` travel with the archive folder as audit trail.

## Accepted Risks / Follow-ups

| ID | Severity | Owner | Summary | Disposition |
|----|----------|-------|---------|-------------|
| 4r-warning-001 | WARNING | assurance-graph | Replay MUST-incomplete path (empty/partial assessments) lacks a dedicated runtime test | Non-blocking follow-up |
| 4r-warning-002 | WARNING | assurance-graph | Reconcile `nodes`/`edges` comparison is not exercised with a self-consistent stored `graph_id` | Non-blocking follow-up |
| 4r-warning-003 | WARNING | independent-verifier | `assertRoleOrder` nested ternary / undocumented last-predecessor-before-first-successor criterion | Non-blocking follow-up |
| 4r-warning-004 | WARNING | independent-verifier | `normalizedCoverage` silent dual-shape fallback (`wrapper \|\| nested evidence`) | Non-blocking follow-up |

4R advisory WARNINGs are non-blocking; covering runtime tests pass for the archived scope.

## Archive Inventory

Origin paths preserved by the planned runtime move (excluding `archive-plan.json` from fingerprint identity): proposal, design, tasks, apply/verify/archive reports, delta and prepared specs, three decisions, state, `.4r/` review lineage artifacts (6 files), and remediation scope (22 entries at plan emission).

## Runtime Completion (pending)

- Live spec merge and ADR promotion: `node scripts/archive-transaction-run.js k6b-semantic-integrity-remediation`
- Source directory `openspec/changes/k6b-semantic-integrity-remediation/` still exists until runtime receipt confirms full match and delete-after-commit.

## Cost

Estimated token cost per phase, aggregated from
`.ospec/session/k6b-semantic-integrity-remediation/phase-costs.jsonl`. Figures are heuristic estimates
(~4 bytes/token), not exact metering.

| Phase | Invocations | Re-launches | Duration | Model Tiers | Statuses | Estimated Prompt Tokens | Estimated Artifact Tokens | Estimated Tool Output Tokens | Estimated Output Tokens |
|-------|-------------|-------------|----------|-------------|----------|-------------------------|---------------------------|------------------------------|-------------------------|
| spec | 1 | 0 | 0ms | unknown | blocked | 46308 (estimated) | 0 (estimated) | 0 (estimated) | 678 (estimated) |
| design | 1 | 0 | 0ms | unknown | success | 56219 (estimated) | 0 (estimated) | 0 (estimated) | 29 (estimated) |
| tasks | 2 | 1 | 0ms | unknown | success | 159888 (estimated) | 0 (estimated) | 0 (estimated) | 1605 (estimated) |
| apply | 2 | 1 | 0ms | unknown | success | 181179 (estimated) | 0 (estimated) | 0 (estimated) | 939 (estimated) |
| verify | 1 | 0 | 0ms | unknown | success | 88482 (estimated) | 0 (estimated) | 0 (estimated) | 29 (estimated) |

**Total user questions asked**: 0
