# Apply Progress: Live Routing Eligibility and Risk Floors

## Executive Summary
- **Branch**: Working on branch `feat/live-routing-eligibility-and-risk-floors`
- **Change Name**: `live-routing-eligibility-and-risk-floors`
- **Delivery Strategy**: `exception-ok` (single-PR, pre-approved `size:exception`)
- **Implementation Mode**: `standard` under Strict TDD
- **Test Runner**: Node native test runner (`node --test`)
- **Status**: Complete — All 16 tasks across Phases 1 through 5 implemented and verified with 100% test pass rate across unit, integration, and full suite checks.

---

## TDD Cycle Evidence & Phase Breakdown

### Phase 1: Classification Floor Guarantees (K1 Bridge)
- **1.1 [RED]**: Added unit tests in `scripts/lib/change-classification.test.js` verifying `FLOOR_GUARANTEES` and `resolveFloorGuarantees` for `critical`, `planned`, `bounded`, `repair`, and `direct` floors, ensuring immutability (`Object.isFrozen`) and protection against downgrade by hotfix intent or diff size.
- **1.2 [GREEN]**: Implemented and exported frozen `FLOOR_GUARANTEES` and pure `resolveFloorGuarantees(floor)` in `scripts/lib/change-classification.js`, and updated `classifyChange` hard floors to retain precedence over hotfix intent and diff line count.
- **1.3 [REFACTOR]**: Verified frozen structure integrity and verified clean CommonJS exports. All 16 unit tests in `scripts/lib/change-classification.test.js` PASS.

```json:strict-tdd-evidence
{
  "unit": "Phase 1 - Classification Floor Guarantees",
  "test_file": "scripts/lib/change-classification.test.js",
  "status": "PASS",
  "tests_count": 16,
  "failures_count": 0
}
```

### Phase 2: Signal Normalization & Route Eligibility Filtering
- **2.1 [RED]**: Added unit tests in `scripts/lib/route-dispatcher.test.js` for `normalizeClassificationSignals` (handling `ctx.classification` vs `ctx["change.classification"]` and throwing deterministic `ClassificationConflictError` on conflicting values) and `isRouteEligible` metadata filtering against route classification and floor guarantees.
- **2.2 [GREEN]**: Implemented `ClassificationConflictError`, `normalizeClassificationSignals(ctx)` (fail-closed on conflict), and pure `isRouteEligible(route, resolvedClassification, floorGuarantees)` in `scripts/lib/route-dispatcher.js`.
- **2.3 [REFACTOR]**: Integrated `normalizeClassificationSignals` into `classifyChange` in `scripts/lib/route-dispatcher.js` and exported newly introduced utilities. Unit tests PASS.

```json:strict-tdd-evidence
{
  "unit": "Phase 2 - Signal Normalization & Eligibility Filtering",
  "test_file": "scripts/lib/route-dispatcher.test.js",
  "status": "PASS",
  "tests_count": 84,
  "failures_count": 0
}
```

### Phase 3: Route Selection, Floor Enforcement & Continuation Invariance
- **3.1 [RED]**: Added comprehensive unit tests in `scripts/lib/route-dispatcher.test.js` for `selectRoute` (aliased as `dispatchRoute`), covering:
  - Small and trivial changes selecting `lite` without `standard` shadowing.
  - Normal changes selecting `standard`.
  - Auth, security, migration, and public API evidence elevating `lite`/`hotfix` to `standard` with causal reasons.
  - Contextual routes (`foundation`, `federated`, `brownfield`) retaining precedence.
  - Custom table ordering preservation.
  - Continuation invariance (`options.persistedRoute`) locking route on resume and blocking with `needs_user_decision` upon late floor violation.
  - Input immutability purity proof.
- **3.2 [GREEN]**: Implemented `selectRoute` / `dispatchRoute` in `scripts/lib/route-dispatcher.js` incorporating floor guarantee checking, contextual route priority, custom route order evaluation, and continuation invariance handling.
- **3.3 [REFACTOR]**: Streamlined evaluation helpers, added contract documentation, and ensured strict purity without side-effects. All 97 unit tests in `scripts/lib/route-dispatcher.test.js` PASS.

```json:strict-tdd-evidence
{
  "unit": "Phase 3 - Route Selection & Floor Enforcement",
  "test_file": "scripts/lib/route-dispatcher.test.js",
  "status": "PASS",
  "tests_count": 97,
  "failures_count": 0
}
```

### Phase 4: Declarative Routing Configuration & Table Validation
- **4.1**: Updated `openspec/config.yaml` `routing:` block:
  - Expanded contextual routes (`foundation`, `federated`, `brownfield`) classification to `[trivial, small, normal, high-risk]`.
  - Updated `lite` condition from `change.classification: small` to `project.status: active`.
- **4.2**: Verified routing table validation via `validateRouteTable` and added declarative structure checks in `scripts/configure/real-repo.test.js`.

```json:strict-tdd-evidence
{
  "unit": "Phase 4 - Declarative Routing Configuration",
  "test_file": "scripts/configure/real-repo.test.js",
  "status": "PASS",
  "tests_count": 38,
  "failures_count": 0
}
```

### Phase 5: Real-Repository Integration & End-to-End Verification
- **5.1 [RED]**: Added integration tests in `scripts/configure/real-repo.test.js` verifying real repository routing:
  - Small change in active repository selects `lite` and normal selects `standard`.
  - Auth/migration floor elevates candidate `lite` to `standard`.
  - Contextual `brownfield` retains precedence over `lite`.
  - Persisted route is preserved across resumption and blocks with `needs_user_decision` on late floor escalation.
- **5.2 [GREEN]**: Verified real-repo routing integration passes with live `openspec/config.yaml`.
- **5.3 [FULL SUITE]**: Executed full repository test suite (`npm test`), including native test runner, scope guards, target generation, and validator checks.

```json:strict-tdd-evidence
{
  "unit": "Phase 5 - Real-Repo Integration & Full Suite",
  "test_file": "scripts/configure/real-repo.test.js",
  "status": "PASS",
  "tests_count": 38,
  "failures_count": 0
}
```

---

## TDD Cycle Evidence Table

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 1.1 | `scripts/lib/change-classification.test.js` | Unit | ✅ 13/13 | ✅ Written | ✅ Passed | ✅ 3 cases | ✅ Clean | Verified frozen tiers, fallback to bounded, and floor protection against hotfix intent |
| 1.2 | `scripts/lib/change-classification.test.js` | Unit | ✅ 16/16 | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Implemented and exported `FLOOR_GUARANTEES` and `resolveFloorGuarantees` |
| 1.3 | `scripts/lib/change-classification.test.js` | Unit | ✅ 16/16 | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Immutability frozen via `Object.freeze` |
| 2.1 | `scripts/lib/route-dispatcher.test.js` | Unit | ✅ 80/80 | ✅ Written | ✅ Passed | ✅ 4 cases | ✅ Clean | Normalization handling and conflict error thrown on signal discrepancy |
| 2.2 | `scripts/lib/route-dispatcher.test.js` | Unit | ✅ 84/84 | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Implemented `normalizeClassificationSignals`, `ClassificationConflictError`, `isRouteEligible` |
| 2.3 | `scripts/lib/route-dispatcher.test.js` | Unit | ✅ 84/84 | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Updated `classifyChange` to normalize context signals |
| 3.1 | `scripts/lib/route-dispatcher.test.js` | Unit | ✅ 84/84 | ✅ Written | ✅ Passed | ✅ 13 cases | ✅ Clean | Unit tests covering lite selection, floor elevation, brownfield precedence, and continuation lock |
| 3.2 | `scripts/lib/route-dispatcher.test.js` | Unit | ✅ 97/97 | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Implemented `selectRoute` and aliased `dispatchRoute` |
| 3.3 | `scripts/lib/route-dispatcher.test.js` | Unit | ✅ 97/97 | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Refactored helper functions and validated pure input immutability |
| 4.1 | `scripts/configure/real-repo.test.js` | Config | ✅ 33/33 | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Updated `openspec/config.yaml` with expanded contextual routes and `lite` active condition |
| 4.2 | `scripts/configure/real-repo.test.js` | Integration | ✅ 34/34 | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Validated routing table structure via `validateRouteTable` |
| 5.1 | `scripts/configure/real-repo.test.js` | Integration | ✅ 34/34 | ✅ Written | ✅ Passed | ✅ 5 cases | ✅ Clean | Integration test suite for live repo route selection and continuation |
| 5.2 | `scripts/configure/real-repo.test.js` | Integration | ✅ 38/38 | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Verified live integration tests pass cleanly |
| 5.3 | Full Suite (`npm test`) | E2E | ✅ 3,204 tests | ✅ Written | ✅ Passed | ➖ Suite | ✅ Clean | All native tests, target transforms, and validators passing without regressions |

---

## Authoritative Strict TDD Evidence

```json:strict-tdd-evidence
{
  "change": "live-routing-eligibility-and-risk-floors",
  "status": "completed",
  "test_runner": "node --test",
  "delivery_strategy": "exception-ok",
  "phases_completed": [
    "Phase 1: Classification Floor Guarantees (K1 Bridge)",
    "Phase 2: Signal Normalization & Route Eligibility Filtering",
    "Phase 3: Route Selection, Floor Enforcement & Continuation Invariance",
    "Phase 4: Declarative Routing Configuration & Table Validation",
    "Phase 5: Real-Repository Integration & End-to-End Verification"
  ],
  "requirements_covered": [
    "REQ-routing-012",
    "REQ-routing-013",
    "REQ-routing-014",
    "REQ-change-classification-003",
    "REQ-change-classification-004"
  ]
}
```
