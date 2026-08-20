# Design: Reconcile K4a Replay Completion Contract and Formalize ReplayFixtureResult

## Technical Approach

This design establishes the exact, minimal contractual architecture for `ReplayFixtureResult` in the K4a deterministic Replay Engine (`scripts/lib/execution-graph/replay-engine.js`), reconciling REQ-006 in `openspec/specs/execution-graph-compiler/spec.md` and preparing release v2.45.7.

The technical approach addresses four core objectives:
1. **Contract Formalization**: Formulate the canonical `ReplayFixtureResult` contract across 6 explicit evaluation dimensions: Provenance, Terminal Status, Exit Code Consistency, Evidence Object Structure, Node Required Evidence Coverage, and Post-evaluation Obligation Satisfaction.
2. **Ambiguity Elimination**: Eliminate the vague requirement of "missing output fields" from the specification and runtime definitions without creating synthetic or redundant output schemas that would compete with the existing, authoritative `evidence` dictionary.
3. **Kernel Boundary Preservation**: Keep K4a replay strictly focused on deterministic fixture evaluation over compiled Execution Graphs. Live worker execution structures (`WorkResult`, worker process isolation, execution permits) remain strictly deferred to K6a / K4b, while dynamic obligation causality remains decoupled before K5.
4. **Adversarial Contract Hardening**: Provide an exhaustive test matrix in `scripts/lib/execution-graph/replay-engine.test.js` validating all positive paths, fail-closed rejections, edge cases, and reproducible counterexample traces.

---

## Architecture Decisions

### Decision: Formalize Minimal ReplayFixtureResult Contract and Eliminate "Missing Output Fields"

**Choice**: Define `ReplayFixtureResult` through 6 deterministic completion dimensions, designating the `evidence` object (`Record<string, object>`) as the sole authoritative container for node outputs and proofs. Remove the undefined phrase "missing output fields" from REQ-006.

| Option | Trade-offs | Verdict |
|---|---|---|
| **6-Dimension ReplayFixtureResult (Chosen)** | Minimal, unambiguous, fully maps to existing evidence models without redundant schemas | **Accepted** |
| **Introduce Parallel `outputs` Schema** | Duplicates evidence dictionary, bloats fixture schema, creates ambiguity with K6a `WorkResult` | **Rejected** |
| **Keep Status Quo with "Missing Output Fields"** | Leaves output validation open-ended, causes contract drift and testing gaps | **Rejected** |

**Rationale**: In deterministic replay, node execution outputs are represented and verified by their cryptographic evidence artifacts (`node.required_evidence`). Introducing a separate `outputs` property or schema would create redundancy and conflict with worker isolation contracts in K6a. Treating `evidence` as the closed output container completely satisfies output discrimination.

---

### Decision: Strict Preservation of Kernel Layer Boundaries

**Choice**: Restrict K4a Replay to pure in-memory DAG evaluation against pre-recorded fixtures. Live worker execution structures (`WorkResult`), execution permits, and capsule environments remain in K6a / K4b. Obligation satisfaction remains a declarative post-DAG evaluation check rather than dynamic backwards causality (governed by K5).

| Option | Trade-offs | Verdict |
|---|---|---|
| **Preserve Strict K4a Boundaries (Chosen)** | Clean kernel progression; K4a delivers replay foundation without entanglement with live workers | **Accepted** |
| **Import Live `WorkResult` into K4a** | Couples deterministic replay to live worker transport and unreleased K6a execution schemas | **Rejected** |
| **Implement Dynamic Obligation Causality in K4a** | Couples replay topological sort to runtime recovery mechanisms that belong to K5 | **Rejected** |

**Rationale**: Layering integrity is paramount in the OSPEC harness evolution. K4a provides the deterministic Execution Graph compilation, Obligation Manifest, and replay engine. K5 introduces budgets, failure handling, and recovery causality. K6a/K4b introduce worker capsules and live shadow execution. Keeping these decoupled ensures determinism and modular verification.

---

### Decision: Segregation of Canonical vs Legacy Replay Surfaces

**Choice**: Enforce 100% strict provenance (`graph_id` matching `graph.graph_id` and `work_order_id` matching compiled `WorkOrder`) in `replayExecutionGraph()`, rejecting all unpinned fixtures and ignoring legacy bypass options. Segregate legacy unpinned fixture support entirely into `replayLegacyFixtureGraph()`.

| Option | Trade-offs | Verdict |
|---|---|---|
| **Strict Segregation (Chosen)** | Guarantees canonical replay cannot be bypassed; preserves legacy test fixtures in dedicated helper | **Accepted** |
| **Allow Bypass Flags in Canonical Replay** | Re-introduces security and provenance bypass risks into production replay path | **Rejected** |
| **Delete Legacy Replay Helper Entirely** | Breaks backwards compatibility for historical test suites and legacy fixture baselines | **Rejected** |

**Rationale**: A single replay entry point with optional bypass flags creates a surface for accidental lax validation. Strict separation guarantees that canonical replay is always fail-closed.

---

## Data Flow

```
   ┌────────────────────────────────────────────────────────┐
   │ ExecutionGraph + FixtureResults Map                    │
   └───────────────────────────┬────────────────────────────┘
                               │
                               ▼
        ┌─────────────────────────────────────────────┐
        │ validateExecutionGraphBinding(graph)        │ ──► [Fail: graph-id-mismatch]
        └──────────────────────┬──────────────────────┘
                               │
                               ▼
        ┌─────────────────────────────────────────────┐
        │ topologicalSort(graph.nodes)                │ ──► [Fail: cyclic-dependency-detected]
        │ compileWorkOrdersV2(graph)                  │ ──► [Fail: work-order-compilation-failed]
        └──────────────────────┬──────────────────────┘
                               │
                               ▼
            ┌──────────────────────────────────────┐
    ┌──────►│ For each Node in Topological Order   │
    │       └──────────────────┬───────────────────┘
    │                          │
    │                          ├─► [Unfulfilled Prerequisites?] ──► Mark Node Blocked
    │                          │
    │                          ├─► [Missing Fixture Result?] ────► Mark Node Blocked / Unfulfilled
    │                          │
    │                          ├─► [Validate Strict Provenance] ──► [Fail: stale-fixture-rejected]
    │                          │   (graph_id == graph.graph_id && work_order_id == wo.work_order_id)
    │                          │
    │                          ├─► [Check Terminal Status & Exit Code] ──► Contradictory? ──► Mark Node Failed
    │                          │   (status/outcome == "completed", ok !== false, exit_code === 0)
    │                          │
    │                          ├─► [Validate Evidence Object Type] ─────► Non-object/Array? ──► Mark Node Failed
    │                          │   (typeof evidence === "object" && !Array.isArray(evidence))
    │                          │
    │                          ├─► [Verify node.required_evidence] ────► Missing Keys? ──► Mark Node Failed
    │                          │   (node.required_evidence ⊆ Object.keys(recorded.evidence))
    │                          │
    │                          └─► [Success] ──► Mark Node Completed, Ingest Evidence into collectedEvidence
    │                                                     │
    └─────────────────────────────────────────────────────┘
                               │
                               ▼
        ┌─────────────────────────────────────────────┐
        │ Post-Evaluation Obligation Verification     │
        │ - All non-deferred MUST obligations checked │
        │ - implemented_by nodes completed?           │
        │ - required_evidence keys in collected?      │
        └──────────────────────┬──────────────────────┘
                               │
                               ▼
        ┌─────────────────────────────────────────────┐
        │ Compute finalStateDigest & Counterexample   │
        └──────────────────────┬──────────────────────┘
                               │
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │ ReplayExecutionResult { ok, completed, failed, blocked,│
   │                         finalStateDigest, trace, cex } │
   └────────────────────────────────────────────────────────┘
```

---

## File Changes

| File | Action | Description |
|---|---|---|
| `openspec/specs/execution-graph-compiler/spec.md` | Modify | Update REQ-006 to formalize the 6 completion dimensions of `ReplayFixtureResult`, remove ambiguous "missing output fields", and align scenarios. |
| `scripts/lib/execution-graph/replay-engine.test.js` | Modify | Add exhaustive, adversarial test suite validating each of the 6 dimensions, failure modes, counterexamples, and idempotency. |
| `package.json` | Modify | Bump package version from `2.45.6` to `2.45.7`. |
| `CHANGELOG.md` | Modify | Add release notes for v2.45.7 detailing the K4a completion contract reconciliation. |
| `docs/roadmaps/harness-evolution.md` | Modify | Align K4a status, release provenance, and Done criteria for v2.45.7. |
| `openspec/changes/k4a-replay-completion-contract-reconciliation/decisions/adr-001.md` | Create | Architectural Decision Record documenting `ReplayFixtureResult` contract formalization and boundary preservation. |
| `openspec/changes/k4a-replay-completion-contract-reconciliation/design.md` | Create | Technical design artifact documenting the reconciled architecture. |
| `openspec/changes/k4a-replay-completion-contract-reconciliation/state.yaml` | Modify | Update SDD workflow state and phase tracking. |

---

## Interfaces / Contracts

### 1. Canonical ReplayFixtureResult Contract

```javascript
/**
 * Minimal canonical recorded result for a single node in deterministic replay.
 * @typedef {Object} ReplayFixtureResult
 * @property {string} graph_id - Non-empty string matching ExecutionGraph.graph_id byte-for-byte.
 * @property {string} work_order_id - Non-empty string matching compiled WorkOrder.work_order_id byte-for-byte.
 * @property {boolean} [ok] - Boolean status flag. Must not be false for completed nodes.
 * @property {"completed"|"failed"|"cancelled"} [status] - Execution status.
 * @property {"completed"|"failed"|"cancelled"} [outcome] - Execution outcome indicator.
 * @property {number} [exit_code] - Numeric process exit code. Must equal 0 if status is completed.
 * @property {Object.<string, Object>} evidence - Non-null, non-array dictionary of evidence items.
 * @property {string[]} [logs] - Optional replay logs/messages.
 * @property {string} [error] - Diagnostic error description if node failed.
 */
```

### 2. Six Dimensions of Completion Evaluation

| # | Dimension | Evaluation Rule in Replay | Fail-Closed Result |
|---|---|---|---|
| 1 | **Provenance** | `recorded.graph_id === graph.graph_id` AND `recorded.work_order_id === expectedWo.work_order_id` | Throws `stale-fixture-rejected` with `node_id` |
| 2 | **Terminal Status** | `(status === "completed" \|\| outcome === "completed")` AND `ok !== false` AND `status/outcome !== "cancelled" / "failed"` AND no contradiction | Node marked `failed` (or `cancelled`) |
| 3 | **Exit Code** | `typeof exit_code !== "number" \|\| exit_code === 0` (non-zero contradicts `completed`) | Node marked `failed` |
| 4 | **Evidence Object** | `typeof recorded.evidence === "object"` AND `recorded.evidence !== null` AND `!Array.isArray(recorded.evidence)` | Node marked `failed` |
| 5 | **Node Required Evidence** | `∀ key ∈ node.required_evidence: key ∈ Object.keys(recorded.evidence)` | Node marked `failed`, downstream blocked |
| 6 | **Obligation Satisfaction** | `∀ obl ∈ graph.obligations (must, non-deferred): (implemented_by ⊆ completedNodes) ∧ (required_evidence ⊆ collectedEvidence)` | `replay.ok = false`, emits `counterexample` |

### 3. Replay Return Structure

```javascript
/**
 * Outcome of deterministic replay execution.
 * @typedef {Object} ReplayExecutionResult
 * @property {boolean} ok - True if all graph nodes completed and all MUST obligations satisfied.
 * @property {string[]} completedNodes - List of successfully completed node IDs.
 * @property {string[]} failedNodes - List of node IDs that failed validation or execution.
 * @property {string[]} blockedNodes - List of node IDs blocked by unfulfilled dependencies.
 * @property {string} finalStateDigest - Deterministic sha256 digest of final node outcomes.
 * @property {Array<Object>} trace - Chronological array of node evaluation records.
 * @property {Object|null} counterexample - Diagnostic structure if ok is false.
 */
```

---

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| **Contract / Unit** | Provenance verification (Dimension 1) | Verify `replayExecutionGraph` throws `stale-fixture-rejected` on missing `graph_id`, empty `graph_id`, mismatched `graph_id`, missing `work_order_id`, and mismatched `work_order_id`. |
| **Contract / Unit** | Terminal status & contradictions (Dimension 2) | Verify rejection of `status: "cancelled"`, `outcome: "failed"`, `ok: false`, and contradictory pairings (`status: "completed"` + `outcome: "failed"`, `status: "completed"` + `ok: false`). |
| **Contract / Unit** | Exit code consistency (Dimension 3) | Verify `exit_code: 0` succeeds; verify `exit_code: 1`, `exit_code: -1`, `exit_code: 255` claiming `completed` fails closed. |
| **Contract / Unit** | Evidence object validation (Dimension 4) | Verify valid plain object `{}` succeeds; verify `evidence: null`, `evidence: undefined`, `evidence: []` (array), `evidence: "str"`, `evidence: 123` fail closed as incomplete. |
| **Contract / Unit** | Node required evidence coverage (Dimension 5) | Verify full coverage completes node; verify missing subset marks node failed, lists `missing_evidence`, and blocks downstream dependents. |
| **Contract / Unit** | Graph obligation satisfaction (Dimension 6) | Verify replay returns `ok: true` when all MUST obligations are satisfied; verify `ok: false` with detailed `counterexample` when an obligation lacks implementing node or evidence; verify deferred obligations are respected. |
| **Contract / Unit** | Invalidation & clarify immunity | Verify clarify events invalidate nodes, stale fixtures are rejected (`stale-fixture-rejected`), and cannot resurrect invalidated nodes. |
| **Contract / Unit** | Idempotency & determinism | Verify multiple evaluations of identical fixtures produce identical `finalStateDigest` and `trace`. |
| **Contract / Unit** | Legacy replay segregation | Verify unpinned fixtures throw in `replayExecutionGraph` even with `allowLegacyFixtures: true`, but succeed in `replayLegacyFixtureGraph`. |
| **Integration** | Full pipeline verification | Run `node scripts/check.js` (including test suite and target generators) to verify zero regressions. |

---

## Migration / Rollout

### Rollout Plan for v2.45.7

1. **No Runtime State Migration**: Replay is an in-memory evaluator; no persistent database, schema migration, or breaking file format change is required.
2. **Version Bump**: Bump version in `package.json` to `2.45.7`.
3. **Changelog & Documentation**:
   - Add section `[2.45.7] - 2026-08-20` in `CHANGELOG.md` documenting the reconciliation of REQ-006, formalization of `ReplayFixtureResult`, and adversarial test additions.
   - Update `docs/roadmaps/harness-evolution.md` with release metadata.
4. **Validation**: Execute `npm test` (`node scripts/check.js`) to guarantee 100% test pass rate across all suites.
5. **Rollback Plan**: Revert git commits (`git checkout main -- <files>`).

---

## Open Questions

- None. All architectural decisions and contract dimensions are finalized and aligned with the specification delta.
