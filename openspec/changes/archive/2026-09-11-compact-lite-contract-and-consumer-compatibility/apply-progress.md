# Apply Progress: Compact Lite Contract and Consumer Compatibility

## PR 1 — Route Contracts and Validators

### Completed tasks

- [x] 1.1 Route-aware predecessor validation
  - RED: Added lite and standard transition fixtures plus CLI coverage for persisted-route authority, route conflicts, and undeclared persisted routes.
  - GREEN: `validate-phase.js` resolves `state.yaml.route.actual_route`, rejects conflicts and undeclared persisted routes, and supplies route-aware artifacts to `validatePhaseTransition`.
  - Verification: `node --test scripts/lib/flow-validator.test.js scripts/configure/validate-phase.test.js scripts/lib/route-dispatcher.test.js` — 116 passing, 0 failing.
- [x] 1.2 Routing floors and five-phase lite regression
  - Added a configuration-backed routing fixture proving the single lite route remains `sdd-propose → sdd-tasks → sdd-apply → sdd-verify → sdd-archive` and a `public_api` impact selects `standard` with the planned floor.
  - Verification: same focused test command — 116 passing, 0 failing.

### Batch verification

- `npm test` — exit 0.

### Files changed

- `skills/_shared/openspec-convention.md`: documented the persisted-route artifact-precondition matrix.
- `scripts/lib/flow-validator.js` and tests: validate proposal/spec/design predecessors for standard routes and `proposal-lite.md` for lite tasks.
- `scripts/configure/validate-phase.js` and tests: make the persisted route authoritative at CLI validation time.
- `scripts/lib/route-dispatcher.test.js`: pin routing-table lite phase order and public API floor behavior.

### Scope and next batch

This chained PR slice starts from `feat/compact-lite-contract-and-consumer-compatibility` and ends with route/dependency validation only. It does not modify phase producers/consumers, recovery, archive integrity, generated targets, or `dist/`.

Remaining tasks: 2.1–5.3.

## Integration remediation — K1 scope guard

- [~] 1.1–1.2 are awaiting the staged pre-commit equivalent after the initial hook rejected unmanifested `flow-validator` changes and a `validate-phase.js` byte drift against the frozen K1 baseline.
- The correction adds an explicit post-K1 successor classification for the flow validator files and a singleton protected-path successor contract for `validate-phase.js`; both preserve the K1 allowlist boundary and standard-route gate.

### Integration verification

- [x] 1.1–1.2: `node --test scripts/lib/k1-scope-guard.test.js scripts/lib/flow-validator.test.js scripts/configure/validate-phase.test.js scripts/lib/route-dispatcher.test.js` — 122 passing, 0 failing.
- [x] Staged pre-commit equivalent: `node scripts/check.js --staged` — exit 0.
- [x] Pre-commit wrapper: `node scripts/hooks/pre-commit-hook.js` — exit 0.
- K1 protection remains narrow: the frozen K1 inventory is not edited, the K1 allowlist is unchanged, and only `scripts/configure/validate-phase.js` is admitted as a named post-K1 protected-path evolution with standard/lite regression coverage.

## PR 2 — Compact Producers, Consumers, and Recovery

### Completed tasks

- [x] 2.1 Stable lite contract labels and task evidence
  - `proposal-lite.md` now requires stable `AC-N` labels; lite tasks retain each label and name linked verification evidence without a standard reconciliation matrix.
- [x] 2.2 Route-authoritative apply continuity
  - Apply resolves `state.yaml.route.actual_route`, requires the matching contract, and retains verified work when later batches append progress.
- [x] 2.3 Direct lite verification traceability
  - Verify maps every `AC-N` to its task, implementation, and evidence while standard keeps proposal/specs/design mandatory.
- [x] 3.1–3.3 Route-aware recovery and agent contracts
  - Phase agents, the orchestrator, and source rules declare the lite/standard artifact matrix, bounded summaries, and fail-closed missing-artifact recovery.
  - `pre-compact` now derives the next lite phase from persisted phase statuses; continuation tests preserve route, approvals, assumptions, gates, and prior progress.

### Focused TDD and verification

- RED: `node --test scripts/hooks/pre-compact.test.js` failed because a lite state with completed proposal/tasks and pending apply was summarized as `unknown`.
- GREEN: `pre-compact` resolves the next declared phase from `route.actual_route` plus `phases.*` status; the focused suite passed 75 tests, 0 failures.
- `npm test` — exit 0.
- `node scripts/hooks/pre-commit-hook.js` — exit 0; the real staged-equivalent wrapper allowed the commit.

### Files changed

- `skills/sdd-{propose,tasks,apply,verify}/SKILL.md`: stable lite acceptance labels and route-authoritative producer/consumer contracts.
- `agents/sdd-{propose,tasks,apply,verify,archive,orchestrator}.agent.md` and `rules/sdd-*.instructions.md`: recovery inputs, factual summary bounds, and no-promotion behavior.
- `scripts/hooks/pre-compact.js` and focused tests: recover the next lite phase from persisted status without mutating continuation state.
- `scripts/lib/apply-resume.test.js` and `scripts/hooks/subagent-stop.test.js`: preserve completed work and state-owned route/approval/assumption/gate data.

### Scope and next batch

This chained PR slice starts from `feat/compact-lite-contract-pr1` and ends with compact producers/consumers plus recovery. It does not modify archive integrity, generator parity, generated targets, or `dist/`.

Remaining tasks: 4.1–5.3.

## PR 3 — Archive Integrity and Six-Target Parity

### Completed tasks

- [x] 4.1 Route-complete lite archive inventory
  - The archive validator now requires proposal-lite, tasks, apply progress, verify report, and state for a persisted lite snapshot while retaining schema-v1 and empty `spec_writes` support.
- [x] 4.2 Fail-closed archive preflight
  - The transaction snapshot reads the persisted route; missing verify evidence and an invented design inventory entry both reject before mutation and preserve the origin.
- [x] 5.1–5.2 Compact contract and six-target parity
  - Added `scripts/compact-lite-contract.test.js` for stable producers, independent verification, absent-filler rejection, standard regression, six generated targets, and an injected unconditional standard read.
  - Extended the real-repo generator test with the same six-target artifact obligations and five-phase lite order.
- [x] 5.3 Generated output and full validation
  - Regenerated and inspected ignored `dist/{claude,vscode,github-copilot,opencode,codex,cursor}`; each generation reported `0 errors, 0 warnings`.

### Focused TDD and verification

- RED: `node --test scripts/lib/archive-plan.test.js` rejected the new lite fixture because a matching but verify-less inventory was previously accepted.
- GREEN: `node --test scripts/lib/archive-plan.test.js scripts/lib/archive-transaction.test.js scripts/compact-lite-contract.test.js` — 71 passing, 0 failing.
- `npm test` — completed after the full native suite, including compact lite generation parity.
- `git diff --check` — no whitespace errors.

### Scope completion

This chained PR slice starts from `feat/compact-lite-contract-pr2` and completes archive integrity plus generator parity. No previous-slice behavior was reverted; generated `dist/` remains an ignored regeneration artifact.

Remaining tasks: none; ready for `sdd-verify`.

## Post-Verify Correction — Review Gate Elevation

### Context

The Quality Review Gate was blocked (`classification_status: ambiguous`, `ambiguity_reasons: cross-capability-blast-radius`) because generator and skills span too many contracts to attribute domains safely. The maintainer authorized full four-lens coverage (trust, runtime, evolution, efficiency) before archive.

### Review outcomes and adjudication

- runtime — 1 CRITICAL: `readArchiveGateFacts` recognizes non-contract gate statuses (`passed|done|approved`) while `scripts/lib/quality-gates.js` emits `pass|fail|skipped`. Adjudicated pre-existing (the function is untouched by this branch); follow-up, not a candidate blocker.
- evolution — 1 CRITICAL candidate-caused: the lite archive minimum inventory omitted `archive-report.md`, contradicting `design.md` ("For lite, require state, lite proposal, tasks, apply progress, verify report, and the new archive report"). Also 1 WARNING: the `pre-compact.js` route-phase table covers only lite/standard (no behavior regression vs base; follow-up).
- efficiency — 1 SUGGESTION: duplicated six-target whole-tree generation scans across `compact-lite-contract.test.js` and `real-repo.test.js` (follow-up).
- trust — specialist dispatch crashed twice without a verdict; the orchestrator's inline advisory pass over the candidate delta found no candidate-caused trust findings. Recorded as a coverage limitation, not a specialist verdict.

### Correction (TDD)

- RED: `scripts/lib/archive-plan.test.js` > "lite inventory requires the archive report" and `scripts/lib/archive-transaction.test.js` > "lite archive missing archive-report blocks before mutation" both failed against the unmodified validator (`valid: true` / `outcome: success`).
- GREEN: added `archive-report.md` to `LITE_ARCHIVE_ARTIFACTS` in `scripts/lib/archive-plan.js`; aligned the `skills/sdd-archive/SKILL.md` Step 2 lite enumeration (report persisted in Step 3 before plan emission).
- Files changed: `scripts/lib/archive-plan.js`, `scripts/lib/archive-plan.test.js`, `scripts/lib/archive-transaction.test.js`, `skills/sdd-archive/SKILL.md`.
- Verification: `node --test scripts/lib/archive-plan.test.js scripts/lib/archive-transaction.test.js` — 71/71 pass; `node --test scripts/compact-lite-contract.test.js scripts/lib/k1-scope-guard.test.js` — 9/9 pass; `node --test scripts/configure/real-repo.test.js` — 43/43 pass.
- Working-tree diff fingerprint at correction: `sha256:80a9febd22b75e89c61630225a2382570d678606e8756a736d460a959f4231db`.

### Remaining follow-ups (non-blocking)

1. Base defect: `readArchiveGateFacts` gate-status vocabulary drift vs `quality-gates.js` (`pass|fail|skipped`).
2. `pre-compact.js` route-phase table limited to lite/standard; other configured routes fall back to legacy scalar fields.
3. Consolidate the duplicated six-target generation/tree-scan checks in the two parity test files.
