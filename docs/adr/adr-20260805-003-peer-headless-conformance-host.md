# ADR-003: Peer Headless Conformance Host

- Status: proposed
- Change: k2a-headless-conformance-host
- Date: 2026-08-04

## Context
Host faults must be exercised through public ports without turning the Minimal Kernel Harness or a product adapter into a second lifecycle authority.

## Decision
Implement a distinct Headless Conformance Host as a peer fixture. It owns deterministic timeout, cancel, worker-fail, interrupt, and adapter-boundary checks; lifecycle continuation remains in the Minimal Kernel Harness/kernel.

## Alternatives
- Fold faults into Minimal Kernel Harness: rejected because it merges protocol and host-policy ownership.
- Put faults in adapters: rejected because product adapters would own conformance semantics.

## Consequences
Authority boundaries stay explicit and either fixture can evolve independently. Integration tests must wire both public entrypoints when a scenario crosses host and lifecycle behavior.
