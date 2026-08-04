# ADR-001: One Versioned Schema Family Per Host Contract

- Status: proposed
- Change: k2a-headless-conformance-host
- Date: 2026-08-04

## Context
K2a adds HostCapabilities, HostAdapter, five transports, and CapabilityProof to a contract suite whose consumers pin each family by stable `$id` and version.

## Decision
Publish each K2a contract as its own v1 JSON Schema family under `schemas/kernel/` and register every family in `schemas/kernel/manifest.json`.

## Alternatives
- One aggregate host schema: rejected because it couples independently evolving ports and weakens pinning.
- Runtime-only validation: rejected because it bypasses the established contract-suite surface.

## Consequences
Consumers get precise validation and independent identities at the cost of more schema/fixture files. The choice is reversible through a future versioned migration, not by silently replacing v1.
