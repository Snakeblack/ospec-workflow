# Delta for routing

## ADDED Requirements

### Requirement: Deterministic Evidence-Only Remediation Routing {#REQ-routing-006}

The routing layer MUST distinguish a deterministic `evidence-format-gap` from
functional, task, specification, or test failures using the normalized Strict
TDD evidence record. The decision MUST include a stable functional candidate
identity (including its genesis paths) and MUST be reproducible for identical
inputs. A fast-path route MAY be selected only when the record is complete and
verifiable, the proposed write is limited to the evidence allowlist, and the
identity is unchanged before and after repair.

The fast path MUST have a bounded remediation budget: at most one focal verify
recheck and evidence-only writes within the configured changed-line/cost limit.
It MUST NOT allocate a new functional candidate, reviewer, or full phase
redispatch. Missing or fabricated evidence, identity mismatch, a material
production/spec/test delta, an over-budget repair, or a failed focal recheck
MUST fail closed and use ordinary routing. Routing and cost guard tests MUST
cover each of these classifications and reject attempts that exceed the bound.

#### Scenario: Deterministic equivalent drift selects the fast path

- GIVEN identical normalized functional identity and verifiable evidence with only a format mismatch
- WHEN routing evaluates the remediation candidate
- THEN it MUST classify `evidence-format-gap` deterministically
- AND select the bounded evidence-only path with one focal recheck at most

#### Scenario: Functional or task failure selects ordinary routing

- GIVEN evidence indicates a behavior, task, specification, or test failure rather than formatting drift
- WHEN routing classifies the candidate
- THEN it MUST NOT select the fast path
- AND it MUST return the existing ordinary route classification

#### Scenario: Identity mismatch or unauthorized file write fails closed

- GIVEN the post-repair identity differs or a production/spec/test path is changed
- WHEN the routing guard compares the before/after candidate and allowlist
- THEN it MUST reject the fast path as a contract failure
- AND it MUST select ordinary remediation without mutating the frozen identity

#### Scenario: Missing or fabricated evidence is never downgraded

- GIVEN required evidence fields or provenance are absent, unverifiable, or fabricated
- WHEN routing validates the record
- THEN it MUST preserve CRITICAL severity and fail closed
- AND it MUST NOT classify the case as `evidence-format-gap`

#### Scenario: Cost limit prevents repeated remediation

- GIVEN a candidate requests more than one focal recheck or exceeds the configured evidence/cost budget
- WHEN the cost guard evaluates the request
- THEN the fast path MUST be rejected
- AND ordinary routing MUST be selected with a deterministic reason
