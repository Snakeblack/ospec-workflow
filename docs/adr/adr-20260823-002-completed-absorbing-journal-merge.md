# ADR-002: Completed Is Absorbing in Journal Merge

- Status: proposed
- Change: k5-usage-accounting-integrity
- Date: 2026-08-22

## Context
Journal records are durable evidence used to suppress effect re-execution. Current last-incoming-wins upsert lets a stale writer replace `completed` and its result with a lower-progress status.

## Decision
Use one shared journal merge primitive in AuthorityStore, MemoryStore, and FileSystemStore. For a matching `effect_id`, an existing `completed` record survives incoming `planned`, `started`, `failed`, or `unknown` records, including its complete result evidence. Other transitions retain current incoming-wins behavior.

## Alternatives
- Patch each store independently: rejected because duplicated semantics can drift.
- Define a total order for every status: rejected because the contract does not establish precedence between failure and ambiguity.
- Reject stale commits entirely: rejected because distinct peer effects still need merge-safe preservation.

## Consequences
Replay evidence cannot regress, while distinct effects and winner-only ticket deletion remain unchanged. A small shared module is added; AuthorityStore re-exports the helper for compatibility.
