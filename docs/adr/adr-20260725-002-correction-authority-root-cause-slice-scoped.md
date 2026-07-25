# ADR-002: Make correction authority root-cause-slice scoped

- Status: accepted
- Change: review-remediation-slices
- Date: 2026-07-22
- Archived: 2026-07-25

## Context
A lineage-wide 200-line allowance and atomic unresolved set made unrelated causes consume one another's budget and reopened already satisfied findings.

## Decision
Freeze an evidence-backed manifest that partitions blocking findings into root-cause slices. Give each slice the established line cap and three failed attempts, validate only the active slice, and reopen passed state only through exact impacted-slice regression evidence. Exhaustion does not authorize a successor.

## Alternatives
- Split one shared budget: preserves cross-cause coupling.
- Reset a budget per attempt: removes a finite bound.
- Infer groups from text similarity: non-deterministic across language and wording.

## Consequences
Independent causes progress monotonically and remain bounded. Manifest production and migration need strict evidence validation, and ambiguous legacy regressions fail closed instead of being guessed.
