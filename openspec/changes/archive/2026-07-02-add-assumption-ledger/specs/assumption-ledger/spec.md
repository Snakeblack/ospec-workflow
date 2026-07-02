# Assumption Ledger Specification

## Purpose

Phase executors routinely resolve small, non-blocking ambiguities (naming, defaults,
validation order, thresholds) using judgment, without leaving a trace. This spec
defines the `assumptions[]` schema, the materiality rule that decides whether a
decision may be silently assumed or MUST instead block on `question_gate`, the
`state.yaml` ledger persistence shape, and the `sdd-verify` reconciliation checklist
that reviews accumulated assumptions. It turns silent micro-decisions into an
auditable trail, mirroring the existing Approval Ledger pattern.

## Requirements

### Requirement: Assumption Entry Schema

Every assumption recorded by a phase executor MUST be an object with exactly the
following fields.

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique within the change, format `{phase}-{seq}` (e.g. `sdd-design-001`). The phase agent assigns `seq` only locally within its own return envelope (e.g. `001`, `002`, … starting fresh each batch); the orchestrator is the sole authority for cross-batch uniqueness (see State Ledger Persistence Shape) |
| `phase` | string | SDD phase name that authored the assumption (e.g. `sdd-design`) |
| `statement` | string | One-sentence description of the decision taken |
| `reversibility` | enum `low` \| `high` | `low` = costly/hard to undo later (material); `high` = cheap/easy to undo (non-material) |
| `basis` | string | Rationale: the convention, existing pattern, or evidence that justified the decision |

An entry MUST NOT be recorded with any field missing or empty.

#### Scenario: Complete entry recorded

- GIVEN `sdd-design` resolves a non-blocking naming decision for an internal helper
- WHEN it composes its return envelope
- THEN the `assumptions[]` entry includes `id`, `phase`, `statement`, `reversibility`, and `basis`, all non-empty

#### Scenario: Incomplete entry rejected

- GIVEN a phase executor drafts an assumption entry missing `basis`
- WHEN it validates the entry before returning
- THEN it MUST NOT include that entry in `assumptions[]` until `basis` is filled in

### Requirement: Materiality Decision Rule

When a phase executor encounters an ambiguity not already resolved by the spec or
design artifacts, it MUST apply the following rule before proceeding:

1. IF the decision affects observable behavior or a public contract (API shape, CLI
   flag, file format, envelope field) AND it is not addressed by the existing spec
   or design, THEN the executor MUST NOT assume; it MUST return `status: blocked`
   with a `question_gate` describing the decision.
2. ELSE (the decision is internal-only — implementation detail with no external
   observable effect, or is already covered by spec/design) the executor MUST
   proceed, recording one `assumptions[]` entry with `reversibility` set honestly
   (`low` if reverting later would be costly, `high` if trivial to revert).

Reversibility is the materiality signal consumed by the verify checklist (see
Verify Reconciliation Checklist below): `reversibility: low` entries are material;
`reversibility: high` entries are non-material.

This is the definitive policy: only observable-behavior or public-contract impact
triggers `question_gate`. An internal decision NEVER blocks the executing phase,
regardless of its `reversibility` value — `reversibility: low` solely determines
whether the recorded entry escalates as a material WARNING candidate later, during
the `sdd-verify` reconciliation pass, not whether the phase blocks today.

#### Scenario: Observable-behavior decision — blocks instead of assuming

- GIVEN `sdd-design` must decide the shape of a new public CLI flag not described in the spec
- WHEN it evaluates the materiality rule
- THEN it MUST return `status: blocked` with `question_gate` and MUST NOT record an assumption

#### Scenario: Internal reversible decision — assumed and recorded

- GIVEN `sdd-apply` must pick an internal variable name not specified anywhere
- WHEN it evaluates the materiality rule
- THEN it MUST proceed without blocking and MUST record an `assumptions[]` entry with `reversibility: high`

#### Scenario: Internal but costly-to-reverse decision — assumed, flagged material

- GIVEN `sdd-design` picks an internal data-layout decision that would require a migration to change later, with no external observable effect
- WHEN it evaluates the materiality rule
- THEN it MUST proceed without blocking and MUST record an `assumptions[]` entry with `reversibility: low`

### Requirement: State Ledger Persistence Shape

The orchestrator MUST persist every returned `assumptions[]` entry into
`openspec/changes/{change-name}/state.yaml` under a top-level `assumptions:` list,
mirroring the existing `approvals:` ledger shape and append/read-merge-update
semantics (never overwrite prior entries).

The orchestrator alone guarantees `id` uniqueness across the full change: phase
agents number `seq` only locally within their own envelope, so the orchestrator
MUST renumber/reassign the `seq` suffix of an incoming entry at persist time
whenever appending it as-is would collide with an `id` already present in
`state.yaml`.

```yaml
assumptions:
  - id: sdd-design-001
    phase: sdd-design
    statement: "Use camelCase for the internal cache key."
    reversibility: high
    basis: "Matches existing cache-key convention in scripts/lib/cache.js."
    recorded_at: "2026-07-02T00:00:00Z"
    status: unresolved        # unresolved | confirmed | corrected | promoted
    resolution:               # present only once resolved by sdd-verify
      action: confirm         # confirm | correct | promote-to-clarification
      note: "Confirmed correct during verify."
      resolved_at: "2026-07-02T01:00:00Z"
```

#### Scenario: New assumption appended without disturbing prior entries

- GIVEN `state.yaml` already has two entries under `assumptions:`
- WHEN the orchestrator receives a phase envelope with one new `assumptions[]` entry
- THEN it appends the new entry and leaves the two existing entries unchanged

#### Scenario: No assumptions returned — ledger untouched

- GIVEN a phase envelope has no `assumptions[]` field or an empty list
- WHEN the orchestrator persists the phase result
- THEN it MUST NOT modify the `assumptions:` block in `state.yaml`

### Requirement: Verify Reconciliation Checklist

`sdd-verify` MUST re-present every `assumptions:` entry with `status: unresolved`
as a checklist grouped by `reversibility`, offering exactly three resolution
actions per entry: `confirm` (assumption was correct), `correct` (assumption was
wrong; a correction note is recorded), or `promote-to-clarification` (flag the
entry for a future `sdd-clarify` pass; promotion does not auto-invoke `sdd-clarify`).
`promote-to-clarification` MUST only set `status: promoted` on the entry; the user
alone decides when (or whether) to re-run `sdd-clarify`, and neither `sdd-verify`
nor the orchestrator may auto-schedule or auto-invoke it as a consequence of this
resolution.

Any entry with `reversibility: low` that remains `unresolved` after the checklist
pass MUST produce a `WARNING` finding in `verify-report.md`, subject to the same
`known-issues.md` write contract as other `WARNING` findings. Entries with
`reversibility: high` that remain unresolved MUST NOT escalate to a finding.

#### Scenario: Material assumption left unresolved — WARNING finding

- GIVEN `state.yaml` has an unresolved entry with `reversibility: low`
- WHEN `sdd-verify` runs the reconciliation checklist and the user does not resolve it
- THEN `sdd-verify` records a `WARNING` finding referencing that assumption's `id`

#### Scenario: Assumption confirmed — status updated, no finding

- GIVEN an unresolved entry is presented in the checklist
- WHEN the user selects `confirm`
- THEN `sdd-verify` sets `status: confirmed` with `resolution.action: confirm` and does not raise a finding

#### Scenario: Non-material assumption left unresolved — no escalation

- GIVEN `state.yaml` has an unresolved entry with `reversibility: high`
- WHEN the checklist pass completes without user action on that entry
- THEN `sdd-verify` MUST NOT raise a finding for it

## Cross-References

- `skills/_shared/sdd-phase-common.md` §D: Return Envelope, hosts `assumptions[]` field
- `openspec/specs/agents/spec.md` §6.1: Result Envelope Contract; §14: WARNING → `known-issues.md` write contract
- `agents/sdd-orchestrator.agent.md`: Approval Ledger Protocol (persistence pattern mirrored here)

## Clarifications

### Session 2026-07-02

- Q: "Interno + baja reversibilidad": la spec resolvió que se asume igual (no bloquea) pero se registra con `reversibility: low` y eso lo marca como material para el checklist de verify. ¿Es la política correcta, o interno+low-reversibility debería bloquear con question_gate? → A: Sí, es la política correcta. Solo el impacto en comportamiento observable o contrato público bloquea con `question_gate`; una decisión interna nunca bloquea, sin importar su `reversibility` — `reversibility: low` únicamente determina si la entrada escala como candidata material de WARNING durante la reconciliación de `sdd-verify`. (Source: AskUserQuestion, 2026-07-02.)
- Q: `promote-to-clarification`: la spec lo definió como señalización de estado (`status: promoted`) sin auto-invocar la fase sdd-clarify. ¿Señalización sola, o auto-disparo de clarify? → A: Señalización sola. `status: promoted` es el único efecto; el usuario decide cuándo (o si) volver a ejecutar `sdd-clarify`, y ni `sdd-verify` ni el orchestrator pueden auto-programarlo o auto-invocarlo como consecuencia de esta resolución. (Source: AskUserQuestion, 2026-07-02.)
- Q: El esquema `{phase}-{seq}` no especifica quién asigna `seq` cuando el mismo phase corre en múltiples batches o relanzamientos, arriesgando ids duplicados. ¿Quién debe garantizar la unicidad? → A: El orchestrator asigna/renumera el `seq` final al persistir en `state.yaml`; el phase agent solo numera localmente dentro de su propio envelope. (Source: AskUserQuestion, 2026-07-02.)
