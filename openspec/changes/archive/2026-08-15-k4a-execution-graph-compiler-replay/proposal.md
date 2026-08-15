# Proposal: K4a — Execution Graph Compiler, Obligation Manifest, and Deterministic Replay

## Intent

Implement K4a of the harness evolution roadmap (`docs/roadmaps/harness-evolution.md`, lines 780-853; `docs/architecture/harness-evolution.md`). K4a establishes the semantic Execution Graph compiler for localized Repair routes, introduces the Obligation Manifest as an internal deterministic view ensuring all `MUST` contract obligations map to semantic nodes with required evidence, formally binds `SourceSnapshot` provenance (`source_snapshot_id`) and reproducible `PolicySnapshot` digests (effectiveRules/versions) to Graph ID, provides typed clarify events with descendant-scoped invalidation, validates declarative Work Order v2 shapes with explicit SourceSnapshot provenance, and enables fixture-based deterministic replay and shadow compiled decision comparison against the fixed reference baseline without executing live worker runtime authority while preserving the frozen WorkOrder v1 contract.

## Scope

### In Scope
- **Execution Graph semantic schema**: Semantic nodes (objective, dependencies, ownership, allowed paths, invariants, required evidence, budget ref), formal `source_snapshot_id` binding, and deterministic Graph ID coupled to contract digest, `policyBundleDigest`, and `source_snapshot_id`.
- **Compiler for localized Repair routes**: Deterministic graph compilation for localized and reproducible bug-repair scenarios.
- **Obligation Manifest**: Internal deterministic view within Execution Graph where every `MUST` obligation is implemented by a node and backed by required evidence or an explicit recorded deferral.
- **`PolicySnapshot` of compile**: Digest of policy bundle, compiler/classifier/runtime versions, and calculated `effectiveRules`.
- **Validation & Conformance**: Fail-closed rejection of microscopic `read`/`edit`/`test` nodes via schema and contract-lint rules.
- **Typed `ClarifyEvent`**: Subgraph invalidation and recompilation scoped strictly to declared descendant nodes.
- **Declarative `WorkOrder` v2 shapes & compilation**: Atomic graph and provenance validation, schema validation, and conformance without issuing execution authority while preserving legacy v1 compatibility.
- **Shadow comparison**: Side-by-side comparison of compiled decisions against fixed reference flow under identical inputs without mutating active state.
- **Deterministic replay engine**: Replay using test fixtures without instantiating or invoking live worker runtime authority.
- **Reference target**: Conformance verification against Headless Conformance Host and K2a adapter.

### Out of Scope
- Issuing `WorkOrder`s with live execution authority (deferred to K6a).
- Executing new workers in runtime, isolated or unisolated (deferred to K6a).
- Live `WorkResult` capture or Candidate integration/freeze generation (K6a/K3).
- Independent verification, review, receipt generation, or delivery authorization (K6b, K7, K8, K10-delivery).
- Multi-worker orchestration (K4b) or mutating existing default routing.

## Capabilities

### New Capabilities
- `execution-graph-compiler`: Execution Graph semantic schema & compiler for Repair routes with SourceSnapshot provenance binding, internal Obligation Manifest view, PolicySnapshot compile binding, typed clarify descendant invalidation/recompilation, atomic Work Order v2 compilation, shadow comparison vs fixed flow, and fixture-based replay without live runtime worker authority.

### Modified Capabilities
- `kernel-contract-schemas`: Register versioned JSON Schemas and valid/invalid fixtures for Execution Graph v1 (with `source_snapshot_id`), PolicySnapshot v1, ClarifyEvent v1, and declarative Work Order v2 shapes with strict non-aliasing rules.
- `contract-lint`: Enforce checkers rejecting microscopic `read/edit/test` graph nodes and verifying Obligation Manifest completeness.
- `lifecycle-model-conformance`: Promote PolicySnapshot, SourceSnapshot provenance binding, and Execution Graph compile/replay invariants from opaque/deferred status to executable model checks without activating live worker execution.

## Approach

Implement the compiler module in `scripts/lib/` to transform change contracts, SourceSnapshot provenance, and classification into a semantic DAG containing an embedded Obligation Manifest. Bind `PolicySnapshot` and `source_snapshot_id` to derive unique, deterministic Graph IDs from `contract_digest`, `policy_bundle_digest`, and `source_snapshot_id`. Implement typed clarify events that compute affected transitive closures and recompile only descendant subgraphs. Provide atomic WorkOrder v2 compilation verifying full graph integrity and provenance before emission. Integrate shadow comparison logic evaluating compiled graph decisions side-by-side with fixed routing, and implement a deterministic replay runner using fixed fixtures without invoking runtime execution transports. Add contract lint rules rejecting microscopic worker actions as graph nodes.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `schemas/kernel/` | Modified | Add/update JSON schemas and fixtures for Execution Graph (with source_snapshot_id), PolicySnapshot, ClarifyEvent, and Work Order shapes |
| `scripts/lib/` | New/Modified | Compiler, Obligation Manifest view, PolicySnapshot digest, clarify invalidation, atomic Work Order compiler, shadow comparison, and fixture replay |
| `openspec/specs/execution-graph-compiler/` | New | Specification for Execution Graph compiler, Obligation Manifest, PolicySnapshot, provenance binding, and replay |
| `openspec/specs/kernel-contract-schemas/` | Modified | Delta spec for Execution Graph, PolicySnapshot, ClarifyEvent, and Work Order contract schemas |
| `openspec/specs/contract-lint/` | Modified | Delta spec for microscopic node rejection and obligation manifest checkers |
| `openspec/specs/lifecycle-model-conformance/` | Modified | Delta spec for model checks of compile/replay invariants |
| `scripts/**/*.test.js` | New/Modified | Unit, integration, and conformance tests for compiler, replay, shadow comparison, and invalidation |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Divergence between fixed baseline and shadow-compiled decisions | Med | Run shadow comparison as non-mutating observer with identical inputs and structured diff logs |
| Graph invalidation cascades causing unnecessary full recompilation | Med | Implement strict DAG transitive dependency tracking to invalidate only exact descendant nodes |
| Policy bundle drift across runtime environments | Low | Pin compiler/classifier versions and compute deterministic `policy_bundle_digest` in `PolicySnapshot` |
| Provenance bypass or graph escalation during compilation | Low | Enforce strict cryptographic binding of SourceSnapshot into Execution Graph and atomic validation in compileWorkOrdersV2 |

## Rollback Plan

Revert the commit/PR implementing K4a. Because K4a operates in shadow and fixture replay mode without mutating active runtime state, issuing live execution authority, or executing workers, reverting leaves existing fixed execution routes and kernel state completely undisturbed.

## Dependencies

- Prerequisites: K2a (Headless Conformance Host / real adapter) and K3 (Execution Identities and Candidate freeze).

## Success Criteria

- [ ] Execution Graph schema rejects microscopic `read/edit/test` nodes via contract lint and schema validation.
- [ ] Graph ID is deterministic and uniquely binds `contract_digest`, `policy_bundle_digest`, and `source_snapshot_id`.
- [ ] Obligation Manifest guarantees every `MUST` obligation has `implemented_by` + `required_evidence` or explicit recorded deferral.
- [ ] Clarify event invalidates only declared descendant nodes in the Execution Graph, preserving valid prior node outputs.
- [ ] Work Order v2 compilation validates graph and SourceSnapshot atomically before emitting orders with zero execution authority.
- [ ] Shadow comparison executes side-by-side with fixed flow under identical inputs without altering active workflow state.
- [ ] Fixture replay executes deterministically without instantiating or executing runtime worker authority.
