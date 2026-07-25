# Delta for routing

## MODIFIED Requirements

### Requirement: Frozen Review Genesis and Slice-Scoped Targeted Correction {#REQ-routing-004}

The gate MUST freeze its deterministic candidate identity, genesis paths, classification, selected dimensions, initial evidence, immutable finding IDs, and the lineage authority before specialist execution. It MUST derive a stable, versioned set of root-cause correction slices from the frozen blocking finding IDs and their frozen evidence. Each slice MUST own exactly its frozen finding IDs, permitted genesis paths, bounded changed-line allowance, at most three failed validations, correction history, and resolution state; its allowance and attempt count MUST NOT grow or reset inside that slice.

Targeted validation MUST dispatch and decide only the active slice. A passed slice and every finding it resolves MUST remain resolved when another slice fails. A validation MAY invalidate an already passed slice only when it records a genuine correction-caused regression against that slice's frozen finding IDs or permitted paths; it MUST identify every explicitly impacted slice and MUST NOT reopen unrelated passed slices. Validation MUST NOT perform general discovery, add blocking finding IDs, select another dimension, expand genesis paths, or allocate reviewer authority. Unrelated late observations MUST remain non-blocking follow-ups.

Pending correction mutation, exact path validation, candidate identity, genesis, selected dimensions, one-shot reviewer execution, frozen findings, and reconciliation requirements MUST remain immutable and fail closed. A successor MUST NOT be created merely because a slice fails or exhausts its allowance; it is reserved for an explicitly approved new candidate lineage, scope, or discovery authority.

(Previously: the lineage held one shared bounded changed-line allowance and three failed correction attempts for all frozen findings.)

#### Scenario: Independent slice resolution is monotonic

- GIVEN slices `provenance` and `policy` have distinct frozen finding IDs and `provenance` is resolved
- WHEN targeted validation fails the active `policy` slice
- THEN `provenance` and its resolved findings MUST remain resolved
- AND only `policy` MAY consume its attempt or line allowance

#### Scenario: Genuine cross-slice regression is explicit

- GIVEN a passed slice has frozen finding `F-001` on a permitted path
- WHEN a later correction causes a regression that evidence attributes to `F-001`
- THEN validation MAY invalidate that slice and MUST record it as explicitly impacted
- AND it MUST NOT invalidate any slice without that regression evidence

#### Scenario: Correction escapes genesis

- GIVEN a proposed correction changes a path outside the active slice's frozen permitted paths
- WHEN the gate validates the attempt
- THEN the attempt MUST fail or enter reconciliation without expanding the lineage
- AND candidate, genesis, dimensions, findings, and all slice budgets MUST remain immutable

### Requirement: Read-Only Gate Continuation, Migration, and Interruption Recovery {#REQ-routing-005}

Status, verification, delivery, and archive gates after lineage creation MUST revalidate the same candidate identity and persisted lineage state. They MUST be read-only with respect to reviewer selection, frozen findings, and slice budgets. If execution is interrupted, a mutation outcome is ambiguous, or a pending mutation exists, the orchestrator MUST reconcile persisted state before continuing and MUST NOT launch a reviewer, validator, correction, slice, or successor while the prior outcome remains unknown.

An active schema-v1 lineage MUST migrate deterministically and idempotently before its next mutable review action. Migration MUST preserve the lineage identity, genesis paths, candidate, selected dimensions, one-shot lens executions, immutable finding IDs, historical attempts, historical validation outcomes, follow-ups, successor history, and all existing audit values without rewriting them. It MUST map each unresolved frozen blocking finding into one stable resumable slice using its frozen root-cause evidence; when evidence cannot support a deterministic mapping, it MUST fail closed for contract remediation. A paused O4.2 lineage MUST migrate using the same rule and resume only through a legal active slice, without ordinary successor churn.

This change MUST provide deterministic candidate identity and lineage auditability, but MUST NOT require the complete cryptographic receipt authority planned for later roadmap milestones.

(Previously: continuation revalidated one lineage-wide correction budget and did not define schema-v1 slice migration.)

#### Scenario: Interrupted reviewer has unknown outcome

- GIVEN a selected specialist was launched and its terminal result was not persisted
- WHEN orchestration resumes
- THEN it MUST reconcile the lineage state before any new work is launched
- AND it MUST fail closed while the prior outcome remains unknown

#### Scenario: Paused O4.2 migrates without successor

- GIVEN the active O4.2 schema-v1 lineage has immutable frozen findings and no pending unknown mutation
- WHEN it is migrated before the next review action
- THEN unresolved findings MUST become deterministic resumable slices while historical audit remains unchanged
- AND the system MUST NOT create a successor solely to continue remediation

#### Scenario: Archive revalidates without reopening review

- GIVEN a lineage completed targeted validation for its frozen candidate
- WHEN a downstream delivery or archive gate runs
- THEN it MUST validate the same candidate identity and terminal lineage state
- AND MUST NOT allocate reviewers, findings, attempts, slice budget, or successor authority
