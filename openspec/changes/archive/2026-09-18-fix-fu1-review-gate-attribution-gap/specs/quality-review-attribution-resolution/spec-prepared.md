# Quality Review Attribution Resolution Specification

## Purpose

Defines the ambiguity-resolution contract for the Quality Review Gate: minimal
attribution via kernel-contract `capability_scopes`, a bounded declarative
override with mandatory justification and audit, the residual-router contract
that accepts justified domains, and v2-to-v2 successor lineage creation.
Closes the FU1 gap where a clean kernel-contract change classified `normal`
terminates in `quality-review-ambiguity-unresolved` with no closure route.

## Requirements

### Requirement: Kernel-Contract Scope Attribution {#REQ-quality-review-attribution-resolution-001}

The classifier MUST attribute quality domains from `capability_scopes` that
reference kernel public contract paths (`schemas/kernel/**`) even when the diff
produces no lexical signal. Attribution MUST be expressed as a deterministic
synthetic fact (`kernel-contract-change`) mapped to the canonical quality
domains `trust` and `evolution`. The synthetic fact MUST flow through the
normal fact pipeline: it MUST respect the normalized evidence fingerprint and
evidence validation, and MUST appear in the routing audit like any other fact.
It MUST NOT create findings, select specialists beyond its mapped domains, or
bypass per-capability coverage evaluation.

#### Scenario: Clean kernel-contract change classified normal is sufficient

- GIVEN a change whose only behavioral surface is `capability_scopes: ["schemas/kernel/result-envelope/**"]`
- AND the diff generates zero lexical domain signals
- AND the change verifies clean (no findings, no declared design risks)
- AND classification is `normal`
- WHEN the classifier derives facts and evaluates sufficiency
- THEN a synthetic fact `kernel-contract-change` MUST be recorded with fingerprint-validated evidence
- AND domains `trust` and `evolution` MUST be attributed to that capability
- AND `classification_status` MUST be `sufficient` with no `public-kernel-contract-unattributed` reason
- AND the gate MUST proceed to dispatch or archive without `quality-review-ambiguity-unresolved`

#### Scenario: Synthetic fact appears in audit and creates no findings

- GIVEN the synthetic fact `kernel-contract-change` is emitted
- WHEN routing completes
- THEN the fact MUST appear in the routing audit
- AND MUST NOT create any specialist finding by itself

#### Scenario: Scope attribution does not mask other ambiguity codes

- GIVEN a change with kernel-contract scopes AND production runtime code with zero domain signal outside those scopes
- WHEN sufficiency is evaluated
- THEN the out-of-scope capability MUST remain unattributed
- AND `classification_status` MUST remain `ambiguous` via `runtime-code-without-domain-attribution`

### Requirement: Bounded Declarative Attribution Override {#REQ-quality-review-attribution-resolution-002}

The system MUST support an optional, versioned `quality_review.attribution_override`
block in `openspec/config.yaml` mirroring the `quality_gates` pattern. Absence
MUST be a strict no-op. When declared, the block MUST contain non-empty
`justification`, a `scope` list of path patterns, and `applies_to` (ambiguity
codes it may close). A malformed block (missing or empty `justification`, empty
or absent `scope`, unknown `applies_to` code) MUST fail closed: the gate keeps
the ambiguity unresolved and records a structured validation error; it MUST NOT
treat the override as a silent bypass. A matching override MUST resolve the
listed ambiguity codes with the declared domains, and the gate audit MUST
record the override identity, justification, scope, and the codes it closed.
An override MUST NOT suppress findings, unselect domains derived from facts, or
apply to codes outside `applies_to`.

#### Scenario: Valid override closes the ambiguity auditable

- GIVEN a well-formed override declaring `justification`, `scope: ["schemas/kernel/**"]`, `applies_to: ["public-kernel-contract-unattributed"]`
- AND a change whose residual ambiguity is exactly `public-kernel-contract-unattributed` within that scope
- WHEN the gate evaluates the ambiguity
- THEN the code MUST be resolved with the declared domains
- AND the gate audit MUST record justification, scope, and closed codes
- AND dispatch/archive MUST proceed

#### Scenario: Malformed override fails closed

- GIVEN an override block with empty `justification` or absent `scope`
- WHEN the gate loads the policy
- THEN the override MUST be rejected with a structured error
- AND the ambiguity MUST remain unresolved (fail-closed, no silent no-op)

#### Scenario: Override does not apply outside its declared codes

- GIVEN an override whose `applies_to` lists only `public-kernel-contract-unattributed`
- AND the residual ambiguity is `runtime-code-without-domain-attribution`
- WHEN the gate evaluates the ambiguity
- THEN the ambiguity MUST remain unresolved
- AND the override MUST NOT close it

### Requirement: Residual Router Accepts Justified Domain Resolution {#REQ-quality-review-attribution-resolution-003}

The residual router decision contract (`validateRouterDecision`/`ROUTER_REASON`)
MUST accept a resolution that carries justified domains when the justification
is scope attribution (REQ-001) or a valid override (REQ-002). The gate planner
MUST consume that resolution and close the ambiguity with correct dispatch or
archive — it MUST NOT re-derive the ambiguity it just resolved. Residual
evidence without `fact_codes` MUST remain insufficient on its own; only the two
declared resolution sources MAY close an ambiguity code.

#### Scenario: Router validates override-backed justified domains

- GIVEN a router decision carrying domains justified by a valid override
- WHEN `validateRouterDecision` runs
- THEN the decision MUST validate
- AND the gate plan MUST allow dispatch or archive without re-blocking

#### Scenario: Unjustified residual evidence still blocks

- GIVEN residual evidence with no `fact_codes` and no override or scope attribution
- WHEN the router decision is validated
- THEN the gate MUST remain blocked with `quality-review-ambiguity-unresolved`

### Requirement: Successor Lineage Inherits Quality Taxonomy V2 {#REQ-quality-review-attribution-resolution-004}

`createSuccessor` MUST produce a schema v2 lineage (quality domains) when the
terminal predecessor is v2, without manual lineage construction. The successor
MUST NOT mix taxonomies: creating a v2 successor with 4R dimension owners, or a
v1 successor from a v2 predecessor, MUST fail closed. Successor creation
remains reserved for explicitly approved new candidate lineage, scope, or
discovery authority; it MUST preserve the complete terminal predecessor record
additively per REQ-routing-007.

#### Scenario: createSuccessor from terminal v2 yields v2 successor

- GIVEN a terminal quality-review lineage under schema v2 with quality-domain owners
- WHEN an approved successor is created via `createSuccessor`
- THEN the successor MUST use schema v2 with `trust`/`runtime`/`evolution`/`efficiency` vocabulary
- AND the predecessor record MUST remain complete and unmodified

#### Scenario: Mixed-taxonomy successor fails closed

- GIVEN a v2 terminal predecessor and a successor request carrying a 4R dimension owner
- WHEN `createSuccessor` validates the request
- THEN it MUST fail closed with a structured taxonomy reason
- AND no successor lineage MUST be created

