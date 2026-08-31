# Delta for Kernel Contract Schemas

## MODIFIED Requirements

### Requirement: Challenge Plan And Challenge Result Schema Families {#REQ-kernel-contract-schemas-029}

The contract suite MUST publish `challenge-plan/v1.schema.json` (`$id: "ospec://schemas/kernel/challenge-plan/v1"`, `schema_version: 1`, `kind: "challenge-plan/v1"`) and `challenge-result/v1.schema.json` (`$id: "ospec://schemas/kernel/challenge-result/v1"`, `schema_version: 1`, `kind: "challenge-result/v1"`).

`challenge-plan/v1` MUST require: `schema_version`, `kind`, `plan_id` (`^sha256:[a-f0-9]{64}$`), `candidate_id` (`^sha256:[a-f0-9]{64}$`), non-empty `node_id`, `policy_snapshot_id` (`^sha256:[a-f0-9]{64}$`), `evidence_strategy` (`bug | feature | refactor | migration | config-docs | strict-tdd`), `selected` (unique ChallengeType strings), `skipped` (unique `{challenge_type, reason}` objects), `reasons`, and `budget` with `max_challenges`, `mutation_budget`, and positive `timeout_seconds`.

`challenge-result/v1` MUST require, listing each name exactly once: `schema_version`, `kind`, `result_id` (`^sha256:[a-f0-9]{64}$`), `plan_id`, `candidate_id`, non-empty `node_id`, `policy_snapshot_id`, `evidence_strategy`, `challenge_type` from the closed catalog, `outcome` (`passed | failed | error`), `evidence_ids`, and `details`. The schema `required` array MUST NOT contain duplicate members (including a repeated `node_id`). Plan/result identities MUST be content-addressed and recomputable from their canonical required fields. Both schemas MUST enforce `additionalProperties: false`.

Every published kernel schema, including `challenge-result/v1`, MUST validate as an instance of the JSON Schema Draft 2020-12 metaschema. Checking only that the schema document's `$schema` URI equals the Draft 2020-12 identifier is insufficient.

Both families MUST be registered in `schemas/kernel/manifest.json` and `schemas/kernel/contract-claims.json`. Challenge schemas MUST NOT validate as `evidence/v2`, `verification/v2`, CandidateEvaluationAttestation, or DeliveryAuthorization. `evidence/v2`, `verification/v2`, and K1 v1 schema bytes and K1_SCHEMA_BASELINE pins MUST remain byte-identical. The family MUST ship valid fixtures and negative fixtures for missing bindings, malformed hashes, duplicate selected types, and cross-bound plan/result substitution.

(Previously: challenge-result/v1 required listed node_id twice, and suite checks treated a Draft 2020-12 $schema URI as sufficient without metaschema instance validation.)

#### Scenario: Valid challenge-plan v1 payload passes validation

- GIVEN a complete plan with valid candidate_id, node_id, policy_snapshot_id, selected, skipped, and budget
- WHEN validated against challenge-plan/v1.schema.json
- THEN validation MUST succeed

#### Scenario: Challenge-plan missing required fields or unknown challenge type fails closed

- GIVEN a plan omitting budget or node_id, with duplicate selected types, or an unknown selected type
- WHEN schema validation runs
- THEN it MUST fail closed identifying the violating property

#### Scenario: Valid challenge-result v1 payload passes validation

- GIVEN a complete result with valid result_id, plan_id, Candidate, node, PolicySnapshot, strategy, and outcome `passed`
- WHEN validated against challenge-result/v1.schema.json
- THEN validation MUST succeed

#### Scenario: Challenge-result with invalid outcome or binding fails closed

- GIVEN a result with outcome `unresolved`, malformed hash, or absent policy_snapshot_id
- WHEN schema validation runs
- THEN it MUST fail closed identifying the invalid field

#### Scenario: Cross-family substitution fails closed

- GIVEN a challenge-result payload validated as verification/v2 or evidence/v2
- WHEN schema validation runs
- THEN validation MUST fail closed identifying kind or required-field mismatch

#### Scenario: Cross-bound plan and result fixture is rejected

- GIVEN a schema-valid result whose Candidate, node, policy, or strategy differs from its referenced plan
- WHEN contract integrity fixtures validate the pair
- THEN validation MUST fail closed

#### Scenario: Manifest and contract-claims register challenge families

- GIVEN schemas/kernel/manifest.json and contract-claims.json
- WHEN challenge-plan and challenge-result entries are inspected
- THEN each family MUST be registered with its canonical schema path and $id
- AND schema_version MUST be 1

#### Scenario: Challenge-result required array lists each field once

- GIVEN schemas/kernel/challenge-result/v1.schema.json
- WHEN its `required` array is inspected
- THEN each required field name MUST appear exactly once
- AND `node_id` MUST NOT be duplicated

#### Scenario: Duplicate required member fails metaschema even with a Draft 2020-12 URI

- GIVEN a published kernel schema, or a fixture schema, whose `$schema` is the Draft 2020-12 URI and whose `required` array repeats a field name
- WHEN it is validated as an instance of the JSON Schema Draft 2020-12 metaschema
- THEN validation MUST fail closed
- AND success MUST NOT be inferred solely from that `$schema` URI

#### Scenario: Published kernel schemas validate against Draft 2020-12 metaschema

- GIVEN the published kernel schema suite
- WHEN each schema is validated as an instance of the JSON Schema Draft 2020-12 metaschema
- THEN validation MUST succeed
