# harness-authority-canon Specification

## Purpose

Define the harness authority canon so no authority operation falls back to
prose interpretation, Graph IR remains a derived plan rather than an independent
source of truth, and the evidence surfaces still shipped (Assurance Graph, K6c
catalog and integrity, K6d delta) never grant delivery authority. The K2.1
authority, permit and host-adapter requirements were retired in E1.5 (v2.97.0)
with their code.

## Requirements

### Requirement: OpenSpec and Git Are Sole Semantic Authority {#REQ-harness-authority-canon-001}

OpenSpec artifacts and Git bytes MUST remain the sole semantic authority for a
change. Runtime lifecycle state MUST reconcile to that authority. Graph IR
MUST NOT be treated as an independent authority: any Graph IR projection MUST
derive from or reconcile against OpenSpec/Git, and a divergence MUST fail
closed. The Assurance Graph MUST NOT be treated as an independent authority:
any Assurance Graph projection MUST derive from or reconcile against
OpenSpec/Git/Candidate, and a divergence MUST fail closed.
(Previously: sole-authority text named Graph IR only; K6b adds Assurance Graph as a second derived projection that also cannot override OpenSpec/Git/Candidate.)

#### Scenario: Graph IR cannot override OpenSpec state

- GIVEN an OpenSpec change state and a Graph IR projection that disagree on a
  material status or ownership fact
- WHEN an authority-sensitive operation evaluates the change
- THEN the operation MUST treat OpenSpec/Git as authoritative
- AND MUST NOT accept the Graph IR value as an override

#### Scenario: Graph IR without reconciliation is rejected

- GIVEN a Graph IR artifact that cannot be derived from or reconciled to the
  current OpenSpec/Git candidate
- WHEN validation runs
- THEN validation MUST fail closed with a structured reason code
- AND MUST NOT proceed by interpreting prose documentation as authority

#### Scenario: Assurance Graph cannot override OpenSpec or Candidate

- GIVEN OpenSpec/Git/Candidate state and an Assurance Graph that disagrees on a material fact
- WHEN an authority-sensitive operation evaluates the change
- THEN OpenSpec/Git/Candidate MUST remain authoritative
- AND the Assurance Graph MUST NOT be accepted as an override



OpenSpec artifacts and Git bytes MUST remain the sole semantic authority for a
change. Runtime lifecycle state MUST reconcile to that authority. Graph IR
MUST NOT be treated as an independent authority: any Graph IR projection MUST
derive from or reconcile against OpenSpec/Git, and a divergence MUST fail
closed.

#### Scenario: Graph IR cannot override OpenSpec state

- GIVEN an OpenSpec change state and a Graph IR projection that disagree on a
  material status or ownership fact
- WHEN an authority-sensitive operation evaluates the change
- THEN the operation MUST treat OpenSpec/Git as authoritative
- AND MUST NOT accept the Graph IR value as an override

#### Scenario: Graph IR without reconciliation is rejected

- GIVEN a Graph IR artifact that cannot be derived from or reconciled to the
  current OpenSpec/Git candidate
- WHEN validation runs
- THEN validation MUST fail closed with a structured reason code
- AND MUST NOT proceed by interpreting prose documentation as authority

### Requirement: No Prose Authority Fallback {#REQ-harness-authority-canon-002}

No authority-sensitive operation (status, transition selection, approval,
delivery gate, or recovery authorization) MUST obtain its decision by
interprepreting free-form prose. The operation MUST consume structured contracts,
schemas, or machine-readable fields only. Absence of a structured field MUST
fail closed; it MUST NOT fall back to prose.

#### Scenario: Missing structured field fails closed

- GIVEN an authority-sensitive operation that requires a structured reason
  code or transition field
- AND the field is absent while surrounding prose describes an intended action
- WHEN the operation evaluates authority
- THEN it MUST fail closed
- AND MUST NOT infer the missing field from the prose

#### Scenario: Structured contract satisfies authority

- GIVEN a valid structured envelope carrying the required authority fields
- WHEN the operation evaluates authority
- THEN it MUST accept the structured fields
- AND MUST NOT require prose narrative to authorize the same decision

### Requirement: Assurance Graph Consumers Are Read-Only {#REQ-harness-authority-canon-010}

Assurance Graph APIs MUST be read-only projections. Consumers MUST NOT use
graph nodes or edges as lifecycle, approval, or delivery decisions. A consumer
that treats the graph as semantic authority MUST fail closed with a structured
reason. OpenSpec, Git, and the frozen Candidate remain the sole semantic
authority.

#### Scenario: Read-only projection is accepted for inspection

- GIVEN a valid Assurance Graph derived from OpenSpec/Git/Candidate
- WHEN a consumer inspects nodes and edges
- THEN the consumer MUST be able to read the projection
- AND MUST NOT mutate canonical OpenSpec/Git/Candidate state through the graph API

#### Scenario: Graph used as approval or delivery authority fails closed

- GIVEN an operation that would grant lifecycle, approval, or delivery from Assurance Graph edges alone
- WHEN authority is evaluated
- THEN the operation MUST fail closed
- AND OpenSpec/Git/Candidate MUST remain authoritative

### Requirement: K6c Challenge Maturity And Projection Without Delivery Authority {#REQ-harness-authority-canon-011}

Normative harness-evolution documentation MUST label independent verifier, evidence strategies with provenance, Assurance Graph as a derived projection, and K6c policy-selected challenges as `implemented` for the K6c slice. Challenge plans and results MUST remain non-authoritative derived evidence and MUST NOT be tagged as delivery or lifecycle authority. K7 review/findings, K8 Evaluation Attestation, first-match routing, and Change Program MUST remain `target` (or later-slice) and MUST NOT be labeled `implemented` by K6c.
(Previously: K6c challenges were tagged target/experimental under K6b.)

#### Scenario: K6c challenge and projection surfaces tagged implemented

- GIVEN harness-evolution docs listing independent verifier, evidence strategies, provenance, Assurance Graph projection, and K6c policy-selected challenges
- WHEN maturity labeling is validated after K6c
- THEN those projection, verifier, and challenge surfaces MUST be tagged `implemented`
- AND OpenSpec/Git/Candidate MUST remain sole semantic authority

#### Scenario: Graph authority, review authority, and later slices stay non-implemented

- GIVEN documentation mentioning Assurance Graph as independent authority, K7 review authority, or K8 attestation
- WHEN maturity labeling is validated after K6c
- THEN those capabilities MUST NOT be tagged `implemented` solely by K6c
- AND MUST remain `target` or `experimental` until their owning slice

### Requirement: K6d Reports Are Advisory Candidate-Bound Evidence {#REQ-harness-authority-canon-013}

Normative harness documentation MUST label K6d complexity-architecture-delta
reports and anti-overengineering findings as `implemented` advisory,
Candidate-bound evidence. They MUST NOT become semantic, review, lifecycle,
promotion, attestation, or delivery authority. K7 review/findings, K8
Evaluation Attestation, and K9 promotion or DeliveryAuthorization MUST remain
`target` or later-slice work and MUST NOT be labeled implemented by K6d.

#### Scenario: K6d is available without authority promotion

- GIVEN documentation listing K6d reports and its later consumers
- WHEN maturity and authority labels are validated
- THEN K6d MUST be labeled implemented advisory evidence
- AND OpenSpec, Git, and the frozen Candidate MUST remain authoritative

#### Scenario: K6d output is used as a decision authority

- GIVEN an operation that approves review, promotion, or delivery solely from a K6d report
- WHEN authority is evaluated
- THEN the operation MUST fail closed with a structured reason
- AND K7, K8, and K9 MUST remain non-implemented by K6d
