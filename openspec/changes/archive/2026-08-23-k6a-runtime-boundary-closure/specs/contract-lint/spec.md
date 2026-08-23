# Delta for contract-lint

## MODIFIED Requirements

### Requirement: Worker Isolation Canonical Contract Checker {#REQ-contract-lint-018}

The unified contract-lint registry MUST include a checker (`k6a-canonical-contracts`) that validates that all worker isolation execution primitives (`materializeSourceSnapshot`, `executeWorkOrder`, `captureWorkResult`, `validateWorkResultBinding`), schema definitions, test fixtures, and JS source implementations consume canonical K3 and K4a contracts. The checker MUST audit fixtures and JS files to report an offender if any artifact assumes synthetic `.files` properties on `SourceSnapshot v1`, passes non-SHA-256 strings in WorkOrder v2 `dependencies`, or relies on legacy file path dependencies. Runtime code MUST NOT maintain legacy `.files` fallback paths.
(Previously: Checker only validated fixtures and allowed legacy .files fallback pathways in runtime code.)

#### Scenario: Non-canonical fixture shape or JS invocation is reported as an offender
- GIVEN a worker isolation test fixture, schema fixture, or JS source file containing synthetic `.files` on SourceSnapshot or non-SHA-256 dependencies on WorkOrder v2
- WHEN the contract-lint aggregator runs `k6a-canonical-contracts`
- THEN the checker MUST report an offender identifying the file and non-canonical contract usage
- AND the overall lint run MUST fail

#### Scenario: Conforming canonical worker isolation contracts pass lint
- GIVEN worker isolation primitives, fixtures, and tests consuming canonical SourceSnapshot v1 and WorkOrder v2 contracts without synthetic `.files`
- WHEN `k6a-canonical-contracts` runs
- THEN the checker MUST return an empty offender list
