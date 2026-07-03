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
