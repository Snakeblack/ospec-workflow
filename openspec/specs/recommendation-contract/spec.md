# Recommendation Contract Specification

## Purpose

`question_gate` payloads (per the Blocking Question Envelope in
`skills/_shared/sdd-phase-common.md`) allow marking an option `recommended: true`,
but nothing currently forces the phase agent to justify that recommendation. This
spec defines the mandatory content shape of a recommended option's `description`
and of the gate's `reason`, so a recommendation always reads like a senior's
judgment call — never a bare label.

This spec governs content shape only. It does NOT introduce automated linting of
that shape (see `E3`, out of scope for this change) and does NOT change the
envelope's JSON structure (field names, nesting) beyond requiring `description`
to be non-empty when `recommended: true` is present.

## Requirements

### Requirement: Recommended Option Description Contract

This requirement is scoped exclusively to `question_gate.questions[].options[]`
entries. The legacy `next_question` field is plain text with no `options` or
`recommended` substructure, so it has nothing for this contract to attach to;
extending `next_question` with such a structure is out of scope for this change
(no new runtime code is introduced — see Purpose above).

Any `question_gate.questions[].options[]` entry that sets `recommended: true`
MUST carry a non-empty `description` field that addresses all three of the
following elements, in any order but each identifiable in the text:

1. A 1-line rationale for why this option is the recommended one.
2. The main trade-off versus the leading alternative option(s) in the same
   question.
3. An explicit statement of the decision's reversibility — whether choosing
   this option is easily reversible later, costly to reverse, or effectively
   irreversible.

An option MUST NOT be marked `recommended: true` with an empty, missing, or
single-clause `description` that omits any of the three elements.

#### Scenario: Recommended option carries full rationale

- GIVEN a phase agent constructs a `question_gate` with one option marked `recommended: true`
- WHEN it composes that option's `description`
- THEN the description states why the option is recommended, its trade-off against the alternative, and whether the decision is reversible

#### Scenario: Non-recommended option — contract does not apply

- GIVEN a `question_gate` option has no `recommended` field or `recommended: false`
- WHEN the phase agent composes the option
- THEN this requirement does not apply to that option; a bare `label` is sufficient

#### Scenario: Legacy next_question field — out of scope

- GIVEN a phase agent returns the legacy plain-text `next_question` field instead of a structured `question_gate`
- WHEN this requirement is applied
- THEN it does not apply, because `next_question` has no `options`/`recommended` substructure for the contract to constrain; phase agents SHOULD prefer `question_gate` when a recommendation needs to be justified

#### Scenario: Recommended option missing an element — non-compliant

- GIVEN a phase agent marks an option `recommended: true`
- AND its `description` states only the rationale, omitting trade-off and reversibility
- WHEN the envelope is validated against this requirement
- THEN the option is non-compliant and the phase agent MUST revise the `description` before returning the envelope

### Requirement: Gate Reason Cost-of-Wrong-Decision Statement

Every `question_gate.reason` field MUST state, in addition to why the answer is
required, the cost of the user choosing incorrectly or of the decision being
guessed instead of confirmed — what breaks, what has to be redone, or what risk
is introduced.

A `reason` that only restates "this decision is needed to continue" without
naming a concrete cost of a wrong choice does not satisfy this requirement.

#### Scenario: Reason states concrete cost

- GIVEN a phase agent returns `status: blocked` with a `question_gate`
- WHEN it composes the `reason` field
- THEN the reason names both why the decision is needed now and the concrete cost of an incorrect or guessed choice

#### Scenario: Reason omits cost — non-compliant

- GIVEN a `question_gate.reason` reads only "Required to proceed with the next phase."
- WHEN this requirement is applied
- THEN the reason is non-compliant because it does not state the cost of getting the decision wrong

### Requirement: Multiple Recommended Options Each Satisfy the Contract Independently

When a single question exceptionally carries more than one `recommended: true`
option (e.g., a `multiSelect` gate recommending a combination), each such option
MUST independently satisfy the Recommended Option Description Contract; the
contract MUST NOT be satisfied once and treated as covering the whole question.

#### Scenario: multiSelect gate with two recommended options

- GIVEN a `multiSelect` question marks two options `recommended: true`
- WHEN the phase agent composes both option descriptions
- THEN each of the two descriptions independently states its own rationale, trade-off, and reversibility

#### Scenario: Single recommended option in a single-select gate — baseline case

- GIVEN a non-`multiSelect` question with exactly one `recommended: true` option
- WHEN the phase agent composes the envelope
- THEN only that one option is subject to the contract, and the remaining options need only a `label`

## Cross-References

- `skills/_shared/sdd-phase-common.md` — Blocking Question Envelope shape (`question_gate`, options, `reason`)
- `openspec/specs/agents/spec.md` Section 4.3 / 6.1 — where the envelope and `blocked` contract are normatively anchored for phase agents
- `openspec/specs/ambiguity-detection-boundaries/spec.md` — Requirement: sdd-apply design-mismatch Blocker (carries the `blocker_type` documentation obligation)

## Clarifications

### Session 2026-07-03

- Q: Should this change formally add `blocker_type` as a documented enum field in the envelope tables (agents/spec.md Section 6.1 and sdd-phase-common.md Section D), given `design-mismatch` is a new value layered on an already-undocumented field? → A: Sí, formalizar en ambas tablas.
- Q: Does the recommendation-contract requirement's "legacy next_question equivalent" parenthetical mean next_question must gain an options/recommended structure, or should that parenthetical be dropped since next_question is plain text today? → A: Acotar a question_gate.options[]; eliminar/acotar cualquier redacción que implique que el requisito también aplica al campo de texto plano legacy next_question, ya que no tiene subestructura recommended/options y extenderlo está fuera de alcance para este cambio (sin código runtime nuevo, según la propuesta).
