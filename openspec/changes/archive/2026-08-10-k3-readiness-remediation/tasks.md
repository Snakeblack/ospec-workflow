# Tasks: K3 Readiness Remediation

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-execution-identities-009 | MUST | `scripts/lib/execution-identities/index.js`, archive state allowlist, distribution tests | covered-by-design | Shared derivation, successor coherence, immutable evidence and target proof are allocated. |
| REQ-execution-identities-004 | MUST | freeze pipeline and identity tests in `scripts/lib/execution-identities/index.js` | covered-by-design | Projection, digest, mode, symlink, case and untracked inputs are covered. |
| REQ-execution-identities-005 | MUST | relation evaluator and adversarial runtime tests | covered-by-design | Frozen gate, recomputation, mismatch and fail-closed outcomes are explicit. |
| REQ-kernel-contract-schemas-012 | MUST | Candidate schema, fixtures, schema tests and six-target parity tests | covered-by-design | Four-value enum, non-aliasing, v1 immutability and publication closure are allocated. |
| REQ-execution-identities-010 | MUST | `scripts/configure/cli.js` sibling transaction, staged-tree validator, lock/backup recovery and injected-failure tests | covered-by-design | Per-destination completeness and restoration invariants are allocated; K4a remains out of scope. |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none; K4a behavior remains explicitly out of scope.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 1,350-1,950 total (incremental transactional publication remediation: 450-650) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Single approved size-exception delivery, implemented as ordered work units: runtime/schema → fixtures/tests → packaging → reconciliation/docs → full verification |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

`exception-ok` resolves the oversized-apply guard: proceed as one approved size-exception while preserving the work-unit ordering below.

The incremental remediation forecast is High because fault-injection coverage and transactional recovery touch the publisher, test seams, and six-target verification; no new delivery decision is required.

## Downstream Verification Findings (verbatim intent)

- CRITICAL code-bug: `npm test` parallel run fails codex-smoke installExit 1 while isolated/serial passes; remove shared-destination interference and prove parallel suite green.
- CRITICAL code-bug/evidence: permanent Phase 6 Strict TDD coverage overdeclares prune/mkdir/backup/lock/cleanup; add genuine permanent tests and authentic evidence for every claimed operation.
- CRITICAL code-bug: injected cleanup failure leaks `.configure-stage-*` and `.configure.lock`; guarantee deterministic recovery/cleanup or correctly preserve/report recovery artifacts per spec/design.
- WARNING tasks-gap: 6.10/6.12 inaccurate.
- WARNING environment: Claude external validator unavailable; record as environment limitation, do not create fake evidence.

## Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Runtime and canonical schema contract | PR 1 (size-exception slice 1) | RED→GREEN→TRIANGULATE→REFACTOR for freeze/evaluation and four-value schema. |
| 2 | Adversarial fixtures and contract tests | PR 1 (slice 2) | Depends on Unit 1; covers identity boundaries and non-aliasing. |
| 3 | Six-target packaging and regenerated `dist/**` | PR 1 (slice 3) | Add curated roots/assets, assert byte parity, regenerate all six targets. |
| 4 | Historical state reconciliation and docs | PR 1 (slice 4) | Allowlist-only state edits; preserve sibling evidence bytes; align K3/K4a wording. |
| 5 | Full verification and evidence | PR 1 (slice 5) | Run focal tests then `npm test`; record strict-TDD evidence and immutable digest checks. |

## Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Runtime and Schema Contract (Strict TDD)

- [x] 1.1 RED: add failing `freezeCandidate` tests for complete predecessor input, equal IDs producing root `exact`, changed successor producing `changed` plus recomputed predecessor, and bare-ID rejection [REQ-execution-identities-009, REQ-execution-identities-004]
- [x] 1.2 GREEN: implement one internal canonical derivation/coherence primitive and extend `scripts/lib/execution-identities/index.js` without adding a second successor constructor [REQ-execution-identities-009]
- [x] 1.3 RED: add failing evaluator tests for frozen-candidate gate, declared-ID mismatch, persisted relation/predecessor mismatch, and fail-closed `ambiguous`/`unknown` actions [REQ-execution-identities-005]
- [x] 1.4 GREEN: enforce validation/recomputation and coherence in `evaluateCandidateRelation`; reject retired lineage inputs [REQ-execution-identities-005]
- [x] 1.5 RED: add schema contract test asserting exactly four relation values and required `relation`/`kind` fields [REQ-kernel-contract-schemas-012]
- [x] 1.6 GREEN: update `schemas/kernel/candidate/v2.schema.json` and preserve v1/K1 files byte-for-byte [REQ-kernel-contract-schemas-012]
- [x] 1.7 TRIANGULATE: run focal runtime/schema tests against root, equal predecessor, changed successor, invalid ID, retired value, and inconsistent lineage mutations [REQ-execution-identities-009, REQ-execution-identities-005]
- [x] 1.8 REFACTOR: centralize validation/error constants and document derivation invariants without changing observable contracts [REQ-execution-identities-009]

## Phase 2: Adversarial Fixtures and Identity Boundaries (Strict TDD)

- [x] 2.1 RED: add failing fixture tests for symlink target, case-distinct paths, projection changes, file modes, untracked inventory, and commit projection rejection [REQ-execution-identities-004]
- [x] 2.2 GREEN: add paired inputs under `schemas/kernel/candidate/fixtures/identity/` and valid/invalid Candidate v2 fixtures, including retired `superset` and exact-with-predecessor cases [REQ-kernel-contract-schemas-012]
- [x] 2.3 GREEN: update `scripts/lib/execution-identities/index.test.js` to freeze production inputs and assert distinct CandidateIds plus canonical path preservation [REQ-execution-identities-004]
- [x] 2.4 RED/GREEN: extend `scripts/lib/k3-schema-fixtures.test.js` for non-aliasing WorkResult/Candidate/Attestation/Authorization, v1 optional `kind`, and immutable v1/K1 digests [REQ-kernel-contract-schemas-012]
- [x] 2.5 TRIANGULATE: mutate relation, predecessor, projection and identity-kind fields to prove each negative fixture fails closed for the intended reason [REQ-execution-identities-005, REQ-kernel-contract-schemas-012]
- [x] 2.6 REFACTOR: normalize fixture helpers and keep expected values independent from implementation internals [REQ-kernel-contract-schemas-012]

## Phase 3: Six-Target Packaging Proof (Strict TDD)

- [x] 3.1 RED: add failing generator tests for K3 runtime BFS root and curated schema asset closure in `scripts/configure/cli.test.js` [REQ-execution-identities-009]
- [x] 3.2 GREEN: update `scripts/configure/cli.js` to publish runtime and manifest/Candidate v2/related v1-v2 schema assets to all configured targets [REQ-execution-identities-009, REQ-kernel-contract-schemas-012]
- [x] 3.3 RED/GREEN: extend `scripts/strict-tdd-evidence-parity.test.js` to assert byte-equal K3 schema assets, loadable runtime dependencies, manifest, and validator presence in claude, vscode, github-copilot, opencode, codex, and cursor targets [REQ-execution-identities-009]
- [x] 3.4 GREEN: regenerate `dist/{claude,vscode,github-copilot,opencode,codex,cursor}/**` deterministically and verify no seventh semantic target is introduced [REQ-execution-identities-009]
- [x] 3.5 TRIANGULATE/REFACTOR: run each target validator and simplify generator assertions while retaining explicit missing-asset failures [REQ-execution-identities-009]

## Phase 4: Historical Reconciliation and Documentation (Strict TDD)

- [x] 4.1 RED: create `scripts/lib/k3-readiness-reconciliation.test.js` with expected allowlist, sibling-artifact SHA-256 snapshots, terminal-state rules, and K3/K4a prerequisite assertions [REQ-execution-identities-009]
- [x] 4.2 GREEN: amend only the three allowlisted archive `state.yaml` files using existing PASS/archive evidence; leave reports, plans, apply progress and unrelated artifacts untouched [REQ-execution-identities-009]
- [x] 4.3 GREEN: update `docs/roadmaps/harness-evolution.md` and `docs/architecture/harness-evolution.md` to state K3 remediation as prerequisite and avoid K4a behavior claims [REQ-execution-identities-009]
- [x] 4.4 TRIANGULATE: rerun reconciliation tests and compare all non-state artifact digests before/after edits [REQ-execution-identities-009]
- [x] 4.5 REFACTOR: keep allowlist and evidence-digest helpers deterministic and narrowly scoped [REQ-execution-identities-009]

## Phase 5: Full Verification and Evidence

- [x] 5.1 Run `node --test` for runtime, schema-fixture, CLI, packaging-parity, and reconciliation focal suites after each GREEN; capture RED/GREEN/TRIANGULATE/REFACTOR rows in `apply-progress.md` [REQ-execution-identities-004, REQ-execution-identities-005, REQ-execution-identities-009, REQ-kernel-contract-schemas-012]
- [x] 5.2 Execute `npm test` and all configured target validators; investigate any regression without changing out-of-scope K4a behavior [REQ-execution-identities-009]
- [x] 5.3 Verify v1 schemas, `K1_SCHEMA_BASELINE`, archived evidence bytes, and generated Candidate v2 bytes remain unchanged except approved files; record evidence and checksums [REQ-kernel-contract-schemas-012, REQ-execution-identities-009]
- [x] 5.4 Produce a complete traceability matrix mapping every MUST scenario to a test and implementation task; mark only runtime-verified tasks `[x]` [REQ-execution-identities-004, REQ-execution-identities-005, REQ-execution-identities-009, REQ-kernel-contract-schemas-012]

## Phase 6: Transactional Per-Destination Publication Remediation (Strict TDD)

- [x] 6.1 RED: add deterministic fault-injection hooks and snapshot helpers in `scripts/configure/cli.test.js`/`scripts/lib/k3-publication-transaction.test.js`; model existing and absent destinations, managed inventory, bytes, and exact failure points [REQ-execution-identities-010]
- [x] 6.2 GREEN: implement sibling staging and per-destination lock acquisition in `scripts/configure/cli.js`, including parent creation, PID metadata, collision failure, and exact-path cleanup [REQ-execution-identities-010]
- [x] 6.3 RED: add failing tests for prune failure after stale-file removal and managed-directory `mkdir` failure; assert existing destinations are byte-identical and absent destinations remain absent [REQ-execution-identities-010]
- [x] 6.4 GREEN: route `writeTree()` prune/mkdir operations exclusively through the process-owned staging tree while preserving unmanaged files and deterministic managed inventory [REQ-execution-identities-010]
- [x] 6.5 RED: add failing tests for write failure after pruning and mandatory staged-tree validation failure, including K3 runtime/schema closure assertions [REQ-execution-identities-010]
- [x] 6.6 GREEN: implement synchronous staged-tree validation of desired paths, bytes, stale managed-path absence, and K3 assets before any destination rename; keep `--no-validate` limited to the external profile gate [REQ-execution-identities-010]
- [x] 6.7 RED: add failing tests for profile-validator non-zero/warning, destination-to-backup rename failure, and stage-to-destination rename failure with successful restoration; assert original error propagation [REQ-execution-identities-010]
- [x] 6.8 GREEN: implement backup-then-stage commit and synchronous restore on second-rename failure, retaining backup and raising `AggregateError` when simulated restoration also fails [REQ-execution-identities-010]
- [x] 6.9 RED/GREEN: extend six-target packaging tests to prove each `PROFILES` destination commits a complete K3 runtime/Candidate v2 tree independently, with no global rollback coupling [REQ-execution-identities-010]
- [x] 6.10 TRIANGULATE: run focal transaction tests across existing/new destinations and prune/mkdir/write/validation/rename/restore/cleanup injections; compare manifests, bytes, lock state, stage/backup cleanup, and retained backup invariants [REQ-execution-identities-010]
- [x] 6.11 REFACTOR: isolate injectable filesystem/rename seams and deterministic transaction helpers without changing `runConfigure()` result shape or introducing K4a Graph, Obligation Manifest, replay, or worker authority [REQ-execution-identities-010]
- [x] 6.12 VERIFY: run focal publication suites, all six target validators, and `npm test`; record RED→GREEN→TRIANGULATE→REFACTOR evidence and confirm no K4a behavior or unrelated artifacts changed [REQ-execution-identities-010]

## Phase 7: Verification-Failure Remediation (Strict TDD)

- [x] 7.1 RED: add a parallel `npm test` reproduction for `scripts/configure/codex-smoke.test.js` installExit 1, isolating shared-destination interference while retaining serial/isolated green controls; preserve the full-suite finding verbatim [REQ-execution-identities-010]
- [x] 7.2 GREEN: remove shared-destination interference in configure test/runtime seams so concurrent `npm test` runs complete with installExit 0; prove parallel suite green and retain serial parity [REQ-execution-identities-010]
- [x] 7.3 TRIANGULATE: execute parallel `npm test`, serial `node --test --test-concurrency=1 scripts/**/*.test.js`, and isolated codex-smoke; compare exit codes and destination manifests/bytes [REQ-execution-identities-010]
- [x] 7.4 REFACTOR: document deterministic test isolation and keep production publication semantics unchanged outside the interference fix [REQ-execution-identities-010]
- [x] 7.5 RED: add permanent Phase 6 tests and evidence assertions for prune, mkdir, backup-rename, lock/stale-lock, and cleanup injections; reject coverage that only exists in temporary probes [REQ-execution-identities-010]
- [x] 7.6 GREEN: implement genuine permanent fault-injection seams and recovery/cleanup behavior for every claimed operation, including deterministic handling/reporting of recovery artifacts when cleanup cannot complete [REQ-execution-identities-010]
- [x] 7.7 TRIANGULATE: run the permanent Phase 6 suite and independently inventory `.configure-stage-*`, `.configure.lock`, backups, managed/unmanaged files, and bytes after every injected failure [REQ-execution-identities-010]
- [x] 7.8 REFACTOR: regenerate authentic Strict TDD RED/GREEN/TRIANGULATE/REFACTOR evidence covering each permanent operation and reconcile task completion only from runtime receipts [REQ-execution-identities-010]
- [x] 7.9 RED/GREEN: record Claude external validator unavailability as an environment limitation and preserve generation-only evidence; do not create fake validator evidence [REQ-execution-identities-010]

## Phase 8: Final Cleanup-Failure Closure and Verification (Strict TDD)

- [x] 8.1 RED: add a permanent test that injects failure in the cleanup operation itself (not only after another failure), asserting the later lock/stage cleanup attempts and exact retained paths [REQ-execution-identities-010]
- [x] 8.2 GREEN: expose a cleanup operation seam/observer and use resilient best-effort sequencing so one removal error cannot skip later lock/stage cleanup; aggregate/report exact recovery paths when cleanup remains incomplete [REQ-execution-identities-010]
- [x] 8.3 TRIANGULATE: inventory stage, lock, backup, managed/unmanaged files, and bytes for both recoverable failures and cleanup-failure cases; verify deterministic recovery artifacts against spec/design [REQ-execution-identities-010]
- [x] 8.4 REFACTOR: authenticate final per-operation evidence without grouped overclaim; update task status only from runtime receipts and retain Claude validator unavailability as an environment limitation [REQ-execution-identities-010]
- [x] 8.5 VERIFY: run fresh focal publication tests, parallel `npm test`, and serial `node --test --test-concurrency=1 scripts/**/*.test.js`; record exit codes and final artifact inventory [REQ-execution-identities-010]

## Phase 9: Active Codex Installer Schema Closure (Strict TDD)

- [x] 9.1 RED: add a permanent `install-codex` test using an isolated Codex home that asserts `schemas/kernel/manifest.json`, the full schema closure, and active installed `validateCandidateV2` acceptance of a minimal Candidate v2; preserve verbatim: “no permanent install test asserts executable schema/runtime closure in active global Codex layout.” [REQ-execution-identities-010]
- [x] 9.2 GREEN: update `scripts/configure/install-codex.js` to install generated `dist/codex/schemas/**` through the supported managed-copy path alongside scripts, with prune/update semantics; preserve verbatim: “scripts/configure/install-codex.js omits generated dist/codex/schemas while installing scripts, installer exits 0 and active validateCandidateV2 fails schema manifest read.” [REQ-execution-identities-010]
- [x] 9.3 TRIANGULATE: prove source→dist→isolated-active parity with real reinstall/smoke, missing/stale schema cleanup, repeated idempotent install, and Windows path handling; assert schema/runtime closure and active validation [REQ-execution-identities-010]
- [x] 9.4 REFACTOR: avoid manual generated edits; keep installer ownership, managed inventory, and schema closure derivation deterministic and aligned with the generator [REQ-execution-identities-010]
- [x] 9.5 VERIFY: run fresh install-codex focal tests, parallel and serial `npm test`, active Codex reinstall/smoke, and record a restart note for the updated active harness [REQ-execution-identities-010]

## Phase 10: Managed Codex Schema Pruning Closure (Strict TDD)

- [x] 10.1 RED: in `scripts/configure/codex-smoke.test.js`, seed an obsolete schema under an already-installed isolated Codex home, reinstall through the supported entry point, and assert stale removal plus exact inventory/bytes while preserving paths outside the managed tree [REQ-execution-identities-010]
- [x] 10.2 GREEN: implement convergent pruning only within `~/.codex/ospec-workflow/schemas/**` and only where the managed-copy contract permits; preserve non-managed scripts/config and never prune the broad Codex home [REQ-execution-identities-010]
- [x] 10.3 TRIANGULATE: verify clean-home install, byte update, stale managed removal, double-install idempotence, `validateCandidateV2` fixture acceptance, and Windows path behavior from source→dist→isolated→real active layout [REQ-execution-identities-010]
- [x] 10.4 REFACTOR: extract clear validation/fail-safe pruning helpers, avoid manual `dist/` or active-harness edits, and emit new authenticated Strict TDD evidence against the final Candidate [REQ-execution-identities-010]
- [x] 10.5 VERIFY: run focal install tests, K1, parallel/serial `npm test`, all six target checks, active reinstall/smoke, and confirm no temporaries, K4a/history changes, or predecessor 4R byte drift [REQ-execution-identities-010]
