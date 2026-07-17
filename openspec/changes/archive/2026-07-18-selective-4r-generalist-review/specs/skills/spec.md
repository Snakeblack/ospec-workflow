# Delta for Skills

## ADDED Requirements

### Requirement: `review-change` Decision Contract {#REQ-skills-004}

The `review-change` skill MUST be read-only and MUST return exactly one decision payload with `status`, `specialists`, and `reason`. `status` MUST be `clear` or `needs-specialist`; `specialists` MUST be a deduplicated array containing only `risk`, `reliability`, `resilience`, or `readability` in canonical order; `reason` MUST be non-empty and evidence-based. `clear` MUST have an empty list, while `needs-specialist` MUST have at least one specialist. The enclosing reviewer result MUST have `artifacts: []`.

#### Scenario: Valid escalation

- GIVEN the generalist observes privileged process execution without enough evidence for a deep security conclusion
- WHEN it returns its decision
- THEN status MUST be `needs-specialist`
- AND specialists MUST contain `risk` with a reason naming the observed signal

#### Scenario: Clear decision is explicit

- GIVEN the generalist finds no specialist signal after basic correctness and 4R screening
- WHEN it returns its decision
- THEN status MUST be `clear`, specialists MUST be empty, and reason MUST explain the clearance evidence

#### Scenario: Invalid status/list combination is rejected

- GIVEN status is `clear` with a non-empty specialist list
- WHEN the decision contract is validated
- THEN validation MUST fail closed
- AND the payload MUST NOT activate or suppress any specialist

### Requirement: Generalist Competence Boundary {#REQ-skills-005}

The generalist MUST evaluate basic correctness and screen all four dimensions with high sensitivity. It MAY identify concrete signals and request expertise, but MUST NOT claim a deep security exploit, reliability proof, resilience guarantee, or definitive maintainability conclusion when specialist analysis is required. It MUST NOT assign specialist severities or propose domain-deep remediation in `needs-specialist`; the specialist remains authoritative for findings, severity, and remediation.

#### Scenario: Security signal is escalated without overclaim

- GIVEN the change modifies authentication and permission checks
- WHEN the generalist cannot rule out authorization risk from basic inspection
- THEN it MUST request `risk` and state the bounded signal
- AND it MUST NOT assert that an exploitable bypass exists

#### Scenario: Basic correctness defect remains reportable

- GIVEN the diff references a missing file or contradicts the verified artifact set
- WHEN the generalist performs its basic correctness pass
- THEN it MAY report the concrete inconsistency in its reason
- AND it MUST request a specialist only when a dimension-specific conclusion is needed

### Requirement: Review Skill Compatibility and Parity {#REQ-skills-006}

Adding `review-change` MUST NOT modify the four existing specialist skills, their envelopes, severity rules, or no-findings behavior. Registry/model metadata and generated target outputs MUST expose the generalist contract wherever the post-verify gate is supported. Contract tests MUST validate the source and every supported generated target, and MUST reject missing competence-boundary text or malformed decision schemas.

#### Scenario: Existing specialist contract remains unchanged

- GIVEN a selected specialist finds no issue
- WHEN it returns under the new gate
- THEN its existing no-findings body and empty findings contract MUST remain valid
- AND the generalist decision MUST NOT be substituted for that envelope

#### Scenario: Target output omits the boundary

- GIVEN a generated target contains `review-change` but omits its competence boundary
- WHEN parity contracts run
- THEN validation MUST fail
- AND the target MUST NOT be considered equivalent to the source contract

### Requirement: One-Shot Review and Targeted Validation Boundary {#REQ-skills-007}

The review lifecycle MUST distinguish the initial read-only discovery sweep from correction validation. The generalist and each selected specialist MUST execute at most once per lineage. A targeted validator MUST receive only the frozen finding IDs, correction delta, genesis paths, and lineage state needed to decide `resolved` or `unresolved` and identify correction-caused regressions; it MUST NOT run a new general review or emit unrelated blocking findings.

The same one-shot and targeted-validation boundary MUST be present in every supported target without changing specialist finding or severity contracts.

#### Scenario: Validator encounters an unrelated concern

- GIVEN targeted validation of a frozen finding observes an unrelated concern
- WHEN it returns the correction outcome
- THEN it MUST keep that concern outside the frozen blocking finding set
- AND MUST record it as a non-blocking follow-up for an explicit successor

#### Scenario: Reviewer relaunch is rejected

- GIVEN a selected dimension is already recorded as executed in the lineage
- WHEN orchestration requests the same reviewer again after correction
- THEN the lifecycle contract MUST reject the relaunch
- AND MUST preserve the original reviewer result and budget
