# Proposal: Phase Envelope and State Mechanical Projection (CX1)

## Intent

Eliminate mechanical duplication and output divergence across SDD phases by introducing a versioned result envelope (targeting JSON-only execution with a decoupled human renderer) and a runtime-owned `PhaseCompletionReducer`. SDD phase agents currently duplicate output between human prose and fenced JSON while performing error-prone ad-hoc mutations to `state.yaml`. This change shifts state projection into a deterministic, mechanical kernel responsibility with Compare-And-Swap (CAS) and replay guarantees, ensuring models never infer state transitions or approvals.

## Scope

### In Scope
- **Versioned result envelope**: Schema definition (`result-envelope/v1`), strict validation, and decoupled human renderer for terminal/chat presentation.
- **PhaseCompletionReducer**: Runtime-owned reducer mechanically projecting validated phase completion payloads into authoritative change state (`state.yaml` and lifecycle node state) with CAS and replay determinism.
- **Legacy envelope adapter**: Backward compatibility translating unversioned fences and prose-adjacent envelopes to canonical payloads.
- **Preserved authority boundaries**: Absolute retention of human and gate authorities; approvals, assumptions, and quality gate states are never inferred by models or the reducer.

### Out of Scope
- Consolidating planning phases or agent invocations before K10.
- Moving approvals, decisions, or gate authority to LLM agents.
- Altering independent verification contracts, verifier isolation, or evidence collection.
- Eliminating human markdown summaries before consumers migrate.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `skills`: Define versioned result envelope emission contract (`result-envelope/v1`), decouple mechanical state projection from phase agents, and establish path to JSON-only returns with human renderer.
- `agents`: Update orchestrator to consume versioned envelopes and delegate state projection to the runtime reducer without LLM inference of phase transitions.
- `hooks`: Align `SubagentStop` hook with the versioned envelope schema and `PhaseCompletionReducer`, eliminating ad-hoc state file mutations.
- `lifecycle-kernel-runtime`: Implement runtime-owned `PhaseCompletionReducer` with pure transitions, CAS/replay determinism, and legacy envelope compatibility.
- `kernel-contract-schemas`: Register versioned schema family for result envelopes (`result-envelope/v1`) with pinned schemas, validation fixtures, and legacy mapping rules.

## Approach

1. **Envelope Contract & Validation**: Specify `result-envelope/v1` in `schemas/kernel/` and implement strict validation in `scripts/lib/result-envelope.js`. Implement a decoupled renderer that converts structured envelopes to human-readable prose.
2. **PhaseCompletionReducer**: Introduce a pure transition reducer under `scripts/lib/lifecycle-kernel/` that maps validated phase results (artifacts, summary, key decisions, status, blocker metadata) to `state.yaml` and lifecycle nodes. Wire advisory locks (`withFileLock`) and CAS primitives for replay determinism.
3. **Legacy Envelope Adapter**: Support unversioned and legacy formats in `scripts/lib/result-envelope.js`, normalizing them before reducer execution.
4. **Integration**: Update `SubagentStop` hook and orchestrator return handlers to trigger mechanical projection, removing phase-agent state mutation instructions.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `scripts/lib/result-envelope.js` | Modified | Versioned envelope schema validation, legacy adapter, human renderer |
| `scripts/lib/lifecycle-kernel/` | Modified | Implementation of `PhaseCompletionReducer` with CAS/replay projection |
| `scripts/lib/ospec-state.js` | Modified | State projection integration, surgical CAS updates, deprecate direct ad-hoc summary edits |
| `scripts/hooks/subagent-stop.js` | Modified | Delegate state persistence to `PhaseCompletionReducer` |
| `skills/_shared/sdd-phase-common.md` | Modified | Contract updates for versioned envelope emission and mechanical state projection |
| `schemas/kernel/` | Modified | Addition of `result-envelope` versioned JSON schema and fixtures |
| `tests/` and `scripts/*.test.js` | Modified | Parity, replay determinism, legacy compatibility, and CAS unit tests |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Divergence between legacy and versioned envelopes | Medium | Dual-path validation suite, comprehensive legacy adapter fixtures, and shadow projection testing |
| State mutation race conditions during subagent stop | Low | Replay-safe CAS with advisory file locking (`withFileLock`) and atomic write mechanisms |
| Accidental model inference of approval/gate status | Low | Enforce strict mechanical projection rules; reducer rejects uncommitted approvals or synthetic gate passes |

## Rollback Plan

All changes preserve backward compatibility via the legacy envelope adapter. If `PhaseCompletionReducer` encounters unexpected failures, toggle fallback to legacy `setPhaseSummary` / agent-side state writing without invalidating existing `state.yaml` files.

## Dependencies

- Existing lifecycle kernel runtime and CAS primitives (`lifecycle-kernel-runtime`, `execution-budgets`, `atomic-write.js`).
- CX0 telemetry and measurement baseline for monitoring projection divergence.

## Success Criteria

- [ ] Validated `result-envelope/v1` schema and decoupled human renderer functioning with zero prose divergence.
- [ ] `PhaseCompletionReducer` mechanically projects phase completions into `state.yaml` with verified CAS and replay idempotency.
- [ ] 100% equivalence between legacy envelope processing and versioned envelope processing across all existing change fixtures.
- [ ] No loss of approvals, assumptions, lineage, or quality gate state during projection.
- [ ] Phase agents relieved of mechanical `state.yaml` persistence boilerplate while preserving semantic authority.

> **Branch advisory:** Before `sdd-apply` begins, a feature branch SHOULD be created following the `<tipo>/<descripción>` convention defined in the `branch-pr` skill (e.g. `git checkout -b feat/my-change main`). This note is SHOULD, not MUST — omit it from `status: blocked` envelopes.
