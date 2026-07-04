# Proposal: Per-change cost telemetry (C3)

## Intent

The §9 success metrics of `analisis-fino/analisis-evolucion-harness.md` (tokens per phase,
re-launches, questions asked) are currently unmeasurable — there is no per-change cost
signal. This blocks the feedback loop for C1/C2. Roadmap item C3 closes that gap: the
already-parity `SubagentStop` hook accumulates estimated dispatch cost per change, and
`sdd-archive` surfaces it in the archive-report so cost becomes an auditable, versioned
artifact (no DB, no external service — per the analysis appendix).

## Scope

### In Scope
- Extend `SubagentStop` (JS + Go) to append one estimated-cost record per dispatch to
  `.ospec/session/{change}/phase-costs.jsonl` (sibling of the existing
  `token-events.jsonl` written by the Token Budget Advisor). Strictly additive and
  fail-safe, exactly like the C5 envelope-persistence step.
- Reuse the existing `bytes/char → token` heuristic (`estimateTokens`, ~4 chars/token)
  applied to the dispatch result payload; record `phase`, `agent`, `est_tokens`,
  `status`, `ts`.
- New Go/JS parity fixture family (`subagent-stop-phase-cost-*`), bumping the parity
  floor 2 → 3 in `internal/testdata/parity/README` and the hooks-spec fixture table.
- Add a cost block to the archive-report: tokens per phase, re-launches (repeat
  dispatches of the same phase), and questions asked, aggregated from
  `phase-costs.jsonl` + `state.yaml`.

### Out of Scope
- Dashboard/visualization (F3), CI/headless surfacing (B4), exact token metering from a
  real tokenizer (heuristic only).
- Changing `token-events.jsonl` or Token Budget Advisor thresholds.

## Capabilities

### New Capabilities
- None (extends existing behavior).

### Modified Capabilities
- `hooks`: add a §5 sub-section — `SubagentStop` writes per-dispatch cost records to
  `.ospec/session/{change}/phase-costs.jsonl`; update the parity fixture table/floor.
- `agents`: add a cost-block requirement to the `sdd-archive` archive-report.

## Approach

Mirror the C5 pattern: a new pure side-effect step in `runSubagentStop` (JS + Go),
ordered after envelope persistence, that resolves the active change, estimates tokens
from the dispatch payload, and appends a JSONL line under the existing advisory-lock
convention. `sdd-archive` reads and aggregates the file into a Markdown cost table. Keep
the two runtimes byte-for-byte via a shared fixture.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/hooks/subagent-stop.js` | Modified | New `persistPhaseCost` step |
| `internal/hooks/subagentstop.go` | Modified | Go port for parity |
| `scripts/lib/artifact-store.js` / `ospec-state.js` | Modified | `phase-costs.jsonl` path constant + writer |
| `internal/testdata/parity/` + README | Modified | New fixture family, floor 2→3 |
| `openspec/specs/hooks/spec.md` | Modified | §5 delta + fixture table |
| `openspec/specs/agents/spec.md` | Modified | archive-report cost block |
| `skills/sdd-archive/SKILL.md`, `agents/sdd-archive.agent.md` | Modified | Cost block step |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Parity drift between JS and Go | Med | Shared fixture + floor bump enforced in CI |
| Cost write breaks the fail-safe hook contract | Low | Wrap in try/catch; never affect stdout/exit — mirror C5 |
| Re-launch/question source ambiguous in `state.yaml` | Med | Defer exact aggregation source to `sdd-design`; block if it touches a public contract |
| `sdd-archive` skill edits balloon the orchestrator prompt | Low | Archive changes live in the skill, not the orchestrator (< 500-line guard) |
| Heuristic tokens mistaken for exact metering | Low | Label records/report as "estimated" |

## Rollback Plan

The cost step is strictly additive and gated only by presence of an active change. Revert
by removing `persistPhaseCost` from both runtimes, deleting the new fixture family (restore
floor to 2), and dropping the archive-report cost block. No migration: `phase-costs.jsonl`
is a disposable session artifact under `.ospec/` (git-ignored), so removal leaves no
orphaned state.

## Dependencies

- Builds on C5 (strict result envelope already validated by `SubagentStop`) and the
  existing Token Budget Advisor heuristic + `.ospec/session/{change}/` layout.

## Success Criteria

- [ ] Each `sdd-*` dispatch appends one estimated-cost line to `phase-costs.jsonl`.
- [ ] Go and JS produce byte-for-byte identical output for the new parity fixture.
- [ ] `sdd-archive` archive-report shows tokens per phase, re-launches, and questions.
- [ ] The §9 metrics (tokens/phase, re-launches, questions) become derivable per change.
- [ ] `npm test` and Go tests pass; hook stays fail-safe (`{"continue":true}`).

**Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following
the `<tipo>/<descripción>` convention from the `branch-pr` skill
(e.g. `git checkout -b feat/add-change-cost-telemetry main`).
