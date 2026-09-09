# ADR-003: Audited terminal predecessor and snapshot-bound verify successor

- Status: proposed
- Change: modernize-installer-model-selection
- Date: 2026-09-08

## Context

The frozen Candidate JSON remains recoverable, but its source tree is not resolvable, so the existing mechanical remediation delta cannot be established. REQ-verify-lineage-013/014 permit an approved recovery exception while preserving frozen findings and consumed budget.

## Decision

Add explicit audited terminalization and successor transitions to verify-lineage. Preserve the predecessor verbatim except additive audit/terminal fields, retain it in history, and create a distinct lineage against newly captured, verifiable source material. Carry findings, recipes, paths and counters forward unchanged and enter directed recheck. Persist operation intent and command evidence for exact reconciliation; unknown execution must never be replayed. Compute the successor contract from current finalized artifacts while preserving the predecessor contract digest.

## Alternatives

- Generic superseded-to-discovery routing: loses frozen verification continuity.
- Reconstructing the predecessor from current files: fabricates historical source evidence.
- Resetting attempts through ordinary lineage creation: violates inherited budget.

## Consequences

Recovery adds snapshot and operation-evidence handling within the existing change root, without replacing canonical Candidate identity. A crash can leave a deliberately blocked unknown outcome requiring exact reconciliation. Reversal after activation must preserve terminal history; old readers must not rediscover the special predecessor. The successor establishes verification of B, not proof of the missing A-to-B delta.
