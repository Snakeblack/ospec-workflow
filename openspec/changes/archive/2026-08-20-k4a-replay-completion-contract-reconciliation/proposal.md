# Proposal: Reconcile K4a Replay Completion Contract and Formalize ReplayFixtureResult

## Intent

Reconcile and formalize the exact, minimal `ReplayFixtureResult` contract in K4a deterministic Replay (REQ-006) by eliminating the ambiguous phrase "missing output fields" from the specification and runtime definitions. Establish clear criteria for fixture completion: canonical provenance (`graph_id` matching `graph.graph_id`, `work_order_id` matching the compiled WorkOrder), terminal status (`completed` in `status` or `outcome`), non-contradictory non-zero `exit_code`, a valid non-null non-array `evidence` object, coverage of all `node.required_evidence` keys, and satisfaction of contract `must` obligations. Preserve kernel boundaries by avoiding the introduction of live `WorkResult` runtime structures in K4a and keeping obligation causality decoupled before K5. Finally, reconcile release and provenance documentation to formally close the K4a gate and prepare release v2.45.7.

## Scope

### In Scope
- **Spec Reconciliation**: Update REQ-006 in `openspec/specs/execution-graph-compiler/spec.md` to remove "missing output fields" ambiguity and formalize the canonical minimal `ReplayFixtureResult` contract and scenarios.
- **Contractual Test Suite**: Add comprehensive contractual test cases in `scripts/lib/execution-graph/replay-engine.test.js` validating all positive and negative dimensions of `ReplayFixtureResult`.
- **Kernel Boundary Preservation**: Validate that no live `WorkResult` runtime schema or live execution authority is introduced into K4a replay, and preserve post-evaluation obligation satisfaction.
- **Release and Provenance Reconciliation**: Prepare v2.45.7 release metadata across `package.json`, `CHANGELOG.md`, and relevant documentation (`docs/roadmaps/harness-evolution.md`).

### Out of Scope
- Introducing live runtime `WorkResult` worker execution transport or runtime permits in K4a (governed by live execution kernels / K5+).
- Modifying obligation causality to alter graph node execution order dynamically (belongs to K5).
- Altering frozen K1/K2/K3 schemas or legacy `replayLegacyFixtureGraph` behavior.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `execution-graph-compiler`: Reconcile REQ-006 by formalizing the exact and minimal `ReplayFixtureResult` contract, removing ambiguous "missing output fields" language, and defining exhaustive replay completion scenarios.

## Approach

1. **Spec Alignment**: Update `openspec/specs/execution-graph-compiler/spec.md` REQ-006 to replace the vague "missing output fields" requirement with explicit closed completion discrimination for `ReplayFixtureResult` (provenance `graph_id` + `work_order_id`, terminal status `completed`, exit code consistency, non-null non-array `evidence` object, `node.required_evidence` coverage, and `must` obligation satisfaction).
2. **Contractual Test Hardening**: Extend `scripts/lib/execution-graph/replay-engine.test.js` with an exhaustive contract test suite explicitly covering each aspect of `ReplayFixtureResult` and its failure modes.
3. **Kernel Boundaries & Release Prep**: Ensure that `WorkResult` runtime schemas are not imported into K4a runtime modules, verify obligation satisfaction remains a post-execution check, and bump version to v2.45.7 with release notes and roadmap alignment.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `openspec/specs/execution-graph-compiler/spec.md` | Modified | Reconcile REQ-006 by formalizing `ReplayFixtureResult` and eliminating "missing output fields" |
| `scripts/lib/execution-graph/replay-engine.test.js` | Modified | Add exhaustive contractual test suite for all `ReplayFixtureResult` dimensions |
| `package.json` | Modified | Version bump to 2.45.7 |
| `CHANGELOG.md` | Modified | Document K4a replay contract reconciliation and v2.45.7 release notes |
| `docs/roadmaps/harness-evolution.md` | Modified | Update roadmap status and provenance documentation for K4a completion |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Confusion between runtime `WorkResult` and replay `ReplayFixtureResult` | Low | Explicitly document that `ReplayFixtureResult` is the minimal fixture shape for deterministic replay in K4a, while `WorkResult` is runtime execution payload |
| Breaking legacy unpinned fixtures | Low | `replayLegacyFixtureGraph` remains untouched and covered by existing compatibility test cases |

## Rollback Plan

Revert git modifications on the affected spec, test, and release files (`git checkout main -- <files>`). No stateful migrations or persistent data schemas are modified.

## Dependencies

- None

## Success Criteria

- [ ] REQ-006 in `openspec/specs/execution-graph-compiler/spec.md` is updated to define the exact `ReplayFixtureResult` contract without "missing output fields".
- [ ] `scripts/lib/execution-graph/replay-engine.test.js` passes all exhaustive contractual tests for `ReplayFixtureResult`.
- [ ] No live `WorkResult` runtime authority or backward obligation causality is introduced into K4a.
- [ ] `npm test` and all target generators run cleanly with 100% test pass rate.
- [ ] Release metadata and documentation are updated for v2.45.7.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
