# Proposal: Selective 4R with Generalist Review

## Intent

Replace unconditional four-specialist fan-out with evidence-based selection. A generalist checks basic correctness and all 4R dimensions; a deterministic classifier limits normal changes to justified specialists and preserves full 4R for high-risk changes.

## Scope

### In Scope

- Derive `review_dimensions` from affected paths, modified capabilities, operation type, dependencies, design risks, real diff, and verify outcome.
- Add read-only `review-change` with structured escalation and a strict competence boundary.
- Run 0–2 specialists for normal changes and all four for high-risk changes; persist every selection reason in `state.yaml`.
- Propagate the contract and tests across targets.

### Out of Scope

- O6 deterministic archive runtime or later roadmap items.
- Parallelism changes; selection decides who runs, not how.
- Replacing specialist review criteria or changing blocker/critical user escalation policy.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `agents`: Add the generalist reviewer and replace fixed 4R dispatch with bounded, reasoned escalation.
- `routing`: Make the post-verify gate classification- and evidence-aware.
- `skills`: Define the `review-change` contract and its competence boundary.

## Approach

Introduce a pure classifier producing four booleans and reasons from normalized evidence. At `4r-review-gate`, run `review-change`, combine its escalation with classifier output, enforce classification caps, dispatch selected specialists, and audit inputs, decisions, and reasons. Keep specialist envelopes and severity handling unchanged.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/review-dimensions.js` | New | Pure selection and reason model |
| `agents/review-change.agent.md`, `skills/review-change/` | New | Generalist agent and contract |
| `agents/sdd-orchestrator.agent.md`, `skills/_shared/gate-4r-review.md` | Modified | Selective gate orchestration |
| `openspec/changes/*/state.yaml`, `skills/_shared/openspec-convention.md` | Modified | Review decision audit shape |
| `models.yaml`, tests, generated mirrors | Modified | Cross-target parity |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Classifier misses a needed specialist | Medium | Conservative signals, generalist escalation, full 4R for high-risk |
| Generalist overreaches into specialist conclusions | Medium | Strict envelope and competence-boundary tests |
| Audit shape drifts across targets | Medium | Canonical state contract and generated parity tests |

## Rollback Plan

Revert all classifier, generalist, handler, state-contract, model, generated, and test changes; restore fixed four-reviewer dispatch.

## Dependencies

- Existing reviewers, post-verify gate, result envelopes, and generator.

## Success Criteria

- [ ] Normal changes dispatch 0–2 justified specialists; high-risk changes dispatch all four.
- [ ] Every selected or skipped dimension has a persisted reason derived from declared evidence.
- [ ] `review-change` returns `needs-specialist` with specialists and reason, without deep specialist claims.
- [ ] Existing severity escalation remains intact and all unit, contract, generation, and cross-target tests pass.
