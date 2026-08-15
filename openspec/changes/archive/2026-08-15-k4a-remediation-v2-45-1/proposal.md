# Proposal: K4a Remediation (v2.45.1)

## Intent

Remediate 5 BLOCKERs, 2 CRITICAL issues, and 2 WARNINGs introduced in v2.45.0 K4a execution graph and compiler components that break cryptographic interoperability with K3 authorities, allow provenance bypass, discard snapshot identities, permit cyclic or mutable graphs, and allow malformed replay/shadow execution.

## Scope

### In Scope
- **Topological WorkOrder v2 compilation**: Resolve node dependencies to canonical `WorkOrderId` sha256 digests (`sha256:...`) and enforce sha256 pattern in `work-order/v2.schema.json`.
- **Atomic canonical schema validation**: Validate ExecutionGraph and emitted WorkOrders via canonical schema validators (`execution-graph/v1`, `work-order/v2`).
- **Contract obligation authority**: Treat `contract.obligations` as authoritative, rejecting silent omission via empty arrays.
- **Clarify invalidation & replay propagation**: Mutate affected nodes, bind ClarifyEvent to GraphId, and pass invalidated node IDs to replay engine for fail-closed fixture rejection.
- **PolicySnapshot ID binding**: Incorporate `policy_snapshot_id` into ExecutionGraph schema and `computeGraphId()` preimage domain.
- **Graph compiler integrity**: Add cycle detection (`hasCycle`) and defensive cloning (`structuredClone`) in `compileExecutionGraph()`.
- **Hardened shadow comparator & replay engine**: Harden shadow comparison and enforce closed fixture completion discrimination.

### Out of Scope
- Runtime worker execution or live execution permits (deferred to K6a).
- Multi-worker orchestration (deferred to K4b).
- Breaking changes to legacy `work-order/v1` frozen schemas or K1 baseline pins.

## Capabilities

### New Capabilities
- None

### Modified Capabilities
- `execution-graph-compiler`: Fix topological WorkOrder digest compilation, atomic canonical validation, obligation authority, clarify invalidation propagation, `policy_snapshot_id` binding, cycle detection, defensive copying, shadow comparison hardening, and replay completion discrimination.
- `kernel-contract-schemas`: Update `work-order/v2.schema.json` dependencies items pattern to sha256 digests and add `policy_snapshot_id` to `execution-graph/v1.schema.json`.
- `execution-identities`: Ensure cryptographic binding and WorkOrder v2 validation alignment.

## Approach

Topologically sort nodes in `compileWorkOrdersV2` to resolve dependencies as upstream `WorkOrderId` digests. Validate inputs and outputs against JSON schemas with canonical validators. Bind `policy_snapshot_id` into `computeGraphId()` and graph schema. Enforce `hasCycle()` and `structuredClone()` in `compileExecutionGraph()`. Update clarify invalidation and replay engine to reject stale fixtures fail-closed.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `schemas/kernel/work-order/v2.schema.json` | Modified | Enforce SHA-256 pattern on dependencies items |
| `schemas/kernel/execution-graph/v1.schema.json` | Modified | Add required `policy_snapshot_id` property |
| `scripts/lib/execution-graph/work-order-compiler.js` | Modified | Topological dependency digest resolution and atomic schema validation |
| `scripts/lib/execution-graph/compiler.js` | Modified | `policy_snapshot_id` binding, obligation authority, cycle check, defensive clone |
| `scripts/lib/execution-graph/clarify.js` | Modified | Invalidate graph structure and bind ClarifyEvent to GraphId |
| `scripts/lib/execution-graph/replay-engine.js` | Modified | Closed completion discriminator and invalidated node rejection |
| `scripts/lib/execution-graph/shadow-comparator.js` | Modified | Harden comparison against baseline invariants and obligations |
| `openspec/specs/execution-graph-compiler/` | Modified | Delta spec for compiler, WorkOrder, clarify, and replay requirements |
| `openspec/specs/kernel-contract-schemas/` | Modified | Delta spec for schema updates |
| `openspec/specs/execution-identities/` | Modified | Delta spec for identity binding compatibility |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Topological sorting performance overhead | Low | Execution graphs are small, bounded DAGs |
| Replay fixture incompatibility with resolved WorkOrder digests | Med | Update test fixtures to use valid `sha256:` dependency digests |
| Schema validation overhead in compiler | Low | Schemas are cached and compiled once |

## Rollback Plan

Revert the remediation commits. Since K4a operates as a non-mutating compiler and replay harness without runtime worker authority, reverting restores v2.45.0 behavior without corrupting repository state.

## Dependencies

- K3 Execution Identities (`computeWorkOrderId`, `validateWorkOrderBinding`).

## Success Criteria

- [ ] WorkOrder v2 dependencies materialize as valid `sha256:` digests and validate against `work-order/v2.schema.json`.
- [ ] `compileWorkOrdersV2` atomically rejects invalid graphs/orders via canonical schema validators.
- [ ] Obligation manifest enforces 100% reconciliation against authoritative `contract.obligations`.
- [ ] Clarify invalidates graph nodes and replay rejects stale fixtures fail-closed.
- [ ] `policy_snapshot_id` is required in ExecutionGraph and bound into `GraphId`.
- [ ] `compileExecutionGraph` rejects cycles and returns immutable cloned objects.
- [ ] Shadow comparator and replay engine enforce strict, hardened comparison and closed completion.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
