# Apply Progress: Assumption Ledger + Materiality Criterion

## Batch 1 (first and only apply batch — all 20 tasks completed)

**Mode**: Strict TDD
**Delivery strategy**: `exception-ok` (`size:exception`), cached `state.yaml` approval `delivery-strategy-001`. Single PR, internally ordered as Work Units 1–4 per `tasks.md` Review Workload Forecast.

### Completed Tasks
- [x] 1.1 RED — `scripts/assumption-ledger-contract.test.js` created with Phase 1–4 assertions.
- [x] 1.2 GREEN — `skills/_shared/sdd-phase-common.md` §D: `assumptions` OPTIONAL envelope field, Assumption Entry Schema table (5 fields), Assumption Materiality Rule subsection (after Blocking Question Envelope).
- [x] 1.3 — Phase 1 assertions pass.
- [x] 2.1 RED — orchestrator assertions added (already present in the same test file from 1.1; verified RED before 2.2).
- [x] 2.2 GREEN — `agents/sdd-orchestrator.agent.md`: `### Assumption Ledger Protocol` block added directly after Approval Ledger Protocol.
- [x] 2.3 — Phase 2 assertions pass.
- [x] 3.1 RED — sdd-verify SKILL.md assertions added.
- [x] 3.2 GREEN — `skills/sdd-verify/SKILL.md`: `### Step 2a: Assumption Reconciliation Pre-flight` inserted between Step 2 and Step 3.
- [x] 3.3 GREEN — two Decision Gates rows added (unresolved-low → WARNING; unresolved-high → no escalation).
- [x] 3.4 GREEN — Output Contract section extended to mention `## Assumption Reconciliation`.
- [x] 3.5 RED — report-format.md assertion added.
- [x] 3.6 GREEN — `skills/sdd-verify/references/report-format.md`: `### Assumption Reconciliation` table template added after Issues Found, before Verdict.
- [x] 3.7 RED — sdd-verify.agent.md assertion added.
- [x] 3.8 GREEN — `agents/sdd-verify.agent.md` "Required artifacts" section amended to permit `state.yaml` assumption-resolution writes.
- [x] 3.9 — Phase 3 assertions pass.
- [x] 4.1 RED — vscode self-generated integration assertion added (temp-dir pattern via `runConfigure`).
- [x] 4.2 RED — claude self-generated integration assertion added.
- [x] 4.3 GREEN — `npm run build:claude`, `build:vscode`, `build:copilot`, `build:opencode` all ran clean (0 errors, 0 warnings). Note: `dist/claude-marketplace` contained a stale/incomplete prior build (missing `.claude-plugin/marketplace.json`) that the builder refuses to clobber; removed the gitignored directory before rebuilding (no source-tree impact — `dist/**` is generated and untracked).
- [x] 4.4 — `npm test` (`node scripts/check.js`) ran end-to-end: 788/788 tests passing, 0 failures; all four target builds validated with 0 errors/0 warnings.
- [x] 5.1 — Cross-References in both change-local spec files verified against real paths: `skills/_shared/sdd-phase-common.md`, `openspec/specs/agents/spec.md`, `agents/sdd-orchestrator.agent.md`, `skills/sdd-verify/references/report-format.md`. No stale pointers.
- [x] 5.2 — Proposal Success Criteria all satisfiable: §D documents `assumptions[]` (5 fields + rule) ✓; orchestrator persists into `state.yaml assumptions:` mirroring `approvals:` ✓; `sdd-verify` re-presents checklist with WARNING escalation for material unresolved entries ✓; new spec/delta consistent, no contradiction with baseline Result Envelope Contract ✓; all four dist targets regenerated, parity/self-generation tests (4.1/4.2) pass ✓.

### Files Changed
| File | Action | What Was Done |
|------|--------|----------------|
| `scripts/assumption-ledger-contract.test.js` | Created | 14 prose-invariant + self-generated dist-parity contract tests (pattern mirrors `federation-baseline-contract.test.js`) |
| `skills/_shared/sdd-phase-common.md` | Modified | §D: `assumptions` OPTIONAL field, Assumption Entry Schema table, Assumption Materiality Rule subsection |
| `agents/sdd-orchestrator.agent.md` | Modified | New `### Assumption Ledger Protocol` after Approval Ledger Protocol |
| `skills/sdd-verify/SKILL.md` | Modified | New Step 2a pre-flight; 2 Decision Gates rows; Output Contract mentions `## Assumption Reconciliation` |
| `skills/sdd-verify/references/report-format.md` | Modified | New `### Assumption Reconciliation` table template |
| `agents/sdd-verify.agent.md` | Modified | "Required artifacts" now permits `state.yaml` assumption-resolution writes |
| `openspec/changes/add-assumption-ledger/tasks.md` | Modified | All 20 tasks marked `[x]` |
| `dist/**` (all 4 targets) | Regenerated | `npm run build:claude/vscode/copilot/opencode`; gitignored, not part of review diff |

### TDD Cycle Evidence
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|--------------------|
| 1.1–1.3 | `scripts/assumption-ledger-contract.test.js` | Contract (unit, prose-invariant) | N/A (new file) | ✅ 3/3 written, confirmed failing pre-edit | ✅ 3/3 passed post-edit (`node --test`) | ➖ Single — 3 distinct assertions (field, table, keywords) already exercise 3 independent code paths through the same prose; no further triangulation needed for a markdown-invariant contract | ✅ Cleaned up duplicate "Example:" heading introduced mid-edit | Prose contract, no runtime logic |
| 2.1–2.3 | `scripts/assumption-ledger-contract.test.js` | Contract (unit, prose-invariant) | ✅ 3/3 (Phase 1) still passing before 2.2 edit | ✅ 3/3 written, confirmed failing pre-edit | ✅ 3/3 passed post-edit | ➖ Single — heading/shape/rule are 3 independent assertions | ➖ None needed — block written clean on first pass | Mirrors existing Approval Ledger Protocol shape |
| 3.1–3.9 | `scripts/assumption-ledger-contract.test.js` | Contract (unit, prose-invariant) | ✅ 6/6 (Phase 1+2) still passing before 3.2 edit | ✅ 6/6 written, confirmed failing pre-edit | ✅ 6/6 passed post-edit | ✅ 6 distinct assertions across 3 files (SKILL.md ×4, report-format.md ×1, verify.agent.md ×1) | ➖ None needed | Step 2a placed per design Decision "blocked-first pre-flight" |
| 4.1–4.2 | `scripts/assumption-ledger-contract.test.js` | Integration (self-generated, temp dir) | ✅ 12/12 (Phases 1-3) still passing before running 4.1/4.2 | ✅ 2/2 written referencing `runConfigure` (vscode + claude targets) | ✅ 2/2 passed — both already green because Units 1–3 edit the canonical source files the generator reads; no separate GREEN edit needed | ➖ Single per target — vscode and claude are the two distinct transform paths (agent-passthrough vs orchestrator-as-skill) | ➖ None needed | Self-generates into `os.tmpdir()`-based temp dir per `dist-tests-must-self-generate` convention; never reads gitignored `ROOT/dist` |
| 4.3–4.4 | N/A (build + full suite) | E2E / build validation | ✅ 14/14 (all prior) passing | N/A (no new test) | ✅ 4/4 target builds clean (0 errors/0 warnings); `npm test` → 788/788 passing | N/A | N/A | Removed a stale gitignored `dist/claude-marketplace` dir that predated this batch and blocked the claude build's clobber guard — no source-tree impact |
| 5.1–5.2 | N/A (manual cross-reference check) | Inspection | N/A | N/A | ✅ Verified by reading both spec files' Cross-References sections and the proposal's Success Criteria against completed work | N/A | N/A | Documentation/consistency check, no code |

### Test Summary
- **Total tests written**: 14 (new contract test file)
- **Total tests passing**: 14/14 (new file) + 788/788 (full repo suite after regeneration)
- **Layers used**: Unit/Contract (12), Integration (2), E2E (full suite via `npm test`)
- **Approval tests** (refactoring): None — no refactoring tasks, this change is purely additive prose
- **Pure functions created**: 0 — prompt/contract-markdown change only, no runtime JS behavior changes (per design.md)

### Deviations from Design
None — implementation matches design.md exactly, including the corrected assumption that `skills/sdd-orchestrator/SKILL.md` is generated (not a source mirror requiring a separate edit); dist-parity test 4.2 confirms the generator flows the orchestrator edit through automatically.

### Issues Found
- `dist/claude-marketplace` contained a stale/incomplete prior build (missing `.claude-plugin/marketplace.json`) that caused `npm run build:claude` to fail with a clobber-guard error. This directory is gitignored and unrelated to source changes in this batch; removed it before rebuilding. No source files were affected.

### Workload / PR Boundary
- Mode: single PR (`size:exception`)
- Current work unit: N/A — all 4 suggested work units (1–4) completed in this single batch, as approved
- Boundary: this batch starts from an unedited repo and ends with all 20 tasks (Phases 1–5) complete, all four dist targets regenerated, and the full test suite green
- Estimated review budget impact: within forecast (~300–420 estimated changed lines; actual edits are 5 prose files + 1 new ~230-line test file, `dist/**` excluded from diff as gitignored/generated) — no drift beyond the cached `Medium` risk forecast

### Status
20/20 tasks complete. Ready for verify.

## Batch 2 (4R review gate remediation — 2 WARNING findings, no new spec/design tasks)

**Mode**: Strict TDD
**Scope**: Remediate the two WARNING findings recorded in `state.yaml gates.4r-review-gate.findings_summary` ("0 BLOCKER, 0 CRITICAL, 2 WARNING, 0 SUGGESTION") before re-running `sdd-verify`. Both findings pointed at prose/test precision issues introduced in Batch 1 — no behavior, spec, or design change.

### Findings Remediated
- **Finding 1 (readability, WARNING)** — `skills/sdd-verify/SKILL.md` Execution Steps: the main numbered list (1. Load skills, 2. Retrieve artifacts, [Step 2a inserted], 3. Resolve testing/TDD mode…) reused "1–4" inside Step 2a's own sub-list, colliding with the main list's "3." Renumbered Step 2a's internal sub-list from `1.`–`4.` to lettered `a.`–`d.`, leaving the main numbered sequence (1, 2, 3, 4, …) untouched and unambiguous. No content, meaning, or referenced step numbers changed — only the local list markers inside Step 2a.
- **Finding 2 (reliability, WARNING)** — `scripts/assumption-ledger-contract.test.js`, test `"3.1 · sdd-verify SKILL.md documents the three resolution actions plus leave-unresolved"` (lines 89–95): asserted bare `content.includes("confirm")` / `content.includes("correct")`, which are generic substrings that also match unrelated prose elsewhere in the same file (`"correctness table"` in the Output Contract, `"confirm ... persisted"` in the Quality Gates step) — the assertion would stay green even if Step 2a's actual resolution-actions text were deleted. Verified this concretely (see RED evidence below) before fixing. Rewrote the assertion to anchor on the distinctive multi-word phrase `"exactly three resolution actions"` (unique to Step 2a, confirmed via `grep`) plus the four backtick-quoted action tokens (`` `confirm` ``, `` `correct` ``, `` `promote-to-clarification` ``, `` `leave-unresolved` ``) that only appear in that exact block.

### RED Evidence (Finding 2 — proving the old assertion was non-load-bearing)
Before editing the test, simulated deleting the entire Step 2a resolution-actions block from `skills/sdd-verify/SKILL.md` in a throwaway in-memory string (not written to disk) and re-checked the old bare substrings:
```
confirm still present after strip: true
correct still present after strip: true
```
This confirmed the WARNING finding: the old assertion could not detect removal of the very content it claimed to test.

### GREEN Evidence (Finding 2 — new assertion is load-bearing and still correct)
1. Wrote the new assertion (anchored on `"exactly three resolution actions"` + 4 backtick-quoted tokens).
2. RED check: physically stripped the Step 2a sub-list (a–d) from `skills/sdd-verify/SKILL.md` on disk and re-ran `node --test scripts/assumption-ledger-contract.test.js` — the new test `3.1 · sdd-verify SKILL.md documents the three resolution actions plus leave-unresolved` failed with `AssertionError: must mention the distinctive 'exactly three resolution actions' phrase from Step 2a`, proving the new assertion is genuinely load-bearing.
3. Restored the Step 2a content (re-applied the lettered a–d sub-list from Finding 1's fix) and re-ran the full contract file: 14/14 GREEN, including the fixed test.
4. Ran `npm test` (`node scripts/check.js`) end-to-end: **788/788 tests passing, 0 failures**; all four dist targets (`build:claude`, `build:vscode`, `build:copilot`, `build:opencode`) regenerated clean, 0 errors/0 warnings — confirms the new (stricter) assertion is not accidentally less permissive than intended and the rest of the repo is unaffected.

### Files Changed (Batch 2)
| File | Action | What Was Done |
|------|--------|----------------|
| `skills/sdd-verify/SKILL.md` | Modified | Renumbered Step 2a's internal sub-list from `1.`–`4.` to `a.`–`d.` to remove the ambiguous overlap with the main Execution Steps numbering (Finding 1) |
| `scripts/assumption-ledger-contract.test.js` | Modified | Test `"3.1 · … three resolution actions plus leave-unresolved"`: replaced generic `includes("confirm")`/`includes("correct")` with an anchor on the unique phrase `"exactly three resolution actions"` and the 4 backtick-quoted action tokens (Finding 2) |
| `dist/**` (all 4 targets) | Regenerated | `npm run build:claude/vscode/copilot/opencode`; gitignored, not part of the review diff |

### TDD Cycle Evidence (Batch 2)
| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|--------------------|
| Finding 1 (readability) | N/A (prose renumbering, no assertion changes required) | Inspection | ✅ 14/14 contract tests + 788/788 full suite still passing after the edit | N/A — no new test; markers-only change | ✅ Confirmed no test references the old `1.`–`4.` numbering inside Step 2a; full suite green post-edit | N/A | N/A | Pure list-marker change; Step 2a heading regex (`Step 2a[:.]? Assumption Reconciliation Pre-flight`) and all downstream content assertions unaffected |
| Finding 2 (reliability) | `scripts/assumption-ledger-contract.test.js` | Contract (unit, prose-invariant) | ✅ 13/14 (all other Phase 1–4 assertions) still passing before/after this edit | ✅ Confirmed old assertion was non-load-bearing (in-memory strip simulation); confirmed new assertion fails when the real Step 2a block is physically removed from disk | ✅ 14/14 passed after restoring Step 2a content | ➖ Single — one assertion tightened, same test case, no independent parallel paths needed | ➖ None needed | Self-referential remediation: the test file IS the artifact under change; before/after `npm test` run required and both executed (788/788 GREEN after) |

### Test Summary (Batch 2)
- **Total tests affected**: 1 (tightened), 0 new test cases added
- **Total tests passing**: 14/14 (contract file) + 788/788 (full repo suite after dist regeneration)
- **Regression check**: full `npm test` run before batch (788/788, inherited from Batch 1's last known-green state) and after batch (788/788) — no regressions

### Deviations from Design
None — both fixes are process/quality remediations within the existing Batch 1 implementation; no spec, design, or task scope changed.

### Issues Found
- Confirmed empirically (not just asserted) that the pre-remediation Finding 2 assertion was non-load-bearing: an in-memory strip of the exact prose it claimed to test left both `content.includes("confirm")` and `content.includes("correct")` returning `true`, because those bare substrings also occur in unrelated phrases elsewhere in `skills/sdd-verify/SKILL.md` ("correctness table", "confirm ... persisted"). No other test in the contract file was found to have the same substring-collision weakness (spot-checked; not exhaustively re-audited).

### Workload / PR Boundary
- Mode: single PR (`size:exception`, inherited from Batch 1's cached delivery-strategy approval)
- Current work unit: remediation-only — 2 prose-precision fixes, no new work unit
- Boundary: this batch starts from the Batch 1 "Ready for verify" state and ends with both 4R-gate WARNING findings resolved, full suite green, dist regenerated
- Estimated review budget impact: negligible (~15 changed lines across 2 files; well under the 400-line budget, no drift)

### Status
2/2 WARNING findings remediated. Ready for verify (re-run).
