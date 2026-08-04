# Apply Progress: k2a-headless-conformance-host

**Mode**: Strict TDD  
**Delivery**: size:exception (size-exception-001 / exception-ok; full change in one batch)  
**Branch**: `feat/k2a-headless-conformance-host`  
**Started**: 2026-08-04T21:22:00.000Z  
**Completed**: 2026-08-04T23:30:00.000Z  
**Status**: apply done (53/54 checklist items; 11.5 orchestrator-owned)

## Pinned apply constants

| Constant | Value |
|----------|-------|
| Capability states | `enforced \| partial \| instructional \| unavailable` |
| Required transports | `ExecutionTransport`, `QuestionTransport`, `WorkerTransport`, `ToolExecutionTransport`, `DeliveryGateTransport` |
| CapabilityProof domain | `capability-proof/v1` |
| Digest | `sha256Fingerprint("capability-proof/v1", { capability_id, adapter_version, host_version, fixture, evidence })` |
| Sole activated adapter | `claude` |
| Claude fixture root | `scripts/lib/host-adapters/claude/fixtures/` |
| Conformance kind | `headless-conformance-host/v1` |
| Harness kind | `minimal-kernel-harness/v1` |
| Stable reason codes | `unknown-capability-state`, `missing-transport-port`, `authority-surface-rejected`, `policy-owning-transport`, `silent-promotion-refused`, `proof-missing`, `proof-field-missing`, `digest-mismatch`, `proof-verification-failed`, `lifecycle-duplication`, `graph-duplication`, `host-fault-timeout`, `host-fault-cancel`, `host-fault-worker-fail`, `host-fault-interrupt`, `sole-adapter-gate-failed`, `inactive-adapter-stub` |

## Task 1.1 — Inventory (baseline fingerprints)

| Path | Role | Baseline sha256 |
|------|------|-----------------|
| `scripts/lib/lifecycle-kernel/index.js` | `runKernelOperation` public commit | `sha256:240cb9d79d07f1d208e142bd4126885adc13d89dfd5cd6b5250724836fbdaf24` |
| `scripts/lib/lifecycle-kernel/scope-guard.js` | K2 forbidden symbols (revised in Phase 7) | `sha256:2fdb25090892519c54f06aadae9c0b4817d5f8ca920fdaaf1434e9f98af27b99` |
| `scripts/lib/lifecycle-kernel/operations.js` | authorize boundary | `sha256:c02c658b663537b74209a867e2c2fb39b9e958ffaa9c225a96f32817f93a4c4b` |
| `scripts/lib/minimal-kernel-harness.js` | protocol harness peer | `sha256:04145f84e98f5804e33f4af47d4de117c8575b20297eb1a697a67060418d23ac` |
| `scripts/lib/lifecycle-model.js` | model checkers + deferred | `sha256:88bfd7e5bd2b254cfe5e6a83acff830fa50ffcb4b2209d236bc75a78edf1c344` |
| `scripts/lib/authority-canon.js` | OpenSpec/Git authority | `sha256:eed982268009beb9c6555304fb42f94eb102526c57d695b1d8d644099000b4c0` |
| `scripts/lib/target-profiles/claude.js` | Claude profile | `sha256:b06dd9ff01074d843e5ea6a36d10fa42c7048454c6a027d233a2d2067f6b5040` |
| `schemas/kernel/manifest.json` | family inventory (pre-K2a) | `sha256:0dc17c0f7292f45a4aaa237bb5150edb353abc455ca5c63e08ee17c6d3193700` |
| `schemas/kernel/receipt/v1.schema.json` | must remain unchanged | `sha256:40f9a7566101c5efb13e2a51b78b8782975d85f6c59c27db25093362ea04a9cf` |
| `schemas/kernel/operation-permit/v1.schema.json` | K2.1 pin | `sha256:f8604ed66a64013ab7912ea425a752409430e2741f946f9e2b76dab331ef0adf` |
| `schemas/kernel/operation-receipt/v1.schema.json` | K2.1 pin | `sha256:6d040cf1826cb67ed4932de028bd039d72d9ddbc81a3f6d7e5dc1bdcce029ca0` |
| `schemas/kernel/effect-class/v1.schema.json` | K2.1 pin | `sha256:48e60ed54af27f06eb99708d535670cb9cea9e4a748709d8f9da95e798a8716e` |

**Scope guards (MUST NOT implement):** K3 Candidate freeze; K4a Graph/Obligation Manifest; K8/K10 attestation/delivery policy; crypto signatures; activating non-claude product adapters.

## Implementation notes

- Headless Conformance Host is a peer fixture (`headless-conformance-host/v1`), not a product adapter; Minimal Kernel Harness peers via `peerHostFaultMatrix`.
- CapabilityProof digests bind `capability_id` as verifier input (not a proof schema field) to prevent cross-capability replay.
- Scope-guard revised: generic `host-contract` allowed; concrete `host-adapters/claude` / `AskUserQuestion` / `createClaudeHostAdapter` rejected in lifecycle-kernel.
- K1 compat: K2a schema families excluded from frozen K1 file enumeration; `manifest.json` + `contract-claims.json` digests re-pinned for additive families.
- Claude `enforced` capabilities use committed fixtures under `scripts/lib/host-adapters/claude/fixtures/*.json`.

## Batch log

### Batch 1 — Full size:exception apply

- Phases 1–11 implemented and verified locally (`npm test` green).
- Task 11.5 left open (orchestrator 4R after verify).

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 1.1 | N/A (inventory) | Structural | N/A | ➖ | ➖ | ➖ Single | ➖ | Inventory-only |
| 1.2 | `lifecycle-kernel/k2a-scope-guard.test.js` | Unit | ✅ scope-guard | ✅ Written | ✅ Passed | ✅ K3/K4a/K8/K10 | ✅ Concrete-host patterns | |
| 1.3 | `k2a-schema-fixtures.test.js` | Contract | ✅ K2.1 digest pins | ✅ Written | ✅ Passed | ✅ receipt≠proof | ➖ | |
| 2.1–2.6 | `k2a-schema-fixtures.test.js` | Contract | N/A (new) | ✅ Written | ✅ Passed | ✅ 8 families + invalid | ✅ fixtures | |
| 3.1–3.7 | `host-contract/index.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ states/ports/policy | ✅ normalize outcome | |
| 4.1–4.5 | `capability-proof/index.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ mismatch/replay/timestamp ban | ✅ | |
| 5.1–5.5 | `headless-conformance-host.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 4 faults + dup + bytes | ✅ | |
| 6.1–6.6 | `host-adapters/registry.test.js` + `claude.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ sole/inactive/proof | ✅ no CAS getters | |
| 7.1–7.5 | `host-boundary.test.js` + scope-guard | Unit | ✅ kernel suite | ✅ Written | ✅ Passed | ✅ ports≠brand + CAS | ✅ import-line scan | |
| 8.1–8.4 | `minimal-kernel-harness.test.js` | Integration | ✅ harness matrix | ✅ Written | ✅ Passed | ✅ peer + K2.1 fixtures | ✅ peerHostFaultMatrix | |
| 9.1–9.4 | `lifecycle-model.test.js` | Unit | ✅ model suite | ✅ Written | ✅ Passed | ✅ 6 checkers | ✅ | |
| 10.1–10.4 | `authority-canon.test.js` + maturity docs | Unit/Contract | ✅ canon | ✅ Written | ✅ Passed | ✅ adapter≠authority | ➖ | |
| 11.1–11.3 | focused + `npm test` | Suite | ✅ full suite | ✅ | ✅ All checks passed | ✅ mutation cases | ➖ | |
| 11.4 | `verify-report.md` | Evidence | N/A | ➖ | ✅ Written | ➖ | ➖ | Apply-time REQ→evidence map |
| 11.5 | N/A | Gate | N/A | ➖ | ➖ | ➖ | ➖ | Orchestrator-owned |

### Test Summary
- **Focused K2a tests**: passing (schema/host-contract/proof/conformance/adapters/boundary/model/harness)
- **Full `npm test`**: All checks passed (exit 0)
- **Layers used**: Unit, Contract, Integration
- **Approval tests**: N/A — additive modules; existing harness/kernel suites as safety net
- **Pure functions**: `createEvidenceDigest`, `verifyCapabilityProof`, `resolveCapabilityState`, `createHostAdapter`, `runConformanceScenario`, `runHostFaultMatrix`

```json:strict-tdd-evidence
{
  "schema_version": 1,
  "change": "k2a-headless-conformance-host",
  "evidence_mode": "live",
  "cycles": [
    {
      "task": "1.2",
      "test_file": "scripts/lib/lifecycle-kernel/k2a-scope-guard.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/lifecycle-kernel/k2a-scope-guard.test.js" }
    },
    {
      "task": "2.1-2.6",
      "test_file": "scripts/lib/k2a-schema-fixtures.test.js",
      "layer": "contract",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/k2a-schema-fixtures.test.js" }
    },
    {
      "task": "3.1-3.7",
      "test_file": "scripts/lib/host-contract/index.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/host-contract/index.test.js" }
    },
    {
      "task": "4.1-4.5",
      "test_file": "scripts/lib/capability-proof/index.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/capability-proof/index.test.js" }
    },
    {
      "task": "5.1-5.5",
      "test_file": "scripts/lib/headless-conformance-host.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/headless-conformance-host.test.js" }
    },
    {
      "task": "6.1-6.6",
      "test_file": "scripts/lib/host-adapters/registry.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/host-adapters/registry.test.js scripts/lib/host-adapters/claude.test.js" }
    },
    {
      "task": "7.1-7.5",
      "test_file": "scripts/lib/lifecycle-kernel/host-boundary.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/lifecycle-kernel/host-boundary.test.js" }
    },
    {
      "task": "8.1-8.4",
      "test_file": "scripts/lib/minimal-kernel-harness.test.js",
      "layer": "integration",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/minimal-kernel-harness.test.js" }
    },
    {
      "task": "9.1-9.4",
      "test_file": "scripts/lib/lifecycle-model.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/lifecycle-model.test.js" }
    },
    {
      "task": "10.1-10.4",
      "test_file": "scripts/lib/authority-canon.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "none",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/authority-canon.test.js scripts/lib/k2a-maturity-docs.test.js" }
    },
    {
      "task": "11.1-11.3",
      "test_file": "npm test",
      "layer": "suite",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "none",
      "provenance": { "source": "working-tree", "command": "npm test" }
    }
  ]
}
```

## 4R CRITICAL remediation (2026-08-04T22:28:00Z)

Remediation of frozen findings F-269166e09a7e1851, F-362e5e5cf6161f07, F-8d40b576ef2d9514, F-36d7744fb445f2f5. Budget target ≤200 changed lines. No `.4r/` lineage writes.

### Per-finding notes

| Finding | Fix | Acceptance |
|---------|-----|------------|
| F-269166e09a7e1851 | Shared `transportOwnsAuthority` probes full `AUTHORITY_SURFACE_KEYS` in `assertTransportPorts` + `detectDuplication` | snake_case `mint_permit` etc. rejected; camelCase still rejected |
| F-362e5e5cf6161f07 | `invokePort` try/catch → `{ok:false,outcome:"error",code}` | throwing ports do not abort loop; scenario completes pass:false |
| F-8d40b576ef2d9514 | fault==null pass requires `normalizeTransportOutcome(...).ok === true` + stable reason_code | `{ok:false,outcome:"timeout"}` without fault → pass:false |
| F-36d7744fb445f2f5 | `selectEnforcementFailureReason` if/else ≤2 nesting | behavior preserved; existing matrix tests still green |

### TDD Cycle Evidence (remediation)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
| ---- | --- | ----- | ---- | --- | ----- | ----- | ----- | ----- |
| F-269166e09a7e1851 | host-contract/index.test.js + headless-conformance-host.test.js | unit | 16 pass | fail snake_case aliases | pass | 4 snake_case keys + existing camelCase | shared helper | AUTHORITY_SURFACE_KEYS denylist |
| F-362e5e5cf6161f07 | headless-conformance-host.test.js | unit | 16 pass | throw aborts | catch+normalize | two throwing ports + remaining ok | normalize in invokePort | transport-invoke-error / err.code |
| F-8d40b576ef2d9514 | headless-conformance-host.test.js | unit | 16 pass | ok:false still pass | require ok===true | timeout code path | reason_code from outcome | fault==null gate |
| F-36d7744fb445f2f5 | capability-proof/index.test.js | unit | 16 pass | N/A (behavior-preserving) | existing 4 pass | matrix covered by existing tests | extract helper | ≤2 nesting |

```json:strict-tdd-evidence
{
  "schema_version": 1,
  "change": "k2a-headless-conformance-host",
  "mode": "strict_tdd",
  "batch": "4r-critical-remediation",
  "cycles": [
    {
      "task": "F-269166e09a7e1851",
      "test_file": "scripts/lib/host-contract/index.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/host-contract/index.test.js scripts/lib/headless-conformance-host.test.js" }
    },
    {
      "task": "F-362e5e5cf6161f07",
      "test_file": "scripts/lib/headless-conformance-host.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/headless-conformance-host.test.js" }
    },
    {
      "task": "F-8d40b576ef2d9514",
      "test_file": "scripts/lib/headless-conformance-host.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/headless-conformance-host.test.js" }
    },
    {
      "task": "F-36d7744fb445f2f5",
      "test_file": "scripts/lib/capability-proof/index.test.js",
      "layer": "unit",
      "red": "skipped-behavior-preserving",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/capability-proof/index.test.js" }
    }
  ]
}
```
