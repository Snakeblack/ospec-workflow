# Delta for Assurance Graph

## ADDED Requirements

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
