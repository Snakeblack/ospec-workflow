# Delta for kernel-contract-schemas

## ADDED Requirements

### Requirement: Work Order V2 Requires Closed Capsule Inputs {#REQ-kernel-contract-schemas-023}

`work-order/v2.schema.json` MUST add `capsule_inputs` as a required property: an array of one or more non-empty relative file-path strings. Each item MUST be a concrete relative path (`minLength: 1`), MUST NOT match glob metacharacters (`*`, `?`, `[`), MUST NOT contain `..`, and MUST NOT be absolute. `additionalProperties` MUST remain `false`. `work-order/v1.schema.json` and `K1_SCHEMA_BASELINE` MUST remain byte-identical.

Valid v2 fixtures MUST include `capsule_inputs`. Negative fixtures MUST reject: omitted `capsule_inputs`, empty array, non-array, glob items, `..` traversal, and absolute paths. Capsule-definition `capsule_inputs` (MAY on `capsule-definition/v1`) is unchanged and MUST NOT be treated as a substitute for WorkOrder v2 `capsule_inputs`.

#### Scenario: WorkOrder v2 with valid capsule_inputs passes validation

- GIVEN a WorkOrder v2 payload that includes `capsule_inputs: ["src/app.js"]` and all other required v2 fields
- WHEN validated against `work-order/v2.schema.json`
- THEN validation MUST succeed

#### Scenario: WorkOrder v2 missing or empty capsule_inputs fails closed

- GIVEN a WorkOrder v2 payload with omitted `capsule_inputs` or `capsule_inputs: []`
- WHEN validated against `work-order/v2.schema.json`
- THEN validation MUST fail closed identifying `capsule_inputs`

#### Scenario: Glob, traversal, or absolute capsule_inputs items fail closed

- GIVEN a WorkOrder v2 payload whose `capsule_inputs` contains `src/**`, `../secret`, or `/abs/path`
- WHEN validated against `work-order/v2.schema.json`
- THEN validation MUST fail closed identifying the invalid item

#### Scenario: WorkOrder v1 and K1 pins remain frozen

- GIVEN `work-order/v1.schema.json` and `K1_SCHEMA_BASELINE`
- WHEN verified after the v2 `capsule_inputs` addition
- THEN v1 schema bytes and K1 pins MUST remain byte-identical to the frozen baseline
