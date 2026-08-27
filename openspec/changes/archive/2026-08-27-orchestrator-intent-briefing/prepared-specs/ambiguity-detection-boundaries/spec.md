# Ambiguity Detection Boundaries Specification

## Purpose

`sdd-clarify` resolves ambiguity between spec and design, but two other boundaries
are currently uncaptured: (a) validating functional intent with the user before
Change Classification runs for every eligible new SDD request — whether vague or
specific — and (b) existing code contradicting the design during `sdd-apply`. This
spec defines normative behavior for both boundaries. It does NOT change `sdd-clarify`
itself and does NOT introduce a third clarify-like phase — both boundaries are
handled by the orchestrator (a) and `sdd-apply` (b) using the existing
`question_gate` / `status: blocked` machinery.

## Requirements

### Requirement: Intent Restatement Before Change Classification

Before the orchestrator classifies a change (`classifyChange`, Change Classification
step), it MUST present a functional intent briefing and obtain explicit user
acceptance. This gate MUST fire for every eligible new SDD request whether the
request is vague or specific. Eligibility and skip are:

| Request | Briefing |
|---|---|
| `/sdd-new`, `/sdd-ff`, `/sdd-lite`, or an equivalent natural-language request | MUST fire |
| `/sdd-continue` | MUST skip |
| A subsequent phase of a change that already has an accepted intent briefing | MUST skip |
| Work excluded by the Ambient SDD Awareness Gate (single-file cosmetic change) | MUST skip |

The orchestrator MUST synthesize a short (2–4 line) briefing in user-readable
functional language covering what was understood and what will be done. The briefing
SHOULD name target, outcome, and scope when identifiable; absence of those elements
MUST NOT skip the gate. The briefing MUST NOT present internal SDD phase identifiers
(`sdd-propose`, `sdd-spec`, `sdd-design`, `sdd-tasks`, `sdd-apply`, `sdd-verify`,
`sdd-archive`) as the user-facing plan. Golden evals MUST NOT assert briefing wording;
prompt and contract tests MAY pin this prohibition as a CORE landmark.

The orchestrator MUST validate the briefing via `AskUserQuestion` (or the
target-specific equivalent) BEFORE Change Classification, route selection, or creating
`openspec/changes/{name}/`. It MUST NOT create any OpenSpec artifact as a side effect
of the briefing step alone.

The user MAY accept, correct, or abort. Each correction MUST cause a fresh synthesis.
The orchestrator MUST allow at most 2 correction rounds. After the second correction
it MUST offer only confirm-last-synthesis or abort; it MUST NOT offer another
correction and MUST NOT proceed silently.

On accept, the orchestrator MUST persist the agreed intent, THEN classify and route.
On abort, it MUST NOT create change artifacts and MUST NOT classify.

This gate is orchestrator CORE human projection. It MUST NOT become a new phase
agent, `sdd-brief` command, or kernel authority surface. It MUST NOT change the
`sdd-apply` `design-mismatch` blocker.
(Previously: fired only when the request was vague; single confirmation exchange;
specific requests skipped straight to classification.)

#### Scenario: Vague request triggers intent briefing

- GIVEN a user request names no target module, no acceptance criterion, and no explicit scope boundary
- AND the request is `/sdd-new`, `/sdd-ff`, `/sdd-lite`, or an equivalent natural-language request
- WHEN the orchestrator begins Change Classification
- THEN it first presents a functional intent briefing via `AskUserQuestion` and waits
- AND it does NOT proceed to Change Classification until the user accepts, corrects, or aborts

#### Scenario: Specific request also triggers intent briefing

- GIVEN a user request names a target file, a concrete acceptance criterion, and an explicit out-of-scope boundary
- AND the request is `/sdd-new`, `/sdd-ff`, `/sdd-lite`, or an equivalent natural-language request
- WHEN the orchestrator begins Change Classification
- THEN it presents a functional intent briefing via `AskUserQuestion` before `classifyChange`
- AND it MUST NOT skip the briefing because the request is specific

#### Scenario: User corrects the restated intent

- GIVEN the orchestrator has presented an intent briefing for an eligible request
- AND fewer than 2 correction rounds have been consumed
- WHEN the user selects a correction option and supplies a correction
- THEN the orchestrator MUST re-synthesize the briefing from the correction
- AND it MUST NOT classify until the user later accepts or aborts

#### Scenario: Restatement gate does not fabricate artifacts

- GIVEN the intent-briefing gate has fired and the user has not yet answered
- WHEN the orchestrator is awaiting the answer
- THEN it MUST NOT create any `openspec/` artifact as a side effect of having asked

#### Scenario: Continue skips briefing

- GIVEN an existing non-terminal OpenSpec change
- WHEN the user invokes `/sdd-continue`
- THEN the orchestrator MUST NOT present a new intent briefing
- AND it MUST proceed with the continue flow

#### Scenario: Later phase of an accepted change skips briefing

- GIVEN a change already has an accepted intent-briefing approval in `state.yaml`
- WHEN the user invokes a subsequent phase (`/sdd-spec`, `/sdd-design`, `/sdd-apply`, or equivalent)
- THEN the orchestrator MUST NOT present a new intent briefing

#### Scenario: Ambient-excluded cosmetic work skips briefing

- GIVEN the request is a single-file cosmetic change as defined by the Ambient SDD Awareness Gate
- WHEN the orchestrator evaluates whether to brief
- THEN it MUST NOT present an intent briefing for that request

#### Scenario: After two correction rounds confirm last synthesis or abort

- GIVEN the user has already supplied 2 corrections and the orchestrator has re-synthesized after the second
- WHEN the orchestrator presents the next gate
- THEN that gate MUST offer exactly two options: confirm the last synthesis, or abort
- AND it MUST NOT offer another free-form correction
- AND it MUST NOT call `classifyChange` until the user confirms or aborts

#### Scenario: Accept persists agreed intent then classifies

- GIVEN the orchestrator has presented an intent briefing
- WHEN the user accepts (on the initial briefing or by confirming the last synthesis)
- THEN the orchestrator MUST persist the agreed intent in the change `state.yaml` approval ledger
- AND only afterwards MUST it run Change Classification and route selection

#### Scenario: Abort creates no change artifacts

- GIVEN the intent-briefing gate has fired
- WHEN the user aborts (on the initial briefing or after the correction cap)
- THEN the orchestrator MUST NOT create `openspec/changes/{name}/`
- AND it MUST NOT call `classifyChange`

### Requirement: sdd-apply design-mismatch Blocker

When `sdd-apply`, while implementing an assigned task, discovers that the
existing codebase contradicts the design (e.g., the design assumes an API
shape, module, or dependency that does not exist or behaves differently in the
actual codebase, or the design's approach is incompatible with an established
existing pattern), it MUST NOT improvise a workaround to reconcile the
contradiction on its own judgment. It MUST return `status: blocked` with
`blocker_type: design-mismatch`, describing the concrete contradiction and
citing the affected `design.md` section.

Upon receiving an envelope with `blocker_type: design-mismatch`, the
orchestrator MUST route back to `sdd-design` (not `sdd-clarify`, not silent
retry of `sdd-apply`) so the design can be corrected before implementation
resumes.

A deviation that does NOT contradict the design's intent — e.g., a cosmetic
naming difference, or an equivalent existing helper that fulfills the same
contract the design describes — is NOT a `design-mismatch` and MUST NOT block
`sdd-apply`; the phase agent proceeds using the existing code.

#### Scenario: Existing code contradicts the design — apply blocks and routes to design

- GIVEN `sdd-apply` is implementing a task whose design section assumes a REST endpoint
- AND the actual codebase only exposes an equivalent capability via a message queue with a different contract
- WHEN `sdd-apply` detects this contradiction
- THEN it returns `status: blocked` with `blocker_type: design-mismatch`, naming the contradiction and the affected design section
- AND the orchestrator routes the change back to `sdd-design` before resuming `sdd-apply`

#### Scenario: Cosmetic deviation — not a design-mismatch

- GIVEN the design describes a helper function by one name
- AND the codebase already has an equivalent helper under a different name with the same contract
- WHEN `sdd-apply` encounters this difference
- THEN it is NOT a `design-mismatch`; `sdd-apply` proceeds using the existing helper without blocking

#### Scenario: sdd-apply does not improvise around a real contradiction

- GIVEN `sdd-apply` detects that a required dependency assumed by the design does not exist in the codebase
- WHEN `sdd-apply` evaluates how to proceed
- THEN it MUST NOT invent a workaround dependency or silently reinterpret the design
- AND it MUST return `status: blocked` with `blocker_type: design-mismatch` instead

## Cross-References

- `skills/_shared/sdd-phase-common.md` — Blocking Question Envelope (`status: blocked`, `blocker_type`, `question_gate`)
- `openspec/specs/agents/spec.md` Section 1 (Change Classification), Section 4.3 (Blocking Question Flow), Section 6.1 (envelope contract) — where these obligations are anchored for the orchestrator and `sdd-apply`
- `skills/sdd-clarify/SKILL.md` — the existing mid-pipeline (spec↔design) ambiguity phase; unchanged by this spec
