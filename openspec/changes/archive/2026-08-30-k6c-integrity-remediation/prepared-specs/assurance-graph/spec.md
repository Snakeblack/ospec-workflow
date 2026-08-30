# Assurance Graph Specification

## Purpose

Define the Assurance Graph as a content-addressed, reproducible projection of
evidence and verification over a frozen Candidate. It derives from OpenSpec,
Git, Candidate, and Execution Graph. It is never semantic authority. Selective
invalidation on successor preserves independent evidence.

## Requirements

### Requirement: Derived Projection Not Authority {#REQ-assurance-graph-001}

The Assurance Graph MUST be derived from canonical OpenSpec artifacts, Git
bytes, the frozen Candidate, the Execution Graph, evidence nodes, verification
decisions, and persistable assessments. Consumers MUST treat it as read-only.
The graph MUST NOT grant lifecycle, approval, or delivery authority.
Divergence from OpenSpec/Git/Candidate/contract/policy MUST fail closed with
`GRAPH_DIVERGENCE`. Failure to materialize the projection MUST fail closed
with `GRAPH_PROJECTION_FAILED`. K6b MUST NOT populate `reviewed-by` edges or
treat Evaluation Attestation or Delivery Authorization as authority.
(Previously: divergence was unnamed fail-closed and canonical inputs excluded contract/policy digest binding.)

#### Scenario: Matching canonical inputs project a graph

- GIVEN canonical OpenSpec/Git/Candidate/Execution Graph inputs and bound evidence
- WHEN the Assurance Graph is materialized
- THEN the projection MUST be derived from those inputs
- AND MUST NOT override OpenSpec/Git/Candidate

#### Scenario: Divergent graph fails closed

- GIVEN an Assurance Graph that cannot be recomputed from current OpenSpec/Git/Candidate
- WHEN reconciliation runs
- THEN validation MUST fail closed with `GRAPH_DIVERGENCE`
- AND consumers MUST NOT proceed on the unreconciliation graph

#### Scenario: Contract or policy change forces reconciliation fail-closed

- GIVEN a stored graph projected under contract digest C1 and policy snapshot P1
- AND current canonical inputs are C2 or P2, producing a distinct `graph_id`
- WHEN reconciliation runs against the stored graph
- THEN validation MUST fail closed with `GRAPH_DIVERGENCE`

### Requirement: Reproducible Digest And K6b Edges {#REQ-assurance-graph-002}

Identical persistable canonical inputs MUST produce the same graph digest and the same `AssuranceEdge` set. `graph_id` MUST fingerprint at least:

| Canonical input | In `graph_id` preimage |
| --- | --- |
| contract digest | MUST |
| policy snapshot identity | MUST |
| Execution Graph digest | MUST |
| canonical OpenSpec input | MUST |
| `candidate_id` and canonical nodes/edges | MUST |

Altering any of those inputs MUST produce a distinct `graph_id`. Edge serialization order MUST NOT change the digest.

Each K6b edge MUST have `from`, `to`, and `relation` in `verified-by | satisfies | derived-from | invalidates`. The projector MUST emit a `satisfies` edge (`relation: "satisfies"`) from an assessment/evidence node to a requirement/obligation node ONLY when `evidence_requirements_satisfied.length > 0`. If `evidence_requirements_satisfied` is empty or omitted, no `satisfies` edge MUST be emitted into the Assurance Graph.

The projection MAY include requirement, graph-node, work-order, source/patch, candidate, test-evidence, and verification-decision subjects. It MUST NOT emit K7 findings, K8 attestation, or K10 authorization as authoritative subjects.
(Previously: satisfies edges were projected without checking that evidence_requirements_satisfied was non-empty.)

#### Scenario: Same inputs yield the same digest and edges

- GIVEN identical canonical inputs
- WHEN the Assurance Graph is materialized twice
- THEN both digests MUST be byte-identical
- AND both edge sets MUST be equal

#### Scenario: Forbidden later-slice relations are rejected

- GIVEN an edge with relation `reviewed-by` or a node claiming Evaluation Attestation authority
- WHEN the K6b graph is validated
- THEN validation MUST fail closed

#### Scenario: Canonical input change yields a distinct graph_id

- GIVEN a projection under contract digest C1, policy snapshot P1, Execution Graph digest G1, and canonical OpenSpec input O1
- WHEN any one of C1, P1, G1, or O1 is replaced with a distinct persistable value
- THEN the resulting `graph_id` MUST differ
- AND reconciliation against the prior graph MUST fail closed with `GRAPH_DIVERGENCE`

#### Scenario: Conditional projection of satisfies edge requires non-empty satisfaction

- GIVEN an assessment record where `evidence_requirements_satisfied` has at least one item
- WHEN the Assurance Graph is projected
- THEN a `satisfies` edge linking the assessment/evidence to the obligation MUST be emitted

#### Scenario: Empty or missing evidence_requirements_satisfied omits satisfies edge

- GIVEN an assessment record where `evidence_requirements_satisfied` is empty `[]`
- WHEN the Assurance Graph is projected
- THEN no `satisfies` edge MUST be emitted for that assessment/evidence

### Requirement: Selective Invalidation Closure {#REQ-assurance-graph-003}

When a Candidate successor appears or a source subject changes, the system
MUST compute the dependent closure over `invalidates`, `derived-from`,
`verified-by`, and `satisfies` edges, invalidate dependent evidence, and
preserve evidence outside that closure. The system MUST NOT re-execute every
verification by default. The system MUST NOT reuse evidence reachable through
a transitive `invalidates` edge.

#### Scenario: Successor invalidates only the dependent closure

- GIVEN an Assurance Graph with dependent evidence D and independent evidence I
- AND a Candidate successor that affects only D's source subjects
- WHEN selective invalidation runs
- THEN D MUST be invalidated
- AND I MUST remain valid

#### Scenario: Transitive invalidates blocks reuse

- GIVEN evidence E connected to a successor-affected subject by a transitive `invalidates` path
- WHEN verification is attempted with E
- THEN the verifier MUST fail closed
- AND MUST NOT treat E as satisfying evidence

### Requirement: Non-Authoritative Equivalence Manifest {#REQ-assurance-graph-004}

The system MAY emit an equivalence manifest bound to the graph digest and
`CandidateId` for later K9 evaluation. The manifest MUST NOT promote
equivalence, alter Strict TDD fallback, or serve as attestation or delivery
authorization.

#### Scenario: Manifest is emitted without promotion

- GIVEN a reproducible Assurance Graph for a frozen Candidate
- WHEN an equivalence manifest is emitted
- THEN it MUST bind the graph digest and CandidateId
- AND MUST NOT change verifier fallback or authorize delivery

#### Scenario: Manifest cannot alias attestation or authorization

- GIVEN an equivalence manifest payload
- WHEN validated against CandidateEvaluationAttestation or DeliveryAuthorization schemas
- THEN validation MUST fail closed

### Requirement: Forbidden Subjects Matched By Kind And Namespace {#REQ-assurance-graph-005}

`rejectForbidden` MUST accept or reject subjects using structured `kind` and
`namespace` (or equivalent typed fields). It MUST NOT reject a subject because
a forbidden token is a substring of `id`. A node with `kind: "requirement"`
and `id: "REQ-add-authorization-header"` MUST remain valid. Nodes whose `kind`
or `namespace` denote K7 finding, K8 attestation, or K10 authorization MUST
fail closed. Edges whose `relation` is outside
`verified-by | satisfies | derived-from | invalidates` MUST fail closed.

#### Scenario: Requirement id containing authorization remains valid

- GIVEN a projected node `{ id: "REQ-add-authorization-header", kind: "requirement" }`
- WHEN `rejectForbidden` runs
- THEN validation MUST succeed
- AND MUST NOT reject the node for the substring `authorization`

#### Scenario: Structured authorization kind is rejected

- GIVEN a projected node whose `kind` or `namespace` denotes authorization, attestation, or finding
- WHEN `rejectForbidden` runs
- THEN validation MUST fail closed

### Requirement: Replay From Persistable Outputs {#REQ-assurance-graph-006}

The Assurance Graph MUST be reproducible from persistable outputs: canonical input digests, projected nodes and edges, replay Evidence bundles containing each `evidence/v2` plus raw observation bytes or a resolvable content-addressed `observation_blob_id` plus a bound `runner_receipt_id`, persistable `runner-receipt/v1` records, verification records (`verification/v2`), and assessment records (`assessment/v2`) that carry `obligation_id`. The opaque `runnerReceiptChannel` is an ephemeral runtime capability and MUST NOT be treated as a persistable output. Replay MUST rehydrate persisted `runner-receipt/v1` records from a trusted store and MUST present a newly issued ephemeral `runnerReceiptChannel`. Replay MUST NOT require ephemeral projector fields. Consumers MUST NOT reinvent `obligation_id` values from vanished fields. `satisfies` edges MUST be rebuildable from persistable assessments where `evidence_requirements_satisfied.length > 0`.

`replayAssuranceGraph` MUST perform comprehensive validation over all replayed records before accepting the replay:
1. Persistable bundle: the replay argument MUST be a non-null object. Unexpected exceptions during validation MUST fail closed with `GRAPH_DIVERGENCE`.
2. Trusted runner receipts: persistable receipt authority MUST be `runner-receipt/v1` records, not the channel. Replay MUST rehydrate those records from a trusted store and MUST present an opaque `runnerReceiptChannel` newly issued by runtime authority over the rehydrated records. A missing persisted record, a missing channel, a reconstructed public-field object, reuse of a pre-restart channel identity, or untrusted authority MUST fail closed with `GRAPH_DIVERGENCE`.
3. `evidence/v2`: schema validity against `evidence/v2.schema.json`; REQUIRED inline raw bytes or a resolvable `observation_blob_id` equal to `record.digest`; `candidate_id` matching graph subject; recomputed content digest via `digestRawBytes` matching `record.digest`; recomputed `evidence_id` via `computeEvidenceId` matching `record.evidence_id`; evaluation of provenance sufficiency via `evaluateProvenanceSufficiency` verifying admissible provenance against trusted collector or transport metadata; strict absence of `verdict`; and exact 1:1 binding of each wrapper `runner_receipt_id` to a trusted receipt whose `candidate_id`, `evidence_id`, and `node_id` match the Evidence record. Duplicate or orphan receipt bindings MUST fail closed.
4. `verification/v2`: schema validity against `verification/v2.schema.json`; recomputed `verification_id`; `candidate_id` matching graph subject; and `evidence_ids` being a strict subset of replayed evidence IDs.
5. `assessment/v2`: schema validity against `assessment/v2.schema.json`; recomputed `assessment_id`; `candidate_id` matching graph subject; bound `policy_snapshot_id` matching graph; referenced `evidence_id` existing in replayed evidence; `obligation_id` existing in Execution Graph; bound `node_id` implementing that obligation; persistable `node_id` matching evidence record; non-empty `evidence_requirements_satisfied` for satisfaction claims; those tokens attested by the bound receipt `satisfied_tokens`; and `normalizeRole(assessment.role)` equal to `normalizeRole` of the bound receipt `role`. Role mismatch MUST fail closed with `GRAPH_DIVERGENCE` even when `assessment_id` recomputes identically.
6. Obligation coverage: verified satisfaction of all non-deferred MUST obligations by the replayed assessments.

Any check failure, missing or unresolvable observation material, missing persisted `runner-receipt/v1` record, missing trusted receipt authority, tampering with `assessment_id`, `evidence_id`, `verification_id`, or `digest`, assessment role disagreeing with the bound receipt after `normalizeRole`, or provenance insufficiency MUST fail closed with `GRAPH_DIVERGENCE` or as an invalid artifact. Cryptographic validation MUST NOT be skipped when bytes are absent. Tampered evidence, assessments, or verification records MUST NOT replay as valid.
(Previously: persistable outputs listed the opaque `runnerReceiptChannel`; replay did not require rehydrated `runner-receipt/v1` records plus a newly issued channel, and did not bind `assessment.role` to the bound receipt role independently of `assessment_id`.)

#### Scenario: Replay from persisted outputs yields the same graph

- GIVEN a previously projected graph plus persisted evidence, verification, assessments, canonical input digests, and `runner-receipt/v1` records
- AND no ephemeral `obligation_ids` on the original projector call
- AND every persisted evidence, verification, and assessment record passes comprehensive revalidation
- WHEN the graph is replayed from those persistable outputs plus a newly issued ephemeral `runnerReceiptChannel`
- THEN the recomputed `graph_id` and edge set MUST be byte-identical to the stored graph

#### Scenario: Cross-runtime replay from persisted receipts yields the same graph_id

- GIVEN runtime A verified a candidate and persisted the replay bundle together with `runner-receipt/v1` records in a trusted store
- AND runtime B loads those records from that store and issues a new ephemeral `runnerReceiptChannel`
- WHEN `replayAssuranceGraph` runs on B
- THEN the recomputed `graph_id` MUST be byte-identical to the graph persisted by A

#### Scenario: Replay without observation material fails closed

- GIVEN persisted `evidence/v2` records without inline bytes and without resolvable content-addressed blob references
- WHEN `replayAssuranceGraph` runs
- THEN replay MUST fail closed with `GRAPH_DIVERGENCE`
- AND MUST NOT skip digest or EvidenceId recomputation

#### Scenario: Content-addressed observation blob replays byte-identically

- GIVEN every replay Evidence wrapper carries `observation_blob_id === evidence.digest`
- AND every reference resolves to bytes whose digest matches that identifier
- WHEN `replayAssuranceGraph` runs
- THEN the recomputed `graph_id` and edge set MUST be byte-identical to the original projection

#### Scenario: Tampered assessment_id fails replay

- GIVEN persisted assessments plus a stored graph that would otherwise replay
- AND one assessment whose `assessment_id` does not match the identity recomputed from its persistable fields
- WHEN `replayAssuranceGraph` runs
- THEN replay MUST fail closed with `GRAPH_DIVERGENCE` or as an invalid assessment

#### Scenario: Mutated assessment role with recomputed assessment_id fails closed

- GIVEN a persisted assessment whose `role` is `acceptance` bound to a `runner-receipt/v1` whose `role` is `acceptance`
- AND the assessment `role` is mutated to `integration` with `assessment_id` recomputed so identity validation would otherwise pass
- WHEN `replayAssuranceGraph` runs
- THEN replay MUST fail closed with `GRAPH_DIVERGENCE`
- AND MUST NOT accept the replay because `assessment_id` recomputes

#### Scenario: Assessment fails schema, candidate, or policy revalidation

- GIVEN a persisted assessment that fails schema validation, whose `candidate_id` does not match the graph subject, or whose bound policy-snapshot identity does not match the graph
- WHEN `replayAssuranceGraph` runs
- THEN replay MUST fail closed with `GRAPH_DIVERGENCE` or as an invalid assessment

#### Scenario: Assessment bound to missing evidence or non-implementing node fails replay

- GIVEN a persisted assessment whose `evidence_id` does not exist, whose `obligation_id` is absent from the graph, whose node does not implement that obligation, or whose `node_id` disagrees with the evidence record
- WHEN `replayAssuranceGraph` runs
- THEN replay MUST fail closed with `GRAPH_DIVERGENCE` or as an invalid assessment

#### Scenario: Evidence v2 digest mismatch or invalid candidate binding fails replay

- GIVEN an `evidence/v2` record whose declared `digest` does not match recomputed `digestRawBytes`, or whose `candidate_id` differs from the graph subject
- WHEN `replayAssuranceGraph` runs
- THEN replay MUST fail closed with `GRAPH_DIVERGENCE`

#### Scenario: Tampered evidence_id or failed computeEvidenceId fails replay

- GIVEN an `evidence/v2` record whose declared `evidence_id` does not match `computeEvidenceId` recomputed from its fields and raw bytes
- WHEN `replayAssuranceGraph` runs
- THEN replay MUST fail closed with `GRAPH_DIVERGENCE`

#### Scenario: Insufficient provenance during evidence replay fails replay

- GIVEN an `evidence/v2` record whose provenance fails `evaluateProvenanceSufficiency` or lacks trusted collector metadata
- WHEN `replayAssuranceGraph` runs
- THEN replay MUST fail closed with `GRAPH_DIVERGENCE`

#### Scenario: Verification v2 referencing non-existent evidence_id fails replay

- GIVEN a `verification/v2` record whose `evidence_ids` array contains an identifier not present in replayed evidence
- WHEN `replayAssuranceGraph` runs
- THEN replay MUST fail closed with `GRAPH_DIVERGENCE`

#### Scenario: Replay without trusted runner receipt authority fails closed

- GIVEN persistable evidence, assessments, verification, and canonical inputs that would otherwise replay
- AND no opaque runtime-issued `runnerReceiptChannel`
- WHEN `replayAssuranceGraph` runs
- THEN replay MUST fail closed with `GRAPH_DIVERGENCE`

#### Scenario: Missing persisted runner-receipt record fails closed

- GIVEN persistable evidence, assessments, verification, and canonical inputs that would otherwise replay
- AND a bound `runner_receipt_id` whose `runner-receipt/v1` record is absent from the trusted store
- WHEN `replayAssuranceGraph` runs
- THEN replay MUST fail closed with `GRAPH_DIVERGENCE`

#### Scenario: Forged runnerReceiptChannel public fields fail closed

- GIVEN a persistable replay bundle whose persistable receipt artifact is the `runner-receipt/v1` record, not the channel
- AND a caller-constructed object copying `kind`, `issuer_id`, and `transport` without runtime-issued identity
- WHEN `replayAssuranceGraph` runs
- THEN replay MUST fail closed with `GRAPH_DIVERGENCE`
- AND copying those public fields MUST NOT reconstruct channel authority

#### Scenario: Replay Evidence not exactly bound to a trusted receipt fails closed

- GIVEN replay Evidence whose `runner_receipt_id` is missing, reused, or whose receipt `candidate_id`, `evidence_id`, or `node_id` disagrees with the Evidence record
- WHEN `replayAssuranceGraph` runs
- THEN replay MUST fail closed with `GRAPH_DIVERGENCE`

#### Scenario: Assessment coverage not attested by the bound receipt fails closed

- GIVEN a persistable assessment whose `evidence_requirements_satisfied` contains a token absent from the bound receipt `satisfied_tokens`
- WHEN `replayAssuranceGraph` runs
- THEN replay MUST fail closed with `GRAPH_DIVERGENCE`

#### Scenario: Null or non-object replay bundle fails closed

- GIVEN a `null` or non-object persistable argument
- WHEN `replayAssuranceGraph` runs
- THEN replay MUST fail closed with `GRAPH_DIVERGENCE`

### Requirement: Projector Fail-Closed On Contradictory Canonical Inputs {#REQ-assurance-graph-007}

`projectAssuranceGraph` and `resolveCanonicalInputDigests()` MUST fail closed with `GRAPH_DIVERGENCE` when supplied `canonicalInputs` contradict the Graph, contract, policy, or OpenSpec inputs they claim to project.

`resolveCanonicalInputDigests()` MUST authoritatively verify and compute canonical input digests:
1. `openspec_input_digest` recomputed from canonical OpenSpec documents.
2. `contract_digest` recomputed from canonical contract schema definitions.
3. `policy_snapshot_id` verified against the policy snapshot binding.
4. `execution_graph_digest` recomputed from the compiled Execution Graph.

If any supplied input digest does not strictly match the authoritative recomputed digest (`provided !== recomputed`), `resolveCanonicalInputDigests()` and `projectAssuranceGraph` MUST immediately fail closed with `GRAPH_DIVERGENCE`. The projector MUST NOT fingerprint a null, absent, or unverified digest for any required canonical input in the `graph_id` preimage.
(Previously: resolveCanonicalInputDigests did not mandate authoritative openspec_input_digest recomputation with strict GRAPH_DIVERGENCE mismatch rejection.)

#### Scenario: Graph contract contradicts canonicalInputs

- GIVEN an Execution Graph whose contract digest is C1
- AND `canonicalInputs` whose contract digest is C2, where C1 ≠ C2
- WHEN `projectAssuranceGraph` runs
- THEN projection MUST fail closed with `GRAPH_DIVERGENCE`
- AND MUST NOT emit a graph whose `graph_id` fingerprints the contradictory pair

#### Scenario: Null required canonical digest is not fingerprinted

- GIVEN a required canonical input whose digest is null or absent
- WHEN `projectAssuranceGraph` runs
- THEN projection MUST fail closed
- AND MUST NOT produce a `graph_id` that fingerprints a null digest for that input

#### Scenario: OpenSpec input digest mismatch in resolveCanonicalInputDigests fails closed

- GIVEN a caller-supplied `openspec_input_digest` D1
- AND authoritative recomputed OpenSpec digest D2, where D1 ≠ D2
- WHEN `resolveCanonicalInputDigests()` evaluates canonical inputs
- THEN resolution MUST fail closed with error code `GRAPH_DIVERGENCE`

### Requirement: Reconcile Stored Payload Divergence {#REQ-assurance-graph-008}

`reconcileAssuranceGraph` MUST detect stored-graph divergence beyond equality
of `graph_id` and edges. It MUST fail closed with `GRAPH_DIVERGENCE` when
stored `nodes`, `canonical_inputs`, `candidate_id`, or kind/schema diverge
from the recomputed projection, or when `graph_id` recomputed from the stored
payload does not match the stored `graph_id`. Comparing only stored
`graph_id` plus edges MUST NOT be sufficient to declare reconciliation OK.

#### Scenario: Tampered stored nodes fail closed

- GIVEN a stored Assurance Graph whose `graph_id` and edges match a recomputation
- AND whose persistable `nodes` have been altered
- WHEN `reconcileAssuranceGraph` runs
- THEN validation MUST fail closed with `GRAPH_DIVERGENCE`

#### Scenario: Stored payload or identity fields diverge

- GIVEN a stored Assurance Graph whose `candidate_id`, persistable `canonical_inputs`, or kind/schema differ from the current projection, or whose declared `graph_id` does not equal the digest recomputed from its stored payload
- WHEN `reconcileAssuranceGraph` runs
- THEN validation MUST fail closed with `GRAPH_DIVERGENCE`

### Requirement: Deterministic K6c Challenge Projection And Replay {#REQ-assurance-graph-009}

The Assurance Graph projector MUST accept K6c challenge material only after validating canonical `challenge-plan/v1` and `challenge-result/v1` identities, schemas, and bindings to the graph Candidate, node, strategy, and PolicySnapshot. It MUST project the single validated plan and its exact result set as non-authoritative derived records in the graph preimage; these records MUST NOT confer authorization.

The projection MUST reject an absent mandatory plan, duplicate result, unknown selected type, result for a skipped type, missing selected result, foreign binding, or failed/error result. The projector MUST compute the same graph_id and edges from byte-identical canonical inputs and persisted K6c records. Replay MUST revalidate those records and their exact cardinality before reconstructing the graph; any divergence MUST fail closed with `GRAPH_DIVERGENCE`.

#### Scenario: Complete canonical K6c material projects reproducibly

- GIVEN one valid plan and one passed result for each selected challenge bound to canonical graph inputs
- WHEN projection and later replay run from persisted material
- THEN the graph_id and K6c-derived records MUST be byte-identical

#### Scenario: Duplicate or foreign K6c record fails projection

- GIVEN K6c records containing a duplicate result or a mismatched Candidate, node, strategy, or PolicySnapshot
- WHEN the projector or replay validates them
- THEN it MUST fail closed with `GRAPH_DIVERGENCE`

#### Scenario: Mandatory plan absence blocks projection

- GIVEN policy or strategy requires challenge verification and no canonical plan is supplied
- WHEN graph projection is requested
- THEN no graph MUST be emitted
- AND the request MUST fail closed

