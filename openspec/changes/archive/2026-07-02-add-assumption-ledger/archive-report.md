# Archive Report: Assumption Ledger + Materiality Criterion

**Change**: add-assumption-ledger
**Archive Date**: 2026-07-02
**Status**: PASS — Ready for archive
**Verification Verdict**: PASS (0 CRITICAL, 0 WARNING after remediation; 4R review gate: 0 BLOCKER/CRITICAL, 2 WARNING remediated and confirmed by independent re-verify)

---

## Executive Summary

The `add-assumption-ledger` change has successfully completed all SDD phases (propose, spec, clarify, design, tasks, apply, verify) and passed the 4R review gate with zero blocking or critical issues. The change introduces the Assumption Ledger Protocol — a cross-cutting contract that makes micro-decisions made by phase executors auditable by recording them in a persistent `state.yaml` ledger and reconciling them during verification. This change is production-ready and requires no follow-up work to proceed.

---

## Change Scope Summary

### Capabilities

**New Capability**: `assumption-ledger` — the cross-cutting contract defining:
- `assumptions[]` schema with five fields: `id`, `phase`, `statement`, `reversibility`, `basis`
- Materiality Decision Rule (observable-behavior/public-contract decisions block; internal decisions proceed and record)
- `state.yaml` ledger persistence shape (mirroring the Approval Ledger pattern)
- `sdd-verify` reconciliation checklist (confirm/correct/promote-to-clarification resolution actions)

**Modified Capability**: `agents` — extended with:
- Optional `assumptions[]` field in the Result Envelope Contract (§6.1)
- Orchestrator Assumption Ledger Protocol for persisting assumptions into `state.yaml`
- sdd-verify Assumption Reconciliation Duty for re-presenting and resolving accumulated assumptions

### Files Modified

| File | Domain | Action | Content |
|------|--------|--------|---------|
| `skills/_shared/sdd-phase-common.md` | shared executor protocol | Modified | §D: `assumptions` OPTIONAL field, Assumption Entry Schema (5 fields), Assumption Materiality Rule |
| `agents/sdd-orchestrator.agent.md` | agents | Modified | New `### Assumption Ledger Protocol` section after Approval Ledger Protocol |
| `skills/sdd-orchestrator/SKILL.md` | orchestrator (claude target) | Generated | Mirror of orchestrator change via generator |
| `agents/sdd-verify.agent.md` | agents | Modified | Updated "Required artifacts" section to permit `state.yaml` assumption-resolution writes |
| `skills/sdd-verify/SKILL.md` | verify (shared protocol) | Modified | New Step 2a: Assumption Reconciliation Pre-flight; 2 Decision Gates rows; Output Contract mentions `## Assumption Reconciliation` |
| `skills/sdd-verify/references/report-format.md` | verify references | Modified | New `### Assumption Reconciliation` table template |
| `scripts/assumption-ledger-contract.test.js` | test suite | Created | 14 prose-invariant + self-generated dist-parity contract tests |
| `openspec/specs/assumption-ledger/spec.md` | assumption-ledger domain | **NEW** | Full specification of the assumption ledger contract |
| `openspec/specs/agents/spec.md` | agents domain | Modified | Extended §6 Result Envelope Contract with new assumptions-related requirements |
| `dist/**` (all 4 targets) | generated outputs | Regenerated | Generator output for claude, vscode, github-copilot, opencode targets |

---

## Verification & Quality Gates

### sdd-verify Report Summary

**Verdict**: PASS

**Test Coverage**:
- Unit/Contract Tests: 12 (prose-invariant assertions in `assumption-ledger-contract.test.js`)
- Integration Tests: 2 (self-generated dist-parity for vscode and claude targets)
- Full Suite: 788/788 tests passing (0 failures, 0 skipped)
- All four dist builds: 0 errors, 0 warnings

**Spec Compliance**:
- 15/15 MUST requirements satisfied (9 runtime-test evidence, 6 inspection-proof)
- Complete TDD cycle: RED → GREEN → TRIANGULATE → REFACTOR
- All task completion verified: 21/21 tasks marked complete (apply-progress reports 20/20; discrepancy is cosmetic labeling, not coverage)

### 4R Review Gate Outcome

**Status**: PASS (0 BLOCKER, 0 CRITICAL, 0 WARNING)

**Findings Remediated** (Batch 2):
1. **Reading clarity** — Step 2a in `sdd-verify/SKILL.md` renumbered internal sub-list from `1.`–`4.` to `a.`–`d.` to remove collision with main Execution Steps numbering
2. **Test load-bearing** — Assertion in `assumption-ledger-contract.test.js` strengthened to anchor on distinctive multi-word phrase `"exactly three resolution actions"` plus four backtick-quoted action tokens, verified by independent RED (physical deletion + test failure confirmation)

**Reviewer Confidence**: All findings addressed with real evidence (not narrative). Finding 2's remediation independently confirmed by the verifier's own RED execution (file deletion, test failure, content restoration, full suite re-run).

---

## Spec Sync & Baseline Integration

### Delta Specs Synced to Main Specs

1. **NEW DOMAIN: `assumption-ledger`**
   - Source: `openspec/changes/add-assumption-ledger/specs/assumption-ledger/spec.md`
   - Target: `openspec/specs/assumption-ledger/spec.md`
   - Action: Complete copy (new domain, no existing baseline)
   - Requirements: 4 (Assumption Entry Schema, Materiality Decision Rule, State Ledger Persistence Shape, Verify Reconciliation Checklist)

2. **EXTENDED DOMAIN: `agents`**
   - Source: `openspec/changes/add-assumption-ledger/specs/agents/spec.md`
   - Target: `openspec/specs/agents/spec.md`
   - Action: Additive merge into §6 Result Envelope Contract
   - Changes:
     - Added `assumptions` field to envelope table (§6.1)
     - New §6.4 Requirement: Result Envelope Optional Assumptions Field
     - New §6.5 Requirement: Orchestrator Assumption Ledger Protocol
     - New §6.6 Requirement: sdd-verify Assumption Reconciliation Duty
     - Updated cross-references to include `assumption-ledger` domain
     - Added Session 2026-07-02 clarifications (2 Q&A entries on `promote-to-clarification` semantics and `seq` uniqueness responsibility)

### Destructiveness Analysis

**Verdict**: No destructive deltas. Changes are 100% additive:
- New fields (OPTIONAL `assumptions` in envelope) do not alter existing required fields
- New domain (assumption-ledger) does not remove or modify existing domains
- New requirements in agents extend existing sections without removing or contradicting prior content
- Backward compatibility: older phase agents that do not populate `assumptions` are unaffected; the field remains OPTIONAL
- Legacy state.yaml files without `assumptions:` block are compatible (orchestrator treats missing key as empty list)

---

## Risk Mitigation

### Identified Risks (from Proposal)

| Risk | Likelihood | Mitigation Applied | Status |
|------|------------|-------------------|--------|
| Prompt bloat | Medium | Single shared-protocol edit; pointer-only per-agent references | ✅ Mitigated: 5 prose files edited, 1 new test file (~230 lines); compact rules pattern reused |
| Materiality rule ambiguous | Medium | Concrete observable-behavior test + verify WARNING escalation | ✅ Mitigated: rule text explicit; verify checklist catches under-recording |
| Multi-target drift | Medium | Regeneration explicit task; parity tests assert output | ✅ Mitigated: 4.1/4.2 integration tests verify self-generation; full suite clean |
| Unwieldy assumption checklist | Low | Grouping by reversibility; only material unresolved escalate | ✅ Mitigated: design decision gate resolved (decision-001); reconciliation duty gates escalation |

### Residual Risk

**Known Issue** (cosmetic, non-blocking): `apply-progress.md` header labels "20/20 tasks" but `tasks.md` contains 21 subtasks. All 21 marked complete (`[x]`); discrepancy is labeling only. No follow-up task required; can be addressed in a future apply batch if the change is modified.

---

## Completeness Checklist

- [x] Change fully planned (proposal, specs, design, tasks approved)
- [x] All tasks implemented and tested (21/21 complete)
- [x] TDD evidence confirmed: RED, GREEN, TRIANGULATE, REFACTOR per layer
- [x] Verification passed: PASS verdict, 0 CRITICAL/WARNING after remediation
- [x] 4R review gate passed: 0 BLOCKER/CRITICAL, 2 WARNING remediated and independently confirmed
- [x] Delta specs synced to baseline: assumption-ledger new; agents extended
- [x] Destructiveness analysis: zero breaking changes
- [x] No open decisions requiring promotion to memory (state.yaml has no `open_decisions` block)
- [x] Archive artifacts present: proposal.md, specs/, design.md, tasks.md, apply-progress.md, verify-report.md

---

## Archive Contents

The following artifacts have been archived with this change:

```
openspec/changes/archive/2026-07-02-add-assumption-ledger/
├── proposal.md                 (intent, scope, approach, rollback plan)
├── design.md                   (decision rationale, execution strategy)
├── tasks.md                    (21 implementable tasks with TDD evidence)
├── apply-progress.md           (Batch 1 + Batch 2 implementation record)
├── verify-report.md            (PASS verdict, compliance matrix, 4R remediation evidence)
├── state.yaml                  (workflow state, approvals, gates, phases)
├── archive-report.md           (this file)
└── specs/
    ├── assumption-ledger/
    │   └── spec.md             (new domain: Assumption Ledger Specification)
    └── agents/
        └── spec.md             (delta: Result Envelope amendments, Assumption Ledger Protocol, sdd-verify Reconciliation Duty)
```

---

## Baseline Specs Updated

The following baseline specs have been synchronized with delta specs from this change:

- **`openspec/specs/assumption-ledger/spec.md`** — NEW DOMAIN
  - 4 requirements defining the assumption ledger contract
  - Cross-references to agents spec, sdd-orchestrator, sdd-verify
  - Session 2026-07-02 clarifications on semantics and uniqueness responsibility

- **`openspec/specs/agents/spec.md`** — EXTENDED
  - §6.1 Result Envelope table: added `assumptions` OPTIONAL field
  - §6.4 New requirement: Result Envelope Optional Assumptions Field (2 scenarios)
  - §6.5 New requirement: Orchestrator Assumption Ledger Protocol (2 scenarios)
  - §6.6 New requirement: sdd-verify Assumption Reconciliation Duty (2 scenarios)
  - Cross-References: added assumption-ledger domain, orchestrator patterns
  - Clarifications: added Session 2026-07-02 Q&A entries (2 points on semantics, 2 on uniqueness)

---

## Next Steps

1. ✅ Change archived to `openspec/changes/archive/2026-07-02-add-assumption-ledger/`
2. ✅ Baseline specs updated with synced deltas
3. ✅ No residual open decisions (none recorded)
4. 🎯 Ready for the next horizon-1 change: proceed to the next feature work or initiate another `/sdd-new` session

---

## Signature

**Archived by**: sdd-archive (executor)
**Archive Timestamp**: 2026-07-02
**Verification Verdict**: PASS
**4R Gate Verdict**: PASS (0 BLOCKER/CRITICAL, 2 WARNING remediated)
**Rollback Risk**: Minimal (additive changes; revert source edits + regenerate `dist/`)

---

**The SDD cycle for `add-assumption-ledger` is COMPLETE. Change is production-ready.**
