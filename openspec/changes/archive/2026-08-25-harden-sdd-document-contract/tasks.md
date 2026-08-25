# Tasks: Harden sdd-document Contract (P1–P7)

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-sdd-document-007 / Plan file lifecycle | MUST | `skills/sdd-document/SKILL.md` Step 5b | covered-by-design | Delete `_plan.md` in Step 6.8 cleanup |
| REQ-sdd-document-007 / Thin page detected in plan | MUST | Step 5b anti-pattern review | covered-by-design | Existing merge rule retained |
| REQ-sdd-document-007 / Overlapping concept resolved | MUST | Step 5b canonicity map (`canonical for` column) | covered-by-design | Blocks write until dedup |
| REQ-sdd-document-008 / Init mode on empty directory | MUST | Step 6 Max-Pages Guard | covered-by-design | Unchanged guard |
| REQ-sdd-document-008 / Update mode with no changes | MUST | Update Mode Behavior + Step 6.5 + Step 6.6 no-op metadata | covered-by-design | Re-verify volatiles; refresh only `updatedAt`/`gitHead` |
| REQ-sdd-document-008 / Update mode with limited changes | MUST | Update Mode Behavior soft budget | covered-by-design | Existing rule |
| REQ-sdd-document-008 / New unmapped module triggers coverage | MUST | Update Mode re-discovery + Step 5b `coverage proposals` | covered-by-design | Before editing existing pages |
| REQ-sdd-document-008 / Volatile fact re-verified outside window | MUST | Update Mode Behavior + Step 6.5 | covered-by-design | Every update run |
| REQ-sdd-document-011 / Metadata generated on init | MUST | Step 6.6 `.last-update.json` | covered-by-design | Renumbered from 6.4 |
| REQ-sdd-document-011 / doc_language and scope_choice | MUST | Step 6.6 schema | covered-by-design | Existing fields retained |
| REQ-sdd-document-011 / Update reads persisted fields | MUST | Step 3 skip gate | covered-by-design | Pre-existing |
| REQ-sdd-document-011 / scope D metadata under openwiki/ | MUST | Step 6.6 placement rule | covered-by-design | Pre-existing |
| REQ-sdd-document-011 / sections lists every existing page | MUST | Step 6.6 complete `sections` invariant | covered-by-design | Includes untouched pages |
| REQ-sdd-document-011 / filesSkipped identifies files and reasons | MUST | Step 6.6 `stats.filesSkipped` as `[{file, reason}]` | covered-by-design | Replaces numeric count |
| REQ-sdd-document-020 / Cited figure contrasted | MUST | New Step 6.5 Factual Verification Pass | covered-by-design | Per-claim search/read |
| REQ-sdd-document-020 / Failed verification corrects or removes | MUST | Step 6.5 remediation before cleanup | covered-by-design | No stale values published |
| REQ-sdd-document-020 / Cited identifiers resolve | MUST | Step 6.5 identifier checks | covered-by-design | Unresolvable → fix/remove |
| REQ-sdd-document-021 / Thin page merged | MUST | New Step 6.4 Measurable Output Checklist | covered-by-design | ≥30 substantive lines |
| REQ-sdd-document-021 / Justified orphan page | MUST | Step 6.4 + Step 7 envelope `checklist.justifiedExceptions` | covered-by-design | Explicit justification channel |
| REQ-sdd-document-021 / Mermaid labels render safely | MUST | Step 6.4 Mermaid syntax heuristic | covered-by-design | Quoted special chars |
| REQ-sdd-document-022 / Generator does not self-certify | MUST | Step 7 envelope + cross-ref REQ-agents-018 | covered-by-design | Mechanical self-report only |
| REQ-agents-018 / Clean QA — route closes silently | MUST | `route-document.md` §7 J6 + `gates.content-qa` | covered-by-design | ADR-001 |
| REQ-agents-018 / Confirmed factual error halts | MUST | `route-document.md` §7 two-option gate | covered-by-design | Default: re-dispatch |
| REQ-agents-018 / Reviewer distinct from generator | MUST | `route-document.md` §7 inline orchestrator pass | covered-by-design | No self-review |
| REQ-agents-018 / No QA record — cannot close success | MUST | `route-document.md` §7 mandatory registration | covered-by-design | `gates.content-qa` required |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none (J6 behavioral golden eval deferred per `sdd-design-003`)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~480–620 (`SKILL.md` ~180–220; `route-document.md` ~50–70; `sdd-document.test.js` ~250–320; ripple ~10–15; optional `starlight-web-doc-contract.test.js` ~15–25) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR under maintainer `size:exception` |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full contract hardening (RED tests → SKILL + route handler → L2 helpers → verify) | PR 1 (single) | `exception-ok` pre-approved (`delivery-001`); escalate via `workload-escalation` only if live diff exceeds ~650 lines |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: RED — Static Contract Tests (L1)

- [x] 1.1 Extend `scripts/sdd-document.test.js`: update the `.last-update.json` schema test regex from `### Step 6\.4:` to `### Step 6\.6:` (renumber ripple); add RED assertions that fail today — Step 5b documents a canonicity map (`canonical for` column); Update Mode Behavior documents post-window re-discovery and volatile-fact re-verification; new Step 6.4 checklist section with ≥30 substantive lines, link-graph in+out, flow Mermaid, syntax heuristic; new Step 6.5 factual verification pass between page write and cleanup; Step 6.6 schema shows complete `sections` and `filesSkipped` as `[{file, reason}]`; Step 7 forbids content-quality self-certification and documents `checklist` envelope shape. [REQ-sdd-document-007, REQ-sdd-document-008, REQ-sdd-document-011, REQ-sdd-document-020, REQ-sdd-document-021, REQ-sdd-document-022]
- [x] 1.2 Extend `scripts/sdd-document.test.js`: add RED assertions for `route-document.md` — §4 cross-ref points to Step 6.6 (not 6.4); new `#### 7. J6` section with orchestrator-owned content QA, distinct reviewer, `gates.content-qa` registration (`pass`|`findings`), two-option halt gate with re-dispatch default, inconclusive-check policy mirroring J5. [REQ-agents-018]
- [x] 1.3 Extend `scripts/starlight-web-doc-contract.test.js`: tighten the J5 section matcher so it stops at `#### 7.` (not `$`), preventing false coupling when §7 is appended; add RED assertion that §7 J6 exists with `content-qa` and the re-dispatch/accepted-risk gate labels. [REQ-agents-018]
- [x] 1.4 Confirm RED: run `node --test scripts/sdd-document.test.js scripts/starlight-web-doc-contract.test.js` — new assertions fail; pre-existing tests still pass or fail only on intended contract gaps. [REQ-sdd-document-007 through -022, REQ-agents-018]

## Phase 2: GREEN — Executor Contract (`SKILL.md` P1–P6)

- [x] 2.1 Expand Step 5b in `skills/sdd-document/SKILL.md`: add plan table columns `category` and `canonical for`; document canonicity-map dedup rule (one canonical page per concept, others summary+link); add update-mode `coverage proposals` section required before first edit of existing pages. [REQ-sdd-document-007, REQ-sdd-document-008]
- [x] 2.2 Expand **Update Mode Behavior**: after diff window, re-run domain discovery on CURRENT repo state; register new-page/merge proposals in `_plan.md` before editing existing pages; re-verify volatile facts (counters, thresholds, versions) every run even outside the window; no-op path re-verifies volatiles then reports no-op without editing wiki pages but refreshes ONLY `updatedAt` and `gitHead` in `.last-update.json`. [REQ-sdd-document-008]
- [x] 2.3 Insert **Step 6.4: Measurable Output Checklist** after domain page generation: operational definitions from design (substantive line, link graph, flow-category Mermaid, syntax heuristic); remediation before continue; `checklist.justifiedExceptions[]` in envelope for orphans. [REQ-sdd-document-021]
- [x] 2.4 Insert **Step 6.5: Factual Verification Pass** after Step 6.4: contrast every cited figure/identifier via search/read; record per-claim outcomes in run worklog (not published pages); correct or remove failures; update-mode includes volatile facts even on no-op when drift detected. [REQ-sdd-document-020, REQ-sdd-document-008]
- [x] 2.5 Renumber and expand metadata step to **Step 6.6**: move `.last-update.json` block here; `sections` = all `*.md` pages in output dir after run; `stats.filesSkipped` = `[{ "file", "reason" }]`; retain write-failure WARNING behavior; update internal cross-ref in Step 5 sandbox rule from Step 6.6 → Step 6.7 for AGENTS/CLAUDE exception. [REQ-sdd-document-011]
- [x] 2.6 Renumber **Step 6.6 → 6.7** (Root Agent Instruction Files) and **Step 6.5 Cleanup → 6.8**; ensure cleanup deletes `_plan.md` after all writes/checks complete. [REQ-sdd-document-007]
- [x] 2.7 Expand **Step 7: Return Summary**: add `json:result-envelope` `checklist` block (mechanical self-report only); explicit REQ-022 clause — no authoritative content-quality certification; reference orchestrator J6 / REQ-agents-018. [REQ-sdd-document-022]

## Phase 3: GREEN — Orchestrator Route Handler (P7 / J6)

- [x] 3.1 Fix `skills/_shared/route-document.md` §4 point 2: change "Step 6.4" → "Step 6.6" for `.last-update.json` writer reference. [REQ-sdd-document-011]
- [x] 3.2 Add `#### 7. J6 — orchestrator-owned post-run content QA (MANDATORY)` after §6 J5: trigger after generator `status: success`; readability on touched pages; factual spot-check sample `max(3, ceil(0.2 * claims))`; reviewer distinct from generator dispatch; record `gates.content-qa` (`status`, `summary`) in route `state.yaml`; confirmed defect or inconclusive check → two-option `question_gate` (re-dispatch default vs accepted risk); route MUST NOT close success without documented QA pass. [REQ-agents-018]

## Phase 4: Ripple — Cross-References and References

- [x] 4.1 Update `skills/sdd-document/references/option-d-starlight.md` lines referencing "Step 6.4" → "Step 6.6" (two occurrences per design ripple). [REQ-sdd-document-011]
- [x] 4.2 Grep repo for stale `Step 6\.4` references tied to `.last-update.json` or metadata (exclude archived changes); fix any remaining live references in affected source files. [REQ-sdd-document-011]

## Phase 5: RED/GREEN — Executable Spec Helpers (L2)

- [x] 5.1 Add pure helper functions inside `scripts/sdd-document.test.js` (no new runtime module per ADR-002): `countSubstantiveLines`, `evaluateLinkGraph`, `detectFlowMermaid`, `validateMermaidHeuristic`, `validateLastUpdateSchema` — semantics exactly as design §Interfaces. [REQ-sdd-document-021, REQ-sdd-document-011]
- [x] 5.2 Add L2 fixture tests using existing `tmpOut(t)`: valid mini-wiki (pass); thin page (<30 lines); orphan without incoming link; flow page without Mermaid; Mermaid with unquoted special chars; metadata with partial `sections` or numeric `filesSkipped` (fail). [REQ-sdd-document-021, REQ-sdd-document-011]
- [x] 5.3 Run `node --test scripts/sdd-document.test.js` — all L1 + L2 tests green. [REQ-sdd-document-020, REQ-sdd-document-021, REQ-sdd-document-011]

## Phase 6: Integration Verification

- [x] 6.1 Run full `npm test`; confirm no regressions in configure/dist-parity tests (`route-document.md` and `SKILL.md` present under claude/vscode/github-copilot/opencode/codex/cursor outputs via existing `runConfigure` checks). [REQ-agents-005, REQ-agents-018]
- [x] 6.2 Cross-check wording consistency: Step 5b `_plan.md` columns align with checklist oracles; Update Mode no-op vs volatile drift paths do not contradict; J6 gate labels match J5 halt style; envelope `checklist` vs REQ-022 prohibition are consistent. [REQ-sdd-document-007 through -022, REQ-agents-018]
- [x] 6.3 Regenerate target bundles if project convention requires committed `dist/` (`npm run build:vscode` and siblings); skip if dist is install-time only — document choice in `apply-progress.md`. [design Migration/Rollout]

## Phase 7: Handoff

- [x] 7.1 Mark all tasks `[x]` in this file during apply; write `apply-progress.md` with TDD evidence table (focused mode: note RED/GREEN per test batch). [openspec convention]
- [x] 7.2 Ready for `sdd-apply` batch 1 (single unit under `size:exception`).
