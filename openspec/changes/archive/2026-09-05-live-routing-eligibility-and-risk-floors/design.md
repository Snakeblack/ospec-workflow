# Design: Live Routing Eligibility and Risk Floors

## Technical Approach

This design addresses the defects identified in `docs/architecture/harness-proportionality.md` (roadmap item PP1) where active repositories (`project.status: active`) unconditionally select `standard`, shadowing `lite` even for changes classified as `trivial` or `small`. It also bridges the K1 impact risk floors (`critical`, `planned`, `bounded`, `repair`, `direct`) from `scripts/lib/change-classification.js` into live route dispatch, ensuring that small sizing or `hotfix` urgency cannot bypass critical security or data integrity guarantees.

The technical approach integrates four cooperating mechanisms:
1. **Signal Normalization and Conflict Resolution**: Explicitly reconcile `ctx.classification` and `ctx["change.classification"]`. If both signals are present and disagree, fail closed immediately with a deterministic conflict error.
2. **Metadata-Based Route Eligibility Filtering**: Filter candidate routes by their declared `route.classification` against the resolved change classification before evaluating route `conditions`. In active projects, this disqualifies `standard` (`[normal, high-risk]`) for `trivial` or `small` changes, allowing `lite` to be selected.
3. **K1 Impact Risk Floor Live Dispatch Enforcement**: Connect evidence-driven risk floors (`auth_security`, `data_migration`, `public_api`) to live dispatch. When an impact floor establishes higher assurance obligations, candidate routes that do not meet the minimum tier (`lite`, `hotfix`, `repair`, `direct` for `critical` or `planned`) are disqualified, and the route elevates to `standard` (or equivalent full SDD route).
4. **Contextual Priority and Table Order Integrity**: Retain priority for contextual routes (`foundation`, `federated`, `brownfield`) regardless of change size. Within the eligible set, respect declared route ordering in `openspec/config.yaml`.
5. **Continuation Decision Invariance**: When resuming an in-flight session, preserve the route recorded in `openspec/changes/{change-name}/state.yaml`. Prevent silent recalculation or downgrades. If newly discovered impact evidence violates the active route's risk floor, halt execution with an explicit user decision blocker gate.

---

## Architecture Decisions

| Decision | Choice | Trade-off / Alternatives Considered | Rationale |
|---|---|---|---|
| **ADR-001: Signal Normalization & Conflict Handling** | Fail closed with `ClassificationConflictError` on mismatch between `ctx.classification` and `ctx["change.classification"]`. | Alternative: Arbitrary precedence (e.g. `change.classification` overrides `classification`). Rejected: Silent overrides mask caller errors or contradictory intent, introducing security bypasses. | Deterministic fail-closed behavior ensures inconsistent dispatch inputs are detected before any route executes. |
| **ADR-002: Pre-Evaluation Route Eligibility Filtering** | Filter candidate routes against `route.classification` before evaluating `route.conditions`. | Alternative: Simple YAML reordering (moving `lite` above `standard`). Rejected: Does not solve `trivial` changes, breaks custom tables, and allows `lite` to match normal changes if conditions overlap. | Decouples route classification semantics from arbitrary condition keys and eliminates shadowing cleanly across all table layouts. |
| **ADR-003: Bridging K1 Impact Floors to Live Dispatch** | Map K1 floors (`critical`, `planned`) to live route disqualifications and elevate to full SDD (`standard`). | Alternative: Advisory warnings only, permitting `hotfix` on auth/migration. Rejected: Violates the core harness invariant that security and migration floors are non-degradable by sizing or intent. | Enforces non-degradable assurance tiers for critical surfaces while allowing low-risk changes to utilize `lite`. |
| **ADR-004: Continuation Route Invariance & Blocker Gate** | Lock in `state.yaml` route on resume; halt with `needs_user_decision` blocker gate if late-discovered evidence violates floor. | Alternative: Dynamic re-dispatch on resume, or silent route substitution. Rejected: Silent re-dispatch invalidates previous phase artifacts and disrupts review lineage. | Preserves idempotent execution and workflow stability across multi-session continuations. |

### Decision: ADR-001 — Deterministic Signal Normalization and Fail-Closed Conflict Handling

- **Choice**: When both `ctx.classification` and `ctx["change.classification"]` are present, verify equality. If equal, proceed with the resolved classification. If they differ, immediately fail closed by throwing a deterministic `ClassificationConflictError`.
- **Alternatives considered**:
  1. *Implicit precedence*: Give precedence to `change.classification` (or `ctx.classification`). Rejected because silent resolution masks conflicting orchestration signals.
  2. *Interactive prompt*: Prompt the user on conflict during classification. Rejected because `route-dispatcher.js` is a pure functional library with no interactive side effects.
- **Rationale**: Classification is the primary selector for workflow assurance. A conflict represents an unresolvable contradiction in runtime state that must not proceed silently.
- **Evidence and consequences**: Adheres to `specs/routing/spec.md` §REQ-routing-012. Upstream callers must harmonize context before invocation.

### Decision: ADR-002 — Pre-Evaluation Route Eligibility Filtering via Route Metadata

- **Choice**: Before `matchConditions` is invoked for a candidate route, check whether the resolved change classification is contained within the route's declared `classification` (coerced to a list). If not, the route is marked ineligible and skipped.
- **Alternatives considered**:
  1. *Reorder routes in YAML only*: Moving `lite` before `standard` in `config.yaml`. Rejected because `standard` would still match if `lite` conditions fail, and `lite` would shadow `standard` if conditions are generic.
  2. *Hardcoded route name heuristics*: Special-casing `if (name === "standard")`. Rejected because it destroys custom route support and table configurability.
- **Rationale**: The route table schema already declares `classification: [normal, high-risk]` on routes. Using this metadata to gate eligibility aligns declarative specification with runtime behavior.
- **Evidence and consequences**: Solves the core diagnosis in `docs/architecture/harness-proportionality.md`. Allows `lite` to be safely selected in active repos.

### Decision: ADR-003 — Bridging K1 Impact Risk Floors to Live Route Dispatch

- **Choice**: Export deterministic floor guarantee mappings from `scripts/lib/change-classification.js` (`FLOOR_GUARANTEES`) and evaluate impact evidence in `route-dispatcher.js`. When a floor is `critical` or `planned`, routes omitting specification or design (`lite`, `hotfix`, `repair`, `direct`) are ineligible, elevating route selection to `standard`.
- **Alternatives considered**:
  1. *Dual enum duplication*: Copying K1 terms (`critical`, `planned`) into legacy `KNOWN_CLASSES`. Rejected because K1 risk tiers and legacy workflow sizes represent distinct dimensions.
  2. *Advisory warnings*: Allowing `hotfix` with an advisory warning when modifying auth code. Rejected by REQ-change-classification-003: hard floors must not be degradable by intent or diff size.
- **Rationale**: Small diffs in security or migration surfaces carry existential risk. A 2-line auth change requires full SDD verification, not an unverified emergency patch.
- **Evidence and consequences**: Conforms to `specs/change-classification/spec.md` §REQ-change-classification-004 and `specs/routing/spec.md` §REQ-routing-013.

### Decision: ADR-004 — Continuation Decision Invariance and Blocker Gate

- **Choice**: When resuming a change session with existing `route.actual_route` in `state.yaml`, do not re-run routing table evaluation. If newly discovered impact evidence (e.g. during `sdd-apply`) violates the floor of `actual_route`, halt execution with a blocking decision gate.
- **Alternatives considered**:
  1. *Full re-evaluation on resume*: Re-evaluating routes whenever `sdd-orchestrator` resumes. Rejected because completed tasks and phases would mismatch the newly selected route.
  2. *Silent route elevation*: Automatically mutating `state.yaml` route without user confirmation. Rejected because route elevation changes the required phase contract and artifacts.
- **Rationale**: Workflow continuation requires invariant state. Scope expansion during execution must be transparently escalated to the operator.
- **Evidence and consequences**: Conforms to `specs/routing/spec.md` §REQ-routing-014.

---

## Data Flow

```text
  Context Signals (ctx)
  [ctx.classification, ctx["change.classification"], ctx.impact, ctx.project.status]
                           │
                           ▼
          ┌──────────────────────────────────┐
          │  normalizeClassificationSignals  │
          │      (route-dispatcher.js)       │
          └──────────────────────────────────┘
              │                          │
        (Conflicting?)             (Normalized)
              │                          │
        [FAIL CLOSED]                    ▼
  ClassificationConflictError   ┌──────────────────────────────────┐
                                │        resolveRiskFloor          │
                                │   (change-classification.js)     │
                                └──────────────────────────────────┘
                                                 │
                                           [Floor & Tier]
                                                 │
                                                 ▼
                                ┌──────────────────────────────────┐
                                │   Continuation Invariance Gate   │
                                │    (Check persisted route)       │
                                └──────────────────────────────────┘
                                      │                     │
                                (Persisted & Valid)   (Floor Violated)
                                      │                     │
                               [Return Locked Route]  [HALT BLOCKER]
                                                            │
                                                     (Fresh Start)
                                                            ▼
                                ┌──────────────────────────────────┐
                                │   Contextual Routes Precedence   │
                                │  (foundation, federated, brown)  │
                                └──────────────────────────────────┘
                                      │                     │
                                  (Matched)            (No Match)
                                      │                     │
                                [Select Route]              ▼
                                                ┌──────────────────────────────┐
                                                │   Filter Eligible Routes     │
                                                │  (Classification + Floors)   │
                                                └──────────────────────────────┘
                                                               │
                                                               ▼
                                                ┌──────────────────────────────┐
                                                │   First-Match Evaluation     │
                                                │      (matchConditions)       │
                                                └──────────────────────────────┘
                                                               │
                                                               ▼
                                                        [Dispatch Route]
```

### Ownership and Boundaries
- `scripts/lib/change-classification.js`: Owns the impact floor definition (`HARD_FLOORS`), floor guarantee mappings (`FLOOR_GUARANTEES`), and evidence classification logic.
- `scripts/lib/route-dispatcher.js`: Owns context signal normalization, route eligibility filtering, table parsing, condition matching, and deterministic route selection. Pure module with zero I/O.
- `openspec/config.yaml`: Canonical declarative configuration specifying declared route order, classification metadata, conditions, phases, and gates.
- `agents/sdd-orchestrator.agent.md` & `state.yaml`: Owns persistence of the selected route, enforcement of continuation invariance, and presentation of blocker gates on late floor violation.

---

## File Changes

| File | Action | Description |
|---|---|---|
| `scripts/lib/change-classification.js` | Modify | Define and export `FLOOR_GUARANTEES` and `resolveFloorGuarantees(floor)` mapping K1 floors to required assurance tiers and prohibited routes. |
| `scripts/lib/route-dispatcher.js` | Modify | Add `normalizeClassificationSignals`, `isRouteEligible`, `resolveRiskFloor`, and `selectRoute` (aliased as `dispatchRoute`); update `classifyChange` with signal normalization. |
| `openspec/config.yaml` | Modify | Update `routing:` block: broaden classification for contextual routes (`foundation`, `federated`, `brownfield`) to `[trivial, small, normal, high-risk]`; update `lite` condition to `project.status: active`. |
| `scripts/lib/route-dispatcher.test.js` | Modify | Add unit tests covering signal normalization, conflict fail-closed, metadata eligibility filtering, K1 floor elevation, contextual precedence, and custom table ordering. |
| `scripts/configure/real-repo.test.js` | Modify | Add integration tests verifying live routing selection against `openspec/config.yaml` for `lite` in active repos, risk floor blocks, and continuation stability. |

---

## Interfaces / Contracts

### 1. `scripts/lib/change-classification.js`

```javascript
/**
 * Guarantee tiers and ineligible routes per K1 impact floor.
 */
const FLOOR_GUARANTEES = Object.freeze({
  critical: Object.freeze({
    minTier: "full-sdd",
    ineligibleRoutes: Object.freeze(["lite", "hotfix", "repair", "direct"]),
    requiredPhases: Object.freeze([
      "sdd-propose", "sdd-spec", "sdd-design", "sdd-tasks",
      "sdd-apply", "sdd-verify", "sdd-archive"
    ]),
    fallbackRoute: "standard",
  }),
  planned: Object.freeze({
    minTier: "spec-design",
    ineligibleRoutes: Object.freeze(["lite", "hotfix", "repair", "direct"]),
    requiredPhases: Object.freeze(["sdd-spec", "sdd-design"]),
    fallbackRoute: "standard",
  }),
  bounded: Object.freeze({
    minTier: "bounded",
    ineligibleRoutes: Object.freeze([]),
    requiredPhases: Object.freeze([
      "sdd-propose", "sdd-tasks", "sdd-apply", "sdd-verify", "sdd-archive"
    ]),
    fallbackRoute: null,
  }),
  repair: Object.freeze({
    minTier: "repair",
    ineligibleRoutes: Object.freeze([]),
    requiredPhases: Object.freeze(["sdd-explore", "sdd-tasks", "sdd-apply", "sdd-verify", "sdd-archive"]),
    fallbackRoute: null,
  }),
  direct: Object.freeze({
    minTier: "direct",
    ineligibleRoutes: Object.freeze([]),
    requiredPhases: Object.freeze([]),
    fallbackRoute: null,
  }),
});

/**
 * Returns the guarantee specification for a given risk floor.
 * @param {string} floor - "critical" | "planned" | "bounded" | "repair" | "direct"
 * @returns {object} Floor guarantee record
 */
function resolveFloorGuarantees(floor) {
  return FLOOR_GUARANTEES[floor] || FLOOR_GUARANTEES.bounded;
}
```

### 2. `scripts/lib/route-dispatcher.js`

```javascript
/**
 * Normalizes classification signals between ctx.classification and ctx["change.classification"].
 * Throws an Error with code ERR_CLASSIFICATION_CONFLICT if both are present and differ.
 *
 * @param {object} ctx - Caller context
 * @returns {{ resolvedClassification: string|null, normalizedCtx: object }}
 */
function normalizeClassificationSignals(ctx) {
  if (ctx === null || typeof ctx !== "object") {
    return { resolvedClassification: null, normalizedCtx: {} };
  }

  const c1 = ctx.classification;
  const c2 = ctx["change.classification"];

  const hasC1 = typeof c1 === "string" && c1.trim() !== "";
  const hasC2 = typeof c2 === "string" && c2.trim() !== "";

  if (hasC1 && hasC2 && c1.trim() !== c2.trim()) {
    const err = new Error(
      `Classification conflict: 'ctx.classification' ('${c1}') and 'ctx["change.classification"]' ('${c2}') do not match.`
    );
    err.code = "ERR_CLASSIFICATION_CONFLICT";
    throw err;
  }

  const resolved = hasC1 ? c1.trim() : hasC2 ? c2.trim() : null;
  const normalizedCtx = { ...ctx };

  if (resolved !== null) {
    normalizedCtx.classification = resolved;
    normalizedCtx["change.classification"] = resolved;
  }

  return { resolvedClassification: resolved, normalizedCtx };
}

/**
 * Checks whether a candidate route is eligible for a given change classification and floor.
 *
 * @param {object} route - Parsed route object from routing table
 * @param {string|null} resolvedClassification - Resolved classification (e.g. "small")
 * @param {object} floorGuarantees - Result from resolveFloorGuarantees(floor)
 * @returns {boolean}
 */
function isRouteEligible(route, resolvedClassification, floorGuarantees) {
  if (!route || typeof route !== "object") return false;

  // 1. Classification metadata filtering
  if (resolvedClassification !== null && route.classification) {
    const allowed = Array.isArray(route.classification)
      ? route.classification
      : [route.classification];
    if (!allowed.includes(resolvedClassification)) {
      return false;
    }
  }

  // 2. Risk floor ineligibility checks
  if (floorGuarantees) {
    if (
      Array.isArray(floorGuarantees.ineligibleRoutes) &&
      floorGuarantees.ineligibleRoutes.includes(route.name)
    ) {
      return false;
    }

    if (Array.isArray(floorGuarantees.requiredPhases) && floorGuarantees.requiredPhases.length > 0) {
      const routePhases = Array.isArray(route.phases) ? route.phases : [];
      const satisfiesPhases = floorGuarantees.requiredPhases.every((p) =>
        routePhases.includes(p)
      );
      if (!satisfiesPhases) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Evaluates candidate routes against context, enforcing risk floors, contextual precedence,
 * and continuation invariance.
 *
 * @param {object[]} routes - Parsed routing table
 * @param {object} ctx - Context signals
 * @param {object} [options] - Options including persistedRoute
 * @returns {{
 *   route: object|null,
 *   name: string|null,
 *   classification: string|null,
 *   floor: string,
 *   reasons: string[],
 *   status?: string,
 *   blocker_type?: string,
 *   rationale: string
 * }}
 */
function selectRoute(routes, ctx, options = {}) {
  // Pure implementation returning route selection details.
}
```

### 3. `openspec/config.yaml` Routing Declarations

```yaml
routing:
  - name: foundation
    classification: [trivial, small, normal, high-risk]
    conditions:
      project.status: empty
    phases: [sdd-foundation]
    gates: []
    description: "Guided pre-SDD foundation phase for empty projects."
    cost: medium

  - name: federated
    classification: [trivial, small, normal, high-risk]
    conditions:
      artifact_store.backend: workspace-federated
    phases: [sdd-workspace, sdd-propose, sdd-spec, sdd-design, sdd-tasks, sdd-apply, sdd-verify, sdd-archive]
    gates: [impact, clarify]
    description: "Full SDD for federated multi-repo workspaces."
    cost: high

  - name: bugfix
    classification: [small, normal]
    conditions:
      explicit_bugfix_intent: true
    phases: [sdd-explore, sdd-tasks, sdd-apply, sdd-verify, sdd-archive]
    gates: [quality-review-gate]
    description: "Robust explore-fix flow with verification and archive."
    cost: medium

  - name: brownfield
    classification: [trivial, small, normal, high-risk]
    conditions:
      match: any
      baseline.status: [pending, partial]
      specs_empty_with_code: true
      code_without_specs: true
    phases: [sdd-baseline]
    gates: [brownfield-advisory]
    description: "Advisory-first baseline pass for brownfield repos."
    cost: medium

  - name: refactor
    classification: [small, normal]
    conditions:
      explicit_refactor_intent: true
    phases: [sdd-design, sdd-tasks, sdd-apply, sdd-verify, sdd-archive]
    gates: [quality-review-gate]
    description: "Behavior-preserving code refactoring with design, verification, and archiving."
    cost: medium

  - name: hotfix
    classification: [trivial, small]
    conditions:
      explicit_hotfix_intent: true
    phases: [sdd-apply, sdd-verify, sdd-archive]
    gates: []
    description: "Emergency patch or trivial change directly applied, verified, and archived."
    cost: low

  - name: standard
    classification: [normal, high-risk]
    conditions:
      project.status: active
    phases: [sdd-propose, sdd-spec, sdd-design, sdd-tasks, sdd-apply, sdd-verify, sdd-archive]
    gates: [clarify, quality-review-gate]
    description: "Full SDD for normal/high-risk changes on active projects."
    cost: high

  - name: lite
    classification: [trivial, small]
    conditions:
      project.status: active
    phases: [sdd-propose, sdd-tasks, sdd-apply, sdd-verify, sdd-archive]
    gates: []
    description: "Reduced SDD for trivial/small changes with archiving."
    cost: low
```

---

## Testing Strategy

| Requirement / Scenario | Trigger & Conditions | Expected Response | Verification |
|---|---|---|---|
| **REQ-routing-012**: Small change selects lite | `ctx: { classification: "small", "project.status": "active" }` | `standard` ineligible; `lite` selected | Unit test in `route-dispatcher.test.js` & `real-repo.test.js` |
| **REQ-routing-012**: Classification signal conflict fails closed | `ctx: { classification: "small", "change.classification": "normal" }` | Throws `ClassificationConflictError`; route evaluation halts | Unit test in `route-dispatcher.test.js` |
| **REQ-routing-012**: Normal change in active repo selects standard | `ctx: { classification: "normal", "project.status": "active" }` | `lite` ineligible; `standard` selected | Unit test in `route-dispatcher.test.js` & `real-repo.test.js` |
| **REQ-routing-012**: Trivial change in active repo selects lite | `ctx: { classification: "trivial", "project.status": "active" }` | `standard` ineligible; `lite` selected | Unit test in `route-dispatcher.test.js` & `real-repo.test.js` |
| **REQ-routing-013**: Auth security blocks lite & hotfix | `ctx: { classification: "small", explicit_hotfix_intent: true, impact: { auth_security: true } }` | `hotfix` and `lite` ineligible; elevates to `standard`; reasons recorded | Unit test in `route-dispatcher.test.js` & `real-repo.test.js` |
| **REQ-routing-013**: Public API impact blocks lite | `ctx: { classification: "small", impact: { public_api: true } }` | `lite` ineligible due to `planned` floor; selects route with spec & design (`standard`) | Unit test in `route-dispatcher.test.js` |
| **REQ-routing-013**: Contextual route retains precedence over lite | `ctx: { classification: "small", "baseline.status": "pending" }` | `brownfield` takes precedence and is selected over `lite` | Integration test in `real-repo.test.js` |
| **REQ-routing-013**: Custom route ordering preserved | Custom routing table with multiple routes matching classification | First matching route in declared order is selected | Unit test with custom table fixture in `route-dispatcher.test.js` |
| **REQ-routing-014**: Resuming active change preserves persisted route | In-flight change with `persistedRoute: "standard"` resuming in `sdd-apply` | Route remains `standard`; no table re-evaluation | Integration test in `real-repo.test.js` |
| **REQ-routing-014**: Late discovery of auth impact halts with blocker | In-flight change running on `lite`, late discovery `auth_security: true` | Halts with `status: blocked` and `blocker_type: needs_user_decision` | Unit test in `route-dispatcher.test.js` |
| **REQ-change-classification-004**: Critical floor maps to standard guarantees | Resolved floor `critical` on candidate `lite` | Rejects `lite`; elevates to full SDD route (`standard`) | Unit test in `change-classification.test.js` |
| **REQ-change-classification-004**: Planned floor rejects lite candidate | Resolved floor `planned` on candidate `lite` | Rejects `lite`; elevates to route with spec & design | Unit test in `change-classification.test.js` |
| **REQ-change-classification-003**: Auth evidence floors to critical despite tiny diff | `impact: { auth_security: true }`, `execution: { loc: 2 }` | Floor is `critical`; reasons include `hard_floor.auth_security` | Unit test in `change-classification.test.js` |
| **REQ-change-classification-003**: Large docs-only change does not invent critical floor | `impact: { docs_only: true }`, `execution: { loc: 3000 }` | Floor is `direct`; not elevated to `critical` | Unit test in `change-classification.test.js` |
| **REQ-change-classification-003**: Migration evidence floors to critical | `impact: { data_migration: true }` | Floor is `critical`; reasons include `hard_floor.data_migration` | Unit test in `change-classification.test.js` |
| **REQ-change-classification-003**: Hotfix intent cannot downgrade auth floor | `impact: { auth_security: true }`, `candidate_route: "direct"`, hotfix intent | Floor remains `critical`; hotfix route prohibited | Unit test in `change-classification.test.js` |

---

## Migration / Rollout

- **Backward Compatibility**:
  - Existing calls to `parseRoutingTable`, `validateRoute`, and `validateRouteTable` remain completely backwards-compatible with zero signature changes.
  - `classifyChange` continues to return `{ classification, confidence }`, augmented to recognize `ctx["change.classification"]` and fail closed on conflict.
  - Existing `state.yaml` files with persisted `route.actual_route` continue executing without interruption.
- **Rollback Strategy**:
  - Reverting changes to `scripts/lib/route-dispatcher.js`, `scripts/lib/change-classification.js`, and `openspec/config.yaml` restores previous condition-only matching without corrupting active changes or invalidating persisted artifacts.

---

## Open Questions

None. All interfaces, data structures, and edge cases are fully grounded in the delta specifications and repository conventions.
