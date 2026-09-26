# Design: Close PP2/CX1 Preflight Guarantees

## Technical Approach

Close the three leftover guarantees from `2.68.2` / remediate-pp2-cx1 without redesigning PP2/CX1. Map to change-local specs:

| Spec | Allocation |
|------|------------|
| REQ-agents-030 / REQ-install-027 | Orchestrator command uses real plugin install script path + `--workspace`; acceptance via independent Node process with foreign cwd |
| REQ-routing-016 | Persisted `route.actual_route` is authority; align `extractStateRouteInfo` / `readPersistedRouteInfo` (F-66efe8421b856f34) |
| REQ-lifecycle-kernel-029 | v2.67 noop only for Go’s frozen key order; no original-byte preservation |

No ADR. Decisions below are closed — apply as stated.

## Architecture Decisions

### Decision 1: Plugin path + `--workspace` (no new resolver)

**Choice**: In `agents/sdd-orchestrator.agent.md`, replace `node scripts/validate-phase.js PHASE_NAME ACTUAL_ROUTE_NAME CHANGE_NAME` with an invocation of the real plugin-install `scripts/validate-phase.js` plus explicit `--workspace <projectRoot>`. Reuse existing `resolveRoots` / `--workspace` in `scripts/validate-phase.js`. Do not add a path-resolver subsystem.

**Pin**: Update the generated-contract assert in `scripts/configure/real-repo.test.js` that currently matches the relative command string.

### Decision 2: Persisted `route.actual_route` authority + parser parity

**Choice**: In `scripts/route-dispatch-run.js`, treat `state.yaml` `route.actual_route` as authoritative. If `--persisted-route` (or context equivalent) disagrees with a non-empty persisted value, fail closed — do not substitute. In `scripts/validate-phase.js` `readPersistedRouteInfo`, drop the global `actual_route` fallback outside the `route:` block so both parsers match (closes F-66efe8421b856f34). Whole missing `route:` section remains the legacy pre-policy exception.

### Decision 3: Frozen-key-order v2.67 noop only

**Choice**: Node and Go accept legacy noop only when the envelope serializes in the frozen key order already implemented in Go (`schema_version` first; nested `question_gate` / question / option orders pinned). Other insertion orders are not a promised noop. Do not preserve or require original JSON bytes. Canonical hash path unchanged; new writes stay canonical-only.

## Data Flow

Pre-delegation: orchestrator runs plugin-rooted `validate-phase` with `--workspace` → project `openspec/` from workspace, plugin assets from install root → non-zero exit blocks subagent launch.

Continuation: read `state.yaml` → only `route.actual_route` under `route:` is authoritative → disagreeing `--persisted-route` fails closed; out-of-block `actual_route` ignored; absent entire `route:` → legacy exception.

Replay: envelope P → match stored hash against canonical or frozen-order legacy digest → noop (no revision++); other key orders do not match the frozen legacy digest.

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `agents/sdd-orchestrator.agent.md` | Modify | Plugin-install validate-phase path + `--workspace <projectRoot>` |
| `scripts/configure/real-repo.test.js` | Modify | Retarget command-string contract pin |
| `scripts/validate-phase.js` | Modify | Drop global out-of-block `actual_route` fallback |
| `scripts/configure/validate-phase.test.js` | Modify | Parser parity + **independent-process foreign-cwd** acceptance |
| `scripts/route-dispatch-run.js` | Modify | Persisted route authority; disagreeing `--persisted-route` fail-closed |
| `scripts/route-dispatch-run.test.js` | Modify | Authority / disagreement / out-of-block cases |
| `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` | Modify | Legacy hash via frozen key order (parity with Go) |
| `scripts/lib/lifecycle-kernel/phase-completion-reducer.test.js` | Modify | Frozen-order noop; non-frozen order not promised |
| `internal/hooks/phase-completion-reducer.go` | Modify | Keep/align frozen-order contract (doc + reject non-frozen promise) |
| `internal/hooks/phase-completion-reducer_test.go` | Modify | Go replay noop on frozen-order fixtures |

## Testing Strategy

| Concern | Trigger | Expected | Verification |
|---------|---------|----------|--------------|
| Plugin vs project roots | Independent Node process, `cwd` = consumer project **without** the script; invoke plugin script path + `--workspace` | Distinct roots; project `openspec/` used | **New test**: `validate-phase: independent Node process with foreign cwd proves root separation [REQ-install-027]` in `scripts/configure/validate-phase.test.js` (`spawn`/`execFile`, not in-process `main({ scriptDir })` alone) |
| Orchestrator command pin | Configure/real-repo walk of generated instructions | Matches plugin path + `--workspace` form | `scripts/configure/real-repo.test.js` |
| Route authority | Persisted R vs `--persisted-route` S; out-of-block key | Fail closed / ignore out-of-block; parsers agree | `route-dispatch-run.test.js` + validate-phase parser tests |
| v2.67 noop | Frozen-order envelope vs alternate insertion order | Frozen → noop; alternate → not legacy noop | Focused `node --test` on phase-completion-reducer + **Go replay test** in `internal/hooks/phase-completion-reducer_test.go` |

Runner: focused `node --test` on the touched JS suites; Go package test for reducer replay.

## Migration / Rollout

No migration required. No original-byte rewrite of historical envelopes.

## Open Questions

None — decisions closed in approval-context / proposal.
