# Archive Report

**Change**: phase-envelope-state-mechanical-projection
**Date**: 2026-09-11
**Route**: standard
**Artifact store**: openspec (repo-local)
**Verdict**: PASS — archived

## Summary

CX1 implementa el envelope versionado `result-envelope/v1` con renderer humano desacoplado y `PhaseCompletionReducer` mecánico para proyección de estado sin inferencia por LLM. El cambio elimina la duplicación mecánica entre agentes y el kernel, estableciendo un contrato estricto JSON-only con validación, adaptador legacy, y proyección determinista con CAS/replay.

## Structured Status and actionContext

- Native SDD status (`gentle-ai.sdd-status` schema 2, regenerated with `gentle-ai sdd-status`): change `phase-envelope-state-mechanical-projection`, apply `all_done` (taskProgress 24/24, zero unchecked), verify PASS (verdict `pass`, blockers 0, critical 0), archive dispatched by the parent orchestrator with `nextRecommended: archive`.
- `actionContext.mode: repo-local`, `workspaceRoot`/`allowedEditRoots`: `C:\Users\sn4ke\dev\activos\ospec-workflow` — every mutated path in this archive (canonical spec merges, ADR promotions, change-dir move) stays inside the allowed root.
- Final Task Completion Gate: `tasks.md` re-read immediately before plan refresh, sync, and move — zero `- [ ]` implementation task lines remain (24/24 `[x]`); no stale-checkbox reconciliation was needed or performed.
- Archive-time sync fallback: the canonical spec merge was executed at archive time from the plan's `spec_writes` with explicit parent-orchestrator approval (this run). No separate `sync-report.md` exists; this report is the sync record. Verification was clean (PASS) before any sync write.

## Verification (authoritative, this session's re-run)

`verify-report.md` carries a valid `gentle-ai.verify-result/v1` envelope, re-emitted this session and validated byte-exactly via `gentle-ai sdd-verify-validate --requirements 11 --scenarios 50` → `valid: true`.

| Metric               | Value                                                                                               |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| Envelope verdict     | pass (blockers 0, critical_findings 0)                                                              |
| Evidence revision    | `sha256:c46d3b46bc6c5c858688d0c3c4d315b57a509864b779a54e6772f69935991b14`                           |
| Requirements         | 11/11 (engine `### Requirement:` header-count convention)                                           |
| Scenarios            | 50/50 (37 CX1 delta + 13 baseline-carried restatements in MODIFIED REQ-kernel-contract-schemas-001) |
| Implementation tasks | 24/24 `[x]`, zero unchecked lines                                                                   |
| Focal tests          | 189/189 passed                                                                                      |
| Full suite           | 3316/3316 passed, `npm test` exit 0                                                                 |
| Build                | `node scripts/check.js` exit 0                                                                      |

Note: snapshots saying "22 tasks / 37 scenarios" (including the superseded draft of this report) are stale narrative; the authoritative totals are the ones above.

## Spec Promotions (canonical sync, per plan `spec_writes`)

| Domain                   | Source delta                                      | Target                                            | Requirements ADDED                   | Requirements MODIFIED                    | Requirements REMOVED |
| ------------------------ | ------------------------------------------------- | ------------------------------------------------- | ------------------------------------ | ---------------------------------------- | -------------------- |
| agents                   | `specs/agents/spec-prepared.md`                   | `openspec/specs/agents/spec.md`                   | REQ-agents-029                       | —                                        | —                    |
| hooks                    | `specs/hooks/spec-prepared.md`                    | `openspec/specs/hooks/spec.md`                    | REQ-hooks-023                        | REQ-hooks-015                            | —                    |
| kernel-contract-schemas  | `specs/kernel-contract-schemas/spec-prepared.md`  | `openspec/specs/kernel-contract-schemas/spec.md`  | REQ-kernel-contract-schemas-031      | REQ-kernel-contract-schemas-001          | —                    |
| lifecycle-kernel-runtime | `specs/lifecycle-kernel-runtime/spec-prepared.md` | `openspec/specs/lifecycle-kernel-runtime/spec.md` | REQ-lifecycle-kernel-028, -029, -030 | —                                        | —                    |
| skills                   | `specs/skills/spec-prepared.md`                   | `openspec/specs/skills/spec.md`                   | REQ-skills-018, -019                 | REQ-skills-001 (Compact Phase Summaries) | —                    |

### Destructive-merge guard (rules.archive: warn before merging destructive deltas)

- 8 requirements ADDED, 3 MODIFIED in place (headers preserved), **0 REMOVED**, 0 renamed across all 5 domains — verified by requirement-header diff of prepared vs canonical before execution and enforced by the runtime's `dropped-requirement-id` validator.
- MODIFIED `REQ-kernel-contract-schemas-001` carries all 13 baseline-carried scenarios plus the new result-envelope registration scenario (18 total) — no scenario silently dropped; every scenario evidenced in the verify compliance matrix.
- No destructive-merge approval was required; no blockers.
- Same-domain active-change warnings: none (`relationships.sameDomainActiveChanges: []`; no other change under `openspec/changes/*/specs` touches these 5 domains).
- Baseline drift: live canonical spec hashes matched `state.yaml` `baseline_fingerprints` and the plan's `target_before_sha256` for all 5 domains at preflight.

## ADR Promotions

| Source               | Target                                                                                         | Collision check |
| -------------------- | ---------------------------------------------------------------------------------------------- | --------------- |
| decisions/adr-001.md | docs/adr/adr-20260911-002-adr-001-versioned-result-envelope-v1-and-decoupled-human-renderer.md | no collision    |
| decisions/adr-002.md | docs/adr/adr-20260911-003-adr-002-pure-phasecompletionreducer-state-projection.md              | no collision    |
| decisions/adr-003.md | docs/adr/adr-20260911-004-adr-003-cas-revision-checks-and-replay-determinism.md                | no collision    |
| decisions/adr-004.md | docs/adr/adr-20260911-005-adr-004-fail-closed-authority-boundary-on-approvals-and-gates.md     | no collision    |

Targets verified against `docs/adr/` before execution: the highest existing sequence is `adr-20260911-001`; `adr-20260911-002..005` were absent.

## Architecture Decisions

1. **ADR-001**: Versioned Result Envelope v1 and Decoupled Human Renderer — schema JSON-only target con renderer markdown puro
2. **ADR-002**: Pure PhaseCompletionReducer State Projection — reductor sin I/O, sin LLM
3. **ADR-003**: CAS Revision Checks and Replay Determinism — control de concurrencia y deduplicación por hash
4. **ADR-004**: Fail-Closed Authority Boundary on Approvals and Gates — rechazo de claims sintéticos

## Artifacts Read

- `openspec/changes/phase-envelope-state-mechanical-projection/proposal.md`
- `openspec/changes/phase-envelope-state-mechanical-projection/specs/{agents,hooks,kernel-contract-schemas,lifecycle-kernel-runtime,skills}/spec.md` (+ `spec-prepared.md` merge sources)
- `openspec/changes/phase-envelope-state-mechanical-projection/design.md`
- `openspec/changes/phase-envelope-state-mechanical-projection/tasks.md`
- `openspec/changes/phase-envelope-state-mechanical-projection/apply-progress.md`
- `openspec/changes/phase-envelope-state-mechanical-projection/verify-report.md`
- `openspec/changes/phase-envelope-state-mechanical-projection/archive-plan.json` (revalidated; `source_fingerprint`/`archive_inventory` refreshed against the current tree — the draft plan predated the verify re-run)
- `openspec/changes/phase-envelope-state-mechanical-projection/state.yaml`
- `openspec/config.yaml` (`rules.archive`)

## Archive Execution

- Runtime: `node scripts/archive-transaction-run.js phase-envelope-state-mechanical-projection` (staging-rename journal transaction, CAS-validated plan, `parity.go: n/a` per ADR-20260726-006).
- Prior interrupted run (journal `.ospec/archive-tx/phase-envelope-state-mechanical-projection`, state `failed`, `failure_reason: gate-not-satisfied`, `rejection_codes: []`, `created_by_tx: []` — zero live mutations) predated the verify PASS landing in `state.yaml`; the terminal failed journal was moved to `.ospec/archive-tx-history/phase-envelope-state-mechanical-projection-failed-preflight-2026-09-11` (audit preserved).
- Second preflight rejection before success: `missing-reference` — the plan carried workspace-relative `source_delta`/ADR `source` paths while the runtime resolves them against the change root (convention confirmed against archived plan `2026-09-11-compact-lite-contract-and-consumer-compatibility`). Plan paths were normalized to change-relative (`specs/<domain>/spec-prepared.md`, `decisions/adr-00X.md`); hashes unchanged. That terminal journal was preserved at `.ospec/archive-tx-history/phase-envelope-state-mechanical-projection-failed-paths-2026-09-11`. Both rejections were fail-closed preflights with zero live mutations; the successful run is receipt `plan_sha256: sha256:3e95f7d5354997c67b3dd668eeeb731465fc4fd33db4b056a8e71d268f9cbca1`, `outcome: success`, exit 0.
- Scope guard: no git commit/push, no version bumps, no `docs/` changes beyond the four ADR promotions, no review actors launched.
- Lint waiver (state.yaml line-length): the generic 80-char YAML style rule cannot apply to this generated file class — `baseline_fingerprints` entries are ≥87 chars by construction, the runtime parsers (`readArchiveGateFacts`, `sumQuestionsAsked`, `readPersistedRoute` in `scripts/lib/archive-transaction.js`) are strictly line-oriented, and already-archived changes carry the same violations (39–54 long lines each). Lines introduced by this phase were made compliant; pre-existing generated content was left untouched to preserve parser compatibility and audit integrity. Repo-level gate re-proven green after edits (`node scripts/check.js` exit 0).

## Cost

No per-phase cost data was recorded for this change
(`.ospec/session/phase-envelope-state-mechanical-projection/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0

## Memory

Artifact store mode is `openspec`; Engram unavailable this session — no memory observation IDs. This file is the durable archive record.

## Risks

None identified. All verification criteria met without warnings; canonical merges are additive at requirement granularity; post-commit receipt and target state were re-verified (canonical requirements present, ADR targets present, origin removed, archive complete).

## Rollback

Strategy: staging-rename (archive transaction runtime handles atomic move with staging directory and fallback; `--rollback` supported against the transaction journal).
