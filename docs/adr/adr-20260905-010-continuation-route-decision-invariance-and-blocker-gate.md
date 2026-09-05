# ADR-004: Continuation Route Decision Invariance and Blocker Gate

- Status: proposed
- Change: live-routing-eligibility-and-risk-floors
- Date: 2026-09-05

## Context
When an in-flight SDD change is resumed across multiple sessions or phases, re-running route evaluation could silently re-evaluate or downgrade the route. Conversely, if emergent impact evidence violates the route guarantees mid-flight, silent reassignment breaks completed phase artifacts.

## Decision
Lock in the persisted route decision from `state.yaml` on continuation without routing table re-evaluation. If newly discovered impact evidence violates the active route's required risk floor, halt execution with an explicit user decision blocker gate (`needs_user_decision`) rather than performing a silent substitution.

## Alternatives
- Dynamic re-evaluation on resume: rejected because resuming `sdd-apply` could silently downgrade `standard` to `lite` or vice versa, corrupting the verification baseline.
- Automatic silent elevation: rejected because elevating routes changes required artifacts (`spec.md`, `design.md`), requiring deliberate operator approval.

## Consequences
Guarantees session stability, prevents silent regressions during implementation, and ensures that emergent risks are surfaced transparently to the user. Highly reversible.
