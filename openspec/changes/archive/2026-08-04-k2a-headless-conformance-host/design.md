# Design: K2a Headless Conformance Host, CapabilityProof, and Claude Reference Adapter

## Technical Approach

Use the existing functional-core / imperative-shell split. JSON Schemas define public host contracts; CommonJS modules validate bindings, derive proof digests, and run conformance. The kernel receives host behavior through a generic boundary while reducer, Authority Store, permits, CAS, journal, and receipts remain unchanged.

The Headless Conformance Host owns adapter/transport faults; the peer Minimal Kernel Harness owns protocol/lifecycle scenarios. A registry activates only `claude`; the conformance fixture is never a product adapter.

## Architecture Decisions

### Decision: Publish one schema family per host contract

**Choice**: Give `HostCapabilities`, `HostAdapter`, the five transports, and `CapabilityProof` separate v1 families registered in `manifest.json`; runtime constructors validate states, ports, and authority-free metadata.  
**Alternatives considered**: One aggregate schema (couples independently evolving ports) and runtime-only validation (bypasses the contract suite).  
**Rationale**: Matches K1/K2.1 `$id` pinning and produces precise failures. See ADR-001.

### Decision: Bind CapabilityProof with the canonical digest utility

**Choice**: `verifyCapabilityProof(capabilityId, proof, semanticEvidence)` recomputes `sha256Fingerprint("capability-proof/v1", { capability_id, adapter_version, host_version, fixture, evidence })`; timestamp fields and missing values fail closed.  
**Alternatives considered**: Raw JSON hashing (order/whitespace instability) and receipt reuse (conflates evidence with operation authority).  
**Rationale**: Reuses the canonical digest primitive, retains a proof identity, and prevents silent promotion. See ADR-002.

### Decision: Keep conformance-host faults outside lifecycle authority

**Choice**: A peer conformance runner invokes published ports using deterministic scenario, seed, fault, adapter, and proof inputs; outputs exclude stores, clocks, stacks, and timestamps.  
**Alternatives considered**: Fold faults into Minimal Kernel Harness (merges protocol and host ownership) or adapters (gives products conformance semantics).  
**Rationale**: Keeps fault ownership distinct and permits stable lifecycle/Graph-duplication reason codes. See ADR-003.

### Decision: Activate Claude through a product-adapter registry

**Choice**: Register only `claude`, composed from `target-profiles/claude.js` and injected host primitives; delivery hooks report observations but cannot authorize.  
**Alternatives considered**: Auto-discovery (activates unproven profiles) and a kernel import of Claude (product coupling).  
**Rationale**: Makes the one-host vertical explicit and leaves the other profiles as inactive generator metadata. See ADR-004.

## Data Flow

```text
Claude host primitives                     Deterministic fault fixture
        |                                             |
        v                                             v
Claude HostAdapter ---> HostAdapter/HostCapabilities <--- Headless Conformance Host
        |                    | five opaque ports                |
        |                    v                                  |
        +------------> lifecycle-kernel/host-boundary <---------+
                             |
                    capability state request
                             v
             CapabilityProof verifier ---> stable digest
                             |
                enforced | honest degradation
                             |
                             v
              existing runKernelOperation path
            (OperationPermit + Authority Store CAS)
```

The conformance host injects each fault at a public port. Any lifecycle continuation uses `runHarnessScenario`/`runKernelOperation`; adapters never receive stores, permits, reducers, selectors, or Graph compilers.

## Requirement Allocation

| Requirement set | Design allocation |
|---|---|
| `host-capabilities-contract` 001-005 | `scripts/lib/host-contract/index.js`, eight v1 schema families, contract tests, and authority-surface rejection |
| `capability-proof` 001-004 | `scripts/lib/capability-proof/index.js`; deterministic fixtures and reason-code tests |
| `headless-conformance-host` 001-004 | `scripts/lib/headless-conformance-host.js`; fault-matrix fixtures/tests and stable result serialization |
| `reference-host-adapter` 001-005 | `scripts/lib/host-adapters/registry.js`, `scripts/lib/host-adapters/claude.js`, committed Claude evidence fixtures, registry tests |
| `lifecycle-kernel-runtime` 013-014 | `scripts/lib/lifecycle-kernel/host-boundary.js`; revise `scope-guard.js` from the K2 blanket host ban to concrete-host import/export detection |
| `minimal-kernel-harness` 009-010 | Add an optional peer invocation to `minimal-kernel-harness.js`; retain all fixed/K2.1 scenarios unchanged |
| `kernel-contract-schemas` 001, 008-010 | Add schema families/fixtures, manifest entries, and K2a fixture inventory tests |
| `harness-authority-canon` 005, 007 | Extend `authority-canon.js` to reject adapter claims as semantic authority; update maturity documentation |
| `lifecycle-model-conformance` 003, 004, 008 | Add six non-optional K2a checkers and ensure their ids cannot appear in `DEFERRED_INVARIANTS` |

## File Changes

| File | Action | Description |
|---|---|---|
| `scripts/lib/host-contract/index.js` | Create | Validate states, ports, adapter identity, and authority surface |
| `scripts/lib/capability-proof/index.js` | Create | Verify proof digests and enforcement eligibility |
| `scripts/lib/headless-conformance-host.js` | Create | Deterministic conformance runner and fault matrix |
| `scripts/lib/host-adapters/registry.js` | Create | Explicit active-product registry containing only `claude` |
| `scripts/lib/host-adapters/claude.js` | Create | Translate Claude profile/primitives into five ports |
| `scripts/lib/host-adapters/claude/fixtures/*.json` | Create | Version-pinned proof evidence |
| `scripts/lib/lifecycle-kernel/host-boundary.js` | Create | Kernel-owned generic boundary; no concrete adapter imports |
| `scripts/lib/lifecycle-kernel/scope-guard.js` | Modify | Allow generic ports; reject concrete host imports |
| `scripts/lib/minimal-kernel-harness.js` | Modify | Peer without absorbing host policy |
| `scripts/lib/lifecycle-model.js` | Modify | Register and execute six K2a invariants |
| `scripts/lib/authority-canon.js` | Modify | Keep OpenSpec/Git authoritative |
| `schemas/kernel/{host-capabilities,host-adapter,execution-transport,question-transport,worker-transport,tool-execution-transport,delivery-gate-transport,capability-proof}/**` | Create | Versioned schemas plus valid/invalid fixtures |
| `schemas/kernel/manifest.json` | Modify | Register all K2a families with stable `$id` and version |
| `scripts/lib/kernel-schema-fixtures.test.js` | Modify | Require K2.1/K2a families |
| `scripts/lib/{host-contract,capability-proof}/index.test.js` | Create | Unit coverage for validation, proof binding, and no silent promotion |
| `scripts/lib/{headless-conformance-host,host-adapters/claude}.test.js` | Create | Fault matrix, deterministic output, sole activation, and Claude mappings |
| `scripts/lib/{minimal-kernel-harness,lifecycle-model,authority-canon}.test.js` | Modify | Peer regression, executable invariants, and authority canon |
| `docs/target-capabilities.md` | Modify | Record states and proof-backed Claude activation |
| `docs/architecture/harness-evolution.md`, `docs/roadmaps/harness-evolution.md` | Modify | Update K2a maturity after verification/archive |

## Interfaces / Contracts

```js
// scripts/lib/host-contract/index.js
createHostAdapter({ adapter_id, adapter_version, host_version, capabilities, transports, authority_surface })
resolveCapabilityState({ capability_id, declared_state, proof, semantic_evidence })

// scripts/lib/capability-proof/index.js
createEvidenceDigest({ capability_id, adapter_version, host_version, fixture, evidence })
verifyCapabilityProof(capabilityId, proof, semanticEvidence)

// scripts/lib/headless-conformance-host.js
runConformanceScenario({ scenario_id, seed, adapter, fault, proof_material })
runHostFaultMatrix({ adapter, fixtures })
```

Transports return `{ ok, outcome, code?, value? }`; values are observations, never transitions or authorization verdicts. Stable codes cover faults, proof failures, duplicated semantics, and adapter-owned policy.

`HostCapabilities.capabilities` maps capability ids to closed states. `CapabilityProof` uses kind `capability-proof/v1`; capability id is a verifier input included in the digest, preventing cross-capability replay without adding an unspecified proof field.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Closed states, five ports, forbidden authority surface, digest binding, missing fields, no silent promotion | Node test runner with table-driven valid/invalid cases and deterministic fixtures |
| Contract/schema | Eight families expose `$id`/version; fixtures pass/fail with paths; proof/receipt kinds differ | Extend manifest inventory and use existing dependency-free `kernel-schema-validator` |
| Integration | Claude profile maps into every port; only `claude` activates; all four faults use public ports; repeated results are byte-equivalent | Run adapter through Headless Conformance Host, not private mocks |
| Kernel regression | Host failures do not bypass OperationPermit/CAS; fixed path and K2.1 fault matrix remain green | Peer conformance scenarios with `runHarnessScenario`, plus existing full suite |
| Model conformance | Six K2a invariants are executable/non-deferred and reject counterexamples | Extend `runAllInvariantCheckers` and lifecycle-model tests |
| Structural guard | lifecycle/Graph/receipt modules contain no concrete adapter imports | Scope-guard fixtures covering allowed generic imports and rejected `claude` imports |

Strict TDD apply work follows RED → GREEN → TRIANGULATE → REFACTOR per module. `npm test` remains the verification command; no external Claude CLI is required because version-pinned, committed semantic evidence drives proof tests.

## Migration / Rollout

No data migration or global default change is required. Roll out additively: schemas/core, conformance host, Claude activation, then kernel/model/docs integration. Removing `claude` from the registry disables the binding without changing K2/K2.1 state. Full rollback removes K2a modules/schema entries and restores the prior scope guard while preserving Authority Store, permits, receipts, and fixed fixtures.

## Open Questions

None. The sole reference adapter and all observable K2a behavior are fixed by the persisted specifications and approval ledger.
