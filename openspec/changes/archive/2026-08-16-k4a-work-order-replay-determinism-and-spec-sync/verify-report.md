# Verification Report: K4a WorkOrder Replay Determinism and Spec Sync

```yaml
target_version: 2.45.5
base_sha: f3e5fa23488ad56c3daa7a3a7ad59d3709d665d0
release_sha: pending_pr_merge
verified_tree_digest: sha256:1f2dd1aaab3eec3070109c5bb5a4d64aa9e72c3c63c79b8e932c0b7ba91bf2e6
test_manifest_digest: sha256:016e3f2325b9639e7786c2da5c0066f1164f9faaaf74f3ea217b74aa12710630
tests_total: 2294
tests_passed: 2292
tests_failed: 0
tests_skipped: 2
targets_validated: 7
status: PASSED
```

## Summary of Verification

1. **WorkOrder Compilation Determinism**:
   - `compileWorkOrdersV2` is confirmed to be a pure deterministic function of `ExecutionGraph` and bound `SourceSnapshot`.
   - Supplying variable `role` or `budgets` throws `unsupported-compilation-context`.
   - WorkOrders emitted by `compileWorkOrdersV2(graph)` are 100% reproducible by `replayExecutionGraph(graph)` without out-of-band context.

2. **Replay Engine Strict Segregation**:
   - `replayExecutionGraph` strictly enforces `graph_id` and `work_order_id` provenance without escape hatch flags.
   - `replayLegacyFixtureGraph` provides the isolated path for legacy unpinned fixtures.

3. **Canonical Spec Synchronization**:
   - `openspec/specs/execution-graph-compiler/spec.md` updated with all strict provenance, obligation authority, shadow semantics, schema authority, and determinism requirements.

4. **Schema Authority Model**:
   - `schemas/kernel/execution-graph/v1.schema.json` ($defs.node) is authoritative for K4a with `minLength: 1`.
   - `schemas/kernel/graph-node/v1.schema.json` is confirmed frozen for K1 compatibility.

5. **Test Results**:
   - Total tests executed: 2294.
   - Passed: 2292.
   - Failed: 0.
   - Skipped: 2.
   - All 7 distribution targets validated: `claude`, `vscode`, `github-copilot`, `opencode`, `codex`, `cursor`, `antigravity`.
