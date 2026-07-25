# Delta for agents

## ADDED Requirements

### Requirement: Strict TDD Evidence-Format-Gap Fast Path Contract {#REQ-agents-012}

When Strict TDD verification finds a deterministic evidence-format defect while
functional behavior is unchanged, the SDD agents MUST support a bounded
`evidence-format-gap` fast path. `sdd-apply` MUST classify the gap from the
structured evidence record, persist the candidate identity and the original
classification, and MAY write only the allowlisted evidence artifact. Before
and after the repair it MUST verify that the functional candidate identity is
unchanged. `sdd-verify` MUST perform a focal recheck of the repaired evidence
without redispatching the complete apply/verify route. Missing, unverifiable, or
fabricated evidence MUST remain a CRITICAL failure and MUST fail closed.

If a repair changes production code, specifications, or tests; changes the
candidate identity; exceeds the bounded evidence/cost budget; or fails the focal
recheck, the orchestrator MUST route the change through the ordinary task,
apply, and verify path. The fast path MUST NOT be used to suppress Strict TDD,
execution-test requirements, or existing CRITICAL handling.

#### Scenario: Equivalent evidence-format gap is repaired in place

- GIVEN Strict TDD evidence proves the same functional candidate and tests but uses an invalid marker format
- WHEN `sdd-apply` classifies the record as `evidence-format-gap`
- THEN it MUST persist the immutable candidate identity and write only the allowlisted evidence artifact
- AND `sdd-verify` MUST run a focal recheck without full phase redispatch

#### Scenario: Missing or fabricated evidence fails closed

- GIVEN a record is missing required provenance, unverifiable, or fabricated
- WHEN the fast-path validator evaluates it
- THEN the change MUST remain a CRITICAL failure with no evidence repair
- AND the orchestrator MUST route through ordinary remediation

#### Scenario: Functional delta or identity drift leaves the fast path

- GIVEN a proposed repair touches production/spec/test files, exceeds the bounded budget, or changes the candidate identity
- WHEN the before/after identity check or allowlist check runs
- THEN the fast path MUST be rejected
- AND ordinary task, apply, and verify routing MUST be selected

#### Scenario: Focal recheck failure preserves fail-closed routing

- GIVEN an evidence-only repair was written with an unchanged identity
- WHEN the focused verify recheck fails
- THEN the fast path MUST report the original failure and MUST NOT retry indefinitely
- AND the orchestrator MUST select ordinary routing

#### Scenario: Routing and cost guards are testable

- GIVEN equivalent evidence, a functional failure, and an oversized repair are supplied to the routing guard tests
- WHEN the contract suite evaluates each case
- THEN only the equivalent evidence case MAY use the fast path
- AND the suite MUST assert that rechecks and evidence writes stay within the configured bounded cost
