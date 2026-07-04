# Tasks: Per-change cost telemetry (C3)

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-hooks-001 / Dispatch cost recorded for active change | MUST | `scripts/hooks/subagent-stop.js`, `internal/hooks/subagentstop.go`, `persistPhaseCost` after `persistResultEnvelope` | covered-by-design | Mirrors C5 pattern exactly |
| REQ-hooks-001 / No active change — skip | MUST | Same `persistPhaseCost`, guarded by `findActiveChanges` | covered-by-design | No `.ospec/session/` creation |
| REQ-hooks-001 / Estimation or write failure — fail-safe | MUST | `try/catch` (JS) / `defer recover()` (Go) wrapping `persistPhaseCost` | covered-by-design | stdout/exit code untouched |
| E1 / SubagentStop phase-cost fixture family (floor 2→4) | MUST | 2 new fixtures + dedicated workspace `internal/testdata/parity/subagent-stop-phase-cost-workspace/` | covered-by-design | Per `clarify-fixture-floor-001` |
| E1 / Fixture set shrinks below floor — fails fast | MUST | `parity-contract.test.js` + `subagentstop_test.go` floor assertions | covered-by-design | Floor bumped to 4 in both suites + README |
| REQ-agents-001 / Cost block populated | MUST | `skills/sdd-archive/SKILL.md` Step 3, aggregation per ADR-001 | covered-by-design | tokens/phase, re-launches, questions |
| REQ-agents-001 / No cost data — block present but empty | MUST | Same Step 3, empty-data fallback branch | covered-by-design | Never gates archive |
| REQ-agents-001 / Cost block does not gate archive | MUST | Step 3 placed after existing gate checks | covered-by-design | Close-gate rules unchanged |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none — ADR-001 resolves the deferred aggregation-source decision

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~380–430 (design estimate; ~180 source, ~180 tests, ~30 fixtures/workspace, ~40 docs) |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | Single PR (size:exception, approved) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full change (hooks JS+Go, store writers JS+Go, fixtures/workspace, parity floor bump, archive Cost block, docs) | PR 1 (single) | `delivery-strategy-001` already approves `exception-ok`/single PR; no further split needed |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Foundation — Store Writers (JS + Go)

- [x] 1.1 RED: add failing unit test in `scripts/hooks/subagent-stop.test.js` asserting `appendPhaseCost` (via `ospec-state.js`) writes a JSONL line under `.ospec/session/{change}/phase-costs.jsonl` [REQ-hooks-001]
- [x] 1.2 GREEN: add `PHASE_COST_FILE_NAME` constant and `appendPhaseCost({workspace, changeName, record})` to `scripts/lib/ospec-state.js`, mirroring `appendRuntimeEvent` (mkdir -p + `withFileLock` + append), export both [REQ-hooks-001]
- [x] 1.3 Surface the phase-cost session path resolver in `scripts/lib/artifact-store.js`'s derived layout (single source of truth for the path) [REQ-hooks-001]
- [x] 1.4 RED: add failing Go test in `internal/hooks/subagentstop_test.go` (or `internal/store` test) asserting `AppendPhaseCost` writes the JSONL line under an advisory lock [REQ-hooks-001]
- [x] 1.5 GREEN: add `PhaseCostFileName` const, `SessionPhaseCostPath(changeName)`, `AppendPhaseCost(changeName, line []byte)` to `internal/store/store.go` (mkdir + `withLock` + `O_APPEND`) [REQ-hooks-001]

## Phase 2: Core Implementation — `persistPhaseCost` in Both Runtimes

- [x] 2.1 RED: add failing tests in `scripts/hooks/subagent-stop.test.js` for `persistPhaseCost`: writes a record for an active change (`phase`, `agent`, `est_tokens`, `status`, `ts`); skips silently (no `.ospec/session/` created) when no active change resolves; ignores non-`sdd-` agents; swallows estimation/write errors without affecting stdout [REQ-hooks-001]
- [x] 2.2 GREEN: implement `estimateResultTokens` (payload = first present `RESULT_FIELDS` value, string as-is else JSON-serialized; `est_tokens = Math.round(Buffer.byteLength(str,"utf8")/4)`), `resolveDispatchStatus` (envelope `status` → `input.status` → `"unknown"`), and `persistPhaseCost` in `scripts/hooks/subagent-stop.js`; call it in `runSubagentStop` right after `persistResultEnvelope` and before `skill_resolution` evaluation, wrapped in `try/catch`; export the three new functions [REQ-hooks-001]
- [x] 2.3 RED: add failing Go tests in `internal/hooks/subagentstop_test.go` mirroring 2.1, plus one asserting `est_tokens` equals the JS integer formula (`(len(str)+2)/4`) on a known non-ASCII payload [REQ-hooks-001]
- [x] 2.4 GREEN: port `estimateResultTokens`, `resolveDispatchStatus`, `persistPhaseCost` to `internal/hooks/subagentstop.go`; call in `runSubagentStop` after `persistResultEnvelope`, wrapped in `defer recover()` [REQ-hooks-001]
- [x] 2.5 REFACTOR: de-duplicate any shared logic between the JS/Go phase-key derivation (strip `sdd-` prefix) and existing `state.yaml` summary persistence phase-key resolution; no behavior change

## Phase 3: Parity Fixtures — Floor Bump 2→4

- [x] 3.1 Create checked-in workspace `internal/testdata/parity/subagent-stop-phase-cost-workspace/openspec/config.yaml` and `.../openspec/changes/demo/state.yaml` with `status: active` [E1, REQ-hooks-001]
- [x] 3.2 Create `internal/testdata/parity/subagent-stop-phase-cost-active-change.json` — stdin resolves to `__SUBAGENT_STOP_PHASE_COST_WORKSPACE__` token, no valid `json:result-envelope` fence, `expectedStdout` asserts `continue: true` byte-for-byte [E1, REQ-hooks-001]
- [x] 3.3 Create `internal/testdata/parity/subagent-stop-phase-cost-no-active-change.json` — stdin resolves to the existing `__SUBAGENT_STOP_FIXTURE_WORKSPACE__` (openspec-free) token, `expectedStdout` asserts `continue: true` byte-for-byte [E1, REQ-hooks-001]
- [x] 3.4 Update `internal/testdata/parity/parity-contract.test.js`'s (or shared) `prepareStdin` helper to substitute the new `__SUBAGENT_STOP_PHASE_COST_WORKSPACE__` token to the workspace path from 3.1 [E1]
- [x] 3.5 Bump SubagentStop fixture floor `2→4` in `scripts/hooks/parity-contract.test.js` [E1]
- [x] 3.6 Bump SubagentStop fixture floor `< 2`→`< 4` in `internal/hooks/subagentstop_test.go`'s `TestSubagentStop_ParityFixtures` [E1]
- [x] 3.7 Update `internal/testdata/parity/README` SubagentStop table row (floor `2`→`4`) and document the two new phase-cost fixtures + the new workspace token in the SubagentStop fixture workspace section [E1]

## Phase 4: Integration — Archive Cost Block

- [x] 4.1 In `skills/sdd-archive/SKILL.md` Step 3, add the Cost block procedure: read `.ospec/session/{change}/phase-costs.jsonl`, group/sum `est_tokens` by `phase` (labeled "estimated"), compute re-launches as `count(records for phase) - 1` floored at 0, sum `phases.*.questions_asked` from `state.yaml` (missing → 0) [REQ-agents-001]
- [x] 4.2 Add the empty-data fallback rule to the same Step 3 section: when the JSONL file is missing/empty, still emit the Cost block showing zero/"no data" per phase, and state the block never gates the close-gate/archive-move decision [REQ-agents-001]

## Phase 5: Verification / Cleanup

- [x] 5.1 Run `npm test` — confirm `subagent-stop.test.js` and `parity-contract.test.js` pass with the new floor and new unit tests [REQ-hooks-001, E1]
- [x] 5.2 Run `go test ./...` — confirm `subagentstop_test.go` passes with the new floor, new unit tests, and the cross-runtime `est_tokens` equality test [REQ-hooks-001, E1]
- [x] 5.3 Manual/agent walkthrough: archive a change with `phase-costs.jsonl` populated (one phase dispatched twice) and one with no file, confirming both Cost-block scenarios from REQ-agents-001 render as specified and never fail the archive [REQ-agents-001]
- [x] 5.4 Confirm `agents/sdd-archive.agent.md` needs no edit (still delegates to the skill) — no action, verification only

## Phase 6 — Remediación post-verify (warnings-remediation-001)

- [x] 6.1 Add a concurrent-writer test AND a stale-lock-reclaim test for `appendPhaseCost` (`scripts/lib/ospec-state.js:675-695`) in `scripts/lib/ospec-state.test.js`, mirroring the sibling `appendRuntimeEvent` tests [4R reliability WARNING]
- [x] 6.2 Add a doc-assertion contract test for the Cost Block in `skills/sdd-archive/SKILL.md` (heading, `phase-costs.jsonl` source, re-launches formula, `questions_asked` source, empty/missing-data fallback that never gates archive) [verify WARNING, tasks-gap]
