# Delta for agents

## ADDED Requirements

### Requirement: Quality Review Specialist Catalog {#REQ-agents-021}

The agent catalog MUST expose exactly four quality-domain specialists — `review-trust`, `review-runtime`, `review-evolution`, and `review-efficiency` — plus `review-change` (residual-only semantic router) and `review-correction` (outside the taxonomy). All six MUST remain read-only (`tools: ['read', 'search']`). The orchestrator allowlist MUST include all six when the Quality Review Gate runs after successful verify.

| Agent | Role |
|-------|------|
| `review-trust` | Trust boundaries: security, privacy, auditability, data integrity |
| `review-runtime` | Runtime correctness under failure, concurrency, and degradation |
| `review-evolution` | Maintainability, modularity, deployability, evolvability |
| `review-efficiency` | Performance, scalability, and proportional resource use |
| `review-change` | Residual-only domain attribution; MUST NOT emit findings |
| `review-correction` | Slice-targeted remediation validation; consumes new domain owners |

#### Scenario: Allowlist includes quality roster

- GIVEN the orchestrator reads its review allowlist after successful verify
- WHEN the Quality Review Gate is active
- THEN the allowlist MUST include the four specialists, `review-change`, and `review-correction`
- AND every listed agent MUST remain read-only

#### Scenario: Retired 4R specialists are not dispatch targets

- GIVEN a live gate uses the quality-domain taxonomy
- WHEN orchestration resolves specialist dispatch
- THEN `review-risk`, `review-reliability`, `review-resilience`, and `review-readability` MUST NOT appear as dispatch targets

### Requirement: Canonical Quality Attribute Ownership {#REQ-agents-022}

Each supported quality attribute MUST have exactly one canonical domain owner among `trust`, `runtime`, `evolution`, and `efficiency`. A specialist MAY cite cross-domain effects as evidence but MUST NOT emit a blocking finding whose canonical ownership belongs to another domain.

#### Scenario: Efficiency finding stays efficiency-owned

- GIVEN `review-efficiency` observes unbounded queue growth that could affect availability
- WHEN it emits a blocking finding
- THEN the finding MUST remain an efficiency finding about unbounded resource growth
- AND it MUST NOT claim availability as its canonical owner

#### Scenario: Cross-domain evidence without mis-ownership

- GIVEN `review-runtime` cites a trust-sensitive path while diagnosing error handling
- WHEN it emits a blocking finding
- THEN the finding MUST be owned by `runtime`
- AND MUST NOT be labeled as a trust finding unless trust is the canonical owner

### Requirement: Released Contract Coherence {#REQ-agents-023}

The released system MUST NOT operate with mixed review taxonomies. Classifier domain IDs, lineage finding owners, correction ownership, hooks allowlists, generated targets, and eval fixtures MUST share the same canonical domain set before the change completes. Gate identity MUST follow versioned canonical rename: `quality-review-gate` for schema v2 and new writes; `4r-review-gate` only in legacy v1 state without unqualified aliasing; both gate keys in the same mutable state MUST fail closed. Apply slices are sequencing only; they MUST NOT be independently releasable mixed states.

#### Scenario: Mixed taxonomy blocks dispatch

- GIVEN the classifier emits `trust` while active lineage still references `risk`
- WHEN the gate prepares specialist dispatch
- THEN dispatch MUST fail closed for contract remediation
- AND archive completion MUST NOT proceed under mixed identities

#### Scenario: Mixed gate keys in mutable state block dispatch

- GIVEN mutable state contains both `gates.4r-review-gate` and `gates.quality-review-gate`
- WHEN the orchestrator prepares Quality Review Gate dispatch
- THEN dispatch MUST fail closed for contract remediation
- AND MUST NOT treat either key as an unqualified alias

### Requirement: Quality Review Gate Dispatch {#REQ-agents-024}

Given an active route reaches the post-verify Quality Review Gate, the orchestrator MUST classify evidence deterministically first, invoke `review-change` only on `ambiguous` residual evidence, derive final domain selection as the union of deterministic and semantic additions, and dispatch only selected quality specialists. It MUST collect every dispatched envelope before evaluating findings. It MUST surface `BLOCKER` and `CRITICAL` findings through the existing target-specific user question mechanism without automatic halt; `WARNING` and `SUGGESTION` MUST be recorded without interruption. The gate MUST NOT absorb `sdd-verify` responsibilities. Gate hook points remain after successful verify for routes that list the gate.

#### Scenario: Malformed router output prevents unsafe dispatch

- GIVEN `review-change` returns findings, severity, or non-canonical domain IDs
- WHEN the gate validates router output
- THEN it MUST block for contract remediation
- AND MUST NOT dispatch specialists or proceed to archive under invalid router output

#### Scenario: Functional verification boundary preserved

- GIVEN verify completes with functional failures
- WHEN the Quality Review Gate would run
- THEN the gate MUST NOT replace or subsume verify's functional verdict
- AND quality review runs only on routes where verify succeeded

## MODIFIED Requirements

### Requirement: Generalist-First Read-Only Review {#REQ-agents-012}

When the Quality Review Gate fires, the orchestrator MUST run deterministic classification before any model dispatch. It MUST invoke `review-change` only when classification is `ambiguous`, passing bounded residual evidence — unattributed behavioral capabilities for `cross-capability-blast-radius`, plus existing residual rules for other ambiguity codes — not full proposal, spec, design, tasks, or complete diff by default. When classification is `sufficient`, the orchestrator MUST NOT invoke `review-change`. For `high-risk`, the orchestrator MUST dispatch all four quality specialists directly without `review-change`. The semantic router MUST NOT write files, emit findings, assign severity, remove deterministically selected domains, or replace specialist review.

(Previously: the orchestrator always launched `review-change` before specialists with full verified change context.)

#### Scenario: Sufficient classification skips semantic router

- GIVEN deterministic classification is `sufficient` with domains `[runtime]`
- WHEN the gate completes routing
- THEN `review-change` MUST NOT be invoked
- AND exactly `review-runtime` MUST be dispatched

#### Scenario: Ambiguous classification uses residual-only router

- GIVEN classification is `ambiguous` with reason `cross-capability-blast-radius` and 2 unattributed behavioral capabilities
- WHEN `review-change` is invoked
- THEN its input MUST be limited to those 2 unattributed capabilities plus allowlisted ambiguity context
- AND it MUST NOT receive entire planning artifacts or fully attributed capabilities by default

#### Scenario: High-risk bypasses semantic router

- GIVEN the change is classified `high-risk` and verify succeeded
- WHEN the gate routes specialists
- THEN all four quality specialists MUST be dispatched
- AND `review-change` MUST NOT be invoked merely to confirm full review

### Requirement: Selective Specialist Dispatch with Slice-Scoped Remediation {#REQ-agents-013}

The orchestrator MUST dispatch only quality domains in the final selected set: zero to four specialists for normal changes and all four for high-risk. Selection MUST equal the union of positively signalled domains plus any domains `review-change` adds from residual evidence; `review-change` MUST NOT remove deterministic selections. Skipped domains MUST remain audit decisions, not synthetic clean envelopes. Parallel-preferred and serial-fallback behavior MUST be preserved. Each selected specialist MUST execute at most once per lineage. After findings freeze, the orchestrator MUST NOT relaunch `review-change` or any specialist; it MUST dispatch `review-correction` only for the active slice with frozen finding IDs whose owners are `trust`, `runtime`, `evolution`, or `efficiency`.

(Previously: normal dispatch capped at two specialists and used 4R dimension IDs.)

#### Scenario: Union of three domains dispatches three specialists

- GIVEN final selection is `[trust, runtime, evolution]`
- WHEN specialists are dispatched
- THEN exactly those three agents MUST run
- AND `review-efficiency` MUST NOT run without evidence or explicit full-review policy

#### Scenario: Zero-model sufficient path

- GIVEN classification is `sufficient` with `selected_domains: []`
- WHEN the gate completes
- THEN no review agent MAY be invoked
- AND the gate MUST persist the zero-dispatch audit decision

#### Scenario: Correction consumes new finding owners

- GIVEN frozen findings owned by `evolution` and `efficiency`
- WHEN `review-correction` validates an active slice
- THEN it MUST accept those domain owners
- AND MUST return `resolved|unresolved` per frozen ID without relaunching discovery reviewers

### Requirement: Review Agent Target Parity {#REQ-agents-014}

The source quality-review roster, `review-change` residual router contract, selective dispatch instructions, validation contracts, and audit semantics MUST be generated equivalently for every supported target (`claude`, `vscode`, `github-copilot`, `opencode`, `codex`, `cursor`). Identical normalized evidence MUST yield the same classification status, selected domains, reasons, failure behavior, and severity/remediation outcome across targets.

(Previously: parity referenced 4R dimensions and mandatory generalist-first routing.)

#### Scenario: Generated targets select identical domains

- GIVEN identical normal-change evidence producing `sufficient` and `[runtime, efficiency]`
- WHEN each supported target executes the gate
- THEN every target MUST select the same two domains with equivalent reasons
- AND contract validation MUST fail on a missing specialist or router contract

### Requirement: Bounded Review Lineage with Independent Correction Slices {#REQ-agents-015}

Before the first specialist dispatch, the orchestrator MUST freeze one auditable lineage with deterministic candidate identity, genesis paths, classification, selected quality domains, initial evidence, and immutable finding IDs using canonical domain identifiers. Historical archived 4R records (`risk`, `reliability`, `resilience`, `readability`) MUST remain immutable. Mutable old-schema state MUST finish under its original schema or undergo an explicit versioned migration; silent reinterpretation is forbidden. Mixed live taxonomy MUST fail closed until reconciled.

(Previously: lineage froze four 4R dimensions without mixed-taxonomy guard.)

#### Scenario: Archived 4R evidence stays immutable

- GIVEN an archived change stores 4R dimension IDs in `.4r` evidence
- WHEN tooling reads that archive
- THEN the historical record MUST remain valid under its original schema
- AND MUST NOT be rewritten to quality-domain IDs

#### Scenario: Mutable state requires explicit migration

- GIVEN in-flight lineage still stores 4R dimension IDs
- WHEN the gate resumes under the new taxonomy
- THEN it MUST either continue under the original schema to terminal state
- OR apply an explicit versioned migration before the next mutable action

## Clarifications

### Session 2026-09-03

- Q: ¿Cómo debe persistirse la identidad del Quality Review Gate en rutas activas (config.yaml), state.yaml (gates.*) y constantes de routing? → A: Renombre canónico versionado (A4). `quality-review-gate` canónico para schema v2; `4r-review-gate` solo en v1 legacy; sin alias no calificado; ambas claves en mutable state → fail closed.
- Q: ¿Cuándo debe dispararse la ambigüedad cross-package/cross-capability blast radius? → A: Atribución incompleta por capability (B5). `cross-capability-blast-radius` cuando >3 capabilities conductuales y al menos una sin atribución; router recibe solo capabilities no atribuidas.
