# Delta for Independent Verification

## ADDED Requirements

### Requirement: Contract Digest Gate Before Strategy {#REQ-independent-verification-008}

Before strategy evaluation, `input.contract.contract_digest` MUST equal
`executionGraph.contract_digest`. Mismatch MUST fail closed and MUST NOT
proceed to strategy evaluation.

#### Scenario: Contract digest mismatch with Execution Graph fails closed before strategy

- GIVEN a frozen Candidate whose `input.contract.contract_digest` is C2
- AND an Execution Graph whose `contract_digest` is C1, where C1 ≠ C2
- WHEN the verifier validates canonical bindings
- THEN verification MUST fail closed before strategy evaluation
- AND MUST NOT emit `PASS` or `PASS WITH WARNINGS`

## MODIFIED Requirements

### Requirement: Obligation Manifest MUST Coverage {#REQ-independent-verification-005}

After strategy evaluation, the verifier MUST walk every Obligation Manifest
item with criticality `must` that is not an approved `deferred` record
(`reason` and `approved_by`). For each such obligation, a `PASS` or
`PASS WITH WARNINGS` verdict MUST require `required_evidence` ⊆ persistable
satisfied tokens, each persistably bound to that `obligation_id` and to a
`node_id` listed in `implemented_by`. Coverage MUST be persisted on the
assessment/binding record (additive field; exact name design-owned). A
non-empty evidence list, unique-sort of `evidence_ids`, or existential
binding MUST NOT substitute for that subset. Strategy role shape alone MUST
NOT satisfy the graph. An `obligation_id` absent from the manifest MUST fail
closed. Evidence bound to a node that does not implement the obligation MUST
fail closed. A MUST whose `required_evidence` is not a subset of satisfied
tokens MUST fail closed and MUST identify the unfulfilled `obligation_id`.
The verifier MUST consume persistable manifest `obligation_id` values; it
MUST NOT invent them from vanished fields.
(Previously: coverage required admissible evidence "covering" required_evidence without subset semantics or persistable satisfied tokens.)

#### Scenario: MUST without admissible evidence fails closed

- GIVEN a compiled Execution Graph with a non-deferred MUST obligation
- AND strategy role minimums met
- AND no admissible evidence persistably bound to that `obligation_id`
- WHEN the verifier evaluates obligation coverage
- THEN it MUST fail closed identifying that `obligation_id`
- AND MUST NOT emit `PASS` or `PASS WITH WARNINGS`

#### Scenario: Nonexistent obligation_id fails closed

- GIVEN an assessment or raw binding whose `obligation_id` is not in the Obligation Manifest
- WHEN the verifier evaluates obligation coverage
- THEN it MUST fail closed identifying the unknown `obligation_id`
- AND MUST NOT emit `PASS` or `PASS WITH WARNINGS`

#### Scenario: Evidence bound to the wrong implementing node fails closed

- GIVEN a MUST obligation with `implemented_by` containing node A
- AND admissible evidence whose persistable `node_id` is B, where B is not in `implemented_by`
- WHEN the verifier evaluates that binding
- THEN it MUST fail closed
- AND MUST NOT treat the evidence as satisfying that obligation

#### Scenario: Partial required_evidence coverage fails closed

- GIVEN a non-deferred MUST obligation with `required_evidence` equal to `[A, B]`
- AND admissible evidence that satisfies only token A
- WHEN the verifier evaluates obligation coverage
- THEN it MUST fail closed identifying that `obligation_id`
- AND MUST NOT emit `PASS` or `PASS WITH WARNINGS`

### Requirement: Persistable Assessment Binding Distinct From Evidence {#REQ-independent-verification-006}

The verifier MUST persist an additive assessment/binding record for each
evaluated tuple of `evidence_id`, `role`, `obligation_id`, `node_id`, and bound
policy-snapshot identity. Assessment identity MUST include `role` and
`obligation_id` and MUST be distinct per `(evidence_id, role, obligation_id)`.
`evidence/v2` MUST remain the observation record and MUST NOT be mutated to
carry `role` or `obligation_id`. Incompatible strategy roles MUST NOT share
one EvidenceId. The same observation MUST NOT satisfy incompatible roles.
Strict TDD evidence is a RED → GREEN sequence, not a set of role labels:
GREEN-before-RED MUST fail closed, and RED-after-PATCH MUST fail closed.
Unique-sort of `verification.evidence_ids` MUST NOT be the assessment identity
and MUST NOT hide distinct role or obligation bindings.
(Previously: the same EvidenceId used as four roles was required to yield four passing assessments.)

#### Scenario: Same EvidenceId as RED and GREEN fails closed

- GIVEN one `evidence/v2` observation whose `evidence_id` is E
- AND that observation is bound as both RED and GREEN strategy roles
- WHEN the verifier evaluates strategy evidence
- THEN verification MUST fail closed
- AND MUST NOT treat E as satisfying both roles

#### Scenario: GREEN before RED fails closed

- GIVEN Strict TDD or bug-strategy evidence whose GREEN observation precedes RED
- WHEN the verifier evaluates strategy evidence
- THEN verification MUST fail closed
- AND MUST NOT emit `PASS` or `PASS WITH WARNINGS`

#### Scenario: RED after PATCH fails closed

- GIVEN Strict TDD or bug-strategy evidence whose RED observation occurs after PATCH
- WHEN the verifier evaluates strategy evidence
- THEN verification MUST fail closed
- AND MUST NOT emit `PASS` or `PASS WITH WARNINGS`

#### Scenario: Distinct tuples yield distinct assessment identities

- GIVEN two persistable tuples that differ in `evidence_id`, `role`, or `obligation_id`
- AND neither tuple shares one EvidenceId across incompatible roles
- WHEN assessments are persisted
- THEN their assessment identities MUST be distinct
- AND unique-sort of `verification.evidence_ids` MUST NOT collapse those assessments
