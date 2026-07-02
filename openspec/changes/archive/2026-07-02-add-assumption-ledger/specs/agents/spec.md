# Delta for agents

## ADDED Requirements

### Requirement: Result Envelope Optional Assumptions Field

The SDD Phase Agent Envelope (baseline `openspec/specs/agents/spec.md` §6.1) gains
one additional OPTIONAL field, `assumptions`, alongside the existing
`approval_updates` field. This is a purely additive extension of the envelope
table; no existing field changes meaning or requirement level.

| Field | Type | Requirement |
|---|---|---|
| `assumptions` | list | OPTIONAL; entries conforming to the `assumption-ledger` domain's Assumption Entry Schema, for the orchestrator to persist into `state.yaml` |

A phase agent MUST populate `assumptions` only with entries produced under the
materiality rule defined in the `assumption-ledger` spec; it MUST NOT use this
field for blocking decisions (those go through `question_gate` instead).

#### Scenario: Phase returns assumptions made during this batch

- GIVEN `sdd-design` recorded one internal, reversible decision during its batch
- WHEN it composes its return envelope
- THEN `assumptions` contains that entry alongside the standard required fields (`status`, `executive_summary`, `artifacts`, `next_recommended`, `risks`, `skill_resolution`)

#### Scenario: Phase makes no assumptions — field omitted

- GIVEN a phase agent resolves every ambiguity by following the existing spec and design exactly
- WHEN it composes its return envelope
- THEN `assumptions` is omitted or an empty list, and the envelope remains otherwise unchanged

### Requirement: Orchestrator Assumption Ledger Protocol

The orchestrator MUST maintain an Assumption Ledger Protocol alongside its
existing Approval Ledger Protocol (`agents/sdd-orchestrator.agent.md`). On every
phase return that includes a non-empty `assumptions` field, the orchestrator
MUST read-merge-update `openspec/changes/{change-name}/state.yaml`, appending
each entry under the top-level `assumptions:` ledger per the persistence shape
defined in the `assumption-ledger` domain spec. The orchestrator MUST NOT infer
assumption entries from conversation memory; only entries explicitly returned
in a phase envelope are persisted.

The orchestrator is the sole authority for `id` uniqueness: phase agents number
`seq` only locally within their own envelope, and the orchestrator MUST
renumber/reassign the `seq` suffix of an incoming entry at persist time whenever
it would otherwise collide with an `id` already present in `state.yaml`.

This protocol MUST fire on every phase return, independent of route or gate
configuration — it is not a circumstantial handler.

#### Scenario: Orchestrator persists assumptions on every phase return

- GIVEN `sdd-apply` returns `status: success` with two `assumptions[]` entries
- WHEN the orchestrator processes the envelope
- THEN it appends both entries under `state.yaml assumptions:` before dispatching the next phase

#### Scenario: Orchestrator does not fabricate assumptions

- GIVEN a phase agent's envelope has no `assumptions` field
- WHEN the orchestrator processes the envelope
- THEN it MUST NOT add any entry to `state.yaml assumptions:` based on chat context alone

### Requirement: sdd-verify Assumption Reconciliation Duty

`sdd-verify` MUST execute the Verify Reconciliation Checklist defined in the
`assumption-ledger` domain spec as part of its standard verify pass: reading
unresolved entries from `state.yaml assumptions:`, presenting the
confirm/correct/promote-to-clarification checklist, and writing `WARNING`
findings for unresolved material (`reversibility: low`) entries into
`verify-report.md`, subject to the same `known-issues.md` write contract as
other `WARNING` findings (baseline §14, agents spec). This step runs alongside
existing verify steps and MUST NOT alter verify behavior when `assumptions:`
is empty or absent. Selecting `promote-to-clarification` only sets
`status: promoted` on the entry; `sdd-verify` MUST NOT auto-schedule or
auto-invoke `sdd-clarify` as a consequence — the user alone decides when to
re-run it.

#### Scenario: Reconciliation runs as part of standard verify

- GIVEN `state.yaml` has one unresolved `assumptions:` entry
- WHEN `sdd-verify` executes
- THEN it presents the reconciliation checklist for that entry as part of the same verify pass that runs tests/build

#### Scenario: No assumptions recorded — verify unaffected

- GIVEN `state.yaml` has no `assumptions:` block
- WHEN `sdd-verify` executes
- THEN it skips the reconciliation checklist and verify behavior is identical to the pre-assumption-ledger baseline

## Cross-References

- `openspec/changes/{change-name}/specs/assumption-ledger/spec.md`: Assumption Entry Schema, Materiality Decision Rule, State Ledger Persistence Shape, Verify Reconciliation Checklist
- `openspec/specs/agents/spec.md` §6.1: baseline Result Envelope Contract this delta extends
- `openspec/specs/agents/spec.md` §14: baseline WARNING → `known-issues.md` write contract, reused unchanged by the reconciliation duty
- `agents/sdd-orchestrator.agent.md`: existing Approval Ledger Protocol, the pattern the Assumption Ledger Protocol mirrors

## Clarifications

### Session 2026-07-02

- Q: `promote-to-clarification`: la spec lo definió como señalización de estado (`status: promoted`) sin auto-invocar la fase sdd-clarify. ¿Señalización sola, o auto-disparo de clarify? → A: Señalización sola. `sdd-verify` MUST NOT auto-programar ni auto-invocar `sdd-clarify` como consecuencia de esta resolución; el usuario decide cuándo re-ejecutarla. (Source: AskUserQuestion, 2026-07-02.)
- Q: El esquema `{phase}-{seq}` no especifica quién asigna `seq` cuando el mismo phase corre en múltiples batches o relanzamientos, arriesgando ids duplicados. ¿Quién debe garantizar la unicidad? → A: El orchestrator asigna/renumera el `seq` final al persistir en `state.yaml`; el phase agent solo numera localmente dentro de su propio envelope. (Source: AskUserQuestion, 2026-07-02.)
