# ADR-001: Keep Candidate successor construction inside freezeCandidate

- Status: proposed
- Change: k3-readiness-remediation
- Date: 2026-08-09

## Context

Candidate v2 currently accepts a bare predecessor digest and always freezes relation as `exact`. K3 requires relation to derive from complete frozen predecessor and target payloads while retaining one constructor authority.

## Decision

Extend `freezeCandidate()` with an optional complete `predecessorCandidate`. Use one non-exported relation derivation primitive from both freeze and evaluation. Equal recomputed IDs produce the canonical exact record without lineage; different IDs produce a changed successor with the recomputed predecessor ID. Reject predecessor-ID-only construction.

## Alternatives

- Export `createCandidateSuccessor()`: creates a second Candidate construction authority.
- Trust caller relation/ID fields: cannot prove lineage from frozen bytes.
- Construct in `evaluateCandidateRelation()`: conflates evaluation with record creation.

## Consequences

There is one public constructor and one internal derivation rule. Bare predecessor-ID callers must migrate to full frozen records. Reversal is possible but would reopen an unverifiable public contract.
