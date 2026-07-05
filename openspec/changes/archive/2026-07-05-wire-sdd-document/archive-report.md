# Archive Report: wire-sdd-document

**Change**: wire-sdd-document  
**Archived**: 2026-07-05  
**Verify Verdict**: PASS WITH WARNINGS (initial + post-4R re-verification, both in verify-report.md)  
**4R Gate Status**: done, remediation completed and re-verified

---

## Executive Summary

The `wire-sdd-document` change wires the `/sdd-document` route into the SDD orchestrator, enabling users to generate repository documentation interactively. The change introduces three inline orchestrator additions (allowlist entry, command-index bullet, pointer-table row) under a 500-line body guard, delegates full launch-gate/persistence/post-run-verification protocol to a new `skills/_shared/route-document.md` handler file, and updates sdd-document spec to enforce a batched language+scope selection gate with orchestrator-owned sandbox verification.

**All 18 tasks implemented** in one batch via strict TDD: RED tests first (contract test, real-repo sentinel, sdd-document schema/wording/dist-parity), then GREEN wiring and handler creation, full npm test 986/986 native tests passing. **4R remediation** addressed 1 CRITICAL + 6 WARNING findings via TDD RED-first (test assertions hardened) and markdown edits; no residual findings remain except the pre-existing inspection-proof coverage gap (WARNING-1, already recorded in known-issues.md).

---

## Specs Synced to Baseline

### agents/spec.md

**Action**: Added 3 new requirements under Section 1.5 (sdd-document Requirements)

| Requirement | Status |
|-------------|--------|
| REQ-agents-005 | **ADDED** — sdd-document Orchestrator Allowlist, Command Index, and Pointer Table Wiring |
| REQ-agents-006 | **ADDED** — Orchestrator-Owned Post-Run Sandbox Inventory Verification for sdd-document |
| REQ-agents-007 | **ADDED** — Commands↔Agents Static Contract Test |

**Also updated**: Section 3.2 Command Roster table to include `/sdd-document` command row with `→ sdd-document` routing target; Section 3.2 Clarifications session 2026-07-05 with three material decisions.

### sdd-document/spec.md

**Action**: Modified 3 existing requirements

| Requirement | Status | Change |
|-------------|--------|--------|
| REQ-sdd-document-002 | **MODIFIED** | Interactive Launch Gate now requires batching scope-choice and language-selection into ONE question_gate; clarified executor/orchestrator sandbox verification split; added no-self-certify scenario |
| REQ-sdd-document-006 | **MODIFIED** (was Language Selection Gate) | Promoted to "Batched Language and Scope Selection Gate"; added init/update mode distinction, keep/change pre-question override path, and persisted `.last-update.json` skip behavior |
| REQ-sdd-document-011 | **MODIFIED** | Metadata schema now carries `doc_language` and `scope_choice` fields for skip-in-update behavior; added three new scenarios |

**Also added**: Section Clarifications session 2026-07-05 with one material decision (update-mode override UX).

---

## Archive Contents

| Artifact | Present | Notes |
|----------|---------|-------|
| proposal.md | ✅ | Change proposal (Section 1.1-1.4, route + approval decisions) |
| specs/agents/spec.md | ✅ | Delta spec (3 ADDED reqs + roster/clarifications update) |
| specs/sdd-document/spec.md | ✅ | Delta spec (3 MODIFIED reqs + clarifications) |
| design.md | ✅ | Design artifacts (3 inline additions, route-document.md protocol, SKILL.md edits) |
| tasks.md | ✅ | 18 tasks across 5 phases (RED/GREEN/verify/cleanup) |
| apply-progress.md | ✅ | Full implementation batch + 4R remediation batch, TDD cycle evidence per task |
| verify-report.md | ✅ | PASS WITH WARNINGS verdict with task completeness, test coverage, TDD compliance, 4R remediation audit |

**Summary**:
- 18/18 tasks complete
- All tests passing: 986/986 native tests + all 4 target generations/validators
- 4R findings: 1 CRITICAL + 6 WARNING (MUST FIX) + 2 SUGGESTION (opportunistic) — all remediated and re-verified
- Residual WARNING-1 (two REQ-agents-006 J5 scenarios inspection-proof only) recorded in known-issues.md per Step 10b B5 idempotency

---

## Cost

No per-phase cost data was recorded for this change (`.ospec/session/wire-sdd-document/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0 (all design decisions pre-resolved in Clarifications sessions; no orchestrator gates fired during apply)

---

## Known Issues

The change carries one residual WARNING from 4R verification:

**WARNING-1 (tasks-gap)** — REQ-agents-006 J5: of its three MUST scenarios, only "out-of-sandbox halt" wording has a static string-presence assertion (`real-repo.test.js` L453 sentinel). "Clean run passes silently" and "pre-existing untracked no false-positive" (the git-status scoping/silent-close prose in `route-document.md` §6.2–6.3) rest on **inspection-proof only** — no test asserts the scoping instruction or the two-exceptions set is present in the handler. Implementation prose is correct per spec (verified by inspection), so this is a coverage gap, not a behavioral defect. This issue is recorded in `openspec/memory/known-issues.md` per the Step 10b idempotency guard.

---

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. All baseline specs have been synchronized with delta specs. The `/sdd-document` route is now wired into the SDD orchestrator and ready for use.

**Next**: Ready for the next SDD change. The repository now supports interactive wiki generation via `/sdd-document`, with proper scope/language selection gates, batched interaction, and orchestrator-owned post-run sandbox verification.
