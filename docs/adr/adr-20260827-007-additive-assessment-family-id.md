# ADR-001: Additive assessment family `$id`

- Status: proposed
- Change: k6b-verification-integrity-remediation
- Date: 2026-08-27

## Context

Assumption `sdd-propose-001` left the persistable binding `$id` to design. Intent forbids in-place mutation of `evidence/v2` and K1 v1. Assessment identity must include `role` and `obligation_id` without collapsing physical `EvidenceId`.

## Decision

Publish family `assessment` at `$id` `ospec://schemas/kernel/assessment/v1`, `kind: "assessment/v1"`, path `schemas/kernel/assessment/v1.schema.json`, `schema_version: 1`. Register additively in `manifest.json` and `contract-claims.json`. Keep `evidence/v2`, `verification/v2`, and K1 v1 bytes/pins frozen.

## Alternatives

- Mutate `evidence/v2` to carry role/obligation: rejected; observation identity would absorb evaluation identity.
- Evolve `verification/v3` with embedded bindings: rejected; verdict unique-sort of `evidence_ids` still hides distinct roles.
- `$id` `ospec://schemas/kernel/assessment-binding/v1`: rejected; breaks the `{noun}/vN` kernel `$id` pattern.

## Consequences

Consumers pin a third K6b-era family without migrating evidence. Rollback deletes the additive family. Four roles over one observation become four `assessment_id` values by construction.
