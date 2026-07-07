# Verification Report

**Change**: unified-contract-lint
**Version**: skills spec (REQ-skills-001/002), contract-lint spec (REQ-contract-lint-001..007)
**Mode**: Strict TDD

> **STATUS: PASS.** Substantive verification complete (1070/1070 tests, 20/20
> scenarios, zero CRITICAL, zero WARNING). The Step 2a assumption-reconciliation
> gate is now CLOSED: both `state.yaml` assumptions were **confirmed** by the
> user via AskUserQuestion (`sdd-design-001` and `sdd-design-002` → `confirm`,
> persisted as `approval-002`). No candidate WARNING was left unresolved, so the
> reversibility=low entry raises none.

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 58 (8 phases) |
| Tasks complete | 58 |
| Tasks incomplete | 0 |

### Build & Tests Execution

**Tests**: ✅ 1070 passed / 0 failed / 0 skipped

```text
node --test "scripts/**/*.test.js"
ℹ tests 1070
ℹ pass 1070
ℹ fail 0
duration_ms ~12449
```

Verified independently by this phase (not relying on apply's reported count): the
number matches apply-progress's 1070/1070 exactly.

**Manual verification**: performed — inspected real git diffs of both legacy
tests, the living spec, and the retrofit frontmatter placement; confirmed the Go
mirror `internal/store/lock_coherence_test.go` is untouched via `git status internal/`
(zero changes).

**Coverage**: ➖ Not available (no coverage tool configured for `node --test`).

### Spec Compliance Matrix
| Requirement | Scenario | Evidence Level | Source | Result | Notes |
|-------------|----------|----------------|--------|--------|-------|
| REQ-skills-001 | Skill declares execute without agent backing | `runtime-test` | `i1-manifest.test.js > direction (a) execute` | PASS | Executes checker, asserts exactly 1 offender + message |
| REQ-skills-001 | Phase agent holds tool its skill never justifies | `runtime-test` | `i1-manifest.test.js > direction (b) edit` | PASS | 1 offender naming agent + `'edit'` |
| REQ-skills-001 | Utility skill multi-agent — direction (b) skipped | `runtime-test` | `i1-manifest.test.js > utility loaded by two agents` | PASS | dir(a) per consumer, dir(b) never fires |
| REQ-skills-001 | Missing manifest treated as all-false | `runtime-test` | `i1-manifest.test.js > parse absent = all-false` | PASS | |
| REQ-skills-002 | static-lint level in taxonomy (structural MUST) | `static-lint` | `sdd-verify/SKILL.md:45`, `references/report-format.md:7` | PASS | Structural/declarative MUST — static-lint acceptable per new rule; both files consistent, ranked between static-proof & inspection-proof |
| REQ-skills-002 | static-lint rejected for behavior-describing MUST | `inspection-proof` | `sdd-verify/SKILL.md:52` compliance rule | PASS | Prose rule present and correct |
| REQ-skills-002 | static-lint accepted for structural MUST | `inspection-proof` | `sdd-verify/SKILL.md:52` | PASS | |
| REQ-contract-lint-001 | All checkers pass | `runtime-test` | `contract-lint.test.js`, `contract-lint.test.js (lib)` | PASS | |
| REQ-contract-lint-001 | One checker fails — others still run | `runtime-test` | `lib/contract-lint.test.js > no short-circuit` + harness | PASS | flatMap, call-order asserted, throw-propagates asserted |
| REQ-contract-lint-002 | Orphan execute caught (mutation-verified) | `runtime-test` | `i1-manifest.test.js > mutation-verified round-trip` | PASS | 1 offender → fix → [] round-trip |
| REQ-contract-lint-002 | Utility mismatch not double-counted | `runtime-test` | `i1-manifest.test.js > utility two agents` | PASS | |
| REQ-contract-lint-002 | Utility/stack no-manifest passes | `runtime-test` | `i1-manifest.test.js > no-block utility` | PASS | absence ≠ offender |
| REQ-contract-lint-003 | Existing guard behavior preserved | `runtime-test` | `j1-commands-agents.test.js > rel-1/rel-2 fixtures` | PASS | rel-1 hard offender, rel-2 arrow guard |
| REQ-contract-lint-003 | No duplicated re-implementation | `inspection-proof` | `git diff` shows moved code (identical regex, guards, comments) | PASS | parseCommandRoster moved verbatim into checker |
| REQ-contract-lint-004 | Existing lock/hook guard preserved | `runtime-test` | `i3-budget-constant.test.js` + `ospec-state.test.js` | PASS | ceiling `<=` / floor `>=` unchanged |
| REQ-contract-lint-004 | New budget pair reuses shape | `inspection-proof` | `i3-budget-constant.js > checkBudgetRelationship` | PASS | single parameterized helper, no registry |
| REQ-contract-lint-005 | Standalone invocation | `static-proof` | `node --test scripts/contract-lint.test.js` | PASS | runs on its own |
| REQ-contract-lint-005 | Pre-commit/CI surface unchanged | `static-lint` | `git status` — `check.js`/`hooks.json`/`.github/workflows` unchanged | PASS | glob picks up new harness, zero new pathway |
| REQ-contract-lint-006 | Failure output self-sufficient | `runtime-test` | offender `.message`/`.expected`/`.actual` asserted in i1/j1/i3 tests + harness formatter | PASS | |
| REQ-contract-lint-007 | Passing lint ≠ closing behavior MUST | `inspection-proof` | `sdd-verify/SKILL.md:52`, spec REQ-skills-002 | PASS | taxonomy prose enforces it |

**Compliance summary**: 20/20 scenarios satisfied at acceptable evidence levels. 0 CRITICAL, 0 WARNING (spec).

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| I1 checker (new logic) | ✅ Implemented | dir(a)/dir(b) separated, phase-tier gate, all-false fallback, real-repo 0 offenders |
| J1 extraction | ✅ Implemented | verbatim move; `check`+`checkDetailed`; legacy test adapted, anchor preserved |
| I3 extraction | ✅ Implemented | generalized helper; ceiling/floor operators preserved; Go mirror untouched |
| Aggregator | ✅ Implemented | `runAllCheckers` flatMap, no short-circuit, throw-propagates |
| Retrofit 14 SKILL.md | ✅ Implemented | 4-line block, top-level sibling after `metadata:`, `capabilities:` untouched |
| static-lint taxonomy (J2) | ✅ Implemented | SKILL.md + report-format.md consistent |
| Living spec delta (task 8) | ✅ Applied | REQ-skills-001 §2.6, REQ-skills-002 §17a, clarifications appended — matches change delta verbatim |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| ADR-001 pure lib + node:test harness, no new pathway | ✅ Yes | glob picks up harness |
| ADR-002 nested block map in frontmatter | ✅ Yes | parsed via rawLines line reader |
| ADR-003 unified registry, J1/I3 by extraction not reimplementation | ✅ Yes | diff confirms moved code |

### Issues Found
**CRITICAL**: None
**WARNING**: None. (The only candidate — `sdd-design-001`, reversibility=low — was confirmed by the user at the assumption gate, so no WARNING is raised.)
**SUGGESTION**:
- (design-gap, minor) `i1-manifest.js#findConsumingAgents` (utility-tier direction-a consumer discovery) is coupled to a prose convention (`skills/{name}/SKILL.md` string in agent bodies), not a structured frontmatter field — as apply flagged (Discovery #1). No current offenders since no utility skill declares `runtime_capabilities:` yet; noting for future robustness.

### Traceability Matrix
| REQ | Tasks | Tests | Status |
|-----|-------|-------|--------|
| REQ-skills-001 | 2.1-2.6, 3.1-3.2, 8.1 | `i1-manifest.test.js` (15) | OK |
| REQ-skills-002 | 7.1, 7.2, 7.3, 8.1 | inspection (prose taxonomy) | OK — structural, static-lint/inspection |
| REQ-contract-lint-001 | 1.1, 6.1, 6.2 | `contract-lint.test.js` (lib + harness) | OK |
| REQ-contract-lint-002 | 2.1-2.6, 3.2 | `i1-manifest.test.js` | OK |
| REQ-contract-lint-003 | 4.1, 4.2 | `j1-commands-agents.test.js`, `commands-agents-contract.test.js` | OK |
| REQ-contract-lint-004 | 5.1, 5.2 | `i3-budget-constant.test.js`, `ospec-state.test.js` | OK |
| REQ-contract-lint-005 | 6.3 | standalone + full-suite run | OK |
| REQ-contract-lint-006 | 5.1, 6.2 | offender-message asserts | OK |
| REQ-contract-lint-007 | 7.3 | inspection | OK |

### TDD Compliance
| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | Found in apply-progress (8-phase table) |
| All tasks have tests | ✅ | Every coding task maps to a test file; Phase 3/7/8 are retrofit/docs (N/A runtime) |
| RED confirmed (tests exist) | ✅ | All 6 new test files present on disk |
| GREEN confirmed (tests pass) | ✅ | 1070/1070 on independent execution |
| Triangulation adequate | ✅ | Multiple varied cases per behavior (e.g. i1 dir-a 1/2 offenders, i3 ceiling/floor/both) |
| Safety Net for modified files | ✅ | `ospec-state.test.js` (53/53), `commands-agents-contract.test.js` (2/2) pass post-modification |

**TDD Compliance**: 6/6 checks passed

### Test Layer Distribution
| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit | ~26 (change-specific) | 6 | node:test |
| Integration | included (real-repo checks) | 3 | node:test |
| E2E | 0 | 0 | not installed |
| **Total (change)** | **~26 new/adapted** | **6+2 adapted** | |

Full-suite total: 1070 tests.

### Assertion Quality
Audited all 6 change test files (`contract-lint.test.js` lib+harness, `i1-manifest.test.js`,
`j1-commands-agents.test.js`, `i3-budget-constant.test.js`) plus the 2 adapted legacy tests.

- No tautologies (`assert(true)` / `1===1`).
- No zero-assertion tests; no tests that skip the production call.
- No ghost loops — `offenders.some(...)` runs on checkers deliberately fed offender-producing fixtures.
- Every empty-array assertion (`deepEqual(check(...), [])`) has companion non-empty offender tests.
- Every offender assertion checks BOTH count (`length === N`) AND content (`match` on message/path/expected/actual) — no type-only-alone assertions.
- Spies in `contract-lint.test.js` are minimal call-order trackers (legitimate for the no-short-circuit contract), not mock-heavy.
- Well-triangulated: expected values vary (1 vs 2 offenders, ceiling `2000` vs floor `1500`, execute vs write).

**Assertion quality**: ✅ All assertions verify real behavior — 0 CRITICAL, 0 WARNING.

### Quality Metrics
**Linter**: ➖ Not run per-file (no configured linter surfaced for changed JS).
**Type Checker**: ➖ Not available (plain JS + JSDoc).

### Assumption Reconciliation
Step 2a pre-flight found unresolved `state.yaml` assumptions; the user resolved both via
AskUserQuestion (`assumption_resolutions`, persisted as `approval-002`). Gate CLOSED.

| id | statement | reversibility | outcome |
|----|-----------|----------------|---------|
| sdd-propose-001 | I1 at skill level / J2 at agents domain | high | corrected (resolved by sdd-spec) — no action |
| sdd-design-001 | `runtime_capabilities:` nested YAML block map in frontmatter, parsed via rawLines | low | **confirmed** (user, AskUserQuestion) — no WARNING raised |
| sdd-design-002 | phase-skill set (direction b) derived from §1.1 canonical 14 | high | **confirmed** (user, AskUserQuestion) |

### Verdict
**PASS.** All 58 tasks complete; 1070/1070 tests pass on independent execution; 20/20 spec
scenarios satisfied at acceptable evidence levels; 0 CRITICAL, 0 WARNING; TDD compliance 6/6;
assertion quality clean. Both assumptions confirmed at the Step 2a gate — no residual WARNING.

---

## Re-Verification (post-4R remediation batch)

**Date**: 2026-07-07 · **Trigger**: 4R review gate found 1 CRITICAL + 3 WARNING (all in
`review-reliability`; risk/readability/resilience clean). User approved an in-change remediation
batch (`approval-003`). This section re-verifies that batch; the prior PASS above stands and is
extended, not replaced.

**Step 2a (assumption reconciliation)**: no-op. All `state.yaml` `assumptions:` entries are
already resolved (`sdd-propose-001` corrected, `sdd-design-001` confirmed, `sdd-design-002`
confirmed). No unresolved `reversibility: low` entry remains → no WARNING candidate.

**Step 9a (quality gates)**: no-op. `quality_gates:` in `openspec/config.yaml` is commented out
(policy absent) → no gate audit written, baseline verify behavior unchanged.

### 4R findings → fix verification

| # | Finding (review-reliability) | Fix location | Resolves? | Evidence |
|---|------------------------------|--------------|-----------|----------|
| CRITICAL (rel-001) | Phase skill whose 1:1-bound agent file is missing silently returned `[]` (false negative on the exact drift I1 exists to catch) | `i1-manifest.js:187-201` — emits explicit offender + `continue` | **Yes** | `runtime-test`: `i1-manifest.test.js:247` (missing bound agent → 1 offender, message `/no bound agent file/` + `/agents...sdd-fake.agent.md/`); `:262` (sibling not suppressed → 2 offenders) |
| WARNING (rel-002) | `agentsSpecPath` read with no guard (would throw ENOENT instead of an offender) | `j1-commands-agents.js:80-97` — try/catch mirrors the `commandsDir` graceful pattern | **Yes** | `runtime-test`: `j1-commands-agents.test.js:131` (missing spec → 1 offender `/could not be read/`); `:144` (spec.md as a directory → EISDIR path, proves the catch is generic, not ENOENT-specific) |
| WARNING (rel-003) | 2 offender branches (`agent:` field absent; router agent file missing) had no dedicated test | 2 coverage tests; **no code change** (logic was already correct) | **Yes** | `runtime-test`: `j1-commands-agents.test.js:159` (absent `agent:` → offender); `:199` (missing router agent file → offender) |
| WARNING (rel-004) | `require(ospecStatePath)` unguarded (would throw MODULE_NOT_FOUND) | `i3-budget-constant.js:114-127` — try/catch mirrors the `hooks.json` graceful pattern | **Yes** | `runtime-test`: `i3-budget-constant.test.js:80` (missing module → 1 offender `/could not be (required\|loaded)/`); `:101` (corrupt module → 1 offender, proves SyntaxError caught too) |

### Remediation test assertion quality

All 8 new remediation tests (i1 +2, j1 +4, i3 +2) carry real assertions — count AND content:
- Every test asserts `offenders.length` (or `.some(...)` for the multi-offender sibling/coverage
  cases) plus a `.match()` on `message`/`expected`/`actual`. No `assert(true)`, no zero-assertion
  or production-call-skipping tests, no tautologies.
- Triangulation is genuine, not duplicated: rel-002 pairs ENOENT (missing file) with EISDIR
  (file is a directory) to prove the catch is error-agnostic; rel-004 pairs MODULE_NOT_FOUND with
  SyntaxError (corrupt module) for the same reason. The CRITICAL sibling test proves the new
  `continue` does not suppress checks for a co-located phase skill (2 distinct offenders asserted).

### Legacy-guard non-regression (task item 4)

Confirmed by inspection that the remediation did NOT loosen any guard the extraction preserves:
- **rel-1** (`j1-commands-agents.js:130`): command with no roster row → hard offender. Still
  present; `j1-commands-agents.test.js:89` green. The new spec-read try/catch returns *before*
  `parseCommandRoster`, so it never bypasses rel-1/rel-2 on a real repo.
- **rel-2** (`j1-commands-agents.js:207`): zero arrow rows → offender. Still present;
  `:241` green.
- **ceiling** (`i3-budget-constant.js:45`): `runtimeValueMs <= declaredCeilingMs` — operator
  unchanged. The new `require` try/catch returns before `checkBudgetRelationship`, never
  loosening the comparison.
- **floor** (`i3-budget-constant.js:55`): `runtimeValueMs >= floorMs` — operator unchanged.

### Independent execution (not trusting apply's count)

- `node --test scripts/lib/contract-checkers/{i1,j1,i3}*.test.js` — **33/33** passing (this phase
  ran it; includes all 8 remediation tests).
- `node --test "scripts/**/*.test.js"` — **1078/1078** passing, 0 fail (this phase ran the full
  suite; matches apply's reported 1078, +8 over the prior 1070 from the remediation tests).
- Real-repo integration proofs still green: `i1-manifest.test.js:291` (0 offenders vs real
  skills/agents trees — so all 14 phase skills DO have their bound agent, the new CRITICAL guard
  fires only on genuine drift), `j1`/`i3` real-repo `[]` assertions.

### Issues Found (re-verify)

**CRITICAL**: None. **WARNING**: None.
**SUGGESTION**:
- (docs-gap, cosmetic) `apply-progress.md` "Final verification" line reports "the 6 new
  remediation tests", but the TDD table lists — and disk confirms — **8** new tests
  (i1 15→17, j1 5→9, i3 5→7). Count mismatch only; every listed test exists and passes. Prior
  `findConsumingAgents` prose-coupling SUGGESTION from the first pass still stands, unaffected.

### Re-Verification Verdict
**PASS.** All 4 findings from the 4R `review-reliability` report (1 CRITICAL, 3 WARNING) are
resolved with dedicated, real-assertion regression tests. Legacy guards (rel-1/rel-2,
ceiling/floor) preserved — none reintroduced or loosened. Full suite 1078/1078 on independent
execution; 0 CRITICAL, 0 WARNING. The change is verified and ready for archive.
