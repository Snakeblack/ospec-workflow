# SDD Routing

Live routes in `openspec/config.yaml` use **`quality-review-gate`** (domains `trust`, `runtime`, `evolution`, `efficiency`) after successful `sdd-verify`. Legacy **`4r-review-gate`** remains valid only for in-flight `schema_version: 1` lineages and archived changes; mutable state with both gate keys fails closed.

The SDD orchestrator selects a **route** for every change. A route is a named combination of phases and gates that maps to a specific user intent. Routes are declared in `openspec/config.yaml::routing` and evaluated top-to-bottom; the **first matching route wins**.

## Route, Phase, and Gate — Distinctions

| Concept | What it is | Examples |
|---------|-----------|---------|
| **Route** | A named workflow profile: ordered phases + hook-point gates. Represents a distinct user intent. | `standard`, `lite`, `debug`, `brownfield`, `foundation`, `federated` |
| **Phase** | A delegated SDD sub-agent that produces a single artifact. Phases run in declared order inside a route. | `sdd-propose`, `sdd-apply`, `sdd-verify` |
| **Gate** | A check or advisory that runs at a specific hook point within a route. Does NOT produce a main artifact; records its outcome in `state.yaml.gates`. | `clarify`, `quality-review-gate` (live), `4r-review-gate` (legacy v1) |

A route is a **distinct user intent**, not an implementation detail. Do not add a route because a phase needs a configuration toggle — use a gate or a phase option instead.

## The Six Routes (first-match-wins order)

| # | Name | Classification | Key Conditions | Phases | Gates | Cost |
|---|------|----------------|----------------|--------|-------|------|
| 1 | `foundation` | trivial, small, normal, high-risk | `project.status: empty` OR `architecture: none-detected` | `[sdd-foundation]` | `[]` | medium |
| 2 | `federated` | trivial, small, normal, high-risk | `artifact_store.backend: workspace-federated` | `[sdd-workspace, sdd-propose, sdd-spec, sdd-design, sdd-tasks, sdd-apply, sdd-verify, sdd-archive]` | `[impact, clarify]` | high |
| 3 | `debug` | small, normal | Explicit debug intent only (never auto-routed) | `[sdd-explore, sdd-apply]` | `[quality-review-gate]` | low |
| 4 | `brownfield` | trivial, small, normal, high-risk | `baseline.status: pending` OR empty specs with code present | `[sdd-baseline]` | `[brownfield-advisory]` | medium |
| 5 | `standard` | normal, high-risk | `project.status: active`; classification normal/high-risk | `[sdd-propose, sdd-spec, sdd-design, sdd-tasks, sdd-apply, sdd-verify, sdd-archive]` | `[clarify, quality-review-gate]` | high |
| 6 | `lite` | trivial, small | `project.status: active`; classification trivial/small | `[sdd-propose, sdd-tasks, sdd-apply, sdd-verify, sdd-archive]` | `[]` | low |

Notes:
- **foundation** stops after `sdd-foundation` and hands back. It does NOT auto-chain into standard SDD.
- **debug** is explicit-only: the user MUST signal debug intent ("debug this", "add logs", "quick fix"). The orchestrator MUST NOT auto-route from classification signals alone.
- **brownfield** is an advisory preface: the `brownfield-advisory` gate runs first; `sdd-baseline` runs only on user consent. Then re-routes to the underlying change route.
- **standard** lists `quality-review-gate` in `gates` to ENABLE the Quality Review Gate after a successful `sdd-verify`; removing it disables the gate. `4r-review-gate` is legacy schema-v1 continuation only.
- **lite** omits `clarify`; the gate is SKIPPED when route=lite AND class∈{trivial,small} AND no `residual_ambiguity` from `sdd-spec`.

## Conditions Evaluation Order & Eligibility Filtering

The dispatcher (`scripts/lib/route-dispatcher.js::selectRoute`) evaluates routes using pre-filtering and deterministic precedence:

1. **Signal Normalization**: Harmonizes `classification` and `change.classification`. If both exist and differ, a `ClassificationConflictError` is thrown (fail-closed).
2. **K1 Risk Floor Mapping**: Evaluates impact risk floors (`FLOOR_GUARANTEES`). Triggers like `auth_security`, `data_migration`, and `public_api` guarantee a minimum tier of `standard`, preventing bypass by `explicit_hotfix_intent` or small diff size.
3. **Route Eligibility Filtering**: Filters candidates via `isRouteEligible(route, resolvedClassification, floorGuarantees)`. Routes whose metadata classification does not encompass the change classification or violate floor guarantees are excluded before checking conditions (preventing `standard` from shadowing `lite` on small active changes).
4. **Contextual Route Precedence**: Contextual routes (`foundation`, `federated`, `brownfield`) are evaluated first. If conditions match, they take precedence regardless of classification size.
5. **Declared Order Matching**: Remaining eligible routes are evaluated in their declared order; the first matching route wins.
6. **Continuation Invariance**: In mid-flight changes (`persistedRoute`), the route decision is locked. If emergent evidence introduces a floor violation against the active route, dispatch deterministically returns `status: "blocked"` with `blocker_type: "needs_user_decision"` rather than silently changing or downgrading routes.

## Quality Review Gate Hook Points

The live `quality-review-gate` dispatches quality-domain specialists (`trust`, `runtime`, `evolution`, `efficiency`). High-risk selects all four and skips `review-change`. `4r-review-gate` remains valid only for in-flight schema-v1 lineages. It runs at different points depending on the route:

| Route | Hook point | What happens after |
|-------|-----------|-------------------|
| `debug` | After `sdd-apply` completes | Route closes; no `sdd-verify` |
| `standard` | After `sdd-verify` returns `success` (when `gates` includes `quality-review-gate`) | Route closes; archive proceeds |

A `BLOCKER` or `CRITICAL` finding MUST be surfaced to the user via `vscode/askQuestions` before the route closes. The gate is **advisory-only** by default: it does NOT auto-halt route execution. The policy is `on_blocker: advisory`; a future `gate_policy.quality-review.on_blocker: halt` config field can change this without code changes.

## Supported `parseRoutingTable` YAML Subset

The `routing:` block parser (`scripts/lib/route-dispatcher.js::parseRoutingTable`) supports a constrained subset of YAML. Authors MUST stay within this subset.

### Supported constructs

**Scalar fields** (string values):
```yaml
    name: standard
    description: "Full SDD for normal/high-risk changes."
    cost: high
```

**Inline arrays** (phases, gates, classification, tags):
```yaml
    phases: [sdd-propose, sdd-spec, sdd-apply]
    gates: [clarify, quality-review-gate]
    classification: [normal, high-risk]
    gates: []
```

**Block sequences** (alternative to inline arrays):
```yaml
    phases:
      - sdd-propose
      - sdd-spec
      - sdd-apply
```

**Nested `conditions:` map** (key-value pairs, keys may contain dots):
```yaml
    conditions:
      project.status: active
      artifact_store.backend: openspec
```

**Comments and blank lines** — ignored anywhere in the block:
```yaml
  # This is a comment — ignored by the parser
  - name: standard

    classification: normal   # trailing comment — ignored
```

### NOT supported (will be silently ignored or cause unexpected parse results)

- Multi-line scalar values (`|` and `>` block scalars)
- Nested sequences inside `conditions:`
- Anchors and aliases (`&anchor`, `*alias`)
- Boolean values as scalars (`true`/`false` are parsed as strings)
- Numeric values (parsed as strings)
- General YAML multi-document (`---`)

## Dumping-Ground Criteria

A route MUST represent a **distinct user intent**, not an implementation detail or a configuration variant.

Valid reason to add a route:
- The intent has a fundamentally different phase set (e.g., `debug` skips spec/design entirely)
- The intent has a different risk/cost profile that affects gate selection
- The intent has a specific trigger condition that meaningfully changes the workflow

Invalid reasons:
- A phase needs a slightly different configuration flag
- You want to skip one optional phase for a subset of changes (use a gate condition instead)
- Two routes would have identical phase/gate lists with only different conditions

The six routes defined in v1 were designed to cover all real workflow intents without overlap.
