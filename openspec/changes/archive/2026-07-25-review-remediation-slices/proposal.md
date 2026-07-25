# Proposal: Slice-Scoped 4R Review Remediation

## Intent

O4.2 proved that a lineage-wide allowance plus atomic unresolved-finding validation exhausts valid remediation, loses independent resolutions, and forces successors. Use autonomous root-cause slices without weakening authority or audit evidence.

## Scope

### In Scope
- Group frozen blocking findings into stable root-cause slices.
- Bound lines and failed validations per slice.
- Validate only the active slice; preserve passed slices.
- Reserve successors for new candidate scope or discovery authority.
- Migrate active schema-v1 lineages, including O4.2.
- Record deterministic, fail-safe JS/Go phase costs for allowlisted reviewers.

### Out of Scope
- Completing O4.2 provenance.
- Changing dimensions, severity, genesis, or one-shot lenses.
- Removing limits or weakening identity and mutation safety.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `routing`: Define bounded slice state, transitions, and legacy migration.
- `agents`: Dispatch one correction/validation slice without reopening passed groups.
- `skills`: Limit targeted validation to the active frozen-finding slice.
- `hooks`: Add allowlisted review phase costs without changing `sdd-*` behavior.

## Approach

Add versioned slices derived from frozen IDs and root-cause evidence. Each owns paths, allowance, attempts, history, and resolution; lineage authority stays immutable. The adapter dispatches only legal actions. Idempotent migration preserves legacy history and maps unresolved findings into resumable slices. JS/Go phase-key derivation uses an exact reviewer allowlist. Tests cover lifecycle, migration, filtering, parity, and O4.2 resume.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/review-lineage.js`, `scripts/lib/review-gate-state.js` | Modified | Reducer, migration, dispatch |
| `scripts/review-lineage.test.js` | Modified | Slice and compatibility coverage |
| `skills/_shared/gate-4r-review.md`, `agents/sdd-orchestrator.agent.md` | Modified | Orchestration contract |
| `scripts/hooks/subagent-stop.js`, `internal/hooks/subagentstop.go` | Modified | Allowlisted review phase keys |
| `scripts/hooks/subagent-stop.test.js`, `scripts/hooks/parity-contract.test.js`, `internal/hooks/subagentstop_test.go` | Modified | Telemetry and byte-parity tests |
| `openspec/specs/{routing,agents,skills,hooks}/spec.md` | Modified | Requirement deltas |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Legacy authority drift | Medium | Idempotent migration and invariant fixtures |
| Cross-slice regressions | Medium | Frozen paths and regression checks |
| Unbounded work | Medium | Deterministic caps and finite slices |

## Rollback Plan

Revert code, contracts, and specs together. Retain migrated snapshots; never discard history or replay unknown mutations.

## Dependencies

- Schema-v1 audit and paused O4.2 lineage.

## Success Criteria

- [ ] A passed slice remains resolved when another slice fails validation.
- [ ] Each slice enforces bounded lines and attempts without a lifetime line quota.
- [ ] Identity, one-shot lenses, reconciliation, and frozen findings remain enforced.
- [ ] Legacy lineages migrate deterministically; O4.2 resumes without ordinary successor churn.
- [ ] Allowlisted review dispatches emit deterministic phase costs identically in JS/Go; arbitrary agents remain unsupported and fail-safe.
