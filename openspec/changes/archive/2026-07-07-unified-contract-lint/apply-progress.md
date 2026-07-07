# Apply Progress: unified-contract-lint

Mode: Strict TDD (RED → GREEN → TRIANGULATE → REFACTOR per task).
Delivery: size-exception, pre-approved — single PR, 8 phases.

## Status Summary

| Phase | Status | Notes |
|-------|--------|-------|
| 1 — Aggregator core (`contract-lint.js`) | DONE | Unit-level test against fake checkers; no short-circuit; throw propagates |
| 2 — I1 checker (`i1-manifest.js`) | DONE | All sub-tasks 2.1-2.6 covered by tmp-fixture tests |
| 3 — Retrofit 14 `SKILL.md` | DONE | All 14 files edited; 3.2 integration proof passes (0 offenders vs real repo) |
| 4 — J1 extraction (`j1-commands-agents.js`) | DONE | Extraction only; legacy test adapted; rel-1/rel-2 preserved and promoted into synthetic-offender tests |
| 5 — I3 extraction (`i3-budget-constant.js`) | DONE | Extraction only; legacy test adapted; ceiling/floor semantics preserved; Go mirror untouched |
| 6 — Wire registry + harness (`contract-lint.test.js`) | DONE | Real registry wired; harness passes; `node scripts/check.js` confirmed picking it up with zero edits to `check.js` |
| 7 — J2 `static-lint` evidence level | DONE | `sdd-verify/SKILL.md` + `references/report-format.md` updated |
| 8 — Apply `skills` spec delta | DONE | REQ-skills-001 (§2.6) and REQ-skills-002 (§17a) applied to living spec; clarifications appended |

All 8 phases complete. Full task checklist in `tasks.md` is checked off.

## Remediation batch (post-4R review gate)

Approved by the user (`approval-003` in `state.yaml`): fix the 1 CRITICAL + 3 WARNING findings from `review-reliability` in this same change, before re-verify/archive.

### TDD Cycle Evidence

| Fix | Test File | RED | GREEN | TRIANGULATE | REFACTOR | Notes |
|-----|-----------|-----|-------|-------------|----------|-------|
| CRITICAL — phase skill with no bound agent file silently passed (`i1-manifest.js` ~187-189) | `scripts/lib/contract-checkers/i1-manifest.test.js` | "phase skill exists but its bound agent file is missing -> emits an explicit offender, not []" written first, failed against old code | Checker now emits an explicit offender when a canonical phase skill has no `agents/{name}.agent.md` on disk | "phase skill with missing bound agent does not suppress checks for a sibling phase skill that has one" | n/a | Closes the false-negative on the exact drift scenario I1 exists to catch |
| WARNING 1 — `agentsSpecPath` read without guard (`j1-commands-agents.js` ~79) | `scripts/lib/contract-checkers/j1-commands-agents.test.js` | "missing agentsSpecPath yields an explicit offender instead of throwing ENOENT" | try/catch added around the read, mirrors the existing `commandsDir` graceful pattern | "agentsSpecPath being a directory (not a file) also yields an offender, not a thrown error" | n/a | Consistent error handling across both artifact reads in the same function |
| WARNING 2 — 2 offender branches uncovered (`j1-commands-agents.js` ~141-164) | `scripts/lib/contract-checkers/j1-commands-agents.test.js` | Two new tests written against already-correct logic (coverage gap, not a behavior bug) | N/A (no code change needed — logic was already correct) | "command file with an absent 'agent:' frontmatter field yields an offender", "command file whose declared router agent file does not exist yields an offender" | n/a | Pure coverage fix, confirmed no logic change was required |
| WARNING 3 — `require(ospecStatePath)` unguarded (`i3-budget-constant.js` ~114) | `scripts/lib/contract-checkers/i3-budget-constant.test.js` | "missing scripts/lib/ospec-state.js yields an explicit offender instead of throwing MODULE_NOT_FOUND" | try/catch added around the `require`, mirrors the `hooks.json` graceful pattern | "syntactically-corrupt ospec-state.js yields an explicit offender instead of crashing" | n/a | Consistent error handling across both declared-artifact reads |

### Final verification (post-remediation)

- `node --test "scripts/lib/contract-checkers/*.test.js"` — 33/33 passing (includes the 6 new remediation tests).
- `node --test "scripts/**/*.test.js"` — 1078/1078 passing (full suite, no regressions).
- All 4 findings (1 CRITICAL, 3 WARNING) from the 4R `review-reliability` report are resolved with dedicated regression tests.

## Files created

- `scripts/lib/contract-lint.js` — aggregator (`runAllCheckers(ctx, registry)`), default registry
  `[checkI1Manifest, checkCommandsAgents, checkBudgetConstant]` imported from the 3
  `contract-checkers/*.js` modules below.
- `scripts/lib/contract-lint.test.js` — Phase 1 unit-level aggregator test (fake checkers, no
  real repo dependency): call-count spies, all-pass case, no-short-circuit case, throw-propagates
  case.
- `scripts/lib/contract-checkers/i1-manifest.js` — I1 checker: `parseRuntimeCapabilities`,
  `PHASE_SKILLS` (14 canonical names, literal copy of `openspec/specs/skills/spec.md` §1.1),
  `CAPABILITY_TO_TOOL`, direction (a)/(b) internal helpers, exported `check(ctx)` (accepts
  optional `ctx.phaseSkills` override for fixture isolation — production callers omit it and get
  the real 14).
- `scripts/lib/contract-checkers/i1-manifest.test.js` — 15 tests covering 2.1-2.6 plus the 3.2
  real-repo integration proof.
- `scripts/lib/contract-checkers/j1-commands-agents.js` — J1 checker: `parseCommandRoster`
  (moved verbatim), the roster/allowlist cross-check loop, rel-1/rel-2 guards as offenders.
  Exports `check(ctx)` (offenders only) and a secondary `checkDetailed(ctx)` returning
  `{offenders, checked, missingFromRoster, arrowRowCount}` so the adapted legacy test can keep its
  `sdd-document.prompt.md` anchor assert without re-deriving the roster logic.
- `scripts/lib/contract-checkers/j1-commands-agents.test.js` — happy path against the real repo,
  the anchor-preservation assert, and 3 synthetic-offender fixtures (roster/allowlist mismatch,
  rel-1 missing-row, rel-2 zero-arrow-rows).
- `scripts/lib/contract-checkers/i3-budget-constant.js` — I3 checker: `checkBudgetRelationship`
  (generalized "declared value in, runtime constant in, relationship assertion in" helper) plus
  `check(ctx)` wiring the SessionStart/LOCK_* reference pair. A single parameterized helper reused
  once — no plugin registry for hypothetical future pairs, per design.md's explicit guidance.
- `scripts/lib/contract-checkers/i3-budget-constant.test.js` — happy path against the real repo,
  2 synthetic-offender fixtures (ceiling breach, floor breach) via a fixture `hooks.json` +
  fixture `ospec-state.js` module, and 2 unit tests on `checkBudgetRelationship` directly.
- `scripts/contract-lint.test.js` — Phase 6 harness: real registry against the real repo (`[]`
  expected), plus the "one checker fails, others still run" integration case using injected fake
  checkers (does not mutate real repo files).

## Files modified

- `skills/sdd-apply/SKILL.md`, `skills/sdd-baseline/SKILL.md`, `skills/sdd-init/SKILL.md`,
  `skills/sdd-onboard/SKILL.md`, `skills/sdd-verify/SKILL.md`, `skills/sdd-workspace/SKILL.md`
  — added `runtime_capabilities: {execute: true, mcp: false, write: true}` (6 agents whose
  `tools:` include `execute`).
- `skills/sdd-archive/SKILL.md`, `skills/sdd-clarify/SKILL.md`, `skills/sdd-design/SKILL.md`,
  `skills/sdd-explore/SKILL.md`, `skills/sdd-foundation/SKILL.md`, `skills/sdd-propose/SKILL.md`,
  `skills/sdd-spec/SKILL.md`, `skills/sdd-tasks/SKILL.md`
  — added `runtime_capabilities: {execute: false, mcp: false, write: true}` (8 agents without
  `execute`).
  - All 14: block placed as a sibling top-level frontmatter field immediately after `metadata:`'s
    block ends (before the closing `---`), never nested inside `metadata:`. `capabilities:` field
    untouched (none of these 14 files declare it anyway).
- `scripts/commands-agents-contract.test.js` — adapted to `require("./lib/contract-checkers/
  j1-commands-agents.js")`; two tests: happy-path `check()` and the anchor/guard-preservation
  assert via `checkDetailed()`.
- `scripts/lib/ospec-state.test.js` — the ~928-957 I3 test replaced with a call to
  `require("./contract-checkers/i3-budget-constant.js").check({root: REPO_ROOT})`, asserting `[]`;
  ceiling/floor semantics preserved inside the extracted checker, not loosened.
- `skills/sdd-verify/SKILL.md` — inserted `static-lint` between `static-proof` and
  `inspection-proof` in the Evidence Levels list, plus the behavior-vs-structural MUST-scenario
  compliance rule.
- `skills/sdd-verify/references/report-format.md` — added `static-lint` to the Evidence Levels
  list with matching wording.
- `openspec/specs/skills/spec.md` — applied REQ-skills-001 as new §2.6 (near the existing
  frontmatter-contract requirements, right after §2.5 `capabilities:`), REQ-skills-002 as new
  §17a (standalone cross-cutting requirement, placed just before §18 Cross-References since the
  living spec has no dedicated `sdd-verify` integration-points section to fold it into), and
  appended the `### Session 2026-07-07` clarifications block after the existing `2026-06-20`
  entry. `scripts/check.js` — confirmed unchanged (no edit needed; see Discoveries #2 below).

## TDD Cycle Evidence

### Phase 1 — `scripts/lib/contract-lint.js`

- RED: wrote `scripts/lib/contract-lint.test.js` with spy fake checkers (one returns an
  offender, one returns `[]`); asserted call counts and concatenation.
- GREEN: implemented `runAllCheckers(ctx, registry = DEFAULT_REGISTRY)` using
  `registry.flatMap((c) => c(ctx))` — no `some`/`every`/early return.
- TRIANGULATE: added a throwing-checker case; asserted the aggregator lets the error propagate
  (`assert.throws`) rather than swallowing it as an offender — documented explicitly in the
  JSDoc so this can't silently regress into a try/catch-and-suppress later.
- REFACTOR: documented the `Offender`/`CheckerContext`/`Checker` shapes as JSDoc typedefs at the
  top of the file; no behavior change.
- Result: `node --test scripts/lib/contract-lint.test.js` — 4/4 passing.

### Phase 2 — `scripts/lib/contract-checkers/i1-manifest.js`

- 2.1 (parse `runtime_capabilities:`): RED tests for present-block, absent-field (all-false),
  and reordered/whitespace-tolerant parsing; GREEN via `^\s*(execute|mcp|write):\s*(true|false)\s*$`
  line reader over `getField(frontmatter, "runtime_capabilities").rawLines`.
- 2.2 (canonical 14-skill membership): asserted `PHASE_SKILLS` (literal array, sourced by
  comment-reference from `openspec/specs/skills/spec.md` §1.1) excludes `sdd-document` and
  `sdd-reconcile`.
- 2.3 (direction a): RED/GREEN/TRIANGULATE fixtures for orphan `execute`, orphan `write`, and
  both-orphaned-at-once (2 offenders, not 1 combined) — used tmp-dir fixtures via
  `fs.mkdtempSync` + a `ctx.phaseSkills` override so the synthetic `sdd-fake` skill is treated
  as phase-tier without touching the real `PHASE_SKILLS` constant.
- 2.4 (direction b): RED/GREEN/TRIANGULATE fixtures for one unjustified tool and two unjustified
  tools (execute + edit) in the same run — implemented as phase-tier-only via the `isPhaseSkill`
  gate in `check(ctx)`.
- 2.5 (utility/stack tier): RED fixtures proving (a) a manifest-less utility skill emits nothing,
  and (b) a utility skill consumed by two differently-provisioned agents gets direction-(a)
  evaluated once per consumer and direction-(b) never fires for either. Consumer discovery for
  non-phase-tier skills uses the `skills/{name}/SKILL.md`-reference-in-agent-body convention
  (`findConsumingAgents`), which is a real repo-applicable mechanism, not just fixture plumbing.
- 2.6 (mutation-verified round-trip): reused the 2.3 orphan-`execute` fixture, asserted 1
  offender, applied the fix in the same test (flip `execute: true` → `false`), reasserted `[]`.
- Result: `node --test scripts/lib/contract-checkers/i1-manifest.test.js` — 15/15 passing
  (includes the 3.2 real-repo integration proof).

### Phase 3 — Retrofit + integration proof

- 3.1: applied the calibrated block to all 14 files per the table above; verified via `git
  status`/`git diff` that each file gained exactly the 4-line block (`runtime_capabilities:` +
  3 sub-keys) with no other content touched, and that `capabilities:` was not added/touched.
- 3.2: added an integration test to `i1-manifest.test.js` —
  `check({root: ROOT})` against the real `skills/`/`agents/` trees — asserting `[]`. Passed on
  first run after the 14 retrofits (calibration table in `design.md` matched the real `tools:`
  grants exactly; confirmed via a standalone `node -e` probe before adding the permanent test).

### Phase 4 — `scripts/lib/contract-checkers/j1-commands-agents.js`

- RED: `j1-commands-agents.test.js` calling the not-yet-existing `check(ctx)`/`checkDetailed(ctx)`
  exports against the real repo, plus 3 synthetic-offender fixtures (mismatch, rel-1, rel-2) built
  on tmp-dir fixture roots (own `openspec/specs/agents/spec.md`, `commands/`, `agents/`).
- GREEN: created `j1-commands-agents.js` by moving `parseCommandRoster`, the cross-check loop,
  and the rel-1/rel-2 guards from `commands-agents-contract.test.js` verbatim into `checkDetailed`
  (returns `{offenders, checked, missingFromRoster, arrowRowCount}`), with `check(ctx)` as a thin
  `checkDetailed(ctx).offenders` wrapper for uniform aggregator consumption.
- REFACTOR: none — diff against the legacy test's body shows moved code (same regexes, same guard
  comments), not reimplemented logic.
- Adapted `scripts/commands-agents-contract.test.js` to require the extracted checker; kept the
  `sdd-document.prompt.md` anchor assert via `checkDetailed()`'s `checked[]`. The rel-1
  "deleted roster row still fails" check was promoted into `j1-commands-agents.test.js`'s
  dedicated fixture test rather than a manual one-off, per the task's stated alternative.
- Result: `node --test scripts/lib/contract-checkers/j1-commands-agents.test.js` — 5/5 passing;
  `node --test scripts/commands-agents-contract.test.js` — 2/2 passing.

### Phase 5 — `scripts/lib/contract-checkers/i3-budget-constant.js`

- RED: `i3-budget-constant.test.js` — happy path against real `hooks/hooks.json` +
  `scripts/lib/ospec-state.js`; 2 synthetic-offender fixtures (ceiling breach at `timeoutSec: 2`
  vs `staleMs: 5000`; floor breach at `staleMs: 100` vs `retryAttempts*retryDelayMs = 1500`) using
  a tmp-dir fixture root with its own `hooks/hooks.json` and a fixture `scripts/lib/ospec-state.js`
  module (required by absolute path); 2 direct unit tests on `checkBudgetRelationship`.
- GREEN: extracted `checkBudgetRelationship({declaredCeilingMs, runtimeValueMs, floorMs, ...})` as
  the single generalized "declared value in / runtime constant in / relationship assertion in"
  helper (per design.md's explicit anti-overengineering guidance — reused once, no registry), and
  `check(ctx)` wiring the SessionStart-timeout/LOCK_STALE_MS reference pair.
- Adapted `scripts/lib/ospec-state.test.js`'s ~928-957 test to call
  `require("./contract-checkers/i3-budget-constant.js").check({root: REPO_ROOT})`, preserving the
  exact `<=` ceiling and `>=` floor semantics (verified: no operator was loosened — the extracted
  helper uses the identical `<=`/`>=` comparisons as the original inline asserts).
- Confirmed `internal/store/lock_coherence_test.go` (the Go mirror) was NOT touched —
  `git status internal/` shows no changes; this checker extraction is JS-side only, per
  REQ-contract-lint-004's stated scope.
- Result: `node --test scripts/lib/contract-checkers/i3-budget-constant.test.js` — 5/5 passing;
  `node --test scripts/lib/ospec-state.test.js` — 53/53 passing (full file, not just the I3 test).

### Phase 6 — Wire the registry and final harness

- `contract-lint.js`'s default registry (`[checkI1Manifest, checkCommandsAgents,
  checkBudgetConstant]`) confirmed working end-to-end once Phase 4/5 modules existed: a
  standalone `node -e` probe against the real repo returned `[]`.
- RED→GREEN: wrote `scripts/contract-lint.test.js` — real-registry-against-real-repo assertion
  (`[]`), plus the "one checker fails, others still run" case using two injected fake checkers
  (no real-repo mutation).
- Task 6.3 (invocation-surface confirmation, no new pathway): ran
  `node --test "scripts/**/*.test.js"` (node's own glob, matching `check.js`'s literal argument)
  — 1070/1070 passing, including 20 contract-lint-related tests, confirming the new harness is
  picked up with zero edits to `check.js`. Ran `node --test
  scripts/contract-lint.test.js` standalone — 2/2 passing on its own, independent of the full
  suite. Ran the full `node scripts/check.js` (native tests + all 4 target
  generate/validate steps) — passed clean ("0 errors, 0 warnings. All checks passed.") on the
  confirming rerun (see Discoveries #3 for a one-off flaky failure observed on the first run,
  unrelated to this change).

### Phase 7 — J2 `static-lint` evidence level

- Inserted `static-lint` into `skills/sdd-verify/SKILL.md`'s Evidence Levels list (between
  `static-proof` and `inspection-proof`) with the REQ-skills-002 definition, plus a compliance-rule
  sentence distinguishing behavior-describing MUST scenarios (NOT satisfied by `static-lint`
  alone) from structural/declarative MUST scenarios (satisfied by `static-lint`).
- Added the same `static-lint` entry (consistent wording) to
  `skills/sdd-verify/references/report-format.md`'s Evidence Levels list.
- 7.3 (inspection-only validation): confirmed by inspection — the adapted commands↔agents test
  (`scripts/commands-agents-contract.test.js`, now calling `j1-commands-agents.check`) and the
  adapted hooks-budget↔lock-constant test (`scripts/lib/ospec-state.test.js`, now calling
  `i3-budget-constant.check`) are grep/parse-based, no-LLM, no-runtime-execution checks — exactly
  the profile the updated taxonomy classifies as `static-lint`. No code change was needed beyond
  7.1/7.2 (this is a documentation-consistency check, per design.md's Testing Strategy).

### Phase 8 — Apply the `skills` spec delta

- Applied REQ-skills-001 (Skill Runtime Capability Manifest) as new `openspec/specs/skills/
  spec.md` §2.6, placed immediately after §2.5 (`capabilities:` — the existing frontmatter-
  contract section), preserving the full requirement text and its 4 scenarios verbatim from the
  change's delta spec.
- Applied REQ-skills-002 (`static-lint` Evidence Level) as new §17a, placed just before §18
  Cross-References (the living spec has no existing `sdd-verify`-integration-points section to
  fold it into — §18 boundary was the closest natural anchor per design.md's fallback
  instruction "otherwise as a new top-level requirement section").
- Appended the `### Session 2026-07-07` Clarifications entry (verbatim from the delta spec) after
  the existing `### Session 2026-06-20` entry in the living spec's Clarifications section.
- Flag for `sdd-archive` (per the task's explicit note, not performed here): at archive time,
  confirm the archive's usual "apply delta to living spec" step recognizes `openspec/specs/
  skills/spec.md` as already-updated for this change (REQ-skills-001/002 present with matching
  text) and skips re-applying it, rather than duplicating the sections.

## Discoveries / Decisions worth flagging

1. **Consumer discovery for non-phase-tier skills (direction a)**: `design.md`/`tasks.md` do not
   specify how the checker should discover which agent(s) consume a utility/stack-tier skill
   (there is no `skills:` frontmatter field on `*.agent.md` files). I implemented this via a
   grep-style scan of each `agents/*.agent.md` body for the literal string
   `skills/{skillName}/SKILL.md` — the exact convention every agent file already uses in its
   "Required skill" section (confirmed on `review-readability.agent.md` and others). This is a
   real, generalizable static contract, not a fixture-only stub — it will find genuine matches in
   the real repo tree if/when a non-phase skill later adds `runtime_capabilities:`. This is an
   implementation decision, not a deviation from any explicit design constraint (design.md is
   silent on the mechanism).
2. **`REQ-skills-002` placement**: design.md/tasks.md offered two placement options ("alongside
   wherever the living spec documents `sdd-verify` integration points, if any exist there
   already — otherwise as a new top-level requirement section"). The living `skills` domain spec
   has no dedicated `sdd-verify`-integration section, so I used the fallback: a new top-level
   section (§17a), placed adjacent to §18 Cross-References since that is the spec's natural
   "wrap-up cross-cutting concerns" zone. Flagging as a placement judgment call, not a design
   deviation.
3. **One-off flaky test observed, not a regression**: the first full `node scripts/check.js` run
   showed one failure — `appendRuntimeEvent serializes concurrent writers without corrupting
   lines` in `scripts/lib/ospec-state.test.js` — with a Windows-specific `EPERM` error acquiring
   a `.lock` file in a temp directory under concurrent load. This test is unrelated to the I3
   extraction (a different test in the same file) and is not touched by this change beyond the
   adjacent I3 test replacement. Re-ran `node --test scripts/lib/ospec-state.test.js` in isolation
   (53/53 passing) and the full `node scripts/check.js` again (clean pass) to confirm this is
   Windows filesystem-lock timing flakiness, not something introduced by this change.
4. No contradictions found between `tasks.md`/`design.md` and the real repo state across all 8
   phases. The design's calibration table (6 agents with `execute`, all 14 with `edit`) matched
   the real `agents/*.agent.md` `tools:` grants exactly on the first integration-proof run — no
   iteration needed. `status: blocked` with `blocker_type: design-mismatch` was never triggered.

## Final verification

- `node --test "scripts/**/*.test.js"` — 1070/1070 passing (includes all new/adapted
  contract-lint tests).
- `node scripts/check.js` — clean pass on the confirming run ("0 errors, 0 warnings. All checks
  passed."), covering native tests plus claude/vscode/github-copilot/opencode
  generate(+validate) targets.
- `openspec/changes/unified-contract-lint/tasks.md` — all 8 phases' checkboxes marked complete.
