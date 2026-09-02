# Delta for verify-lineage

## ADDED Requirements

### Requirement: Verify Lineage MUST Persist Recoverable Candidate Records {#REQ-verify-lineage-010}

Before a mutable verify-lineage state references a `Candidate/v2`, the system MUST persist the Candidate's canonical bytes in an immutable, content-addressed record and MUST retain a recoverable reference with the lineage. The record MUST be validated before that reference becomes observable. Repeating persistence for byte-identical canonical input MUST be idempotent. This recovery material MUST NOT become a competing identity or authority store; canonical `candidate_id` remains authoritative.

#### Scenario: lineage start persists an exact preimage

- GIVEN a valid canonical `Candidate/v2`.
- WHEN `startVerifyLineage` creates a lineage.
- THEN its initial Candidate reference MUST resolve to the exact canonical bytes.
- AND `genesis_candidate_id` and `current_candidate_id` MUST equal the Candidate's canonical `candidate_id`.

#### Scenario: repeated persistence is byte-stable

- GIVEN canonical bytes already persisted for a Candidate.
- WHEN the same bytes are persisted again.
- THEN the reference and stored bytes MUST remain byte-equivalent.
- AND no divergent record MAY be created for the same content address.

### Requirement: Mutable Transitions MUST Rehydrate and Validate Candidate Evidence {#REQ-verify-lineage-011}

`prepareRemediation` and `recordRemediationAttempt` MUST recover the Candidate referenced by the persisted lineage rather than require an in-memory preimage. Before either transition mutates lineage state, the system MUST recompute the stored-byte digest and canonical `candidate_id`, and MUST require both to match the persisted reference and expected Candidate identity.

#### Scenario: remediation resumes in a new process

- GIVEN a lineage and its Candidate record were serialized to disk.
- AND a new process reloads that state with no in-memory Candidate.
- WHEN `prepareRemediation` runs.
- THEN it MUST recover and validate the referenced Candidate.
- AND the same valid state MUST permit the same remediation preparation.

#### Scenario: remediation successor survives another restart

- GIVEN a permitted remediation yields a valid successor Candidate.
- WHEN `recordRemediationAttempt` records the successor and the process restarts.
- THEN the successor record MUST be recoverable and double-validated.
- AND the reloaded lineage MUST retain its recorded `current_candidate_id` and next action.

#### Scenario: tampered, missing, or divergent material blocks before mutation

- GIVEN a referenced Candidate record is absent, has a mismatched byte digest, or recomputes to a different `candidate_id`.
- WHEN either mutable transition attempts recovery.
- THEN it MUST fail closed with a structured recovery reason.
- AND it MUST NOT advance status, `current_candidate_id`, attempts, findings, or allowed scopes.

### Requirement: Legacy ID-Only Lineages MUST Remain Readable but Immutable {#REQ-verify-lineage-012}

Lineages persisted before recoverable Candidate records MUST remain readable without fabricated preimages or history rewrites. A legacy ID-only lineage MUST NOT enter a mutable transition unless exact recoverable Candidate material is independently present and passes the same double validation.

#### Scenario: legacy inspection preserves state

- GIVEN a legacy lineage containing only Candidate IDs.
- WHEN it is loaded for inspection or next-action evaluation.
- THEN its historical fields MUST be returned unchanged.
- AND the runtime MUST NOT synthesize Candidate bytes from an ID, paths, or a digest.

#### Scenario: legacy remediation is rejected safely

- GIVEN an ID-only legacy lineage without a valid recoverable record.
- WHEN `prepareRemediation` or `recordRemediationAttempt` is requested.
- THEN the request MUST fail closed with a structured legacy-recovery reason.
- AND it MUST NOT consume an attempt or alter findings or scopes.

## MODIFIED Requirements

### Requirement: Verify Lineage MUST Use Canonical Candidate Identity

`REQ-VL-K3-001`

`verify_lineage` MUST utilizar como identidad del código el `candidate_id` canónico de `Candidate/v2`. Every persisted Candidate record and recovery result MUST validate against that canonical identity.

El sistema MUST NOT mantener una segunda función de identidad semántica basada exclusivamente en `paths`, `diff_hash` u otra representación parcial. A content address MAY identify recovery bytes, but MUST NOT replace or redefine `candidate_id`.

(Previously: required canonical `candidate_id` but did not require recoverable material to be checked against it.)

### Scenario: lineage opens against canonical Candidate

* GIVEN un `Candidate/v2` válido y canónico.
* WHEN Full Discovery abre una remediation lineage.
* THEN `genesis_candidate_id` MUST igualar exactamente `Candidate/v2.candidate_id`.
* AND `current_candidate_id` MUST igualar exactamente ese mismo `candidate_id`.

### Scenario: incomplete candidate fails closed

* GIVEN una operación authority-sensitive de verify.
* AND no puede resolverse un `Candidate/v2` canónico.
* WHEN se intenta abrir, continuar o cerrar una lineage.
* THEN la operación MUST fallar cerrada.
* AND MUST NOT generar una identidad alternativa desde `{}`, paths parciales o un `diff_hash` opcional.

### Scenario: recovered bytes disagree with canonical identity

* GIVEN a persisted Candidate record resolves to bytes whose canonical `candidate_id` differs from the lineage reference.
* WHEN a mutable transition validates the record.
* THEN the transition MUST fail closed.
* AND the lineage MUST retain its frozen identity and history unchanged.
