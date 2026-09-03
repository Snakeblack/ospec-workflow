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

### Requirement: Challenge Plans And Results Are Non-Authoritative Complementary Evidence {#REQ-harness-authority-canon-012}

ChallengePlan and ChallengeResult contracts and execution outputs MUST serve exclusively as complementary verification evidence. They MUST NOT constitute a second semantic authority, delivery authority, or lifecycle decision engine. A successful challenge run MUST NOT grant delivery authorization, approve candidate promotion, or bypass OpenSpec/Git/Candidate authority. Any operation that attempts to derive delivery authorization or lifecycle promotion from challenge results alone MUST fail closed with a structured reason code.

#### Scenario: Challenge outputs consumed as complementary evidence only

- GIVEN a complete ChallengePlan and successful ChallengeResult records for a frozen Candidate
- WHEN candidate verification and lifecycle status are evaluated
- THEN the challenge outputs MUST be treated as complementary verification evidence
- AND MUST NOT be treated as an autonomous lifecycle or delivery authorization

#### Scenario: Attempt to grant delivery authority from challenge results fails closed

- GIVEN an operation that attempts to authorize delivery or candidate promotion based solely on passing challenge results
- WHEN authority is evaluated
- THEN the operation MUST fail closed
- AND OpenSpec, Git, and frozen Candidate verification MUST remain the sole authority

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
