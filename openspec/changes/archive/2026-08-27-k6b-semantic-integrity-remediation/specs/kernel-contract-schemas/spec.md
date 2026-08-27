# Delta for kernel-contract-schemas

## MODIFIED Requirements

### Requirement: Additive Assessment Binding Family Distinct From Evidence And Verification {#REQ-kernel-contract-schemas-027}

The suite MUST publish an additive assessment/binding schema family with a
distinct `$id` and explicit `schema_version`. Exact `$id` is design-owned.
Required persistable fields: assessment identity, `evidence_id`, `role`,
`obligation_id`, `node_id`, `candidate_id` (`^sha256:[a-f0-9]{64}$`), bound
policy-snapshot identity, and an additive coverage field recording the
satisfied `required_evidence` tokens (exact field name design-owned).
Assessment identity MUST incorporate `role` and `obligation_id`. The schema
MUST enforce `additionalProperties: false` and MUST NOT include `verdict`.
The family MUST NOT validate as `evidence/v2` or `verification/v2`.
`evidence/v2`, `verification/v2`, and K1 v1 schema bytes and
`K1_SCHEMA_BASELINE` pins MUST remain byte-identical. Valid and invalid
fixtures MUST cover a complete binding including coverage, missing required
fields, omitted coverage, and cross-family substitution.
(Previously: assessment/binding required identity fields but no persistable coverage of satisfied required_evidence tokens.)

#### Scenario: Valid assessment fixture passes

- GIVEN a complete assessment/binding payload with role, obligation_id, node_id, evidence_id, policy-snapshot identity, and the additive coverage field
- WHEN validated against the assessment/binding schema
- THEN validation MUST succeed

#### Scenario: Cross-family substitution and verdict fail closed

- GIVEN an assessment payload validated as evidence/v2 or verification/v2, or an assessment payload that includes `verdict`
- WHEN schema validation runs
- THEN validation MUST fail closed identifying kind or required-field mismatch

#### Scenario: Four-role assessments remain distinct under the schema

- GIVEN four assessment payloads that share one `evidence_id` and differ only by `role`
- WHEN each is validated and identities are compared
- THEN all four MUST be schema-valid
- AND their assessment identities MUST be pairwise distinct

#### Scenario: Assessment fixture without coverage field fails closed

- GIVEN an assessment/binding payload that omits the additive coverage field
- WHEN validated against the assessment/binding schema
- THEN validation MUST fail closed identifying the missing coverage field

#### Scenario: Evidence v2, verification v2, and K1 v1 pins remain frozen

- GIVEN `evidence/v2.schema.json`, `verification/v2.schema.json`, K1 v1 schemas, and `K1_SCHEMA_BASELINE`
- WHEN verified after the additive coverage field is present on assessment/binding
- THEN those schema and fixture bytes and K1 pins MUST remain byte-identical
