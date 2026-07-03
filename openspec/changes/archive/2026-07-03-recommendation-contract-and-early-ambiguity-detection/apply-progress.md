# Apply Progress: recommendation-contract-and-early-ambiguity-detection

**Mode**: Strict TDD
**Delivery**: `size:exception` (approved — `state.yaml` approvals ledger, `delivery-strategy-001`, `applies_to: [sdd-tasks, sdd-apply]`). This is a single batch covering all 6 phases of `tasks.md`.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes/Rationale |
|------|-----------|-------|-------------|-----|-------|-------------|----------|------------------|
| 1.1–1.7 | `scripts/recommendation-ambiguity-contract.test.js` | Contract (prose-invariant) | None (new file) | ✅ 9/9 assertions failed pre-edit (confirmed via `node --test`) | — | — | — | Mirrors `scripts/assumption-ledger-contract.test.js` exactly: reads source `.md`, asserts prose landmarks, no runtime code |
| 2.1–2.4 | same | Contract | Phase-1 RED test | (see above) | ✅ 3/3 §D assertions pass after editing `sdd-phase-common.md` §D (blocker_type field+table, description contract, reason-cost, next_question scope) | — | — | Added `blocker_type` bullet + 4-row enum table; added Recommended Option Description Contract subsection; updated embedded JSON example |
| 3.1–3.6 | same | Contract | Phase-2 GREEN | (see above) | ✅ 9/9 total assertions pass after orchestrator + sdd-apply + baseline edits | — | — | Intent Restatement subsection inserted before `### Change Classification`; `Verification Failure Routing` renamed to `Failure & Blocker Routing` with design-mismatch/spec-change-required routing; `sdd-apply/SKILL.md` Step 4 + Rules gained the `blocked: design-mismatch` line + cosmetic exclusion; baseline `agents/spec.md` §6.1 gained the `blocker_type` row |
| 4.1–4.4 | same | Contract | Phase-3 GREEN | n/a (sweep, no new assertions) | ✅ all 9 assertions still pass after sweep | — | — | Fixed non-conformant `recommended: true` examples: orchestrator Review Workload Guard, Sub-Agent Clarification Contract, Delivery Strategy `ask-on-risk`; plus `gate-archive-quality.md`, `dispatch-lifecycle-hooks.md`, `route-brownfield.md`, `sdd-clarify/SKILL.md` template. Grepped `agents/`, `skills/`, `commands/`, `profiles/` — no other embedded `question_gate` examples found in `commands/`/`profiles/` |
| 5.1–5.3 | n/a (mechanical) | Integration | 4-target build scripts | n/a | ✅ all 4 targets (`claude`, `vscode`, `github-copilot`, `opencode`) regenerated with 0 errors, 0 warnings | ✅ contract test still green post-regen | n/a | `npm test` as a single command fails due to a **pre-existing, unrelated** failure in `scripts/hooks/session-start.test.js` / `pre-tool-use.test.js` (17 assertions) — confirmed via `git stash` that these fail identically before any edit in this session |
| 6.1–6.3 | same | Contract | Full GREEN suite | n/a | n/a | ✅ re-read all 3 change-local specs against final prose; every MUST scenario has a verifiable landmark | ✅ no redundant `blocker_type` table beyond the two mandated locations; fixed one dangling cross-reference in `gate-archive-quality.md` after the section rename | This progress file |

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/recommendation-ambiguity-contract.test.js` | Created | Prose-invariant contract test (9 assertions across §D, orchestrator, sdd-apply, baseline agents/spec.md) |
| `skills/_shared/sdd-phase-common.md` | Modified | §D: added `blocker_type` OPTIONAL field + 4-value enum table; added "Recommended Option Description Contract" subsection (rationale/trade-off/reversibility + reason-cost, scoped to `question_gate.options[]`, excludes `next_question`); updated embedded JSON example to comply |
| `agents/sdd-orchestrator.agent.md` | Modified | Added `#### Intent Restatement (pre-classification)` subsection before `### Change Classification`; renamed `### Verification Failure Routing` → `### Failure & Blocker Routing` and added `design-mismatch → sdd-design` / `spec-change-required → sdd-spec` blocker routing; fixed 3 non-conformant `recommended: true` examples (Delivery Strategy `ask-on-risk`, Review Workload Guard "Chained PRs", Sub-Agent Clarification Contract "Option A") |
| `skills/sdd-apply/SKILL.md` | Modified | Step 4 task loop: added `blocked: design-mismatch` line parallel to `spec-change-required`; Rules section: added mirrored rule with the cosmetic-deviation exclusion |
| `openspec/specs/agents/spec.md` (baseline) | Modified | §6.1 envelope field table: added `blocker_type` row (enum of 4 values, OPTIONAL, SHOULD be present when `status: blocked`). This is the only baseline edit delivered in this apply batch — the 3 remaining ADDED requirements in the change-local `specs/agents/spec.md` delta sync to baseline at `sdd-archive`, per design D3/D4 and the delta's own mandate |
| `skills/_shared/gate-archive-quality.md` | Modified | Fixed non-conformant `recommended: true` "Fix and re-run verify" example description; fixed dangling cross-reference to the renamed orchestrator section |
| `skills/_shared/dispatch-lifecycle-hooks.md` | Modified | Fixed non-conformant `recommended: true` "Retry" example description |
| `skills/_shared/route-brownfield.md` | Modified | Fixed non-conformant `recommended: true` "Run /sdd-baseline now" example description |
| `skills/sdd-clarify/SKILL.md` | Modified | Updated generic `question_gate` template placeholder + added pointer to the Recommended Option Description Contract |
| `dist/**` (4 targets) | Regenerated | `npm run build:claude`, `build:vscode`, `build:copilot`, `build:opencode` — all succeeded, 0 errors/0 warnings |

## Deviations from Design

None — implementation matches design. One design-mismatch-relevant note (not a blocker, per the change's own cosmetic-exclusion rule): the design listed approximate line numbers (~100, ~134, ~228, ~341-343, ~345, ~392-395, ~416, ~613, ~634-636) for each edit target; actual line numbers had drifted slightly by the time of editing (pre-existing content shifted a few lines from prior commits). This is cosmetic line-number drift, not a structural contradiction of the design's intent — every named section, pattern, and example described in `design.md` existed exactly as described, just at slightly different line offsets. Applying the change's own `design-mismatch` rule to itself: this qualifies as the "cosmetic deviation" carve-out (equivalent target, same contract), so it was not escalated as `blocked: design-mismatch`.

One additional non-mandated but consistent fix: `skills/_shared/gate-archive-quality.md` contained a prose cross-reference literally named "Verification Failure Routing above", which would have gone stale after the orchestrator section rename (task 3.2). Updated it to point at the new heading (`Failure & Blocker Routing`) to avoid introducing a dangling reference — this is a documentation-consistency fix directly caused by an in-scope rename, not new scope.

## Issues Found

`npm test` (`node scripts/check.js`) fails as a single command because `scripts/check.js` runs native Node tests first and aborts before reaching the 4-target generation step. The native test run fails due to 17 pre-existing, unrelated assertion failures in `scripts/hooks/session-start.test.js` and `scripts/hooks/pre-tool-use.test.js` (git-collaboration-guard, agent-shield, token-budget-advisor hooks). These were confirmed to fail **identically** before any edit made in this apply batch, via `git stash` / `git stash pop` around a clean run of just those two files. None of the files touched by this change are hooks-related. This is out of scope for this change and is flagged as a pre-existing risk, not introduced by this batch.

Separately verified (since `check.js` could not reach that step in a single run): `node --test scripts/docs-lint.test.js scripts/recommendation-ambiguity-contract.test.js scripts/assumption-ledger-contract.test.js scripts/federation-baseline-contract.test.js` → 38/38 pass. All 4 targets manually regenerated via their `npm run build:*` scripts → 0 errors, 0 warnings each.

## Remaining Tasks

None. All 6 phases / all tasks in `tasks.md` are complete for this apply batch.

## Workload / PR Boundary

- Mode: single PR with `size:exception` (per `delivery-strategy-001` approval)
- Current work unit: N/A (single-PR exception, not chained/stacked)
- Boundary: this batch starts from an empty apply-progress (fresh first batch) and ends with all 6 phases of `tasks.md` complete, including dist regeneration for all 4 targets
- Estimated review budget impact: source-only diff (excluding gitignored `dist/`) covers 9 files across the two logical commits described in `design.md`/`tasks.md` (A2: `sdd-phase-common.md` + example fixes; A3: orchestrator + sdd-apply + baseline spec.md), consistent with the tasks.md forecast of `400-line budget risk: High` driven mainly by mechanical `dist/` regeneration, not source ambiguity

## Status

All tasks complete (Phases 1–6). Ready for `sdd-verify`, with the pre-existing unrelated hook-test failure flagged as a known risk for the verify phase to weigh (not caused by this change).

---

## Follow-up Batch: 4R Review Fix (Phase 7 — 5 WARNING findings)

**Context**: `sdd-verify` returned `PASS WITH WARNINGS`; the subsequent 4R review gate returned 0 BLOCKER, 0 CRITICAL, 5 WARNING, 1 SUGGESTION. This batch fixes all 5 WARNINGs and addresses the SUGGESTION. No BLOCKER/CRITICAL existed, so this batch does not reopen the verify verdict.

### TDD Cycle Evidence (appended, does not replace the table above)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes/Rationale |
|------|-----------|-------|-------------|-----|-------|-------------|----------|------------------|
| 7.1 | `scripts/recommendation-ambiguity-contract.test.js` (new tests `1.7 ×2`) | Contract (prose-invariant) | Full 43-test suite prior to this batch | ✅ 5 new/modified assertions failed pre-edit (confirmed via `node --test`) | ✅ pass after adding the naming-convention note to `sdd-phase-common.md` §D and `agents/spec.md` §6.1 | — | — | Note text: existing values mix snake_case/kebab-case for historical reasons; new values SHOULD use kebab-case. No existing enum value renamed (would be a breaking behavior change, explicitly out of scope per the finding) |
| 7.2 | same (new test `1.4` distinguishing clause) | Contract | same | (see above) | ✅ pass after inserting the clarifying sentence into orchestrator `### Failure & Blocker Routing`, right before the `blocker_type` routing bullets | — | — | Distinguishes verify-time post-hoc origin tags (`design-gap`/`spec-gap`) from apply-time live blockers (`blocker_type: design-mismatch`/`spec-change-required`) |
| 7.3 | same (new tests `1.5 ×2`, Step 4 + Rules) | Contract | same | (see above) | ✅ pass after adding "persist partial progress on already-completed tasks in this batch" to both `sdd-apply/SKILL.md` Step 4 bullets and both Rules bullets for `spec-change-required` and `design-mismatch`, mirroring the existing `workload-escalation` clause | — | — | Symmetric fix applied to 4 bullet locations within `sdd-apply/SKILL.md` (Step 4 ×2, Rules ×2) |
| 7.4 | same (4 new tests `1.4b`) | Contract | same | n/a (net-new coverage, no prior assertion to be RED against — the fixed prose already existed from the earlier apply batch) | ✅ all 4 new tests pass immediately since the sweep prose was already correct; they now guard against future revert | — | — | Anchors: `dispatch-lifecycle-hooks.md` "Retry" description, `gate-archive-quality.md` "Fix and re-run verify" description, `route-brownfield.md` "Run /sdd-baseline now" description, `sdd-clarify/SKILL.md` pointer sentence |
| 7.5 | same (modified test `1.3`) | Contract | same | ✅ N/A — modified an existing passing assertion to scope it; verified the narrower scope still passes against the real section and would fail if that section were reverted (heading-anchored slice) | ✅ pass | — | — | Slices `content` from `#### Recommended Option Description Contract` to the next `### ` heading (`### Assumption Materiality Rule`) before checking for `reversib` |
| 7.6 | same (split test `1.5`) | Contract | same | n/a (refactor of an existing passing test into two) | ✅ both pass independently | — | — | SUGGESTION addressed: Step 4 and Rules `blocked: design-mismatch` presence now asserted separately instead of one whole-file check |
| 7.7 | n/a (verification) | Integration | — | — | ✅ `node --test scripts/recommendation-ambiguity-contract.test.js scripts/docs-lint.test.js scripts/assumption-ledger-contract.test.js scripts/federation-baseline-contract.test.js` → 48/48 pass | ✅ re-read all 5 fix locations against final prose | n/a | 4 dist targets (`claude`, `vscode`, `github-copilot`, `opencode`) regenerated — 0 errors, 0 warnings each |

### Files Changed (this batch)

| File | Action | What Was Done |
|------|--------|---------------|
| `skills/_shared/sdd-phase-common.md` | Modified | Added a one-line naming-convention note directly after the `blocker_type` enum table (Finding 1): existing values predate a naming convention (mixed snake_case/kebab-case); new values SHOULD use kebab-case. No rename of live values. |
| `openspec/specs/agents/spec.md` | Modified | Same naming-convention note added after the §6.1 envelope field table (Finding 1), mirroring the wording in `sdd-phase-common.md`. |
| `agents/sdd-orchestrator.agent.md` | Modified | Added a clarifying sentence in `### Failure & Blocker Routing`, immediately before the `blocker_type` routing bullets, distinguishing verify-time post-hoc origin tags (`design-gap`/`spec-gap`) from apply-time live blockers (Finding 2). |
| `skills/sdd-apply/SKILL.md` | Modified | Step 4 (both `spec-change-required` and `design-mismatch` bullets) and Rules section (both mirrored bullets) now require "persist partial progress on already-completed tasks in this batch" before the STOP, matching the existing `workload-escalation` pattern (Finding 3). |
| `scripts/recommendation-ambiguity-contract.test.js` | Modified | (a) Scoped the reversibility assertion in test 1.3 to the `#### Recommended Option Description Contract` section only, instead of whole-file (Finding 5). (b) Split the old combined `1.5` design-mismatch-presence test into two independent Step-4/Rules assertions (SUGGESTION). (c) Added new tests: `1.7` ×2 for the naming-convention note; `1.4` for the verify-vs-apply distinguishing sentence; `1.5` ×2 for the persist-partial-progress clause; `1.4b` ×4 for the previously-uncovered sweep files (`dispatch-lifecycle-hooks.md`, `gate-archive-quality.md`, `route-brownfield.md`, `sdd-clarify/SKILL.md`) (Finding 4). Test count grew from 9 to 19 in this file (48 total across the 4-file targeted suite). |
| `dist/**` (4 targets) | Regenerated | `npm run build:claude`, `build:vscode`, `build:copilot`, `build:opencode` — all succeeded, 0 errors/0 warnings. |

### Deviations from Design

None. This batch is a review-fix follow-up, not a new design decision. All 5 fixes match the FIX instructions given for each finding verbatim (no renaming of live `blocker_type` values, per Finding 1's explicit exclusion).

### Issues Found

None new. The pre-existing, unrelated `npm test` single-command failure (17 assertions in `scripts/hooks/session-start.test.js` / `pre-tool-use.test.js`) remains out of scope and untouched by this batch; not re-verified here since it was already confirmed pre-existing in the prior apply batch and none of this batch's 5 files touch hooks.

### Remaining Tasks

None. All 5 WARNING findings and the 1 SUGGESTION from the 4R review gate are resolved.

### Workload / PR Boundary

- Mode: single PR with `size:exception` (same approval as the original batch, `delivery-strategy-001`)
- Current work unit: Phase 7 (post-4R-review fix batch), appended to the same change
- Boundary: starts from the 5 WARNING + 1 SUGGESTION findings in `verify-report.md`'s 4R review gate output; ends with all 5 files edited, 48/48 targeted tests green, and all 4 dist targets regenerated
- Estimated review budget impact: small — 4 source `.md` files with single-sentence/clause insertions each, plus one test file with net +10 test blocks; mechanical `dist/` regeneration dominates line count as before

### Status

Phase 7 complete. All 5 WARNING findings + 1 SUGGESTION from the 4R review gate resolved. `scripts/recommendation-ambiguity-contract.test.js` grew from 9 to 19 assertions (48/48 total in the targeted 4-file suite). Ready for the orchestrator to decide whether to re-run `sdd-verify` or proceed directly to `sdd-archive` given no BLOCKER/CRITICAL existed.
