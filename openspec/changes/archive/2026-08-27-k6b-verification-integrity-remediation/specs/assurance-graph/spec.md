# Delta for Assurance Graph

## ADDED Requirements

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

The Assurance Graph MUST be reproducible from persistable outputs: canonical
input digests, projected nodes and edges, evidence records, verification
records, and assessment/binding records that carry `obligation_id`. Replay
MUST NOT require ephemeral projector fields. Consumers MUST NOT reinvent
`obligation_id` values from vanished fields. `satisfies` edges MUST be
rebuildable from persistable assessments.

#### Scenario: Replay from persisted outputs yields the same graph

- GIVEN a previously projected graph plus persisted evidence, verification, assessments, and canonical input digests
- AND no ephemeral `obligation_ids` on the original projector call
- WHEN the graph is replayed from those persistable outputs only
- THEN the recomputed `graph_id` and edge set MUST be byte-identical to the stored graph

## MODIFIED Requirements

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
