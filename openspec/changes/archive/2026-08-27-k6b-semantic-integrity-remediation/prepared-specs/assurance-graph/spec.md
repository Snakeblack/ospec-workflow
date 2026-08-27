# Assurance Graph Specification

## Purpose

Define the Assurance Graph as a content-addressed, reproducible projection of
evidence and verification over a frozen Candidate. It derives from OpenSpec,
Git, Candidate, and Execution Graph. It is never semantic authority. Selective
invalidation on successor preserves independent evidence.

## Requirements

### Requirement:### Requirement: Derived Projection Not Authority {#REQ-assurance-graph-001}

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

### Requirement:### Requirement: Reproducible Digest And K6b Edges {#REQ-assurance-graph-002}

Identical persistable canonical inputs MUST produce the same graph digest and
the same `AssuranceEdge` set. `graph_id` MUST fingerprint at least:

| Canonical input | In `graph_id` preimage |
| --- | --- |
| contract digest | MUST |
| policy snapshot identity | MUST |
| Execution Graph digest | MUST |
| canonical OpenSpec input | MUST |
| `candidate_id` and canonical nodes/edges | MUST |

Altering any of those inputs MUST produce a distinct `graph_id`. Edge
serialization order MUST NOT change the digest. Each K6b edge MUST have
`from`, `to`, and `relation` in
`verified-by | satisfies | derived-from | invalidates`. The projection MAY
include requirement, graph-node, work-order, source/patch, candidate,
test-evidence, and verification-decision subjects. It MUST NOT emit K7
findings, K8 attestation, or K10 authorization as authoritative subjects.
(Previously: `graph_id` digested only candidate_id plus canonical nodes/edges.)

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

### Requirement:### Requirement: Selective Invalidation Closure {#REQ-assurance-graph-003}

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

### Requirement:### Requirement: Non-Authoritative Equivalence Manifest {#REQ-assurance-graph-004}

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

### Requirement:### Requirement: Forbidden Subjects Matched By Kind And Namespace {#REQ-assurance-graph-005}

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

The Assurance Graph MUST be reproducible from persistable outputs: canonical
input digests, projected nodes and edges, evidence records, verification
records, and assessment/binding records that carry `obligation_id`. Replay
MUST NOT require ephemeral projector fields. Consumers MUST NOT reinvent
`obligation_id` values from vanished fields. `satisfies` edges MUST be
rebuildable from persistable assessments. `replayAssuranceGraph` MUST
revalidate each persisted assessment before accepting the replay: schema
validity; recomputed assessment identity; `candidate_id` match; bound
policy-snapshot identity; referenced evidence exists; `obligation_id` is in
the graph; the bound node implements that obligation; and persistable
`node_id` matches the evidence record. Any check failure MUST fail closed
with `GRAPH_DIVERGENCE` or as an invalid assessment. A tampered
`assessment_id` MUST NOT replay as valid.
(Previously: replay compared recomputed graph_id and edges without revalidating persisted assessments.)

#### Scenario: Replay from persisted outputs yields the same graph

- GIVEN a previously projected graph plus persisted evidence, verification, assessments, and canonical input digests
- AND no ephemeral `obligation_ids` on the original projector call
- AND every persisted assessment passes revalidation
- WHEN the graph is replayed from those persistable outputs only
- THEN the recomputed `graph_id` and edge set MUST be byte-identical to the stored graph

#### Scenario: Tampered assessment_id fails replay

- GIVEN persisted assessments plus a stored graph that would otherwise replay
- AND one assessment whose `assessment_id` does not match the identity recomputed from its persistable fields
- WHEN `replayAssuranceGraph` runs
- THEN replay MUST fail closed with `GRAPH_DIVERGENCE` or as an invalid assessment

#### Scenario: Assessment fails schema, candidate, or policy revalidation

- GIVEN a persisted assessment that fails schema validation, whose `candidate_id` does not match the graph subject, or whose bound policy-snapshot identity does not match the graph
- WHEN `replayAssuranceGraph` runs
- THEN replay MUST fail closed with `GRAPH_DIVERGENCE` or as an invalid assessment

#### Scenario: Assessment bound to missing evidence or non-implementing node fails replay

- GIVEN a persisted assessment whose `evidence_id` does not exist, whose `obligation_id` is absent from the graph, whose node does not implement that obligation, or whose `node_id` disagrees with the evidence record
- WHEN `replayAssuranceGraph` runs
- THEN replay MUST fail closed with `GRAPH_DIVERGENCE` or as an invalid assessment

### Requirement: Projector Fail-Closed On Contradictory Canonical Inputs {#REQ-assurance-graph-007}

`projectAssuranceGraph` MUST fail closed with `GRAPH_DIVERGENCE` when supplied
`canonicalInputs` contradict the Graph, contract, or policy they claim to
project. Required canonical input digests MUST be present and non-null. The
projector MUST NOT fingerprint a null or absent digest for any required
canonical input in the `graph_id` preimage. Contradiction or a null required
digest MUST NOT yield a successful projection.

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
