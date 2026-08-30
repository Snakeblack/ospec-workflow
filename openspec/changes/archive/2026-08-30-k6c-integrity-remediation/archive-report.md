# Archive Report: k6c-integrity-remediation

**Archive destination (planned)**: `openspec/changes/archive/2026-08-30-k6c-integrity-remediation/`
**Verified**: 2026-08-30
**Verify verdict**: PASS (24/24 MUST scenarios; 30/30 tasks; focal 130/130; `npm test` 2874 pass / 0 fail)

## Summary

Remediación quirúrgica K6c: frontera canónica compartida (`integrity.js`), ejecución aislada fail-closed con workspace K6a y deadline sticky, cobertura exacta del conjunto de challenges en el verifier, proyección/replay determinista en Assurance Graph, y contratos K6c cerrados con fixtures malformed-hash y cross-bound. Tres CRITICAL 4R resueltos (S-58 fail-open, S-89 revert tests, S-986 risk fail-open ya corregido). K6d permanece bloqueado como iniciativa posterior.

## Verification Gate

| Check | Result |
|-------|--------|
| Verify verdict | PASS |
| `phases.verify.verdict` (state.yaml) | PASS (persisted for runtime gate) |
| CRITICAL issues (verify) | None |
| WARNING issues (verify) | None |
| Apply tasks complete | 30/30 |
| 4R review gate | approved (`terminal_reason: all-remediation-slices-passed`; `archive_allowed: true`) |
| CRITICAL 4R slices | 3/3 passed (S-58, S-89, S-986) |
| Baseline fingerprints | Match `state.yaml` for all four delta domains |

## Spec Preparation (change-local)

| Domain | Action | Added | Modified | Removed |
|--------|--------|-------|----------|---------|
| `adversarial-challenges` | Prepared merge | — | REQ-002, REQ-004 (2) | — |
| `independent-verification` | Prepared merge | — | REQ-010 (1) | — |
| `assurance-graph` | Prepared merge | REQ-009 (1) | — | — |
| `kernel-contract-schemas` | Prepared merge | — | REQ-029 (1) | — |

Prepared bytes:

- `prepared-specs/adversarial-challenges/spec.md` (`sha256:13c15dc2a124e9219ad943c543a27dd0b1c7dd3dfa0f917fe117ea8f81c16036`)
- `prepared-specs/independent-verification/spec.md` (`sha256:df2f44d99e0fcb7b624880efdb58b75f29dfde54c631890b1a9497f466e69bf2`)
- `prepared-specs/assurance-graph/spec.md` (`sha256:4a664c924fce52cb27e00c842be67dcafa9ee63fc848dd75ea0c0985e4aee459`)
- `prepared-specs/kernel-contract-schemas/spec.md` (`sha256:6300b5919fa223dd0901211b2bc454f71954865f8eee3a588328bbdac902809c`)

Live `openspec/specs/**` writes are runtime-owned.

## ADR Promotions (planned)

| Source | Planned target |
|--------|----------------|
| `decisions/adr-001.md` | `docs/adr/adr-20260830-001-shared-canonical-k6c-integrity-boundary.md` |
| `decisions/adr-002.md` | `docs/adr/adr-20260830-002-k6a-workspace-reuse-sticky-cancellation.md` |
| `decisions/adr-003.md` | `docs/adr/adr-20260830-003-deterministic-non-authoritative-k6c-graph-projection.md` |

Change-local copies under `decisions/` travel with the archive folder as audit trail.

## Accepted Risks / Follow-ups

No verify WARNINGs or SUGGESTIONs block archive (`accepted_warnings: []`).

4R advisory follow-ups (non-blocking):

| ID | Severity | Owner | Summary | Disposition |
|----|----------|-------|---------|-------------|
| F-541ad8fff4fc3d06 | WARNING | reliability | Workspace sin tests termina passed por `missing_tests` | Advisory follow-up |
| F-d242247fae1408dc | WARNING | reliability | `createChallengePlan` reescribe estrategia desconocida a strict-tdd | Advisory follow-up |
| F-0b3ddb4c8c467449 | WARNING | reliability | Falta test omitiendo ChallengePlan en verifier | Advisory follow-up |
| F-245e8eee5c7bb69a | WARNING | resilience | Leak de workspace si materialize falla | Advisory follow-up |
| F-5e675db886937f54 | WARNING | readability | Comentarios de inversión pass/fail removidos | Advisory follow-up |
| F-eb842745522400af | WARNING | readability | Anidamiento profundo en focal-mutation | Advisory follow-up |
| F-15d61f2a96c4298c | WARNING | readability | `parseUnifiedDiff` sin documentar algoritmo | Advisory follow-up |
| F-ca6ac909487160c6 | WARNING | readability | `derivePatchFromDiff` sin contrato documentado | Advisory follow-up |
| F-262e70a7cfc443eb | SUGGESTION | readability | Fallback silencioso de evidenceStrategy | Advisory follow-up |

Unresolved apply assumptions (high reversibility, no escalation): sandboxed `node <file>` vs nested `node --test`; cross-bound fixtures bajo `fixtures/pairs/`.

K6d remains a later initiative, not in scope for this archive.

## Archive Inventory

Origin paths preserved by the planned runtime move (excluding `archive-plan.json` from fingerprint identity): proposal, design, tasks, apply/verify/archive reports, delta and prepared specs, three decisions, state, `.4r/` review lineage artifacts (28 entries at plan emission).

## Runtime Completion (pending)

- Live spec merge and ADR promotion: `node scripts/archive-transaction-run.js k6c-integrity-remediation`
- Source directory `openspec/changes/k6c-integrity-remediation/` still exists until runtime receipt confirms full match and delete-after-commit.

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/k6c-integrity-remediation/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0
