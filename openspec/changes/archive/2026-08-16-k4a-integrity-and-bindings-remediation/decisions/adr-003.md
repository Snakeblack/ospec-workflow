# ADR-003: Extension of execution-graph/v1.schema.json for Clarify Context

- Status: proposed
- Change: k4a-integrity-and-bindings-remediation
- Date: 2026-08-16

## Context
When `applyClarifyEvent` mutates affected ExecutionGraph nodes by attaching clarification answers, the resulting nodes failed validation against `execution-graph/v1.schema.json` because `$defs/node` prohibited additional properties. This blocked clarified graphs from compiling to WorkOrder v2 or passing binding gates.

## Decision
Extend `$defs/node` in `schemas/kernel/execution-graph/v1.schema.json` to define an optional `clarification_context` object with required fields `event_id`, `question_id`, and `answer`, enforcing `additionalProperties: false`.

## Alternatives
- Strip `clarification_context` before schema validation: rejected because it discards the clarification audit trail and breaks replay traceability.
- Store clarification context in an external sidecar map: rejected because ExecutionGraph nodes must remain self-contained.

## Consequences
- Easier: Clarified graphs validate cleanly against schema and pass end-to-end WorkOrder compilation.
- Harder: Any extra unrecognized properties in `clarification_context` are rejected fail-closed.
- Reversibility: Medium; backward-compatible schema addition.
