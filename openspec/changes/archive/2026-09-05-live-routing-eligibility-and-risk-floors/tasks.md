# Tasks: Live Routing Eligibility and Risk Floors

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-routing-012 / Small change selects lite without standard shadowing | MUST | `scripts/lib/route-dispatcher.js` (`isRouteEligible`, `selectRoute`), `openspec/config.yaml` | covered-by-design | Disqualifies `standard` for `small`, allowing `lite` to match `project.status: active` |
| REQ-routing-012 / Conflicting classification signals fail closed | MUST | `scripts/lib/route-dispatcher.js` (`normalizeClassificationSignals`, `ClassificationConflictError`) | covered-by-design | Throws deterministic error when `ctx.classification` and `ctx["change.classification"]` differ |
| REQ-routing-012 / Normal change in active repo selects standard | MUST | `scripts/lib/route-dispatcher.js` (`isRouteEligible`, `selectRoute`), `openspec/config.yaml` | covered-by-design | `lite` deemed ineligible due to classification mismatch; `standard` matches |
| REQ-routing-012 / Trivial change in active repo selects lite | MUST | `scripts/lib/route-dispatcher.js` (`isRouteEligible`, `selectRoute`), `openspec/config.yaml` | covered-by-design | `standard` ineligible; `lite` selected |
| REQ-routing-013 / Auth security evidence blocks lite and hotfix | MUST | `scripts/lib/route-dispatcher.js` (`selectRoute`), `scripts/lib/change-classification.js` (`FLOOR_GUARANTEES`) | covered-by-design | `critical` floor disqualifies `lite`/`hotfix` and elevates to `standard` with reasons |
| REQ-routing-013 / Public API impact blocks lite | MUST | `scripts/lib/route-dispatcher.js` (`selectRoute`), `scripts/lib/change-classification.js` (`FLOOR_GUARANTEES`) | covered-by-design | `planned` floor disqualifies `lite` and selects route with spec & design |
| REQ-routing-013 / Contextual route retains precedence over lite | MUST | `scripts/lib/route-dispatcher.js` (`selectRoute`), `openspec/config.yaml` | covered-by-design | Contextual routes (`foundation`, `federated`, `brownfield`) evaluated before general routes |
| REQ-routing-013 / Custom route ordering preserved | MUST | `scripts/lib/route-dispatcher.js` (`selectRoute`) | covered-by-design | First-match evaluation preserves declared order among eligible custom routes |
| REQ-routing-014 / Resuming active change preserves persisted route | MUST | `scripts/lib/route-dispatcher.js` (`selectRoute` options) | covered-by-design | In-flight change retains `state.yaml` route without routing table re-evaluation |
| REQ-routing-014 / Late discovery of auth impact halts with blocker | MUST | `scripts/lib/route-dispatcher.js` (`selectRoute`), `agents/sdd-orchestrator.agent.md` | covered-by-design | Emergent floor violation halts with `status: blocked` and `needs_user_decision` |
| REQ-change-classification-004 / Critical floor maps to standard route guarantees | MUST | `scripts/lib/change-classification.js` (`FLOOR_GUARANTEES.critical`, `resolveFloorGuarantees`) | covered-by-design | Full SDD tier mapped; prohibits `lite`, `hotfix`, `repair`, `direct` |
| REQ-change-classification-004 / Planned floor rejects lite candidate | MUST | `scripts/lib/change-classification.js` (`FLOOR_GUARANTEES.planned`, `resolveFloorGuarantees`) | covered-by-design | Spec and design tier mapped; rejects `lite` candidate and elevates |
| REQ-change-classification-003 / Auth evidence floors to critical despite tiny diff | MUST | `scripts/lib/change-classification.js` (`classifyChange`, `HARD_FLOORS`) | covered-by-design | Hard floor driven by impact evidence; LOC cannot lower floor |
| REQ-change-classification-003 / Large docs-only change does not invent critical floor | MUST | `scripts/lib/change-classification.js` (`classifyChange`) | covered-by-design | LOC alone does not elevate to `critical` |
| REQ-change-classification-003 / Public API evidence floors to at least planned | MUST | `scripts/lib/change-classification.js` (`classifyChange`, `HARD_FLOORS`) | covered-by-design | Public API impact maps to `planned` floor |
| REQ-change-classification-003 / Repair evidence selects repair floor | MUST | `scripts/lib/change-classification.js` (`classifyChange`, `HARD_FLOORS`) | covered-by-design | Reproducible bug selects `repair` floor |
| REQ-change-classification-003 / Direct evidence selects direct floor | MUST | `scripts/lib/change-classification.js` (`classifyChange`, `HARD_FLOORS`) | covered-by-design | Mechanical change selects `direct` floor |
| REQ-change-classification-003 / Migration evidence floors to critical | MUST | `scripts/lib/change-classification.js` (`classifyChange`, `HARD_FLOORS`) | covered-by-design | Data migration maps to `critical` floor |
| REQ-change-classification-003 / Hotfix intent cannot downgrade auth hard floor | MUST | `scripts/lib/change-classification.js` (`classifyChange`) | covered-by-design | Explicit intent cannot lower established hard floor |

### Reconciliation Verdict
- MUST coverage: complete (19/19 scenarios covered)
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 420-520 lines |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR (size:exception approved) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Connect classification floor guarantees, route dispatcher eligibility filtering, and continuation invariance | Single PR | Approved `size:exception`; delivers atomic, verified routing changes across classification, dispatcher, configuration, and test suites |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Classification Floor Guarantees (K1 Bridge)

- [x] 1.1 RED: Add unit tests in `scripts/lib/change-classification.test.js` verifying `FLOOR_GUARANTEES` and `resolveFloorGuarantees` for `critical`, `planned`, `bounded`, `repair`, and `direct` floors [REQ-change-classification-003, REQ-change-classification-004]
- [x] 1.2 GREEN: Implement and export `FLOOR_GUARANTEES` and `resolveFloorGuarantees(floor)` in `scripts/lib/change-classification.js`, and verify `classifyChange` prevents hotfix intent or diff size from downgrading hard floors [REQ-change-classification-003, REQ-change-classification-004]
- [x] 1.3 REFACTOR: Freeze guarantee structures and ensure clean exports in `scripts/lib/change-classification.js` [REQ-change-classification-004]

## Phase 2: Signal Normalization & Route Eligibility Filtering

- [x] 2.1 RED: Add unit tests in `scripts/lib/route-dispatcher.test.js` for `normalizeClassificationSignals` (handling `ctx.classification` vs `ctx["change.classification"]`, and throwing `ClassificationConflictError` on mismatch) and `isRouteEligible` metadata filtering [REQ-routing-012, REQ-routing-013]
- [x] 2.2 GREEN: Implement `normalizeClassificationSignals`, `ClassificationConflictError`, and `isRouteEligible(route, resolvedClassification, floorGuarantees)` in `scripts/lib/route-dispatcher.js` [REQ-routing-012, REQ-routing-013]
- [x] 2.3 REFACTOR: Update `classifyChange` in `scripts/lib/route-dispatcher.js` to normalize context signals using `normalizeClassificationSignals` and export newly introduced utilities [REQ-routing-012]

## Phase 3: Route Selection, Floor Enforcement & Continuation Invariance

- [x] 3.1 RED: Add unit tests in `scripts/lib/route-dispatcher.test.js` for `selectRoute` (aliased as `dispatchRoute`), covering: small change selects `lite`, auth/migration impact elevates to `standard`, contextual routes retain precedence, custom ordering is preserved, and persisted route continuation locks route while late floor violation halts with blocker [REQ-routing-012, REQ-routing-013, REQ-routing-014, REQ-change-classification-004]
- [x] 3.2 GREEN: Implement `selectRoute` / `dispatchRoute` in `scripts/lib/route-dispatcher.js` with floor evaluation, contextual precedence, custom ordering, and continuation invariance handling [REQ-routing-012, REQ-routing-013, REQ-routing-014, REQ-change-classification-004]
- [x] 3.3 REFACTOR: Refactor route dispatch evaluation helpers and document contract types in `scripts/lib/route-dispatcher.js` [REQ-routing-012, REQ-routing-013]

## Phase 4: Declarative Routing Configuration & Table Validation

- [x] 4.1 Update `openspec/config.yaml` `routing:` block: expand contextual routes (`foundation`, `federated`, `brownfield`) classification to `[trivial, small, normal, high-risk]`, and change `lite` condition to `project.status: active` [REQ-routing-012, REQ-routing-013]
- [x] 4.2 Verify routing table validation succeeds via `validateRouteTable` and add test coverage in `scripts/configure/real-repo.test.js` [REQ-routing-012, REQ-routing-013]

## Phase 5: Real-Repository Integration & End-to-End Verification

- [x] 5.1 RED: Add integration tests in `scripts/configure/real-repo.test.js` verifying live config routing: small/trivial change selects `lite` in active repo, auth/migration floor elevates candidate `lite`/`hotfix` to `standard`, contextual `brownfield` retains precedence over `lite`, and persisted route is preserved on resume [REQ-routing-012, REQ-routing-013, REQ-routing-014]
- [x] 5.2 GREEN: Ensure all real-repo routing tests in `scripts/configure/real-repo.test.js` pass with live `openspec/config.yaml` [REQ-routing-012, REQ-routing-013, REQ-routing-014]
- [x] 5.3 Run full test suite (`npm test`) across unit, integration, and linting checks to confirm zero regressions [REQ-routing-012, REQ-routing-013, REQ-routing-014, REQ-change-classification-003, REQ-change-classification-004]
