# Tasks: K2a — Headless Conformance Host + CapabilityProof + Claude Reference Adapter

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-host-capabilities-contract-001 (closed states) | MUST | `scripts/lib/host-contract/index.js` + schema | covered-by-design | four-state enum; fail closed |
| REQ-host-capabilities-contract-002 (five transports) | MUST | host-contract + transport schemas | covered-by-design | opaque ports; no lifecycle/CAS policy |
| REQ-host-capabilities-contract-003 (adapter no authority) | MUST | `createHostAdapter` authority surface | covered-by-design | no permit mint / CAS |
| REQ-host-capabilities-contract-004 (no silent promotion) | MUST | `resolveCapabilityState` + proof gate | covered-by-design | unavailable/instructional stay honest |
| REQ-host-capabilities-contract-005 (policy-free delivery/worker) | MUST | transport validation + conformance | covered-by-design | opaque hooks for K6a/K10 |
| REQ-capability-proof-001 (enforced requires proof) | MUST | `scripts/lib/capability-proof/index.js` | covered-by-design | declaration alone insufficient |
| REQ-capability-proof-002 (digest binding) | MUST | `createEvidenceDigest` + verify | covered-by-design | adapter/host/fixture/evidence |
| REQ-capability-proof-003 (reproducible) | MUST | canonical sha256Fingerprint | covered-by-design | no volatile timestamps |
| REQ-capability-proof-004 (no fallback promotion) | MUST | verify + resolveCapabilityState | covered-by-design | failed proof non-authoritative |
| REQ-headless-conformance-host-001 (distinct from harness) | MUST | `headless-conformance-host.js` kind | covered-by-design | peer, not replacement |
| REQ-headless-conformance-host-002 (fault matrix) | MUST | `runHostFaultMatrix` | covered-by-design | timeout/cancel/worker-fail/interrupt |
| REQ-headless-conformance-host-003 (reject dup semantics) | MUST | conformance reason codes | covered-by-design | lifecycle/Graph duplication |
| REQ-headless-conformance-host-004 (deterministic results) | MUST | stable serialization | covered-by-design | byte-equivalent reruns |
| REQ-reference-host-adapter-001 (sole claude) | MUST | `host-adapters/registry.js` | covered-by-design | other targets inactive |
| REQ-reference-host-adapter-002 (port mapping) | MUST | `host-adapters/claude.js` | covered-by-design | five transports + capabilities |
| REQ-reference-host-adapter-003 (no CAS authority) | MUST | claude adapter boundary | covered-by-design | K2.1 path unchanged |
| REQ-reference-host-adapter-004 (enforced has proof) | MUST | claude fixtures + proof verify | covered-by-design | version-pinned evidence |
| REQ-reference-host-adapter-005 (others inactive) | MUST | registry + stub rejection | covered-by-design | K11a owns expansion |
| REQ-lifecycle-kernel-runtime-013 (ports only) | MUST | `lifecycle-kernel/host-boundary.js` | covered-by-design | permit+CAS still required |
| REQ-lifecycle-kernel-runtime-014 (no concrete imports) | MUST | `scope-guard.js` revision | covered-by-design | generic ports allowed |
| REQ-minimal-kernel-harness-009 (peer host faults) | MUST | `minimal-kernel-harness.js` peer | covered-by-design | conformance host drives faults |
| REQ-minimal-kernel-harness-010 (fixed no regression) | MUST | existing K2.1 fixtures | covered-by-design | fixed defaults unchanged |
| REQ-kernel-contract-schemas-001 (family inventory) | MUST | `schemas/kernel/manifest.json` | covered-by-design | K2.1 + K2a families pinned |
| REQ-kernel-contract-schemas-008 (host/proof families) | MUST | eight schema dirs + fixtures | covered-by-design | distinct from receipt/v1 |
| REQ-kernel-contract-schemas-009 (closed state enum) | MUST | HostCapabilities schema | covered-by-design | reject unknown states |
| REQ-kernel-contract-schemas-010 (proof required fields) | MUST | CapabilityProof schema | covered-by-design | four non-empty fields |
| REQ-harness-authority-canon-005 (K2a maturity tags) | MUST | harness-evolution docs | covered-by-design | host surfaces `implemented` |
| REQ-harness-authority-canon-007 (adapters not authority) | MUST | `authority-canon.js` | covered-by-design | OpenSpec/Git remain sole |
| REQ-lifecycle-model-conformance-003 (concrete proof) | MUST | model opaque/concrete split | covered-by-design | proof fields concrete |
| REQ-lifecycle-model-conformance-004 (K2a not deferred) | MUST | deferred manifest | covered-by-design | six invariants executable |
| REQ-lifecycle-model-conformance-008 (six K2a checkers) | MUST | `lifecycle-model.js` | covered-by-design | public entrypoints only |

### Reconciliation Verdict

- MUST coverage: complete.
- SHOULD/MAY gaps: none.
- Ambiguities to track: none — apply MUST pin stable reason-code strings and committed Claude evidence fixture paths in `apply-progress.md`.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1400–2000 |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single PR (`size-exception`); logical apply order: schemas → host-contract → capability-proof → headless host → claude adapter → kernel boundary/guard → harness peer → model checkers → canon/docs |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Eight K2a schema families + manifest pin | PR 1 (single) | HostCapabilities, HostAdapter, five transports, CapabilityProof; distinct `$id` from receipt/v1 |
| 2 | Host-contract + CapabilityProof core | PR 1 (single) | Closed states, five ports, digest verify, no silent promotion |
| 3 | Headless Conformance Host fault matrix | PR 1 (single) | timeout/cancel/worker-fail/interrupt; deterministic output |
| 4 | Claude adapter + sole registry | PR 1 (single) | `claude` only; version-pinned proof fixtures |
| 5 | Kernel host-boundary + scope-guard | PR 1 (single) | generic ports allowed; concrete host imports rejected |
| 6 | Harness peer + model K2a checkers | PR 1 (single) | six executable invariants; K2.1 fixtures green |
| 7 | Authority canon + maturity docs | PR 1 (single) | K2a surfaces `implemented`; adapters non-authority |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Apply Inventory And Scope Guards

- [x] 1.1 Inventory K2.1 kernel entrypoints, scope-guard rules, harness public API, target profile `claude`, and schema manifest; record exact paths and baseline fingerprints in `apply-progress.md`.
- [x] 1.2 RED: scope-guard tests reject K3/K4a/K8/K10-delivery modules (Candidate freeze, Graph authority, attestation, delivery policy) inside K2a slice.
- [x] 1.3 RED: test proving K2.1 OperationPermit/CAS/effect-class schemas and `receipt/v1` remain unchanged (K2a adds new families only).

## Phase 2: Kernel Contract Schemas

- [x] 2.1 RED: `kernel-schema-fixtures.test.js` fails until `schemas/kernel/host-capabilities/v1.schema.json` exists with stable `$id`, version, closed state enum, and valid/invalid fixtures. [REQ-kernel-contract-schemas-008, REQ-kernel-contract-schemas-009, REQ-kernel-contract-schemas-001]
- [x] 2.2 GREEN: implement HostCapabilities schema + fixtures under `schemas/kernel/host-capabilities/`.
- [x] 2.3 RED: contract tests fail until `schemas/kernel/host-adapter/v1.schema.json` and five transport schema families exist (`execution-transport`, `question-transport`, `worker-transport`, `tool-execution-transport`, `delivery-gate-transport`). [REQ-kernel-contract-schemas-008, REQ-host-capabilities-contract-002]
- [x] 2.4 GREEN: implement HostAdapter + five transport schemas + valid/invalid fixtures.
- [x] 2.5 RED: CapabilityProof schema rejects missing `adapter_version`/`host_version`/`fixture`/`evidence_digest`; `$id`/kind distinct from `receipt/v1` and OperationReceipt. [REQ-kernel-contract-schemas-010, REQ-kernel-contract-schemas-008]
- [x] 2.6 GREEN: create `schemas/kernel/capability-proof/v1.schema.json` + fixtures; register all eight K2a families in `schemas/kernel/manifest.json`. [REQ-kernel-contract-schemas-001]

## Phase 3: Host Contract Module

- [x] 3.1 RED: `scripts/lib/host-contract/index.test.js` — `createHostAdapter` validates closed capability states; unknown state fails with path. [REQ-host-capabilities-contract-001]
- [x] 3.2 RED: adapter missing any of five transport ports fails closed. [REQ-host-capabilities-contract-002]
- [x] 3.3 RED: adapter with authority surface (permit mint, CAS, lifecycle transition selection) rejected. [REQ-host-capabilities-contract-003, REQ-host-capabilities-contract-002]
- [x] 3.4 GREEN: implement `scripts/lib/host-contract/index.js` — `createHostAdapter`, port validation, authority-surface rejection.
- [x] 3.5 RED: `resolveCapabilityState` refuses `unavailable`/`instructional` → `enforced` without proof; `partial` → `enforced` also requires proof. [REQ-host-capabilities-contract-004]
- [x] 3.6 RED: DeliveryGateTransport/WorkerTransport with embedded delivery/isolation policy rejected. [REQ-host-capabilities-contract-005]
- [x] 3.7 GREEN: implement `resolveCapabilityState` delegating proof gate to capability-proof module; TRIANGULATE transport return shape `{ ok, outcome, code?, value? }`.

## Phase 4: CapabilityProof Module

- [x] 4.1 RED: `scripts/lib/capability-proof/index.test.js` — declared `enforced` without proof fails; valid proof enables enforcement. [REQ-capability-proof-001]
- [x] 4.2 RED: missing any of `adapter_version`, `host_version`, `fixture`, `evidence_digest` fails verification. [REQ-capability-proof-002, REQ-kernel-contract-schemas-010]
- [x] 4.3 RED: digest mismatch fails; repeated verification byte-equivalent; no timestamps in digest inputs. [REQ-capability-proof-002, REQ-capability-proof-003]
- [x] 4.4 GREEN: implement `createEvidenceDigest` and `verifyCapabilityProof` using `sha256Fingerprint("capability-proof/v1", { capability_id, adapter_version, host_version, fixture, evidence })`.
- [x] 4.5 RED→GREEN: failed/absent proof does not promote `partial`/`unavailable`/`instructional` to `enforced`; stable reason code emitted. [REQ-capability-proof-004, REQ-host-capabilities-contract-004]

## Phase 5: Headless Conformance Host

- [x] 5.1 RED: `headless-conformance-host.test.js` — module kind distinct from Minimal Kernel Harness; does not replace harness entrypoints. [REQ-headless-conformance-host-001]
- [x] 5.2 RED: fault-matrix tests for timeout, cancel, worker-fail, interrupt through published transport ports (no private mocks). [REQ-headless-conformance-host-002]
- [x] 5.3 RED: lifecycle-duplicating and Graph-duplicating adapters fail with stable reason codes. [REQ-headless-conformance-host-003]
- [x] 5.4 GREEN: implement `scripts/lib/headless-conformance-host.js` — `runConformanceScenario`, `runHostFaultMatrix`, deterministic result serialization (no volatile timestamps in semantic digests). [REQ-headless-conformance-host-004]
- [x] 5.5 TRIANGULATE: repeated runs with same seed/fixture/adapter_version/host_version produce byte-equivalent semantic results.

## Phase 6: Claude Reference Adapter And Registry

- [x] 6.1 RED: `host-adapters/registry.test.js` — activated real adapters list contains exactly `claude`; vscode/codex/cursor/copilot/opencode not activated; conformance host not counted as product adapter. [REQ-reference-host-adapter-001, REQ-reference-host-adapter-005]
- [x] 6.2 RED: claude adapter maps AskUserQuestion → QuestionTransport; hooks → DeliveryGateTransport without authorizing delivery. [REQ-reference-host-adapter-002]
- [x] 6.3 RED: claude adapter cannot reach compareAndSwap or permit minting; Authority Store head unchanged on attempt. [REQ-reference-host-adapter-003]
- [x] 6.4 GREEN: implement `scripts/lib/host-adapters/registry.js` and `scripts/lib/host-adapters/claude.js` composing from `target-profiles/claude.js`.
- [x] 6.5 RED→GREEN: every claude `enforced` capability has committed fixture under `scripts/lib/host-adapters/claude/fixtures/*.json` with verifying CapabilityProof. [REQ-reference-host-adapter-004]
- [x] 6.6 GREEN: extend `scripts/lib/target-profiles/claude.js` with capability declaration hooks for proof binding.

## Phase 7: Lifecycle Kernel Host Boundary And Scope Guard

- [x] 7.1 RED: `host-boundary.test.js` — transition selection uses port outcomes, not concrete host product id; permit+CAS still required after transport fault. [REQ-lifecycle-kernel-runtime-013]
- [x] 7.2 GREEN: implement `scripts/lib/lifecycle-kernel/host-boundary.js` — generic boundary; no concrete adapter imports.
- [x] 7.3 RED: scope-guard fails when lifecycle/Graph/receipt module imports concrete `claude` adapter or host API; passes with generic host-contract port types only. [REQ-lifecycle-kernel-runtime-014]
- [x] 7.4 GREEN: revise `scripts/lib/lifecycle-kernel/scope-guard.js` — allow generic host-contract imports; reject concrete host product imports/exports.
- [x] 7.5 REFACTOR: wire host-boundary into `runKernelOperation` path without altering K2.1 permit+CAS/effect-class semantics.

## Phase 8: Minimal Kernel Harness Peer Wiring

- [x] 8.1 RED: harness peers with Headless Conformance Host for host-fault scenario — fault driven by conformance host, not harness-local policy. [REQ-minimal-kernel-harness-009]
- [x] 8.2 GREEN: extend `scripts/lib/minimal-kernel-harness.js` with optional peer invocation to conformance host; retain all K2.1 protocol scenarios unchanged.
- [x] 8.3 RED→GREEN: fixed-policy control-path fixture remains green under K2a host-contract ports. [REQ-minimal-kernel-harness-010]
- [x] 8.4 RED→GREEN: K2.1 CAS-conflict, stale-permit, permit-reuse, ambiguous-irreversible fixtures retain expected outcomes. [REQ-minimal-kernel-harness-010]

## Phase 9: Lifecycle Model K2a Invariant Checkers

- [x] 9.1 RED: model manifest lists six executable K2a invariants; host-contract/proof/promotion/sole-adapter/fault-matrix absent from deferred list. [REQ-lifecycle-model-conformance-008, REQ-lifecycle-model-conformance-004]
- [x] 9.2 GREEN: implement checkers in `scripts/lib/lifecycle-model.js` for: (1) zero concrete host imports, (2) no silent promotion, (3) enforced requires proof, (4) reject lifecycle/Graph duplication, (5) sole `claude` activated, (6) four host faults covered.
- [x] 9.3 RED→GREEN: CapabilityProof missing `evidence_digest` fails enforcement under model checker (concrete artifact, not opaque). [REQ-lifecycle-model-conformance-003]
- [x] 9.4 TRIANGULATE: silent-promotion exploration records pass only when refusal holds; register K2a suite under `npm test`.

## Phase 10: Authority Canon And Documentation

- [x] 10.1 RED→GREEN: `scripts/lib/authority-canon.js` — adapter claims and CapabilityProof cannot override OpenSpec/Git semantic facts. [REQ-harness-authority-canon-007]
- [x] 10.2 RED→GREEN: contract/doc fixture — K2a surfaces (HostCapabilities, transports, CapabilityProof, Headless Conformance Host, Claude adapter) tagged `implemented`; Candidate/attestation/delivery remain `target`. [REQ-harness-authority-canon-005]
- [x] 10.3 Update `docs/target-capabilities.md` with capability states and proof-backed Claude activation.
- [x] 10.4 Update `docs/architecture/harness-evolution.md` and `docs/roadmaps/harness-evolution.md` K2a maturity labels (post-verify).

## Phase 11: Verification And Evidence

- [x] 11.1 Run focused K2a unit/contract tests; capture Strict TDD RED/GREEN/TRIANGULATE/REFACTOR cycles in `apply-progress.md` evidence table.
- [x] 11.2 Run full `npm test`.
- [x] 11.3 Execute mutation cases: silent promotion, digest mismatch, lifecycle-duplicating adapter, concrete host import, sole-adapter gate, host-fault matrix, K2.1 regression fixtures.
- [x] 11.4 Produce `verify-report.md` mapping every MUST requirement to runtime evidence.
- [ ] 11.5 Orchestrator-owned bounded 4R review after verify PASS. (deferred — not apply scope)
