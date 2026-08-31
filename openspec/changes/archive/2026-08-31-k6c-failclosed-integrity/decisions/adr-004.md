# ADR-004: Constrained Draft 2020-12 Metaschema Without Ajv

- Status: proposed
- Change: k6c-failclosed-integrity
- Date: 2026-08-31

## Context

K1 only asserts that published schemas declare the Draft 2020-12 `$schema` URI, so duplicate `required` members (challenge-result lists `node_id` twice) still load. The official 2020-12 metaschema uses `$vocabulary`, `$dynamicRef`, and remote `allOf`, which `kernel-schema-validator.js` ignores. The repo has no Ajv or other runtime JSON Schema dependency.

## Decision

Validate each published schema document with a new `validateSchemaDocument` that recursively checks every `required` array using the interpreter’s existing `uniqueItems` keyword, in addition to the URI check. Invoke it from `k1-schema-compat`. Fix uniqueness offenders only; do not add Ajv.

## Alternatives

- Add Ajv 8 for the official metaschema: rejected unless the subset cannot fail the specified duplicate-`required` scenario (it can).
- URI-only check: rejected by REQ-kernel-contract-schemas-029.

## Consequences

Duplicate `required` fails even when `$schema` is the 2020-12 URI. Nested `required` arrays are covered. Full 2020-12 vocabulary beyond the interpreter subset is not enforced. K1/K6b schema bytes stay frozen unless a uniqueness walk finds a duplicate (then uniqueness-only).
