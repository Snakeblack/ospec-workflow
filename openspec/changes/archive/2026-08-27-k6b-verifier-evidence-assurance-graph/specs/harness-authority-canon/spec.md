# Delta for harness-authority-canon

## ADDED Requirements

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

### Requirement: K6b Projection Maturity Without Graph Authority {#REQ-harness-authority-canon-011}

Normative harness-evolution documentation MUST label independent verifier,
evidence strategies with provenance, and Assurance Graph as a derived
projection `implemented` for the K6b slice. Assurance Graph independent
authority MUST remain tagged `target` or `experimental` and MUST NOT be tagged
`implemented`. K6c challenges, K7 review/findings, K8 Evaluation Attestation,
first-match routing, and Change Program MUST remain `target` (or later-slice)
and MUST NOT be labeled `implemented` by K6b.

#### Scenario: K6b projection surfaces tagged implemented

- GIVEN harness-evolution docs listing independent verifier, evidence strategies, provenance, and Assurance Graph projection
- WHEN maturity labeling is validated after K6b
- THEN those projection/verifier surfaces MUST be tagged `implemented`
- AND OpenSpec/Git/Candidate MUST remain sole semantic authority

#### Scenario: Graph authority and later slices stay non-implemented

- GIVEN documentation mentioning Assurance Graph as independent authority, K6c challenges, K7 review, or K8 attestation
- WHEN maturity labeling is validated after K6b
- THEN those capabilities MUST NOT be tagged `implemented` solely by K6b
- AND MUST remain `target` or `experimental` until their owning slice

---

## MODIFIED Requirements

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
