# Tasks: Harden Archive Move + Baseline Fingerprints (Bloque 1.2 / I1)

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-agents-008 (orchestrator-owned archive-move completion, inventory-diff-before-delete) | MUST | `skills/_shared/gate-archive-quality.md` §"Post-Return Move Completion" (append) | covered-by-design | ADR-001 |
| REQ-agents-009 (orchestrator-computed baseline fingerprints, no per-change assumption) | MUST | `agents/sdd-orchestrator.agent.md` standing inline block (~6 lines, adjacent to Assumption Ledger Protocol) | covered-by-design | ADR-002 |
| skills: Baseline Fingerprint Recording and Verification (MODIFIED — declare-only) | MUST | `skills/sdd-spec/SKILL.md` Step 5b rewrite; `skills/_shared/gate-change-collision.md` companion section consistency edit | covered-by-design | |
| skills: sdd-archive Copy-and-Report Contract (ADDED) | MUST | `skills/sdd-archive/SKILL.md` Step 5 rewrite (copy-inventory list, MUST NOT delete/claim moved) | covered-by-design | |
| Static contract anchors for both requirements | MUST | New `scripts/archive-move-fingerprint-contract.test.js`; new sentinel/absence rows in `scripts/configure/real-repo.test.js` | covered-by-design | ADR-003 |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none (clarify fast-path resolved inventory-match semantics, recovery, and new-domain null handling — see `state.yaml` phases.clarify)

## Review Workload Forecast

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

| Field | Value |
|-------|-------|
| Estimated changed lines | ~140-170 (new test file ~70; `gate-archive-quality.md` append ~35; `sdd-archive` SKILL Step 5 rewrite ~10; `sdd-spec` SKILL Step 5b rewrite ~5; orchestrator standing block ~6; `gate-change-collision.md` consistency edit ~5; `real-repo.test.js` sentinel/absence rows ~8) |
| Delivery strategy | exception-ok (approval `appr-002`) |
| Suggested split | Single PR — prompt/spec/test only, no runtime code path, well under the 400-line budget even with the exception already on file |

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full hardening (RED tests → GREEN edits across gate-archive-quality.md, both SKILLs, orchestrator, gate-change-collision.md → full-suite + 4-target dist verification) | PR 1 (single) | Self-contained; no chain needed; escalate via `workload-escalation` only if actual diff materially exceeds the ~170-line estimate during apply |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: RED — Failing Tests First

- [x] 1.1 Create `scripts/archive-move-fingerprint-contract.test.js` with two `test()` cases:
  - Archive-move contract: assert `skills/_shared/gate-archive-quality.md` contains the load-bearing strings `recursively diff the destination` and `halt with the source directory left intact` (or equivalent verification-before-delete / halt-with-source-intact phrasing to be authored in Phase 2); assert `skills/sdd-archive/SKILL.md` Step 5 contains a "copy inventory" phrase and a `MUST NOT` ... `delete the source` phrase, and does NOT contain a "then delete the source folder" instruction.
  - Fingerprint-ownership contract: assert `skills/sdd-spec/SKILL.md` Step 5b contains `touched_baseline_domains` and does NOT contain instructions to compute/write a SHA-256 value; assert `agents/sdd-orchestrator.agent.md` contains a standing fingerprint-computation block referencing `touched_baseline_domains` and `baseline_fingerprints`.
  Confirm RED: fails today — `gate-archive-quality.md` has no move-completion section, `sdd-archive` Step 5 still says "then delete the source folder", `sdd-spec` Step 5b still computes the hash itself, and the orchestrator has no standing fingerprint block. [REQ-agents-008, REQ-agents-009]
- [x] 1.2 Extend `scripts/configure/real-repo.test.js`: add sentinel rows for the new `gate-archive-quality.md` move-completion strings to the existing `sentinelFiles` table (mirroring the `Two-place override` / `parseQualityGates` rows already pointing at that file); add `doesNotMatch` absence assertions confirming those same move-completion strings are NOT inline in the orchestrator body; keep the existing `lines.length < 500` guard assertion unchanged (still applies, budget updates to ~498). Confirm RED: fails because the new `gate-archive-quality.md` strings do not exist yet. [REQ-agents-008]

## Phase 2: GREEN — Archive Move Completion (ADR-001)

- [x] 2.1 Append a `## Post-Return Move Completion` section to `skills/_shared/gate-archive-quality.md` (after the existing "Archive Dispatch Guard" content): orchestrator recursively diffs the destination archive folder's inventory against the source change folder's inventory (path presence + content match via hash/byte comparison), using the executor's reported copy-inventory list as the starting manifest re-verified against actual filesystem state; on full match, orchestrator deletes the source directory (the only true "move" step) and only then considers the archive route complete; on any mismatch or copy failure, orchestrator MUST halt with the source directory left intact and surface the mismatch to the user, MUST NOT delete under a mismatch, and MUST NOT close the route silently. Use exact load-bearing phrases matching the anchors written in 1.1/1.2 (e.g. `recursively diff the destination`, `halt with the source directory left intact`). [REQ-agents-008]
- [x] 2.2 Rewrite `skills/sdd-archive/SKILL.md` Step 5 (~lines 200-213): scope the executor to syncing (Step 2) + reporting (Step 3) + copying artifacts to the destination archive path; require the return envelope to include a copy-inventory list of files actually copied; add explicit `MUST NOT` language forbidding deleting the source directory or claiming the move is "complete"/the source "no longer exists" while it still exists on disk; remove the "copy every artifact ... then delete the source folder" instruction entirely (deletion moves to the orchestrator per 2.1). [REQ-agents-008]

## Phase 3: GREEN — Baseline Fingerprint Ownership (ADR-002)

- [x] 3.1 Rewrite `skills/sdd-spec/SKILL.md` Step 5b (currently "Record Baseline Fingerprints"): rename/reframe to a declare-only step — for each delta domain written, add the domain name to a `touched_baseline_domains:` list in the return envelope; explicitly state `sdd-spec` MUST NOT compute or write any SHA-256 value itself and MUST NOT touch `state.yaml.baseline_fingerprints` (it has no execute tool capable of hashing files). [REQ-agents-009]
- [x] 3.2 Add a standing "Baseline Fingerprint Computation" block to `agents/sdd-orchestrator.agent.md`, adjacent to the existing "Assumption Ledger Protocol" (~line 119): immediately after `sdd-spec` returns `status: success`, for each domain in `touched_baseline_domains`, compute the SHA-256 of the current `openspec/specs/{domain}/spec.md` (or write `null` if no baseline exists yet) and write it to `state.yaml.baseline_fingerprints.{domain}`; state this is a standing responsibility firing on every change touching a baseline domain, independent of route/gate configuration; explicitly remove/forbid the prior per-change `assumptions:` ledger entry pattern for "fingerprint not yet recorded". Keep the block to ~6 lines net (492→~498, confirm against the <500 guard in Phase 4). [REQ-agents-009]
- [x] 3.3 Update `skills/_shared/gate-change-collision.md` §"Baseline fingerprint at archive" (~lines 87-105) for consistency: change "`sdd-spec` records in `state.yaml`..." to reflect that `sdd-spec` only DECLARES the domain under `touched_baseline_domains` and the ORCHESTRATOR computes and writes the SHA-256 into `state.yaml.baseline_fingerprints`; leave the `sdd-archive` re-hash-and-compare stale-baseline behavior (Step 2) unchanged. [REQ-agents-009]

## Phase 4: GREEN Verification — Confirm Tests Pass

- [x] 4.1 Run `npm test`; confirm `scripts/archive-move-fingerprint-contract.test.js` passes both cases (archive-move contract, fingerprint-ownership contract). [REQ-agents-008, REQ-agents-009]
- [x] 4.2 Confirm `scripts/configure/real-repo.test.js` passes: new sentinel rows resolve in `gate-archive-quality.md`, absence assertions confirm those strings are not inline in the orchestrator body, and `lines.length < 500` still holds (expected ~498). Record the exact resulting line count. [REQ-agents-008, REQ-agents-009]
- [x] 4.3 Confirm all 4 dist targets stay green via the existing `skills/` walk in `cli.js` (no new file created under `skills/_shared/`, so no new dist-parity path needed — only content of existing walked files changed). [REQ-agents-008, REQ-agents-009]
- [x] 4.4 Run the full `npm test` suite (native + all 4 target generations) and confirm no regressions outside the files touched by this change.

## Phase 5: Cleanup

- [x] 5.1 Re-read `agents/sdd-orchestrator.agent.md` in full and confirm the ONLY addition is the ~6-line standing fingerprint block (no archive-move protocol prose leaked inline; that stays entirely in `gate-archive-quality.md` per ADR-001, zero new pointer-table row). [REQ-agents-008, REQ-agents-009]
- [x] 5.2 Cross-check wording consistency across `gate-archive-quality.md`, `skills/sdd-archive/SKILL.md`, `skills/sdd-spec/SKILL.md`, and `skills/_shared/gate-change-collision.md` (no contradicting claims about who deletes/who computes) before handing off to `sdd-verify`.
- [x] 5.3 Confirm the two success-criteria checkboxes in `proposal.md` that reference "executor never deletes/claims moved" and "sdd-spec declares only" are now factually true against the edited files.
