# Verification Report: recommendation-contract-and-early-ambiguity-detection

**Change**: recommendation-contract-and-early-ambiguity-detection
**Mode**: openspec / standard route
**TDD**: Strict TDD (active — strict-tdd-verify.md loaded)
**Verdict**: PASS WITH WARNINGS

## Executive Summary

Documentation/normative change (prose-only; agents and skills are markdown prompt
sources, not runtime code). All MUST scenarios across the three change-local specs
are backed by runtime-test evidence: the new prose-invariant contract test
(`scripts/recommendation-ambiguity-contract.test.js`, 9 assertions) passes, and the
full targeted suite runs 38/38 green. All 4 dist targets regenerate with 0 errors.
One WARNING: an embedded `question_gate` example `reason` in the orchestrator was
not brought into line with the new Gate-Reason-Cost contract (only its sibling
`description` was). The pre-existing, unrelated `npm test` single-command failure
(hook tests) is confirmed out of scope and is NOT charged against this change.

## Task Completeness

| Phase | Tasks | Status |
|-------|-------|--------|
| 1 RED (contract test first) | 1.1–1.7 | ✅ complete |
| 2 GREEN A2 (recommendation contract) | 2.1–2.4 | ✅ complete |
| 3 GREEN A3 (intent restatement + design-mismatch) | 3.1–3.6 | ✅ complete |
| 4 Sweep (embedded example conformance) | 4.1–4.4 | ✅ complete |
| 5 Regeneration + global verify | 5.1, 5.3 ✅ / 5.2 [~] | partial (5.2 blocked only by pre-existing unrelated failure) |
| 6 Triangulate/refactor | 6.1–6.3 | ✅ complete |

Task 5.2 (`npm test` as a single command) is `[~]` because `node scripts/check.js`
aborts at its first native-test step on 17 pre-existing failures in
`scripts/hooks/session-start.test.js` / `pre-tool-use.test.js`. Independently
confirmed (apply + orchestrator, via git stash) to reproduce identically with none
of this change's edits applied. The change's own deliverables — its contract tests
and the 4-target regeneration — are verified directly (below). Not a defect of this
change.

## Build / Tests / Regeneration Evidence

- `node --test scripts/docs-lint.test.js scripts/recommendation-ambiguity-contract.test.js scripts/assumption-ledger-contract.test.js scripts/federation-baseline-contract.test.js` → **38/38 pass, 0 fail** (runtime-test).
- The 9 new contract assertions (`recommendation-ambiguity-contract.test.js`) all pass.
- `npm run build:claude | build:vscode | build:copilot | build:opencode` → all **OK, 0 errors** (static-proof).

## Spec Compliance Matrix

### recommendation-contract/spec.md

| Requirement / Scenario | Strength | Evidence | Level | Status |
|---|---|---|---|---|
| Recommended Option Description Contract (rationale + trade-off + reversibility) | MUST | `sdd-phase-common.md` §D "Recommended Option Description Contract" (L247-253) + test 1.3 | runtime-test | ✅ |
| Non-recommended option — contract N/A | MUST | Contract text scopes to `recommended: true` only | inspection-proof | ✅ |
| Legacy `next_question` — out of scope | MUST | §D L245 + test scopes to `question_gate.options[]`, excludes `next_question` | runtime-test | ✅ |
| Recommended option missing an element — non-compliant | MUST | Contract enumerates all three as required | inspection-proof | ✅ |
| Gate Reason Cost-of-Wrong-Decision | MUST | §D L255 + authoritative example `reason` (L210) names cost; test asserts `reason`+`cost` co-located | runtime-test | ✅ |
| Reason omits cost — non-compliant | MUST | Contract text requires naming the cost | inspection-proof | ✅ |
| Multiple Recommended Options each independent | SHOULD | §D L253 states each option independently satisfies the contract | inspection-proof | ✅ (WARNING per matrix waived — text explicit) |

### ambiguity-detection-boundaries/spec.md

| Requirement / Scenario | Strength | Evidence | Level | Status |
|---|---|---|---|---|
| Intent Restatement — vague request gate | MUST | orchestrator L100-111 `#### Intent Restatement (pre-classification)` before `### Change Classification`; test 1.4 asserts ordering | runtime-test | ✅ |
| Intent Restatement — specific request skips | MUST | orchestrator L111 explicit skip clause | inspection-proof | ✅ |
| User corrects restated intent | MUST | orchestrator L109 single confirmation exchange, correction path | inspection-proof | ✅ |
| Restatement does not fabricate artifacts | MUST | orchestrator L109 "Do NOT create any OpenSpec artifact as a side effect" | inspection-proof | ✅ |
| design-mismatch — apply blocks & routes to design | MUST | `sdd-apply/SKILL.md` L135 + Rules L230; orchestrator L448 routes to `sdd-design`; test 1.4/1.5 | runtime-test | ✅ |
| Cosmetic deviation — not a design-mismatch | MUST | `sdd-apply/SKILL.md` L135, L230 cosmetic carve-out; test 1.5 asserts `cosmetic` | runtime-test | ✅ |
| apply does not improvise around real contradiction | MUST | `sdd-apply/SKILL.md` L135 "STOP with `blocked: design-mismatch`" | inspection-proof | ✅ |

### specs/agents/spec.md (delta — ADDED requirements)

| Requirement / Scenario | Strength | Evidence | Level | Status |
|---|---|---|---|---|
| question_gate Recommendation Contract Compliance | MUST | §D contract applies uniformly; embedded examples swept | inspection-proof | ✅ (see WARNING) |
| Orchestrator Intent Restatement in Change Classification | MUST | orchestrator CORE zone L100 | runtime-test | ✅ |
| sdd-apply design-mismatch Blocker Type | MUST | `sdd-apply/SKILL.md` + orchestrator routing L448 | runtime-test | ✅ |
| blocker_type Enum Field Formalization (both tables) | MUST | `sdd-phase-common.md` §D L152-159 (field + 4-value enum) + baseline `agents/spec.md` §6.1 L354; tests 1.2 & 1.6 | runtime-test | ✅ |

Baseline scope check: only `agents/spec.md` §6.1 `blocker_type` row was synced to
baseline in apply (as design D3 / delta mandate require); the other 3 ADDED
requirements correctly remain change-local for `sdd-archive`. Confirmed no premature
baseline sync.

## Design Coherence

| Decision | Honored? | Evidence |
|---|---|---|
| D1 prose-invariant contract test mirroring assumption-ledger pattern | ✅ | Test structure identical (reads .md, asserts landmarks) |
| D2 intent restatement inline in orchestrator CORE zone | ✅ | L100, before Change Classification, not a `_shared/` handler |
| D3 `blocker_type` additive OPTIONAL row in both tables | ✅ | §D + §6.1 both list it, OPTIONAL |
| D4 design-mismatch routing extends existing routing section | ✅ | `Verification Failure Routing` renamed to `Failure & Blocker Routing`, reuses origin table |
| D5 fix non-conformant embedded `recommended: true` examples | ⚠️ Partial | Descriptions fixed across all swept files; one embedded example `reason` placeholder left non-conformant (WARNING below) |

## Sweep Verification

All `recommended: true` embedded examples inspected: `route-brownfield.md`,
`gate-archive-quality.md`, `dispatch-lifecycle-hooks.md`, `sdd-clarify/SKILL.md`
(template), and orchestrator (Delivery Strategy `ask-on-risk`, Review Workload Guard
"Chained PRs", Sub-Agent Clarification "Option A"). Every `description` now states
rationale + trade-off + reversibility. No stray non-conformant examples found in
`commands/` or `profiles/`.

## TDD Compliance

| Check | Result | Details |
|-------|--------|---------|
| TDD Evidence reported | ✅ | Table present in apply-progress.md |
| All coding tasks have tests | ✅ | Single contract test covers all prose landmarks (prose-only change) |
| RED confirmed (test exists) | ✅ | `scripts/recommendation-ambiguity-contract.test.js` exists; apply reports 9/9 failed pre-edit |
| GREEN confirmed (tests pass) | ✅ | Re-executed: 9/9 change assertions pass (38/38 suite) |
| Triangulation adequate | ✅ | 9 assertions spanning 4 source files, both enum tables, ordering, scope-exclusion |
| Safety net (modified files) | ✅ N/A | Contract test is a new file; source .md are prose, no prior test coupling broken |

**TDD Compliance**: 6/6 checks passed.

## Assertion Quality

Audited `scripts/recommendation-ambiguity-contract.test.js` (9 tests):

- No tautologies (`assert.ok(true)` etc.) — every assertion reads a canonical source
  file and checks a specific prose landmark.
- No ghost loops — the two `for (const value of BLOCKER_TYPE_VALUES)` loops iterate a
  hardcoded non-empty 4-element const, so assertions always execute.
- No zero-assertion tests, no type-only smoke tests, no mock-heavy tests.
- Ordering assertion (`restatementIdx < classificationIdx`) verifies real structural
  placement, not mere presence.
- Reason/cost assertion uses a same-line regex (`[^\n]`) — tight, not loose.

Minor note (informational, not a finding): tests 1.3's three co-located elements
(rationale/trade-off/reversibility) are asserted as independent whole-file substring
checks rather than proximity-scoped — acceptable and consistent with the established
repo prose-invariant pattern.

**Assertion quality**: ✅ All assertions verify real behavior. 0 CRITICAL, 0 WARNING.

## Test Layer Distribution

| Layer | Tests | Files | Tools |
|-------|-------|-------|-------|
| Unit (prose-invariant contract) | 9 | 1 | node:test |
| Integration | 0 | 0 | n/a |
| E2E | 0 | 0 | n/a |
| **Total (change)** | **9** | **1** | |

Coverage tool: not configured for markdown-source contract tests — "Coverage analysis
skipped, no coverage tool detected." Not a failure.

## Assumption Reconciliation

`state.yaml` `assumptions:` holds one entry — `sdd-design-001` (test-file naming),
`reversibility: high`, already realized correctly (the file is named exactly as
stated and passes). Per Decision Gates, an unresolved `reversibility: high` entry
MUST NOT escalate — no WARNING raised, no block. Step 2a is otherwise a no-op (no
`reversibility: low` entries). No `assumption_resolutions` block was required.

## Issues

### CRITICAL
None.

### WARNING
1. **Embedded `question_gate` reason example not conformant to the new Gate-Reason-Cost
   contract** — origin: `tasks-gap` (sweep incompleteness).
   `agents/sdd-orchestrator.agent.md` §Sub-Agent Clarification Contract "Preferred
   shape" (L644) still reads `"reason": "Why this decision blocks the phase."`, which
   models the pre-contract behavior and does NOT name the cost of a wrong/guessed
   decision — the very thing this change's Gate-Reason-Cost requirement mandates. Its
   sibling `description` (L652) was updated to enumerate all three elements, so the
   block is internally inconsistent. Per design D5, embedded examples are the de-facto
   reference phase agents copy, so a non-conformant reason example dilutes the
   contract. Low urgency, trivial one-line fix. (Note: the authoritative example in
   `sdd-phase-common.md` §D L210 IS conformant — this affects only the orchestrator's
   secondary template.)

### SUGGESTION
1. Consider adding a proximity-scoped assertion (or a single combined regex) for the
   three description elements in the contract test, to guard against future prose edits
   that separate them across the file. Current whole-file substring checks are
   acceptable but slightly loose.

## Risks

- Pre-existing, unrelated `npm test` single-command failure (17 assertions in
  `scripts/hooks/session-start.test.js` / `pre-tool-use.test.js`, git-collaboration
  related). Independently confirmed via git stash to reproduce without any of this
  change's edits. Out of scope; NOT caused by this change. Flagged so the orchestrator
  can weigh it separately, but it does not gate this change's verification.

## Verdict

**PASS WITH WARNINGS** — all MUST scenarios proven with runtime-test/static-proof
evidence; contract suite 38/38 green; 4 dist targets clean. One WARNING (non-blocking,
trivial fix) on a secondary embedded example's `reason`. The orchestrator may proceed
to `sdd-archive` (baseline delta sync) or address the WARNING first at its discretion.
