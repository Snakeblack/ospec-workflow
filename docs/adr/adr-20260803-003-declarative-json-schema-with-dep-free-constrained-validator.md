# ADR-003: Declarative JSON Schema with dep-free constrained validator

- Status: proposed
- Change: k1-contract-suite
- Date: 2026-08-03

## Context

K1 needs published JSON Schemas (`$id`, fixtures) while the harness remains
Node-22 CommonJS with **no npm dependencies**. Prior work rejected ajv for the
result-envelope validator for the same reason.

## Decision

Publish Draft 2020-12 JSON Schema documents as the normative pin surface.
Validate instances/fixtures with an in-repo constrained subset interpreter
(`scripts/lib/kernel-schema-validator.js`: type, properties, required,
additionalProperties, enum, const, oneOf, local `$ref`, limited if/then).
Kind-specific semantic rules (`execute`/`collect`/`decide`/`stop`) are pure
post-validators beside the schemas.

## Alternatives

- Add `ajv` — violates zero-deps policy.
- Hand-validators only, no schema files — fails P19/$id pinning and consumer pin.
- Vendor full ajv into the tree — oversized for the needed subset.

## Consequences

Schemas remain reviewable contracts; CI stays dep-free. The interpreter must
document its supported subset so authors do not use unsupported keywords.
Expanding the subset is additive; removing support is breaking.
