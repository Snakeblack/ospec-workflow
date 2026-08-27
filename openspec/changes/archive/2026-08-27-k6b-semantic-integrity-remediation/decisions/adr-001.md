# ADR-001: Persist token coverage on assessment/v1

- Status: proposed
- Change: k6b-semantic-integrity-remediation
- Date: 2026-08-27

## Context

Existential evidence binding cannot prove `required_evidence` subset coverage. Coverage belongs to an evaluated evidence/role/obligation tuple, while `evidence/v2` and K1 contracts are frozen.

## Decision

Add required `evidence_requirements_satisfied` to `assessment/v1` as a unique, canonical string array. Include it in the `assessment_id` preimage and in assessment required claims. Omission fails schema validation.

## Alternatives

- Put tokens on `evidence/v2`: rejected; it mutates observation identity.
- Keep coverage ephemeral: rejected; replay cannot validate it.
- Publish `assessment/v2`: rejected; the accepted delta evolves the additive v1 family and requires no parallel family.

## Consequences

Old partial assessments fail closed and must be regenerated. Coverage tampering changes identity. Evidence, verification, and K1 schema bytes stay frozen; rollback is a unit revert.
