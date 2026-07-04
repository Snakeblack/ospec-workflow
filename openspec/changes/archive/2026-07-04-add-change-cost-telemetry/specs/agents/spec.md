# Delta for agents

## ADDED Requirements

### Requirement: sdd-archive Cost Block in Archive Report {#REQ-agents-001}

`sdd-archive`'s archive report (`archive-report.md`, per `skills/sdd-archive/SKILL.md`
Step 3) MUST include a "Cost" block reporting, per completed change:
- Estimated tokens per phase, aggregated from `.ospec/session/{change}/phase-costs.jsonl`
  (hooks domain, `SubagentStop` §REQ-hooks-001), grouped and summed by `phase`.
- The count of re-launches per phase — a re-launch is a repeat dispatch of the same
  phase after its first recorded dispatch (e.g. re-running `sdd-apply` across multiple
  batches, or re-dispatching a phase after a `blocked` return).
- The count of user questions asked during the change.

This step MUST run as part of the standard archive flow (after Step 3's existing
archive-report content is composed, before the report is persisted) and MUST NOT
change the close-gate enforcement, spec-sync order, or archive-folder move already
defined for `sdd-archive`.

The exact source field(s) or event(s) used to compute re-launch and user-question
counts (e.g. `state.yaml` phase-history entries versus dedicated `phase-costs.jsonl`
events) are an implementation detail deferred to `sdd-design` for this change; this
requirement fixes only the observable content of the archive report, not the internal
aggregation mechanism.

Because the token figures are heuristic estimates (§REQ-hooks-001), the archive report
MUST label them as "estimated" rather than presenting them as exact metering.

When `.ospec/session/{change}/phase-costs.jsonl` does not exist or is empty (e.g. the
change had no dispatches recorded before this feature shipped, or was fast-tracked),
`sdd-archive` MUST still emit the Cost block, showing zero/"no data" per phase rather
than omitting the block or failing the archive.

#### Scenario: Cost block populated from phase-costs.jsonl

- GIVEN `.ospec/session/add-x/phase-costs.jsonl` contains dispatch records for phases
  `spec`, `design`, and `apply` (with `apply` dispatched twice)
- AND `state.yaml` records one user question asked during the change
- WHEN `sdd-archive` composes the archive report
- THEN the report's Cost block lists estimated tokens per phase for `spec`, `design`,
  and `apply`
- AND it reports 1 re-launch for `apply` (second dispatch of the same phase)
- AND it reports 1 user question asked
- AND all token figures are labeled as estimated

#### Scenario: No cost data available — block present but empty

- GIVEN `.ospec/session/add-x/phase-costs.jsonl` does not exist for the change being
  archived
- WHEN `sdd-archive` composes the archive report
- THEN the Cost block is still present in `archive-report.md`
- AND it indicates no per-phase cost data was recorded, rather than omitting the block
  or causing the archive to fail

#### Scenario: Cost block does not gate archive completion

- GIVEN the Cost block would show partial or missing data for some phases
- WHEN `sdd-archive` evaluates whether to proceed to the archive-folder move (Step 5)
- THEN the incompleteness of cost data MUST NOT block or fail the archive — the
  existing close-gate rules (verify verdict, warning acceptance) remain the sole
  gating conditions
