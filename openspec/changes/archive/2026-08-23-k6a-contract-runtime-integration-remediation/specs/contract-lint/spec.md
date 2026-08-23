# Delta for contract-lint

## ADDED Requirements

### Requirement: Worker Isolation Canonical Contract Checker {#REQ-contract-lint-018}

The unified contract-lint registry MUST include a checker that validates that all invocations of worker isolation execution primitives (`materializeSourceSnapshot`, `executeWorkOrder`, `captureWorkResult`, `validateWorkResultBinding`) and their associated fixtures consume canonical K3 and K4a contracts. The checker MUST report an offender if any K6a test fixture or invocation assumes synthetic `.files` properties on `SourceSnapshot v1`, passes non-SHA-256 strings in WorkOrder v2 `dependencies`, or omits canonical cryptographic binding verification via `execution-identities`.

#### Scenario: Non-canonical fixture shape in worker isolation is reported as an offender

- GIVEN a worker isolation test fixture or test definition passing a SourceSnapshot with property `.files` or WorkOrder v2 with non-SHA-256 dependencies
- WHEN the contract-lint aggregator runs the canonical contract checker
- THEN the checker MUST report an offender identifying the file and non-canonical contract usage
- AND the overall lint run MUST fail

#### Scenario: Conforming canonical worker isolation contracts pass lint

- GIVEN worker isolation primitives and fixtures consuming canonical SourceSnapshot v1 and WorkOrder v2 contracts
- WHEN the canonical contract checker runs
- THEN the checker MUST return an empty offender list
