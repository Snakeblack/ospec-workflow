# ADR-004: Explicit Single-Product Adapter Registry

- Status: proposed
- Change: k2a-headless-conformance-host
- Date: 2026-08-04

## Context
K2a requires one real adapter while five other generator targets already have declarative profiles but no K2a proof or conformance activation.

## Decision
Use an explicit product-adapter registry containing only `claude`. Compose its adapter from the existing Claude target profile and injected host primitives; keep all other profiles inactive until K11a.

## Alternatives
- Auto-discover target profiles: rejected because presence would become accidental activation.
- Import Claude in the lifecycle kernel: rejected because it couples core semantics to a product.

## Consequences
The reference vertical is auditable and disabling it is a one-entry rollback. Adding another host requires an explicit registry change, proofs, and conformance rather than profile discovery alone.
