# Archive Report: harden-archive-move-fingerprints

**Change**: harden-archive-move-fingerprints  
**Archived**: 2026-07-05  
**Verify Verdict**: PASS  
**4R Gate Status**: done, advisory findings documented in state.yaml

---

## Executive Summary

The `harden-archive-move-fingerprints` change formalizes the orchestrator's ownership of two critical interfaces (I1 contracts):
1. **Archive Move Completion**: In the `sdd-archive` phase, the executor's scope is strictly limited to syncing delta specs, persisting the archive report, and copying artifacts to the destination archive path. The executor never deletes the source directory or claims that the move is complete; instead, the orchestrator performs a post-return inventory diff (destination vs source) and deletes the source directory on a full match.
2. **Baseline Fingerprints**: The `sdd-spec` phase declares touched baseline domains in its return envelope without computing hashes. Immediately after `sdd-spec` succeeds, the orchestrator computes the SHA-256 baseline spec fingerprints and writes them to `state.yaml`, eliminating the need for per-change assumption entries.

All 14 implementation tasks were successfully completed under Strict TDD using static contract tests and real-repository sentinel rows. The orchestrator's size remains under the 500-line body guard (497 lines).

---

## Specs Synced to Baseline

### agents/spec.md

**Action**: Added 2 new requirements under Section 1.4:

| Requirement | Status | Description |
|-------------|--------|-------------|
| REQ-agents-008 | **ADDED** | Orchestrator-Owned Archive Move Completion |
| REQ-agents-009 | **ADDED** | Orchestrator-Computed Baseline Fingerprints |

### skills/spec.md

**Action**: Modified 1 requirement and added 1 requirement under Section 14:

| Requirement | Status | Change |
|-------------|--------|--------|
| Baseline Fingerprint Recording and Verification | **MODIFIED** | sdd-spec declares touched domains; orchestrator computes and records hashes |
| sdd-archive Copy-and-Report Contract | **ADDED** | Executor copies and reports inventory in the return envelope, leaving source intact and never self-certifying completion |

---

## Promoted ADRs

Three Architecture Decision Records (ADRs) have been promoted from the active change folder to the living project memory in `docs/adr/`:

1. `docs/adr/adr-20260705-004-archive-move-completion-extends-gate-archive-quality.md`
2. `docs/adr/adr-20260705-005-baseline-fingerprint-computation-is-a-standing-inline-orchestrator-block.md`
3. `docs/adr/adr-20260705-006-dedicated-static-contract-test-real-repo-sentinel-extension.md`

In each file, the status was updated to `accepted`.

---

## Archive Contents

| Artifact | Present | Notes |
|----------|---------|-------|
| proposal.md | ✅ | Change proposal outlining the problem and routing choices |
| specs/agents/spec.md | ✅ | Delta spec for the agents domain |
| specs/skills/spec.md | ✅ | Delta spec for the skills domain |
| design.md | ✅ | Design detailing the orchestrator standing block and sdd-archive step rewrite |
| tasks.md | ✅ | 14 tasks complete |
| apply-progress.md | ✅ | Implementation progress with TDD cycle evidence |
| verify-report.md | ✅ | PASS verdict containing test runs and TDD compliance audit |
| decisions/adr-001.md | ✅ | Source ADR for move completion design choices |
| decisions/adr-002.md | ✅ | Source ADR for orchestrator standing block design choices |
| decisions/adr-003.md | ✅ | Source ADR for testing/sentinel validation design choices |
| state.yaml | ✅ | Updated change state marking the change as archived |

---

## Cost

No per-phase cost data was recorded for this change (`.ospec/session/harden-archive-move-fingerprints/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0

---

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. All baseline specs are synchronized, and the promoted decisions are now recorded in the project's ADR repository.

**Next**: The orchestrator will verify the copied files against this report's copy inventory and delete the source directory `openspec/changes/harden-archive-move-fingerprints/`.
