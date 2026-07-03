# Ambiguity Detection Boundaries Specification

## Purpose

`sdd-clarify` resolves ambiguity between spec and design, but two other boundaries
are currently uncaptured: (a) a vague initial request, before Change Classification
ever runs, and (b) existing code contradicting the design during `sdd-apply`. This
spec defines normative behavior for both boundaries. It does NOT change `sdd-clarify`
itself and does NOT introduce a third clarify-like phase — both boundaries are
handled by the orchestrator (a) and `sdd-apply` (b) using the existing
`question_gate` / `status: blocked` machinery.

## Requirements

### Requirement: Intent Restatement Before Change Classification

Before the orchestrator classifies a change (`classifyChange`, Change Classification
step of `/sdd-new`, `/sdd-ff`, `/sdd-lite`, or an equivalent natural-language
request), it MUST evaluate whether the original request is vague.

A request MUST be classified as vague when it lacks at least ONE of:
- an identifiable target module, file, or domain, OR
- an identifiable acceptance criterion or desired outcome, OR
- an unambiguous scope boundary (what is explicitly out of scope).

When the request is vague, the orchestrator MUST restate its interpreted intent
in 2-4 lines and validate that restatement with the user via `AskUserQuestion`
(or the target-specific equivalent) BEFORE proceeding to Change Classification
or route selection. The orchestrator MUST NOT create any OpenSpec artifact as a
side effect of this restatement step alone.

When the request is NOT vague (all three elements are identifiable), the
orchestrator MUST skip this step and proceed directly to Change Classification,
exactly as in the pre-existing baseline.

This step is a single confirmation exchange, not an open-ended clarification
loop — it MUST NOT be repeated more than once per change request unless the
user's answer itself introduces new ambiguity.

#### Scenario: Vague request triggers intent restatement

- GIVEN a user request names no target module, no acceptance criterion, and no explicit scope boundary
- WHEN the orchestrator begins Change Classification
- THEN it first restates its interpreted intent in 2-4 lines via `AskUserQuestion` and waits for confirmation
- AND it does NOT proceed to Change Classification until the user confirms or corrects the restatement

#### Scenario: Specific request skips restatement

- GIVEN a user request names a target file, a concrete acceptance criterion, and an explicit out-of-scope boundary
- WHEN the orchestrator begins Change Classification
- THEN it proceeds directly to Change Classification without an intent-restatement gate

#### Scenario: User corrects the restated intent

- GIVEN the orchestrator has proposed a restated intent for a vague request
- WHEN the user selects "Not quite — let me clarify" (or equivalent) and supplies a correction
- THEN the orchestrator updates its interpreted intent accordingly before proceeding to Change Classification

#### Scenario: Restatement gate does not fabricate artifacts

- GIVEN the intent-restatement gate has fired and the user has not yet answered
- WHEN the orchestrator is awaiting the answer
- THEN it MUST NOT create any `openspec/` artifact as a side effect of having asked

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
