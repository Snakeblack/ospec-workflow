# Delta for agents

## MODIFIED Requirements

### Requirement: sdd-archive Cost Block in Archive Report {#REQ-agents-001}

`sdd-archive`'s archive report (`archive-report.md`, per `skills/sdd-archive/SKILL.md`
Step 3) MUST include a `Cost` block reporting, per completed change and grouped by
`phase`:
- The number of dispatch invocations.
- The number of re-launches.
- The summed `duration_ms`.
- The observed model tier(s) and status value(s), including `unknown` when unavailable.
- Independent sums of `estimated_prompt_tokens`, `estimated_artifact_tokens`,
  `estimated_tool_output_tokens`, and `estimated_output_tokens`.
- The total user questions asked during the change.

The four token figures MUST be labeled `estimated`; they are heuristic estimates and
MUST NOT be presented as exact metering or billing. For compatibility, a parseable C3
row containing `est_tokens` MUST contribute that value to the phase's estimated output
tokens, while its missing categories, duration, tier, status, and relaunch metadata
MUST use the documented zero/`unknown` fallbacks. Other missing fields in a parseable
row MUST NOT make archive fail. Malformed JSONL lines MAY be ignored, but MUST NOT
prevent the Cost block from being emitted.

The Cost block MUST include only phases with at least one parseable row in
`.ospec/session/{change}/phase-costs.jsonl`. If no parseable rows exist, it MUST
include an explicit `no-data` indication and MUST NOT invent per-phase rows. The
total user-question count MUST be the sum of numeric `questions_asked` values under
`state.yaml`'s `gates.*` entries; an absent or invalid counter contributes zero.

This step MUST run as part of the standard archive flow after the existing report
content is composed and before the report is persisted. It MUST NOT change close-gate
enforcement, spec-sync order, or the archive-folder move already defined for
`sdd-archive`.

When `.ospec/session/{change}/phase-costs.jsonl` does not exist, is empty, or contains
no parseable JSON lines, `sdd-archive` MUST still emit the Cost block with zero/"no
data" per phase rather than omitting it or failing the archive. Cost data
incompleteness MUST NOT gate archive completion; the existing verify and warning
acceptance rules remain the sole close gates.

(Previously: the Cost block aggregated one `est_tokens` total per phase and reported
re-launches and questions, without separate token categories, duration, tier, status,
or compatibility rules for incomplete/C3 rows.)

#### Scenario: Cost block populated with separated dispatch metrics

- GIVEN `phase-costs.jsonl` contains records for `spec`, `design`, and `apply`, with `apply` dispatched twice
- AND the records contain separated token estimates, durations, tiers, statuses, and one `relaunch: true` row for `apply`
- AND `state.yaml` records one user question asked during the change
- WHEN `sdd-archive` composes the archive report
- THEN the Cost block lists invocations, re-launches, summed duration, observed tier/status, and all four estimated token sums for each phase
- AND it reports 1 re-launch for `apply`, 1 user question, and labels every token figure as estimated

#### Scenario: Legacy or incomplete rows are aggregated without failure

- GIVEN the JSONL contains a C3 row with `est_tokens: 2400` and a newer row missing one or more optional fields
- WHEN `sdd-archive` composes the archive report
- THEN the C3 value appears in the phase's estimated output-token sum, missing new categories/duration appear as zero or no data, and unavailable tier/status appears as `unknown`
- AND the report is persisted without a parsing or aggregation failure

#### Scenario: No cost data available — block present but empty

- GIVEN `.ospec/session/add-x/phase-costs.jsonl` does not exist for the change being archived
- WHEN `sdd-archive` composes the archive report
- THEN the Cost block is still present in `archive-report.md` and indicates no per-phase cost data was recorded
- AND the archive continues with the existing user-question count or zero when that count is absent

#### Scenario: Cost block does not gate archive completion

- GIVEN the Cost block would show partial, malformed, or missing data for some phases
- WHEN `sdd-archive` evaluates whether to proceed to the archive-folder move (Step 5)
- THEN the incompleteness of cost data MUST NOT block or fail the archive; existing close-gate rules remain the sole gating conditions

## Clarifications

### Session 2026-07-11

- Q: ¿Qué contrato de agregación debe fijar `Cost` para fases sin filas y el total de preguntas? → A: `Cost` incluye sólo fases con filas parseables, muestra `no-data` si no hay ninguna y suma las preguntas desde `gates.*.questions_asked`, conservando los fallbacks legacy.

---
