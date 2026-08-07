# ADR-005: Freeze Gate And Positive EXPECTED_KINDS Table

- Status: proposed
- Change: k3-identities-boundary-closure
- Date: 2026-08-07

## Context
`evaluateCandidateRelation` accepts any object that survives `computeCandidateId`, enabling freeze bypass. `validateIdentityKind` uses optional-kind / blacklist logic, so a SourceSnapshot plus `attestation_id` can pass attestation surfaces.

## Decision
Introduce `validateCandidateV2` (schema-backed boolean). Gate relation eval before any digest compare; failures return `INVALID_FROZEN_CANDIDATE`. Replace kind discrimination with a closed positive `EXPECTED_KINDS` map; missing or incompatible `kind` fails closed. Use provisional attestation/delivery kinds `candidate-evaluation-attestation/v1` and `delivery-authorization/v1` until K8/K10 publish schemas.

## Alternatives
- Structural-only freeze checks without schema — weaker single source of truth.
- Keep optional kind with extra blacklists — remains fail-open to novel disguises.

## Consequences
Only `freezeCandidate` outputs should pass the relation gate when schema-valid. Attestation kind strings are frozen for K3 tests and may be aligned when K8 lands. `freezeCandidate` must enforce `repository_id` minLength 1 and never emit `intended_untracked_digest: ""`.
