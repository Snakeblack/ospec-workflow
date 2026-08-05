# Delta for harness-authority-canon

## ADDED Requirements

### Requirement: K2.1b Issuance And Consume Maturity Is Implemented {#REQ-harness-authority-canon-008}

Normative harness-evolution documentation MUST label controlled permit issuance
(TransitionOffer + PolicyDecision|HumanDecision|KernelRule + expected_revision)
and atomic CAS consume of permit status + OperationReceipt with next
state/journal as `implemented` for the K2.1b corrective. Documentation MUST NOT
claim K3 Candidate runtime readiness solely because K2.1b closed. Candidate
freeze, attestation, and delivery authorization MUST remain `target` (or later
slice) and MUST NOT be labeled `implemented` by K2.1b.

#### Scenario: K2.1b surfaces tagged implemented

- GIVEN harness-evolution docs listing controlled issuance and atomic
  permit/receipt consume
- WHEN maturity labeling is validated after K2.1b
- THEN those surfaces MUST be tagged `implemented`
- AND K3 Candidate runtime MUST NOT be tagged `implemented` solely by K2.1b

#### Scenario: K3 remains non-implemented after K2.1b

- GIVEN documentation mentioning Candidate freeze or relation algebra runtime
- WHEN maturity labeling is validated after K2.1b
- THEN those capabilities MUST remain `target` or `experimental`
- AND MUST NOT be presented as delivered by this corrective

### Requirement: Roadmap Quick-Path Reflects Post-K2a Correctives {#REQ-harness-authority-canon-009}

The harness-evolution roadmap quick-path MUST NOT present bare
`Ejecutar K2a → K3` as if K2a were still the pending predecessor of K3.
After K2a archive, the quick-path MUST present K3 accurately and MUST reflect
that K2.1b and/or other approved correctives preceding K3 remain required when
applicable. The wording MAY say `Ejecutar K3` or an equivalent ordered list that
names those correctives before K3.

#### Scenario: Bare K2a-to-K3 quick-path is rejected

- GIVEN the roadmap quick-path table row that sequences work before K3
- WHEN maturity/docs validation runs after K2.1b
- THEN the row MUST NOT equal bare `Ejecutar K2a → K3` implying K2a still pending
- AND MUST name K3 and/or correctives that precede K3 accurately

#### Scenario: Correctives-before-K3 wording is accepted

- GIVEN a quick-path entry that lists K2.1b (and any approved k2a-1 corrective)
  before K3, or simply `Ejecutar K3` once correctives are acknowledged elsewhere
  as gates
- WHEN docs validation runs
- THEN the entry MUST be accepted
- AND MUST NOT claim K3 runtime is already implemented
