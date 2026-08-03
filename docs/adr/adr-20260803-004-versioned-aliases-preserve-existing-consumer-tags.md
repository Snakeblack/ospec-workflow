# ADR-004: Versioned aliases preserve existing consumer tags

- Status: proposed
- Change: k1-contract-suite
- Date: 2026-08-03

## Context

K1 introduces canonical vocabulary for classification reasons, transition kinds,
and related codes. Existing emitters already produce stable tags that consumers
and audits rely on. Silent renames would break compatibility (invariant 12).

## Decision

Ship `schemas/kernel/aliases/v1.json` mapping legacy/current stable tags to
canonical codes. `resolveAlias(tag, {strict})` returns the canonical code when
mapped; in strict coverage mode, known consumer tags without a map entry
fail-closed (never silently dropped).

## Alternatives

- Silent rename without map — breaks existing consumers/audits.
- Big-bang cutover requiring all emitters to change atomically — high risk for K1.

## Consequences

Migrations stay explicit and testable; old tags remain resolvable. The alias
file becomes a maintained contract surface. Reversible by extending the map or
bumping alias version; deleting entries is a breaking consumer event.
