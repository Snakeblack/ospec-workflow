# Delta for routing

## MODIFIED Requirements

### Requirement: Persisted Actual Route for New Changes {#REQ-routing-016}

When the runtime creates or updates a change that is subject to the current route-persistence policy, it MUST persist a non-empty `route.actual_route` in that change's `state.yaml` before any continuation or phase dispatch that depends on the selected route. A new or policy-bound change that lacks `route.actual_route` MUST fail closed: the dispatcher MUST NOT invent a route, MUST NOT silently re-select from the routing table as if no route were required, and MUST surface a blocking or rejection outcome that prevents unsafe continuation.

When `state.yaml` already contains a non-empty `route.actual_route` under the `route:` block, that value is authoritative for continuation and phase validation. A `--persisted-route` (or equivalent CLI/context override) MUST NOT replace or override a different authoritative persisted `route.actual_route`. An `actual_route` key that appears outside the `route:` block MUST NOT count as the authoritative persisted route. The route parsers used by the route dispatcher and by `validate-phase` MUST agree on these rules (same recognition of the `route:` block, same treatment of out-of-block `actual_route`, same fail-closed outcomes) so the two surfaces cannot diverge on the same `state.yaml` (closes F-66efe8421b856f34).

Changes that predate this persistence policy and already exist without a `route:` section (and therefore without `route.actual_route`) MAY continue under an explicit legacy exception. That exception MUST be narrowly scoped to pre-policy durable states, MUST remain independently testable, and MUST NOT authorize omitting `route.actual_route` on newly created or newly policy-bound changes. Continuation locking of an already persisted `route.actual_route` remains governed by REQ-routing-014.

(Previously: Required persisting `route.actual_route` and fail-closed absence for policy-bound changes, with a legacy pre-policy exception, but did not make persisted `route.actual_route` authoritative over `--persisted-route`, did not exclude out-of-block `actual_route`, and did not require dispatcher/`validate-phase` parser parity.)

#### Scenario: New change persists actual_route before continuation

- GIVEN a newly created change under the current route-persistence policy
- AND route selection has produced an eligible route
- WHEN the runtime writes or updates that change's `state.yaml` for continued SDD work
- THEN `route.actual_route` MUST be persisted with the selected non-empty route value
- AND subsequent continuation MUST be able to lock that persisted route per REQ-routing-014

#### Scenario: New change without actual_route fails closed

- GIVEN a change subject to the current route-persistence policy
- AND its `state.yaml` has no `route.actual_route` (absent or empty)
- WHEN continuation or phase dispatch that depends on the selected route is attempted
- THEN the runtime MUST fail closed without inventing or silently substituting a route
- AND MUST NOT proceed as if an authoritative persisted route were present

#### Scenario: Pre-policy legacy absence remains an explicit testable exception

- GIVEN a durable change state that predates the route-persistence policy and lacks a `route:` section (and therefore lacks `route.actual_route`)
- WHEN the runtime evaluates that change under the legacy exception
- THEN the absence MUST be recognized as the documented pre-policy exception
- AND the exception MUST NOT apply to newly created or newly policy-bound changes that omit `route.actual_route`

#### Scenario: --persisted-route does not override a different persisted actual_route

- GIVEN `state.yaml` has `route.actual_route` set to a non-empty value R under the `route:` block
- AND a caller supplies `--persisted-route` (or equivalent) with a different value S
- WHEN the route dispatcher or `validate-phase` resolves the authoritative persisted route
- THEN the resolved route MUST remain R
- AND MUST NOT substitute S for R

#### Scenario: actual_route outside route block is not authoritative

- GIVEN `state.yaml` contains an `actual_route` key outside the `route:` block
- AND either no `route:` block is present or `route.actual_route` is absent/empty under `route:`
- WHEN the dispatcher and `validate-phase` parse persisted route info
- THEN that out-of-block `actual_route` MUST NOT count as the authoritative persisted route
- AND both parsers MUST agree on that outcome

#### Scenario: Dispatcher and validate-phase parsers match on route block authority

- GIVEN the same `state.yaml` fixture that either has `route.actual_route`, an out-of-block `actual_route`, or a `route:` section without `actual_route`
- WHEN `extractStateRouteInfo` (dispatcher) and `readPersistedRouteInfo` (`validate-phase`) each parse the fixture
- THEN both MUST report the same authoritative persisted route (or the same absence)
- AND MUST NOT diverge on whether a `route:` section is present or whether an out-of-block key counts
