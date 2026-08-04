# Delta for harness-authority-canon

## ADDED Requirements

### Requirement: Host Adapters Are Not Semantic Authority {#REQ-harness-authority-canon-007}

HostAdapters, HostCapabilities declarations, CapabilityProof evidence, and the
Headless Conformance Host MUST NOT become semantic authority. OpenSpec and Git
MUST remain the sole semantic authority. Adapters MAY translate host surfaces
into contract ports; they MUST NOT override OpenSpec/Git facts, mint semantic
approvals, or relax K2.1 CAS/permit rules.

#### Scenario: Adapter claim cannot override OpenSpec

- GIVEN OpenSpec/Git state that disagrees with an adapter-reported semantic fact
- WHEN an authority-sensitive semantic operation evaluates the change
- THEN OpenSpec/Git MUST remain authoritative
- AND the adapter claim MUST NOT override the semantic fact

#### Scenario: CapabilityProof is evidence not authority

- GIVEN a valid CapabilityProof for an enforced host capability
- WHEN semantic authority for the change is evaluated
- THEN the proof MUST authorize only mechanical capability enforcement eligibility
- AND MUST NOT replace OpenSpec/Git as semantic authority

## MODIFIED Requirements

### Requirement: K2.1 Authority Surfaces Are Implemented {#REQ-harness-authority-canon-005}

Normative harness-evolution documentation MUST label Authority Store (mandatory
CAS), OperationPermit/OperationReceipt separation from TransitionOffer, and
effect classes
`pure|idempotent-keyed|probeable|compensatable|irreversible` as `implemented`
for the K2.1 slice. For the K2a slice, documentation MUST also label
`HostCapabilities`, host transports, `CapabilityProof`, Headless Conformance
Host, and the sole Claude Code reference adapter as `implemented`. OpenSpec and
Git MUST remain the sole semantic authority. Models MUST remain labeled as
unable to approve themselves or mint permits. Host adapters MUST remain labeled
as non-authority. Cryptographic signatures without a trust root, Candidate
freeze, Execution Graph authority, attestation and delivery authorization MUST
remain `target` (or later-slice) and MUST NOT be labeled `implemented` by K2a.
(Previously: HostCapabilities stayed `target` under K2.1; K2a promotes the host
contract + CapabilityProof + Headless Conformance Host + sole reference adapter.)

#### Scenario: K2.1 surfaces tagged implemented

- GIVEN harness-evolution docs listing Authority Store, OperationPermit/Receipt
  and effect classes
- WHEN maturity labeling is validated after K2.1
- THEN those three surfaces MUST be tagged `implemented`
- AND OpenSpec/Git MUST remain sole semantic authority

#### Scenario: K2a host surfaces tagged implemented

- GIVEN harness-evolution docs listing HostCapabilities, CapabilityProof,
  Headless Conformance Host and the Claude reference adapter
- WHEN maturity labeling is validated after K2a
- THEN those surfaces MUST be tagged `implemented`
- AND adapters MUST NOT be tagged as semantic authority

#### Scenario: Later slices stay non-implemented

- GIVEN documentation mentioning Candidate freeze, Evaluation Attestation or
  Delivery Authorization
- WHEN maturity labeling is validated
- THEN those capabilities MUST NOT be tagged `implemented` solely by K2a
- AND MUST remain `target` or `experimental` until their owning slice
