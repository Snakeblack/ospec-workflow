# Archive Report: K4a Replay Provenance, Obligation Authority, Shadow Classification, and Graph Schema Hardening

- **Change**: `2026-08-16-k4a-replay-provenance-and-shadow-remediation`
- **Archived Date**: `2026-08-16`
- **Verification Status**: `PASSED`
- **Target Release Version**: `2.45.4`

## Summary of Accomplishments
1. **Strict Replay Fixture Provenance**: `replayExecutionGraph()` now enforces strict `graph_id` and `work_order_id` binding on all fixture nodes, rejecting unbound/stale fixtures fail-closed (`stale-fixture-rejected`).
2. **Authoritative Contract Obligations**: `compileExecutionGraph()` verifies that all caller obligations reconcile against `contract.obligations`, throwing `unknown-obligation-id` on unknown IDs.
3. **Shadow Comparator Parity Semantics**: `compareShadowExecution()` now returns `match: false` and `discrepancy_classification: "partial-match"` with populated `telemetryDiff` when baseline omits any graph dimension.
4. **Schema Hardening**: `execution-graph/v1.schema.json` and compiler enforce `minLength: 1` on all required identifier and descriptor strings.
5. **Adversarial Testing**: Added unit and integration test coverage for all 4 adversarial vectors across all execution tiers.
