# Design: Compact Lite Contract and Consumer Compatibility

## Technical Approach

Keep the existing five-phase `lite` route and make its artifact set explicit. `state.yaml.route.actual_route` is authoritative; launch-time mode is only a consistency check. Consumers require artifacts produced by preceding lite phases, while routes declaring `sdd-spec` or `sdd-design` retain those dependencies.

The implementation reuses `validatePhaseTransition`, `resolveRemainingTasks`, `setPhaseSummary`, and the archive snapshot/fingerprint pipeline. It adds no route, phase, dependency, or new state schema.

## Architecture Decisions

### Decision: Resolve dependencies from the persisted route

**Choice**: Define the route-aware artifact matrix in `skills/_shared/openspec-convention.md`; each phase skill reads `actual_route` before loading planning context. Extend `validatePhaseTransition`/`validate-phase.js` to enforce the same prerequisites.

**Alternatives considered**: Trust launch-mode prose (can drift after restart); create empty spec/design files (fabricates planning); introduce a new resolver service (unnecessary for a bounded file contract).

**Rationale**: `REQ-routing-015`, `REQ-skills-017`, and `REQ-agents-028` make persisted route identity authoritative and require recoverable failure on missing lite artifacts.

**Evidence and consequences**: The route table declares the order, and `flow-validator.js` already derives several prerequisites. The extension is reversible but requires producer/consumer parity. See ADR-001.

### Decision: Compact by reference, not by removing evidence

**Choice**: Keep the lite proposal ceiling, assign stable `AC-N` labels to acceptance checks, and reference them from tasks, progress, and verify instead of copying prose. Lite tasks omit full spec/design reconciliation.

**Alternatives considered**: Lower an arbitrary word limit (no measured baseline); repeat acceptance prose in every artifact (preserves current amplification); merge phases/envelopes (belongs to CX1).

**Rationale**: The roadmap defines compaction as expressing a decision once while retaining acceptance, rollback, task status, and independent evidence. `setPhaseSummary` already enforces a 160-character factual summary bound.

**Evidence and consequences**: Later phases preserve labels and evidence links. Existing artifacts remain readable; no migration is required.

### Decision: Validate archive completeness against route minimums and exact bytes

**Choice**: Preserve schema v1. For lite, require state, lite proposal, tasks, apply progress, verify report, and the new archive report; allow empty spec/ADR writes. Retain exact inventory, fingerprint, hash, staging, compare, and receipt checks.

**Alternatives considered**: Validate only listed files (can omit evidence); require standard artifacts (rejects valid lite); add a schema-v2 route field (duplicates `state.yaml`).

**Rationale**: `REQ-archive-plan-contract-004` permits no spec writes but does not relax integrity or runtime close authority.

**Evidence and consequences**: `archive-plan.js` already emits allowlisted integrity codes and `archive-transaction.js` owns the snapshot. Unexpected full-planning artifacts block silent closure until reconciled; they are never ignored.

## Data Flow

```text
state.yaml.actual_route + configured route phases
                    |
                    v
       route-aware artifact prerequisites
          /          |             \
 proposal-lite -> tasks -> apply-progress -> independent verify-report
                                                |
                                                v
                              archive report + schema-v1 plan
                                                |
                          snapshot/hash/compare/receipt runtime
```

Missing artifacts block transition/recovery; archive mismatches stop before live writes. Apply reads tasks and prior progress, resolves completed work, then merges the batch.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `skills/_shared/openspec-convention.md` | Modify | Canonical route artifact matrix. |
| `skills/sdd-propose/SKILL.md`, `skills/sdd-tasks/SKILL.md` | Modify | Compact proposal with `AC-N`; lite-only task shape. |
| `skills/sdd-apply/SKILL.md`, `skills/sdd-verify/SKILL.md`, `skills/sdd-archive/SKILL.md` | Modify | Persisted-route reads, progress, evidence, archive inventory. |
| `agents/sdd-{propose,tasks,apply,verify,archive}.agent.md` | Modify | Route-appropriate launch/read contract. |
| `agents/sdd-orchestrator.agent.md` | Modify | Recover the next declared lite phase from state/artifacts and block on missing prerequisites without promotion. |
| `rules/sdd-common.instructions.md`, `rules/sdd-openspec.instructions.md` | Modify | Align source instructions; do not hand-edit targets. |
| `scripts/lib/flow-validator.js`, `scripts/configure/validate-phase.js` | Modify | Enforce route predecessor artifacts. |
| `scripts/lib/archive-plan.js`, `scripts/lib/archive-transaction.js` | Modify | Validate lite minimum inventory from state without schema change. |
| `scripts/lib/flow-validator.test.js`, `scripts/configure/validate-phase.test.js` | Modify | Fresh/resumed lite and standard dependency regressions. |
| `scripts/lib/apply-resume.test.js`, `scripts/hooks/pre-compact.test.js`, `scripts/hooks/subagent-stop.test.js` | Modify | Continuity and summary evidence. |
| `scripts/lib/archive-plan.test.js`, `scripts/lib/archive-transaction.test.js` | Modify | Lite success and fail-closed inventory cases. |
| `scripts/configure/real-repo.test.js` | Modify | Generate and inspect the six required targets for phase order and route-aware consumer parity. |
| `scripts/compact-lite-contract.test.js` | Create | Source contract fixture covering compact producers, independent verify, normal regression, and no filler artifacts. |

## Interfaces / Contracts

| Active contract | Required planning/evidence inputs |
|---|---|
| `lite` | `proposal-lite.md` (`Change Class`, intent/boundaries, `AC-N`, risk/rollback) -> `tasks.md` -> optional prior then merged `apply-progress.md` -> `verify-report.md` |
| Route declares `sdd-spec`/`sdd-design` | `proposal.md`, change-local specs, `design.md`, then tasks/progress/verify as declared |

`state.yaml` keeps `route.actual_route`, per-phase artifact paths/status, summaries (maximum 160 code points), key decisions (maximum three), approvals, assumptions, gates, and progress references. Absence of spec/design is valid only for lite; a prompt/state route conflict or missing required artifact blocks rather than selecting another contract.

## Requirement Allocation

| MUST scenario | Allocation and verification |
|---|---|
| Eligible fresh lite / no filler | route table unchanged; propose/tasks skills plus `compact-lite-contract.test.js`. |
| Public API floor rejects lite | unchanged `change-classification.js`/`route-dispatcher.js`; existing floor tests plus regression assertion. |
| Route definition does not expand | `openspec/config.yaml`; route-dispatcher and real-repo assertions pin five phases/no new route. |
| Resumed lite apply retains progress | `sdd-apply` + `resolveRemainingTasks`; two-batch `apply-resume.test.js`. |
| Lite verify is independent | `sdd-verify` maps `AC-N` directly to source/tests; source contract test rejects reliance on apply narrative. |
| Standard keeps full dependencies | flow/CLI standard fixture requires proposal/spec/design; missing input fails. |
| Lite continuation resumes | orchestrator Recovery Rule + pre-compact fixture selects next incomplete declared phase. |
| Lite summary factual/compact | common persistence contract + `setPhaseSummary`; subagent-stop tests bound/derive values. |
| Lite records measurable | state route/artifact refs remain; fixture asserts they survive recovery unchanged. |
| Missing lite planning artifact blocks | flow/CLI fixtures omit proposal-lite or tasks and assert recoverable rejection. |
| Six targets accept lite inventory | `real-repo.test.js` generates claude, vscode, github-copilot, opencode, codex, cursor and exercises lite prerequisites. |
| Divergent target fails parity | same test asserts route-aware anchors in every generated consumer; an unconditional spec/design read fails the assertion. |
| Normal target remains complete | generated standard fixture fails without proposal/spec/design and passes when complete. |
| Complete lite plan/no spec writes | archive validator/runtime fixture uses empty arrays and exact lite inventory. |
| Invented design blocks archive | plan snapshot test expects `inventory-mismatch`; transaction asserts no live mutation. |
| Wrong fingerprint/omitted verify blocks | plan/runtime fixtures expect allowlisted integrity rejection before staging/commit. |

## Testing Strategy

| Concern | Trigger and conditions | Expected response | Verification |
|---|---|---|---|
| Route dependency safety | Fresh/resumed lite and standard artifacts | Only route-produced predecessors are required; missing ones block | Unit `flow-validator`, CLI integration |
| Evidence continuity | Second apply batch after completed/partial work | Old entries survive; completed task is not rerun | `apply-resume.test.js` plus contract inspection |
| Independent verification | Lite has no spec/design | Acceptance is checked from proposal-lite and live evidence | Contract fixture plus repository test/build commands during verify |
| Archive integrity | Empty spec writes, stale hash, omitted/present extra files | Valid lite closes only via receipt; invalid plan mutates nothing | Plan unit and transaction integration tests |
| Projection parity | Source generated to six targets | Equivalent sequence, reads, recovery, archive obligations | `real-repo.test.js` generated-tree assertions |

Run focused Node tests, then `npm test` for the suite and target builds. Artifact/read-volume improvement remains a cohort measurement, not a fabricated threshold.

## Migration / Rollout

No data migration or flag is required. Existing changes keep their route and artifacts. Ship contracts, validators, archive checks, and parity tests together; regenerate targets. Roll back together without deleting evidence.

## Open Questions

None.
