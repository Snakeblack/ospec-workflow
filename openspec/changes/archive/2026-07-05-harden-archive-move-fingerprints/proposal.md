# Proposal: Harden Archive Move + Baseline Fingerprints (Bloque 1.2 / I1)

## Intent

Two SDD phase skills demand capabilities their executor cannot perform, producing real data-loss and false-success risk (bug class I1: "declared contract without enforcement"). (1) `sdd-archive` demands a true folder move ("source MUST NOT exist afterwards") but its agent has no Bash/delete tool. Real evidence tonight (change `wire-sdd-document`): the executor copied only 2 of 12 files and could not delete the source, yet the SKILL frames success at the executor's copy. (2) `sdd-spec` must record `baseline_fingerprints` (SHA-256 of touched baseline specs) but has no execute tool, so every change ends with the orchestrator backfilling hashes plus a repeated per-change assumption. This change formalizes the orchestrator as the owner of both operations, closing the second of four chained Bloque 1 changes.

## Scope

### In Scope
- Codify the ORCHESTRATOR as owner of the archive-folder MOVE: it verifies destination inventory matches source file-by-file (recursive diff) BEFORE deleting the source; a mismatch or copy failure halts with the source intact; deletion is never decided or claimed by the executor.
- Redefine the `sdd-archive` executor responsibility: ends at baseline sync + archive-report + copying artifacts; it never asserts "moved" or self-certifies completion.
- Formalize orchestrator-computed `baseline_fingerprints`: sdd-spec only DECLARES touched baseline domains; the orchestrator computes and writes SHA-256 per domain right after sdd-spec returns. Remove the per-change assumption pattern.
- Two static contract tests anchoring the new instruction strings so drift fails the suite.

### Out of Scope
- Unified capability/contract lint (Bloque 1.4).
- Routing type-coercion (I2) and hook/lock timeouts (I3) — Bloque 1.3.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `agents`: ADD orchestrator-owned archive-move completion with source/destination inventory verification-before-delete; ADD orchestrator-owned baseline-fingerprint computation post-sdd-spec.
- `skills`: MODIFY "Baseline Fingerprint Recording and Verification" so sdd-spec only declares touched domains and the orchestrator records hashes (sdd-archive verification unchanged).

## Approach

Mirror the 1.1 route-federation pattern. Keep any orchestrator addition minimal (a pointer-table row at most, no net inline protocol) given the <500-line guard (currently 492); place the full protocol in `skills/_shared/`. Design decides between a new handler (e.g. `route-archive-move.md`) versus extending `gate-archive-quality.md` (already the archive concern, avoids a new row). Update `skills/sdd-archive/SKILL.md` Step 5 and the `skills/sdd-spec` fingerprint step. Add static contract tests anchoring the load-bearing strings (verification-before-delete, executor-never-deletes, orchestrator-computes-fingerprints).

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `agents/sdd-orchestrator.agent.md` | Modified | Minimal pointer-table row (or reuse existing archive row); no inline protocol |
| `skills/_shared/gate-archive-quality.md` or new handler | New/Modified | Orchestrator-owned move + inventory-diff + fingerprint protocol |
| `skills/sdd-archive/SKILL.md` | Modified | Step 5: executor copies only; never deletes/self-certifies |
| `skills/sdd-spec/SKILL.md` | Modified | Fingerprint step: declare domains only |
| `openspec/specs/agents/spec.md` | Modified | 2 ADDED requirements |
| `openspec/specs/skills/spec.md` | Modified | MODIFIED fingerprint requirement |
| `scripts/*.test.js` | New | Static contract tests anchoring instruction strings |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Orchestrator body crosses 500-line guard | Med | Protocol in `_shared/`; only a pointer row inline; run real-repo.test.js |
| Incomplete move leaves both folders (corrupts active-change discovery) | Low | Delete only after verified inventory match; halt-with-source-intact on mismatch |
| Contract-test strings drift from prose | Med | Anchor exact load-bearing phrases; sentinels excluded from orchestrator body |
| 4-target dist parity | Low | Automatic via `skills/` walk (per 1.1) |

## Rollback Plan

Single-PR change touching prompts/specs/tests only (no runtime code paths). Revert the PR merge commit; specs return to the prior baseline via the archived delta. No data migration or state format change.

## Dependencies

- Bloque 1.1 (`wire-sdd-document`) archived — done (v2.17.0).

## Success Criteria

- [x] `sdd-archive` SKILL Step 5 states the executor copies artifacts and NEVER deletes the source or claims "moved".
- [x] `_shared/` handler defines orchestrator-owned move: recursive source/destination inventory diff BEFORE delete; mismatch/copy-failure halts with source intact.
- [x] sdd-spec fingerprint step only declares touched domains; orchestrator computes/writes `baseline_fingerprints`; per-change assumption removed.
- [x] Two static contract tests anchor the instruction strings and fail on drift.
- [x] `npm test` green across native suite + all 4 target generations; orchestrator body < 500 lines.

**Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention from the `branch-pr` skill — here `feat/harden-archive-move-fingerprints` (already the working branch).
