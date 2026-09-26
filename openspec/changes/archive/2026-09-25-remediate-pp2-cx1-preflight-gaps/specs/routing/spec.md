# Delta for routing

## ADDED Requirements

### Requirement: Persisted Actual Route for New Changes {#REQ-routing-016}

When the runtime creates or updates a change that is subject to the current route-persistence policy, it MUST persist a non-empty `route.actual_route` in that change's `state.yaml` before any continuation or phase dispatch that depends on the selected route. A new or policy-bound change that lacks `route.actual_route` MUST fail closed: the dispatcher MUST NOT invent a route, MUST NOT silently re-select from the routing table as if no route were required, and MUST surface a blocking or rejection outcome that prevents unsafe continuation.

Changes that predate this persistence policy and already exist without `route.actual_route` MAY continue under an explicit legacy exception. That exception MUST be narrowly scoped to pre-policy durable states, MUST remain independently testable, and MUST NOT authorize omitting `route.actual_route` on newly created or newly policy-bound changes. Continuation locking of an already persisted `route.actual_route` remains governed by REQ-routing-014.

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

- GIVEN a durable change state that predates the route-persistence policy and lacks `route.actual_route`
- WHEN the runtime evaluates that change under the legacy exception
- THEN the absence MUST be recognized as the documented pre-policy exception
- AND the exception MUST NOT apply to newly created or newly policy-bound changes that omit `route.actual_route`
