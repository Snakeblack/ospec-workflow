# Delta for routing

## ADDED Requirements

### Requirement: Explicit Lite Artifact Contract {#REQ-routing-015}

The `lite` route MUST remain the ordered five-phase workflow `sdd-propose → sdd-tasks → sdd-apply → sdd-verify → sdd-archive` and MUST use `proposal-lite.md` plus `tasks.md` as its planning contract. A lite change MUST NOT require, create, or synthesize `proposal.md`, change-local specs, or `design.md` merely to satisfy a consumer. Route dispatch, eligibility filtering, and impact floors MUST remain unchanged: only an eligible `trivial` or `small` change without a floor requiring specification or design MAY execute this contract.

#### Scenario: Eligible fresh lite change omits full-planning artifacts

- GIVEN an active repository and an eligible small change with no elevated impact floor
- WHEN dispatch selects `lite`
- THEN the route runs exactly its five declared phases using `proposal-lite.md` and `tasks.md`
- AND no proposal, spec, or design filler artifact is required or created

#### Scenario: Public API floor rejects lite contract

- GIVEN a small change with `public_api: true`
- WHEN route eligibility is evaluated
- THEN `lite` MUST be disqualified by the planned floor
- AND the selected route MUST retain specification and design guarantees

#### Scenario: Route definition does not expand

- GIVEN the routing table is inspected after adding lite artifact handling
- WHEN the canonical routes are enumerated
- THEN no new route or merged phase is present
- AND the lite phase order remains unchanged
