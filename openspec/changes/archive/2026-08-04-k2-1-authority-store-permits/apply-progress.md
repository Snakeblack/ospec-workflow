# Apply Progress: k2-1-authority-store-permits

**Mode**: Strict TDD  
**Delivery**: size:exception (delivery-001 / exception-ok; full change in one batch)  
**Branch**: `feat/k2-1-authority-store-permits`  
**Started**: 2026-08-04T19:10:00.000Z  
**Completed**: 2026-08-04T21:30:00.000Z  
**Status**: apply done (54/55 checklist items; 10.5 orchestrator-owned)

## Pinned apply constants

| Constant | Value |
|----------|-------|
| Default `subject_id` | `lifecycle:default` |
| Revision domain | `authority-store:revision` |
| Revision payload | `{ state_digest, journal_digest }` |
| Reason codes | `cas-conflict`, `stale-revision`, `stale-permit`, `permit-reuse`, `permit-not-runtime-issued`, `unauthorized`, `effect-class-required`, `irreversible-ambiguous`, `subject-not-found`, `direct-write-blocked`, `authority-store-required` |
| Default persist-node `effect_class` | `idempotent-keyed` |
| OperationReceipt kind | `operation-receipt/v1` (≠ `receipt/v1`) |

## Task 1.1 — Inventory (baseline fingerprints)

| Path | Role | Baseline sha256 |
|------|------|-----------------|
| `scripts/lib/lifecycle-kernel/index.js` | `runKernelOperation`, `createMemoryStore`, public commit | `sha256:ea0ed8ab987ff42cc0edbd77b28aca6238db6646864a46abddec236a12671cea` |
| `scripts/lib/lifecycle-kernel/operations.js` | authorize boundary (token today) | `sha256:48de2b4cbfaf95ebe5046b1450a42fd87a725bd9d6a651770ffabe986b4e2c58` |
| `scripts/lib/lifecycle-kernel/reducer.js` | effect intents (no class yet) | `sha256:2482fd885dee7f055a979b23c32e4440cb5903a5fbea43be72fd92f330218b2b` |
| `scripts/lib/lifecycle-kernel/journal.js` | reconcile / effect ids | `sha256:382f2ab316e38ecf81211f9c7df5173a26a678ca64d072ea9b3326db62fc0ecf` |
| `scripts/lib/lifecycle-kernel/bridges.js` | OpenSpec/Git sole authority bridges | `sha256:8bfe346e7b33a0fb63cd6ab309be37bda7ef0bc399362423977534983148dcbc` |
| `scripts/lib/lifecycle-kernel/scope-guard.js` | K2 forbidden Host/Candidate/… | `sha256:648f1a4f81a40e69a7e2fa668e2dc738e12b9d50958d56bcd41409249b66d942` |
| `scripts/lib/minimal-kernel-harness.js` | public harness entry | `sha256:23f115525d66bede905b040e3b63d5bb97b1ea380415147939f20868bccec870` |
| `scripts/lib/lifecycle-model.js` | model checkers + deferred list | `sha256:afb4b4e0013e7870f8cc57bebc1cd3b3b80c80821cd05a01e1de4df49a12f697` |
| `schemas/kernel/manifest.json` | family inventory | `sha256:7ddebfd11045e461309f80887cd14bb435af349f0829d533da5ac5a1dfc3e678` |
| `schemas/kernel/receipt/v1.schema.json` | must remain unchanged family | `sha256:40f9a7566101c5efb13e2a51b78b8782975d85f6c59c27db25093362ea04a9cf` |

**Scope guards (MUST NOT implement):** K2a HostCapabilities/transports/CapabilityProof; K3 Candidate identities; K4a Graph/Obligation Manifest; K8/K10 attestation/delivery; crypto signatures; global defaults / fixed-policy changes.

## Implementation notes

- CAS mid-op durability: `commitJournal` advances journal_digest; `compareAndSwap` accepts mid-op journal when `state_digest` matches the baseline captured at `load` for `expectedRevision` (concurrent state writers still `cas-conflict`).
- Runtime path auto-mints permits (`mintPermit: true` default); token-only / fabricated permits fail closed.
- Bare `createMemoryStore.commit` rejected by `runKernelOperation` (`authority-store-required`).
- K1 compat: K2.1 schema families excluded from K1 frozen inventory / schema-file enumeration; manifest + contract-claims digests re-pinned for additive families.

## Batch log

### Batch 1 — Full size:exception apply

- Phases 1–10 implemented and verified locally (`npm test` green).
- Task 10.5 left open (orchestrator 4R after verify).

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 1.1 | N/A (inventory) | Structural | N/A | ➖ | ➖ | ➖ Single | ➖ | Inventory-only |
| 1.2 | `lifecycle-kernel/k21-scope-guard.test.js` | Unit | ✅ scope-guard baseline | ✅ Written | ✅ Passed | ✅ Host/Candidate/CapabilityProof/Obligation | ✅ Extended forbidden patterns | |
| 1.3 | `lifecycle-kernel/k21-k1-compat.test.js` | Contract | ✅ receipt baseline digest | ✅ Written | ✅ Passed | ✅ receipt≠op-receipt | ➖ | |
| 2.1–2.6 | `k21-schema-fixtures.test.js` | Contract | N/A (new) | ✅ Written | ✅ Passed | ✅ valid/invalid + receipt/v1 reject | ✅ effect-class as object | |
| 3.1–3.7 | `authority-store/index.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ stale/conflict/replay/missing | ✅ mid-op journal CAS | |
| 4.1–4.8 | `lifecycle-kernel/permits.test.js` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ stale/reuse/offer/token/forged | ➖ | |
| 5.1–5.6 | `effect-policy.test.js` + reducer/index | Unit | ✅ reducer/journal suites | ✅ Written | ✅ Passed | ✅ class table + irreversible + direct-write | ✅ journal class-aware | |
| 6.1–6.6 | `lifecycle-kernel/index.test.js` | Integration | ✅ prior kernel tests | ✅ Written | ✅ Passed | ✅ bare commit / budgets | ✅ memory-store extract | |
| 7.1–7.6 | `minimal-kernel-harness.test.js` | Integration | ✅ harness matrix | ✅ Written | ✅ Passed | ✅ CAS/stale/reuse/irreversible/fixed | ✅ authority store harness | |
| 8.1–8.5 | `lifecycle-model.test.js` | Unit | ✅ model suite | ✅ Written | ✅ Passed | ✅ 7 checkers + self-grant | ✅ async checkers | |
| 9.1–9.3 | `bridges.test.js` + `k21-maturity-docs.test.js` | Unit/Contract | ✅ bridges | ✅ Written | ✅ Passed | ✅ permit≠OpenSpec override | ➖ | |
| 10.1–10.3 | focused + `npm test` | Suite | ✅ full suite | ✅ | ✅ 1870+ pass | ✅ mutation cases in harness/index | ➖ | |
| 10.4 | `verify-report.md` | Evidence | N/A | ➖ | ✅ Written | ➖ | ➖ | Apply-time REQ→evidence map; formal verify still owns PASS |
| 10.5 | N/A | Gate | N/A | ➖ | ➖ | ➖ | ➖ | Orchestrator-owned |

### Test Summary
- **Focused K2.1 tests**: 86/86 passing (pre full-suite)
- **Full `npm test`**: All checks passed (exit 0)
- **Layers used**: Unit, Contract, Integration
- **Approval tests**: N/A — additive modules; existing harness/kernel suites as safety net
- **Pure functions**: `computeRevision`, `applyEffectPolicy`, `authorizeMutation`, `blockDirectWrite`, etc.

```json:strict-tdd-evidence
{
  "schema_version": 1,
  "change": "k2-1-authority-store-permits",
  "evidence_mode": "live",
  "cycles": [
    {
      "task": "1.2",
      "test_file": "scripts/lib/lifecycle-kernel/k21-scope-guard.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/lifecycle-kernel/k21-scope-guard.test.js" }
    },
    {
      "task": "2.1-2.6",
      "test_file": "scripts/lib/k21-schema-fixtures.test.js",
      "layer": "contract",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/k21-schema-fixtures.test.js" }
    },
    {
      "task": "3.1-3.7",
      "test_file": "scripts/lib/authority-store/index.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/authority-store/index.test.js" }
    },
    {
      "task": "4.1-4.8",
      "test_file": "scripts/lib/lifecycle-kernel/permits.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "none-needed",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/lifecycle-kernel/permits.test.js" }
    },
    {
      "task": "5.1-5.6",
      "test_file": "scripts/lib/lifecycle-kernel/effect-policy.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/lifecycle-kernel/effect-policy.test.js" }
    },
    {
      "task": "6.1-6.6",
      "test_file": "scripts/lib/lifecycle-kernel/index.test.js",
      "layer": "integration",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/lifecycle-kernel/index.test.js" }
    },
    {
      "task": "7.1-7.6",
      "test_file": "scripts/lib/minimal-kernel-harness.test.js",
      "layer": "integration",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/minimal-kernel-harness.test.js" }
    },
    {
      "task": "8.1-8.5",
      "test_file": "scripts/lib/lifecycle-model.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/lifecycle-model.test.js" }
    },
    {
      "task": "9.1-9.2",
      "test_file": "scripts/lib/lifecycle-kernel/bridges.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "none-needed",
      "provenance": { "source": "working-tree", "command": "node --test scripts/lib/lifecycle-kernel/bridges.test.js" }
    },
    {
      "task": "10.2",
      "test_file": "npm test",
      "layer": "suite",
      "red": "n/a",
      "green": "passed",
      "triangulate": "n/a",
      "refactor": "n/a",
      "provenance": { "source": "working-tree", "command": "npm test" }
    }
  ]
}
```
