# execution-identities Specification

## Purpose

Define the execution identity model and freeze pipeline for kernel execution. Enforce absolute separation across four distinct execution identities (`SourceSnapshotId`, `WorkOrderId`, `WorkResultId`, `CandidateId`), candidate freeze semantics (`workspace` | `staged`), file mode and untracked digests, selector ambiguity resolution, and initial fail-closed candidate relation evaluation (`exact`, `changed`, `ambiguous`, `unknown`).

## Requirements

### Requirement: Four Execution Identity Separation Invariant {#REQ-execution-identities-001}

The kernel MUST maintain four distinct execution identities: `SourceSnapshotId`, `WorkOrderId`, `WorkResultId`, and `CandidateId`. Each identity MUST compute a deterministic content-addressed digest over its specified canonical fields. The system SHALL NOT treat any of these identities as aliases, interchangeable identifiers, or renamed stages of another digest. Any attempt to substitute one identity type for another MUST fail closed.

#### Scenario: Distinct digests for distinct execution identities

- GIVEN valid inputs for a SourceSnapshot, WorkOrder, WorkResult, and Candidate
- WHEN the digest for each identity is computed
- THEN each identity MUST produce a distinct digest string with its canonical prefix
- AND substituting a WorkResultId where a CandidateId is required MUST fail validation

#### Scenario: Single byte modification changes identity digest

- GIVEN a valid execution identity structure
- WHEN a single byte of its canonical payload or metadata is modified
- THEN recomputing the digest MUST yield a different identifier

---

### Requirement: SourceSnapshot Specification And Digest {#REQ-execution-identities-002}

The kernel MUST specify `SourceSnapshot` structures containing `repositoryId`, `baseTreeDigest`, `projection` (`workspace` | `staged` | `commit`), and `dependencyDigests`. `SourceSnapshotId` MUST digest these four fields deterministically. The projection field SHALL declare the exact byte surface presented to the worker. A `SourceSnapshotId` MUST NOT authorize verification, attestation, or delivery.

#### Scenario: SourceSnapshot digest incorporates projection and base tree

- GIVEN two SourceSnapshot instances with identical base trees but different projections (`workspace` vs `staged`)
- WHEN their `SourceSnapshotId` digests are generated
- THEN the system MUST produce two distinct `SourceSnapshotId` values

#### Scenario: SourceSnapshot does not grant delivery authorization

- GIVEN a valid `SourceSnapshotId`
- WHEN evaluated against a delivery gate or verification request
- THEN the system MUST reject the snapshot as insufficient for delivery or verification

---

### Requirement: Bound WorkOrder And Raw WorkResult Pipeline {#REQ-execution-identities-003}

A `WorkOrder` MUST be bound to a specific `SourceSnapshotId` and declare objective, allowed paths, invariants, budget, dependencies, ownership, and required evidence. `computeWorkOrderId` MUST digest all canonical fields including `dependencies` (as sha256 digests for v2), `ownership`, and `required_evidence`. A `WorkResult` MUST be bound to both `WorkOrderId` and `SourceSnapshotId`, capturing unapproved worker outputs (patch/commit, execution commands, logs, exit codes, filesystem inventory). `validateWorkOrderBinding(sourceSnapshot, workOrder)` MUST validate that `sourceSnapshot` is a schema-valid `source-snapshot/v1` object and `workOrder` is a schema-valid `work-order` object (validating against `work-order/v2.schema.json` with sha256 dependency digests when compiled from ExecutionGraph) before recomputing `computeSourceSnapshotId(sourceSnapshot)` and `computeWorkOrderId(workOrder)` and comparing them to the declared `source_snapshot_id` and `work_order_id` (failing closed if schema-invalid or on mismatch). `validateWorkResultBinding(workOrder, workResult)` MUST validate that `workOrder` is a schema-valid `work-order` object and `workResult` is a schema-valid `work-result/v1` object before recomputing `computeWorkOrderId(workOrder)` and `computeWorkResultId(workResult)` and comparing them to the declared `work_order_id` and `work_result_id` (failing closed if schema-invalid or on mismatch). String equality of declared IDs alone MUST NOT pass when recomputed digests differ or when payloads fail schema validation. The system MUST NOT accept a raw `WorkResult` as a `Candidate` or for attestation/delivery without candidate integration and freeze.
(Previously: validateWorkOrderBinding did not account for WorkOrder v2 sha256 dependency digest validation during cryptographic recomputation.)

#### Scenario: WorkResult requires Candidate freeze before evaluation

- GIVEN an unapproved `WorkResult` emitted by a worker
- WHEN passed directly to candidate verification or attestation
- THEN the kernel MUST fail closed and reject the `WorkResult`

#### Scenario: WorkOrder binding validation

- GIVEN a `WorkOrder` referencing `SourceSnapshotId` S1 and a `WorkResult` claiming execution under `SourceSnapshotId` S2
- WHEN the kernel validates the `WorkResult`
- THEN validation MUST fail closed due to snapshot mismatch

#### Scenario: WorkOrderId canonical payload includes dependencies ownership and required evidence

- GIVEN two WorkOrder definitions with identical core fields but different dependencies, ownership, or required evidence
- WHEN `computeWorkOrderId` generates their digests
- THEN the system MUST produce distinct `WorkOrderId` digests for each WorkOrder

#### Scenario: validateWorkOrderBinding validates WorkOrder v2 with sha256 dependency digests

- GIVEN a valid SourceSnapshot and a WorkOrder v2 with `dependencies` containing valid `sha256:` WorkOrderId digests
- WHEN `validateWorkOrderBinding` is executed
- THEN validation MUST succeed with `{ ok: true }`
- AND recomputed `WorkOrderId` MUST match declared `work_order_id`

#### Scenario: validateWorkResultBinding fails on work order mismatch

- GIVEN a `WorkOrder` with ID W1 and a `WorkResult` referencing work_order_id W2
- WHEN `validateWorkResultBinding` is executed
- THEN validation MUST fail closed and return a binding mismatch error

#### Scenario: Spoofed declared IDs fail cryptographic binding recompute

- GIVEN a `sourceSnapshot`/`workOrder` pair whose declared IDs are string-equal to expected values but whose canonical payloads recompute to different digests
- WHEN `validateWorkOrderBinding` runs
- THEN validation MUST fail closed
- AND the same recomputation rule MUST apply for `validateWorkResultBinding` on spoofed `work_order_id`/`work_result_id`

#### Scenario: Schema-invalid WorkOrder or WorkResult rejected during binding validation

- GIVEN a `workOrder` or `workResult` missing required schema fields but carrying self-consistent IDs
- WHEN `validateWorkOrderBinding` or `validateWorkResultBinding` is executed
- THEN validation MUST fail closed with a schema or payload validation error
- AND MUST NOT return `{ ok: true }`

---

### Requirement: Candidate Freeze Pipeline And Projections {#REQ-execution-identities-004}

The kernel MUST freeze candidate content before verification, review, attestation, or authorization via `freezeCandidate()`. `freezeCandidate()` MUST be the exclusive constructor for `candidate/v2` records (setting `kind: "candidate/v2"` and `schema_version: 2`), rejecting empty or missing required fields. Every successful `freezeCandidate()` result MUST be schema-valid Candidate v2: `repository_id` MUST be a required non-empty string (minLength 1); `intended_untracked_digest` MUST be a `sha256:<64 hex>` digest or JSON `null`, and MUST NEVER be the empty string `""`. The freeze pipeline MUST canonicalize paths, incorporate `repository_id`, base tree digest, candidate tree digest, diff hash, `changed_paths_modes_digest`, and `intended_untracked_digest`. `freezeCandidate()` MUST disambiguate `diffText` (raw diff string, hashed via SHA-256 into `diff_hash`) vs `diff_hash` (pre-computed digest string, validated to match `sha256:<64 hex>`). Candidate projections MUST be restricted strictly to `workspace` or `staged`. Path mode changes (e.g. 100644 vs 100755), symlink modifications, case-distinct paths, and untracked entries MUST alter the resulting `CandidateId`. `predecessor_id` MAY be null only for a root Candidate; when present, it MUST name a valid frozen predecessor and the emitted `relation` MUST be derived as specified by REQ-execution-identities-009.
(Previously: predecessor metadata was accepted independently of the emitted `relation`, allowing a changed lineage to remain `exact`.)

#### Scenario: Candidate freeze enforces workspace or staged projection

- GIVEN a candidate integration request specifying projection `commit`
- WHEN candidate freeze is executed
- THEN the freeze pipeline MUST reject the request fail-closed

#### Scenario: File mode change alters CandidateId digest

- GIVEN two candidate trees with identical file contents where one file's mode changes from 100644 to 100755
- WHEN candidate freeze generates `changed_paths_modes_digest` and `CandidateId`
- THEN the resulting `CandidateId` values MUST be distinct

#### Scenario: Untracked files shift intended_untracked_digest

- GIVEN a candidate integration with untracked files intended for inclusion
- WHEN frozen into a `Candidate`
- THEN `intended_untracked_digest` MUST reflect the untracked file inventory
- AND omitting or altering an untracked file MUST yield a different `CandidateId`

#### Scenario: freezeCandidate constructs candidate v2 and disambiguates diffText vs diff_hash

- GIVEN raw diff text passed as `diffText` to `freezeCandidate`
- WHEN `freezeCandidate` constructs the candidate record
- THEN `kind` MUST be set to `"candidate/v2"` and `schema_version` to `2`
- AND `diffText` MUST be canonicalized and hashed into a valid `sha256:<64 hex>` digest string stored in `diff_hash`

#### Scenario: freezeCandidate always emits schema-valid Candidate v2 fields

- GIVEN valid freeze inputs including a non-empty `repository_id` and optional untracked inventory
- WHEN `freezeCandidate` succeeds
- THEN the record MUST validate as Candidate v2
- AND `repository_id` MUST be non-empty
- AND `intended_untracked_digest` MUST be `sha256:<64 hex>` or `null`, never `""`

#### Scenario: Symlink and case-distinct paths remain identity-significant

- GIVEN candidates differing only by symlink target or by `Readme.md` versus `README.md`
- WHEN each candidate is frozen
- THEN the relevant CandidateIds MUST differ
- AND path normalization MUST NOT collapse the case-distinct paths

### Requirement: Fail-Closed Initial Candidate Relation Evaluation {#REQ-execution-identities-005}

The kernel MUST evaluate candidate relations deterministically into one of four initial relations: `exact`, `changed`, `ambiguous`, or `unknown`. Before any relation computation, `evaluateCandidateRelation` MUST require that baseline and target are valid frozen Candidate v2 records (`kind: "candidate/v2"`, `schema_version: 2`, and passing `validateCandidateV2`). Non-frozen or invalid Candidate v2 inputs MUST return `relation: "unknown"`, `action: "stop"`, and `reason_code: "INVALID_FROZEN_CANDIDATE"` without computing a relation. Only `freezeCandidate` MAY construct `candidate/v2` records used as relation inputs. After the freeze gate passes, `evaluateCandidateRelation` MUST ignore declared `candidate_id` properties on baseline and target inputs and MUST recalculate candidate digests deterministically from their canonical frozen payloads. If a declared `candidate_id` is present on baseline or target and does NOT match the recomputed digest, `evaluateCandidateRelation` MUST detect a `candidate-id-mismatch` / `DECLARED_ID_MISMATCH` error, return `relation: "unknown"`, and set `action: "stop"`. It MUST also reject a persisted `relation` or `predecessor_id` that contradicts the derived pairwise relation. `exact` SHALL trigger validation reuse; `changed` SHALL trigger re-evaluation; `ambiguous` and `unknown` SHALL fail closed with `decide` or `stop`. Ambiguous selectors, unresolved path projections, or non-deterministic relation states MUST resolve to `ambiguous` or `unknown`. Advanced relations (`compatible-base-advance`, `provable-contraction`) MUST NOT be applied as default active relations.
(Previously: relation evaluation did not require stored Candidate relation and predecessor lineage to agree with the derived frozen-payload result.)

#### Scenario: Identical candidate frozen trees produce exact relation

- GIVEN a baseline candidate digest C1 and a target candidate digest C2 with identical frozen inputs
- WHEN candidate relation evaluation runs
- THEN the relation MUST be `exact`

#### Scenario: Divergent candidate trees produce changed relation

- GIVEN a candidate digest C1 and a modified candidate digest C2
- WHEN candidate relation evaluation runs
- THEN the relation MUST be `changed`

#### Scenario: Ambiguous selector triggers fail-closed decision

- GIVEN a candidate relation query with multiple matching candidate targets or ambiguous selector paths
- WHEN relation evaluation runs
- THEN the outcome MUST be `ambiguous`
- AND the kernel MUST halt execution or issue a `decide` transition

#### Scenario: Mismatched declared candidate ID triggers candidate-id-mismatch fail-closed rejection

- GIVEN a baseline or target candidate object with a declared `candidate_id` that does not match its recomputed canonical digest
- WHEN `evaluateCandidateRelation` is invoked
- THEN relation MUST evaluate to `"unknown"` with action `"stop"`
- AND reason MUST declare a candidate ID digest mismatch

#### Scenario: Non-frozen candidate rejected before relation computation

- GIVEN a baseline or target that is not a valid frozen Candidate v2
- WHEN `evaluateCandidateRelation` is invoked
- THEN result MUST be `relation: "unknown"`, `action: "stop"`, `reason_code: "INVALID_FROZEN_CANDIDATE"`
- AND no relation digest comparison MUST run

#### Scenario: Inconsistent persisted relation fails closed

- GIVEN a distinct successor payload with `predecessor_id` but stored relation `exact`
- WHEN relation evaluation runs
- THEN the result MUST be `unknown` with action `stop`
- AND it MUST identify the lineage or relation inconsistency

### Requirement: Prohibition Of Attestations On Mutable Trees {#REQ-execution-identities-006}

Candidate Evaluation Attestations and Delivery Authorizations MUST bind to a frozen `CandidateId` and MUST NOT point directly to mutable git branches, unintegrated working trees, or raw worker results. Validation MUST perform closed discrimination of `kind` and enforce a positive validation rule for `CandidateEvaluationAttestation` and `DeliveryAuthorization`: target MUST be a valid `CandidateId` string matching `sha256:<64 hex>` format. Any non-conforming string (branch reference, file path, non-sha256 identifier, or mismatched kind) MUST fail closed with target rejection error.

#### Scenario: Attestation pointing to mutable branch is rejected

- GIVEN an attestation request referencing branch name `main` or a working tree path instead of a frozen `CandidateId`
- WHEN attestation validation or issuance is invoked
- THEN the operation MUST fail closed with a target rejection error

#### Scenario: Closed kind discrimination rejects non-sha256 candidate target for attestation

- GIVEN an attestation or delivery authorization payload whose candidate target is an arbitrary string not matching `sha256:<64 hex>`
- WHEN identity kind validation runs
- THEN validation MUST fail closed and reject the payload

---

### Requirement: Strict Digest Compute Functions Validation {#REQ-execution-identities-007}

The four identity computation functions (`computeSourceSnapshotId`, `computeWorkOrderId`, `computeWorkResultId`, `computeCandidateId`) MUST validate all input parameters, require non-empty mandatory fields, and validate that any referenced input digest matches the `sha256:<64 hex>` format. `computeSourceSnapshotId` MUST require a non-empty `repository_id` string and restrict `projection` strictly to `"workspace"`, `"staged"`, or `"commit"`. `computeWorkOrderId` MUST require `operation`, `objective`, `dependencies` (array), `ownership` (object with valid `owner` and optional `mode` strings), `allowed_paths` (array), `invariants` (array), `required_evidence` (array), and `budget` (object with valid numeric properties when present), failing closed when any required field is missing or ill-typed without substituting silent defaults (`""`, `[]`, `{}`). `computeWorkResultId` MUST require `commands` (array), `logs` (array), and `filesystem_inventory` (array) alongside `patch` (string) and `exit_code`, validating deep item structures and failing closed when any required field is missing without defaulting to `[]`. Passing missing parameters, non-object inputs, empty required fields, ill-formed digest strings, or invalid array/field types MUST cause computation to throw a `TypeError` or `Error` immediately fail-closed.
(Previously: computeWorkOrderId and computeWorkResultId did not perform deep property shape checks on ownership, budget, dependencies, patch, commands, logs, or filesystem inventory.)

#### Scenario: computeWorkOrderId rejects ill-formed snapshot digest format

- GIVEN a WorkOrder input whose `source_snapshot_id` does not match `sha256:<64 hex>`
- WHEN `computeWorkOrderId` is called
- THEN computation MUST throw an error fail-closed

#### Scenario: computeCandidateId rejects missing required properties

- GIVEN a Candidate input missing required fields `projection` or `base_tree`
- WHEN `computeCandidateId` is called
- THEN computation MUST throw a `TypeError` or `Error` fail-closed

#### Scenario: Invalid array or type throws without silent empty coercion

- GIVEN a compute* input where a required array/object field has an incompatible type or is missing
- WHEN the corresponding `compute*` function is called
- THEN it MUST throw fail-closed
- AND MUST NOT coerce the value to `[]` or `{}` or proceed with defaults

#### Scenario: computeWorkResultId rejects missing required fields without defaults

- GIVEN a WorkResult missing a required field (`patch`, `exit_code`, `commands`, `logs`, or `filesystem_inventory`)
- WHEN `computeWorkResultId` is called
- THEN computation MUST throw fail-closed
- AND MUST NOT invent default values for the missing required fields

#### Scenario: computeSourceSnapshotId rejects missing repository_id or invalid projection

- GIVEN a SourceSnapshot input missing `repository_id` or carrying an invalid `projection` value like `"banana"`
- WHEN `computeSourceSnapshotId` is called
- THEN computation MUST throw fail-closed

---

### Requirement: Positive Identity Kind Discrimination {#REQ-execution-identities-008}

`validateIdentityKind` MUST discriminate identities via a positive closed `EXPECTED_KINDS` table that maps each validated surface to its required `kind` value(s): `Candidate` requires `"candidate/v2"` and `WorkOrder` requires `"work-order/v2"`. Missing `kind`, empty `kind`, or a `kind` incompatible with the expected surface MUST fail closed for versioned identity kinds (`v2`, `attestation`, `authorization`). For `SourceSnapshot` v1 and `WorkResult` v1 payloads whose baseline JSON Schemas allow optional `kind` or omit `kind`, when `kind` is `undefined`, `validateIdentityKind` MUST validate payload structure against `source-snapshot/v1` or `work-result/v1` JSON Schema, returning `{ ok: true }` only if schema validation passes. Candidate Evaluation Attestation validation MUST NOT accept a SourceSnapshot (or other non-attestation identity) disguised with an `attestation_id` field when `kind` is missing or mismatched.
(Previously: validateIdentityKind allowed un-kinded SourceSnapshot or WorkResult payloads to pass without structural JSON Schema validation.)

#### Scenario: Missing kind fails closed for expected surface

- GIVEN a payload for an attestation surface with no `kind` property
- WHEN `validateIdentityKind` runs
- THEN validation MUST fail closed
- AND MUST NOT succeed via blacklist-only or optional-kind logic

#### Scenario: Attestation rejects SourceSnapshot disguise

- GIVEN a SourceSnapshot-shaped payload that also carries `attestation_id` but lacks attestation `kind`
- WHEN attestation kind validation runs
- THEN validation MUST fail closed
- AND MUST NOT treat the payload as a valid attestation

#### Scenario: Compatible kind passes positive table

- GIVEN a payload whose `kind` exactly matches the `EXPECTED_KINDS` entry for its surface
- WHEN `validateIdentityKind` runs
- THEN validation MUST succeed for that kind check

#### Scenario: Valid SourceSnapshot v1 or WorkResult v1 passes identity kind check

- GIVEN a schema-valid SourceSnapshot v1 or WorkResult v1 object
- WHEN `validateIdentityKind` runs for `SourceSnapshot` or `WorkResult`
- THEN validation MUST succeed whether `kind` is present or omitted per v1 contract

#### Scenario: Schema-invalid un-kinded v1 identity payload rejected

- GIVEN an un-kinded object (e.g. `{}`) passed to `validateIdentityKind` for `SourceSnapshot` or `WorkResult`
- WHEN `validateIdentityKind` runs
- THEN validation MUST fail closed with `reason_code: "INVALID_SCHEMA"`

---

### Requirement: Candidate Relation, Successor, Publication, And Historical Reconciliation {#REQ-execution-identities-009}

`Candidate.v2.relation` MUST be the persisted K3 relation vocabulary and MUST contain only `exact`, `changed`, `ambiguous`, or `unknown`; no separate relation schema or field SHALL be introduced. `predecessor_id` MUST remain lineage metadata, not an authority for relation. A successor MUST be frozen from a predecessor Candidate v2 record: equal recomputed CandidateIds MUST yield `exact` and MUST NOT produce a successor, while distinct valid frozen payloads MUST yield `changed` and persist the predecessor CandidateId. Relation evaluation MUST derive its result from frozen payloads and SHALL reject a stored relation inconsistent with that derivation. Legacy Candidate v2 records using retired relation names MUST be rejected or explicitly migrated into newly frozen records; their source bytes MUST NOT be rewritten in place. Applicable generated distributions MUST contain the K3 runtime API and canonical Candidate v2 schema, with automated target evidence. Historical K3 archive evidence bytes MUST remain unchanged; reconciliation MAY amend only evidence-supported workflow metadata and K3/K4a references MUST describe K3 as a prerequisite without implementing K4a behavior.

#### Scenario: Changed successor cannot claim exact

- GIVEN a frozen predecessor and a distinct frozen candidate payload
- WHEN the successor is frozen and its relation is evaluated
- THEN its persisted relation MUST be `changed` with the predecessor CandidateId
- AND evaluation MUST NOT return `exact`

#### Scenario: Equal payload does not create successor

- GIVEN a predecessor and a proposed successor with the same recomputed CandidateId
- WHEN candidate freeze is requested with that predecessor
- THEN the result MUST be `exact` without successor lineage
- AND the operation MUST NOT persist a changed successor

#### Scenario: Retired vocabulary and unsupported distribution fail closed

- GIVEN a Candidate v2 record using `superset` or a generated target lacking the K3 API or schema
- WHEN validation or distribution evidence runs
- THEN validation or evidence MUST fail closed
- AND no compatibility alias MUST silently convert the retired relation

#### Scenario: Archive reconciliation preserves evidence bytes

- GIVEN a non-terminal K3 archive state and its archive or verify evidence
- WHEN reconciliation is performed
- THEN only evidence-supported state metadata MAY change
- AND archived evidence content and unrelated historical artifacts MUST remain byte-identical

---

### Requirement: Transactional Six-Target K3 Publication {#REQ-execution-identities-010}

The six-target K3 publisher MUST publish each managed destination (`claude`, `vscode`, `github-copilot`, `opencode`, `codex`, and `cursor`) as a complete validated generation. It MUST NOT expose a partially updated managed destination when pruning managed files, creating a directory, writing a file, or validating generated output fails. The publisher MUST stage and validate the complete replacement before an atomic destination replacement, or MUST restore the complete pre-publication destination by an equally verifiable mechanism. When a prior destination exists, a failed publication MUST leave its managed inventory and bytes identical to the pre-publication state; when no prior destination exists, it MUST leave no partially published managed destination. Tests MUST inject each failure class, including a write failure after pruning would otherwise have occurred. This requirement covers K3 runtime and Candidate v2 schema availability only and MUST NOT introduce K4a Graph, Obligation Manifest, replay, or worker-authority behavior.

#### Scenario: All six destinations publish complete validated K3 output

- GIVEN valid K3 source inputs and existing managed destinations for all six targets
- WHEN the publisher completes generation and validation
- THEN each destination MUST expose its complete new managed inventory
- AND each destination MUST contain the K3 runtime API and Candidate v2 schema

#### Scenario: Injected post-prune write failure preserves prior destination

- GIVEN a target with a complete pre-publication managed inventory and a failure injected during a write after pruning would otherwise run
- WHEN publication for that target fails
- THEN the target's managed inventory and file bytes MUST equal the pre-publication snapshot
- AND no partially generated K3 output MAY be observable at that destination

#### Scenario: Pruning or directory-creation failure publishes no partial state

- GIVEN a target with either an existing complete destination or no destination
- WHEN pruning or managed-directory creation is forced to fail
- THEN an existing destination MUST remain identical to its pre-publication snapshot
- AND an absent destination MUST remain absent or contain no managed partial state

#### Scenario: Validation failure restores or withholds the destination

- GIVEN a generated target whose output validation is forced to fail before publication completes
- WHEN the publisher handles the validation failure
- THEN an existing destination MUST remain identical to its pre-publication snapshot
- AND no new managed output MAY be published for that target

---

### Requirement: Execution Graph Cryptographic Binding Gate {#REQ-execution-identities-011}

The kernel MUST provide a pure cryptographic validation gate `validateExecutionGraphBinding(graph, options)` that verifies the integrity, schema conformance, and provenance couplings of an `ExecutionGraph` record before compilation, clarify processing, replay execution, or shadow comparison.

`validateExecutionGraphBinding` MUST perform the following validations:
1. **Input Payload Validation**: Verify that `graph` is a non-null object. If null or not an object, return `{ ok: false, reason_code: "INVALID_PAYLOAD", error: "..." }`.
2. **Schema Conformance**: Validate `graph` against `ospec://schemas/kernel/execution-graph/v1`. If invalid, return `{ ok: false, reason_code: "INVALID_SCHEMA", error: "..." }`.
3. **Snapshot ID Format**: Verify that `graph.policy_snapshot_id` and `graph.source_snapshot_id` match `^sha256:[a-f0-9]{64}$`. If malformed, return `{ ok: false, reason_code: "ILL_FORMED_SNAPSHOT_ID", error: "..." }`.
4. **Contextual PolicySnapshot Binding**: If `options.policySnapshot` is provided, validate it via `validatePolicySnapshotBinding(options.policySnapshot)`. If invalid or if `options.policySnapshot.snapshot_id !== graph.policy_snapshot_id`, return `{ ok: false, reason_code: "POLICY_SNAPSHOT_MISMATCH", error: "..." }`.
5. **Contextual SourceSnapshot Binding**: If `options.sourceSnapshot` is provided, verify that `computeSourceSnapshotId(options.sourceSnapshot) === graph.source_snapshot_id`. If mismatched, return `{ ok: false, reason_code: "SOURCE_SNAPSHOT_MISMATCH", error: "..." }`.
6. **GraphId Cryptographic Recomputation**: Recompute the deterministic graph identifier via `computeGraphId(graph.contract_digest, graph.policy_snapshot_id, graph.policy_bundle_digest, graph.source_snapshot_id, graph.nodes, graph.obligations)`. If declared `graph.graph_id !== recomputedGraphId`, return `{ ok: false, reason_code: "GRAPH_ID_MISMATCH", error: "..." }`.

If all validation checks pass, `validateExecutionGraphBinding` MUST return `{ ok: true }`. The function MUST operate as a pure validator without mutating input graph objects.

#### Scenario: Valid intact ExecutionGraph passes cryptographic binding gate

- GIVEN a schema-valid ExecutionGraph where declared `graph_id` matches recomputed `computeGraphId()`
- WHEN `validateExecutionGraphBinding(graph)` is invoked
- THEN it MUST return `{ ok: true }`

#### Scenario: Tampered node, obligation, or snapshot ID triggers GRAPH_ID_MISMATCH fail-closed

- GIVEN an ExecutionGraph where any node, obligation, policy digest, or snapshot identifier has been altered after GraphId calculation
- WHEN `validateExecutionGraphBinding(graph)` is invoked
- THEN it MUST return `{ ok: false, reason_code: "GRAPH_ID_MISMATCH" }`
- AND the error message MUST identify the cryptographic digest divergence

#### Scenario: Schema-invalid ExecutionGraph fails validation with INVALID_SCHEMA

- GIVEN an ExecutionGraph object missing required properties (`nodes`, `obligations`, `contract_digest`) or containing microscopic node operations
- WHEN `validateExecutionGraphBinding(graph)` is invoked
- THEN it MUST return `{ ok: false, reason_code: "INVALID_SCHEMA" }`

#### Scenario: Contextual PolicySnapshot mismatch fails validation

- GIVEN an ExecutionGraph with policy_snapshot_id PS1
- AND an options context containing a PolicySnapshot with snapshot_id PS2
- WHEN `validateExecutionGraphBinding(graph, { policySnapshot })` is invoked
- THEN it MUST return `{ ok: false, reason_code: "POLICY_SNAPSHOT_MISMATCH" }`

#### Scenario: Contextual SourceSnapshot mismatch fails validation

- GIVEN an ExecutionGraph with source_snapshot_id S1
- AND an options context containing a SourceSnapshot whose digest computes to S2
- WHEN `validateExecutionGraphBinding(graph, { sourceSnapshot })` is invoked
- THEN it MUST return `{ ok: false, reason_code: "SOURCE_SNAPSHOT_MISMATCH" }`

#### Scenario: Validator guarantees purity and zero object mutations

- GIVEN an ExecutionGraph object passed to `validateExecutionGraphBinding`
- WHEN validation executes
- THEN all properties, node arrays, and obligation arrays of the input object MUST remain unmodified
