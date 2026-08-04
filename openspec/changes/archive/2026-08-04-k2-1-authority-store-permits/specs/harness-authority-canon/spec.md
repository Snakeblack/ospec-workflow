# Delta for harness-authority-canon

## ADDED Requirements

### Requirement: K2.1 Authority Surfaces Are Implemented {#REQ-harness-authority-canon-005}

Normative harness-evolution documentation MUST label Authority Store (mandatory
CAS), OperationPermit/OperationReceipt separation from TransitionOffer, and
effect classes
`pure|idempotent-keyed|probeable|compensatable|irreversible` as `implemented`
for the K2.1 slice. OpenSpec and Git MUST remain the sole semantic authority.
Models MUST remain labeled as unable to approve themselves or mint permits.
Cryptographic signatures without a trust root, HostCapabilities, Candidate
freeze, Execution Graph authority, attestation and delivery authorization MUST
remain `target` (or later-slice) and MUST NOT be labeled `implemented` by K2.1.

#### Scenario: K2.1 surfaces tagged implemented

- GIVEN harness-evolution docs listing Authority Store, OperationPermit/Receipt
  and effect classes
- WHEN maturity labeling is validated after K2.1
- THEN those three surfaces MUST be tagged `implemented`
- AND OpenSpec/Git MUST remain sole semantic authority

#### Scenario: Later slices stay non-implemented

- GIVEN documentation mentioning HostCapabilities, Candidate freeze, Evaluation
  Attestation or Delivery Authorization
- WHEN maturity labeling is validated
- THEN those capabilities MUST NOT be tagged `implemented` solely by K2.1
- AND MUST remain `target` or `experimental` until their owning slice

### Requirement: No Second Authority From Permits Or Store {#REQ-harness-authority-canon-006}

The Authority Store and OperationPermit path MUST NOT create a second semantic
authority that can override OpenSpec/Git. Runtime-owned permits authorize
mechanical lifecycle mutation only; they MUST NOT reinterpret free-form prose
or Graph IR as authority.

#### Scenario: Permit cannot override OpenSpec

- GIVEN OpenSpec/Git state that disagrees with a permit-backed runtime claim on
  a material semantic fact
- WHEN an authority-sensitive semantic operation evaluates the change
- THEN OpenSpec/Git MUST remain authoritative
- AND the permit path MUST NOT override the semantic fact
