# Delta for routing

## ADDED Requirements

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

Behavioral capabilities are drawn from the evidence contract (`paths`, `capabilities`, `dependencies`, `operationTypes`, `designRisks`). Docs, tests, fixtures, and generated mirrors without independent behavioral semantics MUST NOT count as behavioral capabilities. Packages and components MUST NOT be classifier units. Deterministic facts MUST be attributable to each affected behavioral capability so per-capability coverage and residual can be computed. Global `selected_domains != []` does NOT prove sufficient coverage; attribution is evaluated per capability. When all affected behavioral capabilities are deterministically attributed, blast radius alone MUST NOT invoke `review-change`. The bootstrap threshold for `cross-capability-blast-radius` is `> 3` distinct behavioral capabilities; telemetry MAY later inform retuning but live auto-tune is out of scope.

When `ambiguous`, the gate MUST invoke `review-change` with residual evidence only — including, for `cross-capability-blast-radius`, exactly the unattributed behavioral capabilities plus existing residual rules for other ambiguity codes. Runtime production changes with zero recognized signals MUST NOT silently complete as clean zero-specialist review solely because pattern matching found nothing.

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

### Requirement: Zero-Model Quality Path {#REQ-routing-009}

When `classification_status` is `sufficient` and `selected_domains` is empty, the Quality Review Gate MUST complete without invoking `review-change` or any quality specialist.

#### Scenario: Metadata-only change completes with zero model calls

- GIVEN a sufficient classification with no selected domains
- WHEN the gate finishes routing
- THEN no review agent MAY be dispatched
- AND the audit MUST record the zero-dispatch outcome

### Requirement: High-Risk Full Review Without Semantic Router {#REQ-routing-010}

When change classification is `high-risk`, the gate MUST select all four quality domains deterministically and MUST NOT invoke `review-change` merely to confirm full review.

#### Scenario: High-risk selects four domains directly

- GIVEN classification is `high-risk` and verify succeeded
- WHEN routing completes
- THEN `selected_domains` MUST equal `[trust, runtime, evolution, efficiency]`
- AND `review-change` MUST NOT run

### Requirement: Atomic Released Contract Coherence {#REQ-routing-011}

The released gate MUST NOT operate with mixed taxonomy between classifier outputs and lineage or correction identifiers. `quality-review-gate` is the sole canonical gate identity for schema v2 and all new config, state, and writes. `4r-review-gate` is valid only inside explicitly legacy schema v1 state with old 4R dimension semantics; it MUST NOT be treated as an unqualified semantic alias. Gate identity is bound to taxonomy (4R dimensions vs quality domains) and classifier semantics — the discriminator is schema/version of lineage/state, not spelling aliasing. New writes MUST use only `quality-review-gate`. Legacy mutable v1 state MUST either remain v1 through terminal state or undergo an explicit atomic migration to v2 with `quality-review-gate` and `trust`/`runtime`/`evolution`/`efficiency` identifiers. Both gate keys present in the same mutable state MUST fail closed. Unqualified read-old/write-new aliasing is forbidden. Historical archived `4r-review-gate` and `.4r` records MUST remain immutable.

#### Scenario: Mixed classifier and lineage fails closed

- GIVEN the classifier emits `efficiency` while lineage stores `readability` owners
- WHEN dispatch or archive validation runs
- THEN the gate MUST fail closed
- AND MUST NOT complete under mixed identities

#### Scenario: Both gate keys in mutable state fail closed

- GIVEN mutable `state.yaml` contains both `gates.4r-review-gate` and `gates.quality-review-gate`
- WHEN gate validation or dispatch runs
- THEN the gate MUST fail closed for contract remediation
- AND MUST NOT treat either key as an unqualified alias of the other

#### Scenario: Legacy v1 state retains 4r identity without reinterpretation

- GIVEN in-flight mutable lineage is schema v1 under `gates.4r-review-gate` with 4R dimension IDs
- WHEN the gate resumes without an explicit v1→v2 migration
- THEN it MUST continue under v1 semantics to terminal state
- AND MUST NOT silently reinterpret 4R owners as quality domains

## MODIFIED Requirements

### Requirement: Evidence-Derived Review Dimensions {#REQ-routing-001}

At the Quality Review Gate, the system MUST normalize evidence, derive deterministic facts attributable to each affected behavioral capability, map facts to exactly four quality domains (`trust`, `runtime`, `evolution`, `efficiency`), and evaluate sufficiency per capability and globally. Each domain decision MUST record `selected: true|false` with non-empty ordered reasons when persisted. Signals MUST inform routing but MUST NOT be treated as findings. Evidence precedence MUST remain deterministic: high-risk override; verify findings; real-diff facts; design/dependency risks; declared paths, capabilities, dependencies, operation types, and design risks.

(Previously: derived four 4R dimensions `risk`, `reliability`, `resilience`, `readability`.)

#### Scenario: Network retry selects runtime only

- GIVEN normalized evidence shows retry semantics in production code
- WHEN domains are derived
- THEN `runtime` MUST be selected with deterministic reasons
- AND `efficiency` MUST NOT be selected without efficiency evidence

#### Scenario: Signals recorded but not findings

- GIVEN the classifier records fact `network-flow`
- WHEN specialist dispatch completes
- THEN the fact MUST appear in routing audit
- AND MUST NOT automatically create a specialist finding

### Requirement: Classification Caps and High-Risk Override {#REQ-routing-002}

Normal selection MUST set `selected_domains` to the union of positively signalled domains plus any domains `review-change` adds from residual evidence. The `normal-signal-overflow` rule that dispatched a fourth specialist when three domains were positive MUST be removed. Three positive domains MUST NOT implicitly select the fourth without efficiency evidence or explicit full-review policy. A `high-risk` change MUST select all four quality domains regardless of lower-precedence signals. Zero to four specialists MUST be legal for normal changes.

(Previously: three positive 4R signals escalated to mandatory full four-dimension review.)

#### Scenario: Three domains do not overflow to four

- GIVEN positive signals for `trust`, `runtime`, and `evolution` only
- WHEN normal selection completes
- THEN exactly those three domains MUST be selected
- AND `efficiency` MUST remain unselected

#### Scenario: High-risk override selects all four

- GIVEN classification is `high-risk`
- WHEN domains are derived
- THEN all four quality domains MUST be selected with override reasons recorded

### Requirement: Review Decision Contract and Audit {#REQ-routing-003}

Before specialist dispatch, the system MUST validate classification, normalized evidence, optional `review-change` routing output when invoked, canonical domain keys, allowed specialist names, and union-selection policy. For schema v2 and new state it MUST persist under `gates.quality-review-gate` the classification, `classification_status`, `selected_domains`, per-capability attribution coverage, ambiguity reasons when applicable, normalized evidence fingerprint, router decision when present, and per-domain reasons. Legacy schema v1 state MUST persist under `gates.4r-review-gate` only until terminal completion or explicit atomic migration. Contract-invalid input MUST fail closed with `blocker_reason: contract-remediation` and MUST NOT dispatch specialists or silently fall back to unconditional full review.

(Previously: always validated generalist result and ran generalist before specialists under `gates.4r-review-gate`.)

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

### Requirement: Frozen Review Genesis and Slice-Scoped Targeted Correction {#REQ-routing-004}

The gate MUST freeze its deterministic candidate identity, genesis paths, classification, selected quality domains, initial evidence, immutable finding IDs with canonical domain owners, and the lineage authority before specialist execution. It MUST derive a stable, versioned set of root-cause correction slices from the frozen blocking finding IDs and their frozen evidence. Each slice MUST own exactly its frozen finding IDs, permitted genesis paths, bounded changed-line allowance, at most three failed validations, correction history, and resolution state; its allowance and attempt count MUST NOT grow or reset inside that slice.

Targeted validation MUST dispatch and decide only the active slice. A passed slice and every finding it resolves MUST remain resolved when another slice fails. A validation MAY invalidate an already passed slice only when it records a genuine correction-caused regression against that slice's frozen finding IDs or permitted paths; it MUST identify every explicitly impacted slice and MUST NOT reopen unrelated passed slices. Validation MUST NOT perform general discovery, add blocking finding IDs, select another quality domain, expand genesis paths, or allocate reviewer authority. Unrelated late observations MUST remain non-blocking follow-ups.

Pending correction mutation, exact path validation, candidate identity, genesis, selected domains, one-shot reviewer execution, frozen findings, and reconciliation requirements MUST remain immutable and fail closed. Mixed taxonomy between classifier domains and lineage owners MUST fail closed. A successor MUST NOT be created merely because a slice fails or exhausts its allowance; it is reserved for an explicitly approved new candidate lineage, scope, or discovery authority.

(Previously: froze four 4R selected dimensions without mixed-taxonomy guard.)

#### Scenario: Independent slice resolution is monotonic

- GIVEN slices `provenance` and `policy` have distinct frozen finding IDs and `provenance` is resolved
- WHEN targeted validation fails the active `policy` slice
- THEN `provenance` and its resolved findings MUST remain resolved
- AND only `policy` MAY consume its attempt or line allowance

#### Scenario: Genuine cross-slice regression is explicit

- GIVEN a passed slice has frozen finding `F-001` on a permitted path
- WHEN a later correction causes a regression that evidence attributes to `F-001`
- THEN validation MAY invalidate that slice and MUST record it as explicitly impacted
- AND it MUST NOT invalidate any slice without that regression evidence

#### Scenario: Correction escapes genesis

- GIVEN a proposed correction changes a path outside the active slice's frozen permitted paths
- WHEN the gate validates the attempt
- THEN the attempt MUST fail or enter reconciliation without expanding the lineage
- AND candidate, genesis, domains, findings, and all slice budgets MUST remain immutable

### Requirement: Read-Only Gate Continuation, Migration, and Interruption Recovery {#REQ-routing-005}

Status, verification, delivery, and archive gates after lineage creation MUST revalidate the same candidate identity and persisted lineage state without allocating new reviewers or budgets. Mixed live taxonomy MUST fail closed until reconciled. Mutable old-schema lineages MUST migrate deterministically and idempotically or continue under their original schema; silent reinterpretation is forbidden.

(Previously: continuation rules did not include mixed-taxonomy fail-closed guard.)

#### Scenario: Archive revalidates without reopening review

- GIVEN a terminal quality-review lineage for the frozen candidate
- WHEN archive validation runs
- THEN it MUST validate the same candidate identity
- AND MUST NOT allocate reviewers, findings, or successor authority

### Requirement: Additive Generational 4R Lineage Persistence {#REQ-routing-007}

The Quality Review Gate persistence model MUST retain every lineage generation additively with an unambiguous active-lineage reference and explicit predecessor links. Creating a successor MUST preserve the complete terminal predecessor record. Readers MUST resolve the active lineage and predecessor chain deterministically. Historical archived 4R records MUST remain byte-equivalent and MUST NOT be rewritten to quality-domain IDs. Pending mutations MUST be recorded before dispatch; unknown outcomes permit only exact reconciliation.

(Previously: requirement named and scoped to 4R gate persistence without quality-domain identity migration rules.)

#### Scenario: Historical 4R archive untouched

- GIVEN an archived change stores `risk` finding owners
- WHEN tooling reads that archive after migration
- THEN the stored owners MUST remain `risk`
- AND MUST NOT be silently rewritten to `trust`

#### Scenario: Successor preserves predecessor literally

- GIVEN a terminal predecessor lineage under quality domains
- WHEN an approved successor is created
- THEN the predecessor record MUST remain complete
- AND the active reference MUST identify only the successor

## MODIFIED Requirements (constants)

The routing allowlists MUST recognize the Quality Review Gate and quality specialist roster:

| Constant | Updated value |
|----------|---------------|
| Gate identity | `quality-review-gate` (canonical for schema v2, new config, and new state); `4r-review-gate` valid only in explicitly legacy schema v1 state — no unqualified aliasing; both keys in same mutable state MUST fail closed |
| `KNOWN_REVIEWERS` | `review-trust`, `review-runtime`, `review-evolution`, `review-efficiency` |
| Review lifecycle agents | plus `review-change`, `review-correction` |

#### Scenario: Route gate hook uses Quality Review Gate

- GIVEN the active route lists `quality-review-gate` after verify
- WHEN verify succeeds
- THEN deterministic-first routing MUST run
- AND advisory severity policy for specialist findings MUST remain unchanged

#### Scenario: Route without gate skips review dispatch

- GIVEN the active route omits the quality review gate
- WHEN verify succeeds
- THEN neither `review-change` nor quality specialists MUST be dispatched

## Clarifications

### Session 2026-09-03

- Q: ¿Cómo debe persistirse la identidad del Quality Review Gate en rutas activas (config.yaml), state.yaml (gates.*) y constantes de routing? → A: Renombre canónico versionado (A4). `quality-review-gate` es la identidad canónica única para schema v2 y escrituras nuevas. `4r-review-gate` solo es válido en estado/schema v1 legacy explícito; nunca como alias semántico no calificado. Migración v1→v2 atómica; ambas claves en el mismo estado mutable → fail closed; evidencia archivada inmutable.
- Q: ¿Cuándo debe dispararse la ambigüedad cross-package/cross-capability blast radius? → A: Atribución incompleta por capability (B5). Renombrar a `cross-capability-blast-radius`. Dispara cuando >3 capabilities conductuales distintas están afectadas Y al menos una carece de atribución determinista de dominio. Atribución por capability, no global `selected_domains`. Router recibe solo capabilities no atribuidas. Umbral bootstrap >3; sin auto-tune en spec.
