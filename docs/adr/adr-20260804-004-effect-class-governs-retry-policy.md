# ADR-004: Effect class governs retry policy

- Status: proposed
- Change: k2-1-authority-store-permits
- Date: 2026-08-04

## Context

K2 journal reconciliation treats ambiguous started effects as fail-closed
reconciliation, but does not classify effects or ban blind retry of irreversible
external outcomes. Specs require an explicit closed class set and
decide|stop on irreversible ambiguity.

## Decision

Every reducer effect intent MUST include
`effect_class ∈ {pure, idempotent-keyed, probeable, compensatable, irreversible}`.
Shell policy follows the class table; ambiguous irreversible selects `decide` or
`stop` and MUST NOT auto-retry. No exactly-once claim over shell/Git/network I/O.

## Alternatives

- Keep opaque journal-only policy — insufficient for irreversible external I/O.
- Claim exactly-once for all keyed effects — false over external side effects.

## Consequences

Reducer, harness fault matrix, and model checkers share one class vocabulary.
Direct-write adapters without class + permit + CAS are blocked. Class assignment
for each existing `persist-node` effect defaults to `idempotent-keyed` unless a
fixture injects `irreversible`.
