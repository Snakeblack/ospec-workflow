# Independent Verification Specification

## Purpose

Independent verifier over a frozen `CandidateId`. Worker narrative is not
authority. Evidence stays distinct from verdicts. Strict TDD is the default
evidence strategy until equivalence is proven; it does not rewrite SDD
`testing.tdd_mode`.

## Requirements

### Requirement: Frozen Candidate Subject And Canonical Bindings {#REQ-independent-verification-001}

The verifier MUST accept only a frozen `CandidateId` as subject, plus contract,
Execution Graph, repository bytes, and raw evidence. It MUST validate canonical
identity bindings before evaluating evidence. It MUST reject a `WorkResult`
(integrated or not) as subject and MUST reject an unfrozen or mutable
candidate. Binding failure MUST fail closed. Worker prose MUST NOT substitute
for a missing structured subject or binding.

#### Scenario: Frozen CandidateId proceeds to strategy selection

- GIVEN a frozen Candidate v2, valid Execution Graph and identity bindings, and raw evidence
- WHEN the verifier starts
- THEN it MUST accept the `CandidateId` as subject and proceed to strategy selection

#### Scenario: WorkResult subject is rejected

- GIVEN a `WorkResultId` or unintegrated WorkResult supplied as the verification subject
- WHEN the verifier starts
- THEN verification MUST fail closed and MUST NOT treat the WorkResult as a Candidate

#### Scenario: Unfrozen candidate or failed binding is rejected

- GIVEN an unfrozen candidate, a mutable working tree claimed as candidate, or a binding digest mismatch
- WHEN the verifier starts
- THEN verification MUST fail closed before strategy evaluation

### Requirement: Evidence Strategies And Strict TDD Fallback {#REQ-independent-verification-002}

The verifier MUST select exactly one strategy from
`bug | feature | refactor | migration | config-docs`. Each strategy MUST
declare minimum evidence, at least one negative case, and admissible
provenance:

| Strategy | Minimum evidence | Required negative |
| --- | --- | --- |
| bug | red reproduction, patch, green reproduction | green-without-red or red-after-patch |
| feature | acceptance, invariants, contract or integration tests | missing negative or acceptance path |
| refactor | characterization before/after, no observable behavior change | behavioral delta treated as equivalent |
| migration | dry-run, rollback, incompatibility, idempotent re-run | skipped rollback or non-idempotent apply |
| config-docs | real schema/parser check, smoke, install or consume | docs-only claim without parser/smoke |

When no strategy is declared, or no proven equivalent applies, the verifier
MUST use Strict TDD (RED → GREEN with runtime test evidence) as the default
fallback. This fallback MUST NOT rewrite `openspec/config.yaml`
`testing.tdd_mode` (this repository remains `focused` unless a separate change
updates it). Strict TDD fallback is an evidence-strategy default, not a silent
SDD-runtime config mutation. An equivalence manifest MUST NOT retire the
fallback.

#### Scenario: Declared feature strategy requires its minimums

- GIVEN a frozen Candidate declared as `feature`
- WHEN the verifier selects the feature strategy
- THEN it MUST require the feature minimum set and a negative case
- AND MUST NOT accept characterization-only evidence

#### Scenario: Missing strategy falls back to Strict TDD without rewriting tdd_mode

- GIVEN a frozen Candidate with no declared strategy and no proven equivalence
- AND `openspec/config.yaml` `testing.tdd_mode` is `focused`
- WHEN the verifier selects a strategy
- THEN it MUST apply Strict TDD as the evidence strategy
- AND MUST leave `testing.tdd_mode` unchanged

### Requirement: Provenance Sufficiency And Fail-Closed Evidence {#REQ-independent-verification-003}

Every evidence node MUST declare provenance as exactly one of `runtime-observed | host-attested | tool-produced | model-reported | human-decision | external-unverified`. Policy MUST decide which classes MAY satisfy each obligation. Strong classes (`runtime-observed`, `host-attested`, `tool-produced`) MUST be derived from trusted collector or transport channel metadata.

The verifier MUST enforce strict physical segregation of raw observations (`rawEvidence`). `rawEvidence` payloads MUST contain only physical observation fields (`bytes`/`rawBytes`, `provenance`, `origin`, `node_id`, and `execution_sequence` containing `{run_id, ordinal, previous_evidence_id}`). If an untrusted caller payload contains semantic assertions or metadata (`role`, `obligation_ids`, `obligation_id`, or `evidence_requirements_satisfied`), the verifier MUST immediately reject the payload and fail closed with `UNTRUSTED_CALLER_METADATA`.

Trusted evidence metadata (`role`, `obligation_ids`, `evidence_requirements_satisfied`) MUST be derived exclusively by the verifier from the Execution Graph and trusted runner execution receipts (`receipts`/`runner_receipts`). The verifier MUST NOT accept semantic claims or trusted metadata directly from untrusted caller payloads or unverified worker narrative.

The verifier MUST NOT accept a strong class solely because the raw payload string claims it. Payload digest MUST NOT be treated as origin. When collector or transport metadata is absent, untrusted, or disagrees with a claimed strong class, sufficiency MUST fail closed. PKI MUST NOT be required. Evidence that is insufficient, stale relative to the frozen Candidate, bound to a foreign subject, or fabricated MUST fail closed. A worker `model-reported` claim MUST NOT satisfy an obligation that requires a strong class.
(Previously: raw evidence containing untrusted caller metadata did not trigger an explicit UNTRUSTED_CALLER_METADATA fail-closed rejection.)

#### Scenario: Runtime-observed evidence satisfies a test obligation

- GIVEN an obligation that admits `runtime-observed` provenance
- AND collector or transport metadata that derives `runtime-observed`
- AND raw test evidence bound to the frozen CandidateId and graph node
- WHEN the verifier evaluates sufficiency
- THEN the obligation MAY be marked satisfied
- AND the evidence MUST remain a distinct record without `verdict`

#### Scenario: Model-reported tests-passed is insufficient

- GIVEN an obligation that requires `runtime-observed` or `tool-produced` provenance
- AND only a worker `model-reported` claim that tests passed
- WHEN the verifier evaluates sufficiency
- THEN verification MUST fail closed
- AND MUST NOT treat worker narrative as satisfying evidence

#### Scenario: Stale, foreign, or fabricated evidence is rejected

- GIVEN evidence whose digest does not match raw bytes, whose CandidateId does not match the subject, or whose origin predates a successor without revalidation
- WHEN the verifier evaluates that evidence
- THEN verification MUST fail closed
- AND MUST NOT reuse the evidence under a transitive `invalidates` edge

#### Scenario: Payload-claimed strong provenance without trusted collector fails closed

- GIVEN raw evidence whose payload `provenance` is `runtime-observed`
- AND collector or transport metadata that is absent, untrusted, or derives a weaker class
- WHEN the verifier evaluates sufficiency
- THEN verification MUST fail closed
- AND MUST NOT accept the payload string as a strong class

#### Scenario: Verifier derives trusted evidence metadata from Execution Graph and receipts

- GIVEN raw evidence observations without caller semantic annotations
- AND trusted runner receipts and a compiled Execution Graph
- WHEN the verifier resolves evidence bindings
- THEN `role`, `obligation_ids`, and `evidence_requirements_satisfied` MUST be derived by the verifier
- AND MUST NOT be accepted from untrusted caller inputs

#### Scenario: Untrusted caller metadata is rejected with UNTRUSTED_CALLER_METADATA

- GIVEN a `rawEvidence` payload containing caller-injected `role`, `obligation_ids`, `obligation_id`, or `evidence_requirements_satisfied`
- WHEN the verifier normalizes or evaluates raw evidence
- THEN verification MUST immediately fail closed with `UNTRUSTED_CALLER_METADATA`
- AND MUST NOT process or accept the untrusted payload

### Requirement: Verdict Is Not Evidence {#REQ-independent-verification-004}

Verification MUST emit a verification record bound to the frozen `CandidateId`
with verdict `PASS | PASS WITH WARNINGS | FAIL`. Evidence records MUST NOT
carry `verdict`. A verification record MUST NOT validate as evidence. `PASS`
or `PASS WITH WARNINGS` MUST require both declared-strategy minimums and
REQ-independent-verification-005 coverage with persistable assessments.
Strategy role shape alone is insufficient. Unique-sort of `evidence_ids` MUST
NOT substitute for distinct assessments. The verifier MAY emit a
non-authoritative equivalence manifest for later K9 evaluation. That manifest
MUST NOT promote equivalence, authorize delivery, or replace the Strict TDD
fallback.
(Previously: strategy minimums with admissible provenance were sufficient for PASS.)

#### Scenario: Sufficient evidence yields a verification verdict

- GIVEN strategy minimums met with collector-derived admissible provenance on a frozen CandidateId
- AND every applicable non-deferred MUST obligation persistably bound to admissible evidence on a correct implementing node
- WHEN the verifier completes
- THEN it MUST emit a verification record with `PASS` or `PASS WITH WARNINGS`
- AND referenced evidence records MUST omit `verdict`

#### Scenario: Evidence carrying verdict is rejected

- GIVEN a payload that mixes evidence identity fields with a `verdict` property
- WHEN schema or verifier validation runs
- THEN validation MUST fail closed
- AND MUST NOT accept the payload as either evidence or verification

### Requirement: Obligation Manifest MUST Coverage {#REQ-independent-verification-005}

The verifier MUST authoritatively derive obligation satisfaction (`evidence_requirements_satisfied`) and role mapping strictly from trusted runner execution receipts and the Execution Graph. The verifier MUST NOT automatically or blindly copy `node.required_evidence` onto assessments or raw evidence without receipt-proven satisfaction.

After strategy evaluation, the verifier MUST walk every Obligation Manifest item with criticality `must` that is not an approved `deferred` record (`reason` and `approved_by`). For each such obligation, a `PASS` or `PASS WITH WARNINGS` verdict MUST require `required_evidence` ⊆ persistable satisfied tokens (`evidence_requirements_satisfied` with `minItems: 1` per satisfaction assessment), each persistably bound to that `obligation_id` and to a `node_id` listed in `implemented_by`.

Coverage MUST be persisted on the `assessment/v2` record in property `evidence_requirements_satisfied`. A non-empty evidence list, blind copy of `node.required_evidence`, empty satisfaction array `[]`, unique-sort of `evidence_ids`, or existential binding MUST NOT substitute for that subset. Strategy role shape alone MUST NOT satisfy the graph. An `obligation_id` absent from the manifest MUST fail closed. Evidence bound to a node that does not implement the obligation MUST fail closed. A MUST whose `required_evidence` is not a subset of satisfied tokens MUST fail closed and MUST identify the unfulfilled `obligation_id`. The verifier MUST consume persistable manifest `obligation_id` values; it MUST NOT invent them from vanished fields.
(Previously: verifier allowed fallback blind-copying of node.required_evidence when caller metadata was omitted.)

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

#### Scenario: Empty evidence_requirements_satisfied cannot claim satisfaction

- GIVEN an assessment record with `evidence_requirements_satisfied: []`
- WHEN the verifier evaluates obligation coverage
- THEN the assessment MUST NOT satisfy any `required_evidence` token
- AND any MUST obligation relying on it MUST fail closed

#### Scenario: Blind copying of node required_evidence is forbidden and ungrounded satisfaction fails closed

- GIVEN a graph node declaring `required_evidence`
- AND runner receipts that do not substantiate satisfaction of those tokens
- WHEN the verifier evaluates obligation coverage
- THEN the verifier MUST NOT copy `node.required_evidence` into `evidence_requirements_satisfied`
- AND ungrounded MUST obligations MUST fail closed

### Requirement: Persistable Assessment Binding Distinct From Evidence {#REQ-independent-verification-006}

The verifier MUST persist an additive `assessment/v2` record for each evaluated tuple of `evidence_id`, `role`, `obligation_id`, `node_id`, and bound policy-snapshot identity. Assessment identity MUST include `role` and `obligation_id` and MUST be distinct per `(evidence_id, role, obligation_id)`. `evidence/v2` MUST remain the observation record and MUST NOT be mutated to carry `role` or `obligation_id`.

The verifier MUST enforce an incompatible roles matrix. The following role combinations MUST NOT share the same `evidence_id`:
1. `red` ↔ `green`
2. `characterization-before` ↔ `characterization-after`
3. `negative` ↔ `acceptance`

Non-conflicting roles (such as `integration` + `acceptance`, `invariant` + `integration`, or `smoke` + `acceptance`) MAY share the same `evidence_id` when the observation independently satisfies both requirements.

The verifier MUST enforce strict causal chronology validation using `execution_sequence` for `strict-tdd`, `bug`, and `refactor` strategies:
- Every evidence observation in `strict-tdd`, `bug`, and `refactor` MUST provide an `execution_sequence` containing a consistent `run_id`, a strictly monotonic increasing `ordinal`, and valid `previous_evidence_id` chaining.
- The verifier MUST NOT fall back to JSON array index/position order to determine chronological sequence.
- For `bug` and `strict-tdd` strategies: RED MUST precede GREEN in `execution_sequence`; GREEN before RED or missing `execution_sequence` MUST fail closed with `STRATEGY_SEQUENCE_VIOLATION`, and RED after PATCH MUST fail closed.
- For `refactor` strategy: `characterization-before` MUST precede `characterization-after` in `execution_sequence` (`run_id`, monotonic `ordinal`, and `previous_evidence_id`). `characterization-after` executing before, concurrently with, or without causal sequence linking to `characterization-before` MUST fail closed with `STRATEGY_SEQUENCE_VIOLATION`.

Unique-sort of `verification.evidence_ids` MUST NOT be the assessment identity and MUST NOT hide distinct role or obligation bindings.
(Previously: chronological ordering in strict-tdd and bug strategies fell back to JSON array indexing instead of enforcing execution_sequence causality.)

#### Scenario: Same EvidenceId as RED and GREEN fails closed

- GIVEN one `evidence/v2` observation whose `evidence_id` is E
- AND that observation is bound as both RED and GREEN strategy roles
- WHEN the verifier evaluates strategy evidence
- THEN verification MUST fail closed
- AND MUST NOT treat E as satisfying both roles

#### Scenario: GREEN before RED fails closed

- GIVEN Strict TDD or bug-strategy evidence whose GREEN observation has an `ordinal` earlier than RED in `execution_sequence`
- WHEN the verifier evaluates strategy evidence
- THEN verification MUST fail closed with `STRATEGY_SEQUENCE_VIOLATION`
- AND MUST NOT emit `PASS` or `PASS WITH WARNINGS`

#### Scenario: RED after PATCH fails closed

- GIVEN Strict TDD or bug-strategy evidence whose RED observation occurs after PATCH in `execution_sequence`
- WHEN the verifier evaluates strategy evidence
- THEN verification MUST fail closed with `STRATEGY_SEQUENCE_VIOLATION`
- AND MUST NOT emit `PASS` or `PASS WITH WARNINGS`

#### Scenario: Distinct tuples yield distinct assessment identities

- GIVEN two persistable tuples that differ in `evidence_id`, `role`, or `obligation_id`
- AND neither tuple shares one EvidenceId across incompatible roles
- WHEN assessments are persisted
- THEN their assessment identities MUST be distinct
- AND unique-sort of `verification.evidence_ids` MUST NOT collapse those assessments

#### Scenario: Characterization-after before characterization-before fails closed

- GIVEN refactor strategy evidence where `characterization-after` has an `ordinal` less than or equal to `characterization-before`, or `previous_evidence_id` does not link correctly
- WHEN the verifier evaluates refactor evidence
- THEN verification MUST fail closed with `STRATEGY_SEQUENCE_VIOLATION`
- AND MUST NOT emit `PASS` or `PASS WITH WARNINGS`

#### Scenario: Fallback to JSON array position without execution_sequence fails closed

- GIVEN Strict TDD, bug, or refactor evidence ordered in the JSON array but lacking valid `execution_sequence` objects
- WHEN the verifier evaluates strategy sequence
- THEN verification MUST fail closed with `STRATEGY_SEQUENCE_VIOLATION`
- AND MUST NOT rely on JSON array index order as causal chronology

#### Scenario: Negative and acceptance sharing same EvidenceId fails closed

- GIVEN an `evidence/v2` observation bound to both `negative` and `acceptance` roles
- WHEN the verifier evaluates strategy evidence
- THEN verification MUST fail closed identifying the incompatible role conflict

#### Scenario: Non-conflicting shared evidence passes validation

- GIVEN an `evidence/v2` observation bound to compatible roles `integration` and `acceptance`
- AND both obligations are independently verified by the observation
- WHEN the verifier evaluates evidence bindings
- THEN verification MUST accept the shared evidence for both roles

### Requirement: Facade Fail-Closed On Required Projection {#REQ-independent-verification-007}

`verifyCandidate` MUST require a successful Assurance Graph projection before
returning `ok: true`. If projection cannot materialize, the facade MUST fail
closed with `GRAPH_PROJECTION_FAILED`. If a stored graph does not recompute
from persistable canonical inputs, the facade MUST fail closed with
`GRAPH_DIVERGENCE`. The facade MUST NOT return `ok: true` without the projected
graph, and MUST NOT emit `PASS` or `PASS WITH WARNINGS` in those cases.

#### Scenario: Failed projection does not return ok without a graph

- GIVEN a candidate whose strategy and MUST coverage would otherwise pass
- AND `projectAssuranceGraph` fails
- WHEN `verifyCandidate` completes
- THEN the facade MUST return `ok: false` with `GRAPH_PROJECTION_FAILED`
- AND MUST omit `assurance_graph`
- AND MUST NOT emit `PASS` or `PASS WITH WARNINGS`

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
