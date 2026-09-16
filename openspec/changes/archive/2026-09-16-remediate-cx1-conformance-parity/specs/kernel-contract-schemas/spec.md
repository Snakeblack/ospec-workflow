# Delta for kernel-contract-schemas

## MODIFIED Requirements

### Requirement: Result Envelope Schema Family and Fixtures {#REQ-kernel-contract-schemas-031}

The kernel contract schemas MUST register and pin the `result-envelope` schema family at version 1 (`schemas/kernel/result-envelope/v1/envelope.schema.json` with `$id: "https://openspec.io/schemas/kernel/result-envelope/v1.schema.json"`). The schema MUST strictly validate:
- `schema_version`: integer strictly equal to const `1`.
- `status`: string enum `["success", "partial", "blocked"]`.
- `executive_summary`: non-empty string (`minLength: 1`).
- `artifacts`: either literal `"inline"` or an array of strings, where every element MUST be a string.
- `next_recommended`: non-empty string (`minLength: 1`).
- `risks`: either a non-empty string (`minLength: 1`) or an array of strings, where every element MUST be a string.
- `skill_resolution`: string enum strictly matching `["injected", "fallback-registry", "fallback-path", "none"]`.

Conditional and structural constraints for parity:
- The schema MUST enforce a conditional rule: when `status == "blocked"`, `question_gate` is strictly required (`if: { "properties": { "status": { "const": "blocked" } } }, then: { "required": ["question_gate"] }`).
- Mandatory text fields in `question_gate` (`reason`, and each question's `header` and `question`, and each option's `label`) MUST enforce `minLength: 1`.
- Mandatory text fields in `assumptions` entries (`id`, `phase`, `statement`, `basis`) MUST enforce `minLength: 1`.
- The root schema `schemas/kernel/result-envelope.schema.json` MUST maintain identical structural compatibility and constraints matching `envelope.schema.json` v1.
- Both schemas MUST maintain exact validation parity with the JavaScript (`scripts/lib/result-envelope.js`) and Go (`internal/resultenvelope/resultenvelope.go`) runtime validators.

Optional and phase-aware fields MUST enforce strict structural types when present:
- `verify_outcome`: optional string property strictly constrained to enum `["PASS", "PASS WITH WARNINGS", "FAIL"]`.
- `question_gate`: object requiring `reason` (string, `minLength: 1`) and `questions` (array of objects requiring `header` (string, `minLength: 1`), `question` (string, `minLength: 1`), and `options` array, where each option requires `label` (string, `minLength: 1`) and optional `description` and `recommended` boolean).
- `assumptions`: array of objects requiring `id` (string, `minLength: 1`), `phase` (string, `minLength: 1`), `statement` (string, `minLength: 1`), `reversibility` (enum `["low", "high"]`), and `basis` (string, `minLength: 1`).
- `key_decisions` (max 3 non-empty strings), `blocker_type` (enum `needs_user_decision`, `design-mismatch`, `spec-change-required`, `workload-escalation`), `runtime_observability`, `approval_updates`, and `sdd-spec` ambiguity signals (`residual_ambiguity: boolean`, `public_contract_questions: string[]`, `conflicting_requirements: string[]`, `missing_acceptance_criteria: string[]`).

The schema family MUST ship with valid fixtures and invalid fixtures exercising required fields, array element types, enum constraints, question gates, and verify outcomes. Specifically, dedicated negative fixtures in `schemas/kernel/result-envelope/v1/fixtures/invalid/` MUST exist for:
1. Payloads with `status: "blocked"` omitting `question_gate`.
2. Payloads containing empty strings (`""`) in mandatory `question_gate` text fields.
3. Payloads containing empty strings (`""`) in mandatory `assumptions` text fields.

(Previously: envelope.schema.json v1 permitted status: "blocked" without question_gate, did not enforce minLength: 1 on mandatory text fields in question_gate and assumptions, and lacked dedicated invalid fixtures for blocked without question_gate and empty strings.)

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

#### Scenario: Blocked status without question_gate fails schema validation

- GIVEN a result envelope with `status: "blocked"` where `question_gate` is omitted
- WHEN validated against `schemas/kernel/result-envelope/v1/envelope.schema.json`
- THEN validation MUST fail closed identifying missing required `question_gate`

#### Scenario: Empty string in question_gate text fields fails schema validation

- GIVEN a result envelope with `question_gate` where `reason`, `header`, `question`, or `label` is an empty string
- WHEN validated against `schemas/kernel/result-envelope/v1/envelope.schema.json`
- THEN validation MUST fail closed identifying the `minLength` violation

#### Scenario: Empty string in assumptions text fields fails schema validation

- GIVEN a result envelope with `assumptions` where `id`, `phase`, `statement`, or `basis` is an empty string
- WHEN validated against `schemas/kernel/result-envelope/v1/envelope.schema.json`
- THEN validation MUST fail closed identifying the `minLength` violation

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

#### Scenario: Root schema result-envelope.schema.json maintains identical parity

- GIVEN the backward-compatible schema `schemas/kernel/result-envelope.schema.json`
- WHEN evaluated against the valid and invalid fixture suite
- THEN it MUST reject blocked envelopes without question_gate and empty strings in question_gate/assumptions identically to v1
