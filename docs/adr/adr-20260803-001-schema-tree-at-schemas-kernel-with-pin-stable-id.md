# ADR-001: Schema tree at `schemas/kernel/` with pin-stable `$id`

- Status: proposed
- Change: k1-contract-suite
- Date: 2026-08-03

## Context

K1 must publish versioned JSON Schemas consumers can pin by `$id`/version. The
proposal allowed `schemas/` or an equivalent tree; the concrete path was deferred
to design.

## Decision

Place the suite at repo-root `schemas/kernel/{family}/v1.schema.json` with
`$id` = `ospec://schemas/kernel/{family}/v1`, indexed by
`schemas/kernel/manifest.json`. Fixtures live beside each family under
`fixtures/{valid,invalid}/`.

## Alternatives

- `openspec/schemas/` — mixes SDD workflow artifacts with kernel contracts.
- Flat `schemas/*.json` — weak family/version layout.
- `scripts/lib/schemas/` — hides the public pin surface inside implementation.

## Consequences

Easier consumer pinning and CI path discovery; clearer separation from OpenSpec
change folders. Harder: another top-level directory to document. Reversible by
relocating files and updating `$id`s in a follow-up migration.
