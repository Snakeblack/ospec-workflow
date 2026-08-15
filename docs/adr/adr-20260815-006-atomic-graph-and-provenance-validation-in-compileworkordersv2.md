# ADR-006: Atomic Graph and Provenance Validation in compileWorkOrdersV2

- Status: proposed
- Change: k4a-execution-graph-compiler-replay
- Date: 2026-08-15

## Context
Compiling Work Orders from an unverified or corrupted Execution Graph, or executing against mismatched SourceSnapshot provenance, risks privilege escalation, partial order execution, and divergent code evaluation.

## Decision
Enforce fail-closed atomic validation in `compileWorkOrdersV2` prior to emitting any Work Order: validate graph schema conformance, valid `source_snapshot_id`, exact byte-for-byte match with any context SourceSnapshot, coarse semantic node validity (no microscopic operations, valid ownership, objectives, evidence, acyclic dependencies), and complete Obligation Manifest satisfaction. If any check fails, zero Work Orders are emitted.

## Alternatives
- Partial emission with per-node error logging: rejected because downstream consumers could execute incomplete order sets or bypass safety guards.
- Late runtime validation in worker dispatcher: rejected because invalid or unverified graphs must never reach execution preparation.

## Consequences
- Easier: Guarantees all emitted WorkOrder v2 items share validated, consistent provenance and graph integrity with zero intermediate corrupted state.
- Harder: Any defect in a single node, obligation, or snapshot identifier blocks the entire batch compilation.
- Reversibility: Highly reversible within compiler validation logic.
