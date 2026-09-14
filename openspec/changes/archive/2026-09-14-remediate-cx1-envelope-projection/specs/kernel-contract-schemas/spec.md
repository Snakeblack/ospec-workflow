# Delta for kernel-contract-schemas

## MODIFIED Requirements

### Requirement: Result Envelope Schema Family and Fixtures {#REQ-kernel-contract-schemas-031}

The kernel contract schemas MUST register and pin the `result-envelope` schema family at version 1 (`schemas/kernel/result-envelope/v1/envelope.schema.json` with `$id: "https://openspec.io/schemas/kernel/result-envelope/v1.schema.json"`). The schema MUST strictly validate:
- `schema_version`: integer strictly equal to const `1`.
- `status`: string enum `["success", "partial", "blocked"]`.
- `executive_summary`: non-empty string.
- `artifacts`: either literal `"inline"` or an array of strings, where every element MUST be a string.
- `next_recommended`: non-empty string.
- `risks`: either a non-empty string or an array of strings, where every element MUST be a string.
- `skill_resolution`: string enum strictly matching `["injected", "fallback-registry", "fallback-path", "none"]`.

Optional and phase-aware fields MUST enforce strict structural types when present:
- `verify_outcome`: optional string property strictly constrained to enum `["PASS", "PASS WITH WARNINGS", "FAIL"]`.
- `question_gate`: object requiring `reason` (string) and `questions` (array of objects requiring `header`, `question`, and `options` array, where each option requires `label` and optional `description` and `recommended` boolean).
- `assumptions`, `key_decisions` (max 3 non-empty strings), `blocker_type` (enum `needs_user_decision`, `design-mismatch`, `spec-change-required`, `workload-escalation`), `runtime_observability`, `approval_updates`, and `sdd-spec` ambiguity signals (`residual_ambiguity: boolean`, `public_contract_questions: string[]`, `conflicting_requirements: string[]`, `missing_acceptance_criteria: string[]`).

The schema family MUST ship with valid fixtures and invalid fixtures exercising required fields, array element types, enum constraints, question gates, and verify outcomes.

(Previously: Result Envelope v1 schema lacked verify_outcome, did not enforce string item types on artifacts and risks, and lacked strict enum constraints on skill_resolution.)

#### Scenario: Valid result-envelope v1 fixture passes validation

- GIVEN a compliant `result-envelope/v1` payload
- WHEN validated against `schemas/kernel/result-envelope/v1/envelope.schema.json`
- THEN validation MUST succeed without errors

#### Scenario: Invalid fixture with missing required field fails validation

- GIVEN a result envelope payload missing `status` or `executive_summary`
- WHEN validated against the `result-envelope/v1` schema
- THEN validation MUST fail
- AND MUST identify the missing required property

#### Scenario: Valid blocked fixture with question_gate passes validation

- GIVEN a result envelope with `status: "blocked"` and a valid `question_gate` object
- WHEN validated against the schema
- THEN validation MUST succeed

#### Scenario: Valid sdd-spec success fixture with ambiguity signals passes validation

- GIVEN an `sdd-spec` success envelope containing `residual_ambiguity: false` and the three signal string arrays
- WHEN validated against the schema
- THEN validation MUST succeed

#### Scenario: Valid verify_outcome conforms to schema enum

- GIVEN a result-envelope carrying `verify_outcome` with `"PASS"`, `"PASS WITH WARNINGS"`, or `"FAIL"`
- WHEN validated against `schemas/kernel/result-envelope/v1/envelope.schema.json`
- THEN validation MUST succeed

#### Scenario: Invalid verify_outcome enum fails schema validation

- GIVEN a result-envelope carrying `verify_outcome` with `"UNKNOWN"` or `"PASS WITH DEFECTS"`
- WHEN validated against `schemas/kernel/result-envelope/v1/envelope.schema.json`
- THEN validation MUST fail closed identifying the invalid enum value

#### Scenario: Non-string elements in artifacts or risks fail schema validation

- GIVEN a result-envelope where `artifacts` contains a number or `risks` contains an object
- WHEN validated against `schemas/kernel/result-envelope/v1/envelope.schema.json`
- THEN validation MUST fail closed identifying the array item type violation

#### Scenario: Invalid skill_resolution enum fails schema validation

- GIVEN a result-envelope with `skill_resolution` equal to `"custom-resolver"` or `"auto"`
- WHEN validated against `schemas/kernel/result-envelope/v1/envelope.schema.json`
- THEN validation MUST fail closed identifying the invalid enum value

#### Scenario: Malformed question_gate object fails schema validation

- GIVEN an envelope with `question_gate` missing `reason` or containing questions without `header`
- WHEN validated against `schemas/kernel/result-envelope/v1/envelope.schema.json`
- THEN validation MUST fail closed identifying the structural defect in `question_gate`
