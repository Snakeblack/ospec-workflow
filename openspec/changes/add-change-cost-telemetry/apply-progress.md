# Apply Progress: add-change-cost-telemetry

**Delivery strategy**: `exception-ok` (`delivery-strategy-001`, `size:exception` — approved, no chained PRs). This batch (BATCH 1) intentionally implements Phase 1, Phase 2, and Phase 3 ONLY. Phase 4 (sdd-archive Cost block) and Phase 5 (verification/cleanup) are explicitly out of scope for this batch and are left for the next apply batch.

**Mode**: Strict TDD (per `openspec/config.yaml` `strict_tdd: true` + `npm test` runner).

## Batch 1 — Phase 1, 2, 3

### Phase 1: Foundation — Store Writers (JS + Go)

- [x] 1.1 RED — `scripts/hooks/subagent-stop.test.js`: added 2 failing tests for `appendPhaseCost` (write + append-a-second-line) before it existed.
- [x] 1.2 GREEN — `scripts/lib/ospec-state.js`: added `PHASE_COST_FILE_NAME = "phase-costs.jsonl"` and `appendPhaseCost({workspace, changeName, record})`, mirroring `appendRuntimeEvent`'s mkdir + `withFileLock` + append pattern; exported both.
- [x] 1.3 — `scripts/lib/artifact-store.js`: surfaced `phaseCostPath(changeName)` resolver and `appendPhaseCost(changeName, record)` convenience wrapper in the derived-layout surface (`DERIVED_LAYOUT.phaseCostFileName` sourced from `ospec.PHASE_COST_FILE_NAME` — single source of truth). Added 2 assertions to `scripts/lib/artifact-store.test.js`'s existing "resolves derived paths" test.
- [x] 1.4 RED — `internal/store/store_test.go`: added `TestAppendPhaseCost` (3 sub-tests: write+read, two sequential appends, `SessionPhaseCostPath` resolution) before the Go API existed (confirmed compile failure).
- [x] 1.5 GREEN — `internal/store/store.go`: added `PhaseCostFileName` const, `SessionPhaseCostPath(changeName)`, `AppendPhaseCost(changeName, line []byte)` (mkdir + `withLock` + `O_APPEND`), mirroring `AppendRuntimeEvent`.

**Local verification**: `node --test scripts/hooks/subagent-stop.test.js` (18/18 pass after GREEN), `node --test scripts/lib/artifact-store.test.js` (21/21 pass), `go test ./internal/store/...` (pass).

### Phase 2: Core Implementation — `persistPhaseCost` in Both Runtimes

- [x] 2.1 RED — `scripts/hooks/subagent-stop.test.js`: added failing tests for `persistPhaseCost` — writes a record for an active change; prefers a valid envelope's `status` over top-level `input.status` (triangulation); skips silently (no `.ospec/session/`) with no active change; ignores non-`sdd-*` agents; swallows an estimation error (circular-reference payload) without affecting stdout/return value; plus dedicated unit tests for `estimateResultTokens` and `resolveDispatchStatus`.
- [x] 2.2 GREEN — `scripts/hooks/subagent-stop.js`: implemented `resolveResultPayload` (first present `RESULT_FIELDS` value, raw), `estimateResultTokens` (`Math.round(Buffer.byteLength(str,"utf8")/4)`, string as-is else `JSON.stringify`), `resolveDispatchStatus` (valid envelope `status` → `input.status` → `"unknown"`), and `persistPhaseCost` (resolves active change, phase key, payload/tokens/status, appends via `appendPhaseCost`); called right after `persistResultEnvelope` and before the `skill_resolution` evaluation in `runSubagentStop`; self-contained `try/catch` fail-safe boundary; exported the three new functions.
- [x] 2.3 RED — `internal/hooks/subagentstop_test.go`: added 4 failing tests mirroring 2.1 (writes record, prefers envelope status, no-active-change no-op, non-sdd ignored) plus `TestSubagentStop_EstTokensMatchesJSFormula` asserting the Go integer formula `(len(str)+2)/4` equals the JS `Math.round(byteLength/4)` on `"café"` (5 UTF-8 bytes → 1) and `"abcdefg"` (7 bytes → 2) — confirmed compile failure (`undefined: hooks.EstimateResultTokens`) before implementation.
- [x] 2.4 GREEN — `internal/hooks/subagentstop.go`: ported `resolveResultPayload`, `EstimateResultTokens` (exported for cross-runtime parity), `resolveDispatchStatus`, `persistPhaseCost`; called in `runSubagentStop` right after `persistResultEnvelope`, wrapped in `defer recover()`.
- [x] 2.5 REFACTOR — extracted `derivePhaseKey(agentName)` (strip `sdd-` prefix) in both `subagent-stop.js` and `subagentstop.go`; both `persistResultEnvelope` and `persistPhaseCost` now call the same shared helper instead of duplicating the `strings.HasPrefix`/`.startsWith` + slice logic. No behavior change — full suite re-run green after the refactor.

**Local verification**: `node --test scripts/hooks/subagent-stop.test.js` → 27/27 pass. `go test ./internal/hooks/... -run TestSubagentStop_PersistPhaseCost` and `-run TestSubagentStop_EstTokensMatchesJSFormula` → pass. `go build ./...` clean. Cross-runtime spot check: `node -e 'estimateResultTokens("café")'` → `1`, `estimateResultTokens("abcdefg")` → `2`, matching the Go assertions exactly.

### Phase 3: Parity Fixtures — Floor Bump 2→4

- [x] 3.1 Created checked-in workspace `internal/testdata/parity/subagent-stop-phase-cost-workspace/openspec/config.yaml` (minimal openspec config) and `.../openspec/changes/demo/state.yaml` (`change: demo` / `status: active`).
- [x] 3.2 Created `internal/testdata/parity/subagent-stop-phase-cost-active-change.json` — `stdin.cwd` resolves via the new `__SUBAGENT_STOP_PHASE_COST_WORKSPACE__` token; no valid `json:result-envelope` fence; `expectedStdout` is `{"continue":true}`.
- [x] 3.3 Created `internal/testdata/parity/subagent-stop-phase-cost-no-active-change.json` — `stdin.cwd` reuses the existing `__SUBAGENT_STOP_FIXTURE_WORKSPACE__` (openspec-free) token; `expectedStdout` is `{"continue":true}`.
- [x] 3.4 Updated `scripts/hooks/parity-contract.test.js`'s `prepareStdin` to substitute both tokens (existing `__SUBAGENT_STOP_FIXTURE_WORKSPACE__` and new `__SUBAGENT_STOP_PHASE_COST_WORKSPACE__`).
- [x] 3.5 Bumped the `SubagentStop` fixture floor `2 → 4` in `scripts/hooks/parity-contract.test.js`.
- [x] 3.6 Bumped the `SubagentStop` fixture floor `< 2 → < 4` in `internal/hooks/subagentstop_test.go`'s `TestSubagentStop_ParityFixtures`, plus added the second token substitution there.
- [x] 3.7 Updated `internal/testdata/parity/README`: SubagentStop table row floor `2 → 4`, a "(Previously: ...)" note, and a new "SubagentStop phase-cost fixtures" section documenting both new fixtures + the new workspace token.

**Local verification**:
- JS: `node --test scripts/hooks/parity-contract.test.js` → 9/9 pass (5 PreToolUse + 4 SubagentStop, including both new phase-cost fixtures).
- Go: `go test ./internal/hooks/... -run TestSubagentStop_ParityFixtures -v` → 4/4 sub-tests pass.
- Manually confirmed the active-change fixture actually writes `.ospec/session/demo/phase-costs.jsonl` inside the fixture workspace (gitignored — `git status --short` shows the workspace directory as untracked-but-empty of `.ospec/`, and the tracked `state.yaml`/`config.yaml` remain byte-for-byte unchanged after the run).

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 1.1/1.2 | `scripts/hooks/subagent-stop.test.js` | Unit | ✅ 16/16 (pre-existing) | ✅ Written | ✅ 18/18 | ✅ 2 cases (single write + second-line append) | ➖ None needed | `appendPhaseCost` is a thin mkdir+lock+append wrapper; kept identical in shape to `appendRuntimeEvent`. |
| 1.3 | `scripts/lib/artifact-store.test.js` | Unit | ✅ 21/21 (pre-existing) | ✅ Written | ✅ 21/21 | ✅ 2 change names asserted | ➖ None needed | Purely structural path-resolution addition; single source of truth via `DERIVED_LAYOUT`. |
| 1.4/1.5 | `internal/store/store_test.go` | Unit | ✅ (existing `store` suite passing) | ✅ Written (compile failure confirmed) | ✅ `go test ./internal/store/...` pass | ✅ 3 sub-tests (write+read, 2 sequential appends, path resolution) | ➖ None needed | Direct Go mirror of `appendRuntimeEvent`/`AppendRuntimeEvent`. |
| 2.1/2.2 | `scripts/hooks/subagent-stop.test.js` | Unit | ✅ 18/18 (post-Phase-1) | ✅ Written | ✅ 27/27 | ✅ 5+ cases (active-change write, envelope-status-wins, no-active-change skip, non-sdd ignored, circular-payload fail-safe, plus dedicated `estimateResultTokens`/`resolveDispatchStatus` cases) | ✅ Clean — see 2.5 | `resolveDispatchStatus` re-derives the envelope (same fail-safe search as `persistResultEnvelope`) since `persistPhaseCost` runs as an independent step. |
| 2.3/2.4 | `internal/hooks/subagentstop_test.go` | Unit | ✅ (existing `hooks` suite passing) | ✅ Written (compile failure: `undefined: hooks.EstimateResultTokens`) | ✅ `go test ./internal/hooks/...` pass | ✅ 4 behavior cases + 2-value cross-runtime formula check (`café`→1, `abcdefg`→2) | ✅ Clean — see 2.5 | `EstimateResultTokens` exported specifically for this cross-runtime parity assertion. |
| 2.5 | both suites above | Unit | ✅ (2.1-2.4 green) | N/A (refactor) | ✅ full re-run green after extracting `derivePhaseKey` in both runtimes | N/A (behavior-preserving) | ✅ Clean | Approval-style refactor: reran both test files after the extraction; zero behavior change confirmed by unchanged pass counts. |
| 3.1-3.7 | `scripts/hooks/parity-contract.test.js`, `internal/hooks/subagentstop_test.go` | Integration (spawns/dispatches the real hook) | ✅ 7/7 JS parity (pre-Phase-3), Go parity 2/2 (pre-Phase-3) | ✅ Written (new fixtures + floor bump make the suite exercise both new cases) | ✅ JS 9/9, Go 4/4 sub-tests | ✅ 2 distinct fixture cases (active-change, no-active-change) | ➖ None needed | Fixture-driven; no production logic change, only fixture/harness/README additions and floor bump per `clarify-fixture-floor-001`. |

### Test Summary
- **Total tests written this batch**: 27 (JS: 2 store-writer + 2 artifact-store path + 12 persistPhaseCost/estimateResultTokens/resolveDispatchStatus in `subagent-stop.test.js`, wait — see exact count below; Go: 3 store + 5 hooks unit + fixture-driven sub-tests)
  - JS unit: `subagent-stop.test.js` grew from 16 → 27 tests (11 new); `artifact-store.test.js` gained 2 new assertions in an existing test; `ospec-state.js` gained the new `appendPhaseCost` covered by the 2 tests above.
  - JS parity: `parity-contract.test.js` grew from 7 → 9 tests (2 new fixture files).
  - Go unit: `store_test.go` gained `TestAppendPhaseCost` (3 sub-tests); `subagentstop_test.go` gained 5 new top-level tests (4 `PersistPhaseCost` tests + 1 `EstTokensMatchesJSFormula`).
  - Go parity: `TestSubagentStop_ParityFixtures` grew from 2 → 4 sub-tests (fixture-driven, no new Go test function).
- **Total tests passing**: JS 961 (full suite) minus 2 known pre-existing/environmental failures unrelated to this batch (see "Known Pre-Existing Issues" below); Go: all packages `ok` (`go test ./...`).
- **Layers used**: Unit (JS: `subagent-stop.test.js`, `artifact-store.test.js`, `ospec-state.js` via subagent-stop.test.js imports; Go: `store_test.go`, `subagentstop_test.go`), Integration (JS+Go parity fixture suites, spawn/dispatch the real hook binary/script).
- **Approval tests** (refactoring): None required as a distinct step — the 2.5 refactor's safety net was the full re-run of the just-written 2.1-2.4 tests (all green before and after).
- **Pure functions created**: `estimateResultTokens`/`EstimateResultTokens`, `resolveDispatchStatus` (both async/sync respectively but side-effect-free apart from the transcript-file read shared with `persistResultEnvelope`), `resolveResultPayload`, `derivePhaseKey` — all directly unit-tested without mocks.

## Known Pre-Existing Issues (NOT regressions from this batch)

- `scripts/hooks/parity-contract.test.js` → `PreToolUse · pre-tool-use-ask.json` fails ONLY when run as part of the full `npm test` suite in this real session's own working tree, because this session's own `.ospec/session/add-change-cost-telemetry/token-events.jsonl` (a real, git-ignored artifact accumulated by the Token Budget Advisor hook during this actual apply session) has crossed 150k tokens, and the fixture spawns the real `pre-tool-use.js` with `cwd=ROOT`. Unrelated to any file touched in this batch (`pre-tool-use.js` was never modified); passes when the same fixture is exercised via `TestPreToolUse_ParityFixtures` in Go (no real accumulated session state) or when the JS test file is the only one selected right after a session token reset.
- `scripts/lib/ospec-state.test.js` → `appendRuntimeEvent serializes concurrent writers without corrupting lines` intermittently fails with `EPERM` on Windows under the full suite (documented known flake — passes in isolation, confirmed again this batch: `node --test scripts/lib/ospec-state.test.js` → 50/50 pass).

## Workload / PR Boundary

- **Delivery strategy**: `exception-ok` / `size:exception` (`delivery-strategy-001`), explicitly instructed not to stop for size concerns this batch.
- **Diff size this batch** (tracked files only, `git diff --stat`): 11 files changed, 847 insertions(+), 14 deletions(-); plus 3 new untracked fixture/workspace paths (2 small JSON fixtures + a 2-file workspace directory).
- **Note**: this already exceeds the design's whole-change estimate (~380-430 lines) because Phase 1-3 required substantial new test coverage (strict TDD: RED tests for every new function/path, in both JS and Go, plus fixture-driven parity tests) beyond what the original per-file line estimate anticipated. Phase 4 (Archive Cost block — skill doc only, no tests) and Phase 5 (verification only, no new code) are expected to add comparatively little more. Flagged here per the Runtime Drift Guard, but per the explicit `size:exception` instruction this batch continued rather than stopping.
- **Current work unit**: BATCH 1 of 2 — Phases 1, 2, 3 complete. Phase 4 (`skills/sdd-archive/SKILL.md` Step 3 Cost block) and Phase 5 (final `npm test`/`go test`/manual-walkthrough verification) are the next batch's scope.
- **Boundary**: starts from an unmodified `main`-derived `feat/change-cost-telemetry` branch (JS/Go hooks + store baseline untouched); ends with both runtimes' `persistPhaseCost` fully implemented, tested, and parity-verified at the fixture floor of 4. Rollback = revert the 11 modified files + delete the 3 new fixture/workspace paths (no production call sites outside `subagent-stop.js`/`subagentstop.go` reference the new functions yet, since Phase 4 has not wired `sdd-archive` to read `phase-costs.jsonl`).

## Batch 2 — Phase 4, 5 (FINAL)

**Delivery strategy**: `exception-ok` (`delivery-strategy-001`, `size:exception` — approved, no chained PRs). This batch completes the change: Phase 4 (`skills/sdd-archive/SKILL.md` Cost block) and Phase 5 (full verification).

### Phase 4: Integration — Archive Cost Block

- [x] 4.1 Added the Cost block procedure as a new `#### Cost Block (REQ-agents-001)` subsection inside `skills/sdd-archive/SKILL.md` Step 3 (composed before the artifact is persisted, per Section C): reads `.ospec/session/{change-name}/phase-costs.jsonl`, groups/sums `est_tokens` by `phase` (labeled "estimated" per `REQ-hooks-001`), computes re-launches as `count(records for phase) - 1` floored at 0 (ADR-001), and sums `state.yaml`'s `phases.*.questions_asked` (missing phase → 0) for the total user-questions count (ADR-001). Includes the exact Markdown block template to render into the archive report.
- [x] 4.2 Added the empty/missing-data fallback rule in the same subsection: when `phase-costs.jsonl` is missing, empty, or has no parseable JSON lines, the block is still emitted with a "no data" note and the block composition explicitly states it never changes the close-gate enforcement (top of Step 2), spec-sync order, or the archive-folder move (Step 5) — cost incompleteness MUST NOT gate archive.

**Layer / doc-only note**: this batch's Phase 4 work is prose-only (a procedure description inside a `SKILL.md`, not executable code). There is no executable surface for `skills/sdd-archive/SKILL.md` itself, so no RED/GREEN/REFACTOR unit-test cycle applies — TDD Evidence below records this honestly as `N/A (doc-only)` rather than fabricating a test. Verification for this task is (a) the existing `operative-memory-contract.test.js`/`mentor-adr-contract.test.js` string-inclusion assertions on `skills/sdd-archive/SKILL.md`, which still pass unchanged (my edit only inserted a new subsection and did not remove/alter any string those tests assert on), and (b) the manual archive-walkthrough in 5.3 below, which independently exercises the exact aggregation logic described in the new prose against synthetic `phase-costs.jsonl` data.

### Phase 5: Verification / Cleanup

- [x] 5.1 `npm test` (`node scripts/check.js`, full suite) — **961/961 pass, 0 fail**, exit 0. Includes `subagent-stop.test.js` and `parity-contract.test.js` with the Phase 3 floor bump (2→4) and all Phase 1/2 unit tests. Neither Windows-flake gotcha fired this run (`ospec-state.test.js` concurrent-writers EPERM did not reproduce; `pre-tool-use-ask.json` token-advisor trip did not reproduce either — both previously documented as environmental, not regressions).
- [x] 5.2 `go test ./...` — all 8 packages `ok` (`cmd/ospec-hooks`, `internal/hooks`, `internal/jsonio`, `internal/resultenvelope`, `internal/rules`, `internal/skillreg`, `internal/store`, `internal/yamllite`), including `subagentstop_test.go`'s floor bump (`< 2` → `< 4`) and the cross-runtime `est_tokens` formula test.
- [x] 5.3 Manual archive-walkthrough of the Cost block logic, run against synthetic data mirroring both `REQ-agents-001` scenarios (script executed in the session scratchpad, not committed):
  - **Populated scenario** (`spec` once, `design` once, `apply` twice — mirrors the spec's exact scenario): aggregation produced `spec: tokens=120 (estimated), relaunches=0`; `design: tokens=200 (estimated), relaunches=0`; `apply: tokens=450 (estimated), relaunches=1` — matching the scenario's expectation of exactly 1 re-launch for the twice-dispatched `apply` phase and 0 for the once-dispatched phases.
  - **Empty/missing-data scenario**: reading a non-existent `phase-costs.jsonl` path (ENOENT swallowed) yields zero parseable lines, rendering the documented fallback line `"No per-phase cost data was recorded for this change (phase-costs.jsonl missing or empty)."` instead of omitting the block or throwing.
  - Both walkthroughs confirm the Step 3 subsection's described behavior renders correctly and independently confirm the block composition step never touches the close-gate/archive-move decision (no code path in the walkthrough script touches gate state).
- [x] 5.4 Confirmed `agents/sdd-archive.agent.md` needs no edit: read the file — it is a thin pointer ("Read the matching in-repository skill file and follow it exactly: `skills/sdd-archive/SKILL.md`") with no inlined Step 3/Cost-block prose to duplicate. No action taken, verification only, per the design's "Cost block lives in the skill, agent template untouched" decision.

## TDD Cycle Evidence — Batch 2

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|--------------------|
| 4.1/4.2 | N/A | N/A (doc-only, no executable surface) | ✅ existing `operative-memory-contract.test.js`/`mentor-adr-contract.test.js` string-assertions on `skills/sdd-archive/SKILL.md` still pass (961/961 full suite) | N/A | N/A | N/A | N/A | Prose-only change inside a `SKILL.md` instruction file — strict TDD's RED/GREEN cycle does not apply to non-executable Markdown procedure text; per the orchestrator's explicit note, documented honestly here instead of fabricating a test. Behavior of the described logic independently verified via the 5.3 manual walkthrough. |
| 5.1 | (full suite) | Integration/Unit (verification only, no new code) | N/A | N/A | N/A | N/A | N/A | `npm test` full run: 961/961 pass. |
| 5.2 | (full suite) | Integration/Unit (verification only, no new code) | N/A | N/A | N/A | N/A | N/A | `go test ./...`: all packages `ok`. |
| 5.3 | scratchpad script (not committed) | Manual/agent walkthrough | N/A | N/A | N/A | ✅ 2 scenarios (populated + empty) | N/A | Confirms the Step 3 Cost-block prose's described aggregation algorithm produces the exact figures REQ-agents-001's scenarios require. |
| 5.4 | N/A | Inspection only | N/A | N/A | N/A | N/A | N/A | Read `agents/sdd-archive.agent.md`; confirmed thin-pointer shape, no edit needed. |

## Status

23/23 tasks complete (all 5 phases done). Change is fully implemented, doc-updated, and both full test suites pass green. Ready for `sdd-verify`.
