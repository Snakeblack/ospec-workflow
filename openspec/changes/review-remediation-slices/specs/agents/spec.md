# Delta for agents

## MODIFIED Requirements

### Requirement: Selective Specialist Dispatch with Slice-Scoped Remediation {#REQ-agents-013}

The orchestrator MUST dispatch only dimensions selected by the validated review decision: zero to two for normal changes and all four for high-risk changes. Multiple selected specialists MUST retain the target's existing parallel-preferred, serial-fallback behavior; this change MUST NOT introduce a new concurrency policy. Existing specialist prompts, finding envelopes, severity taxonomy, user escalation, and remediation ownership MUST remain unchanged.

Each selected specialist MUST execute exactly once in a review lineage. After findings are frozen, the orchestrator MUST NOT relaunch the generalist or any specialist. It MUST dispatch `review-correction` only for the active root-cause slice and pass only that slice's frozen finding IDs, permitted genesis paths, immutable lineage/candidate context, and correction delta. A validator result for one slice MUST NOT reopen a passed slice unless it identifies a genuine regression explicitly impacting that slice.

(Previously: correction validation was limited to frozen finding IDs but had no active-slice dispatch boundary.)

#### Scenario: Normal change dispatches two selected specialists

- GIVEN the final normal decision selects `risk` and `reliability` and skips the other dimensions
- WHEN the orchestrator dispatches specialists
- THEN it MUST launch only `review-risk` and `review-reliability`
- AND skipped dimensions MUST remain audit decisions, not synthetic reviewer envelopes

#### Scenario: Slice remediation does not reopen discovery

- GIVEN a `provenance` slice contains a critical frozen finding and another slice is already resolved
- WHEN the correction is ready for validation
- THEN the orchestrator MUST validate only the `provenance` frozen finding IDs without rerunning its specialist
- AND the resolved slice MUST remain resolved unless an explicit regression impacts it

### Requirement: Bounded Review Lineage with Independent Correction Slices {#REQ-agents-015}

Before the first specialist dispatch, the orchestrator MUST freeze one auditable lineage containing a deterministic candidate identity, genesis paths, classification, selected dimensions, initial evidence, and immutable finding IDs. Each selected dimension MUST run exactly once in that lineage, and its initial findings MUST receive stable IDs that cannot be deleted, renumbered, or expanded by correction validation.

The lineage MUST contain stable root-cause correction slices. Every slice MUST have an independent bounded line allowance and at most three failed validation attempts, and MUST retain its own history and resolution state. Exhausting one slice MUST terminate or explicitly escalate that slice without resetting reviewer executions, candidate, findings, paths, or another slice's budget. It MUST NOT require an ordinary successor lineage. A successor lineage or change requires explicit approval for a new discovery authority, candidate lineage, or scope, not a failed or exhausted existing slice.

Pending mutations MUST be persisted before dispatch. Unknown outcomes MUST be reconciled exactly before another mutable action, and the gate MUST fail closed until reconciliation establishes the legal state.

(Previously: one lineage-wide correction budget exhausted all remediation and required escalation without slice-level independence.)

#### Scenario: A slice exhausts without resetting another slice

- GIVEN `policy` has three failed validations and `provenance` has not started
- WHEN another `policy` correction is requested
- THEN the orchestrator MUST terminate or explicitly escalate only `policy`
- AND `provenance` MUST retain its independent unused budget without a successor

#### Scenario: Successor authority is explicit

- GIVEN targeted validation observes a concern unrelated to every frozen finding ID
- WHEN that concern requires blocking authority
- THEN the current lineage MUST record it only as a non-blocking follow-up
- AND a distinct explicitly approved successor lineage or change MUST be created before specialist discovery resumes
