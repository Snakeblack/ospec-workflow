# Design: Quality Review Gate

## Technical Approach

Replace the live 4R pipeline (mandatory `review-change`, dimensions `risk|reliability|resilience|readability`, `normal-signal-overflow`) with schema-v2 Quality Review: domains `trust|runtime|evolution|efficiency`, deterministic-first routing, and residual-only semantic fallback.

Keep the existing three-module split. Keep schema-bound v1 executors so in-flight 4R lineages can finish. Do not add a `quality-review` spec domain. Do not touch K6d files.

| Module | Authority |
|--------|-----------|
| `scripts/lib/review-taxonomy.js` | Active vs legacy IDs/gates/reviewers; lexical recognition vs semantic admissibility; mixed detectors |
| `scripts/lib/review-dimensions.js` | Evidence v2, signals, explicit `capability_scopes`, sufficiency |
| `scripts/lib/review-gate-state.js` | `next_action` adapter: router vs specialists vs zero-model vs unresolved-ambiguity block |
| `scripts/lib/review-lineage.js` | Identity, one-shot lenses, dual-schema owners, v1 continue / explicit v2 migrate with receipt |
| `scripts/lib/quality-review-kpis.js` | Slice-6 KPIs from CX0 + `phase-costs.jsonl` + gate audit (no new store; **not** a generated-target runtime entry) |

Released contract is atomic: classifier, lineage owners, correction, hooks, evals, and generated **live** targets share the v2 taxonomy before merge. v1 agent/skill files remain as compatibility executors. Apply slices 1–6 are sequencing only.

## Architecture Decisions

| Decision | Choice | Rejected | Rationale |
|----------|--------|----------|-----------|
| Gate identity | `quality-review-gate` sole v2/new-write key; `4r-review-gate` only schema-v1/legacy; lexical recognition ≠ semantic admission | Flat `KNOWN_GATES` of both; unqualified alias | A4; recognition must not authorize a v2 live route |
| Reviewer roster | Keep `LEGACY_V1_REVIEWERS` source files; v2 routes use only `ACTIVE_V2_REVIEWERS` | Delete 4R agents/skills | Unstarted-migrate-only; a started v1 lens cannot continue without its executor |
| Routing | Classify first; `review-change` only on `ambiguous`; high-risk → four domains, no router; `sufficient` router → union; `ambiguous` router → block unresolved; delete overflow | Always union after router; 3→4 overflow | Well-formed “cannot resolve” is not contract-remediation |
| Schema | Evidence/decision/lineage **v2** for quality IDs; in-flight v1 continues to terminal **or** pristine explicit migrate with predecessor receipt | Silent ID remap; migrate after a lens ran | Lineage IDs embed owners; executed lenses are one-shot |
| Capabilities | Attribution only via validated `capability_scopes`; no path/id inference; global facts may select a domain without attributing capabilities | POSIX prefix/segment match | B5; inferred scopes fake coverage |
| Residual payload | Per unattributed capability: bounded paths + `total_paths`/`truncated` | Flat `paths ≤20` | Lexicographic clip can hide a small capability |
| Telemetry | Derive KPIs in-memory from existing CX0 + phase-cost + gate audit | New JSONL; add 7 metrics to CX0 `METRICS` | Slice 6; CX0 metric set is closed |
| Shared taxonomy module | New `review-taxonomy.js` for IDs + fail-closed detectors | Copy constants in three files | Mixed detection must not drift |
| Signals | Lexical + path + verify/design/dependency facts (existing style); add efficiency/evolution/trust families | New AST/graph pipeline in this change | Follow current `diffFacts` pattern; graph sources remain future |
| `review-change` tier | Keep `premium` in `models.yaml` | Prescribe default/cheap now | Empirical after `router_delta_rate` |
| Gate protocol filename | Keep `skills/_shared/gate-4r-review.md`; rewrite body | Rename file | Historical filename MAY retain `4R` |
| Model policy | Require active six mappings; retain four legacy mappings | Drop 4R from `models.yaml` | v1 continuation still dispatches those agents |

### Decision: Versioned canonical gate identity (A4)

**Choice**: Live `openspec/config.yaml` routes (`bugfix`, `refactor`, `standard`) list `quality-review-gate`. Split constants:

```text
ACTIVE_GATES   ⊇ quality-review-gate     // not 4r-review-gate
LEGACY_GATES   ⊇ 4r-review-gate
LEXICAL_GATES  = ACTIVE_GATES ∪ LEGACY_GATES   // parse-only
```

Semantic admission is context-dependent:

```text
live/v2 config             quality-review-gate valid; 4r-review-gate reject
schema-v1 persisted state  4r-review-gate valid; quality-review-gate reject
legacy/archive reader      4r-review-gate valid
both keys in one mutable state → fail closed
```

Recognition of a legacy identifier does not authorize its use in a v2 live route. A single route listing both review gates is invalid. New `state.yaml` writes go only to `gates.quality-review-gate` with `schema_version: 2`. `readReviewGate` fail-closes if both keys exist as mappings.

**Alternatives considered**: Flat `KNOWN_GATES` containing both names; alias old key; keep live config on `4r-review-gate`.

**Rationale**: A4. A flat allowlist would make a new v2 config that lists `4r-review-gate` syntactically valid.

### Decision: Deterministic-first routing with residual-only router

**Choice**: `classifyQualityReview(evidence)` runs with no model. High-risk short-circuits to four domains. `sufficient` (classifier) dispatches the union including `[]`. `ambiguous` is the only `run_router: true` path. Router input is residual evidence **per unattributed capability**. Router output is `{ classification_status, added_domains, reason }` with no findings.

Closed contract after a **valid** router payload:

```text
router.classification_status == sufficient
    → merge deterministic ∪ added_domains
    → dispatch selected domains

router.classification_status == ambiguous
    → gate blocked
    → dispatch = []
    → archive_allowed = false
    → blocker_reason: quality-review-ambiguity-unresolved
```

Malformed or forbidden router output (findings, severity, unknown IDs, extra keys) remains `blocker_reason: contract-remediation`. Do not reuse `contract-remediation` for a well-formed “I cannot resolve this”. Persist `quality-review-ambiguity-unresolved` as a **gate** `blocker_reason` on `review-gate-state` (not a new SDD phase `blocker_type`). Router cannot strip deterministic domains. `normal-signal-overflow` is removed.

**Alternatives considered**: Keep generalist-first; let router replace the set; treat unresolved residual as sufficient union.

**Rationale**: Spec slices 3 and `REQ-agents-012`. An unresolved residual must not freeze and dispatch as if classified.

### Decision: Dual-schema lineage (v1 continue vs explicit v2 migrate)

**Choice**: `assertLineage` accepts `schema_version` 1 (4R IDs, digest `review-lineage-v1`, gate key `4r-review-gate`, `LEGACY_V1_REVIEWERS`) or 2 (quality IDs, digest `review-lineage-v2`, `selected_domains`, gate key `quality-review-gate`, `ACTIVE_V2_REVIEWERS`). In-flight v1 with any running/completed lens **must** finish under v1, which requires the four 4R agent/skill files to remain on disk.

```text
ACTIVE_V2_REVIEWERS = review-trust | review-runtime | review-evolution | review-efficiency
LEGACY_V1_REVIEWERS = review-risk | review-reliability | review-resilience | review-readability
```

Legacy reviewers do not participate in v2 routes, are not v2 classifier candidates, and are not selectable by v2 `review-change`. They exist solely to complete `schema_version: 1` lineages. They may be removed only in a future breaking migration when v1 is no longer executable.

`review-correction` is dual-schema: v1 owners ∈ `risk|reliability|resilience|readability`; v2 owners ∈ `trust|runtime|evolution|efficiency`; never both in one lineage.

`migrateLineageTaxonomyV2` is legal only when **all** of these hold:

```text
all selected lenses = pending
all non-selected lenses = skipped
no lens request_id
no lens result
findings = []
findings_digest = null
no pending_operation
no pending_correction
no correction_history
```

Map: `risk→trust`, `reliability∪resilience→runtime`, `readability→evolution`; `efficiency` unselected unless classification is `high-risk`. The v2 lineage MUST bind a predecessor receipt that participates in `review-lineage-v2`:

```yaml
migration:
  kind: taxonomy-v1-to-v2
  predecessor_lineage_id: sha256:...
  predecessor_revision: 0
  predecessor_digest: sha256:...
```

This is a predecessor-bound receipt, not an independent v2 lineage that happens to come from v1.

**Alternatives considered**: Delete 4R executors; always migrate; map completed reliability+resilience results into one runtime lens.

**Rationale**: A started v1 lineage (e.g. risk completed, reliability pending) MUST NOT migrate and MUST NOT continue if its agents are gone. Merging executed lenses would drop one-shot results.

### Decision: Per-capability attribution and blast-radius residue (B5)

**Choice**: Capability units are `input.capabilities`. `capability_scopes` is **explicit attribution authority**, not an optional hint. There is **no** POSIX prefix/segment match on capability id.

```text
capability_scopes present for X  → use the validated mapping
capability_scopes absent for X   → X is behavioral, remains unscoped;
                                   path-derived facts MUST NOT claim attribution to X
```

Validation (fail closed):

- `scope.id` MUST be in `capabilities[]`
- `scope.paths` MUST be a canonical subset of `paths[]`
- duplicate or divergent scopes → invalid evidence
- a path MAY belong to more than one capability if the contract lists it in more than one scope
- a global fact MAY select a domain globally (`selected_domains` includes it) but MUST NOT mark specific capabilities attributed without association evidence

Example: `dependency-change → trust` can yield `selected_domains=[trust]` without attributing capabilities A–D.

Coverage is per capability: global `selected_domains !== []` does not prove attribution. `cross-capability-blast-radius` iff behavioral count `> 3` and ≥1 unattributed. Router residue is **exactly** those unattributed capabilities, each with its own bounded path list. A single unattributed runtime change uses `runtime-code-without-domain-attribution`, not blast radius.

**Alternatives considered**: Count packages; treat any global signal as full coverage; infer scopes from capability-id path segments; send all capabilities to the router.

**Rationale**: B5. Inferred path matching invents attribution and destroys incomplete-coverage detection.

### Decision: Quality KPIs as a CX0-compatible sidecar

**Choice**: `deriveQualityReviewKpis({ gateAudit, phaseCosts, cx0Records })` returns seven KPI envelopes (`available|unavailable`, `source`, `coverage`, `reason_code`) with `formula_version: quality-review-kpis/v1`. Callers: evals / archive reporting. No new persistence file. Do not extend CX0 `METRICS`. KPIs never change routing or archive.

**Alternatives considered**: New JSONL; add KPIs to `scripts/lib/context-measurement.js` required metric set.

**Rationale**: Extending `METRICS` would invalidate every existing CX0 record. A second pipeline is out of scope.

## MUST Scenario Allocation

Every MUST scenario in the seven change-local specs. `T` = taxonomy, `C` = classifier, `G` = gate planner, `L` = lineage, `R` = router skill/contract, `H` = hooks, `K` = KPIs, `E` = evals/fixtures, `Gen` = generator/parity.

### agents

| Scenario | Allocation |
|----------|------------|
| Allowlist includes quality roster | Orchestrator dual-bind: `ACTIVE_V2_REVIEWERS` + `review-change` + `review-correction` for live v2; `LEGACY_V1_REVIEWERS` remain allowlisted **only** for `schema_version == 1` continuation; all ten agents stay `read,search` |
| Retired 4R specialists are not dispatch targets | **Live v2 / quality-domain taxonomy only**: `G`/`L` v2 maps `ACTIVE_V2_REVIEWERS`. Keep four 4R agent/skill dirs as `Keep (legacy compatibility)`. v1 continuation dispatches 4R IDs iff `lineage.schema_version == 1` |
| Efficiency finding stays efficiency-owned | `skills/review-efficiency/SKILL.md` ownership + do-not-flag; `L` freeze owner = lens |
| Cross-domain evidence without mis-ownership | Specialist skills Flag/Do-not-flag; envelope `owner` must match lens or fail closed |
| Mixed taxonomy blocks dispatch | `T.detectMixedTaxonomy`; `G` `blocker_reason: contract-remediation`; archive_allowed false |
| Mixed gate keys in mutable state block dispatch | `T.detectMixedGateKeys`; same fail-closed |
| Malformed router output prevents unsafe dispatch | `C.validateRouterDecision`; `G` `blocker_reason: contract-remediation`; no dispatch |
| Functional verification boundary preserved | `G` skipped unless verify success **and** route lists the **semantically admitted** gate |
| Sufficient classification skips semantic router | `G.run_router=false`; dispatch selected **v2** agents only |
| Ambiguous classification uses residual-only router | `G` per-capability residual; `skills/review-change/SKILL.md`. Valid `ambiguous` after router → `quality-review-ambiguity-unresolved` (no freeze/dispatch) |
| High-risk bypasses semantic router | High-risk short-circuit before ambiguity; four **v2** specialists |
| Union of three domains dispatches three specialists | `C` union after **sufficient** router or classifier; no overflow; `G.dispatch` length 3 |
| Zero-model sufficient path | `G.dispatch=[]`, `status=done`, persist zero-dispatch audit |
| Correction consumes new finding owners | Dual-schema: v2 quality owners; v1 4R owners; never both in one lineage |
| Generated targets select identical domains | `Gen` + `scripts/selective-4r-parity.test.js` (filename kept) |
| Archived 4R evidence stays immutable | No writes under `openspec/changes/archive/**/.4r/` or archived `gates.4r-review-gate` |
| Mutable state requires explicit migration | `L.migrateLineageTaxonomyV2` pristine-guard + receipt; else v1 continue via `LEGACY_V1_REVIEWERS` |

### skills

| Scenario | Allocation |
|----------|------------|
| Evolution rejects style-only findings | `skills/review-evolution/SKILL.md` do-not-flag |
| Efficiency rejects premature optimization | `skills/review-efficiency/SKILL.md` three-way defect/risk/speculation |
| Signal activation does not auto-create finding | Skills + specialist tests: signals ≠ findings |
| Router adds domains from cross-capability residue | Router contract + `C.merge` **only when** `classification_status=sufficient`; reason grammar includes ambiguity code |
| Router adds domains from runtime-code residue | Same; `added_domains` MAY include `runtime` on sufficient |
| Router output without findings | `validateRouterDecision` rejects `findings`/severity; `artifacts: []` |
| Residual router cannot strip deterministic domains | Merge = union in `C`/`G` on sufficient only |
| Residual router cannot overclaim | Skill competence: no exploit/failure claims |
| New specialist clean envelope unchanged | `No findings.` body + empty findings array (existing specialist contract) |
| Target missing quality roster fails parity | Live validators require `ACTIVE_V2_REVIEWERS` only; legacy files MAY emit as non-required copies |
| Validator accepts evolution-owned finding | Correction skill + `L` owner allowlist **for schema v2** |
| Correction rejects unknown domain owner | v2 rejects owner `reliability`; v1 accepts `reliability` and rejects quality IDs |

### routing

| Scenario | Allocation |
|----------|------------|
| Runtime code without signal is ambiguous | `C.evaluateSufficiency` code `runtime-code-without-domain-attribution` |
| Docs-only sufficient with empty selection | `metadata-docs-only` + no signals → `sufficient`, `[]` |
| Four attributed capabilities sufficient without router | Blast-radius false when unattributed=0 **and** those four have validated scopes |
| Four capabilities with two unattributed triggers router residue | Residual `capabilities[]` = those 2 IDs only (per-capability paths) |
| Seven attributed capabilities do not invoke premium router | Same; count is not sufficient to invoke |
| Single unattributed runtime capability uses runtime rule not blast radius | Count `>3` required for blast-radius |
| Metadata-only change completes with zero model calls | `REQ-routing-009` via `G` |
| High-risk selects four domains directly | Override reasons `high-risk-override`; `run_router=false` |
| Mixed classifier and lineage fails closed | `T` + `G`/`L` |
| Both gate keys in mutable state fail closed | `T.detectMixedGateKeys` |
| Legacy v1 state retains 4r identity without reinterpretation | Dual-path `readReviewGate` / `planLineageGate`; `LEGACY_GATES` semantic admission |
| Network retry selects runtime only | Signal map: retry/network → `runtime` only (not efficiency) |
| Signals recorded but not findings | Audit `facts`; specialists must cite code |
| Three domains do not overflow to four | Delete overflow branch; `escalation_reason` always null on v2 |
| High-risk override selects all four | Same override, new IDs |
| Sufficient path persists auditable selection | Persist `gates.quality-review-gate` fields below |
| Invalid router payload fails closed | `validateRouterDecision` → `contract-remediation` (distinct from unresolved ambiguity) |
| Independent slice resolution is monotonic | Existing slice reducer; owners follow lineage schema |
| Genuine cross-slice regression is explicit | Unchanged `impacted_slices` rules |
| Correction escapes genesis | Unchanged path-guard |
| Archive revalidates without reopening review | `validateLineageForGate(..., archive)` read-only |
| Historical 4R archive untouched | Rollout: no archive rewrites |
| Successor preserves predecessor literally | Existing additive generations; v2 digest domain; migrate receipt is a distinct predecessor bind |
| Route gate hook uses Quality Review Gate | Live config + `ACTIVE_GATES` semantic check (not flat `KNOWN_GATES`) |
| Route without gate skips review dispatch | `planReviewGate` `status=skipped` when route omits the **admitted** v2 gate |

### generator

| Scenario | Allocation |
|----------|------------|
| Generated review-dimensions matches source contract | `gatherRuntimeScripts` unchanged inventory; parity tests |
| Generated review-lineage rejects mixed taxonomy | Same generated copy of `T`/`L` |
| Cursor quality specialists are readonly | `scripts/lib/target-profiles/cursor.js` `agentReadonly.agents` = six **active** quality-review agents |
| Retired 4R agents are not required readonly targets | Cursor/Codex **live** validators MUST NOT require `LEGACY_V1_REVIEWERS`. Source files stay. Generated trees MAY emit the four legacy agent files as non-required compatibility copies so plugin upgrades do not strand in-flight v1 reviews |
| Quality review agent TOML missing approval_policy fails | `validate-codex.js` already `review-*`; live tests use `review-trust.toml` |
| Apply/verify sandbox network must be disabled | Unchanged Codex apply/verify rules |
| Configure collects quality review runtime modules | Existing three entries; `review-taxonomy.js` ships as a `require()` of those modules; KPI sidecar is not a generated runtime script |
| models.yaml maps quality specialists | `REQUIRED_REVIEW_AGENTS` = active six; retain four legacy mappings (allowed, not live-required) |

### hooks

| Scenario | Allocation |
|----------|------------|
| Allowlisted quality specialist is recorded identically | JS `derivePhaseKey` + Go `derivePhaseKey` same **six active** names; byte parity |
| Missing optional context uses explicit fallbacks | Unchanged fallbacks |
| A repeated dispatch is marked as a relaunch | Unchanged `{change, phase}` relaunch |
| No active change — skip, no file created | Unchanged |
| Retired 4R agent name is ignored fail-safely | `REQ-hooks-001` unchanged: `review-reliability` → empty phase key, no row. v1 lens **execution** does not depend on phase-cost. Do not change the hooks spec |
| Arbitrary review name is ignored fail-safely | `review-invented` same |
| Estimation or write failure — fail-safe, no crash | Unchanged try/catch |

### orchestrator-evals

| Scenario | Allocation |
|----------|------------|
| Live fixture expects quality gate identity | Replace live `gates: [4r-review-gate]` in `scripts/evals/__fixtures__/**/openspec/config.yaml` and `scripts/evals/safe-export.js` catalog; semantic validator rejects `4r-review-gate` on live/v2 config |
| Historical archived fixture remains valid | Do not rewrite `openspec/changes/archive/**`; eval historical cases keep v1 strings under archive/legacy reader admission |
| Live fixture must not alias legacy gate key | Assertions require `quality-review-gate` unless scenario `legacy_v1: true` |
| Nine golden corpus scenarios (briefing → sandbox) | Preserve `scripts/evals/run.js` + nine fixtures; only route-table copies change |
| Canonical benchmark profile is derived | `safe-export.js` profiles; `phase` host-assumption → `quality-review-gate` |
| Fixed-policy 9/9 publish / reject / smoke / command | `live-driver.js` defect column rename verify/quality-review; no adaptive/CI |

### context-measurement

| Scenario | Allocation |
|----------|------------|
| Zero-model gate is measurable | KPI `zero_model_gate_rate` from gate audit with zero review phase-cost rows |
| Router delta counts semantic additions | `router_delta_rate` when sufficient router `added_domains` ⊈ deterministic set |
| Missing cost data yields unavailable KPI fields | Token KPIs `unavailable` + `host-field-unavailable`; never promote legacy `0` to host-observed |
| CX0 KPIs do not alter routing | `quality-review-kpis.js` has no imports into `G`/`L` |
| Legacy phase-cost data remains readable | Existing readers; sidecar does not rewrite JSONL |
| Quality KPI module reuses existing rows | Inputs = CX0 records + `phase-costs.jsonl` + gate audit only |

## Data Flow

Happy path (sufficient, one domain):

```text
sdd-verify success
    → normalizeReviewEvidence v2 (no raw diff persisted; scopes validated or absent)
    → classifyQualityReview
         classification_status=sufficient
         selected_domains=[runtime]
    → planReviewGate  run_router=false  dispatch=[review-runtime]
    → startReviewLineage v2 (freeze domains)
    → ACTIVE_V2 specialists (parallel-preferred / serial-fallback)
    → freezeFindings (owners=runtime)
    → advisory BLOCKER/CRITICAL surface; WARNING/SUGGESTION record
```

```text
Orchestrator          dimensions.js         gate-state.js          lineage.js           review-change
     |                     |                     |                     |                     |
     | normalizeEvidence   |                     |                     |                     |
     |-------------------->|                     |                     |                     |
     | classifyQuality     |                     |                     |                     |
     |-------------------->|                     |                     |                     |
     | sufficient+[runtime]|                     |                     |                     |
     |                     |    planReviewGate   |                     |                     |
     |---------------------+-------------------->|                     |                     |
     |                     |    run_router=false |                     |                     |
     |                     |    dispatch runtime |                     |                     |
     |    startReviewLineage                     |                     |                     |
     |---------------------+---------------------+-------------------->|                     |
     |    beginLens runtime                      |                     |                     |
     |    (no review-change call)                |                     |          X          |
```

Ambiguous residual router (must not freeze+dispatch while unresolved):

```text
classify → ambiguous (e.g. cross-capability-blast-radius)
    → planReviewGate run_router=true
    → residual.capabilities[] = one entry per unattributed capability
         { id, paths, total_paths, truncated, fact_codes }
    → review-change (residual only; no dropped capability)
    → validateRouterDecision
         malformed → blocker_reason: contract-remediation
                     dispatch=[], archive_allowed=false
         valid + sufficient → union(deterministic, added_domains)
                              freeze lineage → ACTIVE_V2 specialists
         valid + ambiguous → blocker_reason: quality-review-ambiguity-unresolved
                             dispatch=[], archive_allowed=false
                             do not startReviewLineage / do not dispatch
```

v1 continuation (started lineage; no migrate):

```text
readReviewGate → schema_version 1, gates.4r-review-gate only
    → planLineageGate maps selected 4R dimensions → LEGACY_V1_REVIEWERS
    → review-correction owners ∈ 4R set
    → phase-cost still ignores review-risk|reliability|resilience|readability
```

High-risk (no router even if self-review paths):

```text
classification=high-risk → selected=[trust,runtime,evolution,efficiency]
                         → run_router=false
                         → four ACTIVE_V2 specialists
```

Fail closed:

```text
mixed gate keys OR mixed ID sets OR invalid/malformed router
    → status=blocked, blocker_reason=contract-remediation
    → dispatch=[], archive_allowed=false

valid router classification_status=ambiguous
    → status=blocked, blocker_reason=quality-review-ambiguity-unresolved
    → dispatch=[], archive_allowed=false
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `scripts/lib/review-taxonomy.js` | Create | `QUALITY_DOMAINS`, `LEGACY_DIMENSIONS`, `ACTIVE_GATES` / `LEGACY_GATES` / `LEXICAL_GATES`, `ACTIVE_V2_REVIEWERS` / `LEGACY_V1_REVIEWERS`, mixed detectors, context-dependent admission |
| `scripts/lib/quality-review-kpis.js` | Create | Seven KPI derivations; CX0-compatible envelopes |
| `scripts/lib/quality-review-kpis.test.js` | Create | Zero-model, router-delta, unavailable tokens, non-authority |
| `scripts/lib/review-dimensions.js` | Modify | v2 evidence; explicit scopes only; per-capability residual; sufficiency; router validation; remove overflow |
| `scripts/lib/review-gate-state.js` | Modify | v2 key; `run_router`; sufficient vs unresolved-ambiguity vs contract-remediation; v1 dispatch via `LEGACY_V1_REVIEWERS` |
| `scripts/lib/review-lineage.js` | Modify | Dual schema; `selected_domains`; v2 digest includes `migration` receipt; pristine migrate guards |
| `scripts/lib/route-dispatcher.js` | Modify | Split lexical `LEXICAL_GATES` from semantic `ACTIVE_GATES` / `LEGACY_GATES`; live/v2 config rejects `4r-review-gate`; reject both review gates on one route; do not flatten reviewers into one semantic allowlist |
| `scripts/lib/model-resolver.js` | Modify | Require active six; allow (do not unexpected-reject) four legacy mappings |
| `openspec/config.yaml` | Modify | Live route `gates` identity → `quality-review-gate` |
| `skills/_shared/gate-4r-review.md` | Modify | Deterministic-first protocol; dual-schema dispatch (filename kept) |
| `skills/_shared/openspec-convention.md` | Modify | Document v2 `gates.quality-review-gate`; v1 legacy note; no alias |
| `skills/_shared/sdd-phase-common.md` | Modify | Selective-gate examples use v2 key; keep 4R only as legacy. **Do not** add `quality-review-ambiguity-unresolved` as an SDD phase `blocker_type`; it is a gate `blocker_reason` |
| `agents/review-trust.agent.md` | Create | Trust specialist, `tools: ['read', 'search']` |
| `agents/review-runtime.agent.md` | Create | Runtime specialist |
| `agents/review-evolution.agent.md` | Create | Evolution specialist |
| `agents/review-efficiency.agent.md` | Create | Efficiency specialist |
| `agents/review-risk.agent.md` | Keep | Legacy compatibility executor for schema-v1 continuation |
| `agents/review-reliability.agent.md` | Keep | Legacy compatibility executor for schema-v1 continuation |
| `agents/review-resilience.agent.md` | Keep | Legacy compatibility executor for schema-v1 continuation |
| `agents/review-readability.agent.md` | Keep | Legacy compatibility executor for schema-v1 continuation |
| `skills/review-trust/SKILL.md` | Create | Ownership + evidence + do-not-flag |
| `skills/review-runtime/SKILL.md` | Create | Reliability+resilience family |
| `skills/review-evolution/SKILL.md` | Create | Maintainability; style-only rejected |
| `skills/review-efficiency/SKILL.md` | Create | Performance; speculation rejected |
| `skills/review-risk/` | Keep | Legacy v1 skill; not a v2 dispatch target |
| `skills/review-reliability/` | Keep | Legacy v1 skill; not a v2 dispatch target |
| `skills/review-resilience/` | Keep | Legacy v1 skill; not a v2 dispatch target |
| `skills/review-readability/` | Keep | Legacy v1 skill; not a v2 dispatch target |
| `skills/review-change/SKILL.md` | Modify | Residual-only; per-capability residual; new decision keys; sufficient vs ambiguous closed contract |
| `skills/review-correction/SKILL.md` | Modify | Dual-schema owners; never mix sets in one lineage |
| `agents/review-change.agent.md` | Modify | Residual router, no findings; v2 domains only |
| `agents/review-correction.agent.md` | Modify | Dual-schema owner allowlist |
| `agents/sdd-orchestrator.agent.md` | Modify | Dual-bind allowlist; v2 vs v1 dispatch protocol |
| `models.yaml` | Modify | Four quality specialists `default`; keep `review-change: premium`; **retain** four 4R mappings |
| `scripts/lib/target-profiles/cursor.js` | Modify | Readonly **required** set = six active quality-review agents only |
| `scripts/configure/validate-cursor.js` | Modify | Live `REVIEW_AGENTS` = active six; do not require legacy four |
| `scripts/configure/cli.js` | Modify | No extra `SKILL_ENTRY_SCRIPTS` unless BFS cannot reach `review-taxonomy.js`; KPI module stays repo-local; MAY emit legacy agent files as non-required copies |
| `scripts/configure/cli.test.js` | Modify | Roster strings distinguish required vs compatibility |
| `scripts/configure/real-repo.test.js` | Modify | Require quality roster on all targets; legacy 4R MAY still appear as non-required copies |
| `scripts/configure/validate-codex.test.js` | Modify | Live example TOML `review-trust.toml` |
| `scripts/configure/__fixtures__/source/models.yaml` | Modify | Quality specialists **and** retained 4R mappings |
| `scripts/configure/__fixtures__/golden/**` | Modify | Regenerate; do not hand-edit `dist/` |
| `scripts/hooks/subagent-stop.js` | Modify | Phase-cost allowlist = active six only (`REQ-hooks-001` unchanged) |
| `internal/hooks/subagentstop.go` | Modify | Same allowlist (JS/Go parity) |
| `scripts/hooks/subagent-stop.test.js` | Modify | Quality names recorded; retired 4R ignored for phase-cost |
| `internal/hooks/subagentstop_test.go` | Modify | Same |
| `scripts/evals/safe-export.js` | Modify | Live route tables + host-assumption phase name; live catalog must not list `4r-review-gate` |
| `scripts/evals/safe-export.test.js` | Modify | `quality-review-gate` |
| `scripts/evals/__fixtures__/*/repo/openspec/config.yaml` | Modify | Live `gates` arrays |
| `scripts/evals/live-driver.js` | Modify | Defect metrics label quality-review |
| `scripts/review-dimensions.test.js` | Modify | Union, scoped vs unscoped attribution, no POSIX inference, per-capability residual, no overflow |
| `scripts/review-gate-state.test.js` | Modify | Router skip/invoke; sufficient merge vs ambiguous unresolved; mixed keys; v1 legacy dispatch |
| `scripts/review-lineage.test.js` | Modify | v2 owners; mixed fail-closed; migrate receipt in digest; each failed precondition |
| `scripts/review-lineage-o4-migration.test.js` | Modify | Keep v1 fixture; add v2 migrate/continue cases — **do not rewrite** `scripts/fixtures/review-lineage/o4-2-gen4-*` 4R bytes except additive tests |
| `scripts/selective-4r-parity.test.js` | Modify | Overflow mutations → union/ambiguity mutations; filename kept |
| `scripts/review-change-contract.test.js` | Modify | New decision contract + per-capability residual notes |
| `scripts/review-correction-contract.test.js` | Modify | Dual-schema owners |
| `scripts/model-tier-contract.test.js` | Modify | Require `review-trust` (active); keep `review-risk` as allowed legacy |
| `scripts/lib/target-transform.test.js` | Modify | Readonly / Codex **required** examples use quality agent names |
| `scripts/lib/context-measurement.js` | Unchanged | Closed `METRICS` set; KPIs live in sidecar |
| `rules/sdd-common.instructions.md` | Modify | Deterministic-first; v2 gate key; dual-schema continuation |
| `rules/sdd-openspec.instructions.md` | Modify | Persist `gates.quality-review-gate`; legacy v1 note |
| `docs/sdd-routing.md` | Modify | Active gate identity |
| `docs/target-capabilities.md` | Modify | Replace live “4R” specialist wording; mention v1 compatibility executors |
| `docs/roadmaps/harness-evolution.md` | Modify | Active architecture note only; do not rewrite historical 4R closures |
| `docs/sdd-lifecycle-hooks.md` | Modify | Precedent name → Quality Review Gate |
| `README.md` | Modify | Gate bullet |
| `openwiki/agents-skills/agents-and-skills.md` | Modify | Live roster diagram (v2); do not claim 4R agents are gone |
| `openspec/changes/archive/**` | Unchanged | Immutable |
| `openspec/specs/quality-gates/` | Unchanged | Verify-policy, not this gate |
| K6d paths | Unchanged | Out of scope |

`scripts/fixtures/review-lineage/**` v1 JSON/YAML remain 4R bytes. New v2 fixtures MAY be added beside them.

## Interfaces / Contracts

Canonical IDs:

```js
QUALITY_DOMAINS = ["trust", "runtime", "evolution", "efficiency"] // frozen v2 order
LEGACY_DIMENSIONS = ["risk", "reliability", "resilience", "readability"]

ACTIVE_V2_REVIEWERS = {
  trust: "review-trust",
  runtime: "review-runtime",
  evolution: "review-evolution",
  efficiency: "review-efficiency",
}
LEGACY_V1_REVIEWERS = {
  risk: "review-risk",
  reliability: "review-reliability",
  resilience: "review-resilience",
  readability: "review-readability",
}

ACTIVE_GATES  = [..., "quality-review-gate"] // does not include 4r-review-gate
LEGACY_GATES  = [..., "4r-review-gate"]
LEXICAL_GATES = ACTIVE_GATES ∪ LEGACY_GATES  // parse / tokenize only
```

Semantic admission for gates:

```text
live/v2 config             admit ACTIVE_GATES; reject 4r-review-gate
schema-v1 persisted state  admit LEGACY_GATES; reject quality-review-gate on that object
legacy/archive reader      admit 4r-review-gate
both keys in one mutable state → fail closed
```

Recognition of a legacy identifier does not authorize its use in a v2 live route.

Evidence input v2 (orchestrator → `normalizeReviewEvidence`):

```js
{
  classification: "normal" | "high-risk",
  verify: { status: "success", findings: [] },
  diff: "<unified diff>",
  paths: string[],
  capabilities: string[],
  capability_scopes: [{ id, paths }] | undefined, // explicit authority; no inference
  dependencies: string[],
  operationTypes: ["add"|"modify"|"delete"|"rename"],
  designRisks: [{ code, detail }]
}
```

Scope validation: each `scope.id` ∈ `capabilities[]`; each `scope.paths` is a canonical subset of `paths[]`; duplicate or divergent scopes fail closed. Absent scope for capability X ⇒ X is behavioral and unscoped; path-derived facts MUST NOT list X in `attributed_capabilities`. A global fact MAY add a domain to `selected_domains` without attributing X.

Normalized evidence adds `schema_version: 2`, fingerprint, `sources.facts[].attributed_capabilities` (only from validated scopes or explicit fact association), and `sources.capability_coverage[]` `{ id, behavioral, scoped, attributed_domains, fact_codes }`. Raw diff is never persisted.

Classifier output (no model):

```js
{
  schema_version: 2,
  classification,                      // normal | high-risk
  classification_status: "sufficient" | "ambiguous",
  selected_domains: string[],          // canonical order; may be non-empty while some capabilities stay unattributed
  ambiguity_reasons: string[],         // empty iff sufficient
  residual_evidence: {                 // omitted or empty on sufficient
    codes: string[],
    selected_domains: string[],
    capabilities: [
      {
        id: string,          // unattributed capability
        paths: string[],     // deterministically bounded (per capability, deterministic order)
        total_paths: number,
        truncated: boolean,
        fact_codes: string[]
      }
    ]
  },
  domains: { [id]: { selected, reasons } },
  capability_coverage: [...],
  evidence: { fingerprint, schema_version, sources },
  router: null
}
```

No residual capability is silently dropped. Path bounding is per capability; when clipped, `truncated=true` and `total_paths` records the unclipped count.

Closed ambiguity codes (accumulate, canonical sort): `runtime-code-without-domain-attribution`, `unsupported-residual-evidence`, `classification-conflict`, `cross-capability-blast-radius`, `public-kernel-contract-unattributed`, `self-review-infrastructure`, `generated-target-semantic-risk`.

High-risk: force all four domains, `classification_status=sufficient`, skip residual/router even if codes would match.

Router decision (only when invoked; v2 domains only):

```js
{
  classification_status: "sufficient" | "ambiguous",
  added_domains: string[],             // subset of QUALITY_DOMAINS, canonical, unique
  reason: "ambiguity=<codes>;added=<none|ids>"
}
```

Exact keys. Reject findings, severity, extra suffixes, paths, secrets, 4R IDs. `reason` codes ⊆ closed set. Envelope `artifacts: []`.

`planReviewGate` after router:

```text
invalid/malformed     → { status: "blocked", run_router: false, dispatch: [],
                          archive_allowed: false, blocker_reason: "contract-remediation" }
valid + sufficient    → { dispatch: ACTIVE_V2 agents for union(deterministic, added) }
valid + ambiguous     → { status: "blocked", dispatch: [], archive_allowed: false,
                          blocker_reason: "quality-review-ambiguity-unresolved" }
```

`planReviewGate` / `planLineageGate` on schema v1: `dispatch` uses `LEGACY_V1_REVIEWERS` only.

v2 gate audit persist (`gates.quality-review-gate`): `status`, `schema_version: 2`, `classification`, `classification_status`, `selected_domains`, `capability_coverage`, `ambiguity_reasons`, evidence fingerprint/sources, optional `router`, per-domain reasons, `lineage`, optional `blocker_reason`. No `generalist`, no `dimensions`, no `escalation_reason`.

Migration receipt (v2 lineage only, when produced by `migrateLineageTaxonomyV2`):

```yaml
migration:
  kind: taxonomy-v1-to-v2
  predecessor_lineage_id: sha256:...
  predecessor_revision: 0
  predecessor_digest: sha256:...
```

`migration` is hashed into `review-lineage-v2`. Ordinary new v2 lineages omit `migration`.

Signal families (activation; not findings). Existing extractors remapped; new lexical/path facts added in the same `diffFacts` style:

| Domain | Fact codes (non-exhaustive) |
|--------|-----------------------------|
| trust | `auth-boundary-change`, `permission-change`, `credential-handling`, `secret-handling`, `process-execution`, `dependency-trust-change`, `security-policy-change`, `verify-trust`, `design-trust` |
| runtime | `network-flow`, `error-flow`, `retry-flow`, `timeout-flow`, `concurrency-flow`, `persistent-state-mutation`, `partial-failure-path`, `public-input-boundary`, `metadata-runtime`, `verify-runtime` |
| evolution | `structural-complexity`, `public-contract-change`, `architectural-boundary-change`, `generated-contract-change`, `configuration-contract-change`, `verify-evolution` |
| efficiency | `loop-io`, `repeated-network-flow`, `unbounded-collection`, `blocking-io`, `whole-tree-scan`, `performance-sensitive-path` |

`network-flow` / `error-flow` map **only** to `runtime` (removes reliability∩resilience overlap). `process-execution` maps to `trust` only. These mappings select domains; they do not attribute capabilities unless a validated scope associates the fact’s subjects.

Self-review path prefixes (ambiguity): `scripts/lib/review-*.js`, `skills/review-*/`, `agents/review-*.agent.md`, `skills/_shared/gate-4r-review.md`, `scripts/hooks/subagent-stop.js`, `internal/hooks/subagentstop.go`.

Finding envelope (specialists): existing fields plus `owner` matching the executing lens’s schema set. Severities unchanged.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Signals; union vs overflow-removed; sufficiency matrix (docs, runtime-no-signal, 4 scoped+attributed, 4 with 2 unscoped, 7 attributed, single runtime, high-risk); **unscoped vs scoped** (no POSIX inference; global `dependency-change` selects trust without attributing A–D); per-capability residual (`truncated`/`total_paths`, no dropped id); router validate; sufficient merge vs valid-ambiguous block; mixed IDs/keys; live config rejects `4r-review-gate`; v1 continue vs pristine v2 migrate (receipt in digest; each failed precondition); KPI envelopes | `node --test` on existing `scripts/review-*.test.js` plus `quality-review-kpis.test.js`; `testing.tdd_mode: focused` |
| Unit | Hooks allowlist JS/Go; retired 4R ignored for **phase-cost** only | `subagent-stop.test.js` + `subagentstop_test.go` + parity fixtures |
| Contract | Agent/skill prose: residual router, no findings, dual-schema correction, clean `No findings.` | `review-change-contract.test.js`, `review-correction-contract.test.js` |
| Integration | Configure collect + required quality roster + optional legacy copies + Cursor readonly (active six) + Codex `approval_policy` + models.yaml active+legacy | `cli.test.js`, `real-repo.test.js`, `validate-cursor.js`, `validate-codex.test.js`, `model-tier-contract.test.js` |
| Parity | Generated copies of classifier/reducer/lineage match source behavior; mixed taxonomy fail-closed | `selective-4r-parity.test.js` (rewrite overflow mutants) |
| Evals | Live fixtures assert `quality-review-gate`; corpus of 9 goldens unchanged in intent; historical v1 strings only when marked legacy | `scripts/evals/*.test.js` |
| Non-goals | Do not invent 80% coverage; do not rewrite archived `.4r` tests as quality IDs | |

TDD: focused, not strict. RED on new classifier/KPI/migration-receipt cases before production edits.

## Migration / Rollout

Internal apply order (not shippable mixed **taxonomy** states; v1 executors stay):

1. Taxonomy constants (`ACTIVE_*` / `LEGACY_*`) + new domain skills/agents + unique ownership tables. Keep 4R agent/skill files.
2. Evidence v2, explicit scopes, sufficiency, union, overflow removal, per-capability residual.
3. `planReviewGate` deterministic-first + residual router + unresolved-ambiguity block.
4. Roster: models (both sets), orchestrator dual-bind, hooks JS/Go phase-cost (active six only), profiles, live validators, goldens. Emit legacy agents as non-required generated copies.
5. Lineage dual-schema, lexical vs semantic gate admission, live config/evals key rename, dual-schema correction, mixed fail-closed, migrate receipt.
6. KPI sidecar + eval defect labels.

Before merge: one coherent v2 **live** tree plus retained v1 executors. Runtime mixed taxonomy or mixed gate keys fail closed.

In-flight mutable v1: continue to terminal on `4r-review-gate` via `LEGACY_V1_REVIEWERS` **or** explicit pristine `migrateLineageTaxonomyV2` with hashed predecessor receipt. Rollback = revert the feature branch as one unit; never rewrite archives.

Live config and live goldens use `quality-review-gate` only. `LEXICAL_GATES` may still tokenize `4r-review-gate` for archive/v1 readers. Recognition does not authorize that name on a v2 live route.

## Open Questions

None. A4, B5, delivery `exception-ok`, and “no new spec domain / CX0 reuse” are already accepted. Signal regex catalogs are pinned by tests during apply, not product forks.
