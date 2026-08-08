# ADR-003: Deep Property Shape Validation in Identity Compute Functions

## Status
Accepted

## Context
`computeWorkOrderId` and `computeWorkResultId` previously checked top-level property presence without checking deep property shapes. This allowed objects with invalid `ownership: {}`, `budget: {}`, non-sha256 `dependencies`, `patch: 42`, or malformed `commands`/`logs`/`filesystem_inventory` array elements to produce a digest without error.

## Decision
Add deep property shape checks in `computeWorkOrderId` and `computeWorkResultId`:
- `computeWorkOrderId`: Validate `ownership` (`owner`, `mode`), `budget` (`model_turns`, `patches`, `commands`, `wall_time_minutes`, `changed_lines`), and `dependencies` items (`sha256:<64 hex>`).
- `computeWorkResultId`: Validate `patch` string type, `commands` items (`command`, `exit_code`, `duration_ms`), `logs` items (`stream` `"stdout"`|`"stderr"`, `content`), `filesystem_inventory` items (`path`, `sha256`, `mode`).

## Consequences
- Compute functions throw fail-closed on any deep property type or format violation.
- Prevents invalid nested structures from obtaining content-addressed identity digests.
