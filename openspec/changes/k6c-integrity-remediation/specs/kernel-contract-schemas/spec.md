# Delta for kernel-contract-schemas

## MODIFIED Requirements

### Requirement: Challenge Plan And Challenge Result Schema Families {#REQ-kernel-contract-schemas-029}

The contract suite MUST publish `challenge-plan/v1.schema.json` (`$id: "ospec://schemas/kernel/challenge-plan/v1"`, `schema_version: 1`, `kind: "challenge-plan/v1"`) and `challenge-result/v1.schema.json` (`$id: "ospec://schemas/kernel/challenge-result/v1"`, `schema_version: 1`, `kind: "challenge-result/v1"`).

`challenge-plan/v1` MUST require: `schema_version`, `kind`, `plan_id` (`^sha256:[a-f0-9]{64}$`), `candidate_id` (`^sha256:[a-f0-9]{64}$`), non-empty `node_id`, `policy_snapshot_id` (`^sha256:[a-f0-9]{64}$`), `evidence_strategy` (`bug | feature | refactor | migration | config-docs | strict-tdd`), `selected` (unique ChallengeType strings), `skipped` (unique `{challenge_type, reason}` objects), `reasons`, and `budget` with `max_challenges`, `mutation_budget`, and positive `timeout_seconds`.

`challenge-result/v1` MUST require: `schema_version`, `kind`, `result_id` (`^sha256:[a-f0-9]{64}$`), `plan_id`, `candidate_id`, non-empty `node_id`, `policy_snapshot_id`, `evidence_strategy`, `challenge_type` from the closed catalog, `outcome` (`passed | failed | error`), `evidence_ids`, and `details`. Plan/result identities MUST be content-addressed and recomputable from their canonical required fields. Both schemas MUST enforce `additionalProperties: false`.

Both families MUST be registered in `schemas/kernel/manifest.json` and `schemas/kernel/contract-claims.json`. Challenge schemas MUST NOT validate as `evidence/v2`, `verification/v2`, CandidateEvaluationAttestation, or DeliveryAuthorization. `evidence/v2`, `verification/v2`, and K1 v1 schema bytes and K1_SCHEMA_BASELINE pins MUST remain byte-identical. The family MUST ship valid fixtures and negative fixtures for missing bindings, malformed hashes, duplicate selected types, and cross-bound plan/result substitution.

(Previously: plans lacked required node binding and results lacked PolicySnapshot and strategy bindings; the family did not require canonical identity checks or these integrity fixtures.)

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
