# Apply Progress: orchestrator-intent-briefing

**Mode**: Focused TDD
**Delivery**: size:exception (user approved; single PR scope)
**Branch**: `feat/orchestrator-intent-briefing`
**Batch**: first apply (no prior apply-progress.md)

## Completed Tasks

- [x] 1.1–1.7 Contrato RED (helper D2 + skip-if-specific + matriz + cap 2 + persist/ownership + ledger enum)
- [x] 2.1–2.6 CORE D2 rewrite + approval-ledger `intent-briefing` GREEN
- [x] 3.1–3.4 Configure source fixture + regenerated goldens + real-repo landmarks
- [x] 4.1–4.7 Evals corpus 7→9 (recast vague + specific + continue-no-rebrief + runner/docs)
- [x] 5.1–5.2 Regression `npm test` green; no writes to `openspec/specs/`

## Deferred (not apply)

- [ ] 6.1 Purpose merge in `openspec/specs/ambiguity-detection-boundaries/spec.md` — archive-only. Left unchecked for `sdd-archive`.

## TDD Evidence

| Task | Test File | RED | GREEN | Notes |
| ---- | --- | --- | --- | --- |
| 1.1–1.7 | `scripts/recommendation-ambiguity-contract.test.js` | 20 legacy pass / 5 new D2+ledger fail | n/a (RED batch) | Helper `extractIntentRestatement` passed; skip-if-specific, matrix, cap, persist, ledger failed as designed |
| 2.1–2.6 | `scripts/recommendation-ambiguity-contract.test.js` | (from Phase 1) | 25/25 pass | D2 rewritten in CORE (495 lines, under 500); ledger enum + obligatory `synthesis`/`scope` |
| 3.1–3.4 | `scripts/configure/cli.test.js`, `scripts/configure/real-repo.test.js` | n/a (fixture/snapshot) | cli 32/32; real-repo 33/33 including D2 landmarks | Goldens regenerated via `runConfigure` from source fixture; model-policy-only churn restored |
| 4.1–4.7 | `scripts/evals/run.test.js` | n/a (corpus/docs) | 14/14 pass; `listScenarioNames().length === 9`; benchmark catalog still 9 | Structural expects only; `safe-export.js` untouched |
| 5.1–5.2 | `npm test` (`scripts/check.js`) | n/a | 2677 pass / 0 fail / 2 skipped | design-mismatch tests unchanged; `git diff --stat -- openspec/specs` empty |

## Files Changed

| File | Action | What Was Done |
|------|--------|---------------|
| `scripts/recommendation-ambiguity-contract.test.js` | Modified | D2 extractor + fail-closed skip-if-specific + matrix/cap/persist/ledger landmarks |
| `agents/sdd-orchestrator.agent.md` | Modified | Replaced Intent Restatement: eligibility, 2–4 line briefing, 2-round cap, persist-before-classify |
| `skills/_shared/approval-ledger.md` | Modified | `intent-briefing` gate; `synthesis`/`scope` obligatory only for that gate |
| `scripts/configure/__fixtures__/source/agents/sdd-orchestrator.agent.md` | Modified | Representative D2 for the configure fixture |
| `scripts/configure/__fixtures__/golden/{claude,cursor,github-copilot,codex,opencode}/**orchestrator*` | Regenerated | Snapshots from source fixture (not hand-edited) |
| `scripts/configure/real-repo.test.js` | Modified | D2 landmarks on all six generated targets |
| `scripts/evals/__fixtures__/vague-request-no-artifact/` | Modified | Eligible new request, gate present, artifacts absent |
| `scripts/evals/__fixtures__/specific-request-no-artifact/` | Created | Specific request still briefs; no artifacts |
| `scripts/evals/__fixtures__/continue-no-rebrief/` | Created | Seeded accepted `intent-briefing`; continue does not re-brief |
| `scripts/evals/run.js` | Modified | Discovery error text 7→9 |
| `scripts/evals/run.test.js` | Modified | `listScenarioNames().length === 9` |
| `scripts/evals/README.md` | Modified | Corpus 9 (3 briefing + 6 conserved) |
| `scripts/evals/lib/capture.js` | Modified | Comment: no-artifact briefing scenarios |

## Deviations from Design

None — implementation matches design. D2 stayed in CORE, compact enough to remain under the 500-line orchestrator ratchet (495 lines).

## Issues Found

None.

## Workload / PR Boundary

- Mode: size:exception
- Current work unit: Phases 1–5 (all remaining apply tasks)
- Boundary: first apply batch through regression green; 6.1 excluded (archive)
- Estimated review budget impact: High (accepted exception)

## Status

26/27 tasks complete (6.1 deferred to archive). Ready for verify.
