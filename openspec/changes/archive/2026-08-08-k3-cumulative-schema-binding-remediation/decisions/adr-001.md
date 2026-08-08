# ADR-001: Mandatory JSON Schema Validation in Binding Gates

## Status
Accepted

## Context
Previous binding gate implementations in `validateWorkOrderBinding` and `validateWorkResultBinding` computed digests and compared declared IDs against recomputed IDs, but omitted JSON Schema validation. Consequently, a WorkOrder v2 or WorkResult v1 payload with invalid or missing schema properties (such as missing `status` or invalid `ownership`/`budget` objects) could pass binding validation if its declared ID matched `computeWorkOrderId`.

## Decision
Enforce cumulative validation (`schema-valid ∧ kind/version-valid ∧ ID-recomputed == ID-declared`) within `validateWorkOrderBinding` and `validateWorkResultBinding`.
- `validateWorkOrderBinding` MUST invoke schema validation for `SourceSnapshot` (`source-snapshot/v1`) and `WorkOrder` (`work-order/v2`) before returning success.
- `validateWorkResultBinding` MUST invoke schema validation for `WorkOrder` (`work-order/v2`) and `WorkResult` (`work-result/v1`) before returning success.

## Consequences
- Schema-invalid payloads fail binding gates immediately, even if declared digests match compute output.
- Eliminates contractual bypasses on work orders and work results.
