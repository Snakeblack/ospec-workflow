# Proposal: Replace 4R with Deterministic Domain-Oriented Quality Review

## Intent

Replace the current 4R review taxonomy:

* `risk`
* `reliability`
* `resilience`
* `readability`

with four broad quality domains:

* `trust`
* `runtime`
* `evolution`
* `efficiency`

and redesign the Quality Review Gate so deterministic evidence classification is the primary routing authority.

The new gate MUST:

1. normalize review evidence deterministically;
2. derive quality-domain signals deterministically;
3. determine whether the available evidence is sufficient or ambiguous;
4. directly select justified quality domains when classification is sufficient;
5. invoke `review-change` only for unresolved semantic residue;
6. bypass semantic routing entirely for deterministic full-review policy such as `high-risk`;
7. dispatch only the union of positively selected domains;
8. preserve immutable review lineage, bounded remediation, cross-target parity, and evidence-backed findings.

The goal is broader system-quality coverage with equal or lower expected model cost.

This is a single high-risk architectural migration. It MUST NOT be split into independent intermediate releases that temporarily mix the old and new review taxonomies.

---

## Problem

The current 4R architecture uses four narrow specialist checklists rather than four broad quality families.

Current responsibilities are approximately:

| Reviewer             | Current Review Scope                                       |
| -------------------- | ---------------------------------------------------------- |
| `review-risk`        | elevated privilege, PII exposure, injection, auth bypass   |
| `review-reliability` | error-path tests, nondeterminism, public-input validation  |
| `review-resilience`  | I/O error handling, partial failures, swallowed exceptions |
| `review-readability` | ambiguous naming, deep nesting, unexplained decisions      |

This creates several architectural problems.

### Narrow Quality Coverage

Important system quality attributes currently lack explicit ownership, including:

* performance
* scalability
* latency
* throughput
* capacity
* resource efficiency
* maintainability
* modifiability
* extensibility
* modularity
* interoperability
* compatibility
* portability
* deployability
* configurability
* observability
* operability
* auditability
* traceability
* data integrity
* consistency
* durability

They may be discovered incidentally, but they are not first-class review responsibilities.

### Reliability / Resilience Duplication

Current classifier signals such as network-flow and error-flow may activate both `reliability` and `resilience`.

Both reviewers therefore frequently inspect the same execution paths:

* network calls
* I/O
* exceptions
* retries
* rollback
* partial state mutation
* failure propagation

The separation adds model context and duplicated analysis without a sufficiently distinct competence boundary.

### Signal Overflow Causes Unjustified Review

The current normal-review policy escalates three positive dimensions into full four-dimension review.

Conceptually:

```text
3 positive dimensions
        |
        v
normal-signal-overflow
        |
        v
all 4 reviewers
```

This can dispatch a specialist for which no corresponding evidence exists.

The number of positively selected domains MUST NOT itself be a reason to add unrelated review domains.

### Mandatory Premium Semantic Routing

The current pipeline deterministically normalizes evidence, then always invokes `review-change`, then derives the final review dimensions by combining deterministic facts with the generalist decision.

The generalist:

* reads review context;
* cannot remove deterministic dimensions;
* cannot introduce arbitrary dimensions;
* cannot emit specialist findings;
* does not affect the high-risk full-review outcome;
* is currently assigned a premium model.

This places semantic model cost in a path where deterministic policy already holds substantial routing authority.

### Semantic Router Reads Too Much Context

Simply redefining `review-change` as a router is insufficient if it continues to consume the complete change context.

The cost of semantic routing is primarily determined by its input context, not by whether it emits findings.

The semantic fallback therefore MUST receive only unresolved evidence rather than re-reading all evidence already classified deterministically.

---

## Goals

* Broaden explicit quality-attribute coverage.
* Reduce overlap between specialist responsibilities.
* Preserve four bounded specialist contexts rather than creating one agent per quality attribute.
* Make deterministic policy responsible for all machine-expressible routing decisions.
* Make semantic routing exceptional rather than mandatory.
* Prevent classifier blind spots from silently becoming clean reviews.
* Preserve high-risk full review.
* Preserve evidence-backed findings.
* Preserve immutable review lineage and bounded remediation.
* Reduce avoidable model calls and duplicate context consumption.
* Make future model-tier decisions measurable through telemetry.

---

## Non-Goals

* Replacing `sdd-verify`.
* Moving functional verification into the Quality Review Gate.
* Adding one reviewer per quality attribute.
* Allowing reviewers to edit implementation files.
* Introducing automatic remediation.
* Replacing executable benchmarks, load tests, security scanners, integration tests, or observability evidence with LLM judgment.
* Treating lexical signals as findings.
* Rewriting immutable archived 4R evidence.
* Replacing `review-correction`.
* Changing the finding severity taxonomy unless separately specified.

---

## Scope

### In Scope

* Slice 1 — domain contracts for `trust`, `runtime`, `evolution`, and `efficiency`, including unique canonical ownership, finding-ownership rules, specialist agents `review-trust` / `review-runtime` / `review-evolution` / `review-efficiency`, and do-not-flag rules.
* Slice 2 — new deterministic fact vocabulary and signal-to-domain mappings that evolve with those contracts; `classification_status = sufficient | ambiguous`; `selected_domains = union(signalled_domains)`; removal of `normal-signal-overflow`.
* Slice 3 — deterministic-first routing: high-risk → direct full review of all four domains with no `review-change`; sufficient + domains → direct specialist dispatch; sufficient + `[]` → zero model calls; ambiguous → `review-change` with residual-only context.
* Slice 4 — specialist roster migration across agent definitions, skills, `models.yaml`, orchestrator allowlists, target profiles, generators, hooks, validators, and routing constants.
* Slice 5 — review-gate / lineage identity migration; historical archived 4R records remain immutable; mutable old-schema state gets explicit compatibility or a versioned migration; `review-correction` stays outside the taxonomy and remains compatible with the new domain IDs.
* Slice 6 — success metrics measured through existing `context-measurement` (CX0 / phase-cost) telemetry: `semantic_router_invocation_rate`, `specialists_per_gate`, `zero_model_gate_rate`, `full_review_rate`, `tokens_per_quality_gate`, `tokens_per_finding`, `router_delta_rate`.
* One high-risk contractual migration. Apply slices 1–6 are sequencing, not independently releasable semantic states.
* Active naming: Quality Review / Quality Review Gate / `quality-review-gate`. Historical filenames and archived evidence MAY retain `4R`.

### Out of Scope

* Everything listed under Non-Goals, including absorbing `sdd-verify`, automatic remediation, rewriting archived 4R evidence, and replacing `review-correction`.
* A `review-operations` domain or agent.
* Shared canonical ownership of any quality attribute.
* Independently shipped mixed-taxonomy releases (new classifier with old lineage, or the inverse).
* The `quality-gates` spec domain (`openspec/config.yaml` `quality_gates:` verify-policy schema). That is not the Quality Review Gate.
* Prescribing the `review-change` model tier; interpretation is empirical after telemetry exists.
* K6D (`k6d-complexity-architecture-delta`) contracts, schemas, or remediation.
* Inventing a parallel telemetry subsystem beside `context-measurement`.

---

# Quality Domains

## Trust

Agent:

```text
review-trust
```

Question:

> Can this behavior and its trust boundaries be safely trusted?

Primary ownership:

* security
* privacy
* auditability
* traceability
* data integrity
* authentication
* authorization
* least privilege
* secrets handling
* sensitive-data handling
* injection resistance
* trust-sensitive dependency changes
* secure defaults

Representative findings:

* authorization bypass;
* privilege escalation;
* command, SQL, path, or template injection;
* exposed credentials or sensitive data;
* security-sensitive mutation without sufficient audit evidence;
* integrity violation;
* unsafe trust-boundary expansion;
* unsafe dependency or executable introduction.

The reviewer MUST NOT emit generic security suspicion without concrete evidence.

---

## Runtime

Agent:

```text
review-runtime
```

Question:

> Will this behavior remain correct under real, failing, concurrent, and partially degraded runtime conditions?

Primary ownership:

* reliability
* resilience
* availability
* fault tolerance
* recoverability
* consistency
* durability
* concurrency correctness
* determinism
* runtime validation
* observability
* monitorability
* operability
* error handling
* timeout behavior
* retry semantics
* idempotency
* rollback
* partial failures
* resource lifecycle
* unhappy-path verification

This domain replaces both:

```text
review-reliability
review-resilience
```

Representative findings:

* swallowed exceptions;
* unsafe retry semantics;
* missing rollback after partial mutation;
* race conditions;
* inconsistent durable state;
* nondeterministic behavior without control;
* missing timeout behavior;
* invalid resource cleanup;
* critical runtime behavior with insufficient observability;
* important error paths without executable verification.

---

## Evolution

Agent:

```text
review-evolution
```

Question:

> Can this system continue to be understood, tested, modified, extended, and deployed safely?

Primary ownership:

* maintainability
* modifiability
* extensibility
* modularity
* testability
* readability
* understandability
* simplicity
* reusability
* evolvability
* compatibility
* interoperability
* portability
* configurability
* deployability
* coupling
* cohesion
* dependency direction
* abstraction quality
* architectural boundaries

This domain replaces the narrow `review-readability` role.

Representative findings:

* unnecessary cross-boundary coupling;
* duplicated policy;
* invalid dependency direction;
* abstractions that increase rather than reduce complexity;
* public contracts that become unnecessarily difficult to evolve;
* configuration knowledge duplicated across components;
* architectural boundaries bypassed;
* material reduction in testability;
* compatibility break without justified migration path;
* readability problems that materially increase future maintenance cost.

Style preferences alone MUST NOT be findings.

---

## Efficiency

Agent:

```text
review-efficiency
```

Question:

> Does this change consume proportionate resources as load and data volume grow?

Primary ownership:

* performance
* scalability
* latency
* throughput
* capacity
* elasticity
* CPU efficiency
* memory efficiency
* I/O efficiency
* network efficiency
* algorithmic complexity
* resource contention
* blocking operations
* batching
* caching
* serialization cost
* unbounded resource growth

Representative findings:

* avoidable O(n²) behavior over potentially unbounded data;
* repeated network requests inside loops;
* repeated full-tree scans;
* unnecessary serialization on hot paths;
* unbounded queues, caches, buffers, or concurrency;
* blocking operations on latency-sensitive execution paths;
* unnecessary repeated computation;
* resource retention that grows with workload.

The reviewer MUST distinguish:

1. demonstrated efficiency defect;
2. concrete risk requiring measurement;
3. unsupported optimization speculation.

Premature optimization MUST NOT be emitted as a finding.

---

# Canonical Quality Ownership

Each quality attribute MUST have exactly one canonical owner.

| Quality Attribute       | Canonical Owner |
| ----------------------- | --------------- |
| Security                | Trust           |
| Privacy                 | Trust           |
| Auditability            | Trust           |
| Traceability            | Trust           |
| Data Integrity          | Trust           |
| Authentication          | Trust           |
| Authorization           | Trust           |
| Reliability             | Runtime         |
| Resilience              | Runtime         |
| Availability            | Runtime         |
| Fault Tolerance         | Runtime         |
| Recoverability          | Runtime         |
| Consistency             | Runtime         |
| Durability              | Runtime         |
| Concurrency Correctness | Runtime         |
| Determinism             | Runtime         |
| Observability           | Runtime         |
| Monitorability          | Runtime         |
| Operability             | Runtime         |
| Maintainability         | Evolution       |
| Modifiability           | Evolution       |
| Extensibility           | Evolution       |
| Modularity              | Evolution       |
| Testability             | Evolution       |
| Readability             | Evolution       |
| Understandability       | Evolution       |
| Reusability             | Evolution       |
| Evolvability            | Evolution       |
| Compatibility           | Evolution       |
| Interoperability        | Evolution       |
| Portability             | Evolution       |
| Configurability         | Evolution       |
| Deployability           | Evolution       |
| Performance             | Efficiency      |
| Scalability             | Efficiency      |
| Latency                 | Efficiency      |
| Throughput              | Efficiency      |
| Capacity                | Efficiency      |
| Elasticity              | Efficiency      |
| CPU Efficiency          | Efficiency      |
| Memory Efficiency       | Efficiency      |
| I/O Efficiency          | Efficiency      |
| Network Efficiency      | Efficiency      |

A reviewer MAY use effects belonging to another domain as contextual evidence.

It MUST NOT emit a blocking finding whose canonical quality ownership belongs to another domain.

Example:

`review-efficiency` MAY identify that an unbounded queue could eventually affect availability.

Its finding MUST remain an efficiency finding about unbounded resource growth.

It MUST NOT reinterpret itself as the owner of Availability.

This rule prevents the new domains from recreating the current reliability/resilience overlap.

---

# Functional Verification Boundary

`sdd-verify` remains responsible for functional implementation fitness, including:

* executable scenarios;
* TDD evidence;
* specification / implementation contradictions;
* acceptance behavior;
* verification evidence;
* required tests;
* functional regressions.

The Quality Review Gate evaluates non-functional and architectural quality consequences after successful verification.

The Quality Review Gate MUST NOT absorb `sdd-verify` responsibilities.

---

# Deterministic Evidence Model

The new taxonomy MUST NOT be implemented as a reviewer rename over the existing signal model.

Domain contracts and deterministic signal coverage MUST evolve together.

Pipeline:

```text
raw change evidence
        |
        v
normalize evidence
        |
        v
derive deterministic facts
        |
        v
map facts to quality domains
        |
        v
evaluate classification sufficiency
```

Signals determine which expertise is required.

Signals MUST NOT themselves be treated as findings.

---

## Trust Signals

Candidate deterministic signals include:

```text
auth-boundary-change
permission-change
credential-handling
secret-handling
sensitive-data-flow
process-execution
dependency-trust-change
integrity-sensitive-state
security-policy-change
external-input-to-sensitive-sink
```

---

## Runtime Signals

Candidate deterministic signals include:

```text
network-flow
error-flow
persistent-state-mutation
transaction-flow
retry-flow
timeout-flow
concurrency-flow
resource-lifecycle
public-input-boundary
partial-failure-path
external-state-dependency
runtime-observability-change
```

---

## Evolution Signals

Candidate deterministic signals include:

```text
public-contract-change
architectural-boundary-change
cross-component-dependency
dependency-direction-change
configuration-contract-change
generated-contract-change
structural-complexity
policy-duplication
module-topology-change
interface-shape-change
deployment-contract-change
```

---

## Efficiency Signals

Candidate deterministic signals include:

```text
loop-io
repeated-network-flow
blocking-io
unbounded-collection
unbounded-concurrency
whole-tree-scan
serialization-hot-path
algorithmic-complexity-risk
resource-retention
large-data-copy
repeated-computation
performance-sensitive-path
```

Signal derivation MAY use more than lexical regexes.

Evidence sources MAY include:

* real diff;
* changed paths;
* dependency graph;
* affected capabilities;
* operation type;
* public contract metadata;
* architectural metadata;
* generated-target topology;
* verifier findings;
* declared design risks;
* repository structure.

---

# Classification Sufficiency

The deterministic classifier MUST explicitly distinguish between:

```text
sufficient
```

and:

```text
ambiguous
```

Absence of a known positive signal MUST NOT automatically mean that a behavioral runtime change has no quality impact.

A canonical decision should conceptually contain:

```text
selected_domains
classification_status
ambiguity_reasons
residual_evidence
```

where:

```text
classification_status = sufficient | ambiguous
```

The exact persisted schema is implementation-defined by the design phase.

---

## Sufficient Classification

Classification is sufficient when deterministic evidence is adequate to justify a bounded domain selection.

Examples:

```text
docs-only
=> []
```

```text
network retry behavior
=> [runtime]
```

```text
authorization-sensitive runtime mutation
=> [trust, runtime]
```

```text
public API restructuring
=> [evolution]
```

```text
network request introduced inside collection loop
=> [efficiency]
```

---

## Ambiguous Classification

Ambiguity MUST be determined by executable policy rather than by the LLM.

Initial ambiguity conditions SHOULD include at least:

### Runtime Code Without Domain Attribution

Production runtime code changed, but deterministic evidence produced no domain signal.

This prevents unknown code shapes from becoming implicit clean reviews.

### Unsupported Residual Evidence

The evidence normalizer identifies changed executable behavior that the current signal vocabulary cannot classify.

### Classification Conflict

Evidence produces incompatible or unresolved classification facts requiring semantic interpretation.

### Cross-Package Blast Radius

A change affects more than a bounded number of architectural packages, components, or capabilities without sufficient deterministic attribution.

The exact threshold MUST be defined and tested by the implementation design.

### Public or Kernel Contract Change

A kernel-level, externally consumed, or lifecycle-critical contract changes without sufficient domain attribution.

### Self-Review Infrastructure Change

Changes affecting the review system itself MAY require semantic fallback or full-review policy, including:

* Quality Review Gate;
* verifier authority;
* review classifier;
* review lineage;
* remediation authority;
* isolation boundary;
* security boundary;
* generated-target review parity.

### Generated-Target Semantic Risk

Generated target behavior changes in ways not adequately explained by deterministic parity evidence.

Ambiguity rules MUST be closed-world, explicit, testable, and auditable.

---

# Routing Model

The active Quality Review Gate MUST become deterministic-first.

```text
sdd-verify
    |
    v
normalize evidence
    |
    v
deterministic classifier
    |
    +------------------------+
    |                        |
    v                        v
sufficient                ambiguous
    |                        |
    v                        v
selected domains       review-change
                             |
                             v
                        residual only
                             |
                             v
                     semantic additions
                             |
              +--------------+
              |
              v
       union(selected domains)
```

---

# High-Risk Override

When:

```text
classification = high-risk
```

the routing result is deterministically:

```text
trust
runtime
evolution
efficiency
```

No `review-change` invocation is required.

Conceptually:

```text
high-risk
    |
    v
FULL QUALITY REVIEW
    |
    +--> trust
    +--> runtime
    +--> evolution
    +--> efficiency
```

The semantic router MUST NOT be invoked merely to confirm a decision already required by deterministic policy.

Changes to the Quality Review Gate itself SHOULD be treated as high-risk unless a stronger existing classification rule already applies.

---

# Remove Dimension-Count Overflow

The existing behavior:

```text
3 positive dimensions
        |
        v
full review
```

MUST be removed.

Normal selection becomes:

```text
selected_domains = union(positively_signalled_domains)
```

Therefore:

```text
trust + runtime + evolution
```

dispatches exactly three specialists unless another explicit full-review policy applies.

`efficiency` MUST NOT execute without:

* efficiency evidence; or
* explicit full-review override.

Full review is a policy decision, not a consequence of domain count.

---

# Semantic Router

`review-change` remains available but its competence boundary changes.

Its responsibility becomes:

> Resolve quality-domain attribution for deterministic residue that executable policy cannot classify safely.

It is not a reviewer.

It MUST NOT:

* emit findings;
* assign severity;
* perform remediation;
* remove deterministically selected domains;
* reinterpret deterministic high-risk full-review policy;
* consume complete change context when only a subset remains unresolved.

---

## Residual-Only Context

The semantic router MUST receive only the minimum unresolved evidence required for classification.

Candidate input:

* ambiguity reason codes;
* affected paths relevant to the ambiguity;
* affected capabilities;
* involved public or architectural contracts;
* small bounded source excerpts;
* unclassified diff regions;
* relevant verifier references;
* already selected deterministic domains.

It SHOULD NOT receive by default:

* entire proposal;
* entire specification set;
* entire design;
* entire tasks artifact;
* complete diff when only a subset is unresolved;
* already classified evidence with no semantic routing value.

The router context MUST be bounded.

---

## Semantic Router Authority

The router MAY add domains justified by semantic residue.

It MUST NOT remove deterministic selections.

Conceptually:

```text
final_domains =
  deterministic_domains
  UNION
  semantic_residual_domains
```

Semantic output MUST remain constrained to canonical domain identifiers and allowlisted evidence references.

---

# Zero-Model Quality Path

When deterministic evidence establishes both:

```text
classification_status = sufficient
selected_domains = []
```

the Quality Review Gate completes without:

* `review-change`;
* specialist review.

Expected examples include:

* documentation-only changes;
* allowlisted metadata-only changes;
* generated artifacts with proven no-behavior parity impact;
* other explicitly modeled no-quality-impact changes.

---

# Specialist Dispatch

Possible normal dispatch counts are:

```text
0
1
2
3
4
```

Selected specialists execute only when justified by evidence or explicit policy.

Parallel execution remains preferred when supported.

Serial fallback remains valid.

Each specialist executes at most once for the immutable initial candidate unless review-lineage policy explicitly authorizes a successor review.

A skipped domain is an audit decision.

It MUST NOT be represented as a synthetic clean specialist result.

---

# Findings Contract

Existing severities remain:

```text
BLOCKER
CRITICAL
WARNING
SUGGESTION
```

Every finding MUST include concrete evidence.

A valid finding identifies:

* canonical quality domain;
* affected files or scope;
* concrete evidence;
* why the issue matters;
* severity.

Generic advice MUST NOT be emitted as a finding.

Invalid examples:

```text
"This could scale better."
```

```text
"Consider improving maintainability."
```

```text
"More tests would help."
```

```text
"This may contain a security problem."
```

---

# Review Correction

`review-correction` remains outside the quality-domain taxonomy.

It is not a quality reviewer.

Its responsibility remains:

* validating remediation against frozen finding IDs;
* enforcing slice ownership;
* preserving immutable lineage;
* determining `resolved | unresolved`;
* reporting explicitly proven regression impact.

It MUST remain compatible with findings originating from:

```text
trust
runtime
evolution
efficiency
```

---

# Review Lineage Migration

This change modifies canonical reviewer identities embedded in lifecycle state.

The migration is therefore high-risk.

Affected concepts include:

* dimension identifiers;
* specialist roster;
* review-gate state;
* lineage slices;
* finding ownership;
* correction ownership;
* telemetry names;
* generated-target validation;
* fixtures and evals;
* archived `.4r` terminology;
* active mutable review state.

Historical archived review evidence MUST remain immutable.

Archived records using:

```text
risk
reliability
resilience
readability
```

MUST NOT be rewritten merely to use the new taxonomy.

Old immutable records remain valid under their original schema.

Mutable old-schema state MUST either:

1. continue to terminal state under its original schema; or
2. undergo an explicit deterministic versioned migration.

Implicit reinterpretation is forbidden.

---

# Naming

The active system SHOULD no longer use `4R` as the architecture name.

Recommended terminology:

```text
Quality Review
Quality Review Gate
quality-review-gate
```

Canonical specialists:

```text
review-trust
review-runtime
review-evolution
review-efficiency
```

Historical filenames and archived evidence MAY retain `4R` where changing them would rewrite history.

---

# Single High-Risk Migration

This proposal MUST be implemented as one high-risk SDD rather than two independently released migrations.

Reason:

the review-domain identifiers participate in:

* classifier contracts;
* review lineage;
* routing;
* correction ownership;
* hooks;
* telemetry;
* generated targets;
* validation;
* evals;
* fixtures.

Performing deterministic-router changes under the old taxonomy and then renaming the taxonomy would duplicate migration work and create two periods of contract churn.

The implementation SHOULD use internal apply slices while preserving one coherent contractual migration.

---

# Apply Slices

## Slice 1 — Domain Contracts

Define:

```text
Trust
Runtime
Evolution
Efficiency
```

including:

* exact competence boundaries;
* canonical attribute ownership;
* finding ownership rules;
* specialist contracts;
* do-not-flag rules.

No quality attribute may have multiple canonical owners.

---

## Slice 2 — Deterministic Evidence and Signals

Implement:

* new deterministic fact vocabulary;
* signal-to-domain mappings;
* broader evidence sources;
* `selected = union(signalled_domains)`;
* removal of `normal-signal-overflow`;
* explicit sufficient / ambiguous classification;
* residual evidence generation.

This slice is mandatory for the taxonomy migration.

Renaming specialists without this signal redesign is insufficient.

---

## Slice 3 — Deterministic-First Routing

Implement:

```text
high-risk
=> direct full quality review
```

```text
sufficient + domains
=> direct specialist dispatch
```

```text
sufficient + []
=> no model calls
```

```text
ambiguous
=> review-change(residual evidence only)
```

The semantic router MUST no longer be part of every successful review path.

---

## Slice 4 — Specialist Migration

Replace:

```text
review-risk
review-reliability
review-resilience
review-readability
```

with:

```text
review-trust
review-runtime
review-evolution
review-efficiency
```

Update:

* agent definitions;
* skills;
* model configuration;
* orchestrator allowlists;
* target profiles;
* generators;
* hooks;
* validators;
* routing contracts.

---

## Slice 5 — Review Lifecycle Migration

Update:

* quality-gate schema;
* review lineage;
* specialist identity;
* finding ownership;
* remediation slices;
* correction validation;
* active-state compatibility;
* historical-state handling;
* contract tests;
* eval fixtures.

Historical immutable 4R records MUST remain unchanged.

---

## Slice 6 — Telemetry Validation

Use existing cost telemetry to measure the new architecture.

Required metrics:

```text
semantic_router_invocation_rate
specialists_per_gate
zero_model_gate_rate
full_review_rate
tokens_per_quality_gate
tokens_per_finding
router_delta_rate
```

Where:

```text
router_delta_rate
```

means:

> Percentage of semantic-router invocations in which `review-change` adds at least one domain not selected deterministically.

This metric informs the long-term value and model tier of `review-change`.

---

# Model Policy

This proposal does not prescribe the final model tier for `review-change`.

After implementation, telemetry SHOULD determine whether semantic routing remains:

```text
premium
```

moves to:

```text
default
```

or can eventually be removed.

Interpretation SHOULD be empirical.

For example:

Very low `router_delta_rate` may indicate that semantic routing provides little value.

Moderate but consistent delta may justify a cheaper semantic model.

Frequent high-value semantic additions may justify retaining premium routing.

No threshold is normative in this proposal; thresholds require measured data and a separate policy decision.

---

# Atomic Contract Requirement

The internal slices are implementation sequencing, not independently valid architecture states.

The released system MUST NOT end in a mixed state such as:

```text
classifier:
trust/runtime/evolution/efficiency
```

while:

```text
lineage:
risk/reliability/resilience/readability
```

or the inverse.

The migration MUST reach a contractually coherent state before completion.

---

# Capabilities

> Contract with `sdd-spec`. Names are existing folders under `openspec/specs/`.
> Implementation modules such as `review-dimensions.js` / `review-lineage.js` are not spec domains.
> `quality-gates` is the verify-policy schema in `config.yaml` and MUST NOT receive this delta.

## New Capabilities

None. No `quality-review` domain and no parallel telemetry subsystem. This is an evolution of the existing post-verify review capability already specified under `agents`, `skills`, and `routing`.

## Modified Capabilities

* `agents`: Replace the specialist roster with `review-trust`, `review-runtime`, `review-evolution`, and `review-efficiency`; redefine `review-change` as residual-only semantic router that cannot emit findings or remove deterministic domains; keep `review-correction` outside the taxonomy; update orchestrator allowlists, envelopes, and dispatch.
* `skills`: Replace the four specialist skill contracts; update `review-change` competence, decision schema (`sufficient`/`ambiguous` residue, canonical domain IDs), and residual-only context; keep `review-correction` compatible with new finding owners; update profile copy that still says “4R”.
* `routing`: Own Quality Review Gate identity, `KNOWN_REVIEWERS` / gate constants, deterministic-first routing, closed-world ambiguity policy, high-risk full review without `review-change`, `selected = union(signalled_domains)`, removal of `normal-signal-overflow`, classifier/lineage persistence, and fail-closed mixed-taxonomy detection.
* `generator`: Keep six-target semantic and byte/parity for the new agent/skill roster, `models.yaml` mappings, and runtime scripts `review-dimensions.js`, `review-gate-state.js`, and `review-lineage.js`.
* `hooks`: Update the SubagentStop phase-cost allowlist from the 4R specialist names to the four quality-domain agents; keep `review-change` and `review-correction`; do not treat arbitrary `review-*` as supported.
* `orchestrator-evals`: Keep golden fixtures and structural route-table copies coherent with the live gate identity and specialist roster (today they embed `4r-review-gate`).
* `context-measurement`: Reuse CX0 / phase-cost records for slice 6 metrics; do not add a second measurement pipeline. Extend coverage so the listed Quality Review KPIs are attributable without changing CX0’s non-authoritative boundary.

---

# Approach

Implement one atomic high-risk migration sequenced as the six apply slices already defined in this proposal:

1. Domain contracts and unique ownership.
2. Deterministic evidence, signals, sufficiency/ambiguity, union selection, overflow removal.
3. Deterministic-first routing, including high-risk full review and residual-only `review-change`.
4. Specialist, skill, model, hook, and target-profile roster migration.
5. Gate/lineage identity migration with immutable archived 4R records.
6. Telemetry validation on existing `context-measurement` (CX0).

Slices are implementation order, not shippable mixed states. The released contract MUST be coherent before the change is complete: classifier, lineage, correction ownership, hooks, evals, and generated targets MUST share the same taxonomy. Design owns persisted schema details (`selected_domains`, `ambiguity_reasons`, `residual_evidence`, gate key rename vs alias).

---

# Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/review-dimensions.js` | Modified | Normalize evidence; new signal families; `sufficient` \| `ambiguous`; residual evidence; union selection; remove `normal-signal-overflow`. |
| `scripts/lib/review-gate-state.js` | Modified | Deterministic-first `next_action`; high-risk full review skips `review-change`; new specialist map. |
| `scripts/lib/review-lineage.js` | Modified | Canonical domain identities; versioned compatibility for mutable old-schema state. |
| `scripts/review-dimensions.test.js`, `scripts/review-gate-state.test.js`, `scripts/review-lineage.test.js`, `scripts/review-lineage-o4-migration.test.js`, `scripts/selective-4r-parity.test.js`, `scripts/review-change-contract.test.js`, `scripts/review-correction-contract.test.js` | Modified | Classifier, routing, lineage, residual-router, and correction-compat contracts. |
| `scripts/lib/route-dispatcher.js` | Modified | `KNOWN_REVIEWERS` / `KNOWN_GATES` and route tables that list `4r-review-gate`. |
| `openspec/config.yaml` | Modified | Live route `gates` identity for the Quality Review Gate. |
| `skills/_shared/gate-4r-review.md` | Modified | Orchestrator dispatch protocol; historical filename MAY remain. |
| `skills/review-risk/`, `skills/review-reliability/`, `skills/review-resilience/`, `skills/review-readability/` | Removed | Replaced by the four quality-domain skills. |
| `skills/review-trust/`, `skills/review-runtime/`, `skills/review-evolution/`, `skills/review-efficiency/` | New | Specialist contracts and do-not-flag rules. |
| `skills/review-change/SKILL.md` | Modified | Residual-only router; cannot emit findings or strip deterministic domains. |
| `skills/review-correction/SKILL.md` | Modified | Consume findings owned by `trust` \| `runtime` \| `evolution` \| `efficiency`. |
| `agents/review-*.agent.md`, `agents/sdd-orchestrator.agent.md` | Modified | Roster, allowlists, residual context, high-risk bypass of `review-change`. |
| `models.yaml` | Modified | Map new specialists; `review-change` tier stays empirical (currently `premium`). |
| `scripts/lib/target-profiles/*.js` | Modified | Readonly/allowlisted review agent names (e.g. Cursor `agentReadonly.agents`). |
| `scripts/configure/validate-*.js`, `scripts/configure/cli.test.js`, `scripts/configure/real-repo.test.js`, `scripts/configure/__fixtures__/golden/**` | Modified | Generated-target validators and golden trees. |
| `hooks/`, `scripts/hooks/subagent-stop*.js`, `internal/hooks/subagentstop.go` | Modified | JS/Go phase-cost allowlist of review agents (parity). |
| `scripts/evals/**` | Modified | Fixtures that copy `gates: [4r-review-gate]` and related structural assertions. |
| `scripts/fixtures/review-lineage/**` | Modified | Mutable-schema fixtures only; archived change `.4r/` trees are not rewritten. |
| `docs/target-capabilities.md`, `docs/roadmaps/harness-evolution.md` (active architecture notes only) | Modified | Replace active 4R architecture names; leave historical closure records intact. |
| `openspec/specs/quality-gates/` | Unchanged | Verify-policy schema; not this gate. |
| Archived `openspec/changes/archive/**/.4r/` and historical `gates.4r-review-gate` | Unchanged | Immutable. |

---

# Risks

| Risk                                                | Likelihood | Impact | Mitigation                                              |
| --------------------------------------------------- | ---------: | -----: | ------------------------------------------------------- |
| Classifier misses quality impact                    |     Medium |   High | Explicit ambiguity state and semantic residual fallback |
| Semantic fallback becomes mandatory again           |     Medium | Medium | Closed ambiguity conditions and telemetry               |
| New domains become too broad                        |     Medium | Medium | Strict ownership and competence contracts               |
| Trust/runtime overlap reappears                     |     Medium | Medium | Canonical single-owner rule                             |
| Evolution becomes style review                      |     Medium | Medium | Require material maintainability/evolution impact       |
| Efficiency produces premature optimization findings |     Medium | Medium | Evidence threshold and explicit speculation prohibition |
| Residual context grows to full context              |     Medium | Medium | Bounded residual schema and tests                       |
| Review lineage migration breaks active state        | Low/Medium |   High | Versioned schema and explicit migration                 |
| Generated targets drift                             |     Medium |   High | Cross-target parity validation                          |
| High-risk self-review path becomes circular         |     Medium |   High | Deterministic direct full review                        |
| New signal vocabulary overfits lexical patterns     |     Medium | Medium | Multiple evidence sources and adversarial tests         |
| Mixed taxonomy ships (classifier vs lineage)        |        Low |   High | Atomic contract; fail closed on mixed identities; no partial live release |
| Parallel telemetry invented beside CX0              |        Low | Medium | Slice 6 extends `context-measurement` only              |
| Shared-branch collision with K6D                    |     Medium | Medium | Do not absorb K6D; isolate Quality Review files; reconcile tests on the shared branch |

---

# Rollback Plan

This migration is all-or-nothing at the released contract. There is no supported live mixed classifier/lineage state.

* **Before merge / before a coherent contract:** revert the change directory and any unreleased implementation on `feat/k6d-cx0-parallel` (or the successor feature branch). Restore the previous 4R roster, `review-dimensions.js` / `review-gate-state.js` / `review-lineage.js`, skills, agents, `models.yaml`, hooks allowlist, evals, and generated-target profiles as one unit.
* **Historical evidence:** do not roll back by rewriting archived `.4r` trees or archived `gates.4r-review-gate` records. They MUST remain untouched under the original 4R schema.
* **If a mixed taxonomy is detected at runtime** (classifier emits `trust`/`runtime`/`evolution`/`efficiency` while lineage/correction/hooks still use `risk`/`reliability`/`resilience`/`readability`, or the inverse): fail closed. Block dispatch and archive. Do not complete a gate under mixed identities.
* **Mutable in-flight 4R lineages:** finish under the original schema or apply only the explicit versioned migration; never silently reinterpret. Rolling back mid-migration MUST restore the prior reducer pair, not leave one new and one old.
* **Telemetry:** slice 6 metrics are additive on `context-measurement`. Rollback drops the new KPI derivations; it MUST NOT corrupt legacy phase-cost or CX0 records.
* **Generated targets:** regenerate from the restored source tree; do not hand-edit dist.

---

# Dependencies

* `k6d-complexity-architecture-delta` is still active and `blocked` on `feat/k6d-cx0-parallel`. This change MUST NOT absorb K6D, wait on K6D remediation as a functional prerequisite, or treat K6D schemas as Quality Review inputs. Shared-branch test and file collisions remain an integration risk.
* CX0 telemetry already exists as `openspec/specs/context-measurement/`. Slice 6 MUST reuse that subsystem (and existing phase-cost rows) rather than invent a parallel measurement pipeline.
* Current executable review stack: `scripts/lib/review-dimensions.js`, `scripts/lib/review-gate-state.js`, `scripts/lib/review-lineage.js`, `skills/_shared/gate-4r-review.md`.
* `quality-gates` (`config.yaml` `quality_gates:`) is not a dependency of this gate.
* `sdd-verify` remains the functional-verification predecessor; the Quality Review Gate still runs only after successful verify on routes that list the gate.

---

# Alternatives Considered

## Keep Existing 4R

Rejected.

The current dimensions are narrow, overlap materially, and leave several important quality families without explicit ownership.

---

## Three Broad Reviewers

Example:

```text
trust
runtime
evolution
```

with efficiency included in runtime.

Rejected.

Runtime would own too many independent reasoning concerns:

* failure correctness;
* consistency;
* recovery;
* concurrency;
* latency;
* throughput;
* resource usage;
* scalability.

Efficiency merits an independent context.

---

## More Than Four Reviewers

Rejected as the default architecture.

One specialist per quality attribute would increase:

* dispatch count;
* orchestration complexity;
* lineage complexity;
* context duplication;
* configuration surface;
* token cost.

The objective is broad families with strong boundaries.

---

## Router-First SDD Followed by Taxonomy SDD

Rejected.

It provides earlier savings but requires two migrations over contracts that are deeply coupled to dimension identities.

The review lifecycle would undergo unnecessary duplicate churn.

---

## Rename Specialists Without Signal Redesign

Rejected.

Without new deterministic evidence and domain mappings:

* Efficiency would have little or no activation path;
* Evolution would inherit insufficient structural signals;
* the taxonomy would improve naming without materially improving review coverage.

---

# Success Criteria

* [ ] The active review taxonomy contains exactly four canonical quality domains: `trust`, `runtime`, `evolution`, `efficiency`.

* [ ] Every supported quality attribute has exactly one canonical domain owner.

* [ ] Existing reliability and resilience responsibilities are consolidated under `runtime`.

* [ ] Existing readability responsibilities are incorporated into `evolution`.

* [ ] Security/risk responsibilities are incorporated into `trust`.

* [ ] Performance, scalability, latency, throughput, capacity, elasticity, and resource efficiency are explicitly owned by `efficiency`.

* [ ] The deterministic fact vocabulary contains viable activation signals for all four domains.

* [ ] Deterministic evidence classification occurs before semantic routing.

* [ ] Classification explicitly produces `sufficient` or `ambiguous`.

* [ ] Runtime production changes with no recognized domain evidence cannot silently become clean solely because regexes found nothing.

* [ ] Ambiguity is determined by executable closed-world policy.

* [ ] `review-change` executes only for ambiguous residual evidence.

* [ ] `review-change` receives bounded residual context rather than the complete change by default.

* [ ] `review-change` cannot remove deterministically selected domains.

* [ ] `review-change` cannot emit specialist findings or severity.

* [ ] `high-risk` dispatches all four quality specialists directly without semantic router invocation.

* [ ] Normal review selection is the union of positively justified domains.

* [ ] `normal-signal-overflow` is removed.

* [ ] Three selected normal domains do not implicitly select the fourth.

* [ ] A deterministically clean quality gate can complete with zero model calls.

* [ ] Normal changes may dispatch 0, 1, 2, 3, or 4 specialists.

* [ ] Findings remain concrete, evidence-backed, and domain-owned.

* [ ] Specialists do not emit blocking findings owned by another quality domain.

* [ ] `sdd-verify` retains functional verification ownership.

* [ ] `review-correction` remains independent of quality-domain classification.

* [ ] Existing immutable review-lineage guarantees remain intact.

* [ ] Historical archived 4R records remain unchanged and valid.

* [ ] Mutable old-schema review state has explicit compatibility or migration behavior.

* [ ] All supported targets recognize the new reviewer roster.

* [ ] Hooks and telemetry recognize the new reviewer identities.

* [ ] Cross-target generation and contract parity tests pass.

* [ ] Telemetry exposes semantic-router invocation rate, specialist count, zero-model rate, full-review rate, tokens per quality gate, tokens per finding, and router delta rate.

* [ ] Broader quality coverage is achieved without an uncontrolled increase in average review cost.

---

# Expected Outcome

The active architecture changes from:

```text
Risk
Reliability
Resilience
Readability
```

to:

```text
Trust
Runtime
Evolution
Efficiency
```

and from:

```text
normalize
    |
    v
review-change
    |
    v
derive dimensions
    |
    v
specialists
```

to:

```text
                   sdd-verify
                       |
                       v
                normalize evidence
                       |
                       v
             deterministic classifier
                       |
         +-------------+-------------+
         |                           |
         v                           v
     sufficient                   ambiguous
         |                           |
         |                           v
         |                    review-change
         |                    residual only
         |                           |
         +-------------+-------------+
                       |
                       v
             union(selected domains)
                       |
       +---------------+---------------+
       |               |               |
       v               v               v
     Trust          Runtime        Evolution
                                       |
                                       v
                                  Efficiency
```

with a separate deterministic override:

```text
high-risk
    |
    v
Trust + Runtime + Evolution + Efficiency
```

The result is a Quality Review Gate with broader architectural coverage, less duplicated specialist work, explicit ownership, deterministic routing wherever possible, semantic reasoning only where required, and measurable control over model cost.
