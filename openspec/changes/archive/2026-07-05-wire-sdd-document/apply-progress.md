# Apply Progress: wire-sdd-document

## Batch 1 (first and only batch — full change applied)

**Mode**: Strict TDD
**Delivery**: single PR, `exception-ok` (per `state.yaml` approval `appr-002`; forecast `400-line budget risk: Medium`, no chaining required per tasks.md)

### Completed Tasks

All 18 tasks across 5 phases completed and locally verified.

- [x] 1.1 Created `scripts/commands-agents-contract.test.js` (RED confirmed against the pre-wiring allowlist)
- [x] 1.2 Extended `scripts/configure/real-repo.test.js` with the `route-document.md` sentinel + sentinel-file entry (RED confirmed — file absent)
- [x] 1.3 Extended `scripts/sdd-document.test.js` with 3 new assertions: `.last-update.json` schema fields, batched-gate wording, dist-parity presence (RED confirmed on all three)
- [x] 2.1 Appended `'sdd-document'` to `agents/sdd-orchestrator.agent.md` frontmatter `agents:` array (0 net lines)
- [x] 2.2 Added `/sdd-document` command-index bullet to the CORE body
- [x] 2.3 Added "Document Route Handler" row to the Circumstantial Handler Pointer Table (§15); body 491→493 lines, confirmed `< 500`
- [x] 3.1-3.5 Created `skills/_shared/route-document.md`: trigger/read-once note; init-mode batched gate; update-mode keep/change pre-question; output-dir resolution + out-of-repo Option C rejection; persistence steps; J5 post-run scoped `git status` halt gate (abort/acknowledge two-option contract)
- [x] 3.6 Rewrote `skills/sdd-document/SKILL.md` Steps 3/4 into the single batched language+scope gate; added no-self-certify sandbox language pointing to the orchestrator's J5 check
- [x] 3.7 Extended `skills/sdd-document/SKILL.md` Step 6.4 `.last-update.json` schema with `doc_language`/`scope_choice`
- [x] 4.1-4.3 Full `npm test` run: 986/986 native tests passing, all 4 target generations + validators passing
- [x] 5.1 Re-read orchestrator body: confirmed only the 3 designed inline additions were made, no protocol prose inlined
- [x] 5.2 Cross-checked `SKILL.md` vs `route-document.md`: consistent field names (`doc_language`, `scope_choice`), consistent gate order (batched init gate → update keep/change pre-question owned by the route handler → sandbox enforcement → J5 owned by the orchestrator, never by the executor)

### Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/commands-agents-contract.test.js` | Created | Static commands↔agents contract test (REQ-agents-007); parses §3.2 "Command Roster" table + command/router frontmatter via `scripts/lib/frontmatter.js` |
| `scripts/configure/real-repo.test.js` | Modified | Added `Acknowledge and close the route anyway` sentinel-absence assertion + `sentinelFiles` migration entry for `skills/_shared/route-document.md` |
| `scripts/sdd-document.test.js` | Modified | Added 3 tests: `.last-update.json` schema (`doc_language`/`scope_choice`), batched single-gate wording, dist-parity presence of `route-document.md` on all 4 targets |
| `agents/sdd-orchestrator.agent.md` | Modified | `agents:` array +`'sdd-document'`; +1 command-index bullet; +1 pointer-table row (491→493 lines) |
| `skills/_shared/route-document.md` | Created | Full document-route protocol: trigger/read-once, batched init gate, update keep/change pre-question, output-dir resolution + Option C reject, persistence, dispatch, J5 orchestrator-owned sandbox check |
| `skills/sdd-document/SKILL.md` | Modified | Steps 3/4 rewritten into one batched gate; no-self-certify language added to Step 5; Step 6.4 schema gains `doc_language`/`scope_choice` |

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 1.1 / 2.1 | `scripts/commands-agents-contract.test.js` | Unit (static) | N/A (new) | ✅ Written — failed with `sdd-document.prompt.md routes to 'sdd-document' but ... allowlist does not include it` | ✅ Passed after 2.1 | ➖ Single scenario (only one command currently routes to a missing agent in this repo) | ✅ Clean | Static parse only, no LLM invocation |
| 1.2 / 2.3 / 3.1 | `scripts/configure/real-repo.test.js` (extended) | Unit (static) | ✅ 19/20 passing pre-change (1 new pre-existing-file assertion added) | ✅ Written — failed with `skills/_shared/route-document.md must exist` | ✅ Passed after 3.1 created the file | ➖ Single (sentinel-migration pattern already triangulated by 11 prior entries in the same test) | ✅ Clean | Generic pointer-table-ref-resolves assertion also exercised (no separate test needed) |
| 1.3 (schema) / 3.7 | `scripts/sdd-document.test.js` (extended) | Unit (static) | ✅ 13/13 passing pre-change | ✅ Written — failed on first pass (whole-file `includes` was too permissive, tightened to scope the Step 6.4 fenced block) then failed correctly (`schema block must document doc_language`) | ✅ Passed after 3.7 | ➖ Single (one schema block, two required fields checked together) | ✅ Clean | Test tightened mid-cycle to avoid a false-pass on unrelated `doc_language` mentions elsewhere in the file |
| 1.3 (batched wording) / 3.6 | `scripts/sdd-document.test.js` (extended) | Unit (static) | (same baseline as above) | ✅ Written — failed with `must describe a single batched question_gate for language+scope` | ✅ Passed after 3.6; required a second wording fix mid-cycle (see Issues Found) | ✅ 2 assertions (positive: batched/single/question_gate all present; negative: old standalone-first-gate phrasing absent) | ✅ Clean | |
| 1.3 (dist-parity) / dist walk (automatic) | `scripts/sdd-document.test.js` (extended) | Integration (real generator) | (same baseline) | ✅ Written — failed with `route-document.md missing from claude output` | ✅ Passed automatically once 3.1 created the file (no generator code change needed — `skills/` is a walked `SOURCE_ROOTS` entry) | ✅ 4 cases (claude/vscode/github-copilot/opencode) | ➖ None needed | Confirms Cross-Target Parity requirement (agents spec §15) with zero new generator logic |

### Test Summary
- **Total tests written**: 5 (1 new file + 4 new/extended assertions across 2 existing files)
- **Total tests passing**: 986/986 (full native suite) + all 4 target generations/validators in `scripts/check.js`
- **Layers used**: Unit/static (4), Integration/real-generator (1)
- **Approval tests** (refactoring): None — no refactoring tasks; SKILL.md edits were spec-driven rewrites of existing gate steps, covered by the pre-existing SKILL.md static-contract tests (all still passing, used as the safety net)
- **Pure functions created**: 1 (`parseCommandRoster` in the new contract test — a pure markdown-table parser, no I/O, easily unit-verifiable in isolation)

### Deviations from Design

None — implementation matches `design.md`. One test-authoring correction (not a design deviation): the initial `.last-update.json` schema assertion in Task 1.3 checked `content.includes(...)` across the whole `SKILL.md` file, which passed trivially before the fix was applied (the strings already appeared elsewhere in prose describing the parameters). Tightened to scope the assertion to the fenced JSON block under `### Step 6.4` so the test is a real RED/GREEN gate on the schema itself, not just file-wide substring presence.

### Issues Found

One wording collision during Task 3.6: the negative assertion in the batched-gate test (`!/first gate presented to the user, before any other question/`) initially still matched the rewritten Step 3 heading text, because the new prose preserved that exact substring ("This gate MUST be the first gate presented to the user, before any other question, in **init mode**"). Reworded to "This batched gate MUST run before any other question, in **init mode**" — same normative meaning (batched gate still runs first in init mode), phrasing no longer collides with the old standalone-first-gate wording the test is designed to reject.

### Workload / PR Boundary

- Mode: single PR, `size:exception` (per `state.yaml` approval `appr-002`, delivery strategy `exception-ok`)
- Current work unit: Unit 1 — "Full wiring (RED tests → GREEN wiring/handler/SKILL edits)" (the only unit declared in tasks.md's Suggested Work Units)
- Boundary: starts at the RED contract/sentinel/schema tests (Phase 1) and ends at the Phase 5 cleanup cross-check; nothing deferred to a later batch
- Estimated review budget impact: within forecast. Actual diff: 1 new test file (~100 lines), 1 new prose handler file (~100 lines), ~35 lines of test extensions across 2 existing test files, ~5 lines of orchestrator inline additions, ~55 lines of SKILL.md rewrite (net, mostly restructuring existing Step 3/4 content rather than pure addition). No `workload-escalation` triggered.

### Status
18/18 tasks complete. Ready for `sdd-verify`.

## 4R Remediation

Remediates all findings from `4r-review-gate` per `appr-003`: the 1 CRITICAL (rel-1) and all 6 WARNINGs (rel-2, rel-3, res-1, res-2, read-1, read-2). Both SUGGESTIONs (res-3, read-3) were also remediated opportunistically (trivial).

### Findings Remediated

| ID | Severity | Remediation |
|----|----------|--------------|
| rel-1 | CRITICAL | `scripts/commands-agents-contract.test.js`: replaced the silent `continue` on roster lookup-miss with a hard `missingFromRoster` collected-errors assertion, plus an explicit `checked.includes("sdd-document.prompt.md")` assertion |
| rel-2 | WARNING | Same test: arrow detection now accepts both `→` and `->`; added `arrowRowCount > 0` sanity assertion so a broken/no-op arrow regex turns the suite RED |
| rel-3 | WARNING | New test in `scripts/sdd-document.test.js` statically asserts `route-document.md` §3 rejects an out-of-repo `custom_path` at gate time (never delegates, re-prompts) |
| res-1 | WARNING | `route-document.md` §6 (J5): added an explicit `git status`-failure clause — treated as verification-inconclusive, never an automatic pass; halts with the same two-option `question_gate` as a confirmed violation, but with an `executive_summary` naming the check failure instead of an unexpected path |
| res-2 | WARNING | `skills/sdd-document/SKILL.md` Step 6.4: added a write-failure clause — `.last-update.json` write failure is reported as a WARNING in the return envelope; route still closes `success`; documented degraded behavior is the next run falling back to init mode |
| read-1 | WARNING | `skills/sdd-document/SKILL.md` Step 3: restructured both questions (Language, Scope) so each carries exactly ONE `options:` array holding all option items, instead of duplicated sibling `options:` bullets |
| read-2 | WARNING | `route-document.md` §4: named the fixed approval-ledger gate id (`gate: document-init`) used for every language/scope decision this route handler records, since the ledger's documented enum has no dedicated value for it |
| res-3 | SUGGESTION (opportunistic) | `route-document.md` §4: added an approval-ledger write-failure clause (retry once, else proceed and surface a WARNING; never block the route on it) |
| read-3 | SUGGESTION (opportunistic) | `route-document.md` §2: added a precedence rule for multiple candidate dirs each carrying a `.last-update.json` — prefer the most recent `gate: document-init` ledger entry, else `openwiki/` > `docs/wiki/` > `custom_path` |

### Files Touched

| File | Change |
|------|--------|
| `scripts/commands-agents-contract.test.js` | rel-1, rel-2 test hardening |
| `scripts/sdd-document.test.js` | rel-3 new test (`ROUTE_DOCUMENT_PATH` constant + assertion) |
| `skills/_shared/route-document.md` | res-1 (§6 git-status-failure clause), read-2 (§4 gate id), res-3 (§4 ledger-write-failure clause), read-3 (§2 precedence rule) |
| `skills/sdd-document/SKILL.md` | res-2 (Step 6.4 write-failure clause), read-1 (Step 3 single-options-array restructure) |

### RED/GREEN Evidence

All three testable-code findings (rel-1, rel-2, rel-3) were TDD RED-first, using temporary reversible mutations of the real artifacts under test (never committed), confirmed byte-identical after revert via `diff`/`git status --porcelain`:

| Finding | RED trigger (temporary mutation) | RED result | GREEN result (after revert / after fix) |
|---------|-----------------------------------|-------------|-------------------------------------------|
| rel-1 | Deleted the `sdd-document.prompt.md` roster row from `openspec/specs/agents/spec.md` (in-place, reverted after) | `AssertionError: these commands/*.prompt.md files have no matching row ... ["sdd-document.prompt.md"]` | Reverted spec.md (byte-identical, confirmed via diff); test passes; `checked` now includes `sdd-document.prompt.md` |
| rel-2 | Replaced all `→` with `=>` in `openspec/specs/agents/spec.md` (in-place, reverted after) | `AssertionError: rel-2 guard: at least one roster row must contain a routing arrow ... zero arrow rows detected` | Reverted spec.md; test passes; `arrowRowCount > 0` |
| rel-3 | Replaced the reject clause in `route-document.md` §3 with permissive wording (in-place, reverted after) | `AssertionError: §3 must reject an out-of-repo custom_path at gate time instead of delegating` | Reverted route-document.md (byte-identical, confirmed via diff); test passes |

res-1, res-2, read-1, read-2 (and the two opportunistic SUGGESTIONs) are agent-instruction markdown edits with no dedicated new test; their governing pre-existing static-contract tests (`scripts/sdd-document.test.js`, dist-parity test) were re-run after each edit and stayed GREEN throughout.

### Full-Suite Result

`npm test`: **986/987 native tests passing**. The 1 failure — `scripts/lib/ospec-state.test.js` "appendRuntimeEvent serializes concurrent writers without corrupting lines" (`EPERM` on a `.lock` file under Windows temp) — is the documented pre-existing flake, unrelated to this remediation. Re-ran `scripts/lib/ospec-state.test.js` in isolation: **52/52 passing**, confirming the flake and that no remediation change caused it.

`scripts/sdd-document.test.js` + `scripts/commands-agents-contract.test.js` together: 18/18 passing.

### Status
4R remediation complete: 1 CRITICAL + 6 WARNING (MUST FIX, `appr-003`) + 2 SUGGESTION (opportunistic) all addressed. Ready for re-`sdd-verify`.
