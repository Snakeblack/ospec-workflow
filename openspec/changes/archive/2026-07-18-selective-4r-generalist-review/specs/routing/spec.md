# Delta for Routing

## ADDED Requirements

### Requirement: Evidence-Derived Review Dimensions {#REQ-routing-001}

At the `4r-review-gate`, the system MUST derive exactly `risk`, `reliability`, `resilience`, and `readability` from normalized evidence: affected paths, modified capabilities, operation types, dependencies, design risks, the real diff, and the verify outcome. Each dimension MUST contain `selected: true|false` and a non-empty ordered `reasons` list; a skipped dimension MUST be justified as explicitly as a selected one.

Evidence MUST be ranked deterministically: high-risk override; verify findings; real-diff facts; generalist escalation; design/dependency risks; then declared paths, capabilities, and operation types. Ties MUST use `risk`, `reliability`, `resilience`, `readability` order. Reasons MUST use stable codes, identify their source, be deduplicated, and follow the same ordering for identical normalized input.

#### Scenario: Normal documentation change skips irrelevant dimensions

- GIVEN a normal change whose evidence contains documentation-only paths and no verify, dependency, design, diff, or generalist risk signal
- WHEN review dimensions are derived
- THEN zero specialists MAY be selected
- AND every dimension MUST persist a deterministic skipped reason

#### Scenario: Stronger runtime evidence wins

- GIVEN declared metadata suggests documentation-only work but the real diff adds process execution and global configuration writes
- WHEN evidence is ranked
- THEN real-diff facts MUST take precedence over declared metadata
- AND `risk` and `reliability` MUST be selected with their evidence sources recorded

### Requirement: Classification Caps and High-Risk Override {#REQ-routing-002}

For a `normal` change, the system MUST select between zero and two specialists from the union of classifier signals and a valid generalist escalation. If the union exceeds two, it MUST retain the two dimensions with the strongest evidence using REQ-routing-001 precedence. For a `high-risk` change, it MUST select all four dimensions regardless of negative or absent lower-precedence signals; each reason MUST identify the classification override.

#### Scenario: Normal candidates exceed the cap

- GIVEN a normal change produces three justified candidate dimensions
- WHEN the cap is applied
- THEN exactly two specialists MUST be selected by deterministic evidence precedence
- AND the excluded candidate MUST record that it was skipped by the normal-change cap

#### Scenario: High-risk always receives full 4R

- GIVEN a change is classified as high-risk
- WHEN the gate derives review dimensions
- THEN all four dimensions MUST be selected
- AND each dimension MUST record `high-risk-override` as a reason

### Requirement: Review Decision Contract and Audit {#REQ-routing-003}

Before specialist dispatch, the system MUST validate classification, normalized evidence, the generalist result, the four exact dimension keys, booleans, non-empty reasons, allowed specialist names, and cap compliance. It MUST persist under `gates.4r-review-gate` the classification, normalized evidence sources, generalist decision, and all four final dimension decisions and reasons. The audit MUST be read-merge-written without deleting existing gate fields such as `status`, `on_blocker`, `findings_summary`, or `surfaced_to_user`.

Raw diff content MUST NOT be required in state; stable normalized facts or references SHALL provide reproducible evidence. Contract-invalid or incomplete input MUST fail closed: the gate MUST become `blocked` for contract remediation, MUST NOT dispatch specialists, and MUST NOT silently fall back to unconditional 4R. A pre-change archived state lacking the new audit fields MUST remain readable and MUST NOT be retroactively rewritten.

#### Scenario: Complete deterministic audit

- GIVEN valid normalized evidence and a valid generalist result
- WHEN specialist selection completes
- THEN `state.yaml` MUST contain decisions and non-empty reasons for all four dimensions
- AND repeated evaluation of identical input MUST produce the same auditable decision data

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

### Requirement: Frozen Review Genesis and Targeted Correction {#REQ-routing-004}

The gate MUST freeze its deterministic candidate identity, genesis paths, classification, selected dimensions, initial evidence, and correction budget before specialist execution. The audit MUST persist a stable lineage identity, each selected dimension's execution state, immutable finding IDs, correction attempts, targeted-validation outcomes, and late follow-ups. The correction budget MUST include a maximum of three failed attempts and a bounded changed-line allowance fixed at lineage creation; the exact allowance policy MAY be selected by design but MUST NOT grow inside the lineage.

Targeted validation MUST only mark frozen finding IDs resolved or unresolved and detect regressions caused by the correction. It MUST NOT perform general discovery, add blocking finding IDs, select another dimension, expand genesis paths, or allocate new reviewer or correction budget. An unrelated late observation MUST be a non-blocking follow-up unless an explicit successor lineage or change grants it new authority.

#### Scenario: Targeted validation resolves frozen findings

- GIVEN a correction references frozen findings `F-001` and `F-002`
- WHEN targeted validation evaluates the correction
- THEN it MUST report resolution state only for those IDs and correction-caused regressions
- AND MUST NOT create another blocking finding or reviewer dispatch

#### Scenario: Correction escapes genesis

- GIVEN a proposed correction changes a path outside the frozen genesis paths
- WHEN the gate validates the attempt
- THEN the attempt MUST fail or escalate without expanding the lineage
- AND the original candidate, paths, dimensions, and budget MUST remain immutable

### Requirement: Read-Only Gate Continuation and Interruption Recovery {#REQ-routing-005}

Status, verification, delivery, and archive gates after lineage creation MUST revalidate the same candidate identity and persisted lineage state. They MUST be read-only with respect to reviewer selection and correction budget. If execution is interrupted or an outcome is ambiguous, the orchestrator MUST reconcile persisted state before continuing and MUST NOT relaunch a reviewer, validator, correction, or successor while the prior outcome remains unknown.

This change MUST provide deterministic candidate identity and lineage auditability, but MUST NOT require the complete cryptographic receipt authority planned for later roadmap milestones.

#### Scenario: Interrupted reviewer has unknown outcome

- GIVEN a selected specialist was launched and its terminal result was not persisted
- WHEN orchestration resumes
- THEN it MUST reconcile the lineage state before any new work is launched
- AND it MUST fail closed while the prior outcome remains unknown

#### Scenario: Archive revalidates without reopening review

- GIVEN a lineage completed targeted validation for its frozen candidate
- WHEN a downstream delivery or archive gate runs
- THEN it MUST validate the same candidate identity and terminal lineage state
- AND MUST NOT allocate reviewers, findings, attempts, or correction budget

## MODIFIED Requirements

### Requirement: 4R Gate Hook and Advisory Policy

The `4r-review-gate` MUST run after successful `sdd-verify` only when listed by the active `bugfix`, `refactor`, or `standard` route. It MUST run the read-only generalist before the selected specialists and MUST preserve the existing advisory severity policy: `BLOCKER` or `CRITICAL` findings are surfaced to the user without automatic route halt, while `WARNING` and `SUGGESTION` are recorded without interruption. Routes without the gate MUST skip all generalist and specialist dispatch.

(Previously: the gate dispatched all four specialists unconditionally after successful verify and applied the same advisory severity policy.)

#### Scenario: Route without gate keeps prior no-op behavior

- GIVEN the active route does not list `4r-review-gate`
- WHEN verify succeeds
- THEN neither the generalist nor any specialist MUST be dispatched

#### Scenario: Selected specialist preserves severity behavior

- GIVEN a selected specialist returns a `CRITICAL` finding
- WHEN the gate evaluates collected selected-reviewer envelopes
- THEN the finding MUST be surfaced through the existing user decision gate
- AND the route MUST NOT auto-halt solely because of that severity
