# Tasks: Hybrid Transactional Archive Runtime

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-archive-plan-contract-001 / Valid minimal plan parses | MUST | `scripts/lib/archive-plan.js` `parsePlan`, `validatePlanShape` | covered-by-design | Pure validator, no I/O |
| REQ-archive-plan-contract-001 / Unknown schema version rejected | MUST | `scripts/lib/archive-plan.js` `PLAN_SCHEMA_VERSION`, `validatePlanShape` | covered-by-design | Code `invalid-schema` |
| REQ-archive-plan-contract-002 / Wrong content hash blocks | MUST | `validatePlanAgainstSnapshot`, runtime preflight | covered-by-design | Code `hash-mismatch` |
| REQ-archive-plan-contract-002 / Stale target_before_sha256 blocks | MUST | `validatePlanAgainstSnapshot` | covered-by-design | Code `hash-mismatch` |
| REQ-archive-plan-contract-003 / Rejection uses allowlisted code only | MUST | `PLAN_REJECTION_CODES`, `isKnownRejectionCode` | covered-by-design | Frozen v1 allowlist |
| REQ-archive-plan-contract-003 / Unknown future code fails closed | MUST | `isKnownRejectionCode` consumers | covered-by-design | Fail-closed on unknown |
| REQ-archive-transaction-runtime-001 / Failure before commit leaves origin intact | MUST | `archive-transaction.js` I/O shell, FS fixtures | covered-by-design | No live writes on preflight fail |
| REQ-archive-transaction-runtime-001 / No delete before full match | MUST | `nextTransactionAction`, compare A/B | covered-by-design | Delete only after compare B |
| REQ-archive-transaction-runtime-001 / Full match commits then deletes | MUST | staging → commit → compare B → delete | covered-by-design | Receipt on success |
| REQ-archive-transaction-runtime-002 / Failure after staging resumable | MUST | `journal.json` state machine, resume matrix | covered-by-design | Same `plan_sha256` |
| REQ-archive-transaction-runtime-002 / Rollback restores safety | MUST | `rollbackTransaction`, `staging-rename` | covered-by-design | Never rewrite archive/ |
| REQ-archive-transaction-runtime-002 / Idempotent re-run after commit | MUST | `done` state → `already_complete: true` | covered-by-design | No destructive re-delete |
| REQ-archive-transaction-runtime-003 / Windows rename fallback | MUST | `atomic-write.js` `renameWithFallback` | covered-by-design | EPERM/EEXIST once |
| REQ-archive-transaction-runtime-003 / Linux atomic rename | MUST | Same `renameWithFallback` on POSIX | covered-by-design | Single live target |
| REQ-archive-transaction-runtime-004 / Success receipt closes route | MUST | `receipt.json` + stdout via CLI | covered-by-design | Cost aggregation included |
| REQ-archive-transaction-runtime-004 / Hash mismatch receipt no delete | MUST | `outcome: failed`, `origin_deleted: false` | covered-by-design | `failure_reason` separate from plan codes |
| REQ-agents-008 / Runtime success receipt closes route | MUST | `agents/sdd-orchestrator.agent.md` | covered-by-design | No ad-hoc recursive diff |
| REQ-agents-008 / Runtime failure halt source intact | MUST | orchestrator + `gate-archive-quality.md` | covered-by-design | Halt sentinel preserved |
| REQ-agents-008 / Executor never deletes or self-certifies | MUST | `agents/sdd-archive.agent.md`, `sdd-archive/SKILL.md` | covered-by-design | Contract-test anchored |
| skills / Stale baseline at archive preflight | MUST | `readArchiveGateFacts`, runtime preflight | covered-by-design | `baseline-stale` in `failure_reason` |
| skills / ADR listed in plan for runtime promotion | MUST | `sdd-archive/SKILL.md` Step 4b/5 | covered-by-design | No live `docs/adr/**` writes |
| skills / No decisions directory — empty promotions | MUST | Plan emission Step 5 | covered-by-design | `adr_promotions: []` |
| skills / Executor reports plan not completion | MUST | Plan-and-Report contract prose | covered-by-design | Contract tests re-anchored |
| skills / Partial semantic prep not concealed | MUST | Return envelope rules | covered-by-design | No success with incomplete plan |
| skills / Source directory left intact by executor | MUST | SKILL.md + agent contract | covered-by-design | No delete instructions |
| skills / Cost on success receipt | MUST | Receipt cost block from `phase-costs.jsonl` | covered-by-design | Estimated labels preserved |
| skills / Missing cost does not block receipt | MUST | `cost.available: false` fallback | covered-by-design | Transaction success independent |

### Reconciliation Verdict

- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~900–1,400 (source + tests); +dist regeneration |
| 400-line budget risk | High |
| Chained PRs recommended | Yes (cognitive load; optional given approved exception) |
| Suggested split | Unit 1 plan-contract → Unit 2 runtime → Unit 3 agent-prose+contracts → Unit 4 docs+dist |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Pure plan validator + unit tests | PR 1 (optional) | `archive-plan.js`, `archive-plan.test.js`; no filesystem |
| 2 | Transaction runtime + CLI + atomic-write extension | PR 2 (optional) | Reducer, I/O shell, FS fixtures, `archive-transaction-run.js` |
| 3 | Agent prose + three contract re-anchors (same slice) | PR 3 (optional) | SKILL/agents edits + `archive-move-fingerprint-contract.test.js`, `mentor-adr-contract.test.js`, `real-repo.test.js` |
| 4 | Roadmap sync + dist rebuild + full test pass | PR 4 or same PR | O4.2 done / O6A in progress; six `build:*` targets |

With `exception-ok` approved, Units 1–4 MAY ship as a single PR (`size-exception`). Split only if reviewer load warrants it.

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Plan Contract (Pure Validator)

- [x] 1.1 RED: Create `scripts/lib/archive-plan.test.js` — failing tests for `parsePlan` (valid JSON, malformed), `validatePlanShape` (minimal v1 plan succeeds; unknown `schema_version` → `invalid-schema`; bad `rollback.strategy` → `invalid-rollback-strategy`; `change-name-mismatch`) [REQ-archive-plan-contract-001, REQ-archive-plan-contract-003]
- [x] 1.2 RED: Add failing snapshot tests — `validatePlanAgainstSnapshot` rejects missing path (`missing-reference`), wrong `content_sha256` / `target_before_sha256` (`hash-mismatch`), inventory/fingerprint drift (`inventory-mismatch`) [REQ-archive-plan-contract-002, REQ-archive-plan-contract-003]
- [x] 1.3 RED: Add failing test — unknown rejection code from validator is treated fail-closed by `isKnownRejectionCode` consumer path [REQ-archive-plan-contract-003]
- [x] 1.4 GREEN: Implement `scripts/lib/archive-plan.js` — exports `PLAN_SCHEMA_VERSION`, `PLAN_REJECTION_CODES`, `parsePlan`, `validatePlanShape`, `validatePlanAgainstSnapshot`, `isKnownRejectionCode`; no `fs` [REQ-archive-plan-contract-001, REQ-archive-plan-contract-002, REQ-archive-plan-contract-003]
- [x] 1.5 GREEN: Run `node --test scripts/lib/archive-plan.test.js` until all plan-contract tests pass [REQ-archive-plan-contract-001, REQ-archive-plan-contract-002, REQ-archive-plan-contract-003]

## Phase 2: Atomic Write Extension

- [x] 2.1 RED: Extend `scripts/lib/atomic-write.test.js` — failing tests for additive `renameWithFallback` on files and directories (success path; simulated `EPERM` then success; simulated `EEXIST` then success) [REQ-archive-transaction-runtime-003]
- [x] 2.2 GREEN: Add `renameWithFallback` export to `scripts/lib/atomic-write.js`; leave `writeFileAtomic` unchanged [REQ-archive-transaction-runtime-003]
- [x] 2.3 GREEN: Verify `renameWithFallback` tests pass without regressing existing atomic-write tests [REQ-archive-transaction-runtime-003]

## Phase 3: Transaction Runtime (Reducer + I/O Shell)

- [x] 3.1 RED: Create `scripts/lib/archive-transaction.test.js` reducer block — failing tests for `nextTransactionAction` per journal state (`init`→`preflighted`→`staged`→`compared`→`committed`→`confirmed`→`done`; resume from `staged`/`compared`/`committed`; terminal `done` idempotence; `journal-plan-conflict` on mismatched `plan_sha256`; terminal `failed`/`rolled-back` [REQ-archive-transaction-runtime-002]
- [x] 3.2 RED: Add failing pure tests for `readArchiveGateFacts` over `state.yaml` variants (verdict pass, missing quality-gates, override present, absent `baseline_fingerprints`) [REQ-archive-transaction-runtime-001, skills stale-baseline scenario]
- [x] 3.3 GREEN: Implement pure exports in `scripts/lib/archive-transaction.js` — `nextTransactionAction`, `readArchiveGateFacts`, `computeInventory` (sorted POSIX paths, raw-byte SHA-256, symlink/junction → fail-closed) [REQ-archive-transaction-runtime-001, REQ-archive-transaction-runtime-002]
- [x] 3.4 RED: Add FS fixture tests (mkdtemp workspace) — pre-commit failure leaves origin intact; hash mismatch blocks delete; full match commits specs/ADRs/archive folder then deletes origin; post-staging resume; rollback `staging-rename`; idempotent re-run with `already_complete: true` [REQ-archive-transaction-runtime-001, REQ-archive-transaction-runtime-002]
- [x] 3.5 RED: Add FS fixture — Windows fallback via `fsImpl` injecting `EPERM`/`EEXIST` once on rename; assert exactly one live target, origin not deleted until compare B [REQ-archive-transaction-runtime-003]
- [x] 3.6 GREEN: Implement I/O shell — `runArchiveTransaction`, `rollbackTransaction`; journal/receipt under `.ospec/archive-tx/{change}/`; preflight re-reads gates from `state.yaml`; integrates `validatePlanAgainstSnapshot`; uses `renameWithFallback` for commit [REQ-archive-transaction-runtime-001, REQ-archive-transaction-runtime-002, REQ-archive-transaction-runtime-003]
- [x] 3.7 RED: Add failing CLI smoke test or script-level test — `scripts/archive-transaction-run.js` prints receipt JSON, exit `0` only on `success`/`resumed-success` [REQ-archive-transaction-runtime-004]
- [x] 3.8 GREEN: Create `scripts/archive-transaction-run.js` thin CLI wrapper delegating to `runArchiveTransaction` [REQ-archive-transaction-runtime-004]
- [x] 3.9 GREEN: Add receipt tests — success includes inventory + cost (or `available: false`); failed compare sets `outcome: failed`, `origin_deleted: false`, `parity.go: n/a` [REQ-archive-transaction-runtime-004, skills Cost scenarios]
- [x] 3.10 GREEN: Run `node --test scripts/lib/archive-transaction.test.js` until all runtime tests pass [REQ-archive-transaction-runtime-001, REQ-archive-transaction-runtime-002, REQ-archive-transaction-runtime-003, REQ-archive-transaction-runtime-004]

## Phase 4: Agent Prose + Contract Re-anchors (Single Slice)

- [x] 4.1 Modify `skills/sdd-archive/SKILL.md` — Copy-and-Report → Plan-and-Report; Step 4b proposes ADRs in plan; Step 5 emits `archive-plan.json`; no live spec/ADR writes; no delete/copy-to-archive completion; Cost human-readable only [REQ-agents-008, skills Plan-and-Report, skills ADR Promotion, skills Cost]
- [x] 4.2 Modify `skills/_shared/gate-archive-quality.md` — Post-Return Move Completion delegates to runtime invocation + receipt; preserve halt-with-source-intact sentinel [REQ-agents-008]
- [x] 4.3 Modify `agents/sdd-archive.agent.md` — required artifacts include plan emission; no move/delete/live writes [REQ-agents-008, skills Plan-and-Report]
- [x] 4.4 Modify `agents/sdd-orchestrator.agent.md` — Reads/Writes for `sdd-archive` (plan + receipt); invoke `node scripts/archive-transaction-run.js {change}`; receipt as sole close authority [REQ-agents-008]
- [x] 4.5 Re-anchor `scripts/archive-move-fingerprint-contract.test.js` — replace `recursively diff the destination` / `copy inventory` sentinels with plan/runtime contract strings [REQ-agents-008, skills Plan-and-Report]
- [x] 4.6 Re-anchor `scripts/mentor-adr-contract.test.js` — update A5.2/A5.3/G.1 anchors from Step 4b live-copy prose to plan-based ADR promotion [skills ADR Promotion]
- [x] 4.7 Re-anchor `scripts/configure/real-repo.test.js` — replace `recursively diff the destination` sentinel; keep halt sentinel; update expected file anchor for gate-archive-quality [REQ-agents-008]
- [x] 4.8 GREEN: Run the three contract test files together — `node --test scripts/archive-move-fingerprint-contract.test.js scripts/mentor-adr-contract.test.js scripts/configure/real-repo.test.js` [REQ-agents-008, skills Plan-and-Report, skills ADR Promotion]

## Phase 5: Documentation, Distribution, and Verification

- [x] 5.1 Update `docs/roadmaps/harness-evolution.md` — mark O4.2 done and O6A in progress (doc-only, no behavior change) [proposal In Scope]
- [x] 5.2 Regenerate six distribution targets after prose edits: `npm run build:claude && npm run build:copilot && npm run build:opencode && npm run build:codex && npm run build:vscode && npm run build:cursor` [proposal Affected Areas]
- [x] 5.3 Run full suite `npm test` on current OS; confirm new archive tests and contract re-anchors pass [proposal Success Criteria]
- [x] 5.4 Record apply branch advisory in apply-progress when starting: `feat/hybrid-archive-transaction-runtime` per `branch-pr` skill [proposal Branch advisory]
