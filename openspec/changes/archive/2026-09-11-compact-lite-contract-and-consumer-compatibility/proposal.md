# Proposal: Compact Lite Contract and Consumer Compatibility

## Intent

Reduce redundancy in the lite workflow without weakening evidence, recovery, verification, or archive. A valid lite change completes `proposal-lite → tasks → apply → verify → archive` with spec and design legitimately absent.

## Scope

### In Scope
- Define compact minimum content for lite artifacts and phase summaries.
- Make dependencies, validators, renderers, recovery, and archive consumers conditional on route artifacts.
- Preserve progress, independent verification, archive integrity, normal planning, and target parity.

### Out of Scope
- New routes, merged phases, or CX1 envelope/state reducers.
- Empty spec/design artifacts, fabricated task/TDD completion, or reduced evidence obligations.
- Changes to security, migration, or public-API risk floors established by PP1.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `routing`: Make the five-phase lite contract explicit while preserving eligibility and floors.
- `skills`: Compact producers and accept route-appropriate dependencies across tasks, apply, verify, and archive.
- `agents`: Preserve deterministic recovery and phase summaries when lite omits spec/design.
- `generator`: Preserve contracts across all six target outputs.
- `archive-plan-contract`: Accept a complete lite inventory without nonexistent spec/design references while retaining fail-closed integrity.

## Approach

Treat `proposal-lite.md` plus `tasks.md` as the lite planning contract. Audit consumers, replace unconditional spec/design reads with route-aware checks, and test fresh/resumed lite plus normal regression. Retain current human and structured envelope outputs; CX1 owns later transport deduplication.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `skills/sdd-*/`, `skills/_shared/` | Modified | Artifacts, reads, evidence continuity |
| `agents/` | Modified | Dispatch, recovery, summaries |
| `scripts/configure/`, `scripts/lib/` | Modified | Validation, rendering, target propagation |
| `scripts/*.test.js`, `tests/` | Modified | Lifecycle and regression fixtures |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Hidden reader requires spec/design | Medium | Consumer inventory and six-target fixtures |
| Compaction drops evidence or history | Medium | Append/merge tests and independent verify assertions |
| Normal workflow becomes under-specified | Low | Standard-route regression retaining spec/design |

## Rollback Plan

Revert producer/consumer changes together and restore prior formats while preserving ledgers, progress, evidence, and receipts.

## Dependencies

- PP1 safe lite eligibility and risk floors.
- Current envelope and archive contracts; CX1 is not required.

## Success Criteria

- [ ] Fresh and resumed lite flows complete all five phases with no spec/design files and no filler artifacts.
- [ ] Apply merges prior progress; verify independently checks lite acceptance; archive emits a valid plan and never claims runtime closure early.
- [ ] Six targets pass parity/validation fixtures; normal changes retain proposal/spec/design/tasks planning.
- [ ] Artifact/read-volume measurements can compare lite cohorts without weakening evidence or recovery guarantees.
