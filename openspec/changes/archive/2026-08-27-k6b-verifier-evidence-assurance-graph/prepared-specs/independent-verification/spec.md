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

Every evidence node MUST declare provenance as exactly one of
`runtime-observed | host-attested | tool-produced | model-reported |
human-decision | external-unverified`. Policy MUST decide which classes MAY
satisfy each obligation. Evidence that is insufficient, stale relative to the
frozen Candidate, bound to a foreign subject, or fabricated MUST fail closed.
A worker `model-reported` claim MUST NOT satisfy an obligation that requires
`runtime-observed`, `host-attested`, or `tool-produced` evidence.

#### Scenario: Runtime-observed evidence satisfies a test obligation

- GIVEN an obligation that admits `runtime-observed` provenance
- AND raw test evidence with that provenance bound to the frozen CandidateId and graph node
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

### Requirement: Verdict Is Not Evidence {#REQ-independent-verification-004}

Verification MUST emit a verification record bound to the frozen `CandidateId`
with verdict `PASS | PASS WITH WARNINGS | FAIL`. Evidence records MUST NOT
carry `verdict`. A verification record MUST NOT validate as evidence. The
verifier MAY emit a non-authoritative equivalence manifest for later K9
evaluation. That manifest MUST NOT promote equivalence, authorize delivery, or
replace the Strict TDD fallback.

#### Scenario: Sufficient evidence yields a verification verdict

- GIVEN strategy minimums met with admissible provenance on a frozen CandidateId
- WHEN the verifier completes
- THEN it MUST emit a verification record with `PASS` or `PASS WITH WARNINGS`
- AND referenced evidence records MUST omit `verdict`

#### Scenario: Evidence carrying verdict is rejected

- GIVEN a payload that mixes evidence identity fields with a `verdict` property
- WHEN schema or verifier validation runs
- THEN validation MUST fail closed
- AND MUST NOT accept the payload as either evidence or verification
