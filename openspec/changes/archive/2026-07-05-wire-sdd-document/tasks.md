# Tasks: Wire sdd-document into the Orchestrator (J1 + J4 + J5 + contract test)

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-agents-005 (allowlist/roster/pointer wiring) | MUST | `agents/sdd-orchestrator.agent.md` (3 inline rows, 491→493), `skills/_shared/route-document.md` (create) | covered-by-design | ADR-001 |
| REQ-agents-006 (orchestrator-owned J5 sandbox check) | MUST | `skills/_shared/route-document.md` §7 (git-status scoped inventory + halt gate) | covered-by-design | ADR-002 |
| REQ-agents-007 (commands↔agents contract test) | MUST | `scripts/commands-agents-contract.test.js` (create) | covered-by-design | parses §3.2 "Routes to" per ADR-001/clarification |
| REQ-sdd-document-002 (launch gate + write sandbox + no-self-certify) | MUST | `skills/sdd-document/SKILL.md` Steps 3/4 (no-self-certify wording); `route-document.md` (orchestrator ownership) | covered-by-design | |
| REQ-sdd-document-006 (batched language+scope gate, update-mode keep/change) | MUST | `skills/sdd-document/SKILL.md` Steps 3/4; `route-document.md` §2-3 | covered-by-design | ADR-003 |
| REQ-sdd-document-011 (`.last-update.json` schema gains fields) | MUST | `skills/sdd-document/SKILL.md` Step 6.4 | covered-by-design | ADR-003 |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none (4 clarifications already resolved and recorded in `state.yaml` approvals)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~300-360 (orchestrator +3 net; new `route-document.md` ~130-150; new `commands-agents-contract.test.js` ~90-120; `SKILL.md` edits ~30-50; `real-repo.test.js` +10-20; change-local specs already written, not counted in apply) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR (size:exception already accepted per `state.yaml` approval `appr-002`) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full wiring (RED tests → GREEN wiring/handler/SKILL edits) | PR 1 (single) | Self-contained; `exception-ok` accepted, no chain needed unless actual diff exceeds ~450 lines during apply — if so, escalate via `workload-escalation` per apply guard |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: RED — Failing Tests First

- [x] 1.1 Create `scripts/commands-agents-contract.test.js`: statically parse `commands/*.prompt.md` `agent:` frontmatter + the §3.2 "Command Roster" table in `openspec/specs/agents/spec.md` (substring after `→`, skip rows without `→`); assert each parsed target ∈ router's `agents:` allowlist. Confirm RED: fails today because `sdd-document` is absent from `agents/sdd-orchestrator.agent.md` `agents:`. [REQ-agents-007]
- [x] 1.2 Extend `scripts/configure/real-repo.test.js`: add `sentinelFiles` entry `{ sentinel: "Acknowledge and close the route anyway", file: "skills/_shared/route-document.md" }` (sentinel absent from orchestrator body, present in handler) and a pointer-table-row assertion for `route-document.md`. Confirm RED: fails because the file does not exist yet. [REQ-agents-005]
- [x] 1.3 Extend `scripts/sdd-document.test.js` (or create if absent): assert `.last-update.json` schema documented in `SKILL.md` includes `doc_language`+`scope_choice`; assert `SKILL.md` describes ONE batched `question_gate` (not two sequential gates); assert `route-document.md` is present under all four dist targets (`skills/` walk in `cli.js`). Confirm RED: fails on all three assertions. [REQ-sdd-document-006, REQ-sdd-document-011, REQ-agents-005]

## Phase 2: GREEN — Orchestrator Wiring (J1)

- [x] 2.1 In `agents/sdd-orchestrator.agent.md` frontmatter, append `'sdd-document'` to the existing `agents:` array in place (0 net lines). [REQ-agents-005]
- [x] 2.2 Add one command-index bullet under the CORE body's `/sdd-*` command list: `` - `/sdd-document` → generate/update the repository technical wiki (delegates to sdd-document) ``. [REQ-agents-005]
- [x] 2.3 Add one row to the Circumstantial Handler Pointer Table (§15): "Document Route Handler" → `skills/_shared/route-document.md`, triggered on `/sdd-document` dispatch, read via `read` tool exactly once per route. Verify body stays under 500 lines (491→493). [REQ-agents-005]

## Phase 3: GREEN — Route Handler and Executor (J4 + J5)

- [x] 3.1 Create `skills/_shared/route-document.md` (prose only, no frontmatter/tool grants): trigger/read-once note; init-mode batched `question_gate` (language: English recommended + Spanish freeform; scope: A/B/C) delivered via a single `vscode/askQuestions` call. [REQ-agents-005, REQ-sdd-document-002, REQ-sdd-document-006]
- [x] 3.2 In `route-document.md`, add the update-mode keep/change pre-question ("Keep previous documentation language and scope, or change them?"); "keep" reuses persisted values (gate skipped); "change" re-asks only the selected field(s), reusing the persisted value for the rest. [REQ-sdd-document-006]
- [x] 3.3 In `route-document.md`, add output-dir resolution: Option A→`openwiki/`, B→`docs/wiki/`, C→validated `custom_path`; reject at gate time if the resolved Option C path is outside the repository working tree (re-prompt for an in-repo path). [REQ-agents-006]
- [x] 3.4 In `route-document.md`, add persistence steps: write approval-ledger entry under `state.yaml approvals:`; write resolved `doc_language`/`scope_choice` into `.last-update.json` in the resolved output directory; dispatch to `sdd-document` with `doc_language`, `scope_choice`, `custom_path`. [REQ-sdd-document-006, REQ-sdd-document-011]
- [x] 3.5 In `route-document.md`, add the J5 post-run step: after `status: success`, run `git status` scoped to `{resolved output dir, /AGENTS.md, /CLAUDE.md}`; on any out-of-set path, halt with a two-option `question_gate` ("Abort the route..." default/recommended vs "Acknowledge and close the route anyway (accepted risk)"); never close the route without an explicit choice. [REQ-agents-006]
- [x] 3.6 Modify `skills/sdd-document/SKILL.md` Steps 3/4: rewrite the two sequential gates into the single batched gate description (language+scope together); add the no-self-certify sandbox-compliance language (orchestrator's post-run check is authoritative, not the executor's self-report). [REQ-sdd-document-002, REQ-sdd-document-006]
- [x] 3.7 Modify `skills/sdd-document/SKILL.md` Step 6.4: extend the `.last-update.json` write to include `doc_language` and `scope_choice` fields alongside the existing schema. [REQ-sdd-document-011]

## Phase 4: GREEN Verification — Confirm Tests Pass

- [x] 4.1 Run `npm test`; confirm `scripts/commands-agents-contract.test.js` now passes (`sdd-document` reachable via the allowlist). [REQ-agents-007]
- [x] 4.2 Confirm `scripts/configure/real-repo.test.js` passes: body `< 500` lines, pointer reference to `route-document.md` resolves, sentinel absent from orchestrator body / present in handler. [REQ-agents-005]
- [x] 4.3 Confirm `scripts/sdd-document.test.js` passes: dist-parity presence of `route-document.md` on all four targets, `.last-update.json` schema assertion, batched-gate wording assertion. [REQ-agents-005, REQ-sdd-document-006, REQ-sdd-document-011]

## Phase 5: Cleanup

- [x] 5.1 Re-read `agents/sdd-orchestrator.agent.md` and confirm no protocol prose beyond the three inline rows was added to the body (all protocol lives in `route-document.md`). [REQ-agents-005]
- [x] 5.2 Cross-check `SKILL.md` and `route-document.md` wording for consistency (no contradicting gate order or field names) before handing off to `sdd-verify`. [REQ-sdd-document-002, REQ-sdd-document-006, REQ-sdd-document-011]

## Phase 6: 4R Remediation (appr-003)

- [x] 6.1 `scripts/commands-agents-contract.test.js`: replace silent `continue` on roster lookup-miss with a hard collected-errors assertion; add `checked.includes("sdd-document.prompt.md")` assertion. TDD RED-first via reversible spec.md mutation. [rel-1, CRITICAL]
- [x] 6.2 Same test: accept both `→` and `->` arrow forms; add `arrowRowCount > 0` sanity assertion. TDD RED-first via reversible spec.md mutation. [rel-2, WARNING]
- [x] 6.3 Add test in `scripts/sdd-document.test.js` asserting `route-document.md` §3 out-of-repo `custom_path` rejection contract. TDD RED-first via reversible route-document.md mutation. [rel-3, WARNING]
- [x] 6.4 `route-document.md` §6 (J5): define `git status` command-failure behavior as verification-inconclusive, halting with the same two-option gate. [res-1, WARNING]
- [x] 6.5 `skills/sdd-document/SKILL.md` Step 6.4: define `.last-update.json` write-failure behavior (WARNING in return envelope; degraded fallback to init mode documented). [res-2, WARNING]
- [x] 6.6 `skills/sdd-document/SKILL.md` Step 3: restructure batched gate so each question carries ONE `options:` array. [read-1, WARNING]
- [x] 6.7 `route-document.md` §4: name the fixed approval-ledger `gate: document-init` id for language/scope decisions. [read-2, WARNING]
- [x] 6.8 `route-document.md` §4: add approval-ledger write-failure clause (opportunistic). [res-3, SUGGESTION]
- [x] 6.9 `route-document.md` §2: add precedence rule for multiple candidate `.last-update.json` directories (opportunistic). [read-3, SUGGESTION]
- [x] 6.10 Run full `npm test`; confirm 986/987 passing with the documented `ospec-state.test.js` flake isolated and re-confirmed green (52/52) standalone.
