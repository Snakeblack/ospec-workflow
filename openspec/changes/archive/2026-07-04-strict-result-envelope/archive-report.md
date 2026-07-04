# Archive Report — strict-result-envelope (C5)

**Date**: 2026-07-04
**Change**: strict-result-envelope
**Final Status**: PASS (re-verified)
**Archived to**: `openspec/changes/archive/2026-07-04-strict-result-envelope/`

## Summary

Strict json:result-envelope fence for phase-return serialization; SubagentStop parses, validates, and persists summaries to state.yaml; orchestrator consumes fenced JSON as authoritative source; Go/JS parity contract generalized to SubagentStop. Re-verification of 4R remediation batch (tasks 7.1–7.8) confirmed BLOCKER + 2 CRITICAL + 5 parity WARNINGs all runtime-closed; npm test 914/914 and go test 8 packages green.

## Specs Synced

| Domain | Action | Details |
|--------|--------|---------|
| hooks | Updated | ADDED REQ-hooks-001 (SubagentStop envelope parse/validate/persist); MODIFIED E1 parity contract (generalized floor + fixture family table) |
| skills | Updated | ADDED REQ-skills-001 (Strict Result Envelope Emission Format); updated §3.3 with phase skill emission contract |
| agents | Updated | ADDED REQ-agents-001 (Orchestrator Consumes Structured Envelope Fields §6.1a); MODIFIED §6.1 (Phase Agent Envelope with fenced block requirement) |

## Archive Contents

- proposal.md ✅
- proposal-lite.md ✅
- specs/ ✅
  - specs/hooks/spec.md (delta)
  - specs/skills/spec.md (delta)
  - specs/agents/spec.md (delta)
- design.md ✅
- decisions/adr-001.md ✅ (envelope emission as `json:result-envelope` fenced block)
- decisions/adr-002.md ✅ (fill-gap merge for the hook's state.yaml summary write)
- decisions/adr-003.md ✅ (shared dep-free validator mirrored in Go)
- tasks.md ✅ (20/20 tasks)
- apply-progress.md ✅ (20/20 core + 8/8 remediation batch)
- verify-report.md ✅ (PASS, re-verified)
- state.yaml ✅ (archived)

## Source of Truth Updated

The following baseline specs now reflect the new behavior:
- `openspec/specs/hooks/spec.md` — SubagentStop envelope persistence, E1 parity generalization
- `openspec/specs/skills/spec.md` — strict fence emission requirement (§3.3)
- `openspec/specs/agents/spec.md` — orchestrator envelope consumption (§6.1a), phase agent field dualization (§6.1)

## Promoted ADRs

The following ADRs from this change's `decisions/` directory have been promoted to `docs/adr/` with `Status: accepted`:

| ADR | Title | Promoted to |
|-----|-------|-------------|
| adr-001 | Envelope emission as a `json:result-envelope` fenced block | docs/adr/adr-20260704-001-envelope-emission-fenced-block.md |
| adr-002 | Fill-gap merge for the hook's state.yaml summary write | docs/adr/adr-20260704-002-fill-gap-merge-summary-write.md |
| adr-003 | Shared dependency-free validator mirrored in Go | docs/adr/adr-20260704-003-shared-validator-go-mirror.md |

## Assumptions Reconciliation (Archived State)

Three assumptions recorded during apply (all `reversibility: high`, non-escalating per Decision Gates):

| ID | Statement | Status | Audit |
|----|-----------|--------|-------|
| sdd-apply-001 | `key_decisions` is optional pass-through, defaults to [] when absent | unresolved | **CORRECT.** REQUIRED_FIELDS omits it; persistResultEnvelope defaults [] per line 325. Runtime-proven. |
| sdd-apply-002 | Parity fixtures use `__SUBAGENT_STOP_FIXTURE_WORKSPACE__` placeholder | unresolved | **CORRECT.** Both harnesses substitute with openspec-free workspace; fixtures green. Runtime-proven. |
| sdd-apply-003 | Truncate raw by code-point-first BEFORE escaping (not escape-then-truncate) | unresolved | **CORRECT and safer.** Escape-then-truncate can split 2-char sequences; truncate-raw-first is provably safe. |

All three remain `unresolved` in archived state.yaml (no escalation required per Decision Gates).

## Verification Summary

- **Initial verdict**: PASS (20/20 tasks, 100% TDD, all suites green)
- **4R review gate findings**: 1 BLOCKER + 2 CRITICAL + 5 parity WARNINGs
- **Remediation batch**: 8/8 tasks (7.1–7.8) TDD RED-first
- **Re-verification verdict**: PASS (authoritative) — all runtime-closed, npm test 914 (exit 0), go test 8 packages green, E1 parity byte-for-byte

No spec-delta change required (confirmed); all fixes are internal serialization + parity hardening. Assumptions remain audited correct and non-escalating.

## SDD Cycle Complete

The change has been fully planned, implemented, verified, and archived. Strict result-envelope contract now enforced across JS/Go, hooks/orchestrator, and phase-return serialization. Ready for the next change.

---

**Archived by**: sdd-archive (C5 closure)
**Timestamp**: 2026-07-04T14:50:00Z
