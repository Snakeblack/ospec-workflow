# Apply Progress — k5-usage-accounting-integrity

## 2026-08-22 — Focused TDD / size-exception

- [x] 1.1–1.3 — Added focused runtime, store, journal and harness regressions. The shared journal primitive was placed in the existing `scripts/lib/lifecycle-kernel/journal.js` rather than a new file to preserve the repository K1 inventory guard; this is an equivalent design implementation.
- [x] 2.1–2.4 — `createKernelRuntime` now separates physical results from journal history, applies explicit execution usage before CAS, preserves post-effect unconfirmed usage as runtime-owned carry-over, and clears it only after a confirmed commit. `input.consumed` and operation arguments no longer provide accounting authority. Completed journal evidence is absorbing in AuthorityStore, MemoryStore and FileSystemStore.
- [x] 3.1–3.3 — Updated K5 E2E/model composition and harness fixtures for explicit measured/zero usage; model suite covers all seven K5 invariants.
- [x] 4.1–4.3 — Reconciled the four ADRs and completed focused plus full verification.

## Verification evidence

- Focused: `node --test scripts/lib/lifecycle-kernel/index.test.js scripts/lib/lifecycle-kernel/journal.test.js scripts/lib/authority-store/index.test.js scripts/lib/filesystem-store.test.js scripts/lib/lifecycle-kernel/reducer.test.js scripts/lib/k5-budgets-failures-recovery.test.js scripts/lib/minimal-kernel-harness.test.js scripts/lib/k5-lifecycle-model.test.js scripts/lib/lifecycle-model.test.js scripts/k5-e2e-budgets-recovery.test.js` — PASS (163/163).
- Full: `npm test` — PASS (2406 tests, 2404 passed, 2 skipped, 0 failed).
- Scope: no K6a, worker, async issuer, or trust-boundary expansion files changed.

## Delivery

- Strategy: `size-exception` accepted by the user; no commit created by apply.
- Branch advisory: worktree branch is `fix/configurable-model-policy`; no branch switch was made.

## 2026-08-22 — Focused TDD remediation (frozen K5-V-001…K5-V-004)

- [~] Remediation code and regression evidence are complete within the frozen allowlist. `index.js` now treats a sterile repair as zero-delta even when the effect reports `state_advanced`, retains structured `partial.usage` after a post-effect interrupt, and marks the post-CAS receipt-loss accounting disposition as committed.
- [~] Added focused runtime regressions for sterile repair direct/CAS-retry survival, one-time partial-usage carry-over, and exhaustive multi-writer budget dimensions; the lifecycle model now exercises sterile repair with a lifecycle signal and verifies both completed-effect and zero-delta evidence.
- Frozen commands passed: `index + k5 model` 58/58; `index` 50/50; `k5 model + lifecycle model` 24/24; `index + K5 E2E` 53/53. `npm test` passed (full repository suite; environment skips are reported by the runner).
- Lineage transition intentionally not written: `verify_lineage` persists only `current_candidate_id` (`sha256:46ec0973484ba10d60dc6368f974679dbc32453d6621ccab3f196063a346480e`), not the frozen Candidate v2 object or its Git-tree binding. `recordRemediationAttempt` fails closed without those exact pre-candidate provenance fields because it cannot derive the required candidate delta mechanically.

## 2026-08-22 — Focused TDD bounded successor remediation (K5-SV-001, K5-SV-002)

- [x] 3.1 / K5-SV-001 — `reconcileEffect()` classifies a durable `failed` record as accounting reconciliation instead of executor replay. The exact retry commits the runtime-owned retained usage through one CAS, preserves the failed lifecycle state, consumes the retry permit, and never re-executes or replenishes the effect. The E2E regression asserts turns, commands, authority attempts, failed journal status, and one executor call.
- [x] 3.2 / K5-SV-002 — All seven K5 checker entry points now execute a full AuthorityStore + KernelRuntime + permit + selector/reducer composition. The budget checker observes exact success debit without carry-over, two consecutive CAS losses, failed and missing usage, and completed journal monotonicity; stable REQ traceability is present in the model test name.

## Bounded successor evidence

- Frozen K5-SV-001: `node --test scripts/lib/lifecycle-kernel/index.test.js scripts/k5-e2e-budgets-recovery.test.js` — PASS (54/54).
- Frozen K5-SV-002: `node --test scripts/lib/k5-lifecycle-model.test.js scripts/lib/lifecycle-model.test.js` — PASS (24/24).
- Focused K5 suite: PASS (167/167).
- Full: `npm test` — PASS; the runner reported the two expected unavailable-CLI environment skips.
- Mechanical successor binding: baseline Candidate v2 `sha256:de492c19ac7bacb3b662682e53edc4a1bc262148670344832e8e2167185b5c03` / Git tree `f3529f3da9f77604ffd8f25a1649ac065e9ff1ad`; successor Candidate v2 `sha256:607c24e356219057f7ab0f1c055ff0dfc4adb0b24d6a359b1665667d90b8c3bd` / Git tree `aa7031ddd9129b05f6fec6c6186b0b2b659cb8b1`. Exact functional delta: the six frozen allowlisted paths only. `recordRemediationAttempt` accepted attempt 1/2 and moved the lineage to `recheck-pending`.
- Delivery: `size-exception` remains accepted. No commit or branch mutation was made.
