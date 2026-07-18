# Delta for Routing

## MODIFIED Requirements

### Requirement: Classification Caps and High-Risk Override {#REQ-routing-002}

For a `normal` change, the system MUST count the justified positive review signals produced by the classifier and a valid generalist escalation after evidence precedence and canonical ordering. With zero positive signals it MUST select zero specialists; with one or two it MUST select exactly those targeted dimensions; with three or four it MUST set `depth.review` to `strict` and select all four dimensions for full 4R. No dimension in the three-or-four case MAY be labeled `normal-cap-excluded`. For one-or-two signals, any selection MUST retain the strongest dimensions using REQ-routing-001 precedence. A `high-risk` change MUST continue to select all four dimensions regardless of lower-precedence signals, with each reason identifying the classification override. Escalated selections MUST preserve canonical dimension order and the candidate evidence fingerprint.

(Previously: normal changes were capped at two specialists even when three or four justified candidates existed; high-risk changes always selected all four.)

#### Scenario: Normal change with no positive signals

- GIVEN a normal change whose normalized evidence and valid generalist result contain zero positive review signals
- WHEN the review dimensions are derived
- THEN zero specialists MUST be selected
- AND all four dimensions MUST persist deterministic skipped reasons

#### Scenario: Normal change with one or two positive signals

- GIVEN a normal change with one or two justified positive review signals
- WHEN the review dimensions are derived
- THEN exactly those targeted dimensions MUST be selected in canonical order
- AND no selected or skipped dimension MUST be marked as `normal-cap-excluded`

#### Scenario: Normal change with three positive signals escalates

- GIVEN a normal change produces three justified positive review signals
- WHEN the normal cap decision is applied
- THEN `depth.review` MUST equal `strict`
- AND all four dimensions MUST be selected for full 4R without discarding any signal

#### Scenario: Four-signal escalation preserves identity

- GIVEN a normal change produces four justified positive review signals and an evidence fingerprint
- WHEN strict full-4R selection completes
- THEN dimensions MUST be dispatched in `risk`, `reliability`, `resilience`, `readability` order
- AND the candidate fingerprint MUST remain unchanged

#### Scenario: High-risk always receives full 4R

- GIVEN a change is classified as high-risk
- WHEN the gate derives review dimensions
- THEN all four dimensions MUST be selected
- AND each dimension MUST record `high-risk-override` as a reason

### Requirement: Review Decision Contract and Audit {#REQ-routing-003}

Before specialist dispatch, the system MUST validate classification, normalized evidence, the generalist result, the four exact dimension keys, booleans, non-empty reasons, allowed specialist names, and the applicable signal-count or classification policy. It MUST run the read-only generalist before any specialist and persist under `gates.4r-review-gate` the classification, normalized evidence sources including the stable fingerprint, generalist decision, dispatch depth, escalation reason when applicable, and all four final dimension decisions and reasons. The audit MUST be read-merge-written without deleting existing gate fields such as `status`, `on_blocker`, `findings_summary`, or `surfaced_to_user`.

Raw diff content MUST NOT be required in state; stable normalized facts or references SHALL provide reproducible evidence. Contract-invalid or incomplete input, including malformed normalized evidence or an invalid generalist result, MUST fail closed: the gate MUST become `blocked` for contract remediation, MUST NOT dispatch specialists, and MUST NOT silently fall back to unconditional 4R. A pre-change archived state lacking the new audit fields MUST remain readable and MUST NOT be retroactively rewritten.

(Previously: the audit persisted classification, evidence, generalist, and dimensions, but did not require signal-count escalation depth or reason.)

#### Scenario: Complete deterministic audit

- GIVEN valid normalized evidence and a valid generalist result
- WHEN specialist selection completes
- THEN `state.yaml` MUST contain decisions and non-empty reasons for all four dimensions
- AND repeated evaluation of identical input MUST produce the same auditable decision data

#### Scenario: Escalation reason is auditable

- GIVEN a normal change has three or four positive review signals
- WHEN the reducer escalates to strict full 4R
- THEN the gate audit MUST record `depth.review: strict` and a non-empty escalation reason
- AND the recorded fingerprint and canonical dimension order MUST match the reducer input

#### Scenario: Malformed evidence fails closed

- GIVEN normalized evidence is malformed or incomplete
- WHEN the gate validates its inputs
- THEN the gate MUST record a contract-remediation blocker
- AND no generalist or specialist dispatch MUST occur

#### Scenario: Invalid generalist result fails closed

- GIVEN the generalist returns an unknown specialist or a status/list mismatch
- WHEN the gate validates its inputs
- THEN the gate MUST record a contract-remediation blocker
- AND no specialist or downstream archive phase MUST be dispatched

#### Scenario: Legacy state remains compatible

- GIVEN an archived change predates `review_dimensions`
- WHEN tooling reads its `4r-review-gate` audit
- THEN the historical gate fields MUST remain valid
- AND the system MUST NOT invent selection reasons for that archived change

## ADDED Requirements

None.

## REMOVED Requirements

None.
