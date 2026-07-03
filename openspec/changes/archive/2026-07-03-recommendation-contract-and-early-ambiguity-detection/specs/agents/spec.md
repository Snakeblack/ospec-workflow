# Delta for agents

## ADDED Requirements

### Requirement: question_gate Recommendation Contract Compliance

Every SDD phase agent (Section 1.2, baseline `openspec/specs/agents/spec.md`)
that returns `status: blocked` with a `question_gate` (Section 4.3, 6.1) MUST
compose that `question_gate` in compliance with the `recommendation-contract`
domain spec: any option marked `recommended: true` MUST carry a `description`
covering rationale, trade-off, and reversibility, and the gate's `reason` MUST
state the cost of an incorrect or guessed decision. This requirement does not
change the envelope's field names or nesting (Section 6.1 table is unchanged);
it constrains the CONTENT of `description` and `reason` when present.

This requirement applies uniformly to every phase agent's `question_gate`
usage, including the orchestrator's own Ambient SDD Awareness gate (Section 1)
and the review-workload gate (Scenario 9.2) — no phase is exempt.

#### Scenario: Phase agent's recommended option is contract-compliant

- GIVEN `sdd-tasks` returns `status: blocked` with a `question_gate` recommending "chained PRs"
- WHEN it composes the recommended option's `description`
- THEN the description states the rationale for chaining, the trade-off versus a single large PR, and whether the choice is reversible
- AND the `reason` field states the cost of proceeding with the wrong delivery strategy

#### Scenario: Existing envelope shape unaffected

- GIVEN a phase agent's `question_gate` already conforms to the Section 6.1 field table (status, questions, options, reason)
- WHEN this requirement is applied
- THEN no field is added, removed, or renamed in the envelope; only the textual content of `description` and `reason` is constrained

### Requirement: Orchestrator Intent Restatement in Change Classification

The orchestrator's Change Classification step (Section 1, referenced as part of
the CORE zone in Section 15) MUST comply with the `ambiguity-detection-boundaries`
domain spec's Intent Restatement requirement: when the original user request is
vague per that spec's criteria, the orchestrator MUST restate its interpreted
intent and validate it via `AskUserQuestion` (or target equivalent) BEFORE
performing Change Classification or route selection. This step precedes, and is
independent of, the `confidence: advisory` route-confirmation gate already
defined in the orchestrator's Route Selection procedure — a request can require
intent restatement even when route confidence later turns out to be
`deterministic`.

Because this step runs before Change Classification and route selection, it
MUST reside in the orchestrator's CORE zone (Section 15) alongside the SDD Init
Guard and Ambient SDD Awareness gate, and MUST NOT be relocated to a
circumstantial `skills/_shared/` handler.

#### Scenario: Vague request restated before classification

- GIVEN a user request lacks an identifiable target module, acceptance criterion, and scope boundary (per `ambiguity-detection-boundaries`)
- WHEN the orchestrator begins processing `/sdd-new` (or equivalent)
- THEN it restates its interpreted intent and validates it via `AskUserQuestion` before calling `classifyChange`

#### Scenario: Specific request — classification proceeds unchanged

- GIVEN a user request already identifies its target, acceptance criterion, and scope boundary
- WHEN the orchestrator begins processing the request
- THEN it proceeds directly to `classifyChange` exactly as in the pre-existing baseline, with no additional gate

### Requirement: sdd-apply design-mismatch Blocker Type

The `sdd-apply` phase agent (Section 1.2) MUST support `blocker_type:
design-mismatch` as a value of the `question_gate`/`status: blocked` contract
(Section 4.3, 6.1), per the `ambiguity-detection-boundaries` domain spec:
when existing code contradicts the design during implementation, `sdd-apply`
MUST return `status: blocked` with `blocker_type: design-mismatch` instead of
improvising a workaround.

Upon receiving `blocker_type: design-mismatch`, the orchestrator MUST route the
change back to `sdd-design` (Section 1.2) before resuming `sdd-apply`, updating
`state.yaml` per Section C of `skills/_shared/sdd-phase-common.md` (top-level
`status: blocked`, blocking question/reason recorded).

This blocker type is additive alongside the existing `spec-change-required`
blocker pattern already used by `sdd-apply` (`skills/sdd-apply/SKILL.md`); it
does not replace or narrow that existing behavior — `spec-change-required`
covers a wrong/contradictory spec, while `design-mismatch` covers a design that
contradicts the actual codebase.

#### Scenario: Design-mismatch routes back to sdd-design

- GIVEN `sdd-apply` finds that the design assumes a dependency that does not exist in the codebase
- WHEN `sdd-apply` returns `status: blocked` with `blocker_type: design-mismatch`
- THEN the orchestrator routes the change back to `sdd-design` and does not resume `sdd-apply` until a revised design is produced

#### Scenario: spec-change-required remains a distinct blocker path

- GIVEN `sdd-apply` determines the spec itself (not the design-vs-code relationship) is wrong or impossible to verify
- WHEN it returns `blocked: spec-change-required`
- THEN this is handled as before this change and is NOT reclassified as `design-mismatch`

### Requirement: blocker_type Enum Field Formalization

`blocker_type` MUST be formalized as a documented enum field in both envelope
field tables that currently describe the `status: blocked` return shape:
`openspec/specs/agents/spec.md` Section 6.1, and `skills/_shared/sdd-phase-common.md`
Section D (Return Envelope). Today `blocker_type` appears only inside JSON
examples in both documents; neither field table lists it as a formal field
with an enum of known values.

The formal field entry MUST document, at minimum, the following known values
— each already used elsewhere in this change or the pre-existing baseline —
plus any additional value a phase agent is observed to emit:

- `needs_user_decision` — a phase blocked on a clarify-style question (baseline
  example in `sdd-phase-common.md` Section D and `skills/sdd-clarify/SKILL.md`).
- `design-mismatch` — `sdd-apply` finds the codebase contradicts the design
  (added by this change; Requirement: sdd-apply design-mismatch Blocker Type,
  above).
- `spec-change-required` — the spec itself is wrong, contradictory, or
  unverifiable (pre-existing `sdd-apply` behavior per `skills/sdd-apply/SKILL.md`).
- `workload-escalation` — actual apply work overruns the tasks forecast beyond
  the safe threshold (pre-existing `sdd-apply` behavior per
  `skills/sdd-apply/SKILL.md`).

This is design/implementation guidance carried forward from the clarify phase:
`sdd-design` and `sdd-apply` for this change MUST treat the two field-table
edits above as in-scope documentation deliverables of this change, even though
no new runtime code is introduced by formalizing the field.

#### Scenario: blocker_type documented as enum in both tables

- GIVEN this change is implemented
- WHEN a reader consults Section 6.1 of `openspec/specs/agents/spec.md` or
  Section D of `skills/_shared/sdd-phase-common.md`
- THEN `blocker_type` appears as a named field in the field table with an enum
  listing at least `needs_user_decision`, `design-mismatch`,
  `spec-change-required`, and `workload-escalation`

#### Scenario: New blocker_type value requires table update

- GIVEN a future phase agent needs to emit a `blocker_type` value not yet
  listed in either field table
- WHEN that phase agent's change is proposed
- THEN the proposal MUST update both field tables' enum lists as part of its
  scope, keeping `agents/spec.md` Section 6.1 and `sdd-phase-common.md`
  Section D in sync

## Cross-References

- `openspec/changes/recommendation-contract-and-early-ambiguity-detection/specs/recommendation-contract/spec.md`
- `openspec/changes/recommendation-contract-and-early-ambiguity-detection/specs/ambiguity-detection-boundaries/spec.md`
