# Delta for Assurance Graph

## ADDED Requirements

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

## MODIFIED Requirements

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
