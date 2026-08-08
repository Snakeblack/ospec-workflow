# Delta for kernel-contract-schemas

## MODIFIED Requirements

### Requirement: Execution Identity Schemas With Non-Aliasing Fixtures {#REQ-kernel-contract-schemas-012}

The contract suite MUST publish versioned JSON Schemas for `SourceSnapshot`, `WorkOrder`, `WorkResult`, and `Candidate` execution identity families. Each identity schema MUST declare a stable `$id` and explicit version field. The suite MUST define `candidate/v2.schema.json` (`$id: "ospec://schemas/kernel/candidate/v2"`) and `work-order/v2.schema.json` (`$id: "ospec://schemas/kernel/work-order/v2"`) with explicit `kind` field ("candidate/v2" and "work-order/v2"). `source-snapshot/v1.schema.json` and `work-result/v1.schema.json` MUST permit an optional `kind` property matching `"source-snapshot/v1"` and `"work-result/v1"` respectively without violating `additionalProperties: false`. Baseline `candidate/v1.schema.json`, `work-order/v1.schema.json`, and `K1_SCHEMA_BASELINE` MUST be preserved and restored as immutable contracts. Each identity family MUST include valid fixtures and negative non-aliasing fixtures demonstrating that `WorkResult` cannot validate as `Candidate`, and `Candidate` cannot validate as `CandidateEvaluationAttestation` or `DeliveryAuthorization`.
(Previously: source-snapshot/v1 and work-result/v1 schemas had additionalProperties: false without accepting kind: "source-snapshot/v1" or "work-result/v1".)

#### Scenario: K3 identity families expose stable id and version

- GIVEN the published contract suite after this change
- WHEN SourceSnapshot, WorkOrder, WorkResult, and Candidate schemas are inspected
- THEN each MUST expose a non-empty stable `$id`
- AND MUST expose an explicit version identifier

#### Scenario: Identity confusion negative fixtures fail validation

- GIVEN negative fixtures cross-substituting WorkResult, Candidate, CandidateEvaluationAttestation, and DeliveryAuthorization structures
- WHEN schema validation runs for each family
- THEN validation MUST fail closed
- AND the failure MUST identify the schema kind or identifier mismatch

#### Scenario: Schema v2 exposes explicit kind discriminator for candidate and work-order

- GIVEN a candidate/v2 or work-order/v2 JSON payload
- WHEN validated against `candidate/v2.schema.json` or `work-order/v2.schema.json`
- THEN the payload MUST contain property `kind` matching `"candidate/v2"` or `"work-order/v2"` respectively
- AND payloads lacking `kind` or carrying invalid `kind` values MUST be rejected fail-closed

#### Scenario: Legacy v1 schemas and K1 baseline remain intact and immutable

- GIVEN `candidate/v1.schema.json`, `work-order/v1.schema.json`, and `K1_SCHEMA_BASELINE` pins
- WHEN verified against repository schema baseline rules
- THEN v1 schemas MUST remain unchanged without modifying existing v1 properties or constraints

#### Scenario: SourceSnapshot v1 and WorkResult v1 allow optional kind property

- GIVEN a SourceSnapshot v1 or WorkResult v1 payload carrying `kind: "source-snapshot/v1"` or `kind: "work-result/v1"`
- WHEN validated against `source-snapshot/v1.schema.json` or `work-result/v1.schema.json`
- THEN validation MUST succeed
- AND MUST NOT fail with `additionalProperties: false`
