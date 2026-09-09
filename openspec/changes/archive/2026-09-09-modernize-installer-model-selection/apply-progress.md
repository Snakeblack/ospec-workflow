# Apply Progress: Modernize Installer Model Selection

## Batch 2026-09-07

Delivery mode: `single-pr` with the maintainer-approved `size:exception`.

- [x] 1.1–1.3 — Added the GitHub Copilot catalog alias, finite controls, and opaque canonical choice IDs.
- [x] 2.1–2.3 — Replaced protocol v1 with v2 preset/custom/inherited requests, fresh-plan validation, static-only planning, and one selected installer delegation.
- [x] 3.1–3.3 — Declared target-owned native metadata allowlists, Copilot model emission, Antigravity inheritance, and defensive removal of foreign reasoning fields.
- [x] 4.1–4.4 — Updated Go wire types and implemented preset-first navigation, inherited review, per-agent search, compatible controls, and explicit install state.
- [x] 5.1–5.3 — Added protocol boundary coverage and installation guidance in English and Spanish.

## Verification

- `node --test scripts/configure/installer-adapter.test.js scripts/lib/target-transform.test.js` — pass (91 tests).
- `go test ./internal/installer` — pass.
- `npm test` — pass.

## Deviation

Dynamic CLI discovery remains inactive. The contract permits it as MAY behavior; the static plan is the safe fallback until a capability-bearing CLI contract exists.

## Workload

The work remains in the approved single PR under `size:exception`; no chained delivery was introduced.

## Focal correction 2026-09-07 — active reasoning-control indicator

- [x] Confirmed the report in `internal/installer/view.go`: `controlsView` compares its values against `activeControl`, but `model.go` entered the screen with that key empty and no default control selection. The result rendered every option with the inactive prefix.
- [x] RED — added `TestControlsViewMarksTheSelectedEffortAndUpdatesItWithKeyboard` in `internal/installer/view_test.go`; it failed because `› high` was absent from the initial control view.
- [x] GREEN — `model.go` now resolves the selected choice's control name and initializes its declared default when entering the control screen. The same key identifies the active value in the view; left/right update that value and therefore move the visible indicator.
- [x] REFACTOR — reused `controlName` in keyboard handling to avoid divergent map iteration between rendering and selection updates.

Verification: `go test ./internal/installer` passed; `npm test` passed.

## Remediation attempt 2026-09-08 — V001–V004

Delivery mode: `single-pr` with the maintainer-approved `size:exception`.

- [x] V001 — Added `TestCustomReasoningFlowReachesReviewAndInstall` and changed confirmed control selection to advance to the explicit review boundary. The review still requires a separate Install action.
- [x] V002 — Moved installer phase groups, preset references, and per-model finite capabilities into `models.yaml`. The adapter now consumes that policy, scopes opaque IDs by target, rejects invalid preset-group references, and rejects undeclared reasoning controls before installer delegation.
- [x] V003 — Updated Copilot model-emission assertions to match its configured model output. The complete Node suite now passes.
- [x] V004 — Added focused coverage for custom edit/state retention, phase-local model changes, capability-less model rejection, invalid preset references, inline policy parsing, and OpenCode stale-variant clearing.

Verification:

- `go test ./internal/installer -count=1` — pass.
- `node --test scripts/configure/installer-adapter.test.js scripts/configure/installer-protocol.test.js scripts/configure/cli.test.js scripts/lib/model-resolver.test.js scripts/lib/target-transform.test.js` — pass (143 tests).
- `node --test scripts/configure/validate-opencode.test.js` — pass (10 tests).
- `npm test` — pass (`All checks passed`).

## Lineage persistence blocker

`prepareRemediation` recovered the frozen candidate successfully. The required
`recordRemediationAttempt` transition cannot derive the mechanical delta because
the frozen candidate's `candidate_tree` (`sha256:1efa…`) is not a resolvable Git
tree object and no persisted tree snapshot/oid accompanies it. The canonical
reducer returned `delta-unresolvable`; `state.yaml.verify_lineage` was left
unchanged rather than fabricating a successor candidate or transition.

## Focal correction 2026-09-07 — vertical reasoning-control navigation

- [x] Focused TDD regression — extended `TestControlsViewUsesVerticalNavigationForTheActiveEffort` to prove the active `›` marker moves with `↑/↓` and `j/k`, and that `←/→` plus `h/l` leave the vertical choice unchanged.
- [x] GREEN — the current control-screen handler uses only vertical movement for finite `effort`/`variant` values; its local help already states `↑/↓ mover`.

Verification: `go test ./internal/installer` passed; `npm test` passed.

## Phase 6 recovery/successor assessment 2026-09-08 — blocked

Delivery mode remains `single-pr` with the maintainer-approved `size:exception`.

- `[~]` 6.1–6.5 — The allocated recovery, snapshot, transition, journal, and directed-recheck modules plus their focal suites are present and the four focal Node files pass (29 tests). They cannot be marked complete because this change has no verified Candidate B source snapshot suitable for a real successor transition.
- `[~]` 6.6 — `git diff --check` passes. `npm test` ran and failed only at the unrelated frozen K1 inventory guard, which rejects the new Phase 6 modules as absent from K1's historical inventory; this phase is not allowed to modify that guard.

## Blocking evidence

The active Candidate A record is canonical and recoverable, but its `candidate_tree` is a SHA-256 content digest rather than a resolvable Git tree OID. The successor contract requires a newly captured, canonical Candidate B with verified source-tree evidence. No B Candidate, snapshot, or valid tree OIDs were available in the persisted artifacts, and none were fabricated. The active `verify_lineage` therefore remains unchanged in `remediation-pending`; no terminal predecessor, successor, recheck, findings, or remediation budget was mutated.

## Phase 6 recovery successor 2026-09-08

Delivery mode: `single-pr` with the maintainer-approved `size:exception`.

- [x] 6.1 — Persisted and validated a durable `candidate-recovery-audit/v1` for A, linked to the real `new-scope` and `architecture` approvals.
- [x] 6.2 — Captured Candidate B through a private `GIT_INDEX_FILE`, with independent HEAD and working-tree Git tree OIDs, computed digests, paths/modes, canonical bytes, and a no-clobber snapshot.
- [x] 6.3–6.4 — Persisted the pending terminal/successor operation before the state transition, reconciled its exact output, retained terminal A, and started generation 2 with V001–V004 and its budget copied literally.
- [x] 6.5 — The directed runner rejects caller outcomes and is ready for the frozen recipes; it was deliberately not run, so this batch asserts no PASS.
- [x] 6.6–6.7 — Added the recovery-successor routing notes and classified exactly the four recovery/recheck files as K2, with explicit K1 exclusion assertions.

## Verification — Phase 6

- `node --test scripts/lib/verify-lineage-recovery.test.js scripts/lib/verify-lineage-candidate-store.test.js scripts/lib/verify-lineage-recheck.test.js scripts/lib/verify-lineage.test.js` — pass.
- `node --test scripts/lib/k1-scope-guard.test.js` — pass.
- `go test ./internal/installer -count=1` — pass.
- `npm test` — pass (`All checks passed`).
- `git diff --check` — pass.

Candidate B is not asserted equivalent to A. A is terminalized as `candidate-recovery-irrecoverable`; B is independently snapshot-bound and awaits the directed recheck.

## Focal correction 2026-09-08 — canonical directed-recheck result shape

Delivery mode remains `single-pr` with the maintainer-approved `size:exception`.

- [x] 6.8 RED/GREEN — `runRecoverySuccessorRecheck` now records/replays durable directed-command completions and reduces all recipe entries into the finding-keyed boolean map required by `evaluateRecheck`. A finding passes only when every one of its frozen recipes exits with its declared expected status.
- [x] 6.8 — A matching completed operation is consumed without command execution. A pre-existing pending or ambiguous operation throws `directed recheck reconciliation required before command execution`; it is not replayed.
- [x] 6.8 — Added focused regression coverage for entry-array-to-map normalization, all-pass closure, partial finding failure, non-zero exit handling, completed no-replay, and pending-operation fail-closed behavior.

Verification: `node --test scripts/lib/verify-lineage-recheck.test.js scripts/lib/verify-lineage-recovery.test.js` passed (7 tests).

## Existing directed-operation reconciliation

The six persisted `directed-recheck-command` operation records for the active successor are present, but their immutable journal bytes are `status: pending` and the change root contains no matching completed-result blobs. The prior report's process output cannot be promoted to journal completion evidence without fabricating immutable provenance. Per the recovery contract, the active lineage remains blocked for exact reconciliation and the commands were not repeated.

## Phase 7 root-cause remediation 2026-09-09

- [x] Added `startVerifyLineageFromWorkspace`: every new mutable lineage begins with an isolated-index capture, byte/mode/diff-bound snapshot, and live-workspace readback. A digest-only Candidate cannot open the canonical route.
- [x] Snapshot-backed remediation now requires both persisted snapshots and derives its mechanical scope from their Git tree OIDs. It stores the verified post-snapshot with the successor lineage, removing the former `delta-unresolvable` path for canonical captures.
- [x] Candidate snapshots exclude only mutable operational records (`state.yaml`, progress/reports, and immutable journal/blob files). Specs, design, tasks, and source paths stay inside Candidate identity; tests prove both source/contract drift detection and that later bookkeeping does not self-invalidate the snapshot.
- [x] Directed rechecks persist a bound result atomically. The end-to-end runtime test creates the audited successor, executes the frozen recipes, persists closure, restarts, and obtains `return-cached-pass` without replay.

Verification: `node --test scripts/lib/verify-lineage.test.js scripts/lib/verify-lineage-candidate-store.test.js scripts/lib/verify-lineage-recheck.test.js scripts/lib/verify-lineage-recovery.test.js` — 42 passed.

### Active generation 3 diagnosis (no mutation)

`verify_lineage` remains generation 3, `recheck-pending`, Candidate `sha256:efe736…`, with no new journal or completion operation. Its historical snapshot `sha256:f23e…` has `excluded_paths: []` and fails live-workspace validation. Its stored contract digest still matches the finalized contract, but the mechanical source delta includes `scripts/lib/verify-lineage*.js`, harness skills/rules, and target profile paths outside V001–V004's frozen `allowed_paths`. `recordRemediationAttempt` is inapplicable while this lineage is `recheck-pending`; no Candidate identity, history, finding, attempt counter, or budget was altered and no frozen recipe was run.
