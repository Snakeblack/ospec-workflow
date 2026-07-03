# Apply Progress: Strict Result Envelope (C5)

Mode: Strict TDD. Delivery: `size:exception` pre-accepted — single final PR,
work-unit commits internally per the suggested split in `tasks.md`.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes |
|------|-----------|-------|-------------|-----|-------|--------------|----------|-------|
| 1.1 | n/a (prose) | doc | `real-repo.test.js` orchestrator body sentinel | n/a | n/a | n/a | n/a | §D fence requirement added to `sdd-phase-common.md`; prose-only, no runtime test |
| 1.2 | `scripts/configure/real-repo.test.js` (existing) | doc | orchestrator body <700 lines | n/a | n/a | n/a | Trimmed prose twice to stay under the 700-line body budget (705 → 699 lines) | Result Contract fence-first extraction + fallback documented |
| 2.1 | `scripts/lib/result-envelope.test.js` | unit (JS) | none pre-existing (new module) | Confirmed: `Cannot find module './result-envelope.js'` | — | — | — | 23 cases: valid, each missing required field, bad `status` enum, malformed JSON, absent fence, bare-json-fence non-match, blocked+question_gate requirement, blocker_type enum, assumptions[] schema (missing field / bad reversibility / valid) |
| 2.2 | `scripts/lib/result-envelope.test.js` | unit (JS) | same file | (see 2.1) | 23/23 pass | Covered enum + shape edge cases within RED set (see above) | — | `extractEnvelope`/`validateEnvelope` implemented per §D schema; never throws |

## Work Unit 1 — JS validator + emission/consumption docs (PR 1 slice)

**Status**: done, committed (`c059776`).

Files:
| File | Action | What Was Done |
|------|--------|---------------|
| `skills/_shared/sdd-phase-common.md` | Modified | §D now requires exactly one strict `json:result-envelope` fence per phase return, additive to prose; documents canonical schema pointer (validator + Assumption Entry + Blocking Question shapes) and the omission convention |
| `agents/sdd-orchestrator.agent.md` | Modified | Result Contract section: fence is PRIMARY source, silent fallback to prose parsing when absent/invalid; kept within the 700-line orchestrator body budget |
| `scripts/lib/result-envelope.js` | Created | `extractEnvelope(text)` (fence regex + `JSON.parse`, never throws) + `validateEnvelope(obj)` (§D schema: required fields, `status` enum, `artifacts`/`risks` shape, `blocker_type` enum, `question_gate` required when blocked, Assumption Entry Schema) |
| `scripts/lib/result-envelope.test.js` | Created | 23 unit tests, all passing |
| `openspec/changes/strict-result-envelope/{proposal,design,tasks}.md`, `specs/**`, `decisions/*`, `state.yaml` | Committed | These SDD artifacts existed on disk from prior propose/spec/clarify/design/tasks phases but had never been committed to the feature branch; persisted alongside this work unit so the change is resumable from git history |

### Deviations from Design
None — implementation matches design (ADR-001, ADR-003).

### Issues Found
- The orchestrator Result Contract addition initially pushed `agents/sdd-orchestrator.agent.md`
  to 705 lines, tripping the pre-existing `real-repo.test.js` guard (`orchestrator body must be
  < 700 lines`). Trimmed the added prose twice (verbose → 4 lines → 3 lines) to land at 699
  lines while preserving the PRIMARY/fallback semantics. No spec or design change required —
  this is a pure editorial constraint on an existing, unrelated regression test.

### Status
4/20 tasks complete (1.1, 1.2, 2.1, 2.2). Ready for Work Unit 2 (JS persistence path: Phase 3).

## Work Unit 2 — JS persistence path: `ospec-state.js#setPhaseSummary` + `subagent-stop.js` wiring (PR 2 slice)

**Status**: done, ready to commit.

### TDD Cycle Evidence (appended)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes |
|------|-----------|-------|-------------|-----|-------|--------------|----------|-------|
| 3.1 | `scripts/lib/ospec-state.test.js` | unit (JS) | 46-case existing suite (0 regressions) | Confirmed: `setPhaseSummary is not a function` / `withFileLock is not a function` | — | — | — | 10 new cases: gap-fill (absent key + empty-string key), non-empty-guard no-op, quote/backslash escaping, 160-char truncation, multi-entry `key_decisions` rendering, unknown-phase no-op, empty-`key_decisions` omission, `withFileLock` mutual exclusion, `withAppendLock` alias identity |
| 3.2 | `scripts/lib/ospec-state.test.js` | unit (JS) | same file | (see 3.1) | 46/46 pass | Edge cases folded into the RED set above (absent vs empty-string summary; 0/1/2-entry key_decisions) | — | `withAppendLock` renamed internally to `withFileLock` (generic lock primitive); `withAppendLock` re-exported as a same-reference alias so `appendRuntimeEvent`'s existing callers/tests are untouched |
| 3.3 | `scripts/hooks/subagent-stop.test.js` | integration | 5 pre-existing cases (0 regressions) | Confirmed: 2 of 7 new cases red before wiring (valid-persist case had no writer; "missing fence" fixture had an unrelated regex-match test bug, fixed in the same RED step) | — | — | — | 7 new cases: valid fence persists summary+key_decisions, missing fence no-op (stdout/return unaffected), malformed-JSON fence no-op, missing-required-field fence no-op, pre-existing non-empty summary never overwritten, no-active-change no-op |
| 3.4 | `scripts/hooks/subagent-stop.test.js` | integration | same file + full `npm test` (884 tests incl. dist/config) | (see 3.3) | 12/12 in file; 738/738 `scripts/**/*.test.js`; `npm test` 0 errors/0 warnings | — | — | `persistResultEnvelope` runs BEFORE the existing `skill_resolution` evaluation per REQ-hooks-001, wrapped in a single top-level `try/catch` so it can never affect the hook's return value or stdout |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/ospec-state.js` | Modified | Added `setPhaseSummary(content, phase, {summary, keyDecisions})` — line-oriented, fill-gap surgical YAML writer (locates `phases.{phase}.summary`/`key_decisions`, writes only when summary is absent/empty, 160-char truncation + `"`/`\` escaping per §D). Renamed `withAppendLock` → `withFileLock` internally; kept `withAppendLock` exported as an identical-reference alias. Both exported. |
| `scripts/lib/ospec-state.test.js` | Modified | +10 `setPhaseSummary` cases, +2 `withFileLock`/`withAppendLock` cases |
| `scripts/hooks/subagent-stop.js` | Modified | New `findEnvelopeInInput`/`findEnvelopeInTranscript`/`findEnvelopeInValue` (mirror the existing §5.2 resolution-search field order, but for the `json:result-envelope` fence) and `persistResultEnvelope` (extract → `validateEnvelope` → resolve active change via `findActiveChanges` → phase key = agent name minus `sdd-` → `withFileLock` + re-read-under-lock + `setPhaseSummary` + `writeFileAtomic`). Wired to run before the existing `skill_resolution` block; single `try/catch` makes it fully fail-safe. |
| `scripts/hooks/subagent-stop.test.js` | Modified | +7 integration cases against a scratch `openspec/changes/*/state.yaml` |

### Deviations from Design

None structural. One **gap-fill decision** on an underspecified point (documented as an
assumption, not a spec/design contradiction):

- `key_decisions` is part of the Phase Summary Block shape (skills §"Phase Summary Block")
  that the hook must write, but it is **not** one of the required §D Result Envelope fields
  (`REQUIRED_FIELDS` in `result-envelope.js` correctly omits it — adding it there would be a
  spec violation). Design's `setPhaseSummary(content, phase, {summary, keyDecisions})`
  signature takes `keyDecisions` as a parameter but does not say where the hook should source
  it from inside the parsed envelope object.
  - **Resolution taken**: treat `key_decisions` as an optional, pass-through extra key on the
    fence JSON object — if a phase includes it in its fence (matching the existing Phase
    Summary Block convention), the hook forwards it verbatim to `setPhaseSummary`; if absent,
    `keyDecisions` defaults to `[]`. This does not add a new required field, does not change
    `validateEnvelope`'s schema, and degrades gracefully when omitted.
  - This is recorded as an internal-only assumption (no observable-behavior change to the
    *validation* contract; it only affects what optional data the hook happens to relay) —
    see `assumptions` in the return envelope for this batch.

### Issues Found

None beyond the pre-existing "concurrent writers" flaky note already tracked in memory
(`disable-env-vars-break-tests.md` / EPERM-on-Windows-under-full-suite) — not hit in this
batch's run.

### Status
8/20 tasks complete (1.1, 1.2, 2.1, 2.2, 3.1, 3.2, 3.3, 3.4). Full `npm test` green (884
tests incl. dist/config validators). Ready for Work Unit 3 (Go mirror: Phase 4).

## Work Unit 3 — Go mirror: `internal/resultenvelope`, `internal/yamllite#SetPhaseSummary`, `internal/hooks/subagentstop.go` (PR 3 slice)

**Status**: done, ready to commit.

### TDD Cycle Evidence (appended)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes |
|------|-----------|-------|-------------|-----|-------|--------------|----------|-------|
| 4.1 | `internal/resultenvelope/resultenvelope_test.go` | unit (Go) | none pre-existing (new package) | Confirmed: `no non-test Go files in .../internal/resultenvelope` (build failed) | — | — | — | 24 cases mirroring 2.1: valid fence, absent fence, malformed JSON, bare-`json`-fence non-match, each missing required field, bad `status` enum, `artifacts`/`risks` shape, blocked+question_gate, blocker_type enum (bad + all 4 valid values), assumptions[] (missing field / bad reversibility / valid), nil-input no-panic |
| 4.2 | `internal/resultenvelope/resultenvelope_test.go` | unit (Go) | same file | (see 4.1) | 24/24 pass | Enum + shape edge cases folded into the RED set above | — | `Extract(text) (map[string]any, bool)` + `Validate(v map[string]any) (bool, []string)`; same schema as `result-envelope.js`, never panics |
| 4.3 | `internal/yamllite/yamllite_test.go` | unit (Go) | 0 regressions in package | Confirmed: `undefined: yamllite.SetPhaseSummary` (build failed, 8 call sites) | — | — | — | 8 cases mirroring 3.1: gap-fill (absent key + empty-string key), non-empty-guard no-op, quote/backslash escaping, 160-char truncation, multi-entry key_decisions, unknown-phase no-op, empty-key_decisions omission |
| 4.4 | `internal/yamllite/yamllite_test.go` | unit (Go) | same file | (see 4.3) | 8/8 pass | — | Found and fixed a **test-authoring bug** introduced by a bash heredoc that silently collapsed `\\` (double backslash) literals to `\` inside the escaping-test's expected string — corrected via a targeted `Edit`, not a code change; the implementation was already correct | `SetPhaseSummary(content, phase, summary string, keyDecisions []string) string` in `internal/yamllite/yamllite.go`, line-oriented port of the JS surgical writer |
| 4.5 | `internal/hooks/subagentstop_test.go` | integration (Go) | 17 pre-existing cases (0 regressions) | Confirmed: `TestSubagentStop_PersistsValidEnvelopeFence` red (no summary/key_decisions written; writer not wired yet) | — | — | — | 6 cases mirroring 3.3: valid fence persists summary+key_decisions, missing fence no-op, malformed-JSON fence no-op, missing-required-field fence no-op, non-empty summary never overwritten, no-active-change no-op |
| 4.6 | `internal/hooks/subagentstop_test.go` | integration (Go) | same file + full `go test ./...` | (see 4.5) | 23/23 in package; `go build ./...`, `go vet ./...`, `go test ./...` all clean | — | — | `persistResultEnvelope` runs BEFORE the existing resolution logic in `runSubagentStop`, wrapped in `defer recover()` so it can never panic or affect the hook's stdout/exit code |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `internal/resultenvelope/resultenvelope.go` | Created | Go mirror of `extractEnvelope`/`validateEnvelope`: `Extract(text) (map[string]any, bool)`, `Validate(v map[string]any) (bool, []string)` |
| `internal/resultenvelope/resultenvelope_test.go` | Created | 24 unit tests, all passing |
| `internal/yamllite/yamllite.go` | Modified | Added `SetPhaseSummary(content, phase, summary string, keyDecisions []string) string` — line-oriented fill-gap writer mirroring `ospec-state.js#setPhaseSummary` |
| `internal/yamllite/yamllite_test.go` | Modified | +8 `SetPhaseSummary` cases |
| `internal/store/store.go` | Modified | Exported `WithLock(path string, fn func() error) error` — a thin wrapper over the package's existing private `withLock`, so `internal/hooks` can reuse the same advisory-lock primitive already exercised by `AppendRuntimeEvent` instead of duplicating it (this **is** the "Go `withLock` mirror of `withFileLock`" called for by task 4.6 — reused rather than re-implemented, since an equivalent, already-tested primitive existed) |
| `internal/hooks/subagentstop.go` | Modified | New `findEnvelopeInValue`/`findEnvelopeInInput`/`findEnvelopeInTranscript` (mirror the existing `resultFields` search order for the envelope fence) and `persistResultEnvelope` (extract → `resultenvelope.Validate` → resolve active change via `store.FindActiveChanges` → phase key = agent name minus `sdd-` → `store.WithLock` + re-read-under-lock + `yamllite.SetPhaseSummary` + local `atomicWriteFile`). Wired to run before the existing skill_resolution block; `defer recover()` makes it fully panic-safe. |
| `internal/hooks/subagentstop_test.go` | Modified | +6 integration cases against a scratch `openspec/changes/*/state.yaml` |

### Deviations from Design

- **`withLock` reuse instead of a new mirror**: design/tasks describe "a Go `withLock` mirror of
  `withFileLock`". `internal/store/store.go` already had a private, already-tested `withLock`
  function with the exact same cross-platform advisory-lock semantics (`.lock` sibling,
  `O_EXCL` create, stale-lock reclamation after 10s). Rather than duplicating that logic inside
  `internal/hooks`, it was exported as `store.WithLock` and reused. This is a **cosmetic
  deviation** per the apply skill's own rule (an equivalent existing helper with the same
  contract) — not a `design-mismatch`: behavior, retry/backoff, and reclaim semantics are
  byte-for-byte identical to what a from-scratch mirror would have implemented, and the parity
  contract (Phase 5) only asserts observable hook behavior, not internal call graphs.

### Issues Found

- **Test-authoring bug, not implementation bug** (task 4.4): a `bash <<'EOF'` heredoc used to
  append the initial `SetPhaseSummary` Go test cases silently collapsed doubled backslash
  literals (`\\` → `\`) inside one raw Go string literal, producing a RED failure that looked
  like an escaping bug in `SetPhaseSummary` itself. Confirmed via a standalone `go run` probe
  (`%q`-formatted byte comparison) that the implementation's output was already correct and the
  *test's* expected string was wrong; fixed with a single targeted `Edit` to the test file only.
  No production code was changed for this issue. Recorded here per the skill's "Issues Found"
  requirement even though it was self-contained within this batch.

### Status
14/20 tasks complete (Phases 1-4 done). `go build ./...`, `go vet ./...`, `go test ./...` all
green (0 regressions across `cmd/ospec-hooks`, `internal/hooks`, `internal/jsonio`,
`internal/resultenvelope`, `internal/rules`, `internal/skillreg`, `internal/store`,
`internal/yamllite`). Ready for Work Unit 4 (Phase 5: parity fixtures + `parity-contract.test.js`
parameterization + Phase 6 verification).

## Work Unit 4 — Parity fixtures + `parity-contract.test.js` parameterization + Phase 6 verification (PR 4 slice)

**Status**: done, ready to commit. Final work unit for this change.

### TDD Cycle Evidence (appended)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes |
|------|-----------|-------|-------------|-----|-------|--------------|----------|-------|
| 5.1 | `internal/testdata/parity/subagent-stop-valid-envelope.json` | fixture | manual probe script (spawned real hook) | n/a (fixture authoring, not code) | Verified via a throwaway spawn script: actual stdout `{"continue":true}` matches `expectedStdout` byte-for-byte | Same fixture re-verified through both `parity-contract.test.js` (JS) and `TestSubagentStop_ParityFixtures` (Go) | — | Valid fence, healthy `skill_resolution: injected`, `cwd` uses the `__SUBAGENT_STOP_FIXTURE_WORKSPACE__` placeholder token (see below) |
| 5.2 | `internal/testdata/parity/subagent-stop-malformed-envelope.json` | fixture | same manual probe | n/a | Verified: malformed-JSON fence + no resolution signal → `{"continue":true}`, matches `expectedStdout` | Same as above | — | Documented fail-open fixture per REQ-hooks-001 MODIFIED — identified by filename (`malformed-envelope`), not by a parser-error text pattern, since SubagentStop never surfaces implementation-specific text on envelope failure |
| 5.3 | `internal/testdata/parity/README` | doc | `scripts/eje-def-contract.test.js` (existing prose-invariant guard) | Confirmed: guard requires literal `pretooluse_test.go` substring; my first generalized wording (`{pretooluse,subagentstop}_test.go`) broke that literal match | Fixed by spelling out both filenames separately; guard passes | — | Documents the fixture-family table, the fail-open rule per hook, and the fixture-workspace placeholder mechanism |
| 5.4 | `scripts/hooks/parity-contract.test.js` | integration (JS) | 5 pre-existing PreToolUse cases (0 regressions) | Rewrote as a parameterized fixture-family table; RED implicitly covered by 5.1/5.2's placeholder-substitution requirement (a naive spawn without substitution fails validatePath and would silently no-op differently) | 7/7 (5 PreToolUse + 2 SubagentStop) | — | Refactored PreToolUse's fail-open logic into the same generic `isFailOpen`/`assertFailOpen` table-driven shape SubagentStop now uses | Added `prepareStdin` hook per fixture family to substitute `__SUBAGENT_STOP_FIXTURE_WORKSPACE__` with the real absolute path to the checked-in fixture workspace right before spawning |
| 5.5 | `internal/hooks/subagentstop_test.go` (`TestSubagentStop_ParityFixtures`) | integration (Go) | 23 pre-existing SubagentStop cases (0 regressions) | Mirrors 5.4's placeholder-substitution and fail-open handling | 2/2 fixtures pass | — | — | Byte-for-byte for the valid-envelope fixture; stable-field-only (`continue:true`) for the malformed-envelope fixture, mirroring the JS harness |
| 6.1 | full `npm test` | full suite | — | n/a | 0 errors/0 warnings, "All checks passed" (884 tests incl. dist/config validators) | One environment-flaky failure hit and RETRIED per `known-issues`/session memory: `ospec-state.test.js`'s pre-existing `"appendRuntimeEvent serializes concurrent writers"` (Windows EPERM under full-suite lock contention) — passed in isolation (46/46) and on suite retry; a second full run also hit a real token-budget-advisor trip (unrelated pre-existing hook reacting to this session's actual accumulated token usage) which cleared on retry | — | Both flakes are pre-existing/environmental, not caused by this change's code (confirmed by isolated re-runs) |
| 6.2 | full `go test ./...` | full suite | — | n/a | All 8 packages `ok` (`cmd/ospec-hooks`, `internal/hooks` incl. both parity suites, `internal/jsonio`, `internal/resultenvelope`, `internal/rules`, `internal/skillreg`, `internal/store`, `internal/yamllite`); `go vet ./...` clean | — | — | — |
| 6.3 | manual trace (Node one-off script, not persisted as a test file) | manual/inspection | n/a | n/a | Traced a synthetic `sdd-design` return through `runSubagentStop` into a scratch `state.yaml`: first pass fills the empty `summary`/`key_decisions` gap; a second pass with a conflicting envelope leaves the file byte-identical to the first pass's output (fill-gap guard holds) | — | — | Full transcript included below for auditability |

#### Task 6.3 manual trace transcript

```
--- BEFORE ---
change: demo-change
status: applying
phases:
  design:
    status: done
    artifact: "openspec/changes/demo-change/design.md"
    summary: ""

--- AFTER (first pass, fill-gap write) ---
change: demo-change
status: applying
phases:
  design:
    status: done
    artifact: "openspec/changes/demo-change/design.md"
    summary: "JWT stateless con refresh rotativo; 3 archivos nuevos en src/auth."
    key_decisions:
      - "RS256 sobre HS256 (multi-servicio)"

--- AFTER (second pass, must be unchanged — fill-gap guard) ---
change: demo-change
status: applying
phases:
  design:
    status: done
    artifact: "openspec/changes/demo-change/design.md"
    summary: "JWT stateless con refresh rotativo; 3 archivos nuevos en src/auth."
    key_decisions:
      - "RS256 sobre HS256 (multi-servicio)"

Guard held: true
```

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `internal/testdata/parity/subagent-stop-valid-envelope.json` | Created | Valid `json:result-envelope` fence, `skill_resolution: injected` (healthy), placeholder `cwd`; `expectedStdout: {"continue":true}` |
| `internal/testdata/parity/subagent-stop-malformed-envelope.json` | Created | Fence present but invalid JSON, no resolution signal; `expectedStdout: {"continue":true}` — the documented fail-open fixture |
| `internal/testdata/parity/subagent-stop-workspace/.gitkeep` | Created | Checked-in, deliberately `openspec/`-free directory the two fixtures resolve their `cwd` placeholder to, so persistence is always a no-op and the parity run can never mutate a real `state.yaml` (including this very change's) |
| `internal/testdata/parity/README` | Modified | Documents the fixture-family table (hook / prefix / floor / spawned script / Go test), the fail-open rule per hook, and the `__SUBAGENT_STOP_FIXTURE_WORKSPACE__` placeholder mechanism |
| `scripts/hooks/parity-contract.test.js` | Modified (rewritten) | Parameterized over a `FIXTURE_FAMILY` table (`PreToolUse` + `SubagentStop`); each entry declares its own floor, fail-open detection/assertion, and an optional `prepareStdin` hook (used by `SubagentStop` for the workspace placeholder substitution) |
| `internal/hooks/subagentstop_test.go` | Modified | Added `TestSubagentStop_ParityFixtures`, mirroring `TestPreToolUse_ParityFixtures`'s shape with the same placeholder substitution and fail-open handling |

### Deviations from Design

- **Fixture-workspace placeholder token, not a literal `cwd`** (undocumented mechanism in
  design/tasks, resolved as an internal decision): a static, git-checked-in JSON fixture cannot
  embed a real, portable, machine-independent absolute path, yet the design explicitly requires
  "Fixture `stdin.cwd` MUST point to a workspace with no active change" to keep the parity run
  from mutating a real `state.yaml`. Introduced the literal token
  `__SUBAGENT_STOP_FIXTURE_WORKSPACE__` in both fixtures' `stdin.cwd`, substituted by both parity
  harnesses (JS `prepareStdin`, Go's `TestSubagentStop_ParityFixtures`) with the absolute path to
  a new, checked-in, `openspec/`-free `internal/testdata/parity/subagent-stop-workspace/`
  directory immediately before spawning/dispatching. This is internal-only (no observable schema
  or CLI-contract change — the fixture JSON shape is unchanged; only *this* field's value is a
  documented sentinel instead of a literal path) and was necessary to satisfy the design's own
  "must never mutate a real state.yaml" requirement, since the JS harness spawns the real
  `subagent-stop.js` with `cwd: ROOT` (this very repository, which — being this very change's
  workspace — has an active `strict-result-envelope` change!) as the process cwd, and the fixture
  payload's own `cwd` field is what actually governs where the hook looks for `openspec/changes/`.
  Recorded as `sdd-apply-001` in this batch's `assumptions` (reversibility: high — the fixtures
  and harnesses can be swapped for a different placeholder scheme without touching the hook or
  validator code).
- **README literal-string constraint discovered mid-edit**: an existing, unrelated prose-invariant
  test (`scripts/eje-def-contract.test.js`, "E1 · parity fixtures are executed by BOTH runtimes")
  asserts the README contains the literal substring `pretooluse_test.go`. My first generalized
  wording (`internal/hooks/{pretooluse,subagentstop}_test.go`) did not contain that literal
  substring and broke the guard. Fixed by spelling out both Go test file names separately. No
  spec/design conflict — this is a pre-existing doc-invariant test unrelated to REQ-hooks-001
  that simply constrains acceptable README phrasing; not a `design-mismatch` (cosmetic, same
  information content).

### Issues Found

- Two flaky/environmental `npm test` failures were hit across retries, both **pre-existing and
  unrelated to this change's code** (confirmed via isolated re-runs):
  1. `scripts/lib/ospec-state.test.js` → `"appendRuntimeEvent serializes concurrent writers
     without corrupting lines"` — Windows `EPERM` under full-suite lock contention. Already
     tracked in this session's memory (`disable-env-vars-break-tests.md` /
     `feedback-4r-gate-check.md` sibling note on this exact test). Passes in isolation (46/46)
     and on suite retry.
  2. A full-suite run separately tripped the pre-existing `token-budget-advisor` hook inside
     `pre-tool-use.js` (unrelated to REQ-hooks-001), reacting to this session's own real,
     accumulated token usage crossing its configured threshold when the entire ~884-test suite
     spawns many real hook subprocesses back-to-back. Cleared on retry; not caused by any file
     this change touches.
- No new BLOCKER/WARNING entries were added to `openspec/memory/known-issues.md` — both issues
  above are transient/environmental (already known or self-clearing on retry), not a structural
  code or spec defect introduced by this change.

### Status
**20/20 tasks complete.** All 6 phases done. `npm test`: 0 errors/0 warnings (884 tests, "All
checks passed"). `go build ./...`, `go vet ./...`, `go test ./...`: all 8 packages green, 0
regressions. Manual end-to-end trace (6.3) confirms the fence → validate → fill-gap-persist →
`state.yaml` flow behaves exactly as ADR-002/ADR-003 specify. Ready for `sdd-verify`.

## Work Unit 5 — 4R Gate Remediation (Phase 7, post-verify batch `4r-remediation-001`)

**Status**: done. Fixes 1 BLOCKER + 2 CRITICAL + 5 parity WARNINGs from the post-verify
4R review, all RED-first. Pre-existing infra WARNINGs explicitly out of scope per the
user-approved remediation batch: `recoverOrphanBak`'s empty `catch`, `findActiveChanges`/
`FindActiveChanges` fail-fast behavior, and Go `atomicWriteFile`'s missing `.bak` fallback
— left as follow-up.

### TDD Cycle Evidence (appended)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes |
|------|-----------|-------|-------------|-----|-------|--------------|----------|-------|
| 7.1 | `scripts/lib/ospec-state.test.js` + `internal/yamllite/yamllite_test.go` | unit (JS+Go) | 49 JS / existing Go `SetPhaseSummary` cases (0 regressions) | Confirmed both RED: JS — injected `\n` produced a real physical `status: done` line and injected `\r\n` fabricated a second `phases:` line; Go — identical two failures | 49/49 JS, all Go `yamllite` green | Added a 4th JS-only case (emoji/surrogate-pair code-point-safe truncation at the 160 boundary) beyond the 2 injection cases, since Go's rune-based truncation already passed | Truncate-by-code-point BEFORE escape (not the literal "escape then truncate" reading of the finding) — chosen because escaping-then-truncating-the-escaped-string can split a 2-char escape sequence and leave a dangling `\` right before the closing quote, which is itself a new injection vector; documented as `sdd-apply-003` | `escapeYamlDoubleQuoted` now escapes `\n`,`\r`,`\t` as literal 2-char sequences and any other C0 control byte as `\xHH`, in both `ospec-state.js` and `yamllite.go`; JS truncation switched from UTF-16 `.slice()` to `Array.from(...).slice()` (code-point safe, matching Go's `[]rune`) |
| 7.2 | `scripts/hooks/subagent-stop.test.js` + `internal/hooks/subagentstop_test.go` | integration (JS+Go) | 15 JS / 25 Go pre-existing `subagent-stop`/`subagentstop` cases (0 regressions) | Both new tests actually started GREEN (the `agent_type.startsWith("sdd-")` / `strings.HasPrefix(agentName, "sdd-")` guards were already correctly implemented, just uncovered) | 16/16 JS, 26/26 Go in-package | — | — | No production change needed; coverage-only fix. Confirms the CRITICAL finding was a test-coverage gap, not a live bug |
| 7.3 | `scripts/lib/atomic-write.test.js`, `scripts/lib/ospec-state.test.js`, `scripts/hooks/subagent-stop.test.js` | unit + integration (JS) | 7 pre-existing `atomic-write` cases + 50 `ospec-state` + 15 `subagent-stop` (0 regressions) | Confirmed 3-way RED: (a) double-rename-failure test asserted `error.message` mentions `.bak` and `error.bakPath` is set — failed with the raw untouched `EPERM` message; (b) `readState` orphaned-`.bak` test — `readState` returned `null` because `state.yaml` never existed; (c) `persistResultEnvelope` orphaned-`.bak` integration test (turned out to already be satisfied end-to-end once (b) was fixed, since `findActiveChanges`→`readState` resolves the active change first — see Deviations) | 8/8 atomic-write, 50/50 ospec-state, 16/16 subagent-stop | — | — | `writeFileAtomic`'s rollback-failure branch now throws an aggregate `Error` carrying `.bakPath`/`.code`/`.cause` instead of silently swallowing the rollback error; `recoverOrphanBak` is now called at the top of `ospec-state.js#readState` (before every `fs.readFile`) AND defensively again inside `persistResultEnvelope`'s lock-held fresh-read (defense-in-depth for the narrower race window between `findActiveChanges` resolving the change and the write-lock being acquired) |
| 7.4 | `scripts/hooks/subagent-stop.test.js` + `internal/hooks/subagentstop_test.go` | integration (JS+Go) | 16 JS / 26 Go (0 regressions) | JS sibling-fence test confirmed RED (picked the first/losing sibling); Go's equivalent test passed immediately (Go's `findEnvelopeInValue` already walked sorted-reverse) | 17/17 JS, 27/27 Go | — | — | JS `findEnvelopeInValue` now reverses sibling values before iterating (matching `findStructuredResolution`'s existing "last-sibling-wins" semantics and Go's sorted-reverse walk); Go test added purely for coverage parity |
| 7.5 | `scripts/lib/result-envelope.test.js` + `internal/resultenvelope/resultenvelope_test.go` | unit (JS+Go) | 23 JS / 24 Go pre-existing (0 regressions) | JS tests passed immediately (`Set` iteration is insertion-order, already deterministic); Go test confirmed RED (`sortedKeys` never called `sort.Strings`, observed message order `blocked, success, partial` instead of declaration order `success, partial, blocked`) | 26/26 JS, 27/27 Go | Covered all 3 enums (`status`, `reversibility`, `blocker_type`) as 3 separate triangulated cases per runtime | — | Replaced Go's `sortedKeys`/`joinKeys(map[string]bool)` with 3 ordered `[]string` enum-declaration slices (`statusEnumOrder`, `reversibilityEnumOrder`, `blockerTypeEnumOrder`) used directly for `strings.Join` in error messages, keeping the membership maps (`toMembershipSet`) only for O(1) validity checks — now byte-for-byte identical to the JS `Set` insertion order |
| 7.6 | `scripts/hooks/subagent-stop.test.js` + `internal/hooks/subagentstop_test.go` | integration (JS+Go) | 17 JS / 27 Go (0 regressions) | JS test confirmed RED (`String(42)`→`"42"`, `String({nested:true})`→`"[object Object]"`, `String(null)`→`"null"` were all persisted verbatim); Go test passed immediately (already filters via `item.(string)`) | 18/18 JS, 28/28 Go | — | — | `persistResultEnvelope` in `subagent-stop.js` now filters `key_decisions` to `typeof item === "string"` entries before persisting, dropping non-strings instead of `String()`-coercing them — matches Go's existing behavior exactly |
| 7.7 | folded into 7.1 (`ospec-state.test.js` emoji/surrogate-pair case) | unit (JS) | same as 7.1 | Confirmed RED: `Array.from(match[1]).length` was 80 (UTF-16 code units halved by surrogate pairs), not 160 | 50/50 | — | — | See 7.1 — `truncateToCodePoints` fixes this jointly with the injection fix |
| 7.8 | approval-test refactor (all pre-existing `setPhaseSummary`/`SetPhaseSummary` cases used as the safety net; no new test required per the strict-tdd "purely structural extraction" exception) | refactor (JS+Go) | 50/50 JS, all Go `yamllite` green before AND after | N/A — pure refactor, no behavior change | 50/50 JS, Go `yamllite` green after each edit | Triangulation skipped: extraction only moves an existing, already-tested code path into a named function; no new branching introduced | Extracted `findKeyDecisionsBlockEnd(lines, startIndex, phaseBlockEnd)` in both `ospec-state.js` and `yamllite.go`, reducing the `for` → `if` → `while` → `if` nesting in `setPhaseSummary`/`SetPhaseSummary` down to `for` → `if` → (function call) | Ran the full 50-case JS suite and the full Go `yamllite` package after the extraction in each language — 0 regressions |

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/lib/ospec-state.js` | Modified | `escapeYamlDoubleQuoted` now escapes control chars (`\n`,`\r`,`\t`,C0 → `\xHH`); new `truncateToCodePoints` helper, used by `toYamlDoubleQuoted` before escaping; new `findKeyDecisionsBlockEnd` helper extracted out of `setPhaseSummary`; `readState` now calls `recoverOrphanBak(statePath)` before every read; now requires `./atomic-write.js` |
| `internal/yamllite/yamllite.go` | Modified | `escapeYamlDoubleQuoted` mirrors the same control-char escaping; new `findKeyDecisionsBlockEnd` helper extracted out of `SetPhaseSummary` (its `toYamlDoubleQuoted` already truncated by rune first, so no truncation-order change was needed there) |
| `scripts/lib/atomic-write.js` | Modified | The rollback-failure branch inside the Windows rename-fallback's `catch` now throws an aggregate `Error` (`.bakPath`, `.code`, `.cause` set) instead of silently swallowing the rollback error |
| `scripts/hooks/subagent-stop.js` | Modified | `findEnvelopeInValue` now reverses sibling values before recursing (last-sibling-wins, matching `findStructuredResolution`); `persistResultEnvelope` filters `key_decisions` to string entries only and calls `recoverOrphanBak` before its lock-held fresh re-read; now requires `recoverOrphanBak` from `./atomic-write.js` |
| `internal/resultenvelope/resultenvelope.go` | Modified | Replaced non-sorting `sortedKeys`/`joinKeys(map)` with 3 declaration-ordered `[]string` enum slices used directly in `strings.Join` for deterministic, JS-parity error messages; kept membership maps (via new `toMembershipSet` helper) for O(1) validity checks |
| `scripts/lib/ospec-state.test.js` | Modified | +3 injection/truncation cases (`\n` line-forgery, `\r\n` key-forgery, emoji code-point truncation); +1 orphaned-`.bak` recovery case for `readState` |
| `internal/yamllite/yamllite_test.go` | Modified | +3 cases mirroring the JS injection/truncation cases |
| `scripts/lib/atomic-write.test.js` | Modified | +1 double-rename-failure case asserting the `.bak`-path-carrying error and that content remains recoverable at `.bak` |
| `scripts/hooks/subagent-stop.test.js` | Modified | +5 cases: non-`sdd-*` agent guard, orphaned-`.bak` recovery, mixed-type `key_decisions` filtering, sibling-fence last-wins ordering |
| `internal/hooks/subagentstop_test.go` | Modified | +3 cases mirroring the JS non-`sdd-*` guard, mixed-`key_decisions`, and sibling-fence-order cases (all passed immediately — Go was already correct; added for coverage parity) |
| `internal/resultenvelope/resultenvelope_test.go` | Modified | +3 cases asserting the exact, declaration-ordered enum messages for `status`, `reversibility`, `blocker_type` |
| `scripts/lib/result-envelope.test.js` | Modified | +3 cases mirroring the same 3 deterministic-message assertions (all passed immediately — JS `Set` iteration was already insertion-ordered; these now serve as the parity oracle for 7.5) |
| `openspec/changes/strict-result-envelope/tasks.md` | Modified | Appended `## Phase 7: 4R Gate Remediation` with 8 new `[x]` tasks (7.1-7.8) mapping 1:1 to the approved findings |

### Deviations from Design

- **7.1 truncation-vs-escaping order deviates from the finding's literal wording**
  (`"ANTES del truncado a 160"`, i.e. escape-then-truncate). Escaping first and then
  truncating the *escaped* string by 160 chars can split a freshly-inserted 2-char
  escape sequence (e.g. `\n`) in half, leaving a dangling `\` immediately before the
  closing `"` — which would itself re-open the exact injection class this fix closes
  (the dangling backslash would escape the closing quote). Implemented instead:
  truncate the RAW value by Unicode code point to 160 first, THEN escape the
  (already-160-code-point) result. This is provably safe (escaping a complete string
  can never produce a half-sequence) and additionally satisfies WARNING 7.7
  (code-point-safe truncation) in the same change. Recorded as assumption
  `sdd-apply-003` (reversibility: high — purely an internal ordering detail inside a
  single private helper, not part of any documented external contract).
- **7.3's `persistResultEnvelope`-level `recoverOrphanBak` call could not be isolated
  as its own RED test**: `findActiveChanges` (used to resolve the active change before
  `persistResultEnvelope`'s own read) already routes through the newly-fixed
  `readState`, so by the time `persistResultEnvelope`'s fresh-read-under-lock runs, an
  orphaned `.bak` at the top level has already self-healed. The added integration test
  therefore validates the end-to-end observable behavior (orphaned `.bak` → hook still
  persists correctly) rather than isolating the second call site in a unit test — the
  second `recoverOrphanBak` call remains defense-in-depth for the narrower race window
  between `findActiveChanges` resolving the change and the write-lock being acquired,
  and is exercised (as a no-op fast path) by the same test and by all pre-existing
  `subagent-stop.test.js` persistence cases.
- No spec delta changes were required: none of the 8 fixes alter any stdout-observable
  hook contract already asserted by `specs/hooks/spec.md` §REQ-hooks-001 or the E1
  parity fixtures (`internal/testdata/parity/subagent-stop-*.json`) — confirmed by the
  full parity suite staying green byte-for-byte after every fix.

### Issues Found

None beyond what is already documented in Work Unit 4's "Issues Found" (pre-existing,
environmental EPERM/token-advisor flakes, unrelated to this batch). This batch's full
`npm test` and `go test ./...` runs were both clean on the first attempt, no retries
needed.

### Status
**8/8 remediation tasks complete (7.1-7.8).** `npm test`: 914/914 passing, 0 errors/0
warnings, "All checks passed". `go build ./...`, `go vet ./...`, `go test ./...`: all 8
packages green, 0 regressions. `gofmt -l` clean on every modified Go file. Scope
respected: no changes to `recoverOrphanBak`'s empty catch, `findActiveChanges`/
`FindActiveChanges` fail-fast behavior, or Go `atomicWriteFile`'s missing `.bak`
fallback (explicitly deferred follow-up). Ready for `sdd-verify` re-run on this batch.
