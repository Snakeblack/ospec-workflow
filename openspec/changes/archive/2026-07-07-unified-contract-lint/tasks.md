# Tasks: unified-contract-lint

## Review Workload Forecast

```text
Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High
```

- Estimated changed lines: ~660-700 (new: ~410 across `contract-lint.js` + 3 checkers +
  harness test; modified: ~250 across the two legacy test adaptations, 14 `SKILL.md`
  retrofits, the `skills` spec.md apply, and the two `sdd-verify` doc edits).
- Delivery strategy: **size-exception**, pre-approved by the user for this change — do not
  gate `sdd-apply` on a re-confirmation; the phase count and per-phase self-containment
  below are the mitigation instead of a PR chain. Each phase in this file is independently
  compilable/testable (its own RED→GREEN cycle) so a reviewer can review commit-by-commit
  even though it lands as a single PR.
- Suggested split (informational, not a hard requirement given the exception): if a
  reviewer later wants to split, the natural boundary is Phase 2 (I1, genuinely new logic)
  vs. Phases 3-4 (J1/I3, extraction-only) vs. Phase 6 (docs/spec, zero runtime risk).
- Work units: 8 phases, each completable within one session; commit per phase (or per
  task group inside Phase 2, which is the largest).

## Resolved open question (do not reopen)

`design.md`'s "Open Questions" asked whether `scripts/check.js` needs a new explicit
standalone CLI step in addition to the `node:test` harness. **Resolved: no new CLI.**
`scripts/check.js` already runs `node --test scripts/**/*.test.js`, which recursively
picks up the new `scripts/contract-lint.test.js` without any edit to `check.js`,
`hooks/hooks.json`, or CI workflow files (matches ADR-001 and REQ-contract-lint-005's
"no new invocation pathway"). "Standalone" (REQ-contract-lint-005's first scenario) is
satisfied by `node --test scripts/contract-lint.test.js` directly — no bespoke CLI wrapper
is created. Task 6.3 below only *verifies* this via `node scripts/check.js`; it does not
modify `check.js`. This resolution is final for this change.

---

## Phase 1 — Registry core: `scripts/lib/contract-lint.js`

### 1.1 Aggregator runs all registered checkers without short-circuiting (REQ-contract-lint-001)

- [x] RED: write `scripts/lib/contract-lint.test.js` (unit-level, not the final harness) with
  two fake checkers injected into a test-only registry — one returns offenders, one returns
  `[]` — and assert `runAllCheckers` calls both (e.g. via call-count spies) and returns the
  concatenation of both results. Also assert the "all pass" case returns `[]`.
- [x] GREEN: implement `scripts/lib/contract-lint.js` exporting `runAllCheckers(ctx, registry)`
  (registry parameter defaults to the real `[checkI1Manifest, checkCommandsAgents,
  checkBudgetConstant]` array, but accepts an override for this unit test) using
  `registry.flatMap((c) => c(ctx))` — no `some`/`every`/early `return` on failure.
- [x] TRIANGULATE: add a third fake checker that throws; assert the aggregator either lets it
  propagate (documented behavior: a checker bug is a hard test failure, not a silently
  swallowed offender) — pick one behavior and assert it explicitly so it can't regress.
- [x] REFACTOR: extract the offender shape `{checker, path, expected, actual, message}` as a
  documented JSDoc typedef at the top of `contract-lint.js`; no behavior change.

---

## Phase 2 — I1 checker (new): `scripts/lib/contract-checkers/i1-manifest.js`

This is the only genuinely new checking logic in the change (per design.md); the other two
checkers are extractions. Build it test-first against tmp fixtures, not the real repo tree,
so Phase 2 is fully self-contained before Phase 5 wires it against real `skills/`/`agents/`.

### 2.1 Parse `runtime_capabilities:` block map from frontmatter `rawLines`

- [x] RED: `scripts/lib/contract-checkers/i1-manifest.test.js` — given a frontmatter field
  object shaped like what `frontmatter.js#parse` returns for a `runtime_capabilities:` block
  (key `"runtime_capabilities"`, `rawLines` = `["runtime_capabilities:", "  execute: true",
  "  mcp: false", "  write: true"]`), assert the reader returns `{execute:true, mcp:false,
  write:true}`.
- [x] RED (same file): given no `runtime_capabilities` field present, assert the reader
  returns `{execute:false, mcp:false, write:false}` (missing-manifest-is-all-false, per
  REQ-skills-001 scenario "Missing manifest treated as all-false").
- [x] GREEN: implement `parseRuntimeCapabilities(frontmatter)` using the
  `^\s+(execute|mcp|write):\s*(true|false)` line reader specified by ADR-002/design.md,
  applied to the `rawLines` of the `runtime_capabilities` field found via
  `frontmatter.js#getField`.
- [x] TRIANGULATE: add a case with the three keys in a different order and with extra
  unrelated indentation/whitespace; assert it still parses correctly.
- [x] REFACTOR: no changes expected beyond naming/comments.

### 2.2 Canonical 14-skill membership (derive from spec authority, not a prefix heuristic)

- [x] RED: assert a hardcoded/derived list of the 14 canonical names (`sdd-apply,
  sdd-archive, sdd-baseline, sdd-clarify, sdd-design, sdd-explore, sdd-foundation,
  sdd-init, sdd-onboard, sdd-propose, sdd-spec, sdd-tasks, sdd-verify, sdd-workspace`)
  excludes `sdd-document` and `sdd-reconcile` even though both are `sdd-`-prefixed and
  both bind to agents with `execute` in `tools:` (per design.md's explicit callout that
  membership is NOT a prefix heuristic).
- [x] GREEN: implement the canonical set as a literal exported array
  `PHASE_SKILLS` in `i1-manifest.js`, sourced by name from `openspec/specs/skills/spec.md`
  §1.1 (copy the literal list; do not regex-parse the spec file for this — the spec is the
  authority for the *value*, not a runtime input to parse).
- [x] REFACTOR: add a code comment pointing at `openspec/specs/skills/spec.md` §1.1 so a
  future canonical-set change updates both places together.

### 2.3 Direction (a): declared `true` capability must be backed by the agent's `tools:` grant

- [x] RED: fixture — phase skill `sdd-fake` declares `runtime_capabilities: {execute: true}`;
  bound agent `agents/sdd-fake.agent.md` has `tools: ['read','search','edit']` (no
  `execute`). Assert the checker returns exactly one offender naming the skill path, the
  agent path, and the missing tool (`execute`).
- [x] RED: same fixture but `write: true` with `tools:` lacking `edit` → one offender for
  `write`→`edit`.
- [x] GREEN: implement direction (a): for every phase skill in `PHASE_SKILLS`, read its
  `runtime_capabilities`, map `execute→execute`, `write→edit` (per design.md's
  "Manifiesto I1" mapping table; `mcp` has no direction-(a) tool counterpart today and is
  a no-op check), and read the bound agent's `tools:` array via `frontmatter.js`; emit an
  offender per unbacked `true` capability.
- [x] TRIANGULATE: fixture where both `execute` and `write` are declared `true` and both are
  missing from `tools:` → exactly two offenders in one run (not a single combined one).
- [x] REFACTOR: factor the per-capability-to-tool map into a small constant
  `CAPABILITY_TO_TOOL = {execute: "execute", write: "edit"}` reused by both directions.

### 2.4 Direction (b): every `execute`/`edit` tool the agent grants must be justified by `true`

- [x] RED: fixture — agent `tools:` includes `edit` but bound phase skill declares
  `runtime_capabilities: {write: false}` (or omits the manifest entirely) → one offender
  naming the agent path and the unjustified tool (`edit`).
- [x] GREEN: implement direction (b), phase-skill-tier only (per REQ-skills-001: utility/
  stack tiers skip direction b entirely — do not call this path for skills outside
  `PHASE_SKILLS`).
- [x] TRIANGULATE: fixture where the agent has BOTH `execute` and `edit` unjustified → two
  offenders, not one.
- [x] REFACTOR: none expected; keep direction (a)/(b) as two clearly separated internal
  functions composed by the exported `check(ctx)`.

### 2.5 Utility/stack-tier skills: direction (a)-only, never direction (b), absence never an offender

- [x] RED: fixture — a skill outside `PHASE_SKILLS` (e.g. a synthetic utility skill dir) with
  no `runtime_capabilities:` block at all → checker MUST NOT emit any offender solely for
  the absence (REQ-contract-lint-002 scenario "Utility/stack skill with no manifest passes").
- [x] RED: same tier, but the skill DOES declare `execute: true` with no `execute` tool in
  ONE of two consuming agents → exactly one direction-(a) offender for that agent only, and
  zero direction-(b) offenders for either agent (REQ-skills-001 scenario "Utility skill
  loaded by multiple agents").
- [x] GREEN: implement the tier gate — the checker only evaluates direction (b) when the
  skill is a member of `PHASE_SKILLS`; direction (a) runs unconditionally for skills that
  DO declare a `runtime_capabilities` block, regardless of tier.
- [x] REFACTOR: none expected.

### 2.6 Mutation-verified round-trip (REQ-contract-lint-002 scenario)

- [x] RED: write the round-trip test named in design.md's Testing Strategy — inject the
  orphan-`execute` fixture from 2.3, assert exactly one offender, then apply the fix
  (remove the manifest mismatch — either flip the declaration to `false` or add the tool to
  the agent fixture) in the SAME test and assert the checker now returns `[]` on rerun.
- [x] GREEN: no new production code expected if 2.3/2.4 are correct — this test proves the
  existing implementation is round-trip-safe (not just single-direction-correct).

---

## Phase 3 — Retrofit `runtime_capabilities:` into the 14 SDD-phase `SKILL.md` files

### 3.1 Apply calibrated block map to all 14 skills (per design.md's calibration table)

- [x] Add `runtime_capabilities:\n  execute: true\n  mcp: false\n  write: true` to the
  frontmatter of: `skills/sdd-apply/SKILL.md`, `skills/sdd-baseline/SKILL.md`,
  `skills/sdd-init/SKILL.md`, `skills/sdd-onboard/SKILL.md`, `skills/sdd-verify/SKILL.md`,
  `skills/sdd-workspace/SKILL.md` (the 6 agents whose `tools:` include `execute`).
- [x] Add `runtime_capabilities:\n  execute: false\n  mcp: false\n  write: true` to:
  `skills/sdd-archive/SKILL.md`, `skills/sdd-clarify/SKILL.md`, `skills/sdd-design/SKILL.md`,
  `skills/sdd-explore/SKILL.md`, `skills/sdd-foundation/SKILL.md`,
  `skills/sdd-propose/SKILL.md`, `skills/sdd-spec/SKILL.md`, `skills/sdd-tasks/SKILL.md`
  (the 8 agents without `execute` — all 14 agents carry `edit`, hence `write: true`
  uniformly per design.md's table).
- [x] Place the block immediately after `metadata:` (or wherever `frontmatter.js`'s
  block-map parser cleanly separates it as its own top-level field) — do not nest it
  inside `metadata:`.
- [x] Do NOT touch `capabilities:` (the pre-existing stack-domain field) on any of these
  14 files — REQ-skills-001 explicitly forbids reusing it for this contract.

### 3.2 Integration proof against the real repo tree

- [x] RED (belongs functionally with Phase 5's harness, but write it here since it depends
  on 3.1): a test that runs `i1-manifest.js`'s `check({root: ROOT})` against the real
  `skills/` and `agents/` directories and asserts `[]` (zero offenders) — this is the proof
  that the calibration in 3.1 matches the real `tools:` grants exactly.
- [x] GREEN: this passes once 3.1 is applied correctly; if it fails, the offender messages
  from 2.x's diagnostic format should name the exact skill/agent/tool mismatch to fix.

---

## Phase 4 — J1 extraction: `scripts/lib/contract-checkers/j1-commands-agents.js`

### 4.1 Extract roster-parsing + allowlist-matching into a checker function (REQ-contract-lint-003)

- [x] RED: `j1-commands-agents.test.js` — move the fixture-based assertions from
  `commands-agents-contract.test.js` into a new test that calls the not-yet-existing
  `check(ctx)` export and asserts it returns `[]` offenders against the real repo (mirrors
  the legacy test's happy path).
- [x] RED: add a synthetic-offender case — inject a fake roster/allowlist mismatch (via a
  ctx override or fixture root) and assert one offender is returned, not a thrown
  `assert` error (the checker returns data; only the *test* asserts).
- [x] GREEN: create `j1-commands-agents.js` by **moving** (not rewriting)
  `parseCommandRoster`, the roster/allowlist cross-check loop, and the rel-1/rel-2 guard
  logic from `commands-agents-contract.test.js` into an exported `check(ctx)` that returns
  offenders instead of calling `assert` directly. Preserve the rel-1 guard (missing roster
  row = offender, not skip) and rel-2 guard (zero arrow rows = offender) as offender-shaped
  results.
- [x] REFACTOR: no logic rewrite — this task is an extraction; diff review should show
  moved code, not reimplemented code.

### 4.2 Adapt the legacy test to call the extracted checker (preserve anchored asserts)

- [x] RED→GREEN in one step (this is an adaptation, not new behavior): rewrite
  `scripts/commands-agents-contract.test.js` to `require("./lib/contract-checkers/
  j1-commands-agents.js")` and assert `check({root: ROOT})` returns `[]`, PLUS keep the
  anchored assert that `sdd-document.prompt.md`'s routing was actually exercised (either by
  having `check()` return a `checked[]`/diagnostic list the test can inspect, or by the
  checker exposing a secondary export for this — do not silently drop the "at least
  sdd-document was checked" anchor, since that's the specific regression this test was
  written to catch).
- [x] Confirm rel-1 guard behavior unchanged: temporarily delete a roster row in a copy/mock
  and confirm the adapted test still fails (this can be a one-off manual check during
  review, or promoted into 4.1's synthetic-offender case — do not skip verifying it).

---

## Phase 5 — I3 extraction: `scripts/lib/contract-checkers/i3-budget-constant.js`

### 5.1 Extract lock/hook coherence into a generalized checker (REQ-contract-lint-004)

- [x] RED: `i3-budget-constant.test.js` — assert `check({root: ROOT})` returns `[]` against
  the real `hooks/hooks.json` + `scripts/lib/ospec-state.js` (mirrors the legacy assertion
  at `ospec-state.test.js:932-957`).
- [x] RED: synthetic-offender case — inject a fixture where a mock `LOCK_STALE_MS`-equivalent
  exceeds a mock timeout budget; assert one offender naming the checker, the config path,
  and the expected-vs-actual budget values (satisfies REQ-contract-lint-006's diagnostic
  requirement).
- [x] RED: synthetic-offender case for the floor breach (declared constant below
  `retryAttempts * retryDelay`).
- [x] GREEN: implement `check(ctx)` by extracting the `hooks.json` read + `LOCK_RETRY_ATTEMPTS
  /LOCK_RETRY_DELAY_MS/LOCK_STALE_MS` require + the two threshold assertions from
  `ospec-state.test.js:932-957`, generalized per design.md as "declared value in, runtime
  constant in, relationship assertion in" so a future pair can reuse the same shape — but
  do not over-engineer a plugin registry for hypothetical future pairs; a single
  parameterized internal helper reused once is sufficient for this change.
- [x] REFACTOR: none beyond making the reference SessionStart/LOCK_* pair the sole registered
  instance for now.

### 5.2 Adapt the legacy test to call the extracted checker

- [x] Rewrite `scripts/lib/ospec-state.test.js`'s test at ~928-957 to
  `require("./contract-checkers/i3-budget-constant.js")` and assert `check({root: ROOT})`
  returns `[]`, preserving the exact ceiling (`<=` timeout) and floor (`>=` retry-window)
  semantics — do not loosen either comparison operator during the move.
- [x] Confirm no change is needed to `internal/store/lock_coherence_test.go` — the Go test
  is a separate runtime (Go's own test suite, not `node:test`) and is out of scope for this
  checker extraction; REQ-contract-lint-004's scope is the JS-side checker only. Do not
  touch the Go file.

---

## Phase 6 — Wire the registry and final harness

### 6.1 Register the three real checkers in `contract-lint.js`

- [x] Update the default `registry` array in `scripts/lib/contract-lint.js` (built in Phase 1
  against fake checkers) to `[checkI1Manifest, checkCommandsAgents, checkBudgetConstant]`,
  importing each from its `contract-checkers/*.js` module.

### 6.2 `scripts/contract-lint.test.js` — the arnés wired to pre-commit/CI

- [x] RED: write the harness test asserting `runAllCheckers({root: ROOT})` returns `[]`
  against the real repo (this is the test that actually fails pre-commit/CI on a real
  regression).
- [x] RED: include the "one checker fails, others still run" integration case from
  REQ-contract-lint-001's second scenario, using a temporary/injected bad ctx or a
  registry override — do not mutate real repo files to produce this case; use the same
  fixture technique as Phase 2/4/5's synthetic-offender tests.
- [x] GREEN: implement/finalize `contract-lint.test.js`; on failure, format the offender
  list into the `node:test` failure message including checker name, path, and
  expected-vs-actual (REQ-contract-lint-006) — this can reuse each offender's `message`
  field directly.

### 6.3 Confirm invocation surface — no new pathway

- [x] Run `node scripts/check.js` locally and confirm `contract-lint.test.js` is picked up
  by the existing `node --test scripts/**/*.test.js` glob with zero edits to `check.js`,
  `hooks/hooks.json`, or `.github/workflows/*` (REQ-contract-lint-005). This is an
  inspection/manual-run confirmation, not a new automated test (the aggregation behavior
  is already covered by 6.2).
- [x] Run `node --test scripts/contract-lint.test.js` standalone and confirm it reports
  pass/fail on its own without running the full suite (REQ-contract-lint-005's first
  scenario).

---

## Phase 7 — J2: `static-lint` evidence level (aditivo, no runtime test)

### 7.1 `skills/sdd-verify/SKILL.md`

- [x] Insert `static-lint` between `static-proof` and `inspection-proof` in the Evidence
  Levels list (~line 36-41), with the definition from REQ-skills-002: "a check that
  inspects declared artifacts... via grep/parse/string comparison... as distinct from
  `runtime-test`".
- [x] Add the compliance rule distinguishing behavior-describing MUST scenarios (NOT
  satisfied by `static-lint` alone) from structural/declarative MUST scenarios (satisfied
  by `static-lint`) near the existing MUST/SHOULD compliance rules (~line 46-47, 60-62).

### 7.2 `skills/sdd-verify/references/report-format.md`

- [x] Add `static-lint` to the Evidence Levels list (~line 3-7) with the same short
  definition, consistent wording with 7.1.

### 7.3 Inspection-only validation (per design.md's Testing Strategy — no runtime test for J2)

- [x] Confirm by inspection that the existing commands↔agents test (REQ-agents-007) and the
  hooks-budget↔lock-constant test, now wrapped by the Phase 4/5 checkers, would be
  classified `static-lint` under the updated taxonomy — no code change beyond 7.1/7.2 is
  required to satisfy this; it is a documentation-consistency check.

---

## Phase 8 — Apply the `skills` spec delta to the living spec

### 8.1 `openspec/specs/skills/spec.md`

- [x] Apply the ADDED requirements from `openspec/changes/unified-contract-lint/specs/
  skills/spec.md` (REQ-skills-001 Skill Runtime Capability Manifest, REQ-skills-002
  `static-lint` Evidence Level) into the living spec, placing REQ-skills-001 near existing
  frontmatter-contract requirements and REQ-skills-002 as a standalone cross-cutting
  requirement (or alongside wherever the living spec documents `sdd-verify` integration
  points, if any exist there already — otherwise as a new top-level requirement section).
  Preserve the `### Session 2026-07-07` Clarifications block content in whichever
  clarifications ledger the living spec already uses.
- [x] REMEDIATION-MARKER Note for `sdd-archive` (do not perform here, just flag): this task front-loads the
  spec-delta application per design.md's explicit File Changes table entry; confirm with
  `sdd-archive` at archive time that this does not produce a double-apply (i.e., archive's
  usual "apply delta to living spec" step should recognize this as already-applied and
  skip, not duplicate).
