# Proposal: Live Routing Eligibility and Risk Floors

## Intent

In active repositories (`project.status: active`), `standard` shadows `lite` because `standard` evaluates earlier while route-level metadata (`classification: [trivial, small]`) does not filter route eligibility. Furthermore, classification keys diverge (`classification` vs `change.classification`), and K1 hard floors (`data_migration`, `auth_security`, `public_api`) are detached from live routing, allowing small diffs or `hotfix` intent to bypass critical guarantees. This change enables safe selection of `lite` in active projects while enforcing non-degradable risk floors and preserving contextual priority.

## Scope

### In Scope
- Harmonize classification context signals (`classification` and `change.classification`) with deterministic conflict resolution.
- Enforce route eligibility using route `classification` metadata and connect K1 impact hard floors to live route dispatch.
- Block `hotfix` or small sizing from bypassing minimum required route guarantees.
- Preserve contextual precedence (`foundation`, `federated`, `brownfield`) and custom route ordering.
- Prevent silent route downgrades on continuation.
- Update `route-dispatcher.js`, `openspec/config.yaml`, specs, and tests across all targets.

### Out of Scope
- Direct execution recipes or new workflow routes.
- Change Program orchestration or parser syntax extensions.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `routing`: Add classification eligibility filtering, K1 risk floor enforcement, shadow prevention of standard over lite, and continuation stability.
- `change-classification`: Connect K1 hard floor guarantees (auth, migration, public API) to live route dispatch without degradation by sizing.

## Approach

1. **Signal Normalization**: Reconcile `ctx.classification` and `ctx["change.classification"]` in `route-dispatcher.js`.
2. **Floor & Eligibility Gating**: Filter routes by `classification` metadata and enforce K1 hard floors prior to first-match evaluation.
3. **Table Order Integrity**: Adjust `openspec/config.yaml` to allow `lite` selection while preserving contextual route precedence.
4. **Continuation Invariant**: Lock in persisted route decisions across resume cycles.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/route-dispatcher.js` | Modified | Eligibility filtering, signal normalization, floor enforcement |
| `scripts/lib/change-classification.js` | Modified | Bridge K1 floor mappings to live dispatch |
| `openspec/config.yaml` | Modified | Route order and condition definitions |
| `scripts/configure/real-repo.test.js` | Modified | Real-repo selection tests for lite, floors, and precedence |
| `openspec/specs/routing/spec.md` | Modified | Spec delta for eligibility, risk floors, and continuation |
| `openspec/specs/change-classification/spec.md` | Modified | Spec delta for live dispatch floor enforcement |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Custom routing tables break | Low | Fall back gracefully if eligibility metadata is absent |
| In-flight changes re-routed | Low | Preserve persisted `state.yaml` route on continuation |
| False-positive floor elevation | Low | Drive floors strictly by impact evidence, not LOC |

## Rollback Plan

Revert edits to `route-dispatcher.js`, `change-classification.js`, and `openspec/config.yaml`. Engine reverts to unfloored condition matching without invalidating existing `state.yaml` files.

## Dependencies

- None external. Operates on existing K1 schemas and live routing table without K7/K10 dependencies.

## Success Criteria

- [ ] `lite` selects in active repos for `trivial`/`small` changes lacking risk floors.
- [ ] Auth, migration, or public API evidence blocks `hotfix` and `lite`.
- [ ] Contextual routes (`foundation`, `federated`, `brownfield`) retain precedence.
- [ ] Declared order of custom eligible routes is preserved.
- [ ] Continuation preserves route decisions without silent downgrades.
- [ ] All tests in `scripts/lib/route-dispatcher.test.js` and `scripts/configure/real-repo.test.js` pass.

**Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST.
