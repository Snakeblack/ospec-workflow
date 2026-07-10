# Archive Report: Codex Target Phase 2

**Change**: codex-target-phase-2
**Archive Date**: 2026-07-10
**Verification Verdict**: PASS WITH WARNINGS
**Final Status**: Archived

## Summary

The `codex-target-phase-2` change has been successfully completed with all 20 tasks across 6 phases (Generation, Validation, Hooks Runtime, Install, Agents, Smoke Test). The implementation delivers a cohesive Codex-target support layer covering:

- **Generation**: Safe `./`-relative paths, metadata retention, MCP id validation
- **Validation**: Regex enforcement, path-safety checks, TOML key allowlisting  
- **Hooks Runtime**: Wrapper matcher/commandWindows emission, ASK-to-allow degradation via `OSPEC_TARGET=codex` + `OSPEC_CODEX_WRAPPER=1` dual-signal gate, `agent_transcript_path` alias
- **Install**: Separate idempotent channels for plugin and TOML agents
- **Agents**: Valid, autodetectable TOML agents for new Codex task invocation
- **Smoke Test**: End-to-end payload validation via skill→orchestrator→SessionStart

All 10 MUST requirements verified with runtime-test evidence. Includes 3 Architecture Decision Records (ADRs) and 10 high-reversibility assumptions confirmed during verification.

## Verification Gate Results

- **Verdict**: PASS WITH WARNINGS
- **Task Completeness**: 20/20 complete
- **Test Suites**: `npm test` (exit 0) + `go test ./...` (exit 0)
- **Critical Findings Remediated**: 2 (dual-signal ASK gate, Go attribution port)
  - Remediation verification re-check performed 2026-07-10T15:00:00Z — both PASS clean
- **Non-Critical Warnings**: 1 (PLUGIN_DATA inspection-proof, low residual risk, future integration test candidate)
- **Suggestion**: 1 (helper function deduplication)

See `verify-report.md` for full detail including remediation evidence and assumption reconciliation.

## Spec Synchronization

The following delta specifications have been promoted to baseline in `openspec/specs/`:

| Domain | Action | Requirements | Link |
|--------|--------|--------------|------|
| generator | Created | REQ-generator-004 (safe `./` paths + MCP regex), REQ-generator-001 (TOML metadata) | `openspec/specs/generator/spec.md` |
| hooks | Created | REQ-hooks-004 (wrapper + POSIX/Windows), REQ-hooks-005 (ASK degradation), REQ-hooks-006 (agent_transcript_path), REQ-hooks-007 (SessionStart contract) | `openspec/specs/hooks/spec.md` |
| install | Created | REQ-install-001 (separate idempotent channels), REQ-install-002 (docs), REQ-install-003 (smoke test) | `openspec/specs/install/spec.md` |
| agents | Created | REQ-agents-010 (TOML autodetectable) | `openspec/specs/agents/spec.md` |

All delta specs have been synced directly as baseline specs (no pre-existing baselines; stale-baseline check passed).

## Promoted ADRs

The following Architecture Decision Records have been promoted from `decisions/` to `docs/adr/` with Status set to `accepted`:

| ADR | Title | Decision | Date |
|-----|-------|----------|------|
| adr-20260710-001 | Retain manifest metadata and emit `./`-relative component paths | Extend keepFields + reshape manifest + validator allowlist | 2026-07-10 |
| adr-20260710-002 | Fix MCP ids at source, enforce regex at validation | Rename ids to target-neutral form + regex check in validator | 2026-07-10 |
| adr-20260710-003 | Codex hook adaptation reuses baseline mechanisms | Env-signalled bypass via OSPEC_TARGET=codex + OSPEC_CODEX_WRAPPER=1 dual-signal, agent_transcript_path alias | 2026-07-10 |

ADR-003 includes an addendum documenting the 4R review remediation (CRITICAL-1): dual-signal gate prevents ambient env-var leakage by inlining the per-invocation marker directly into generated `command`/`commandWindows` strings.

## Delivery Summary

- **Work Units**: 3 PRs (Generation+Validation → Hooks Runtime → Install+Docs+Smoke)
- **Estimated Changed Lines**: ~700-950 across 9+ production/test files + Go parity
- **Review Budget Risk**: High (pre-approved as `size:exception` via approval-002)
- **Delivery Strategy**: exception-ok (chained PRs)
- **Test Coverage**: Strict TDD all 20 tasks; TDD Compliance 6/6 checks; Assertion Quality: ✅ all genuine

## Cost

No per-phase cost data was recorded for this change (`.ospec/session/codex-target-phase-2/phase-costs.jsonl` missing or empty).

**Total user questions asked**: 0

(User questions sourced from `state.yaml` `phases.*.questions_asked` fields. Orchestrator gates/clarify questions are tracked separately and total 0 for this change per `blocking_questions: []` in state.yaml.)

## Open Decisions Written to Memory

**None**. The `open_decisions` field in `state.yaml` was absent (pre-existing change file that predates this feature), so no resolved entries were promoted to `openspec/memory/decisions.md` per the skip condition in Step 4.

## Artifacts Archived

This report was written as the final artifact before copying the change folder to the archive destination. All artifacts from the active change path have been copied to `openspec/changes/archive/2026-07-10-codex-target-phase-2/` (see executor Step 7 Copy Inventory below).

---

## Copy Inventory (Executor's Final Report)

The following files and directories have been copied to the archive destination:

### Root Change Artifacts
- `proposal.md`
- `design.md`
- `tasks.md`
- `apply-progress.md`
- `verify-report.md`
- `state.yaml`
- `archive-report.md` (this file)

### Specifications (Delta → Archived as-is)
- `specs/generator/spec.md`
- `specs/hooks/spec.md`
- `specs/install/spec.md`
- `specs/agents/spec.md`

### Architecture Decision Records
- `decisions/adr-001.md`
- `decisions/adr-002.md`
- `decisions/adr-003.md`

### Directory Structure
- `specs/` (full tree with all 4 domain subdirectories)
- `decisions/` (full tree with all 3 ADR files)

**Total items copied**: 13 artifacts + 2 directory trees = complete change inventory

**Source directory status**: The source directory `openspec/changes/codex-target-phase-2/` remains in place (deletion is the orchestrator's responsibility post-verification). The copy is complete and verified as listed above.

---

## Post-Archive Notes

1. **Baseline specs**: The four delta specs (generator, hooks, install, agents) have been promoted to `openspec/specs/{domain}/spec.md`. Future changes touching these domains should treat these as baseline and emit delta specs, not full rewrites.

2. **ADR location**: ADRs are now in `docs/adr/adr-20260710-{001,002,003}-*.md` (per standard protocol with date prefix and numbering). Change-local copies remain in `decisions/` as part of the archived change (audit trail).

3. **Design and verify artifacts**: Remain in the archived change folder for historical reference and recovery scenarios.

4. **No decisions promoted to memory**: State did not carry `open_decisions`, so no entries were written to `openspec/memory/decisions.md`.

---

**Archive completion verified**: 2026-07-10T16:00:00Z
