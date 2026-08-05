# Tasks: K2.1b — Permit issuance control and atomic consume

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-operation-permits-005 / issuer scenarios | MUST | `permits.js` `issueOperationPermit`, decision DTO validation | covered-by-design | ADR-001 |
| REQ-operation-permits-006 / atomic consume + replay + restart | MUST | CAS `authorityCommit`, kernel replay short-circuit, `snapshot`/`initial` | covered-by-design | ADR-002 |
| REQ-authority-store-005 / winning revision carries bag | MUST | `authority-store/index.js` subject `authority` bag | covered-by-design | Co-committed in CAS |
| REQ-authority-store-006 / replay receipt | MUST | `compareAndSwap` converged path + kernel lookup | covered-by-design | No second advance |
| REQ-authority-store-004 MOD / receipt on replay | MUST | Same as 006; converged CAS returns stored receipt | covered-by-design | Extends K2.1 replay |
| REQ-lifecycle-kernel-runtime-015 / no auto-mint | MUST | `index.js` `mintPermit = false`, `auto-mint-disabled` | covered-by-design | Public path fail-closed |
| REQ-lifecycle-kernel-runtime-016 / atomic commit | MUST | Kernel prepares `authorityCommit` pre-CAS | covered-by-design | Drops post-CAS sole truth |
| REQ-lifecycle-kernel-runtime-011 MOD / offer-only fail | MUST | Existing `authorizeOperationWithPermit` + issuer gate | covered-by-design | No public mint branch |
| REQ-minimal-kernel-harness-011 / issuer-first positive | MUST | `minimal-kernel-harness.js`, `test-permit-helpers.js` | covered-by-design | Default `mintPermit: false` |
| REQ-minimal-kernel-harness-012 / atomic replay restart | MUST | Harness fixtures via public entrypoint | covered-by-design | REQ-012 scenarios |
| REQ-minimal-kernel-harness-007 MOD / positive companion | MUST | Fault matrix unchanged; positive uses issuer | covered-by-design | Auto-mint not counted |
| REQ-lifecycle-model-conformance-009 / K2.1b invariants 1–5 | MUST | `lifecycle-model.js` new checkers | covered-by-design | Non-optional |
| REQ-lifecycle-model-conformance-007 MOD / inv 8–9 | MUST | Same file; auto-mint + receipt replay checkers | covered-by-design | Extends K2.1 suite |
| REQ-harness-authority-canon-008 / K2.1b maturity | MUST | `docs/architecture/harness-evolution.md` | covered-by-design | K3 stays `target` |
| REQ-harness-authority-canon-009 / WARNING5 quick-path | MUST | `docs/roadmaps/harness-evolution.md` row 1 | covered-by-design | No bare `Ejecutar K2a → K3` |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none (apply pins exact reason codes in `apply-progress.md`)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 520–680 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Single PR (`size-exception`) **or** WU1 store → WU2 issuer+kernel → WU3 harness/model/docs |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Authority bag + CAS `authorityCommit` + store tests | PR 1 (optional) | Foundation; no kernel/harness until green |
| 2 | Controlled issuer + kernel wire + replay | PR 2 (optional) | Depends on WU1; kills post-CAS consume truth |
| 3 | Harness/model migration + roadmap docs + TDD evidence | PR 3 or same PR | Fixture churn; verify WARNING5 |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Authority Store — authority bag (Strict TDD)

- [x] 1.1 **RED** — Add failing tests in `scripts/lib/authority-store/index.test.js`: `load`/`snapshot` expose `authority: { permits, receipts }`; permit-authorized CAS requires `authorityCommit`; incomplete payload → `authority-commit-incomplete` with head unchanged [REQ-authority-store-005, REQ-authority-store-006]
- [x] 1.2 **GREEN** — Extend `scripts/lib/authority-store/index.js`: subject entry holds authority bag; `createAuthorityStore({ initial })` accepts bag; winning `compareAndSwap` atomically writes state+journal+bag; revision digest stays `{state_digest, journal_digest}` only [REQ-authority-store-005]
- [x] 1.3 **GREEN** — Implement converged replay path: same inputs return stored receipt from bag without second advance [REQ-authority-store-006, REQ-authority-store-004]
- [x] 1.4 **REFACTOR** — Adjust `scripts/lib/lifecycle-kernel/memory-store.js` only if inner store must round-trip bag; prefer bag on Authority Store subject entry per design [REQ-authority-store-005]

## Phase 2: Controlled issuer API (Strict TDD)

- [x] 2.1 **RED** — Add failing tests in `scripts/lib/lifecycle-kernel/permits.test.js`: `issueOperationPermit` requires exactly one of `policyDecision`/`humanDecision`/`kernelRule`; offer-only → fail closed (`issuer-decision-required`); ambiguous multiple decisions → `issuer-decision-ambiguous` [REQ-operation-permits-005, REQ-lifecycle-kernel-runtime-011]
- [x] 2.2 **GREEN** — Implement `issueOperationPermit` + frozen decision DTO validators in `scripts/lib/lifecycle-kernel/permits.js`; keep `mintOperationPermit` internal to issuer; Map remains issued-only mirror [REQ-operation-permits-005]
- [x] 2.3 **GREEN** — Update `scripts/lib/lifecycle-kernel/test-permit-helpers.js` with issuer-first helpers for fixtures (TransitionOffer + decision + `expected_revision`) [REQ-minimal-kernel-harness-011]
- [x] 2.4 **REFACTOR** — Re-export `issueOperationPermit` from `scripts/lib/lifecycle-kernel/index.js` module.exports [REQ-operation-permits-005]

## Phase 3: Kernel runtime — fail-closed + atomic consume (Strict TDD)

- [x] 3.1 **RED** — Add failing tests in `scripts/lib/lifecycle-kernel/index.test.js`: default `mintPermit` is `false`; explicit `mintPermit: true` → `auto-mint-disabled`; state-valid op without permit → unauthorized with head unchanged [REQ-lifecycle-kernel-runtime-015]
- [x] 3.2 **RED** — Add failing tests: successful mutate records consumed permit + receipt in same revision via CAS; failed/incomplete authority commit leaves head unchanged and `operation_receipt` null [REQ-lifecycle-kernel-runtime-016, REQ-operation-permits-006]
- [x] 3.3 **RED** — Add failing tests: exact identical replay returns prior `OperationReceipt`; in-process restart (`snapshot` → new store `initial` → `load`) verifies consumed+receipt [REQ-operation-permits-006, REQ-lifecycle-kernel-runtime-016]
- [x] 3.4 **GREEN** — Change `scripts/lib/lifecycle-kernel/index.js`: `mintPermit = false` default; remove public auto-mint branch; reject `mintPermit === true` with `auto-mint-disabled` [REQ-lifecycle-kernel-runtime-015]
- [x] 3.5 **GREEN** — Prepare `OperationReceipt` pre-CAS; pass `authorityCommit` to `compareAndSwap`; on success return receipt from bag — remove post-CAS `consumePermit` as sole authority (Map mirror only) [REQ-lifecycle-kernel-runtime-016, REQ-operation-permits-006]
- [x] 3.6 **GREEN** — Replay short-circuit: if bag shows consumed permit + matching receipt keys, return stored receipt before effects/re-consume [REQ-operation-permits-006, REQ-authority-store-006]
- [x] 3.7 **REFACTOR** — Migrate dependent tests in `host-boundary.test.js`, `host-contract/index.test.js`, `host-adapters/registry.test.js` to issuer-first (no `mintPermit: true` defaults) [REQ-lifecycle-kernel-runtime-015]

## Phase 4: Harness & model conformance (Strict TDD)

- [x] 4.1 **RED** — Add failing harness tests in `scripts/lib/minimal-kernel-harness.test.js`: atomic consume revision inspection; exact replay receipt stability; in-process restart fixture [REQ-minimal-kernel-harness-012]
- [x] 4.2 **GREEN** — Update `scripts/lib/minimal-kernel-harness.js`: default `mintPermit: false`; positive steps issue permit via controlled issuer before public entrypoint [REQ-minimal-kernel-harness-011, REQ-minimal-kernel-harness-007]
- [x] 4.3 **RED** — Add failing model tests in `scripts/lib/lifecycle-model.test.js` for K2.1b invariants 1–5 and extended inv 8–9 (non-deferred) [REQ-lifecycle-model-conformance-009, REQ-lifecycle-model-conformance-007]
- [x] 4.4 **GREEN** — Implement checkers in `scripts/lib/lifecycle-model.js`; ensure deferred list excludes K2.1b checkers [REQ-lifecycle-model-conformance-009]

## Phase 5: Documentation & canon (WARNING5)

- [x] 5.1 Replace bare `Ejecutar K2a → K3` quick-path in `docs/roadmaps/harness-evolution.md` with K3-accurate wording naming K2.1b/k2a-1 correctives before K3 [REQ-harness-authority-canon-009]
- [x] 5.2 Tag controlled issuance + atomic consume as `implemented`; keep K3 Candidate runtime `target` in `docs/architecture/harness-evolution.md` [REQ-harness-authority-canon-008]

## Phase 6: Verification prep & TDD evidence

- [x] 6.1 Run `npm test`; fix any remaining auto-mint fixture regressions across `scripts/lib/**/*.test.js` [REQ-minimal-kernel-harness-011]
- [x] 6.2 Initialize `openspec/changes/k2-1b-permit-issuance-atomic-consume/apply-progress.md` with TDD Cycle Evidence table (RED/GREEN/TRIANGULATE/REFACTOR per task batch); pin exact reason codes and decision DTO field names [Strict TDD]
