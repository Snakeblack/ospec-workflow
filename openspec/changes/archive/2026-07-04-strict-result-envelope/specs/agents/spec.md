# Delta for agents

## ADDED Requirements

### Requirement: Orchestrator Consumes Structured Envelope Fields {#REQ-agents-001}

The orchestrator's Result Contract (`agents/sdd-orchestrator.agent.md`) MUST extract
phase-return field values from the sub-agent's ```` ```json:result-envelope ```` fenced
block (skills domain, `sdd-phase-common.md` §D strict emission format) as the primary,
authoritative source — `status`, `executive_summary`, `artifacts`, `next_recommended`,
`risks`, `skill_resolution`, and any present optional fields (`blocker_type`,
`question_gate`, `assumptions`). This is additive to — not a removal of — the existing
plain-prose Result Envelope parsing behavior.

When the fence is absent, malformed, or fails schema validation, the orchestrator MUST
degrade to its pre-existing behavior: parsing the plain-prose envelope fields exactly
as it did before this change. This fallback MUST NOT block or fail the phase's
dispatch — it is a silent, fail-safe degrade, mirroring the `SubagentStop` fail-safe
contract (hooks domain).

This requirement does not alter which fields exist, their meaning, or their
requirement level (Section 6.1 baseline table) — it only changes how the orchestrator
extracts already-defined field values.

#### Scenario: Fenced envelope present — orchestrator parses fields directly

- GIVEN a phase agent's return includes a valid ```` ```json:result-envelope ```` fence
- WHEN the orchestrator processes the return
- THEN it extracts `status`, `artifacts`, `next_recommended`, etc. directly from the
  parsed JSON object, without LLM-assisted prose parsing for those fields

#### Scenario: Fence absent or invalid — fallback to prose parsing

- GIVEN a phase agent's return has no fence, or the fence fails schema validation
- WHEN the orchestrator processes the return
- THEN it falls back to parsing the plain-prose envelope exactly as before this change
- AND the phase dispatch pipeline is NOT blocked or failed because of the missing/
  invalid fence

## MODIFIED Requirements

### Requirement: SDD Phase Agent Envelope

All SDD phase agents (Section 1.2) MUST return the following fields:

| Field | Type | Requirement |
|-------|------|-------------|
| `status` | `success` \| `partial` \| `blocked` | MUST be present |
| `executive_summary` | string | MUST be present; one sentence |
| `artifacts` | list of paths | MUST be present; paths written this batch |
| `next_recommended` | string | MUST be present; next phase or action |
| `risks` | string or list | MUST be present; deviations, blockers, or "None" |
| `skill_resolution` | enum | MUST be present; see Section 6.3 |
| `question_gate` | object | MUST be present when `status: blocked` |
| `blocker_type` | enum: `needs_user_decision` \| `design-mismatch` \| `spec-change-required` \| `workload-escalation` | OPTIONAL; SHOULD be present when `status: blocked` |
| `runtime_observability` | object | OPTIONAL; hook/cache observations relevant to continuation |
| `approval_updates` | list | OPTIONAL; approval ledger entries for the orchestrator to persist |
| `assumptions` | list | OPTIONAL; entries conforming to the `assumption-ledger` domain's Assumption Entry Schema, for the orchestrator to persist into `state.yaml` |

In addition to being present as prose-adjacent envelope fields, every field in this
table MUST also be emitted inside the phase's ```` ```json:result-envelope ```` fenced
block (skills domain, strict emission format requirement), as strict, directly
parseable JSON. The fenced block is additive to, and does not replace, the existing
plain-prose presentation of these fields.

(Previously: fields were returned only as "JSON inside markdown by convention" —
prose-adjacent values the orchestrator parsed with the LLM; no fenced, schema-validated
block existed.)

Naming note: the `blocker_type` enum mixes snake_case (`needs_user_decision`) and
kebab-case (`design-mismatch`, `spec-change-required`, `workload-escalation`) for
historical reasons that predate a naming convention — do not rename existing values.
New values SHOULD use kebab-case going forward, matching the majority.

`status: partial` indicates work completed for this batch with more batches
remaining. The orchestrator relaunches the same phase.

`status: blocked` halts the pipeline until the orchestrator resolves the blocking
question through user interaction.

#### Scenario: Phase agent completes successfully — fields present in both prose and fence

- GIVEN `sdd-apply` receives a task batch from the orchestrator
- WHEN it implements all assigned tasks
- THEN it returns `status: success` with all written file paths in `artifacts`,
  `next_recommended: sdd-verify`, and `skill_resolution` reflecting how skills were
  loaded
- AND the same field values also appear inside its
  ```` ```json:result-envelope ```` fenced block as strict JSON

#### Scenario: Phase agent blocked on user input

- GIVEN `sdd-tasks` encounters a review-workload decision that exceeds the 400-line
  budget
- WHEN it cannot resolve the delivery strategy autonomously
- THEN it returns `status: blocked` with a `question_gate` object containing at least
  one question with options, and MUST NOT ask the user directly
- AND `status: "blocked"` and `question_gate` also appear inside the fenced JSON block
