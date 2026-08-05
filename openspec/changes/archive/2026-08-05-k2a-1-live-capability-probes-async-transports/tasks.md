# Tasks: k2a-1 — Live Capability Probes + Async Transports

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-capability-proof-005 / live expected identity | MUST | `capability-proof/index.js` object verify + `createProbeDigest` | covered-by-design | fixture digest ≠ probe digest |
| REQ-capability-proof-002 MOD / digest + live bind | MUST | schema `adapter_id`/`probe_digest`; call-site migration | covered-by-design | keep `createEvidenceDigest` |
| REQ-host-capabilities-contract-006 / async invoke | MUST | `host-contract/index.js` `invokeTransportAsync` | covered-by-design | await + catch; no ok:true on reject |
| REQ-host-capabilities-contract-007 / immutable ports | MUST | `createHostAdapter` deep-freeze | covered-by-design | recursive `Object.freeze` |
| REQ-host-capabilities-contract-008 / failure classes | MUST | `classifyTransportFailure` | covered-by-design | timeout/cancel/reject/interrupt/worker-fail |
| REQ-reference-host-adapter-006 / probe-gated enforced | MUST | `host-adapters/claude.js` probe gate | covered-by-design | fixture-only never authorizes |
| REQ-reference-host-adapter-004 MOD / enforced + live verify | MUST | claude + registry tests | covered-by-design | expectedProbeDigest required |
| REQ-headless-conformance-host-005 / await+catch | MUST | `headless-conformance-host.js` shared invoke | covered-by-design | rejection ≠ success |
| REQ-headless-conformance-host-002 MOD / fault via ports | MUST | failing port wrappers + `invokeTransportAsync` | covered-by-design | synthetic inject non-normative |
| REQ-lifecycle-kernel-runtime-017 / boundary async | MUST | `lifecycle-kernel/host-boundary.js` | covered-by-design | permit+CAS gate unchanged |
| REQ-kernel-contract-schemas-011 / envelope families | MUST | `schemas/kernel/transport-{request,outcome,failure}/` | covered-by-design | distinct `$id`s |
| REQ-kernel-contract-schemas-001 MOD / family inventory | MUST | `manifest.json` + pin tests | covered-by-design | five transport `$id`s pinned |
| REQ-minimal-kernel-harness-013 / harness-alone negative | MUST | `minimal-kernel-harness.test.js` runtime assertion | covered-by-design | not prose-only |
| REQ-minimal-kernel-harness-009 MOD / peer vs alone | MUST | harness peer unchanged; negative test proves gap | covered-by-design | ownership stays headless |

### Reconciliation Verdict

- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none — apply MUST pin stable reason-code strings and probe-digest domain in `apply-progress.md`

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 700–950 |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single PR (`size-exception`); logical apply order: proof+schemas → async boundary/headless → Claude gate → fault-via-port + W4 |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Live proof binding + additive schemas | PR 1 (single) | `createProbeDigest`, object verify, three envelope families, CapabilityProof fields |
| 2 | Shared async invoke + deep-freeze + boundary/headless await | PR 1 (single) | `invokeTransportAsync`, `classifyTransportFailure`, host-boundary + headless invoke path |
| 3 | Claude probe-gated `enforced` + call-site migration | PR 1 (single) | no fixture-only enforced; registry + lifecycle-model verify shape |
| 4 | Fault matrix via ports + W4 harness-alone negative | PR 1 (single) | port wrappers; dedicated runtime negative test; K2.1 regression green |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Apply Inventory And Regression Guards

- [x] 1.1 Inventory K2a module paths, baseline fingerprints, and all `verifyCapabilityProof` call sites; record in `apply-progress.md`.
- [x] 1.2 **RED**: test proving five existing transport v1 `$id`s and K2.1 CAS/permit schemas remain unchanged (additive families only). [REQ-kernel-contract-schemas-011]
- [x] 1.3 **RED**: regression guard — K2.1 OperationPermit/CAS paths still pass with `mintPermit: false` defaults after host-contract touchpoints.

## Phase 2: Proof Binding And Additive Schemas (Slice 1)

- [x] 2.1 **RED**: `capability-proof/index.test.js` — object verify rejects missing `expectedAdapterId`/`expectedAdapterVersion`/`expectedHostRuntimeVersion`/`expectedProbeDigest`; foreign adapter/version/host fail closed. [REQ-capability-proof-005]
- [x] 2.2 **RED**: fixture-only digest rejected when `expectedProbeDigest` is distinct live probe (`fixture-digest-not-live-probe`). [REQ-capability-proof-005]
- [x] 2.3 **RED**: `k2a-schema-fixtures.test.js` — three additive families missing; CapabilityProof schema lacks `adapter_id`/`probe_digest`. [REQ-kernel-contract-schemas-011, REQ-kernel-contract-schemas-001]
- [x] 2.4 **GREEN**: extend `schemas/kernel/capability-proof/v1.schema.json` + fixtures with `adapter_id`, `probe_digest` (keep `$id`).
- [x] 2.5 **GREEN**: create `schemas/kernel/transport-request|transport-outcome|transport-failure/v1.schema.json` + valid/invalid fixtures; register in `schemas/kernel/manifest.json`.
- [x] 2.6 **GREEN**: implement `createProbeDigest` (`capability-probe/v1`) and object-form `verifyCapabilityProof` in `scripts/lib/capability-proof/index.js`; migrate in-change call sites. [REQ-capability-proof-002, REQ-capability-proof-005]
- [x] 2.7 **REFACTOR**: pin five transport `$id` hashes and new family `$id`s in `k2a-schema-fixtures.test.js`. [REQ-kernel-contract-schemas-011]

## Phase 3: Async Host-Contract And Boundary (Slice 2)

- [x] 3.1 **RED**: `host-contract/index.test.js` — rejected Promise → `{ ok: false }` with classified failure; never `ok: true`. [REQ-host-capabilities-contract-006, REQ-host-capabilities-contract-008]
- [x] 3.2 **RED**: AbortSignal/deadline → `timeout` or `cancel` with preserved `requestId`. [REQ-host-capabilities-contract-006, REQ-host-capabilities-contract-008]
- [x] 3.3 **RED**: post-`createHostAdapter` port/capability mutation fails closed (deep-freeze). [REQ-host-capabilities-contract-007]
- [x] 3.4 **GREEN**: implement `invokeTransportAsync`, `classifyTransportFailure`, and deep-freeze in `scripts/lib/host-contract/index.js`. [REQ-host-capabilities-contract-006, REQ-host-capabilities-contract-007, REQ-host-capabilities-contract-008]
- [x] 3.5 **RED**: `lifecycle-kernel/host-boundary.test.js` — rejected transport Promise observed as `ok: false`; no authority mint from rejection. [REQ-lifecycle-kernel-runtime-017]
- [x] 3.6 **GREEN**: async `observeHostPort` via shared invoke in `scripts/lib/lifecycle-kernel/host-boundary.js`. [REQ-lifecycle-kernel-runtime-017]
- [x] 3.7 **RED**: `headless-conformance-host.test.js` — rejected port Promise recorded as failure, not success. [REQ-headless-conformance-host-005]
- [x] 3.8 **GREEN**: wire headless host transport observation through `invokeTransportAsync` in `scripts/lib/headless-conformance-host.js`. [REQ-headless-conformance-host-005]

## Phase 4: Claude Probe Gate (Slice 3)

- [x] 4.1 **RED**: `host-adapters/claude.test.js` — missing primitive → `unavailable`|`instructional`|`partial`; never `enforced`. [REQ-reference-host-adapter-006]
- [x] 4.2 **RED**: fixture-only proof without live probe must not mark `enforced`. [REQ-reference-host-adapter-006, REQ-reference-host-adapter-004]
- [x] 4.3 **RED**: live probe + verified proof with expected live identity enables `enforced`. [REQ-reference-host-adapter-006, REQ-reference-host-adapter-004]
- [x] 4.4 **GREEN**: implement probe-gated resolution and async ports in `scripts/lib/host-adapters/claude.js`.
- [x] 4.5 **GREEN**: update `host-adapters/registry.test.js` and `lifecycle-model.js` invariant checkers for object verify + live expected fields. [REQ-reference-host-adapter-004]

## Phase 5: Fault-Via-Port, W4 Negative, And Integration (Slice 4)

- [x] 5.1 **RED**: fault-matrix tests — timeout/cancel/worker-fail/interrupt driven through failing port wrappers via `invokeTransportAsync`; synthetic `injectFault` alone leaves coverage incomplete. [REQ-headless-conformance-host-002]
- [x] 5.2 **GREEN**: rework `runConformanceScenario`/`runHostFaultMatrix` to install failing port wrappers and invoke through published ports in `headless-conformance-host.js`. [REQ-headless-conformance-host-002]
- [x] 5.3 **RED**: `minimal-kernel-harness.test.js` — harness-alone (no headless peer) runtime assertion proves host-fault coverage incomplete. [REQ-minimal-kernel-harness-013, REQ-minimal-kernel-harness-009]
- [x] 5.4 **GREEN**: implement dedicated negative runtime test; ensure peer path still delegates fault ownership to headless host. [REQ-minimal-kernel-harness-013]
- [x] 5.5 **TRIANGULATE**: run full `npm test`; confirm K2.1 CAS/permit regression green and no silent transport v1 `$id` mutation.
