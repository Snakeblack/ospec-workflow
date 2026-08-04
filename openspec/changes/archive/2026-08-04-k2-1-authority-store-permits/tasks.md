# Tasks: K2.1 — Authority Store, OperationPermit y semántica de efectos

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-authority-store-001 (load + revision) | MUST | `scripts/lib/authority-store/index.js` | covered-by-design | `sha256Fingerprint` state+journal |
| REQ-authority-store-002 (CAS mutation contract) | MUST | `authority-store` `compareAndSwap` | covered-by-design | wraps K2 commit; no public bare commit |
| REQ-authority-store-003 (single writer wins) | MUST | CAS conflict codes + budget guard | covered-by-design | `cas-conflict`; no budget inflate |
| REQ-authority-store-004 (convergent replay) | MUST | CAS + journal reconcile | covered-by-design | same R → no second advance |
| REQ-operation-permits-001 (three artifacts) | MUST | `permits.js` + authorize boundary | covered-by-design | offer ≠ permit ≠ receipt |
| REQ-operation-permits-002 (revision-bound single-use) | MUST | `permits.js` ledger | covered-by-design | stale/reuse codes |
| REQ-operation-permits-003 (runtime mint only) | MUST | `mintOperationPermit` runtime-only | covered-by-design | reject self-grant/token |
| REQ-operation-permits-004 (OperationReceipt) | MUST | `permits.js` consume + schema | covered-by-design | distinct from `receipt/v1` |
| REQ-effect-semantics-001 (class required) | MUST | `reducer.js` + shell guard | covered-by-design | closed enum |
| REQ-effect-semantics-002 (class retry policy) | MUST | `effect-policy.js` + `journal.js` | covered-by-design | no false exactly-once |
| REQ-effect-semantics-003 (irreversible ambiguous) | MUST | `effect-policy.js` + shell | covered-by-design | decide\|stop only |
| REQ-effect-semantics-004 (permit+CAS+class) | MUST | `runKernelOperation` path | covered-by-design | block direct-write |
| REQ-lifecycle-kernel-runtime-010 (permit+CAS) | MUST | `index.js` + `operations.js` | covered-by-design | zero mutations without both |
| REQ-lifecycle-kernel-runtime-011 (offer non-authorizing) | MUST | authorize boundary | covered-by-design | mint separate from offer |
| REQ-lifecycle-kernel-runtime-012 (effect class on intents) | MUST | `reducer.js` emit | covered-by-design | shell refuses missing class |
| REQ-lifecycle-kernel-runtime-006 (runtime-owned authority) | MUST | authorize + CAS path | covered-by-design | token≠permit |
| REQ-minimal-kernel-harness-007 (fault matrix) | MUST | `minimal-kernel-harness.js` | covered-by-design | public entrypoint only |
| REQ-minimal-kernel-harness-008 (fixed no regression) | MUST | harness fixed fixtures | covered-by-design | unchanged defaults |
| REQ-lifecycle-model-conformance-007 (7 K2.1 checkers) | MUST | `lifecycle-model.js` | covered-by-design | executable, not deferred |
| REQ-lifecycle-model-conformance-003 (opaque ports) | MUST | model opaque values | covered-by-design | permit/CAS concrete |
| REQ-lifecycle-model-conformance-004 (deferred list) | MUST | model manifest | covered-by-design | CAS/permit not deferred |
| REQ-kernel-contract-schemas-006 (permit/receipt/class) | MUST | `schemas/kernel/*` | covered-by-design | distinct `$id`s |
| REQ-kernel-contract-schemas-007 (closed enum) | MUST | `effect-class/v1.schema.json` | covered-by-design | reject unknown class |
| REQ-kernel-contract-schemas-001 (family inventory) | MUST | `manifest.json` | covered-by-design | pin K2.1 families |
| REQ-harness-authority-canon-005 (implemented tags) | MUST | harness-evolution docs | covered-by-design | later slices stay target |
| REQ-harness-authority-canon-006 (no second authority) | MUST | `bridges.js` + docs | covered-by-design | OpenSpec/Git remain sole |

### Reconciliation Verdict

- MUST coverage: complete.
- SHOULD/MAY gaps: none.
- Ambiguities to track: none — apply MUST pin reason-code strings and default `subject_id` (`lifecycle:default`) in `apply-progress.md`.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1200–1800 |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single PR (`size-exception`); logical apply order: schemas → store → permits → effects → kernel wire → harness → model → bridges/docs |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Schema families + manifest pin | PR 1 (single) | Permit/receipt/effect-class fixtures; no alias to `receipt/v1` |
| 2 | Authority Store CAS adapter | PR 1 (single) | `load`/`compareAndSwap`; conflict/stale/replay unit tests |
| 3 | Permit ledger mint/authorize/consume | PR 1 (single) | Runtime-only mint; stale/reuse/token reject |
| 4 | Effect class policy + reducer emit | PR 1 (single) | Default `idempotent-keyed` for persist-node effects |
| 5 | Kernel wire + harness fault matrix | PR 1 (single) | `runKernelOperation` permit+CAS; public entrypoint matrix |
| 6 | Model checkers + bridges/docs | PR 1 (single) | Seven executable invariants; fixed-path green; canon tags |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Apply Inventory And Scope Guards

- [x] 1.1 Inventory K2 store/commit entrypoints, authorize boundary, harness public API, bridge hooks; record exact paths and baseline fingerprints in `apply-progress.md`.
- [x] 1.2 RED: scope-guard tests reject K2a/K3/K4a/K8 modules (HostCapabilities, Candidate freeze, Graph authority, attestation/delivery) inside K2.1 slice.
- [x] 1.3 RED: test proving K1 schemas and existing `receipt/v1` remain unchanged (OperationReceipt is a new family).

## Phase 2: Kernel Contract Schemas

- [x] 2.1 RED: schema contract tests fail until `schemas/kernel/operation-permit/v1.schema.json` exists with stable `$id`, version, and valid/invalid fixtures. [REQ-kernel-contract-schemas-006, REQ-kernel-contract-schemas-001]
- [x] 2.2 GREEN: implement OperationPermit schema + fixtures under `schemas/kernel/operation-permit/`.
- [x] 2.3 RED: contract tests fail until `schemas/kernel/operation-receipt/v1.schema.json` is distinct from `receipt/v1` (`$id`/kind mismatch). [REQ-kernel-contract-schemas-006, REQ-operation-permits-004]
- [x] 2.4 GREEN: implement OperationReceipt schema + fixtures; assert `receipt/v1` payload rejected as OperationReceipt.
- [x] 2.5 RED: effect-class schema rejects `exactly-once` and unknown values; accepts closed enum only. [REQ-kernel-contract-schemas-007, REQ-effect-semantics-001]
- [x] 2.6 GREEN: create `schemas/kernel/effect-class/v1.schema.json` + fixtures; register all three families in `schemas/kernel/manifest.json`. [REQ-kernel-contract-schemas-001]

## Phase 3: Authority Store (CAS Adapter)

- [x] 3.1 RED: `scripts/lib/authority-store/index.test.js` — `load(subjectId)` returns `{ state, journal, revision }` with non-empty revision digest; default subject `lifecycle:default`. [REQ-authority-store-001]
- [x] 3.2 RED: missing subject fails closed (`subject-not-found`); no fabricated revision. [REQ-authority-store-001]
- [x] 3.3 GREEN: implement `load`, revision helper (`sha256Fingerprint("authority-store:revision", { state_digest, journal_digest })`), wrap K2 `createMemoryStore`.
- [x] 3.4 RED: matching `compareAndSwap(S, R, nextState)` persists head and advances revision; stale R rejected. [REQ-authority-store-002, REQ-authority-store-004]
- [x] 3.5 RED: concurrent writers on same R — exactly one wins, loser gets `cas-conflict` with current head; budgets unchanged. [REQ-authority-store-003]
- [x] 3.6 RED: exact replay on same R converges (no second advance; completed effects not re-executed). [REQ-authority-store-004]
- [x] 3.7 GREEN: implement `compareAndSwap`; expose no public bare `commit` mutation path on authoritative subjects. [REQ-authority-store-002]

## Phase 4: Operation Permits

- [x] 4.1 RED: `scripts/lib/lifecycle-kernel/permits.test.js` — runtime-minted permit validates against schema; `single_use: true`; `expected_revision` equals head at mint. [REQ-operation-permits-002]
- [x] 4.2 GREEN: implement `permits.js` — `mintOperationPermit`, in-memory ledger keyed by `permit_id`.
- [x] 4.3 RED: stale permit (`expected_revision` ≠ head) rejected at authorize/consume; head unchanged. [REQ-operation-permits-002, REQ-lifecycle-kernel-runtime-010]
- [x] 4.4 RED: consumed permit reuse rejected (`permit-reuse`); head unchanged. [REQ-operation-permits-002]
- [x] 4.5 RED: TransitionOffer alone cannot authorize mutation; offer-only path blocked. [REQ-operation-permits-001, REQ-lifecycle-kernel-runtime-011]
- [x] 4.6 RED: model-fabricated permit rejected (`permit-not-runtime-issued`); non-empty AuthorityToken without permit fails (`unauthorized`). [REQ-operation-permits-003, REQ-lifecycle-kernel-runtime-006]
- [x] 4.7 GREEN: implement `authorizeMutation` and `consumePermit` → `OperationReceipt` referencing `permit_id`; receipt ≠ attestation/delivery. [REQ-operation-permits-004]
- [x] 4.8 TRIANGULATE: OperationReceipt kind/schema distinct from `receipt/v1` at runtime validation boundary.

## Phase 5: Effect Semantics

- [x] 5.1 RED: reducer effect intents without `effect_class` fail closed before shell execution (`effect-class-required`). [REQ-effect-semantics-001, REQ-lifecycle-kernel-runtime-012]
- [x] 5.2 GREEN: modify `scripts/lib/lifecycle-kernel/reducer.js` to emit `effect_class` on every effect intent; default persist-node effects to `idempotent-keyed`.
- [x] 5.3 RED: `scripts/lib/lifecycle-kernel/effect-policy.js` tests — class→retry table: `idempotent-keyed` retries same key; `pure` safe re-eval; no exactly-once claims over external I/O. [REQ-effect-semantics-002]
- [x] 5.4 RED: ambiguous `irreversible` outcome selects `decide` or `stop`; no blind retry; ambiguity not relabeled as code defect. [REQ-effect-semantics-003]
- [x] 5.5 GREEN: implement `effect-policy.js`; extend `journal.js` reconcile for class-aware handling and `irreversible-ambiguous` code.
- [x] 5.6 RED→GREEN: direct-write adapter without permit+CAS+class blocked (`direct-write-blocked`); compliant path succeeds with receipt recordable. [REQ-effect-semantics-004]

## Phase 6: Kernel Runtime Wiring

- [x] 6.1 RED: `index.test.js` — mutation without runtime-minted OperationPermit fails; head unchanged. [REQ-lifecycle-kernel-runtime-010]
- [x] 6.2 RED: mutation with permit but bypassing `compareAndSwap` unreachable/rejected. [REQ-lifecycle-kernel-runtime-010, REQ-authority-store-002]
- [x] 6.3 GREEN: modify `scripts/lib/lifecycle-kernel/index.js` — mint from offer+head+digests; authorize; effects; `commitJournal` durability; final `compareAndSwap`; consume → receipt.
- [x] 6.4 GREEN: modify `scripts/lib/lifecycle-kernel/operations.js` — authorize via permit; token insufficient for mutate.
- [x] 6.5 REFACTOR: remove or internalize bare `commit` as public mutation API; preserve `commitJournal` mid-op barrier.
- [x] 6.6 TRIANGULATE: CAS conflict after effects does not inflate budgets or restart work. [REQ-authority-store-003]

## Phase 7: Minimal Kernel Harness Fault Matrix

- [x] 7.1 RED: harness CAS-conflict fixture via public `runKernelOperation` — one winner, loser records conflict, budgets unchanged. [REQ-minimal-kernel-harness-007]
- [x] 7.2 RED: stale permit fixture — authorize fails closed; final head digest unchanged. [REQ-minimal-kernel-harness-007]
- [x] 7.3 RED: permit reuse fixture — second attempt fails; no second advance. [REQ-minimal-kernel-harness-007]
- [x] 7.4 RED: ambiguous irreversible effect fixture — next kind `decide` or `stop`; no auto-retry. [REQ-minimal-kernel-harness-007]
- [x] 7.5 GREEN: extend `scripts/lib/minimal-kernel-harness.js` with fault-matrix scenarios and injected ambiguous-irreversible executor.
- [x] 7.6 RED→GREEN: fixed-policy control-path fixture remains green under K2.1 enforcement. [REQ-minimal-kernel-harness-008]

## Phase 8: Lifecycle Model K2.1 Checkers

- [x] 8.1 RED: model manifest lists seven executable K2.1 invariants; CAS/permit/retry invariants absent from deferred list. [REQ-lifecycle-model-conformance-007, REQ-lifecycle-model-conformance-004]
- [x] 8.2 GREEN: implement checkers in `scripts/lib/lifecycle-model.js` for: (1) no mutation without CAS, (2) stale permit reject, (3) permit reuse reject, (4) irreversible ambiguous decide/stop, (5) convergent replay, (6) no self-grant, (7) direct-write blocked.
- [x] 8.3 RED→GREEN: opaque AuthorityToken without concrete permit fails under K2.1 checkers. [REQ-lifecycle-model-conformance-003]
- [x] 8.4 TRIANGULATE: model self-grant exploration records pass only when authorize fail-closed holds. [REQ-lifecycle-model-conformance-007]
- [x] 8.5 Register K2.1 model suite under normal `npm test`.

## Phase 9: Compatibility Bridges And Canon Docs

- [x] 9.1 RED→GREEN: `scripts/lib/lifecycle-kernel/bridges.js` — routing/review/archive fixtures pass; no second lifecycle authority; permit cannot override OpenSpec/Git semantic facts. [REQ-harness-authority-canon-006]
- [x] 9.2 RED→GREEN: contract test or doc fixture — K2.1 surfaces tagged `implemented` in `docs/roadmaps/harness-evolution.md` and `docs/architecture/harness-evolution.md`; HostCapabilities/Candidate/attestation/delivery remain `target`. [REQ-harness-authority-canon-005]
- [x] 9.3 Verify fixed-policy defaults unchanged; orchestrator does not gain permit mint capability.

## Phase 10: Verification And Evidence

- [x] 10.1 Run focused K2.1 unit/contract tests; capture Strict TDD RED/GREEN/TRIANGULATE cycles in `apply-progress.md` evidence table.
- [x] 10.2 Run full `npm test`.
- [x] 10.3 Execute mutation cases: CAS race, stale permit, reuse, ambiguous irreversible, receipt/v1 confusion, model self-grant, bare commit attempt.
- [x] 10.4 Produce `verify-report.md` mapping every MUST requirement to runtime evidence.
- [ ] 10.5 Orchestrator-owned bounded 4R review after verify PASS. (deferred — not apply scope)
