# Delta for kernel-contract-schemas

## ADDED Requirements

### Requirement: Execution Budget And Authority Effect Budget Schema Families {#REQ-kernel-contract-schemas-019}

The contract suite MUST publish `execution-budget/v1.schema.json` (`$id: "ospec://schemas/kernel/execution-budget/v1"`) and `authority-effect-budget/v1.schema.json` (`$id: "ospec://schemas/kernel/authority-effect-budget/v1"`) with explicit `schema_version: 1`.

`execution-budget/v1` MUST require `schema_version`, `turns` (integer > 0), `patches` (integer >= 0), `commands` (integer >= 0), `wall_time_minutes` (number > 0), `changed_lines` (integer > 0), and `allowed_paths` (array of strings).

`authority-effect-budget/v1` MUST require `schema_version`, `effect_attempts` (integer > 0), `authority_mutations` (integer >= 0), `evidence_runs` (integer >= 0), and `review_sweeps` (integer >= 0).

Both schemas MUST enforce `additionalProperties: false`. The family MUST ship valid and invalid fixtures demonstrating rejection of negative quotas, missing required fields, or unallowlisted properties.

#### Scenario: Valid execution budget and authority budget fixtures pass validation

- GIVEN valid execution-budget and authority-effect-budget payload objects
- WHEN validated against `execution-budget/v1.schema.json` and `authority-effect-budget/v1.schema.json`
- THEN validation MUST succeed

#### Scenario: Budget fixture with negative quota or missing field fails validation

- GIVEN an execution budget fixture with `turns: -1` or missing `changed_lines`
- WHEN schema validation runs
- THEN validation MUST fail closed identifying the invalid property

---

### Requirement: Causal Failure And Recovery Transition Schema Families {#REQ-kernel-contract-schemas-020}

The contract suite MUST publish `causal-failure/v1.schema.json` (`$id: "ospec://schemas/kernel/causal-failure/v1"`) and `failure-recovery-transition/v1.schema.json` (`$id: "ospec://schemas/kernel/failure-recovery-transition/v1"`) with explicit `schema_version: 1`.

`causal-failure/v1` MUST require `schema_version`, `failure_id` (string), `category` (`environment_tooling | cas_conflict | ambiguous_effect | validation_gap | code_defect`), `code` (string), `priority` (integer 1-5), `blocking_fingerprint` (string), and `details` (object).

`failure-recovery-transition/v1` MUST require `schema_version`, `transition_id` (string), `failure_code` (string), `target_operation` (`repair | replan | escalate | stop`), `scope` (object with `node_ids`, `allowed_paths`, `finding_ids`), and `expected_advancement` (boolean).

Both schemas MUST enforce `additionalProperties: false` and ship valid and invalid fixtures.

#### Scenario: Valid causal failure and recovery transition fixtures pass validation

- GIVEN valid causal-failure and failure-recovery-transition payloads
- WHEN validated against their respective schemas
- THEN validation MUST succeed

#### Scenario: Causal failure with invalid category fails validation

- GIVEN a causal-failure payload with category `unknown_error`
- WHEN validated against `causal-failure/v1.schema.json`
- THEN validation MUST fail closed identifying the invalid category enum

---

## MODIFIED Requirements

### Requirement: Versioned Schema Families With Id And Version {#REQ-kernel-contract-schemas-001}

The contract suite MUST publish a versioned JSON Schema for each family: state/transition, classification, contract, graph/node, work order/result, candidate, SourceSnapshot, WorkOrder, WorkResult, Candidate, evidence, verification, finding/review, failure/recovery, receipt, event, OperationPermit, OperationReceipt, effect-class, HostCapabilities, HostAdapter, ExecutionTransport, QuestionTransport, WorkerTransport, ToolExecutionTransport, DeliveryGateTransport, CapabilityProof, transport-request, transport-outcome, transport-failure, execution-graph, policy-snapshot, clarify-event, execution-budget, authority-effect-budget, causal-failure, and failure-recovery-transition. Every schema MUST declare a stable `$id` and an explicit version field (`schema_version` or equivalent). Consumers MUST be able to pin a schema by `$id`/version.
(Previously: K4a added execution-graph, policy-snapshot, and clarify-event families; K5 adds execution-budget, authority-effect-budget, causal-failure, and failure-recovery-transition families.)

#### Scenario: Every required family has $id and version

- GIVEN the published contract suite
- WHEN each required schema family is inspected
- THEN the schema MUST expose a non-empty `$id`
- AND MUST expose an explicit version identifier

#### Scenario: Consumer can pin a schema version

- GIVEN a schema family published at version N
- WHEN a consumer references that family's `$id` and version N
- THEN resolution MUST return the schema for version N
- AND MUST NOT silently substitute a different version

#### Scenario: K2.1 families are included in the required set

- GIVEN the required schema family inventory
- WHEN OperationPermit, OperationReceipt and effect-class are checked
- THEN each MUST be present as a pinned versioned family

#### Scenario: K2a families are included in the required set

- GIVEN the required schema family inventory
- WHEN HostCapabilities, HostAdapter, the five transports and CapabilityProof
  are checked
- THEN each MUST be present as a pinned versioned family

#### Scenario: k2a-1 transport envelope families are included

- GIVEN the required schema family inventory
- WHEN transport-request, transport-outcome, and transport-failure are checked
- THEN each MUST be present as a pinned versioned family

#### Scenario: K3 execution identity families are included in the required set

- GIVEN the required schema family inventory
- WHEN SourceSnapshot, WorkOrder, WorkResult, and Candidate identity schemas are checked
- THEN each MUST be present as a pinned versioned family with distinct $id

#### Scenario: K4a execution graph, policy snapshot, and clarify event families are included in the required set

- GIVEN the required schema family inventory
- WHEN execution-graph, policy-snapshot, and clarify-event schemas are checked
- THEN each MUST be present as a pinned versioned family with a distinct non-empty $id

#### Scenario: K5 budget and failure recovery families are included in the required set

- GIVEN the required schema family inventory
- WHEN execution-budget, authority-effect-budget, causal-failure, and failure-recovery-transition schemas are checked
- THEN each MUST be present as a pinned versioned family with a distinct non-empty $id
