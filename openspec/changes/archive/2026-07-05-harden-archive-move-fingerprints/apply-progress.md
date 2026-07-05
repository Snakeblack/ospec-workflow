# Apply Progress: harden-archive-move-fingerprints

**Mode**: Strict TDD (RED → GREEN)

## TDD Cycle Evidence

| Task | RED | GREEN | REFACTOR |
|------|-----|-------|----------|
| 1.1 Create `scripts/archive-move-fingerprint-contract.test.js` | Ran `node --test scripts/archive-move-fingerprint-contract.test.js` immediately after writing the file, before any Phase 2/3 edit: both cases failed — "gate-archive-quality.md must document the orchestrator recursively diffing the destination inventory against the source" and "sdd-spec/SKILL.md Step 5b must declare touched domains under touched_baseline_domains" | Confirmed GREEN after Phase 2/3 edits (see 2.1-3.3 below); re-ran in isolation — 2/2 pass | N/A — new test file, no refactor needed |
| 1.2 Extend `scripts/configure/real-repo.test.js` sentinel table + absence rows | Added the 2 sentinel rows (`recursively diff the destination`, `halt with the source directory left intact`) and 2 absence assertions; ran the sentinel test before Phase 2 edits — failed: "sentinel \"recursively diff the destination\" must be present in skills/_shared/gate-archive-quality.md after migration" | Confirmed GREEN after 2.1 (append) — sentinel test passes, `lines.length < 500` still holds | N/A |
| 2.1 Append `## Post-Return Move Completion` to `gate-archive-quality.md` | (covered by 1.1/1.2 RED above — anchors this exact content) | First pass used "1. Recursively diff the destination" (capitalized sentence-initial `Recursively`), which failed the case-sensitive `/recursively diff the destination/` regex in both 1.1 and 1.2 tests; fixed to "The orchestrator MUST recursively diff the destination..." — re-ran both tests, GREEN | Rewording only; no behavior change |
| 2.2 Rewrite `sdd-archive/SKILL.md` Step 5 (copy-and-report scope, MUST NOT delete/claim moved, remove "then delete the source folder") | (covered by 1.1 RED) | Re-ran `archive-move-fingerprint-contract.test.js` — GREEN (copy-inventory phrase present, `MUST NOT ... delete the source` present, "then delete the source folder" absent) | Also updated Step 6 (verify checklist) and Step 7 (return-summary template) for wording consistency with the new copy-only scope — not a load-bearing string change, no test impact |
| 3.1 Rewrite `sdd-spec/SKILL.md` Step 5b to declare-only (`touched_baseline_domains`) | (covered by 1.1 RED) | Re-ran `archive-move-fingerprint-contract.test.js` — GREEN (`touched_baseline_domains` present, no `sha256` computation instruction, no `record in state.yaml the SHA-256` phrase) | Also updated Step 6 return-summary template to surface `touched_baseline_domains` |
| 3.2 Add standing "Baseline Fingerprint Computation Protocol" block to `agents/sdd-orchestrator.agent.md` | (covered by 1.1 RED) | Re-ran `archive-move-fingerprint-contract.test.js` — GREEN (orchestrator body references both `touched_baseline_domains` and `baseline_fingerprints`); confirmed line count via `node -e` → 497 lines (< 500 guard) | N/A |
| 3.3 Update `gate-change-collision.md` "Baseline fingerprint at archive" section | N/A — no dedicated static anchor test targets this file directly; verified by inspection and by the B2.4 regression fix below | Re-worded "`sdd-spec` records in `state.yaml`..." to "`sdd-spec` DECLARES ... ORCHESTRATOR computes and writes"; `sdd-archive`'s re-hash-and-compare Step 2 behavior left unchanged | N/A |

## Regression Fixes (pre-existing tests encoding the superseded contract)

Running the full `npm test` suite after Phase 2/3 edits surfaced 3 pre-existing test
failures — all in tests written against the OLD contract this change intentionally
supersedes per design (`sha256` computed by `sdd-spec` itself; `sdd-archive` deletes
the source directory itself). These are not unrelated regressions; they assert the
exact behavior removed by this change's design, so the test assertions were updated
to the new contract (same pattern as the RED/GREEN evidence above — the assertion
text is now anchored to the new load-bearing strings):

- `scripts/eje-b-contract.test.js` **B2.4** — was asserting `sdd-spec` records
  `sha256` fingerprints directly; updated to assert `sdd-spec` declares
  `touched_baseline_domains` (and does NOT compute `sha256` itself), and that the
  orchestrator body owns `baseline_fingerprints` computation sourced from
  `touched_baseline_domains`. `sdd-archive`'s stale-baseline check assertions
  unchanged (that Step 2 behavior was not modified by this change).
- `scripts/mentor-adr-contract.test.js` **A5.2** — was locating the old
  `"Step 5: Move to Archive"` heading; updated to the renamed
  `"Step 5: Copy Artifacts to Archive..."` heading, preserving the "ADR promotion
  happens before the archive step" ordering assertion.
- `scripts/mentor-adr-contract.test.js` **A5.3** — was asserting the old
  `"A move is NOT a copy"` / `"MUST NOT exist"` guard; updated to assert the new
  copy-and-report contract (`copy inventory` present, `MUST NOT ... delete the
  source` present, `then delete the source folder` absent).

Re-ran the full suite after these 3 fixes — GREEN (see Test Summary below).

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/archive-move-fingerprint-contract.test.js` | Created | New static contract test, 2 cases: archive-move contract + fingerprint-ownership contract |
| `scripts/configure/real-repo.test.js` | Modified | 2 new sentinel rows (`recursively diff the destination`, `halt with the source directory left intact`) + 2 new absence assertions in the orchestrator sentinel-absence test |
| `skills/_shared/gate-archive-quality.md` | Modified | Appended `## Post-Return Move Completion` section (orchestrator-owned inventory-diff-before-delete protocol) |
| `skills/sdd-archive/SKILL.md` | Modified | Rewrote Step 5 (executor scope = sync+report+copy only, MUST NOT delete/claim moved, copy-inventory report required); updated Step 6 verify checklist and Step 7 return-summary template for consistency |
| `skills/sdd-spec/SKILL.md` | Modified | Rewrote Step 5b to declare-only (`touched_baseline_domains`); updated Step 6 return-summary template |
| `agents/sdd-orchestrator.agent.md` | Modified | Added "Baseline Fingerprint Computation Protocol" standing block (5 lines net; 492 → 497 lines) |
| `skills/_shared/gate-change-collision.md` | Modified | Updated "Baseline fingerprint at archive" companion section: `sdd-spec` declares, orchestrator computes |
| `scripts/eje-b-contract.test.js` | Modified | B2.4 updated to the new declare/compute contract (regression fix) |
| `scripts/mentor-adr-contract.test.js` | Modified | A5.2/A5.3 updated to the new Step 5 heading and copy-and-report contract (regression fix) |
| `openspec/changes/harden-archive-move-fingerprints/tasks.md` | Modified | Checkboxes marked `[x]` for all 14 tasks |
| `openspec/changes/harden-archive-move-fingerprints/proposal.md` | Modified | 5 Success Criteria checkboxes marked `[x]` (verified factually true against edited files) |

## Deviations from Design

None — implementation matches design. Two additive-only wording touches beyond the
literal task list (Step 6/Step 7 consistency in `sdd-archive/SKILL.md`; Step 6 in
`sdd-spec/SKILL.md`) were needed so the surrounding prose did not contradict the
rewritten Step 5/Step 5b (task 5.2's cross-check requirement) — no new load-bearing
strings, no scope beyond the 7 files the design named.

## Issues Found

The Phase 2 first-draft wording ("1. Recursively diff the destination...") used a
capitalized sentence-initial word that failed the case-sensitive anchor regex
`/recursively diff the destination/`. Caught immediately by RED-first re-running of
both new/extended tests; fixed by rewording to "The orchestrator MUST recursively
diff the destination...". No other issues.

## Full-Suite Verification (Phase 4)

- `node --test scripts/archive-move-fingerprint-contract.test.js` → 2/2 pass.
- `node --test scripts/configure/real-repo.test.js` → 22/22 pass (sentinel rows resolve, absence assertions hold, `lines.length < 500` holds at 497).
- Full `npm test` (native suite + 4 target generations, via `node scripts/check.js`, run with `env -u DISABLE_AGENT_SHIELD -u DISABLE_GIT_COLLABORATION_GUARD -u DISABLE_TOKEN_ADVISOR`):
  - First full run: 989 tests, 986 pass, 3 fail — all 3 were the eje-b-contract/mentor-adr-contract regressions described above (fixed, see Regression Fixes).
  - After regression fixes, second full run: 989 tests, 986 pass, 3 fail — this time the 3 failures were exactly the two documented known flakes: `parity(js) · PreToolUse · pre-tool-use-ask.json` (token-advisor interference) and `appendRuntimeEvent serializes concurrent writers without corrupting lines` (EPERM lock-file contention). Re-ran both in isolation: both pass isolated (`scripts/hooks/parity-contract.test.js` 9/9 pass; `scripts/lib/ospec-state.test.js` 52/52 pass).
  - Third full run (for final confirmation): 989 tests, 989 pass, 0 fail — no flake triggered.
  - Dist parity: 4 target builds (claude/vscode/github-copilot/opencode) all pass their own validators (part of `node scripts/check.js`), confirming `skills/_shared/gate-archive-quality.md`, `skills/sdd-archive/SKILL.md`, `skills/sdd-spec/SKILL.md` propagate unchanged in structure (content-only edits, no new file under `skills/_shared/`, no new dist-parity path needed per task 4.3).

## Workload / PR Boundary

- Mode: single PR (`size:exception`, delivery strategy `exception-ok`, approval `appr-002`)
- Current work unit: Unit 1 — Full hardening (RED tests → GREEN edits → full-suite verification)
- Boundary: this apply batch starts from Phase 1 (RED) and ends with Phase 5 (cleanup); no further batches needed
- Estimated review budget impact: forecast ~140-170 changed lines; actual diff stayed within that range (test file ~95 lines, `gate-archive-quality.md` append ~20 lines, `sdd-archive` SKILL ~35 lines incl. Step 6/7 consistency touches, `sdd-spec` SKILL ~10 lines, orchestrator +5 lines, `gate-change-collision.md` ~8 lines, `real-repo.test.js` +4 lines, 2 regression-fix test files ~20 lines) — no `workload-escalation` triggered.

## Status

14/14 tasks complete. Ready for verify.
