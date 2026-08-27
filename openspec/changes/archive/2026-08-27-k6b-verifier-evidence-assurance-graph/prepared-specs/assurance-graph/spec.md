# Assurance Graph Specification

## Purpose

Define the Assurance Graph as a content-addressed, reproducible projection of
evidence and verification over a frozen Candidate. It derives from OpenSpec,
Git, Candidate, and Execution Graph. It is never semantic authority. Selective
invalidation on successor preserves independent evidence.

## Requirements

### Requirement: Derived Projection Not Authority {#REQ-assurance-graph-001}

The Assurance Graph MUST be derived from canonical OpenSpec artifacts, Git
bytes, the frozen Candidate, the Execution Graph, evidence nodes, and
verification decisions. Consumers MUST treat it as read-only. The graph MUST
NOT grant lifecycle, approval, or delivery authority. Divergence from
OpenSpec/Git/Candidate MUST fail closed. K6b MUST NOT populate `reviewed-by`
edges or treat Evaluation Attestation or Delivery Authorization as authority.

#### Scenario: Matching canonical inputs project a graph

- GIVEN canonical OpenSpec/Git/Candidate/Execution Graph inputs and bound evidence
- WHEN the Assurance Graph is materialized
- THEN the projection MUST be derived from those inputs
- AND MUST NOT override OpenSpec/Git/Candidate

#### Scenario: Divergent graph fails closed

- GIVEN an Assurance Graph that cannot be recomputed from current OpenSpec/Git/Candidate
- WHEN reconciliation runs
- THEN validation MUST fail closed
- AND consumers MUST NOT proceed on the unreconciliation graph

### Requirement: Reproducible Digest And K6b Edges {#REQ-assurance-graph-002}

Identical canonical inputs MUST produce the same graph digest and the same
`AssuranceEdge` set. Each K6b edge MUST have `from`, `to`, and `relation` in
`verified-by | satisfies | derived-from | invalidates`. Edge serialization
order MUST NOT change the digest. The projection MAY include requirement,
graph-node, work-order, source/patch, candidate, test-evidence, and
verification-decision subjects. It MUST NOT emit K7 findings, K8 attestation,
or K10 authorization as authoritative subjects.

#### Scenario: Same inputs yield the same digest and edges

- GIVEN identical canonical inputs
- WHEN the Assurance Graph is materialized twice
- THEN both digests MUST be byte-identical
- AND both edge sets MUST be equal

#### Scenario: Forbidden later-slice relations are rejected

- GIVEN an edge with relation `reviewed-by` or a node claiming Evaluation Attestation authority
- WHEN the K6b graph is validated
- THEN validation MUST fail closed

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
