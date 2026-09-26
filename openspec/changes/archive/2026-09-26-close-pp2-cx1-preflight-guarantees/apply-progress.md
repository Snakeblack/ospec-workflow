# Apply Progress: close-pp2-cx1-preflight-guarantees

**Mode**: Focused TDD  
**Branch**: `fix/close-pp2-cx1-preflight-guarantees`  
**Delivery**: ask-on-risk / single PR (forecast Low; Decision needed: No)

## Batch summary

Implemented all 10 tasks (Phases 1–4): plugin-path pre-delegation command + contract pin, independent-process foreign-cwd acceptance, persisted `route.actual_route` authority with parser parity, and v2.67 frozen-key-order legacy noop contract (status-first not promised).

## Task status

| Task | Status | Notes |
|------|--------|-------|
| 1.1 | [x] | `agents/sdd-orchestrator.agent.md`: `node <pluginInstallRoot>/scripts/validate-phase.js … --workspace <projectRoot>` |
| 1.2 | [x] | `real-repo.test.js` pin updated; rejects relative command without `--workspace` |
| 1.3 | [x] | Independent `spawnSync` with `cwd` = project without script; plugin script path + `--workspace` |
| 2.1 | [x] | `route-dispatch-run.js`: disagreeing `--persisted-route` → exit 1 `persisted_route_authority_conflict` |
| 2.2 | [x] | Removed global `actual_route` regex fallback from `readPersistedRouteInfo` |
| 2.3 | [x] | Authority + out-of-block + parser parity tests |
| 3.1 | [x] | Node comment/contract: legacy noop only for frozen key-order serialization |
| 3.2 | [x] | Frozen-order noop + status-first not noop tests |
| 3.3 | [x] | Go docs + `TestLegacyV267StatusFirstDigestDiffersFromFrozenOrder` |
| 4.1 | [x] | Focused Node + Go evidence below |

## Files changed

| File | Action | What |
|------|--------|------|
| `agents/sdd-orchestrator.agent.md` | Modified | Plugin install path + `--workspace` pre-delegation |
| `scripts/configure/real-repo.test.js` | Modified | Contract pin for new command form |
| `scripts/configure/validate-phase.test.js` | Modified | Foreign-cwd process test + parser parity |
| `scripts/validate-phase.js` | Modified | Drop out-of-block `actual_route` fallback |
| `scripts/route-dispatch-run.js` | Modified | Persisted route authority; fail-closed on disagreement |
| `scripts/route-dispatch-run.test.js` | Modified | Authority + out-of-block cases |
| `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` | Modified | Frozen-order-only legacy noop contract docs |
| `scripts/lib/lifecycle-kernel/phase-completion-reducer.test.js` | Modified | Status-first ≠ legacy noop |
| `internal/hooks/phase-completion-reducer.go` | Modified | Document frozen-order-only promise |
| `internal/hooks/phase-completion-reducer_test.go` | Modified | Status-first digest ≠ frozen digest |

## Focused TDD evidence (not strict table)

### RED → GREEN cycles (material behaviors)

1. **REQ-install-027 independent process**: wrote foreign-cwd `spawnSync` test; passed against existing `resolveRoots`/`--workspace` (GREEN without production change beyond prior roots split).
2. **REQ-routing-016 authority**: wrote disagreeing `--persisted-route` test (RED) → implemented fail-closed in `route-dispatch-run.js` (GREEN).
3. **REQ-routing-016 parser parity**: wrote out-of-block fixtures (RED vs old validate-phase fallback) → removed global regex (GREEN); both parsers agree.
4. **REQ-lifecycle-kernel-029 status-first**: wrote Node + Go digest/outcome tests; Node `JSON.stringify` insertion order rejects status-first as legacy noop; Go proves status-first bytes ≠ frozen digest.

### Local verification commands (2026-09-26)

```text
node --test scripts/configure/validate-phase.test.js scripts/route-dispatch-run.test.js scripts/lib/lifecycle-kernel/phase-completion-reducer.test.js
→ 55 pass, 0 fail

node --test --test-name-pattern "generated phase validator" scripts/configure/real-repo.test.js
→ 1 pass (all targets; pin + validator E2E)

go test ./internal/hooks/ -count=1 -run "V267|LegacyV267|StatusFirst|UnrelatedPayload"
→ ok

go test ./internal/hooks/ -count=1 -run "LegacyV267StatusFirst|V267Insertion|V267Nested" -v
→ PASS TestProjectPhaseCompletion_V267InsertionOrderHashIsNoopReplay
→ PASS TestProjectPhaseCompletion_V267NestedQuestionGateHashMatchesNodeAndNoops
→ PASS TestLegacyV267StatusFirstDigestDiffersFromFrozenOrder
```

Full `npm test` suite not run (orchestrator instructed focused runs only).

## Deviations from design

None — implementation matches design decisions 1–3.

## Issues found

None.

## Workload / PR boundary

- Mode: single PR
- Estimated review budget impact: within Low forecast (~280–340 lines)
- Ready for `sdd-verify`
