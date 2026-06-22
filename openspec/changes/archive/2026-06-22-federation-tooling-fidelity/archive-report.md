# Archive Report: federation-tooling-fidelity

**Date**: 2026-06-22  
**Change**: federation-tooling-fidelity  
**Archive Destination**: `openspec/changes/archive/2026-06-22-federation-tooling-fidelity/`  
**Verification Verdict**: **PASS**  
**Status**: Ready for archive

---

## Verification Summary

The change passed full verification (RE-VERIFY FINAL):
- Full test suite: **681/681 exit 0** (all tests pass; historically flaky test 378 passed in this run)
- All 4 build targets (`claude`, `vscode`, `github-copilot`, `opencode`): **exit 0** with 0 errors
- Residual namespace check (`/vscode\//i` in dist): **0 residue** confirmed in `dist/github-copilot` and `dist/opencode`
- 4R review gate: **0 BLOCKER, 0 CRITICAL, 5 WARNING, 1 SUGGESTION**
  - 4 in-scope findings (readability + reliability) were remediated (3 tests: F4, G4, G5; 2 comments)
  - 2 preexisting resilience WARNINGs accepted as follow-up (not blocking)

**No critical issues. Safe to archive.**

---

## Specs Synchronized

Three delta specs have been merged into the baseline specs:

| Domain | Action | Details |
|--------|--------|---------|
| `generator` | MODIFIED | Requirement: Source tree loading ampliado — added 4 skill entry-point scripts (federation-marker.js, federation-explore.js, workspace-general-baseline.js, federation-baseline-orchestrator.js) as additional BFS roots; 4 new scenarios |
| `federation-markers` | MODIFIED | Requirement: Atlas Merge Semantics — added passthrough logic for non-reserved fields (e.g., `surface`) from `provides[]` entries to derived contract; 3 new scenarios (surface preservation, idempotency, entries without surface) |
| `unified-baseline-gate` | MODIFIED | Requirement: Gate Approval Recording — changed `approver` value from `vscode/askQuestions` (per-target) to `orchestrator/askQuestions` (target-agnostic); 2 new scenarios; resolves github-copilot/opencode validator rejection |

### Sync Details

1. **generator/spec.md**
   - Requirement header restructured to `### Requirement: Source tree loading ampliado` with nested `#### Scenario:` format (normalizes header structure per Task 5.1)
   - Previously Scenario 1-16 structure preserved; only Scenario 1 content replaced with new requirement + 4 sub-scenarios
   - No `vscode/` residue introduced

2. **federation-markers/spec.md**
   - Requirement expanded with 3 new scenarios covering `surface` field passthrough and idempotency guarantee
   - Generic field passthrough logic (non-reserved fields) documented with fail-close semantics for `surface: null` and `surface: undefined`
   - No `vscode/` residue introduced

3. **unified-baseline-gate/spec.md**
   - CRITICAL change: `approver` value changed from `vscode/askQuestions` to `orchestrator/askQuestions` in both spec body and 4 scenarios
   - Added 2 new scenarios: "Approver value is target-agnostic across all build targets" (validates no vscode/copilot/opencode/claude substrings)
   - Added rationale block explaining the regression (builds failed with per-target namespace prefix when script was added to SKILL_ENTRY_SCRIPTS)
   - Confirmed `openspec/specs/federated-baseline-orchestration/spec.md` line 85 already reflects the example with `orchestrator/askQuestions`
   - No `vscode/` residue introduced in spec or anywhere else

---

## Archive Contents

The following artifacts have been confirmed present and will move to archive:

- ✅ `proposal.md` — Full SDD proposal for federation-tooling-fidelity
- ✅ `specs/` directory with 3 domain specs (delta-merged into baseline)
  - `specs/generator/spec.md`
  - `specs/federation-markers/spec.md`
  - `specs/unified-baseline-gate/spec.md`
- ✅ `design.md` — Implementation design and decision rationale
- ✅ `tasks.md` — 8 phases of work (40+ tasks); all [x] complete
- ✅ `apply-progress.md` — Detailed remediation progress (WU-1, WU-2, RWU-1, 4R batch)
- ✅ `verify-report.md` — Full verification evidence (681/681 tests, 4 builds, spec compliance matrix)
- ✅ `state.yaml` — Workflow state (phases done, approvals, gates closed)
- ✅ `archive-report.md` — This report

---

## Known Issues Reconciliation

Two prior BLOCKER entries in `openspec/memory/known-issues.md` have been marked **RESOLVED**:

1. **"github-copilot/opencode dist falla su validador: vscode namespace residue"**
   - RESOLVED by changing `approver` to target-agnostic `orchestrator/askQuestions`
   - Validation now passes for all 4 targets

2. **"apply-progress declara falsamente que los fallos de validador son preexistentes"**
   - RESOLVED by successful RE-VERIFY FINAL (suite 681/681, 4 builds exit 0, 0 vscode/ residue)
   - Prior failures were real (not preexisting); fixed by this change

Two preexisting resilience WARNINGs remain open as follow-up (per approval `post-4r-001`):
- `cli.js:132` — `readFileSync` without try/catch; non-ENOENT errors propagate uncaught
- `federation-baseline-orchestrator.js:112` — empty `catch(_){}` absorbs EACCES/EPERM silently
- These are preexisting patterns not introduced or exacerbated by this change

---

## Source of Truth Updated

The following baseline specs in `openspec/specs/` now reflect the normalized behavior and the target-agnostic approver value:

- `openspec/specs/generator/spec.md` — Skill entry-point BFS roots documented
- `openspec/specs/federation-markers/spec.md` — Non-reserved field passthrough (surface) documented
- `openspec/specs/unified-baseline-gate/spec.md` — Target-agnostic approver (orchestrator/askQuestions) normatively established
- `openspec/specs/federated-baseline-orchestration/spec.md` — Example at line 85 already updated to reflect target-agnostic approver

---

## SDD Cycle Completion

**Change**: federation-tooling-fidelity  
**Status**: ✅ ARCHIVED  

The change has been fully planned (proposal), specified (3 deltas), designed (2 architectural decisions), implemented (40+ tasks, 8 phases), verified (681/681 tests, 4 builds, 0 critical issues), and archived. The canonical baseline specs now encode the target-agnostic approver value and the expanded generator/federation-markers semantics.

**Next change ready for planning.**

---

## Archive Operation Notes

- Archive folder: `openspec/changes/archive/2026-06-22-federation-tooling-fidelity/`
- All artifacts copied and state.yaml updated with `archive.status: done`
- No git operations performed (awaiting orchestrator commit)
- known-issues.md reconciliation complete (2 BLOCKERs → RESOLVED, 2 WARNINGs remain open)
