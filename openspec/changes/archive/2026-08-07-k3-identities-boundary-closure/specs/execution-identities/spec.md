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

A `WorkOrder` MUST be bound to a specific `SourceSnapshotId` and declare objective, allowed paths, invariants, budget, dependencies, ownership, and required evidence. `computeWorkOrderId` MUST digest all canonical fields including `dependencies`, `ownership`, and `required_evidence`. A `WorkResult` MUST be bound to both `WorkOrderId` and `SourceSnapshotId`, capturing unapproved worker outputs (patch/commit, execution commands, logs, exit codes, filesystem inventory). `validateWorkOrderBinding(sourceSnapshot, workOrder)` MUST recompute `computeSourceSnapshotId(sourceSnapshot)` and `computeWorkOrderId(workOrder)` and compare them to the declared `source_snapshot_id` and `work_order_id` (fail closed on mismatch). `validateWorkResultBinding(workOrder, workResult)` MUST recompute `computeWorkOrderId(workOrder)` and `computeWorkResultId(workResult)` and compare them to the declared `work_order_id` and `work_result_id` (fail closed on mismatch). String equality of declared IDs alone MUST NOT pass when recomputed digests differ. The system MUST NOT accept a raw `WorkResult` as a `Candidate` or for attestation/delivery without candidate integration and freeze.
(Previously: Bindings rejected mismatches but did not require recomputing digests against declared IDs.)

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

#### Scenario: validateWorkResultBinding fails on work order mismatch

- GIVEN a `WorkOrder` with ID W1 and a `WorkResult` referencing work_order_id W2
- WHEN `validateWorkResultBinding` is executed
- THEN validation MUST fail closed and return a binding mismatch error

#### Scenario: Spoofed declared IDs fail cryptographic binding recompute

- GIVEN a `sourceSnapshot`/`workOrder` pair whose declared IDs are string-equal to expected values but whose canonical payloads recompute to different digests
- WHEN `validateWorkOrderBinding` runs
- THEN validation MUST fail closed
- AND the same recomputation rule MUST apply for `validateWorkResultBinding` on spoofed `work_order_id`/`work_result_id`

---

### Requirement: Candidate Freeze Pipeline And Projections {#REQ-execution-identities-004}

The kernel MUST freeze candidate content before verification, review, attestation, or authorization via `freezeCandidate()`. `freezeCandidate()` MUST be the exclusive constructor for `candidate/v2` records (setting `kind: "candidate/v2"` and `schema_version: 2`), rejecting empty or missing required fields. Every successful `freezeCandidate()` result MUST be schema-valid Candidate v2: `repository_id` MUST be a required non-empty string (minLength 1); `intended_untracked_digest` MUST be a `sha256:<64 hex>` digest or JSON `null`, and MUST NEVER be the empty string `""`. The freeze pipeline MUST canonicalize paths, incorporate `repository_id`, base tree digest, candidate tree digest, diff hash, `changed_paths_modes_digest`, and `intended_untracked_digest`. `freezeCandidate()` MUST disambiguate `diffText` (raw diff string, hashed via SHA-256 into `diff_hash`) vs `diff_hash` (pre-computed digest string, validated to match `sha256:<64 hex>`). Candidate projections MUST be restricted strictly to `workspace` or `staged`. Path mode changes (e.g. 100644 vs 100755), symlink modifications, case sensitivity shifts, and untracked entries MUST alter the resulting `CandidateId`.
(Previously: Exclusive v2 constructor and diff disambiguation existed; schema-valid `repository_id` / `intended_untracked_digest` constraints were not absolute.)

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

---

### Requirement: Fail-Closed Initial Candidate Relation Evaluation {#REQ-execution-identities-005}

The kernel MUST evaluate candidate relations deterministically into one of four initial relations: `exact`, `changed`, `ambiguous`, or `unknown`. Before any relation computation, `evaluateCandidateRelation` MUST require that baseline and target are valid frozen Candidate v2 records (`kind: "candidate/v2"`, `schema_version: 2`, and passing `validateCandidateV2`). Non-frozen or invalid Candidate v2 inputs MUST return `relation: "unknown"`, `action: "stop"`, and `reason_code: "INVALID_FROZEN_CANDIDATE"` without computing a relation. Only `freezeCandidate` MAY construct `candidate/v2` records used as relation inputs. After the freeze gate passes, `evaluateCandidateRelation` MUST ignore declared `candidate_id` properties on baseline and target inputs and MUST recalculate candidate digests deterministically from their canonical frozen payloads. If a declared `candidate_id` is present on baseline or target and does NOT match the recomputed digest, `evaluateCandidateRelation` MUST detect a `candidate-id-mismatch` / `DECLARED_ID_MISMATCH` error, return `relation: "unknown"`, and set `action: "stop"`. `exact` SHALL trigger validation reuse; `changed` SHALL trigger re-evaluation; `ambiguous` and `unknown` SHALL fail closed with `decide` or `stop`. Ambiguous selectors, unresolved path projections, or non-deterministic relation states MUST resolve to `ambiguous` or `unknown`. Advanced relations (`compatible-base-advance`, `provable-contraction`) MUST NOT be applied as default active relations.
(Previously: DECLARED_ID_MISMATCH recomputation existed; freeze/schema validity was not a pre-relation gate with INVALID_FROZEN_CANDIDATE.)

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

---

### Requirement: Prohibition Of Attestations On Mutable Trees {#REQ-execution-identities-006}

Candidate Evaluation Attestations and Delivery Authorizations MUST bind to a frozen `CandidateId` and MUST NOT point directly to mutable git branches, unintegrated working trees, or raw worker results. Validation MUST perform closed discrimination of `kind` and enforce a positive validation rule for `CandidateEvaluationAttestation` and `DeliveryAuthorization`: target MUST be a valid `CandidateId` string matching `sha256:<64 hex>` format. Any non-conforming string (branch reference, file path, non-sha256 identifier, or mismatched kind) MUST fail closed with target rejection error.
(Previously: Kind validation was negative and permissive, allowing non-sha256 candidate target strings for attestations.)

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

The four identity computation functions (`computeSourceSnapshotId`, `computeWorkOrderId`, `computeWorkResultId`, `computeCandidateId`) MUST validate all input parameters, require non-empty mandatory fields, and validate that any referenced input digest matches the `sha256:<64 hex>` format. Passing missing parameters, non-object inputs, empty required fields, ill-formed digest strings, or invalid array/field types MUST cause computation to throw a `TypeError` or `Error` immediately fail-closed. Invalid arrays or types MUST NOT be silently coerced to `[]`. `computeWorkResultId` MUST NOT silently default away required WorkResult fields.
(Previously: Rejected missing/ill-formed digests, but silent `[]` coercion and WorkResult field defaulting were not prohibited.)

#### Scenario: computeWorkOrderId rejects ill-formed snapshot digest format

- GIVEN a WorkOrder input whose `source_snapshot_id` does not match `sha256:<64 hex>`
- WHEN `computeWorkOrderId` is called
- THEN computation MUST throw an error fail-closed

#### Scenario: computeCandidateId rejects missing required properties

- GIVEN a Candidate input missing required fields `projection` or `base_tree`
- WHEN `computeCandidateId` is called
- THEN computation MUST throw a `TypeError` or `Error` fail-closed

#### Scenario: Invalid array or type throws without silent empty coercion

- GIVEN a compute* input where a required array/object field has an incompatible type
- WHEN the corresponding `compute*` function is called
- THEN it MUST throw fail-closed
- AND MUST NOT coerce the value to `[]` or proceed with defaults

#### Scenario: computeWorkResultId rejects missing required fields without defaults

- GIVEN a WorkResult missing a required field
- WHEN `computeWorkResultId` is called
- THEN computation MUST throw fail-closed
- AND MUST NOT invent default values for the missing required fields

---

### Requirement: Positive Identity Kind Discrimination {#REQ-execution-identities-008}

`validateIdentityKind` MUST discriminate identities via a positive closed `EXPECTED_KINDS` table that maps each validated surface to its required `kind` value(s). Missing `kind`, empty `kind`, or a `kind` incompatible with the expected surface MUST fail closed. The system MUST NOT accept a payload solely because a forbidden-kind blacklist does not match, and MUST NOT treat optional/absent `kind` as success. Candidate Evaluation Attestation validation MUST NOT accept a SourceSnapshot (or other non-attestation identity) disguised with an `attestation_id` field when `kind` is missing or mismatched.

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

---

### Requirement: WorkOrder V2 Digest Domain Separation {#REQ-execution-identities-009}

`computeWorkOrderId` for WorkOrder v2 (`kind: "work-order/v2"` / schema_version 2) MUST hash under digest domain `work-order/v2`. Digests for WorkOrder v1 MUST remain under domain `work-order/v1`. The system MUST NOT compute WorkOrder v2 digests under the v1 domain string.

#### Scenario: WorkOrder v2 uses work-order/v2 domain

- GIVEN a valid WorkOrder v2 canonical payload
- WHEN `computeWorkOrderId` produces its digest
- THEN the digest domain MUST be `work-order/v2`
- AND MUST NOT equal a digest computed for the same payload under `work-order/v1`
