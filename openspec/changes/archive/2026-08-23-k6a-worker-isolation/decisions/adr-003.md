# ADR-003: Explicit Host Isolation Degradation Fallback

- Status: proposed
- Change: k6a-worker-isolation
- Date: 2026-08-23

## Context
K6a consumes the `WorkerTransport` port from the reference host adapter (K2a), which may declare isolation capability as `enforced`, `partial`, `instructional`, or `unavailable`.

## Decision
Execute within host-level sandboxing when capability is `enforced`; execute with software boundary containment when capability is `partial` or `instructional` while logging truthful capability state; execute documented fallback when `unavailable`. Silent promotion to `enforced` is strictly forbidden.

## Alternatives
- *Silent promotion to enforced*: Rejected because it masks security limitations and creates false security guarantees.
- *Hard failure when not enforced*: Rejected because local CI, testing fixtures, and headless conformance runs require functional software fallbacks.

## Consequences
Truthful capability reporting preserved across execution telemetry without runtime fragility. Reversibility is low.
