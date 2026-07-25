# Delta for skills

## ADDED Requirements

### Requirement: Structured Strict TDD Evidence and Bounded Repair Rules {#REQ-skills-008}

The Strict TDD apply and verify skills MUST define a structured evidence record
that is sufficient to verify provenance, required RED/GREEN/TRIANGULATE/
REFACTOR fields, test-file references, and the functional candidate identity.
Evidence validation MUST distinguish an equivalent format-only defect
(`evidence-format-gap`) from absent, unverifiable, or fabricated evidence.
Legacy `working-tree` cycles are immutable `legacy-unverifiable` history, not
live proof. A new live cycle MUST carry a reconciled external candidate receipt,
matching test digest and runtime command; absent or altered bindings fail closed.
Every record MUST declare `historical` or `live`; only `live` can classify, with an externally reconciled candidate ID.

For an equivalent gap, the apply skill MUST constrain repairs to the evidence
artifact allowlist, preserve the immutable identity and genesis paths, record the
classification and before/after checks, and enforce the configured bounded
changed-line and cost limits. The verify skill MUST run one focal recheck against
the repaired evidence and report whether the frozen findings are resolved. The
skills MUST NOT permit the fast path to change production code, specifications,
or tests, weaken Strict TDD requirements, fabricate missing records, or retry
without bound. Any violation MUST remain CRITICAL and fail closed for ordinary
routing.

#### Scenario: Valid evidence record is accepted

- GIVEN an apply-progress record contains required structured fields, real test-file references, and provenance
- WHEN the Strict TDD validator checks it
- THEN it MUST accept the record and compute a stable functional identity
- AND a formatting-only marker defect MAY be classified as `evidence-format-gap`

#### Scenario: Missing or fabricated record is critical

- GIVEN required evidence or provenance is absent, unverifiable, or fabricated
- WHEN apply or verify validates the record
- THEN it MUST emit a CRITICAL failure
- AND it MUST NOT create or repair evidence to make the record pass

#### Scenario: Repair allowlist and identity are immutable

- GIVEN an `evidence-format-gap` candidate is eligible for repair
- WHEN the repair is applied
- THEN writes MUST be limited to the evidence artifact allowlist
- AND the functional identity and genesis paths MUST match before and after

#### Scenario: Focused verify recheck is bounded

- GIVEN an evidence-only repair completes with an unchanged identity
- WHEN verify runs the remediation check
- THEN it MUST execute one focal recheck at most and report its outcome
- AND it MUST route any failed recheck or material delta to the ordinary workflow

#### Scenario: Evidence tests enforce routing and cost boundaries

- GIVEN tests exercise equivalent drift, functional failure, missing evidence, identity drift, and over-budget requests
- WHEN the Strict TDD contract tests run
- THEN they MUST assert distinct classifications, fail-closed CRITICAL outcomes, allowlist enforcement, and the one-recheck/cost bound
