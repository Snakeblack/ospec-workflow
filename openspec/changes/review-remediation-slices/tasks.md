# Tasks: Slice-Scoped 4R Review Remediation

## Spec/Design Reconciliation

| Requirement / scenarios | Priority | Design allocation | Status |
|---|---|---|---|
| REQ-routing-004: monotonic resolution, explicit cross-slice regression, genesis escape | MUST | `review-lineage.js` slice reducer, manifest/path invariants | covered-by-design |
| REQ-routing-005: unknown outcome, O4.2 migration, read-only archive | MUST | migrator/reconciliation in `review-lineage.js` and gate adapter | covered-by-design |
| REQ-agents-013: selected specialists and no discovery relaunch | MUST | `review-gate-state.js`, orchestration contracts | covered-by-design |
| REQ-agents-015: independent exhaustion and explicit successor authority | MUST | per-slice counters and `createSuccessor` validation | covered-by-design |
| REQ-skills-007: unrelated concern, passed-slice preservation, relaunch rejection | MUST | correction skill/agent contracts and parity mirrors | covered-by-design |
| REQ-hooks-001: six-agent allowlist, fallbacks, relaunch, no-change, fail-safe | MUST | JS/Go hooks, stores, shared fixtures | covered-by-design |

All 19 MUST scenarios across the four specs have an explicit design allocation; no missing-design or unresolved ambiguity remains.

## Review Workload Forecast

Estimated changed lines: 900–1,300 including source, Go mirror, tests, contracts, generated targets, and migration fixture.
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High
Delivery strategy: exception-ok
Suggested split: autonomous cognitive work units below, implemented in one size-exception execution.

## Suggested Work Units

| Unit | Goal | Verification |
|---|---|---|
| 1 | Slice data model, manifest validation, reducer transitions, idempotent v1/O4.2 migration | reducer tests and fixture digest checks |
| 2 | Monotonic dispatch/continuation adapter and successor/relaunch authority | gate-state tests and contract assertions |
| 3 | Correction contracts plus `skills/_shared` and `rules/` mirrors | source/mirror parity tests |
| 4 | JS/Go phase-cost allowlist, normalization, relaunch stores | JS, Go, and byte-parity fixtures |
| 5 | O4.2 state write and generated target regeneration | migration snapshot and focused/full suites |

## Phase 1: Slice Model and Migration

- [x] 1.1 Add remediation-v2 schema, canonical manifest partitioning, slice IDs, evidence/path digests, and immutable per-slice budgets in `scripts/lib/review-lineage.js` [REQ-routing-004, REQ-agents-015].
- [x] 1.2 Add RED tests for active-slice transitions, path/finding subset checks, monotonic pass, explicit impacted-slice regression, exhaustion isolation, and successor authority in `scripts/review-lineage.test.js`.
- [x] 1.3 Implement `migrateReviewLineage(v1, manifest)` with pending/unknown fail-closed checks, additive/idempotent audit fields, unchanged legacy history, and deterministic O4.2 mapping; add `scripts/fixtures/review-lineage/o4-2-gen4-v1.json` [REQ-routing-005].
- [x] 1.4 GREEN/triangulate migration twice against fixture, malformed manifests, unknown operations, and legacy digest byte preservation; refactor invariant helpers only after tests pass.

## Phase 2: Monotonic Decisions and Dispatch

- [x] 2.1 Update `scripts/lib/review-gate-state.js` to require legal migration/reconciliation, select one actionable slice, dispatch only its frozen IDs/paths, and keep downstream gates read-only [REQ-routing-005, REQ-agents-013].
- [x] 2.2 Add RED→GREEN tests in `scripts/review-gate-state.test.js` for two-specialist selection, no specialist relaunch, active-only validation, passed-slice preservation, interruption blocking, and archive identity checks [REQ-agents-013].
- [x] 2.3 Enforce explicit `new-candidate|new-scope|new-discovery-authority` approval in successor creation and reject exhaustion/retry reasons [REQ-agents-015].

## Phase 3: Contracts and Mirrors

- [x] 3.1 Update `skills/_shared/gate-4r-review.md`, `agents/sdd-orchestrator.agent.md`, `skills/review-correction/SKILL.md`, and `agents/review-correction.agent.md` with persist-before-dispatch, active-slice inputs, regression grammar, migration, and read-only continuation [REQ-routing-004, REQ-routing-005, REQ-skills-007].
- [x] 3.2 Synchronize `rules/sdd-common.instructions.md` and `rules/sdd-openspec.instructions.md`; add RED→GREEN contract/parity coverage in `scripts/review-correction-contract.test.js` and `scripts/selective-4r-parity.test.js` [REQ-skills-007].

## Phase 4: JS/Go Phase-Cost Telemetry

- [x] 4.1 Add failing JS/Go tests and fixtures for the exact six review allowlisted agents, invented-review rejection, UTF-8 token fallbacks, status/tier/duration defaults, no active change, and fail-safe append errors [REQ-hooks-001].
- [x] 4.2 Update `scripts/hooks/subagent-stop.js`, `internal/hooks/subagentstop.go`, `scripts/lib/ospec-state.js`, and `internal/store/store.go` to derive identical phase keys and mark relaunch only from prior successful same-phase rows, preserving all `sdd-*` behavior.
- [x] 4.3 Add/refresh `scripts/hooks/subagent-stop.test.js`, `internal/hooks/subagentstop_test.go`, `internal/store/store_test.go`, `scripts/hooks/parity-contract.test.js`, and `internal/testdata/parity/subagent-stop-phase-cost-review-*.json`; triangulate byte-identical outputs.

## Phase 5: Migration Write, Generated Targets, and Verification

- [x] 5.1 After reducer tests pass, snapshot and migrate `openspec/changes/strict-tdd-evidence-remediation-fast-path/state.yaml`; assert idempotence, unchanged historical digests, expected four O4.2 slices, and no successor [REQ-routing-005].
- [x] 5.2 Regenerate `dist/{claude,claude-marketplace,vscode,github-copilot,opencode,codex}/**` using existing build tooling; never hand-edit generated files.
- [x] 5.3 Run focused JS/Go suites, then `npm test` and `go test ./...`; record RED/GREEN/TRIANGULATE/REFACTOR evidence for every task in `apply-progress.md`.

## Verification-failure remediation — 2026-07-22

All prior checkmarks were revalidated after the verify FAIL. Tasks 1.1–1.4, 2.1–2.3, 3.1–3.2, and 5.1–5.3 remain `[x]` only because the focused RED probes, full JavaScript suite, and Go suite now pass with the repaired behavior; the historical grouped evidence remains audit context and is superseded by the per-task evidence appended to `apply-progress.md`.

## Verify-FAIL remediation — 2026-07-25 (four CRITICAL code-bugs)

`sdd-verify` returned FAIL (16/19 MUST) against the 2026-07-22 batch. The following four
remediation items fix ONLY the CRITICAL findings in `verify-report.md`; tasks 1.1–5.3 above
remain `[x]` and are not reopened. Full RED/GREEN evidence and immutable digests are in the
`## Verify-FAIL remediation — 2026-07-25` section of `apply-progress.md`.

- [x] R-CRIT-1 Pin top-level `correction_budget.used_lines`/`failed_attempts` in
  `verifyLineageInvariants` so a committed reconciliation cannot invent budget consumption;
  re-verified the v2 slice-level `not_started` restore path already returns an actionable
  `ready` slice (was masked by R-CRIT-3's bug, not actually broken) [REQ-routing-005].
- [x] R-CRIT-2 Re-migrate the live `openspec/changes/strict-tdd-evidence-remediation-fast-path/state.yaml`
  lineage with the fixed migrator so `remediation_migration.legacy_failed_attempts` is seeded and
  the canonical persisted state (not only an in-memory fixture clone) passes
  `validateLineageForGate` [REQ-routing-005].
- [x] R-CRIT-3 Remove the divergent `legacyAuthority` digest source; unify `source_digest`
  computation on `migrationSourceAuthority`, extended to bind the frozen slice manifest, so
  relabeling `root_cause_key` and self-consistently recomputing `manifest_digest` fails
  provenance validation instead of yielding `lineage-approved` [REQ-routing-004, REQ-routing-005].
- [x] R-CRIT-4 Correct the Strict TDD evidence format in `apply-progress.md`: authoritative
  `✅ Written`/`✅ Passed` RED/GREEN cells bound to real captured probe output and sha256 digests,
  captured before the corresponding GREEN fix.

## Verify-FAIL remediation — 2026-07-25 (CRIT-5 code-bug)

`sdd-verify` re-verified the four fixes above (19/19 MUST) but found a fifth new CRITICAL
introduced within this same session: root-level `models.yaml` had a duplicated `agents:`
mapping block, breaking `parseModels` and causing all 69 `npm test` failures. The prior
apply-progress.md batch incorrectly described these as pre-existing baseline noise; that
narrative is corrected in `apply-progress.md`'s `## CRIT-5 remediation` section.

- [x] R-CRIT-5 De-duplicate `models.yaml`: remove the accidental second `agents:` block
  and its duplicated trailing comment header, keeping the single intentional tier-policy
  remapping (`premium`/`default`/`cheap` reassignments, `_default: default`) and the
  untouched `tiers:` table. Re-ran `npm test` (1424/1426 pass, 0 fail) and
  `node --test scripts/selective-4r-parity.test.js` (3/3 pass) to confirm the fix.

## Checklist Status Legend

- `[ ]` Not implemented yet  `[~]` Implemented, verification pending  `[x]` Implemented and verified
