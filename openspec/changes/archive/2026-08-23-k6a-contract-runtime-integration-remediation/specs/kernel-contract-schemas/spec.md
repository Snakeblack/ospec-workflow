# Delta for kernel-contract-schemas

## MODIFIED Requirements

### Requirement: Workspace Descriptor And Capsule Definition Schema Families {#REQ-kernel-contract-schemas-021}

The contract suite MUST publish `workspace-descriptor/v1.schema.json` (`$id: "ospec://schemas/kernel/workspace-descriptor/v1"`) and `capsule-definition/v1.schema.json` (`$id: "ospec://schemas/kernel/capsule-definition/v1"`) with explicit `schema_version: 1`.

`workspace-descriptor/v1` MUST require `schema_version`, `workspace_id` (string matching `^ws-[a-f0-9-]+$`), `root_path` (string), `source_snapshot_id` (string matching `^sha256:[a-f0-9]{64}$`), `status` (`active | disposed | interrupted`), and `created_at` (ISO date-time string).

`capsule-definition/v1` MUST require `schema_version`, `capsule_id` (string), `fingerprint` (string matching `^sha256:[a-f0-9]{64}$`), `source_snapshot_id` (string matching `^sha256:[a-f0-9]{64}$`), `dependencies` (array of SHA-256 WorkOrderId strings matching `^sha256:[a-f0-9]{64}$` or dependency strings), `allowed_paths` (array of string path patterns), and `environment` (object), and MAY declare `capsule_inputs` (array of relative file path strings).

Both schemas MUST enforce `additionalProperties: false` and ship valid and invalid fixtures demonstrating schema validation and rejection of missing required fields or invalid property patterns.
(Previously: Capsule definition schema did not support decoupled capsule_inputs alongside SHA-256 DAG dependencies.)

#### Scenario: Valid workspace descriptor and capsule definition fixtures pass validation

- GIVEN valid workspace-descriptor and capsule-definition payload objects
- WHEN validated against their respective schemas
- THEN validation MUST succeed

#### Scenario: Workspace descriptor with invalid status or malformed source_snapshot_id fails validation

- GIVEN a workspace descriptor fixture with `status: "unknown"` or malformed `source_snapshot_id`
- WHEN validated against `workspace-descriptor/v1.schema.json`
- THEN validation MUST fail closed identifying the invalid property

#### Scenario: Capsule definition missing allowed_paths or dependencies fails validation

- GIVEN a capsule definition payload missing `allowed_paths` or `dependencies`
- WHEN validated against `capsule-definition/v1.schema.json`
- THEN validation MUST fail closed identifying the missing required property
