# Tasks: Bootstrap Brownfield Baseline

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 580–640 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Single PR under `size:exception` |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

> Delivery strategy is `exception-ok`. Estimate exceeds 400 lines. This run proceeds under `size:exception`; no PR restructuring.

### Suggested Work Units

| Unit | Goal | Notes |
|------|------|-------|
| A | JS runtime (TDD): `readBaselineState` + session-start hint | Sequential within: RED then GREEN |
| B | New Markdown trio: agent + skill + command | Independent; parallel with C and D |
| C | Modified surfaces: sdd-init, orchestrator, convention | Independent; parallel with B and D |
| D | Docs: sdd-workflows + README command table | After B stabilizes interface names |

---

## Phase 1: JS Runtime — `readBaselineState()` (Strict TDD)

Verification: `node --test "scripts/**/*.test.js"`. Run after each step. 1.1 before 1.2.

- [x] 1.1 **[RED]** Add failing tests for `readBaselineState(configContent)` in `scripts/lib/ospec-state.test.js`: absent block → `null`; `status: pending|partial|done`; non-empty `domains_pending` and `domains_done` list parsing; inline `[]` (empty list); CRLF normalization; comment lines skipped.
- [x] 1.2 **[GREEN]** Add `readBaselineState(configContent)` to `scripts/lib/ospec-state.js`: indentation-scoped line parser under `baseline:` key (mirrors `readStatus`); handles inline `[]` and indented list items (`- item`); returns `{ status, domains_pending, domains_done, stale_domains, last_checked }` or `null` when block absent; add to `module.exports`. All tests green.

## Phase 2: JS Runtime — Session-start Baseline Hint (Strict TDD)

Verification: `node --test "scripts/**/*.test.js"`. Depends on Phase 1. 2.1 before 2.2.

- [x] 2.1 **[RED]** Add failing tests in `scripts/hooks/session-start.test.js`: config fixture with `baseline.status: pending` → result contains `baseline.hint`; `partial` + `domains_pending: [a, b]` → hint mentions 2 pending; `done` + non-empty `stale_domains` → hint lists stale; `done` + empty `stale_domains` → no `baseline` key in result; config without `baseline` block → no `baseline` key; no-openspec path unchanged.
- [x] 2.2 **[GREEN]** In `runSessionStart()` in `scripts/hooks/session-start.js`: require `readBaselineState` from `../lib/ospec-state.js`; after `ospecDetected` is true, read `openspec/config.yaml` content; call `readBaselineState(content)`; when status is `pending` or `partial`, or when `stale_domains` is non-empty, set `baseline: { hint: <message> }` on the result; return result unchanged otherwise. All tests green.

## Phase 3: New sdd-baseline Markdown Surfaces

Verification: review + sdd-verify checklist against sdd-baseline spec. Tasks 3.1–3.3 are independent.

- [x] 3.1 Create `agents/sdd-baseline.agent.md`: executor-boundary frontmatter (mirrors `agents/sdd-foundation.agent.md`); reads `skills/sdd-baseline/SKILL.md` + `skills/_shared/sdd-phase-common.md`; result contract includes `status / executive_summary / artifacts / next_recommended / risks / skill_resolution`; specifies `partial` return after each completed batch with `next_recommended: sdd-baseline`; specifies `blocked + question_gate` for batch-0 domain-map approval before any spec is written.
- [x] 3.2 Create `skills/sdd-baseline/SKILL.md`: activation contract (`baseline.status: pending|partial` or user `/sdd-baseline`); batch-0 protocol (scan repo → capability clusters NOT directories → return `blocked/question_gate` → write manifest Domain Map once approved, set `domains_pending` in config); per-domain batch protocol (read manifest → skip rows with `done`/`skipped` → skip existing `{domain}/spec.md` → spec domain → `git rev-parse --short HEAD` → APPEND manifest entry → APPEND index line → update config); append-first manifest/index rules (never rewrite history); skip rule (NEVER touch `{domain}/spec.md` not authored by baseline); refresh rule (re-spec only stale or pending baseline-owned domains, append `refreshed` row with new hash).
- [x] 3.3 Create `commands/sdd-baseline.prompt.md`: YAML frontmatter (`name: sdd-baseline`, `agent: sdd-orchestrator`, `argument-hint: "<domain name or blank>"`); single routing prompt instructing the orchestrator to launch the sdd-baseline executor; `${input}` passthrough for optional domain targeting.

## Phase 4: Modified Prompt/Markdown Surfaces

Verification: review + sdd-verify checklist. Tasks 4.1–4.4 are independent.

- [x] 4.1 Modify `skills/sdd-init/SKILL.md`: add brownfield branch — fires when code detected AND `openspec/specs/` empty AND no existing `baseline` block; write `baseline` block to `openspec/config.yaml` (`status: pending`, empty `domains_pending`, `domains_done`, `stale_domains`, `last_checked: ""`); return `next_recommended: sdd-baseline`; on re-init preserve existing `baseline` block unchanged; `status: done` or non-empty specs → brownfield branch does not activate.
- [x] 4.2 Modify `skills/sdd-init/references/init-details.md`: add brownfield detection checklist — "existing code detected" criteria (source files outside `openspec/`, `docs/`, dotfiles); "empty `openspec/specs/`" criteria; note that empty repos (no detectable stack) do NOT trigger brownfield — foundation flow owns that case.
- [x] 4.3 Modify `agents/sdd-orchestrator.agent.md`: insert **Baseline Advisory** section after Init Guard; trigger: `baseline.status: pending|partial` on the first `/sdd-new` or `/sdd-explore` of a session; mandatory 4-point text (what `/sdd-baseline` is · gains: grounded changes and accurate archive merges · costs: batched exploration, token spend, resumable · skip-rule loss: domains evolved via archive before baseline runs permanently lose current-state seed); consent → launch sdd-baseline executor, relaunch while result is `partial`; decline → proceed with requested command, suppress advisory for rest of session; `status: done` → advisory silent.
- [x] 4.4 Modify `skills/_shared/openspec-convention.md`: add two rows to the Artifact File Paths table (`sdd-baseline` creates `openspec/specs/_baseline/manifest.md` and `index.md`; `sdd-baseline` creates `openspec/specs/{domain}/spec.md` for empty domains only); add ownership rule below the table (baseline seeds empty domains; sdd-archive owns evolving ones; baseline NEVER writes where `openspec/specs/{domain}/spec.md` already exists).

## Phase 5: Documentation

Verification: review. Tasks 5.1–5.2 are independent.

- [x] 5.1 Add baseline workflow section to `docs/sdd-workflows.md`: describe batch-0 domain-map flow, per-domain batch flow, resume-after-interruption flow (manifest absence of `done` entry = pending → re-run), and staleness/refresh flow (reads cached `stale_domains` from config, refresh appends `refreshed` rows); reference `openspec/specs/_baseline/manifest.md` and `index.md`; cross-reference the Advisory and skip rule.
- [x] 5.2 Add `/sdd-baseline` row to the command reference table in `README.md`: `"Seed openspec/specs/ with baseline specs of existing behavior (brownfield repos, resumable batches)."`.
