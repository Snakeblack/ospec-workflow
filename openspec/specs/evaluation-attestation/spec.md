# evaluation-attestation Specification

## Purpose

Baseline of the K8 Candidate Evaluation Attestation as currently implemented in
`scripts/lib/evaluation-attestation/`: a pure constructor and validator that
replay the K7 review binding and an approved review lineage to produce or check
a `candidate-evaluation-attestation/v1`, and a CAS plus single-use
`OperationPermit` issuer that emits the attestation bound to the exact operation
identity of the evaluation being closed.

The attestation declares evaluation approval only. This domain does not enable
delivery and does not verify the operation against a live operation registry.
The attestation payload shape is specified by
REQ-kernel-contract-schemas-032 and is not restated here.

Collaborators (their behavior is specified elsewhere and is not part of this
domain): `scripts/lib/operation-identity-binding.js` (operation identity
resolver), `scripts/lib/review-k7-binding.js` (K7 binding replay),
`scripts/lib/review-lineage.js` (review lineage projection),
`scripts/lib/lifecycle-kernel/permits.js` (permit authorization, receipts), and
`scripts/lib/authority-store/` (CAS store).

## Requirements

### Requirement: Pure Attestation Constructor Over A Replayed Authority Chain {#REQ-evaluation-attestation-001}

`createCandidateEvaluationAttestation(input)` MUST be a pure function that
returns `{ ok: true, attestation }` or `{ ok: false, reason_code, error }`. It
MUST accept an input containing exactly `binding`, `lineage`, `issuance`,
`phase`, `issuer_version`, `runtime_version`, and `issued_at`. A successful
attestation MUST carry `schema_version: 1`, `kind:
"candidate-evaluation-attestation"`, `outcome: "approved-for-evaluation"`,
`valid_for: "evaluation"`, the recomputed digests of REQ-evaluation-attestation-002,
the caller `issuer_version`, `runtime_version`, and `issued_at`, and an
`attestation_id` equal to the `sha256Fingerprint` of domain
`candidate-evaluation-attestation/v1` over the body without `attestation_id`.
The attestation MUST validate against
`ospec://schemas/kernel/candidate-evaluation-attestation/v1` (see
REQ-kernel-contract-schemas-032) and MUST be deep-frozen. The constructor MUST
NOT invoke CAS, permits, stores, or reviewers.

#### Scenario: Well-formed authority chain produces a frozen schema-valid attestation

- GIVEN a K7 binding that replays, an approved schema v3 lineage with frozen findings, the matching K7 issuance, and `phase = { status: "success", verify_outcome: "PASS" }`
- WHEN `createCandidateEvaluationAttestation` runs
- THEN it MUST return `ok: true` with `outcome: "approved-for-evaluation"` and `valid_for: "evaluation"`
- AND the attestation MUST be frozen and MUST validate against the attestation schema
- AND `attestation_id` MUST replay over the attestation body

#### Scenario: Replaying the same inputs yields the same attestation

- GIVEN the same binding, lineage, issuance, phase, and metadata
- WHEN the constructor runs a second time
- THEN the attestation MUST be deeply equal to the first

### Requirement: Digests Are Recomputed From The Replayed Chain {#REQ-evaluation-attestation-002}

Every digest in the attestation MUST be recomputed from the replay-validated
binding and lineage; no digest claimed by a caller or by a presented attestation
MUST be trusted. `candidate_id` and `contract_digest` MUST equal the binding
values; `graph_digest` MUST equal the binding `execution_graph_id`;
`policy_digest` MUST equal the computed PolicySnapshot digest of
`binding.issuance.policySnapshot`; `evidence_root_digest` MUST be the
`sha256Fingerprint` of domain `equivalence-manifest/v1` over
`{ graph_id, candidate_id }` of the equivalence manifest emitted from the K6b
assurance graph; `findings_digest` MUST equal the lineage `findings_digest`;
`expected_revision` MUST be the fingerprint (domain
`candidate-evaluation-attestation-subject/v1`) of `{ candidate_id,
policy_digest }`; `authority_revision` MUST be the fingerprint (domain
`candidate-evaluation-attestation-authority/v1`) of the binding id and the
lineage identity, revision, generation, status, terminal reason, findings
digest, and current candidate.

If the recomputed policy digest differs from the binding `policy_snapshot_id`,
the constructor MUST fail with `EVALUATION_DIGEST_MISMATCH`. If the equivalence
manifest cannot be emitted, or is foreign to the binding candidate or assurance
graph, it MUST fail with `EVALUATION_EVIDENCE_ROOT_INVALID`.

#### Scenario: Attestation digests match the authority chain

- GIVEN a valid authority chain
- WHEN an attestation is constructed
- THEN `candidate_id`, `contract_digest`, `graph_digest`, `policy_digest`, and `findings_digest` MUST equal the binding and lineage values
- AND `evidence_root_digest` MUST equal the fingerprint of the equivalence manifest `{ graph_id, candidate_id }`

#### Scenario: A different policy changes the attestation identity

- GIVEN two authority chains for the same candidate with different effective policies
- WHEN attestations are constructed for each
- THEN their `policy_digest` and `attestation_id` MUST differ
- AND the `candidate_id` MUST be the same

### Requirement: K7 Binding Replay And No-Model Deferral {#REQ-evaluation-attestation-003}

The constructor and validator MUST authenticate the presented K7 binding by
replaying it. A binding that fails replay validation (forged selection,
recomputed `binding_id` over forged content, or not a binding at all) MUST be
rejected with `EVALUATION_K7_BINDING_INVALID`. A binding-shaped record whose
issuance replays to `K7_NO_MODEL_DEFERRED` MUST be rejected with
`EVALUATION_K7_NO_MODEL_DEFERRED` and MUST produce no approbatory attestation,
because there is no independent residual oracle.

#### Scenario: Forged binding is rejected

- GIVEN a K7 binding whose `selection.selected_domains` was altered and whose `binding_id` was recomputed over the altered content
- WHEN the constructor or the validator runs
- THEN it MUST fail with `EVALUATION_K7_BINDING_INVALID`

#### Scenario: No-model deferral emits nothing

- GIVEN a binding-shaped record whose issuance replays to `K7_NO_MODEL_DEFERRED`
- WHEN the constructor or the validator runs
- THEN it MUST fail with `EVALUATION_K7_NO_MODEL_DEFERRED`

### Requirement: Phase Closure Must Be A Passing Success {#REQ-evaluation-attestation-004}

`phase` MUST contain exactly `status` and `verify_outcome`; any other shape
(absent, not an object, missing key, extra key) MUST fail with
`EVALUATION_INPUT_INVALID`. `phase.status` other than `"success"` (for example
`"failed"` or `"stale"`) MUST fail with `EVALUATION_PHASE_NOT_SUCCESS`.
`phase.verify_outcome` of `"FAIL"`, or any value that disagrees with the
replayed K6b verification verdict, MUST fail with
`EVALUATION_VERIFY_OUTCOME_FAIL`; a successful phase MUST NOT outrank a failing
verification verdict.

#### Scenario: Failing verify outcome is not attestable

- GIVEN `phase = { status: "success", verify_outcome: "FAIL" }`
- WHEN the constructor runs
- THEN it MUST fail with `EVALUATION_VERIFY_OUTCOME_FAIL`

#### Scenario: Non-success or malformed phase closure is rejected

- GIVEN `phase = { status: "failed", verify_outcome: "PASS" }`, or `{ status: "stale", verify_outcome: "PASS" }`
- WHEN the constructor runs
- THEN it MUST fail with `EVALUATION_PHASE_NOT_SUCCESS`
- AND a `null` phase or a phase without `verify_outcome` MUST fail with `EVALUATION_INPUT_INVALID`

### Requirement: Review Lineage Must Be Authentic, Matching, And Approved {#REQ-evaluation-attestation-005}

The presented lineage MUST be projected and replayed against the issuance. An
absent lineage, a non-v3 lineage, or a tampered lineage MUST fail with
`EVALUATION_LINEAGE_INVALID`. A lineage that is internally authentic but whose
binding identity fields (`binding_id`, `policy_snapshot_id`,
`policy_bundle_digest`, `verification_id`, `assurance_graph_id`,
`residual_digest`) differ from the presented binding MUST fail with
`EVALUATION_LINEAGE_FOREIGN`. A lineage that is not `approved`, has no frozen
`findings_digest`, or has no terminal reason (for example mid-review or
correction-required) MUST fail with `EVALUATION_LINEAGE_NOT_APPROVED`. A lineage
whose current candidate differs from the binding candidate (a corrected
successor) MUST fail with `EVALUATION_CANDIDATE_DRIFT`; a fresh K7 binding is
required before attesting.

#### Scenario: Lineage problems fail closed with typed reasons

- GIVEN a null lineage, a legacy non-v3 lineage, or a lineage with a tampered `findings_digest`
- WHEN the constructor or validator runs
- THEN it MUST fail with `EVALUATION_LINEAGE_INVALID`

#### Scenario: Foreign lineage is detected by binding identity

- GIVEN a lineage and issuance that replay together but belong to a different K7 binding
- WHEN they are presented with the first chain's binding
- THEN it MUST fail with `EVALUATION_LINEAGE_FOREIGN`

#### Scenario: Unapproved lineage is not attestable

- GIVEN a lineage in `reviewing` status or in `correction-required` status with an unresolved blocking finding
- WHEN the constructor or validator runs
- THEN it MUST fail with `EVALUATION_LINEAGE_NOT_APPROVED`

#### Scenario: Corrected successor candidate is not attested under the genesis binding

- GIVEN an approved lineage whose `current_candidate_id` differs from the binding `candidate_id`
- WHEN the constructor or validator runs
- THEN it MUST fail with `EVALUATION_CANDIDATE_DRIFT`

### Requirement: Constructor And Validator Input Validation {#REQ-evaluation-attestation-006}

The constructor MUST reject a non-object input, a missing required key, or any
unknown key with `EVALUATION_INPUT_INVALID`. `issuer_version`,
`runtime_version`, and `issued_at` MUST be non-empty, non-blank strings;
otherwise the constructor MUST fail with `EVALUATION_METADATA_INVALID`. The
validator MUST require an input containing exactly `binding`, `lineage`,
`issuance`, and `expects`; otherwise it MUST fail with
`EVALUATION_INPUT_INVALID`. A `null` or schema-invalid attestation presented to
the validator MUST fail with `EVALUATION_ATTESTATION_SCHEMA_INVALID`.

#### Scenario: Malformed constructor input

- GIVEN an input with an unknown key, or missing any of the seven required keys, or `null`
- WHEN the constructor runs
- THEN it MUST fail with `EVALUATION_INPUT_INVALID`

#### Scenario: Blank metadata

- GIVEN an otherwise valid input with an empty `issuer_version`, `runtime_version`, or `issued_at`
- WHEN the constructor runs
- THEN it MUST fail with `EVALUATION_METADATA_INVALID`

### Requirement: Validator Recomputes And Fails Closed On Divergence {#REQ-evaluation-attestation-007}

`validateCandidateEvaluationAttestation(attestation, input)` MUST validate the
attestation against the schema, replay the binding and lineage, recompute every
digest, and compare against the attestation claims. It MUST return `{ ok: true }`
only when every claim matches and `attestation_id` replays over the attestation
body. A divergence in `evidence_root_digest`, `findings_digest`,
`expected_revision`, or `authority_revision`, or in a subject digest of a
non-self-consistent attestation, MUST fail with `EVALUATION_DIGEST_MISMATCH`
naming the divergent field in `error`. A stale lineage revision MUST surface as
an `authority_revision` mismatch. A self-consistent attestation (its
`attestation_id` replays) whose `candidate_id`, `contract_digest`,
`graph_digest`, or `policy_digest` differs from the presented chain MUST fail
with `EVALUATION_FOREIGN_ATTESTATION`. An attestation whose `attestation_id`
does not replay over its body (for example altered metadata) MUST fail with
`EVALUATION_IDENTITY_MISMATCH`.

#### Scenario: Tampered digest claim is rejected

- GIVEN a valid attestation with any of `candidate_id`, `contract_digest`, `graph_digest`, `evidence_root_digest`, `findings_digest`, `policy_digest`, `expected_revision`, or `authority_revision` replaced without recomputing `attestation_id`
- WHEN the validator runs
- THEN it MUST fail with `EVALUATION_DIGEST_MISMATCH` naming that field

#### Scenario: Altered metadata breaks identity

- GIVEN a valid attestation whose `issuer_version` was changed without recomputing `attestation_id`
- WHEN the validator runs
- THEN it MUST fail with `EVALUATION_IDENTITY_MISMATCH`

#### Scenario: Attestation of another candidate or policy is foreign

- GIVEN a self-consistent attestation built for a different policy or candidate than the presented chain
- WHEN the validator runs against the presented chain
- THEN it MUST fail with `EVALUATION_FOREIGN_ATTESTATION`

#### Scenario: Stale lineage revision is rejected

- GIVEN a presented lineage whose `revision` was advanced after the attestation was issued
- WHEN the validator runs
- THEN it MUST fail with `EVALUATION_DIGEST_MISMATCH` mentioning `authority_revision`

### Requirement: Approved-For-Evaluation Is Never A Delivery Pass {#REQ-evaluation-attestation-008}

The validator MUST accept only `expects: "evaluation"`. Any other value
(including `"delivery"` and `"pre-commit"`) MUST fail with
`EVALUATION_CONTEXT_MISMATCH`, and an absent `expects` MUST fail with
`EVALUATION_INPUT_INVALID`. An attestation whose `valid_for` was forged to
`"delivery"` MUST fail with `EVALUATION_ATTESTATION_SCHEMA_INVALID`. A
successful validation MUST NOT be interpreted as delivery authorization.

#### Scenario: Delivery context is rejected

- GIVEN a valid attestation and a matching authority chain
- WHEN the validator runs with `expects: "delivery"` or `expects: "pre-commit"`
- THEN it MUST fail with `EVALUATION_CONTEXT_MISMATCH`

#### Scenario: Forged valid_for is rejected

- GIVEN an attestation rehashed with `valid_for: "delivery"`
- WHEN the validator runs with `expects: "evaluation"`
- THEN it MUST fail with `EVALUATION_ATTESTATION_SCHEMA_INVALID`

### Requirement: Evaluation CAS Subject Identity {#REQ-evaluation-attestation-009}

`computeEvaluationSubjectId({ candidate_id, policy_digest })` MUST return
`"evaluation-attestation:"` followed by the `sha256Fingerprint` of domain
`candidate-evaluation-attestation-subject/v1` over `{ candidate_id,
policy_digest }`, so that it equals `evaluation-attestation:` plus the
attestation `expected_revision`. It MUST throw a `TypeError` when either field
is not a non-empty string. One subject MUST collect every emission attempt for
the same candidate under the same policy.

#### Scenario: Subject id matches the attestation expected revision

- GIVEN an attestation for a candidate and policy digest
- WHEN `computeEvaluationSubjectId` is called with that `candidate_id` and `policy_digest`
- THEN the result MUST equal `evaluation-attestation:${attestation.expected_revision}`

### Requirement: Issuer Envelope And Constructor Rejections Precede The Store {#REQ-evaluation-attestation-010}

`issueCandidateEvaluationAttestation(input)` MUST be asynchronous and MUST
require an input with exactly `store`, `permitLedger`, `operationPermit`,
`binding`, `lineage`, `issuance`, `phase`, `operationBinding`,
`issuer_version`, `runtime_version`, and `issued_at`; a missing or unknown key
MUST fail with `EVALUATION_ISSUANCE_INPUT_INVALID`. A `store` that does not
expose `load` and `compareAndSwap` MUST fail with
`EVALUATION_ISSUANCE_STORE_INVALID`. Every rejection of the pure constructor
(including `EVALUATION_K7_NO_MODEL_DEFERRED`) MUST be returned verbatim, before
any store read, with nothing written and no permit consumed.

#### Scenario: Malformed issuer envelope

- GIVEN an issuer input missing any required key, or carrying an unknown key
- WHEN the issuer runs
- THEN it MUST fail with `EVALUATION_ISSUANCE_INPUT_INVALID`
- AND the store, journal, receipts, and permit ledger MUST be unchanged

#### Scenario: Store without compareAndSwap

- GIVEN a store that exposes `load` but not `compareAndSwap`
- WHEN the issuer runs
- THEN it MUST fail with `EVALUATION_ISSUANCE_STORE_INVALID`

#### Scenario: No-model deferral writes nothing and consumes nothing

- GIVEN a binding-shaped record whose issuance replays to `K7_NO_MODEL_DEFERRED` and a live permit
- WHEN the issuer runs
- THEN it MUST fail with `EVALUATION_K7_NO_MODEL_DEFERRED`
- AND the store state, permits, receipts, and journal MUST be unchanged
- AND the permit MUST remain unconsumed in the ledger

### Requirement: Operation Binding Structural Rejections Precede The Store {#REQ-evaluation-attestation-011}

The emission MUST name, by `{ changePath, phase, expectedRevision, operation }`,
exactly one evaluation operation through `operationBinding`, resolved by the
common operation identity binding resolver. `operationBinding` MUST be an object
containing only `changePath`, `phase`, `expectedRevision`, `operation`,
`target`, and `candidates`; a non-object value, array, `null`, or unknown key
MUST fail with `EVALUATION_ISSUANCE_INPUT_INVALID`. A binding with none of the
four identity fields (including bindings carrying only `target` or `candidates`,
the legacy single-candidate passthrough) MUST fail with
`EVALUATION_OPERATION_BINDING_ABSENT`. A binding the resolver rejects as
malformed, stale, foreign, record-less, or contradictory (for example reasons
`binding.revision_mismatch`, `binding.change_mismatch`,
`binding.phase_mismatch`, `binding.operation_mismatch`, `binding.malformed`,
`binding.record_not_found`, `input.contradictory_snapshots`) MUST fail with
`EVALUATION_OPERATION_BINDING_REJECTED` and `operation_binding_reasons`
carrying the resolver reasons. Only a resolver decision of `bound`, or an exact
record match whose only problem is its recorded outcome (REQ-evaluation-attestation-012),
admits the bound identity. All of these rejections MUST occur before any store
read and MUST write nothing and consume nothing.

#### Scenario: Absent binding fails closed

- GIVEN `operationBinding` equal to `{}`, `{ target }`, or `{ candidates: [target] }`
- WHEN the issuer runs
- THEN it MUST fail with `EVALUATION_OPERATION_BINDING_ABSENT`
- AND nothing MUST be written and the permit MUST remain unconsumed

#### Scenario: Stale, foreign, or malformed binding is rejected

- GIVEN a binding with a different `expectedRevision`, `changePath`, `phase`, or `operation` than its target record, a binding with no matching record, or contradictory candidate snapshots
- WHEN the issuer runs
- THEN it MUST fail with `EVALUATION_OPERATION_BINDING_REJECTED`
- AND `operation_binding_reasons` MUST equal the single resolver reason for that case
- AND nothing MUST be written

#### Scenario: Unknown keys or non-object shape

- GIVEN `operationBinding` equal to `null`, a string, an array, or an object with an extra key
- WHEN the issuer runs
- THEN it MUST fail with `EVALUATION_ISSUANCE_INPUT_INVALID`

### Requirement: Recorded Or Unknown Outcome Requires Reconciliation After The Replay Check {#REQ-evaluation-attestation-012}

A binding whose target record is exactly matched but carries a recorded outcome
(`success` or `failure`) or an `unknown` outcome MUST NOT admit a fresh emission:
the issuer MUST fail with `EVALUATION_OPERATION_BINDING_RECONCILIATION_REQUIRED`
and `operation_binding_reasons` carrying the resolver reason
(`outcome.recorded_success`, `outcome.recorded_failure`, or
`target.unknown_outcome`), with nothing written and no permit consumed. This
check MUST be evaluated after the exact-replay check (REQ-evaluation-attestation-015):
an exact replay of a committed emission MUST still converge even when the caller
has marked the operation outcome `unknown`, whereas without an exact replay the
issuer MUST fail closed. A target record that has no resolvable identity (for
example no `revision`) MUST fail with the same reason code and reason
`target.unresolved_identity` before any store read, in which case the result
MUST NOT carry a `subject_id`.

#### Scenario: Recorded or unknown outcome is not emitted over

- GIVEN a bound operation whose target `lastOutcome` is `success`, `failure`, or `unknown`, and no prior committed emission
- WHEN the issuer runs
- THEN it MUST fail with `EVALUATION_OPERATION_BINDING_RECONCILIATION_REQUIRED`
- AND `operation_binding_reasons` MUST be `["outcome.recorded_success"]`, `["outcome.recorded_failure"]`, or `["target.unknown_outcome"]` respectively
- AND the store, receipts, journal, and permit ledger MUST be unchanged

#### Scenario: Target without resolvable identity fails before the store

- GIVEN a target record lacking its `revision`
- WHEN the issuer runs
- THEN it MUST fail with `EVALUATION_OPERATION_BINDING_RECONCILIATION_REQUIRED` and reason `["target.unresolved_identity"]`
- AND the result MUST NOT include a `subject_id`
- AND nothing MUST be written

#### Scenario: Exact replay converges despite an unknown outcome mark

- GIVEN an emission whose durable commit landed but whose caller observed an interruption
- AND the caller re-presents the same inputs with the target marked `unknown`
- WHEN the issuer runs
- THEN it MUST return `ok: true` with `replayed: true` and the same attestation and operation identity

#### Scenario: Unknown outcome without a committed emission fails closed

- GIVEN an interruption before the commit (no durable emission) and the target marked `unknown`
- WHEN the same inputs are re-presented
- THEN the issuer MUST fail with `EVALUATION_OPERATION_BINDING_RECONCILIATION_REQUIRED` and reason `["target.unknown_outcome"]`
- AND nothing MUST be written

### Requirement: Permit-Authorized Atomic Emission {#REQ-evaluation-attestation-013}

When the authority chain, operation binding, and permit are valid, the issuer
MUST load the evaluation subject head, authorize the operation
`issue-candidate-evaluation-attestation` through `authorizeOperationWithPermit`
against the head revision, and commit one atomic `compareAndSwap` carrying the
next state, the next journal, and an authority commit that consumes the permit
and stores its `operation-receipt/v1` in the winning revision. The next state
MUST be an `evaluation-attestation-ledger/v1` holding the attestation keyed by
`attestation_id`; the next journal MUST append exactly one `completed`
record with `effect_id` `emit-attestation:{attestation_id}` and `effect_class`
`idempotent-keyed`, whose `result` carries `attestation_id`, `subject_id`,
`permit_id`, and the bound `operation_identity`. The permit arguments MUST be
`{ operation, subject_id, attestation_id, operation_identity }` where
`operation_identity` is exactly `{ changePath, phase, expectedRevision,
operation }`; `emissionPermitArguments` MUST throw a `TypeError` when that
identity is absent or any of the four fields is not a non-empty string. After
the winning CAS the issuer MUST mark the permit consumed in the permit ledger.
The success result MUST be `{ ok: true, attestation, subject_id, revision,
replayed: false, converged, operation_identity, operation_receipt }` with a
frozen attestation, a receipt of kind `operation-receipt/v1` and outcome
`advanced` whose `revision` equals the result revision, and `revision` different
from the prior head. The issued attestation MUST validate with
`validateCandidateEvaluationAttestation` under `expects: "evaluation"`.

#### Scenario: Successful emission

- GIVEN a valid authority chain, a valid operation binding, a subject whose head is current, and a permit minted over the emission arguments
- WHEN the issuer runs
- THEN it MUST return `ok: true`, `replayed: false`, and the frozen attestation equal to the pure constructor output
- AND the stored state MUST hold the attestation under its id and the permit MUST be recorded `consumed` in the authority bag
- AND exactly one `emit-attestation:{attestation_id}` journal record with status `completed` and class `idempotent-keyed` MUST exist
- AND the journal result MUST carry the bound `operation_identity`
- AND the permit MUST be marked consumed in the ledger

#### Scenario: Permit arguments require a complete operation identity

- GIVEN `emissionPermitArguments` is called without an identity, or with an empty `phase`
- WHEN it runs
- THEN it MUST throw a `TypeError`

### Requirement: Permit Is Bound To The Operation, Single Use, And Revision Bound {#REQ-evaluation-attestation-014}

Because the bound operation identity is part of the permit arguments digest, a
permit minted for another evaluation operation (or a stale revision of the same
operation) MUST NOT authorize the emission: the issuer MUST fail with
`EVALUATION_ISSUANCE_PERMIT_REJECTED` and `cause: "unauthorized"`. A permit that
was already consumed MUST fail with `EVALUATION_ISSUANCE_PERMIT_REUSE` and
`cause: "permit-reuse"`. A permit minted for a head revision that has since
advanced MUST fail with `EVALUATION_ISSUANCE_PERMIT_STALE` and `cause:
"stale-permit"`. Binding and target records are caller-supplied snapshots: the
resolver proves only that they are mutually consistent, and the identity is
authenticated by the permit arguments digest, so whoever mints the permit owns
reading the operation record from a trusted source. In every rejected case
nothing MUST be written and the permit MUST remain unconsumed in the ledger
(unless it was already consumed).

#### Scenario: Permit minted for another evaluation operation

- GIVEN a permit minted over an operation identity with a different `expectedRevision`
- WHEN the issuer runs with the current operation binding
- THEN it MUST fail with `EVALUATION_ISSUANCE_PERMIT_REJECTED` and `cause: "unauthorized"`
- AND nothing MUST be written

#### Scenario: Consumed permit cannot emit again

- GIVEN a permit already consumed by a first emission
- WHEN the issuer runs again with that permit and a different `issued_at`
- THEN it MUST fail with `EVALUATION_ISSUANCE_PERMIT_REUSE` and `cause: "permit-reuse"`
- AND the store MUST still hold exactly one attestation and one receipt

#### Scenario: Stale permit after the head advanced

- GIVEN a permit minted at head revision R and a competing write that advanced the head
- WHEN the issuer runs
- THEN it MUST fail with `EVALUATION_ISSUANCE_PERMIT_STALE` and `cause: "stale-permit"`
- AND the permit MUST remain unconsumed

### Requirement: Exact Replay Converges On The Prior Receipt {#REQ-evaluation-attestation-015}

After loading the head and before evaluating any recorded outcome or
authorizing the permit, the issuer MUST check for an exact replay: a permit
already consumed in the authority bag whose stored receipt matches the
operation, subject, and arguments digest. On an exact replay the issuer MUST
return `{ ok: true, replayed: true, converged: true }` with the recomputed
attestation, the head revision, the bound `operation_identity`, and the prior
`operation_receipt`, without consuming a second permit, advancing the head, or
adding state, journal, or receipt entries.

#### Scenario: Re-presenting the same input replays

- GIVEN a committed emission and the same input re-presented
- WHEN the issuer runs
- THEN it MUST return `ok: true`, `replayed: true`, and `converged: true`
- AND the revision and the `operation_receipt` MUST equal the first result
- AND the authority bag MUST still hold exactly one receipt and one permit, the state one attestation, and the journal one record

### Requirement: One Operation, One Closure {#REQ-evaluation-attestation-016}

After the permit is authorized and when no exact replay applies, a fresh permit
MUST NOT re-emit an attestation the subject already holds and MUST NOT close an
evaluation operation that an earlier emission on the same subject already
closed. The first case MUST fail with `EVALUATION_ISSUANCE_ALREADY_ISSUED`. The
second, where a journal record's `result.operation_identity` equals the bound
identity under a different attestation, MUST fail with
`EVALUATION_OPERATION_ALREADY_CLOSED` naming the closing attestation in `error`.
Both MUST leave the revision, the stored attestations, and the receipts
unchanged and the new permit unconsumed.

#### Scenario: Second permit cannot re-emit the same attestation

- GIVEN a subject that already holds the attestation, and a second permit freshly minted for it
- WHEN the issuer runs with the second permit
- THEN it MUST fail with `EVALUATION_ISSUANCE_ALREADY_ISSUED`
- AND the head revision MUST be unchanged and the second permit unconsumed

#### Scenario: Closed operation cannot be closed by another attestation

- GIVEN an operation closed by a first attestation, and a later attestation for the same operation (different `issued_at`) with a freshly minted permit
- WHEN the issuer runs
- THEN it MUST fail with `EVALUATION_OPERATION_ALREADY_CLOSED`
- AND only the first attestation MUST remain stored and the head revision MUST be unchanged

### Requirement: CAS Failure Classification And Unknown-Outcome Reconciliation {#REQ-evaluation-attestation-017}

A competing revision between authorization and the CAS MUST fail with
`EVALUATION_ISSUANCE_CAS_CONFLICT` and `cause: "cas-conflict"`, leaving no
attestation, permit consumption, or receipt from the loser and the permit
unconsumed in the ledger. Any other typed `{ ok: false }` store failure MUST
fail with `EVALUATION_ISSUANCE_COMMIT_FAILED` preserving the store code in
`cause` and in `error`, writing nothing and leaving the permit unconsumed. A
thrown store error MUST fail with `EVALUATION_ISSUANCE_INTERRUPTED`
(outcome unknown) with the same safe-to-retry semantics: re-presenting the same
inputs MUST produce a fresh authorized CAS when the commit did not land, and an
exact replay when it did land (in which case the process-local ledger MAY remain
unmarked because the authority bag is the durable consume truth).

#### Scenario: Lost CAS race

- GIVEN a competing commit between authorization and the CAS
- WHEN the issuer runs
- THEN it MUST fail with `EVALUATION_ISSUANCE_CAS_CONFLICT` and `cause: "cas-conflict"`
- AND the permit MUST remain unconsumed and no attestation stored

#### Scenario: Non-conflict store failure is a commit failure

- GIVEN the store returns a typed failure with code `durability-error`
- WHEN the issuer runs
- THEN it MUST fail with `EVALUATION_ISSUANCE_COMMIT_FAILED` and `cause: "durability-error"`
- AND nothing MUST be written

#### Scenario: Interruption before the commit reconciles by re-presentation

- GIVEN a store that throws before committing
- WHEN the issuer runs and is then re-run with the same inputs
- THEN the first run MUST fail with `EVALUATION_ISSUANCE_INTERRUPTED` with nothing stored
- AND the second run MUST succeed with `replayed: false` and store the attestation

#### Scenario: Interruption after the commit reconciles by exact replay

- GIVEN a store that commits durably and then throws
- WHEN the issuer runs and is then re-run with the same inputs
- THEN the first run MUST fail with `EVALUATION_ISSUANCE_INTERRUPTED` while the state holds the attestation
- AND the second run MUST succeed with `replayed: true` and exactly one receipt and one journal record

### Requirement: Evaluation Attestation Never Authorizes Delivery {#REQ-evaluation-attestation-018}

The attestation constructor, validator, and issuer MUST declare and process
evaluation approval only. No function in this domain MUST authorize delivery,
and an attestation or its `operation-receipt/v1` MUST NOT be accepted as a
delivery authorization (REQ-evaluation-attestation-008).

#### Scenario: Evaluation attestation is rejected in a delivery context

- GIVEN an issued attestation
- WHEN it is presented to the validator with `expects: "delivery"`
- THEN the validator MUST fail with `EVALUATION_CONTEXT_MISMATCH`
