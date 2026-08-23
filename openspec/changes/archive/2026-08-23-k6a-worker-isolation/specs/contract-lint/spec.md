# Delta for contract-lint

## ADDED Requirements

### Requirement: Worker Isolation CandidateId Non-Emission Checker {#REQ-contract-lint-016}

The unified contract-lint registry MUST include a checker that validates all worker isolation execution primitives, schema definitions, and fixtures to ensure strict compliance with the K3 identity boundary. The checker MUST report an offender if any K6a execution primitive, schema, or test fixture emits, accepts, returns, or contains `candidate_id` or references Candidate schema definitions.

#### Scenario: K6a artifact emitting CandidateId is reported as an offender

- GIVEN a worker execution fixture or schema definition declaring `candidate_id`
- WHEN the contract-lint aggregator runs the candidate non-emission checker
- THEN the checker MUST report an offender identifying the file and the forbidden candidate property
- AND the overall contract-lint run MUST fail

#### Scenario: Conforming K6a artifacts pass lint without offenders

- GIVEN worker isolation primitives and fixtures emitting only `WorkResult` bound to `WorkOrderId` / `SourceSnapshotId`
- WHEN the candidate non-emission checker runs
- THEN the checker MUST return an empty offender list

---

### Requirement: Capsule Path Containment And Allowed Paths Checker {#REQ-contract-lint-017}

The unified contract-lint registry MUST include a checker that validates that all worker execution fixtures, capsule definitions, and work orders declare non-empty `allowed_paths`. The checker MUST report an offender if any capsule or work order fixture omits `allowed_paths`, provides an empty list, or includes path traversal sequences (`../`, `..\\`) in declared allowed paths.

#### Scenario: Capsule fixture missing or empty allowed_paths is reported as an offender

- GIVEN a capsule definition or execution fixture with missing or empty `allowed_paths`
- WHEN the contract-lint aggregator runs the capsule path containment checker
- THEN the checker MUST report an offender naming the offending artifact
- AND the overall lint run MUST fail

#### Scenario: Capsule fixture containing path traversal in allowed_paths is rejected

- GIVEN an execution fixture declaring `allowed_paths: ["../escape/path"]`
- WHEN the capsule path containment checker runs
- THEN the checker MUST report an offender identifying the path traversal attempt
- AND the overall lint run MUST fail

#### Scenario: Conforming capsule configurations pass lint

- GIVEN capsule definitions and execution fixtures declaring valid sandboxed `allowed_paths`
- WHEN the capsule path containment checker runs
- THEN the checker MUST return an empty offender list
