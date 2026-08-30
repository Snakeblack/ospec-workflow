# kernel-contract-schemas Specification

## Purpose

Define the versioned kernel contract suite: JSON Schemas with `$id`/version,
valid/invalid fixtures, aliases, and migration rules that preserve existing
consumer tags — without executing the lifecycle reducer.

## Requirements

### Requirement: Versioned Schema Families With Id And Version {#REQ-kernel-contract-schemas-001}

The contract suite MUST publish a versioned JSON Schema for each family: state/transition, classification, contract, graph/node, work order/result, candidate, SourceSnapshot, WorkOrder, WorkResult, Candidate, evidence, verification, finding/review, failure/recovery, receipt, event, OperationPermit, OperationReceipt, effect-class, HostCapabilities, HostAdapter, ExecutionTransport, QuestionTransport, WorkerTransport, ToolExecutionTransport, DeliveryGateTransport, CapabilityProof, transport-request, transport-outcome, transport-failure, execution-graph, policy-snapshot, clarify-event, execution-budget, authority-effect-budget, causal-failure, failure-recovery-transition, workspace-descriptor, capsule-definition, work-result-execution-payload, containment-violation, assurance-graph, assessment/binding, runner-receipt, challenge-plan, and challenge-result. Every schema MUST declare a stable `$id` and an explicit version field (`schema_version` or equivalent). Consumers MUST be able to pin a schema by `$id`/version.
(Previously: K6b closed the inventory at runner-receipt; K6c adds additive challenge-plan and challenge-result families without mutating evidence/v2, verification/v2, or K1 v1 pins.)

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
- WHEN HostCapabilities, HostAdapter, the five transports and CapabilityProof are checked
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

#### Scenario: K6a worker isolation and containment families are included in the required set

- GIVEN the required schema family inventory
- WHEN workspace-descriptor, capsule-definition, work-result-execution-payload, and containment-violation schemas are checked
- THEN each MUST be present as a pinned versioned family with a distinct non-empty $id

#### Scenario: K6b assurance-graph family is included in the required set

- GIVEN the required schema family inventory
- WHEN assurance-graph is checked
- THEN it MUST be present as a pinned versioned family with a distinct non-empty `$id`
- AND evidence/v2 and verification/v2 MUST be pinnable without mutating K1 evidence/v1 or verification/v1

#### Scenario: Assessment/binding family is included without mutating K6b pins

- GIVEN the required schema family inventory
- WHEN assessment/binding is checked
- THEN it MUST be present as a pinned versioned family with a distinct non-empty `$id`
- AND evidence/v2, verification/v2, and K1 v1 pins MUST remain byte-identical

#### Scenario: Runner-receipt family is included without mutating K6b or K1 pins

- GIVEN the required schema family inventory
- WHEN runner-receipt is checked
- THEN it MUST be present as a pinned versioned family with a distinct non-empty `$id`
- AND evidence/v2, verification/v2, and K1 v1 pins MUST remain byte-identical

#### Scenario: Challenge-plan and challenge-result families are included in the required set

- GIVEN the required schema family inventory
- WHEN challenge-plan and challenge-result are checked
- THEN each MUST be present as a pinned versioned family with a distinct non-empty `$id`
- AND evidence/v2, verification/v2, and K1 v1 pins MUST remain byte-identical

### Requirement:### Requirement: Valid And Invalid Fixtures Per Schema Family {#REQ-kernel-contract-schemas-002}

Each schema family MUST ship at least one fixture that validates successfully
and at least one fixture that MUST be rejected. Fixtures MUST exercise
required fields and at least one material negative case (missing required
field, wrong type, or forbidden extra authority field as applicable).

#### Scenario: Valid fixture passes

- GIVEN a schema family and its valid fixture
- WHEN the fixture is validated against the schema
- THEN validation MUST succeed

#### Scenario: Invalid fixture fails

- GIVEN a schema family and its invalid fixture
- WHEN the fixture is validated against the schema
- THEN validation MUST fail
- AND the failure MUST identify the violating path or rule

---

### Requirement:### Requirement: Versioned Aliases Preserve Existing Tags {#REQ-kernel-contract-schemas-003}

The suite MUST provide versioned aliases that map legacy or current stable
codes/tags to the canonical vocabulary. Migration rules MUST preserve existing
tags: a previously emitted stable tag MUST remain resolvable to an equivalent
canonical code after migration. Aliases MUST NOT silently drop or rename a
known consumer-facing tag without an explicit mapping entry.

#### Scenario: Legacy tag resolves through alias

- GIVEN a legacy stable tag that existing consumers emit
- AND a versioned alias mapping that tag to a canonical code
- WHEN migration/alias resolution runs
- THEN the legacy tag MUST resolve to the mapped canonical code
- AND MUST NOT be reported as unknown solely because of the rename

#### Scenario: Unmapped tag is not silently dropped

- GIVEN a known consumer-facing tag with no alias or migration entry
- WHEN migration/alias resolution runs under a strict mode that requires
  coverage of known tags
- THEN resolution MUST fail closed or report the unmapped tag
- AND MUST NOT drop the tag silently

---

### Requirement:### Requirement: Graph And Work-Order Shapes Are Consumable Contracts Only {#REQ-kernel-contract-schemas-004}

Graph/node and work-order/result schemas MUST be published as consumable
contracts for later kernel work (K2–K4). Publishing those schemas MUST NOT
activate Graph IR as authority and MUST NOT implement or invoke a lifecycle
reducer.

#### Scenario: Graph schema exists without reducer activation

- GIVEN graph/node schemas are published with fixtures
- WHEN the repository is checked for K1 deliverables
- THEN the schemas and fixtures MUST be present and validatable
- AND no lifecycle reducer execution path MUST be introduced solely by those
  schemas

---

### Requirement:### Requirement: Schema Docs Cannot Name Unemitted Fields Or Commands {#REQ-kernel-contract-schemas-005}

Contract documentation and fixtures that claim to describe emitted surfaces
MUST NOT name a field, operation, or command that the emitting code does not
produce. Such mismatches MUST be detectable by contract validation (enforced
via `contract-lint` checkers).

#### Scenario: Fixture field absent from emitter is rejected

- GIVEN a fixture or contract doc that names field `F` as emitted
- AND the emitter under test never produces `F`
- WHEN emission/contract validation runs
- THEN the check MUST report an offender for `F`

---

### Requirement:### Requirement: Permit Receipt And Effect-Class Contract Families {#REQ-kernel-contract-schemas-006}

The contract suite MUST publish versioned JSON Schemas for `OperationPermit`,
`OperationReceipt`, and effect-class (or effect-intent class) contracts. Each
family MUST declare a stable `$id` and explicit version. `OperationReceipt`
MUST use a distinct kind/schema from `receipt/v1` and MUST NOT be an alias of
Candidate Evaluation Attestation or Delivery Authorization schemas.

#### Scenario: New families expose $id and version

- GIVEN the published K2.1 contract suite
- WHEN OperationPermit, OperationReceipt and effect-class schemas are inspected
- THEN each MUST expose a non-empty `$id`
- AND MUST expose an explicit version identifier

#### Scenario: OperationReceipt is not receipt/v1

- GIVEN the OperationReceipt schema and the existing receipt/v1 schema
- WHEN their `$id`/kind identifiers are compared
- THEN they MUST be distinct
- AND OperationReceipt MUST NOT resolve as an alias of receipt/v1

#### Scenario: Valid and invalid permit fixtures

- GIVEN OperationPermit valid and invalid fixtures
- WHEN each is validated against the permit schema
- THEN the valid fixture MUST succeed
- AND the invalid fixture MUST fail identifying the violating path or rule

---

### Requirement:### Requirement: Effect Class Enumeration Is Closed {#REQ-kernel-contract-schemas-007}

Effect-class contracts MUST accept only
`pure | idempotent-keyed | probeable | compensatable | irreversible`. Any other
value MUST fail schema validation.

#### Scenario: Unknown effect class is rejected

- GIVEN an effect-class fixture with value `exactly-once`
- WHEN schema validation runs
- THEN validation MUST fail
- AND the failure MUST identify the class field

---

### Requirement:### Requirement: Host And Capability-Proof Contract Families {#REQ-kernel-contract-schemas-008}

The contract suite MUST publish versioned JSON Schemas for `HostCapabilities`,
`HostAdapter`, each of the five transport contracts, and `CapabilityProof`.
Each family MUST declare a stable `$id` and explicit version.
`CapabilityProof` and host/transport contracts MUST use distinct kinds/schemas
from `receipt/v1` and `OperationReceipt`, and MUST NOT alias Candidate
Evaluation Attestation or Delivery Authorization schemas.

#### Scenario: Host families expose $id and version

- GIVEN the published K2a contract suite
- WHEN HostCapabilities, HostAdapter, transport, and CapabilityProof schemas
  are inspected
- THEN each MUST expose a non-empty `$id`
- AND MUST expose an explicit version identifier

#### Scenario: CapabilityProof is not receipt/v1 or OperationReceipt

- GIVEN CapabilityProof schema beside receipt/v1 and OperationReceipt
- WHEN their `$id`/kind identifiers are compared
- THEN CapabilityProof MUST be distinct from both
- AND MUST NOT resolve as an alias of either

#### Scenario: Valid and invalid HostCapabilities fixtures

- GIVEN HostCapabilities valid and invalid fixtures
- WHEN each is validated against the schema
- THEN the valid fixture MUST succeed
- AND the invalid fixture MUST fail identifying the violating path or rule

---

### Requirement:### Requirement: Capability State Enumeration Is Closed {#REQ-kernel-contract-schemas-009}

Host capability-state fields MUST accept only
`enforced | partial | instructional | unavailable`. Any other value MUST fail
schema validation.

#### Scenario: Unknown capability state is rejected

- GIVEN a HostCapabilities fixture with state `enabled`
- WHEN schema validation runs
- THEN validation MUST fail
- AND the failure MUST identify the state field

---

### Requirement:### Requirement: CapabilityProof Required Fields Are Closed {#REQ-kernel-contract-schemas-010}

CapabilityProof schemas MUST require `adapter_version`, `host_version`,
`fixture`, and `evidence_digest` as non-empty fields. Omitting any required
field MUST fail schema validation.

#### Scenario: Incomplete proof fixture fails

- GIVEN a CapabilityProof fixture missing `fixture`
- WHEN schema validation runs
- THEN validation MUST fail
- AND the failure MUST identify the missing required field

---

### Requirement:### Requirement: Transport Request Outcome And Failure Families {#REQ-kernel-contract-schemas-011}

The contract suite MUST publish additive versioned JSON Schema families
`transport-request`, `transport-outcome`, and `transport-failure` at v1. Each
family MUST declare a stable `$id` and explicit version distinct from the five
existing transport port schemas. Existing transport v1 `$id`s MUST remain
pinned and MUST NOT be silently mutated. Each new family MUST ship at least one
valid and one invalid fixture.

`transport-request` MUST allow `requestId` and MAY carry `AbortSignal`/deadline
descriptors as schema-representable fields. `transport-outcome` MUST distinguish
success (`ok: true`) from failure. `transport-failure` MUST require `ok: false`
and a stable failure class covering at least timeout, cancel, reject, interrupt,
and worker-fail.

#### Scenario: Additive families expose $id and version

- GIVEN the published contract suite after this change
- WHEN transport-request, transport-outcome, and transport-failure schemas are
  inspected
- THEN each MUST expose a non-empty `$id`
- AND MUST expose an explicit version identifier
- AND MUST NOT alias an existing transport port `$id`

#### Scenario: Existing transport v1 ids remain unchanged

- GIVEN the five existing transport port schemas published at v1
- WHEN their `$id` values are compared to the pre-change pins
- THEN each `$id` MUST remain identical
- AND MUST NOT be silently rewritten by the additive families

#### Scenario: Valid and invalid transport-failure fixtures

- GIVEN transport-failure valid and invalid fixtures
- WHEN each is validated against the schema
- THEN the valid fixture MUST succeed
- AND the invalid fixture MUST fail identifying the violating path or rule

#### Scenario: Outcome success cannot claim ok false simultaneously

- GIVEN a transport-outcome fixture with contradictory ok/success markers
- WHEN schema validation runs
- THEN validation MUST fail closed

---

### Requirement:### Requirement: Execution Identity Schemas With Non-Aliasing Fixtures {#REQ-kernel-contract-schemas-012}

The contract suite MUST publish versioned JSON Schemas for `SourceSnapshot`, `WorkOrder`, `WorkResult`, and `Candidate` execution identity families. Each identity schema MUST declare a stable `$id` and explicit version field. The suite MUST define `candidate/v2.schema.json` (`$id: "ospec://schemas/kernel/candidate/v2"`) and `work-order/v2.schema.json` (`$id: "ospec://schemas/kernel/work-order/v2"`) with explicit `kind` field (`"candidate/v2"` and `"work-order/v2"`). WorkOrder v2 MUST require `source_snapshot_id` matching exactly `sha256:<64 lowercase hexadecimal characters>`; valid values MUST be preserved exactly by validation and consumers MUST NOT accept an absent, malformed, normalized, or substituted value. WorkOrder v2 `dependencies` array items MUST match pattern `^sha256:[a-f0-9]{64}$` representing canonical `WorkOrderId` sha256 digests of upstream prerequisite work orders. Candidate v2 MUST require `relation` and constrain it exactly to `exact`, `changed`, `ambiguous`, or `unknown`; it MUST allow nullable `predecessor_id` only as lineage metadata and MUST NOT retain aliases or retired relation values. `source-snapshot/v1.schema.json` and `work-result/v1.schema.json` MUST permit an optional `kind` property matching `"source-snapshot/v1"` and `"work-result/v1"` respectively without violating `additionalProperties: false`. Baseline `candidate/v1.schema.json`, `work-order/v1.schema.json`, and `K1_SCHEMA_BASELINE` MUST remain byte-identical immutable contracts. The suite MUST NOT retarget K1 pins to match altered v1 contents. Each identity family MUST include valid fixtures and negative non-aliasing fixtures demonstrating that `WorkResult` cannot validate as `Candidate`, and `Candidate` cannot validate as `CandidateEvaluationAttestation` or `DeliveryAuthorization`. Candidate fixtures MUST additionally prove rejection of retired relation vocabulary, impossible predecessor/relation combinations, commit projection, symlink changes, case-distinct paths, and projection changes.
(Previously: WorkOrder v2 dependencies items were unconstrained strings without sha256 digest pattern enforcement.)

#### Scenario: K3 identity families expose stable id and version

- GIVEN the published schemas for SourceSnapshot, WorkOrder, WorkResult, and Candidate
- WHEN each schema is inspected
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

#### Scenario: WorkOrder v2 requires and preserves a valid source snapshot identifier

- GIVEN a WorkOrder v2 payload with `source_snapshot_id` matching `sha256:<64 lowercase hexadecimal characters>`
- WHEN it is validated and consumed
- THEN validation MUST succeed
- AND the consumed identifier MUST equal the supplied identifier byte-for-byte

#### Scenario: WorkOrder v2 requires dependencies items to match sha256 digest pattern

- GIVEN a WorkOrder v2 payload with `dependencies` array containing strings not matching `^sha256:[a-f0-9]{64}$`
- WHEN validated against `work-order/v2.schema.json`
- THEN validation MUST fail closed identifying the invalid dependency pattern

#### Scenario: WorkOrder v2 rejects absent or malformed source snapshot identifier

- GIVEN a WorkOrder v2 payload with an absent, empty, uppercase, shortened, or otherwise malformed `source_snapshot_id`
- WHEN schema validation runs
- THEN validation MUST fail closed
- AND no alternate identifier MAY be inferred or substituted

#### Scenario: Candidate v2 rejects retired relation and inconsistent successor fixture

- GIVEN Candidate v2 fixtures using `superset` or a distinct predecessor with relation `exact`
- WHEN validated against the Candidate v2 schema and K3 contract fixture suite
- THEN each fixture MUST fail closed
- AND the failure MUST identify relation vocabulary or lineage coherence

#### Scenario: Legacy v1 schemas and K1 baseline remain byte-identical and immutable

- GIVEN `candidate/v1.schema.json`, `work-order/v1.schema.json`, and `K1_SCHEMA_BASELINE` pins
- WHEN verified against repository schema baseline rules
- THEN the v1 schemas and K1 pins MUST remain byte-identical to their frozen baseline
- AND validation MUST reject any pin-only retarget that masks changed v1 content

#### Scenario: Legacy WorkOrder v1 fixtures remain valid alongside v2

- GIVEN valid pre-existing `work-order/v1` fixtures and valid WorkOrder v2 fixtures
- WHEN each fixture is validated against its pinned schema
- THEN each v1 fixture MUST remain valid under `work-order/v1`
- AND each v2 fixture MUST validate only under `work-order/v2`

#### Scenario: SourceSnapshot v1 and WorkResult v1 allow optional kind property

- GIVEN a SourceSnapshot v1 or WorkResult v1 payload carrying `kind: "source-snapshot/v1"` or `kind: "work-result/v1"`
- WHEN validated against `source-snapshot/v1.schema.json` or `work-result/v1.schema.json`
- THEN validation MUST succeed
- AND MUST NOT fail with `additionalProperties: false`

---

### Requirement:### Requirement: Canonical V2 Identity Schema Publication And Registry {#REQ-kernel-contract-schemas-013}

Candidate v2 and WorkOrder v2 schemas MUST be published at filesystem paths `schemas/kernel/candidate/v2.schema.json` and `schemas/kernel/work-order/v2.schema.json` with `$id` values `ospec://schemas/kernel/candidate/v2` and `ospec://schemas/kernel/work-order/v2` respectively. Both schemas MUST be registered in `schemas/kernel/manifest.json` and `schemas/kernel/contract-claims.json`. Publication under wrong directory layouts `schemas/kernel/candidate-v2/` or `schemas/kernel/work-order-v2/` MUST NOT remain as the canonical publication; those paths MUST be removed or replaced by the canonical paths above.

#### Scenario: V2 schemas resolve at canonical paths and ids

- GIVEN the published contract suite after this change
- WHEN Candidate v2 and WorkOrder v2 schemas are resolved
- THEN files MUST exist at `schemas/kernel/candidate/v2.schema.json` and `schemas/kernel/work-order/v2.schema.json`
- AND `$id` MUST be `ospec://schemas/kernel/candidate/v2` and `ospec://schemas/kernel/work-order/v2`

#### Scenario: Manifest and contract-claims register v2 families

- GIVEN `schemas/kernel/manifest.json` and `schemas/kernel/contract-claims.json`
- WHEN Candidate v2 and WorkOrder v2 entries are inspected
- THEN each family MUST be registered with its canonical path and `$id`
- AND consumers MUST be able to pin those versions via the registry

#### Scenario: Wrong candidate-v2 and work-order-v2 layouts are not canonical

- GIVEN residual directories `schemas/kernel/candidate-v2/` or `schemas/kernel/work-order-v2/`
- WHEN publication layout is validated
- THEN those paths MUST NOT be treated as the authoritative v2 schema locations

---

---

### Requirement:### Requirement: K1 Historical V1 Content And Pin Restore {#REQ-kernel-contract-schemas-014}

Historical pre-K3 `candidate/v1` and `work-order/v1` schema file contents and their `K1_SCHEMA_BASELINE` pins MUST be restored from the `02e97a5` era. The system MUST restore file content and update pins to match those restored files. The system MUST NOT retarget `K1_SCHEMA_BASELINE` pins alone to match mutated post-`02e97a5` files while leaving drifted v1 content in place. Verification MUST NOT claim K1 pins intact when v1 schema file digests have drifted from the restored baseline.

#### Scenario: V1 files and pins match 02e97a5-era baseline

- GIVEN `schemas/kernel/candidate/v1.schema.json`, `schemas/kernel/work-order/v1.schema.json`, and `K1_SCHEMA_BASELINE`
- WHEN compared to the `02e97a5`-era historical content and pins
- THEN file contents and pin digests MUST match that era
- AND pins MUST hash the restored files

#### Scenario: Pin-only retarget without content restore is forbidden

- GIVEN drifted v1 schema files that no longer match `02e97a5`-era content
- WHEN a remediation only rewrites `K1_SCHEMA_BASELINE` pin digests to the drifted files
- THEN that remediation MUST be rejected as non-compliant
- AND verify MUST NOT report pins intact under that condition

---

### Requirement:### Requirement: Execution Graph And Obligation Manifest Schema Family {#REQ-kernel-contract-schemas-015}

The contract suite MUST publish `execution-graph/v1.schema.json` (`$id: "ospec://schemas/kernel/execution-graph/v1"`) with explicit `schema_version: 1`. The schema MUST require `schema_version`, `graph_id`, `contract_digest`, `policy_bundle_digest`, `policy_snapshot_id`, `source_snapshot_id`, `nodes` (array of semantic graph node objects), and `obligations` (array of obligation items). Both `source_snapshot_id` and `policy_snapshot_id` properties MUST match `^sha256:[a-f0-9]{64}$`.

In `$defs/node`, the schema MUST define an optional `clarification_context` object property with required fields `event_id` (string), `question_id` (string), and `answer` (string or object), with `additionalProperties: false`.

Each obligation item MUST require `id`, `criticality` (`must | should | may`), `implemented_by` (array of node IDs), and `required_evidence` (array of evidence identifiers), and MAY include an optional `deferred` object (`reason`, `approved_by`). The schema MUST enforce `additionalProperties: false`. The family MUST ship valid and invalid fixtures demonstrating acceptance of complete graphs with bound source snapshot, policy snapshot provenance, and optional clarification context on nodes, and rejection of missing required fields, malformed source snapshot id, malformed policy snapshot id, or microscopic nodes.
(Previously: execution-graph/v1.schema.json did not define clarification_context on node definitions, causing valid clarify-mutated graphs to fail schema validation.)

#### Scenario: Valid execution graph with embedded obligations and source snapshot provenance passes validation

- GIVEN a valid execution graph payload containing semantic nodes, source snapshot provenance, policy snapshot provenance, and an obligation manifest
- WHEN validated against `execution-graph/v1.schema.json`
- THEN validation MUST succeed

#### Scenario: Execution graph node with clarification_context validates successfully

- GIVEN an execution graph containing a node mutated with `clarification_context` containing `event_id`, `question_id`, and `answer`
- WHEN validated against `execution-graph/v1.schema.json`
- THEN schema validation MUST succeed

#### Scenario: Node clarification_context with missing required fields or additional properties fails validation

- GIVEN an execution graph node with `clarification_context` missing `question_id` or containing unknown additional properties
- WHEN validated against `execution-graph/v1.schema.json`
- THEN validation MUST fail closed identifying the invalid property in `clarification_context`

#### Scenario: Execution graph missing required fields, policy snapshot, source snapshot provenance, or embedded obligations fails validation

- GIVEN an execution graph payload missing `policy_snapshot_id`, `source_snapshot_id`, `policy_bundle_digest`, or `obligations`
- WHEN validated against `execution-graph/v1.schema.json`
- THEN validation MUST fail closed identifying the missing property

#### Scenario: Execution graph with malformed source snapshot id or policy snapshot id fails validation fail-closed

- GIVEN an execution graph payload containing a `source_snapshot_id` or `policy_snapshot_id` with uppercase characters, wrong length, or invalid prefix
- WHEN validated against `execution-graph/v1.schema.json`
- THEN validation MUST fail closed identifying the malformed property

---

---

### Requirement:### Requirement: PolicySnapshot Schema Family With Effective Rules {#REQ-kernel-contract-schemas-016}

The contract suite MUST publish `policy-snapshot/v1.schema.json` (`$id: "ospec://schemas/kernel/policy-snapshot/v1"`) with explicit `schema_version: 1`. The schema MUST require `snapshot_id`, `policy_bundle_digest`, `compiler_version`, `classifier_version`, `runtime_version`, and `effective_rules` (array of resolved rule strings or objects). The schema MUST enforce `additionalProperties: false` and MUST NOT alias CandidateEvaluationAttestation or DeliveryAuthorization schemas. The family MUST ship valid and invalid fixtures demonstrating valid structure and rejection of malformed or missing fields.

#### Scenario: Valid PolicySnapshot schema validates successfully

- GIVEN a valid PolicySnapshot object with complete versions and effective rules
- WHEN validated against `policy-snapshot/v1.schema.json`
- THEN validation MUST succeed

#### Scenario: PolicySnapshot missing required versions or rules fails validation

- GIVEN a PolicySnapshot object missing `runtime_version` or `effective_rules`
- WHEN validated against `policy-snapshot/v1.schema.json`
- THEN validation MUST fail closed

---

---

### Requirement:### Requirement: ClarifyEvent Schema Family {#REQ-kernel-contract-schemas-017}

The contract suite MUST publish `clarify-event/v1.schema.json` (`$id: "ospec://schemas/kernel/clarify-event/v1"`) with explicit `schema_version: 1`. The schema MUST require `event_id`, `question_id`, `answer`, `timestamp`, and `affected_nodes` (array of string node IDs). The schema MUST enforce `additionalProperties: false` and strict non-aliasing against general event or transport schemas. The family MUST include valid fixtures and invalid fixtures demonstrating rejection of missing required fields.

#### Scenario: Valid ClarifyEvent fixture validates successfully

- GIVEN a valid ClarifyEvent payload declaring question_id, answer, and affected_nodes
- WHEN validated against `clarify-event/v1.schema.json`
- THEN validation MUST succeed

#### Scenario: ClarifyEvent missing question_id or affected_nodes fails validation

- GIVEN a ClarifyEvent payload missing `question_id` or `affected_nodes`
- WHEN validated against `clarify-event/v1.schema.json`
- THEN validation MUST fail closed

---

---

### Requirement:### Requirement: PolicySnapshot v1 Canonical Binding Validation {#REQ-kernel-contract-schemas-018}

The contract suite MUST provide a canonical validation function `validatePolicySnapshotBinding(snapshot)` that validates `PolicySnapshot` records against `policy-snapshot/v1.schema.json` and cryptographically verifies that `snapshot.snapshot_id === computePolicySnapshotDigest(snapshot)`.

The validation function MUST return `{ ok: true }` when:
1. `snapshot` is a non-null object and successfully validates against `ospec://schemas/kernel/policy-snapshot/v1`.
2. `snapshot.snapshot_id` is a valid SHA-256 digest string matching `^sha256:[a-f0-9]{64}$`.
3. The recomputed digest `computePolicySnapshotDigest(snapshot)` exactly equals declared `snapshot.snapshot_id` byte-for-byte.

If `snapshot` is null, non-object, fails schema validation, has a malformed digest string, or fails cryptographic digest equality, `validatePolicySnapshotBinding` MUST return `{ ok: false, reason_code: "...", error: "..." }` fail-closed (using reason codes `INVALID_PAYLOAD`, `INVALID_SCHEMA`, `ILL_FORMED_SNAPSHOT_ID`, or `POLICY_SNAPSHOT_MISMATCH`). The validator MUST operate as a pure function and MUST NOT mutate the input object.

#### Scenario: Schema-valid PolicySnapshot with matching cryptographic digest passes validation

- GIVEN a valid PolicySnapshot object created with canonical versioning and effective rules
- WHEN `validatePolicySnapshotBinding(snapshot)` is executed
- THEN validation MUST return `{ ok: true }`

#### Scenario: PolicySnapshot with spoofed snapshot_id fails validation with digest mismatch

- GIVEN a PolicySnapshot object whose declared `snapshot_id` does not match the recomputed `computePolicySnapshotDigest(snapshot)`
- WHEN `validatePolicySnapshotBinding(snapshot)` is executed
- THEN validation MUST return `{ ok: false, reason_code: "POLICY_SNAPSHOT_MISMATCH" }`

#### Scenario: PolicySnapshot failing JSON schema validation is rejected fail-closed

- GIVEN a PolicySnapshot object missing required `compiler_version`, `runtime_version`, or `effective_rules`
- WHEN `validatePolicySnapshotBinding(snapshot)` is executed
- THEN validation MUST return `{ ok: false, reason_code: "INVALID_SCHEMA" }`

#### Scenario: Non-object or malformed PolicySnapshot input fails validation

- GIVEN a `null`, non-object, or empty input passed to `validatePolicySnapshotBinding`
- WHEN `validatePolicySnapshotBinding(snapshot)` is executed
- THEN validation MUST return `{ ok: false, reason_code: "INVALID_PAYLOAD" }`

---

---

### Requirement:### Requirement: Execution Budget And Authority Effect Budget Schema Families {#REQ-kernel-contract-schemas-019}

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

---

### Requirement:### Requirement: Causal Failure And Recovery Transition Schema Families {#REQ-kernel-contract-schemas-020}

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

---

### Requirement:### Requirement: Workspace Descriptor And Capsule Definition Schema Families {#REQ-kernel-contract-schemas-021}

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

---

---

### Requirement:### Requirement: Work Result Execution Payload And Containment Violation Schema Families {#REQ-kernel-contract-schemas-022}

The contract suite MUST publish `work-result-execution-payload/v1.schema.json` (`$id: "ospec://schemas/kernel/work-result-execution-payload/v1"`) and `containment-violation/v1.schema.json` (`$id: "ospec://schemas/kernel/containment-violation/v1"`) with explicit `schema_version: 1`.

`work-result-execution-payload/v1` MUST require `schema_version`, `work_result_id` (string matching `^sha256:[a-f0-9]{64}$`), `work_order_id` (string matching `^sha256:[a-f0-9]{64}$`), `source_snapshot_id` (string matching `^sha256:[a-f0-9]{64}$`), `patch` (string), `commands` (array of command outcome objects), `logs` (array of strings), `exit_code` (integer), `filesystem_inventory` (array of file objects), and `execution_usage` (object conforming to execution usage schema). The schema MUST strictly prohibit any `candidate_id` property.

`containment-violation/v1` MUST require `schema_version`, `violation_id` (string), `workspace_id` (string), `work_order_id` (string), `attempted_path` (string), `allowed_paths` (array of strings), `violation_type` (`traversal | symlink_escape | undeclared_write | permission_denied`), and `timestamp` (ISO date-time string).

Both schemas MUST enforce `additionalProperties: false`. Negative non-aliasing fixtures MUST demonstrate that `work-result-execution-payload` cannot validate as `Candidate` or `DeliveryAuthorization`, and `containment-violation` cannot validate as `OperationReceipt` or `transport-failure`.

#### Scenario: Valid containment violation fixture passes validation

- GIVEN a valid containment violation payload declaring attempted_path and violation_type `traversal`
- WHEN validated against `containment-violation/v1.schema.json`
- THEN validation MUST succeed

#### Scenario: Containment violation with unknown violation_type fails validation

- GIVEN a containment violation payload with `violation_type: "kernel_panic"`
- WHEN validated against `containment-violation/v1.schema.json`
- THEN validation MUST fail closed identifying the invalid enum value

#### Scenario: Valid work result execution payload passes validation

- GIVEN a valid work-result-execution-payload object with valid cryptographic digests and execution usage
- WHEN validated against `work-result-execution-payload/v1.schema.json`
- THEN validation MUST succeed

#### Scenario: WorkResult payload declaring candidate_id fails validation

- GIVEN a work result execution payload containing property `candidate_id`
- WHEN validated against `work-result-execution-payload/v1.schema.json`
- THEN validation MUST fail closed due to forbidden candidate property

---

### Requirement:### Requirement: Work Order V2 Requires Closed Capsule Inputs {#REQ-kernel-contract-schemas-023}

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

### Requirement:### Requirement: Evidence V2 Provenance Binding Distinct From Verdict {#REQ-kernel-contract-schemas-024}

The suite MUST publish `evidence/v2.schema.json`
(`$id: "ospec://schemas/kernel/evidence/v2"`) with `schema_version: 2` and
`kind: "evidence/v2"`. Required fields: `schema_version`, `kind`,
`evidence_id`, `candidate_id` (`^sha256:[a-f0-9]{64}$`), `provenance`
(`runtime-observed | host-attested | tool-produced | model-reported |
human-decision | external-unverified`), `origin`, `digest`
(`^sha256:[a-f0-9]{64}$`), and `node_id`. The schema MUST forbid `verdict`
and MUST enforce `additionalProperties: false`. `evidence/v1.schema.json`,
its K1 fixtures, and `K1_SCHEMA_BASELINE` pins MUST remain byte-identical.
Valid and invalid fixtures MUST cover complete provenance-bound evidence,
missing required fields, unknown provenance, malformed `candidate_id`, and
payloads that include `verdict`.

#### Scenario: Valid evidence v2 fixture passes

- GIVEN a complete evidence/v2 payload with `runtime-observed` provenance and a valid CandidateId
- WHEN validated against `evidence/v2.schema.json`
- THEN validation MUST succeed

#### Scenario: Evidence v2 with verdict or unknown provenance fails closed

- GIVEN an evidence/v2 payload that includes `verdict` or `provenance: "worker-said-so"`
- WHEN schema validation runs
- THEN validation MUST fail closed identifying the violating property

#### Scenario: Evidence v1 pins remain frozen

- GIVEN `evidence/v1.schema.json`, its K1 fixtures, and `K1_SCHEMA_BASELINE`
- WHEN verified after evidence/v2 publication
- THEN v1 schema and fixture bytes and K1 pins MUST remain byte-identical

### Requirement:### Requirement: Verification V2 Verdict Distinct From Evidence {#REQ-kernel-contract-schemas-025}

The suite MUST publish `verification/v2.schema.json`
(`$id: "ospec://schemas/kernel/verification/v2"`) with `schema_version: 2` and
`kind: "verification/v2"`. Required fields: `schema_version`, `kind`,
`verification_id`, `candidate_id` (`^sha256:[a-f0-9]{64}$`), `verdict`
(`PASS | PASS WITH WARNINGS | FAIL`), and `evidence_ids` (array of
`^sha256:[a-f0-9]{64}$`). The schema MUST enforce `additionalProperties: false`.
`verification/v1.schema.json`, its K1 fixtures, and `K1_SCHEMA_BASELINE` pins
MUST remain byte-identical. Negative non-aliasing fixtures MUST reject
verification/v2 as evidence/v2 and evidence/v2 as verification/v2.

#### Scenario: Valid verification v2 fixture passes

- GIVEN a verification/v2 payload with `verdict: "PASS"` and bound evidence_ids
- WHEN validated against `verification/v2.schema.json`
- THEN validation MUST succeed

#### Scenario: Cross-family substitution fails closed

- GIVEN an evidence/v2 payload validated as verification/v2, or a verification/v2 payload validated as evidence/v2
- WHEN schema validation runs
- THEN validation MUST fail closed identifying kind or required-field mismatch

#### Scenario: Verification v1 pins remain frozen

- GIVEN `verification/v1.schema.json`, its K1 fixtures, and `K1_SCHEMA_BASELINE`
- WHEN verified after verification/v2 publication
- THEN v1 schema and fixture bytes and K1 pins MUST remain byte-identical

### Requirement:### Requirement: Assurance Graph Schema Family And Equivalence Manifest {#REQ-kernel-contract-schemas-026}

The suite MUST publish `assurance-graph/v1.schema.json`
(`$id: "ospec://schemas/kernel/assurance-graph/v1"`) with `schema_version: 1`.
Required fields: `schema_version`, `graph_id` (`^sha256:[a-f0-9]{64}$`),
`candidate_id` (`^sha256:[a-f0-9]{64}$`), `nodes` (array), and `edges` (array
of `{from, relation, to}` with `relation` in
`verified-by | satisfies | derived-from | invalidates`). The schema MUST
enforce `additionalProperties: false` and MUST NOT alias
CandidateEvaluationAttestation or DeliveryAuthorization. An optional
equivalence-manifest object MAY appear with a distinct `kind` and MUST NOT
validate as attestation or authorization. The family MUST ship valid fixtures
and invalid fixtures for missing fields, unknown relation, and malformed
digests.

#### Scenario: Valid assurance-graph fixture passes

- GIVEN a complete assurance-graph/v1 payload with four-relation edges and matching graph_id digest form
- WHEN validated against `assurance-graph/v1.schema.json`
- THEN validation MUST succeed

#### Scenario: Unknown relation or attestation alias fails closed

- GIVEN an edge with `relation: "reviewed-by"` or a graph payload that validates as CandidateEvaluationAttestation
- WHEN schema validation runs
- THEN validation MUST fail closed

### Requirement: Assessment Schema Family V2 Publication And V1 Backward Compatibility {#REQ-kernel-contract-schemas-027}

The contract suite MUST publish `assessment/v2.schema.json` (`$id: "ospec://schemas/kernel/assessment/v2"`, `schema_version: 2`, `kind: "assessment/v2"`) with required property `evidence_requirements_satisfied` (array of strings, `minItems: 1` when claiming satisfaction of obligation requirements). The schema MUST require: `schema_version`, `kind`, `assessment_id` (`^sha256:[a-f0-9]{64}$`), `evidence_id` (`^sha256:[a-f0-9]{64}$`), `role` (`red | green | characterization-before | characterization-after | negative | acceptance | integration | invariant | smoke | rollback | dry-run`), `obligation_id` (string), `node_id` (string), `candidate_id` (`^sha256:[a-f0-9]{64}$`), `policy_snapshot_id` (`^sha256:[a-f0-9]{64}$`), and `evidence_requirements_satisfied`.

`assessment/v1.schema.json` (`$id: "ospec://schemas/kernel/assessment/v1"`, `schema_version: 1`) MUST be restored to its backward-compatible v2.51.0 contract without breaking legacy consumers. Both schemas MUST enforce `additionalProperties: false` and MUST NOT accept `verdict`. Assessment schemas MUST NOT validate as `evidence/v2` or `verification/v2`. Canonical schemas MUST be registered in `schemas/kernel/manifest.json` and `contract-claims.json`. `evidence/v2`, `verification/v2`, and K1 v1 schema bytes and `K1_SCHEMA_BASELINE` pins MUST remain byte-identical. The family MUST ship valid and invalid fixtures for v2 and v1.
(Previously: assessment/binding had unspecified $id, design-owned coverage field name, and lacked explicit v2 publication and v1 backward compatibility restoration.)

#### Scenario: Valid assessment v2 fixture passes

- GIVEN a complete assessment/v2 payload with role, obligation_id, node_id, evidence_id, policy_snapshot_id, candidate_id, and non-empty `evidence_requirements_satisfied`
- WHEN validated against `assessment/v2.schema.json`
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

#### Scenario: Assessment v2 fixture with missing or empty evidence_requirements_satisfied fails closed

- GIVEN an assessment/v2 payload that omits `evidence_requirements_satisfied` or provides an empty array `[]`
- WHEN validated against `assessment/v2.schema.json`
- THEN validation MUST fail closed identifying the invalid or missing `evidence_requirements_satisfied` property

#### Scenario: Evidence v2, verification v2, and K1 v1 pins remain frozen

- GIVEN `evidence/v2.schema.json`, `verification/v2.schema.json`, K1 v1 schemas, and `K1_SCHEMA_BASELINE`
- WHEN verified after `assessment/v2.schema.json` publication
- THEN those schema and fixture bytes and K1 pins MUST remain byte-identical

#### Scenario: Assessment v1 backward compatibility is preserved

- GIVEN legacy valid fixtures conforming to the v2.51.0 `assessment/v1` contract
- WHEN validated against restored `assessment/v1.schema.json`
- THEN validation MUST succeed
- AND legacy consumer payloads MUST NOT be broken

#### Scenario: Manifest and contract-claims register assessment v2

- GIVEN `schemas/kernel/manifest.json` and `contract-claims.json`
- WHEN assessment schema entries are inspected
- THEN `assessment/v2.schema.json` MUST be registered with `$id: "ospec://schemas/kernel/assessment/v2"`
- AND `assessment/v1.schema.json` MUST remain registered with `$id: "ospec://schemas/kernel/assessment/v1"`

### Requirement: Runner Receipt V1 Family With Content-Addressed Identity {#REQ-kernel-contract-schemas-028}

The contract suite MUST publish `runner-receipt/v1.schema.json` (`$id: "ospec://schemas/kernel/runner-receipt/v1"`, `schema_version: 1`, `kind: "runner-receipt/v1"`). Required fields MUST be `schema_version`, `kind`, `receipt_id` (`^sha256:[a-f0-9]{64}$`), `candidate_id` (`^sha256:[a-f0-9]{64}$`), `evidence_id` (`^sha256:[a-f0-9]{64}$`), `node_id` (non-empty string), `role` (closed strategy-role enumeration), `satisfied_tokens` (array of unique non-empty strings), `outcome` (`passed | failed`), `issuer_id` (non-empty string), and `transport` (`tool-execution-transport | execution-transport`). `evidence_id` MUST be required. `receipt_id` MUST be a content-addressed SHA-256 identifier matching `^sha256:[a-f0-9]{64}$`. Optional `execution_sequence` MAY include required `run_id` and `ordinal` (integer ≥ 1) and optional `previous_evidence_id` matching `^sha256:[a-f0-9]{64}$`. The schema MUST enforce `additionalProperties: false`. The family MUST be registered in `schemas/kernel/manifest.json` and `schemas/kernel/contract-claims.json`. `schemas/kernel/runner-receipt/` MUST be excluded from the K1 frozen baseline pin. `evidence/v2`, `verification/v2`, and K1 v1 schema bytes and `K1_SCHEMA_BASELINE` pins MUST remain byte-identical. The family MUST remain distinct from `receipt/v1` and `OperationReceipt`.
(Previously: the kernel inventory had no runner-receipt/v1 family; receipts were untyped caller DTOs.)

#### Scenario: Valid runner-receipt v1 payload exposes required identity fields

- GIVEN a complete `runner-receipt/v1` payload with `receipt_id`, required `evidence_id`, `candidate_id`, `node_id`, `role`, `satisfied_tokens`, `outcome`, `issuer_id`, and `transport`
- WHEN validated against `runner-receipt/v1.schema.json`
- THEN validation MUST succeed
- AND `$id` MUST be `ospec://schemas/kernel/runner-receipt/v1`

#### Scenario: Runner-receipt missing evidence_id fails closed

- GIVEN a `runner-receipt/v1` payload that omits `evidence_id`
- WHEN validated against `runner-receipt/v1.schema.json`
- THEN validation MUST fail closed identifying the missing required `evidence_id`

#### Scenario: Manifest and contract-claims register runner-receipt v1

- GIVEN `schemas/kernel/manifest.json` and `contract-claims.json`
- WHEN the `runner-receipt` family is inspected
- THEN it MUST be registered at `schemas/kernel/runner-receipt/v1.schema.json` with `$id: "ospec://schemas/kernel/runner-receipt/v1"`
- AND `schema_version` MUST be `1`

#### Scenario: Evidence v2, verification v2, and K1 v1 pins remain frozen after runner-receipt publication

- GIVEN `evidence/v2.schema.json`, `verification/v2.schema.json`, K1 v1 schemas, and `K1_SCHEMA_BASELINE`
- WHEN verified after `runner-receipt/v1.schema.json` publication
- THEN those schema bytes and K1 pins MUST remain byte-identical
- AND `schemas/kernel/runner-receipt/` MUST NOT be included in the K1 frozen baseline pin

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

