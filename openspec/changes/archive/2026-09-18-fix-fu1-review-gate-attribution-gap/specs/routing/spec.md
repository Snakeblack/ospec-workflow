# Delta for routing

## ADDED Requirements

### Requirement: Successor Lineage Taxonomy Inheritance {#REQ-routing-012}

`createSuccessor` MUST produce a successor whose schema/taxonomy equals the
terminal predecessor's: a v2 (quality-domain) predecessor MUST yield a v2
successor with `trust`/`runtime`/`evolution`/`efficiency` owners, natively,
without manual lineage construction. A successor request that mixes taxonomies
(v2 predecessor with 4R dimension owners, or a v1 successor from a v2
predecessor) MUST fail closed with a structured taxonomy reason and MUST NOT
create any successor. Successor creation authority and additive predecessor
preservation remain governed by REQ-routing-007 and REQ-routing-004.

#### Scenario: v2 predecessor yields v2 successor natively

- GIVEN a terminal schema v2 quality-review lineage with quality-domain owners
- WHEN an approved `createSuccessor` runs
- THEN the successor MUST declare schema v2 with quality-domain vocabulary
- AND the predecessor record MUST remain complete and immutable

#### Scenario: Taxonomy-mixed successor request fails closed

- GIVEN a successor request carrying a 4R dimension owner against a v2 predecessor
- WHEN `createSuccessor` validates
- THEN it MUST fail closed with a structured taxonomy reason
- AND no successor lineage or budget MUST be created

---

## MODIFIED Requirements

### Requirement: Review Decision Contract and Audit {#REQ-routing-003}

Before specialist dispatch, the system MUST validate classification, normalized evidence, optional `review-change` routing output when invoked, canonical domain keys, allowed specialist names, and union-selection policy. For schema v2 and new state it MUST persist under `gates.quality-review-gate` the classification, `classification_status`, `selected_domains`, per-capability attribution coverage, ambiguity reasons when applicable, normalized evidence fingerprint, router decision when present, and per-domain reasons. When an ambiguity code is resolved via kernel-contract scope attribution or a valid declarative override (see `quality-review-attribution-resolution`), the audit MUST additionally record the resolution source, the synthetic fact or override identity with its justification and scope, and the codes closed; the resolved code MUST NOT re-appear as an unresolved ambiguity reason in the same gate evaluation. Legacy schema v1 state MUST persist under `gates.4r-review-gate` only until terminal completion or explicit atomic migration. Contract-invalid input MUST fail closed with `blocker_reason: contract-remediation` and MUST NOT dispatch specialists or silently fall back to unconditional full review.
(Previously: audit recorded ambiguity reasons but had no resolution record for scope attribution or declarative override closures.)

#### Scenario: Sufficient path persists auditable selection

- GIVEN sufficient classification selects `trust` and `runtime`
- WHEN routing completes
- THEN the gate audit MUST record both domains with non-empty reasons
- AND repeated identical input MUST produce the same auditable data

#### Scenario: Invalid router payload fails closed

- GIVEN `review-change` returns non-allowlisted domain IDs
- WHEN the gate validates inputs
- THEN the gate MUST record contract remediation
- AND no specialist dispatch MUST occur

#### Scenario: Resolved ambiguity is recorded once as closed

- GIVEN the ambiguity `public-kernel-contract-unattributed` is resolved by a valid override
- WHEN the gate persists its audit
- THEN the audit MUST record the resolution source, justification, and closed code
- AND the closed code MUST NOT also appear as an unresolved ambiguity reason

---

### Requirement: Closed-World Ambiguity Policy {#REQ-routing-008}

The deterministic classifier MUST emit `classification_status` of `sufficient` or `ambiguous`. Ambiguity MUST be decided by executable closed-world policy, not LLM authority. At minimum, ambiguity MUST apply when any of the following holds:

| Condition | Meaning |
|-----------|---------|
| `runtime-code-without-domain-attribution` | Production runtime code changed with zero domain signal |
| `unsupported-residual-evidence` | Normalizer sees executable behavior the signal vocabulary cannot classify |
| `classification-conflict` | Facts produce incompatible unresolved classification |
| `cross-capability-blast-radius` | More than 3 distinct **behavioral capabilities** are affected and at least one affected capability lacks deterministic quality-domain attribution |
| `public-kernel-contract-unattributed` | Kernel or externally consumed contract changes without domain signal |
| `self-review-infrastructure` | Quality gate, classifier, lineage, or generated-target parity changes |
| `generated-target-semantic-risk` | Generated-target behavior change not explained by deterministic parity |

Behavioral capabilities are drawn from the evidence contract (`paths`, `capabilities`, `dependencies`, `operationTypes`, `designRisks`). Docs, tests, fixtures, and generated mirrors without independent behavioral semantics MUST NOT count as behavioral capabilities. Packages and components MUST NOT be classifier units. Deterministic facts MUST be attributable to each affected behavioral capability so per-capability coverage and residual can be computed. Kernel public-contract paths declared as `capability_scopes` (`schemas/kernel/**`) MUST attribute their canonical domains via the synthetic fact `kernel-contract-change` (domains `trust` and `evolution`), so a change whose only behavioral surface is kernel contract scopes with no lexical signal is NOT `public-kernel-contract-unattributed`. An ambiguity code MAY be closed only by that scope attribution or by a valid declarative attribution override (`quality_review.attribution_override`); residual evidence without `fact_codes` MUST NOT close any code. Global `selected_domains != []` does NOT prove sufficient coverage; attribution is evaluated per capability. When all affected behavioral capabilities are deterministically attributed, blast radius alone MUST NOT invoke `review-change`. The bootstrap threshold for `cross-capability-blast-radius` is `> 3` distinct behavioral capabilities; telemetry MAY later inform retuning but live auto-tune is out of scope.

When `ambiguous`, the gate MUST invoke `review-change` with residual evidence only — including, for `cross-capability-blast-radius`, exactly the unattributed behavioral capabilities plus existing residual rules for other ambiguity codes. Runtime production changes with zero recognized signals MUST NOT silently complete as clean zero-specialist review solely because pattern matching found nothing.
(Previously: `public-kernel-contract-unattributed` had no deterministic resolution path; kernel-contract scopes without lexical signal always ended ambiguous.)

#### Scenario: Runtime code without signal is ambiguous

- GIVEN production runtime files changed and the classifier derives no domain signal
- WHEN sufficiency is evaluated
- THEN `classification_status` MUST be `ambiguous`
- AND `review-change` MUST be eligible for dispatch

#### Scenario: Docs-only sufficient with empty selection

- GIVEN evidence is documentation-only with no quality signals
- WHEN classification completes
- THEN `classification_status` MUST be `sufficient`
- AND `selected_domains` MUST be `[]`

#### Scenario: Four attributed capabilities are sufficient without router

- GIVEN exactly 4 distinct behavioral capabilities are affected
- AND every affected capability has deterministic quality-domain attribution
- WHEN sufficiency is evaluated
- THEN `classification_status` MUST be `sufficient`
- AND `review-change` MUST NOT be invoked solely for blast radius

#### Scenario: Four capabilities with two unattributed triggers router residue

- GIVEN exactly 4 distinct behavioral capabilities are affected
- AND 2 of those capabilities lack deterministic quality-domain attribution
- WHEN sufficiency is evaluated
- THEN `classification_status` MUST be `ambiguous` with reason `cross-capability-blast-radius`
- AND `review-change` MUST receive only the 2 unattributed capabilities as blast-radius residue

#### Scenario: Seven attributed capabilities do not invoke premium router

- GIVEN 7 distinct behavioral capabilities are affected
- AND every affected capability has deterministic quality-domain attribution
- WHEN sufficiency is evaluated
- THEN `classification_status` MUST be `sufficient`
- AND `review-change` MUST NOT run for blast radius alone

#### Scenario: Single unattributed runtime capability uses runtime rule not blast radius

- GIVEN exactly 1 behavioral capability has production runtime code changed with zero domain signal
- WHEN sufficiency is evaluated
- THEN `classification_status` MUST be `ambiguous` via `runtime-code-without-domain-attribution`
- AND MUST NOT classify ambiguity via `cross-capability-blast-radius`

#### Scenario: Clean kernel-contract change classified normal is sufficient via scope attribution

- GIVEN a change classified `normal` whose only behavioral capability is scoped to `schemas/kernel/**`
- AND the diff yields zero lexical domain signals and verification is clean
- WHEN sufficiency is evaluated
- THEN `classification_status` MUST be `sufficient` via the `kernel-contract-change` synthetic fact
- AND `public-kernel-contract-unattributed` MUST NOT be emitted
- AND the gate MUST NOT terminate in `quality-review-ambiguity-unresolved`
