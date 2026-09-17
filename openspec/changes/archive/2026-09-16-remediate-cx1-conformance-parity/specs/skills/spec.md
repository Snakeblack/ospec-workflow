# Delta for skills

## MODIFIED Requirements

### Requirement: Versioned Result Envelope v1 Emission Contract {#REQ-skills-018}

Every SDD phase skill MUST emit its completion outcome conforming strictly to the `result-envelope/v1` JSON schema (`schemas/kernel/result-envelope/v1/envelope.schema.json`). The envelope MUST be emitted as a machine-parseable JSON object carrying `schema_version: 1`, `status`, `executive_summary`, `artifacts`, `next_recommended`, `risks`, and `skill_resolution`.

Phase-specific emission contracts:
- `sdd-verify` MUST emit the canonical `verify_outcome` field in its return envelope, strictly constrained to `"PASS"`, `"PASS WITH WARNINGS"`, or `"FAIL"`.
- `sdd-spec` MUST emit all four ambiguity signals (`residual_ambiguity`, `public_contract_questions`, `conflicting_requirements`, `missing_acceptance_criteria`) for `status: "success"`.

Validator and schema parity across runtimes:
The reference implementations in JavaScript (`scripts/lib/result-envelope.js`) and Go (`internal/resultenvelope/resultenvelope.go`) MUST maintain strict parity with `envelope.schema.json`:
- Both runtimes MUST require `schema_version == 1` and reject any payload with missing or non-1 `schema_version`.
- Both runtimes MUST enforce that array items in `artifacts` and `risks` are strings.
- Both runtimes MUST validate `skill_resolution` against the closed enum `["injected", "fallback-registry", "fallback-path", "none"]`.
- Both runtimes MUST require `question_gate` when `status == "blocked"`, rejecting payloads where `question_gate` is missing or null.
- Both runtimes MUST validate `question_gate` structural requirements (`reason` non-empty string, `questions` array of objects with `header` non-empty string, `question` non-empty string, and `options` array with `label` non-empty string).
- Both runtimes MUST enforce non-empty string constraints (`minLength: 1`) on `assumptions` fields (`id`, `phase`, `statement`, `basis`).
- Both runtimes MUST validate `verify_outcome` against `["PASS", "PASS WITH WARNINGS", "FAIL"]` when present.

Automated differential conformance validation:
The repository MUST provide automated differential conformance test suites in Node.js (`scripts/lib/result-envelope-conformance.test.js`) and Go (`internal/resultenvelope/conformance_test.go`).
- Both test suites MUST load the complete matrix of shared fixtures from `schemas/kernel/result-envelope/v1/fixtures/` (both `valid/` and `invalid/` directories).
- For every fixture in the matrix, the test suites MUST assert strict three-way parity: `schema.valid === js.valid === go.valid`.
- Any divergence where JSON Schema, JS validator, or Go validator disagree on acceptance or rejection MUST fail the test suite.

(Previously: REQ-skills-018 did not require automated differential conformance suites asserting schema.valid === js.valid === go.valid across all shared fixtures in Node and Go, nor explicit schema/validator parity for blocked requiring question_gate and minLength constraints on question_gate and assumptions strings.)

#### Scenario: Valid v1 envelope emitted on phase completion

- GIVEN an SDD phase completing its execution turn
- WHEN the phase agent composes its return payload
- THEN it MUST emit a JSON object carrying `schema_version: 1` and all required `result-envelope/v1` fields
- AND optional fields not relevant to the execution turn MUST be omitted

#### Scenario: Blocked status includes required question gate and blocker type

- GIVEN an SDD phase requiring user decision or encountering a workflow blocker
- WHEN the phase agent composes its return payload
- THEN `status` MUST be `"blocked"`
- AND `question_gate` and `blocker_type` MUST be present and valid according to the schema

#### Scenario: Successful sdd-spec envelope includes ambiguity signals

- GIVEN `sdd-spec` completing with `status: "success"`
- WHEN the envelope is composed
- THEN `residual_ambiguity`, `public_contract_questions`, `conflicting_requirements`, and `missing_acceptance_criteria` MUST be present and type-valid

#### Scenario: sdd-verify emits mandatory canonical verify_outcome

- GIVEN `sdd-verify` completes its verification execution
- WHEN it composes its return envelope
- THEN `verify_outcome` MUST be present
- AND `verify_outcome` MUST equal `"PASS"`, `"PASS WITH WARNINGS"`, or `"FAIL"`

#### Scenario: JS and Go validators require schema_version == 1

- GIVEN a result envelope payload where `schema_version` is missing or not equal to `1`
- WHEN validated using JS or Go validators
- THEN validation MUST fail closed in both runtimes
- AND error MUST cite `schema_version`

#### Scenario: JS and Go validators enforce array item string types

- GIVEN a result envelope where `artifacts` or `risks` contains a non-string item
- WHEN validated using JS or Go validators
- THEN validation MUST fail closed in both runtimes identifying the non-string item

#### Scenario: JS and Go validators enforce skill_resolution enum

- GIVEN a result envelope where `skill_resolution` is not one of `injected`, `fallback-registry`, `fallback-path`, `none`
- WHEN validated using JS or Go validators
- THEN validation MUST fail closed in both runtimes identifying the invalid enum

#### Scenario: JS and Go validators enforce question_gate structure

- GIVEN a blocked result envelope where `question_gate` lacks `reason` or questions lack `header` or `options`
- WHEN validated using JS or Go validators
- THEN validation MUST fail closed in both runtimes

#### Scenario: Automated differential conformance validation across all shared fixtures in Node and Go

- GIVEN the shared fixture catalog in `schemas/kernel/result-envelope/v1/fixtures/` containing both valid and invalid fixtures
- WHEN differential conformance suites execute in Node (`scripts/lib/result-envelope-conformance.test.js`) and Go (`internal/resultenvelope/conformance_test.go`)
- THEN for every fixture, the schema validation verdict, JavaScript validator verdict, and Go validator verdict MUST match exactly (`schema.valid === js.valid === go.valid`)
- AND no fixture MAY produce divergent acceptance or rejection across any validator or schema

#### Scenario: Differential conformance rejects blocked fixture without question_gate across all runtimes

- GIVEN a fixture with `status: "blocked"` and no `question_gate`
- WHEN evaluated by JSON Schema, JS validator, and Go validator
- THEN `schema.valid` MUST be `false`
- AND `js.valid` MUST be `false`
- AND `go.valid` MUST be `false`

#### Scenario: Differential conformance rejects empty string fields across all runtimes

- GIVEN a fixture with empty string values in mandatory fields of `question_gate` or `assumptions`
- WHEN evaluated by JSON Schema, JS validator, and Go validator
- THEN `schema.valid` MUST be `false`
- AND `js.valid` MUST be `false`
- AND `go.valid` MUST be `false`
