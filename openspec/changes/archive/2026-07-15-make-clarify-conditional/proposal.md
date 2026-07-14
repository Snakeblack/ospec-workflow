# Proposal: Make Clarify Truly Conditional

## Intent

Stop invoking `sdd-clarify` solely because a change uses the standard route. `sdd-spec` will expose explicit ambiguity signals so a well-defined change can proceed directly to design while unresolved contract or acceptance gaps still trigger the clarify gate.

## Scope

### In Scope

- Define `residual_ambiguity`, `public_contract_questions[]`, `conflicting_requirements[]`, and `missing_acceptance_criteria[]` in the `sdd-spec` result contract.
- Make the orchestrator evaluate those signals after successful spec generation and dispatch `sdd-clarify` only when at least one justifies it.
- Preserve clarify as a gate between spec and design, including state bookkeeping and blocked-question handling.
- Add cross-target contract and behavior tests for triggered and skipped clarify paths.

### Out of Scope

- Adding `sdd-clarify` to route phase lists or `validate-phase.js`.
- Changing other route-selection, 4R, or user-question policies.
- Automatically resolving ambiguities inside `sdd-spec`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `skills`: Extend the `sdd-spec` structured return contract with typed ambiguity signals.
- `agents`: Change orchestrator clarify-gate dispatch from route/classification-based to signal-based behavior.

## Approach

Extend the canonical phase envelope schema and its JavaScript/Go validators with the four `sdd-spec` fields. Require `sdd-spec` to emit a boolean plus three arrays on success. Centralize the gate predicate in the existing clarify handler, keep the orchestrator's anchored `residual_ambiguity` reference, and bypass phase validation when dispatching clarify. False/empty signals skip the gate and mark it `skipped`; any positive/non-empty signal runs the existing handler.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `skills/sdd-spec/`, `skills/_shared/sdd-phase-common.md` | Modified | Emission and canonical envelope contract |
| `skills/_shared/clarify-routing.md` | Modified | Conditional gate predicate and state outcome |
| `agents/sdd-orchestrator.agent.md` | Modified | Post-spec gate dispatch |
| `scripts/lib/result-envelope.*` | Modified | JavaScript validation and tests |
| `internal/resultenvelope/` | Modified | Go validator parity and tests |
| target contract tests and generated mirrors | Modified | Cross-target behavior parity |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Missing or malformed signals make dispatch indeterminate | Medium | Require and type-check all four fields on successful `sdd-spec` returns |
| Target mirrors diverge | Medium | Regenerate distributions and run parity/contract tests |

## Rollback Plan

Revert the contract, predicate, validator, generated-mirror, and test changes together; restore the existing route/classification-based clarify dispatch.

## Dependencies

- Existing strict result-envelope parser, clarify handler, and generation pipeline.

## Success Criteria

- [ ] A well-defined standard change emits false/empty signals and reaches `sdd-design` without invoking clarify.
- [ ] Any positive ambiguity signal invokes the existing clarify gate without `validate-phase.js`.
- [ ] The strict envelope validators enforce the boolean and array signal types.
- [ ] JavaScript, Go, orchestrator contract, and target parity tests pass.
