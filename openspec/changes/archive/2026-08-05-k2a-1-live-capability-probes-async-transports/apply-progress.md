# Apply Progress: k2a-1-live-capability-probes-async-transports

**Mode**: Strict TDD  
**Delivery path**: size:exception (exception-ok / delivery-001)  
**Working branch**: `feat/k2a-1-live-capability-probes-async-transports`  
**Batch**: 1 (full apply stream — phases 1–5)  
**Status**: complete — ready for verify

## Task 1.1 — Inventory

### K2a module paths (in-scope)

| Path | Role |
|------|------|
| `scripts/lib/capability-proof/index.js` | Proof digest + object verify + `createProbeDigest` |
| `scripts/lib/capability-proof/index.test.js` | Live-bind unit tests |
| `scripts/lib/host-contract/index.js` | `invokeTransportAsync`, classify, deep-freeze |
| `scripts/lib/host-contract/index.test.js` | Async / freeze / resolve tests |
| `scripts/lib/host-adapters/claude.js` | Probe-gated `enforced` |
| `scripts/lib/host-adapters/claude.test.js` / `registry.test.js` | Claude + registry |
| `scripts/lib/headless-conformance-host.js` | Async invoke + fault-via-port |
| `scripts/lib/lifecycle-kernel/host-boundary.js` | Async observe |
| `scripts/lib/lifecycle-model.js` | Invariant checkers (object verify) |
| `scripts/lib/minimal-kernel-harness.js` | Peer + W4 harness-alone coverage |
| `scripts/lib/k2a-schema-fixtures.test.js` | Additive families + transport pins |
| `schemas/kernel/capability-proof/**` | `adapter_id` + `probe_digest` |
| `schemas/kernel/transport-{request,outcome,failure}/**` | New envelope families |
| `schemas/kernel/manifest.json` / `contract-claims.json` | Family registry + claims |

### Pre-change transport schema content pins

| Family | Content sha256 (LF-normalized) |
|--------|--------------------------------|
| execution-transport | `c31ee709e34f155f64db05448fc45b5f8cc4f08fe4ce1ef15b4a6a36638fd786` |
| question-transport | `5c6e6073d826d8893aee903eb3ee3b2e765eb4bcd224c3bc1c6bac5dced644ff` |
| worker-transport | `bf9e79362ca1f4c5127099ae73712b3c8da44dd6841c1ab75bee36696db0c128` |
| tool-execution-transport | `eb1f399f9c47bbd2e678997f85234b4285c317594b17c36523fc856d707b0c3e` |
| delivery-gate-transport | `a792a5c858133ea6823f2ab84a46cc509fb8a78d7ed0984e961dcab7326d966a` |

### Stable reason codes (pinned)

`expected-field-missing`, `foreign-adapter`, `foreign-adapter-version`, `foreign-host`, `fixture-digest-not-live-probe`, `digest-mismatch`, `probe-digest-mismatch`

### Probe digest domain

`capability-probe/v1` (distinct from fixture `capability-proof/v1`)

## Completed Tasks

- [x] 1.1 Inventory
- [x] 1.2 Transport v1 `$id` / content pins + K2.1 unchanged
- [x] 1.3 K2.1 CAS/permit (`mintPermit: false`) regression via harness suite
- [x] 2.1–2.7 Proof binding + additive schemas
- [x] 3.1–3.8 Async host-contract + boundary + headless
- [x] 4.1–4.5 Claude probe gate + registry/model migration
- [x] 5.1–5.5 Fault-via-port + W4 harness-alone + full `npm test`

## Deviations from Design

None — implementation matches design.md / ADR-001–003.

Notes (non-blocking):
- `transport-outcome` contradictory `ok:true` + `failure_class` enforced via supported `if`/`then` (`failure_class: false`) because the constrained schema interpreter does not support `not` / `dependentSchemas`.
- K1 inventory carve-outs extended for additive envelope families + updated `manifest.json` / `contract-claims.json` digests (same pattern as prior K2a additive families).

## Issues Found

None blocking. Full `npm test` green after K1 carve-outs / contract-claims registration.

## Workload / PR Boundary

- Mode: size:exception (single PR)
- Boundary: full task list phases 1–5 in one apply stream
- Estimated review budget impact: High (forecast 700–950; exception pre-approved)

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 1.1 | N/A | Inventory | N/A | ➖ | ➖ | ➖ | ➖ | Triangulation skipped: inventory-only |
| 1.2 | `k2a-schema-fixtures.test.js` | Contract | ✅ 18/18 | ✅ Written | ✅ Passed | ✅ pins + $ids | ✅ Clean | Five transport content pins |
| 1.3 | `minimal-kernel-harness.test.js` | Integration | ✅ harness green | ✅ Written | ✅ Passed | ✅ mintPermit false + CAS | ➖ None needed | K2.1b defaults unchanged |
| 2.1–2.2 | `capability-proof/index.test.js` | Unit | ✅ 4/4 | ✅ Written | ✅ Passed | ✅ foreign/fixture≠probe | ✅ Clean | Object verify + live bind |
| 2.3–2.5 | `k2a-schema-fixtures.test.js` | Contract | ✅ pins | ✅ Written | ✅ Passed | ✅ 3 families + fixtures | ✅ if/then outcome | Additive envelopes |
| 2.6–2.7 | `capability-proof` + schema pins | Unit/Contract | ✅ | ✅ Written | ✅ Passed | ✅ call-site migrate | ✅ Clean | `createProbeDigest` |
| 3.1–3.4 | `host-contract/index.test.js` | Unit | ✅ host-contract | ✅ Written | ✅ Passed | ✅ reject/abort/freeze | ✅ Clean | Shared invoke path |
| 3.5–3.6 | `host-boundary.test.js` | Unit | ✅ boundary | ✅ Written | ✅ Passed | ✅ reject + CAS gate | ✅ Clean | Async observe |
| 3.7–3.8 | `headless-conformance-host.test.js` | Unit | ✅ headless | ✅ Written | ✅ Passed | ✅ reject≠success | ✅ Clean | Shared invoke |
| 4.1–4.4 | `host-adapters/claude.test.js` | Unit | ✅ claude | ✅ Written | ✅ Passed | ✅ missing/fixture/live | ✅ Clean | Probe-gated enforced |
| 4.5 | `registry.test.js` + `lifecycle-model.js` | Unit | ✅ | ✅ Written | ✅ Passed | ✅ live expected fields | ✅ Clean | Object verify shape |
| 5.1–5.2 | `headless-conformance-host.test.js` | Unit | ✅ | ✅ Written | ✅ Passed | ✅ 4 faults via ports | ✅ wrappers | Synthetic-alone incomplete |
| 5.3–5.4 | `minimal-kernel-harness.test.js` | Integration | ✅ | ✅ Written | ✅ Passed | ✅ alone vs peer | ✅ Clean | W4 runtime negative |
| 5.5 | `npm test` | Suite | ✅ | ✅ Written | ✅ Passed | ✅ full suite | ✅ K1 carve-outs | All checks passed |

### Test Summary

- **Total focused tests written/updated**: ~40+ across proof/host/claude/headless/boundary/harness/schema
- **Full suite**: `npm test` → All checks passed
- **Layers used**: Unit, Contract, Integration, Suite
- **Approval tests**: None — behavior-changing corrective
- **Pure functions**: `createProbeDigest`, `classifyTransportFailure`, `evaluateFaultMatrixCoverage`, `evaluateHarnessAloneHostFaultCoverage`, `deepFreeze`

```json:strict-tdd-evidence
{
  "schema_version": 1,
  "change": "k2a-1-live-capability-probes-async-transports",
  "evidence_mode": "live",
  "mode": "strict_tdd",
  "batch": 1,
  "delivery_path": "size:exception",
  "cycles": [
    {
      "task": "1.2",
      "test_file": "scripts/lib/k2a-schema-fixtures.test.js",
      "layer": "contract",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": {
        "source": "working-tree",
        "command": "node --test scripts/lib/k2a-schema-fixtures.test.js"
      }
    },
    {
      "task": "1.3",
      "test_file": "scripts/lib/minimal-kernel-harness.test.js",
      "layer": "integration",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "none",
      "provenance": {
        "source": "working-tree",
        "command": "node --test scripts/lib/minimal-kernel-harness.test.js"
      }
    },
    {
      "task": "2.1-2.7",
      "test_file": "scripts/lib/capability-proof/index.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": {
        "source": "working-tree",
        "command": "node --test scripts/lib/capability-proof/index.test.js scripts/lib/k2a-schema-fixtures.test.js"
      }
    },
    {
      "task": "3.1-3.4",
      "test_file": "scripts/lib/host-contract/index.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": {
        "source": "working-tree",
        "command": "node --test scripts/lib/host-contract/index.test.js"
      }
    },
    {
      "task": "3.5-3.6",
      "test_file": "scripts/lib/lifecycle-kernel/host-boundary.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": {
        "source": "working-tree",
        "command": "node --test scripts/lib/lifecycle-kernel/host-boundary.test.js"
      }
    },
    {
      "task": "3.7-3.8",
      "test_file": "scripts/lib/headless-conformance-host.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": {
        "source": "working-tree",
        "command": "node --test scripts/lib/headless-conformance-host.test.js"
      }
    },
    {
      "task": "4.1-4.5",
      "test_file": "scripts/lib/host-adapters/claude.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": {
        "source": "working-tree",
        "command": "node --test scripts/lib/host-adapters/claude.test.js scripts/lib/host-adapters/registry.test.js scripts/lib/lifecycle-model.test.js"
      }
    },
    {
      "task": "5.1-5.4",
      "test_file": "scripts/lib/headless-conformance-host.test.js",
      "layer": "unit",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": {
        "source": "working-tree",
        "command": "node --test scripts/lib/headless-conformance-host.test.js scripts/lib/minimal-kernel-harness.test.js"
      }
    },
    {
      "task": "5.5",
      "test_file": "npm test",
      "layer": "suite",
      "red": "written",
      "green": "passed",
      "triangulate": "passed",
      "refactor": "passed",
      "provenance": {
        "source": "working-tree",
        "command": "npm test"
      }
    }
  ]
}
```

## Batch: 4R CRITICAL remediation (F-257363d612b4f8ad, F-42a44346728b7090, F-a23fde0a12e81544, F-ea52b9c672375e23)

**Status**: complete  
**Notes**: See `.4r/remediation-notes.md`

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
| ---- | --- | ----- | ---- | --- | ----- | ----- | ----- | ----- |
| F-257363d612b4f8ad | `scripts/lib/headless-conformance-host.test.js` | unit | 29 pass baseline | written | passed | independent digest vs missing | comment only | no `proof.probe_digest` fallback |
| F-42a44346728b7090 | `scripts/lib/host-adapters/claude.test.js` | unit | 29 pass baseline | written | passed | no-primitive + with-primitive | helper extract | primitive required for enforced |
| F-a23fde0a12e81544 | `scripts/lib/host-adapters/claude.test.js` / `registry.test.js` | unit | 29 pass baseline | written | passed | recomputed digest match | JSDoc + material field | independent expectedProbeDigest |
| F-ea52b9c672375e23 | `scripts/lib/host-contract/index.test.js` | unit | 29 pass baseline | regression lock | passed | timeout+late reject | explicit `.catch` | Promise.race already absorbed; defense-in-depth settlement |

Focused: `node --test` on the four files → 34 pass. Full suite: `npm test`.
