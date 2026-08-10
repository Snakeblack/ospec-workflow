# ADR-002: Publish a curated K3 runtime asset closure to every target

- Status: proposed
- Change: k3-readiness-remediation
- Date: 2026-08-09

## Context

The generator publishes runtime scripts by curated BFS roots, but execution identities are unreachable and no target contains the schema manifest or Candidate v2 schema. The K3 runtime loads several identity schemas relative to the target root.

## Decision

Make execution identities a curated runtime root and publish the closed K3 schema set (manifest, Candidate v2, SourceSnapshot v1, WorkOrder v1/v2, WorkResult v1) byte-for-byte to all six configured targets.

## Alternatives

- Copy all schemas: expands targets without a bounded runtime need.
- Copy only Candidate v2: breaks other exported K3 validators.
- Read schemas from the source checkout: makes generated targets non-self-contained.

## Consequences

Targets become self-contained and publication can be contract-tested. Adding a new runtime schema dependency now requires updating the curated asset closure and parity tests.
