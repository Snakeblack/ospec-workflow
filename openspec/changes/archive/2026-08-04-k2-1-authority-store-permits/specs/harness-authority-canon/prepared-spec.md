# harness-authority-canon Specification

## Purpose

Define the harness authority canon and maturity vocabulary so no authority
operation falls back to prose interpretation, and so Graph IR remains a
derived plan rather than an independent source of truth.

## Requirements

### Requirement: OpenSpec and Git Are Sole Semantic Authority {#REQ-harness-authority-canon-001}

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
interpreting free-form prose. The operation MUST consume structured contracts,
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

### Requirement: Maturity Labels Distinguishing Implemented Target Experimental {#REQ-harness-authority-canon-003}

Normative and architectural documentation that describes harness evolution
capabilities MUST label each claimed capability with exactly one maturity tag
from `{implemented, target, experimental}`. A document MUST NOT present an
`experimental` or `target` capability as if it were `implemented`. Graph IR
independent authority MUST remain tagged non-implemented (target or
experimental) until a later change explicitly promotes it.

#### Scenario: Docs distinguish maturity tags

- GIVEN a harness-evolution document section that lists capabilities
- WHEN maturity labeling is validated
- THEN every listed capability MUST carry exactly one of
  `implemented`, `target`, or `experimental`
- AND no `experimental` or `target` item MUST be labeled `implemented`

#### Scenario: Graph IR authority remains non-implemented

- GIVEN documentation that mentions Graph IR
- WHEN maturity labeling is validated
- THEN any claim that Graph IR is independent authority MUST NOT be tagged
  `implemented`
- AND MUST be tagged `target` or `experimental`

### Requirement: Lifecycle Vocabulary Is Declarative Only in K1 {#REQ-harness-authority-canon-004}

K1 MUST publish the lifecycle vocabulary and authority rules as contracts and
documentation. K1 MUST NOT execute adaptive routes, change fixed/default
routing baselines, introduce a new runtime, or implement the lifecycle
reducer (those belong to later changes, notably K2).

#### Scenario: K1 does not activate lifecycle reducer

- GIVEN the K1 contract suite is applied
- WHEN the repository is inspected for a global lifecycle reducer that
  executes `status → next_transition`
- THEN no such executable reducer MUST be introduced by K1
- AND fixed/default routing baselines MUST remain unchanged

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
