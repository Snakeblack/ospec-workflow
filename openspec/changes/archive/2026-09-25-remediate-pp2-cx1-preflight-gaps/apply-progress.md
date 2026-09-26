# Apply Progress: remediate-pp2-cx1-preflight-gaps

**Mode**: Focused TDD  
**Branch**: `fix/pp2-cx1-preflight-remediation`  
**Delivery**: single PR (user-resolved); no size:exception  
**skill_resolution**: fallback-path  

## Batch summary

All tasks 1.1–4.2 implemented and locally verified. `state.yaml` not mutated by apply (runtime projection owns it).

## Completed tasks

| Task | Status | Local verification |
|---|---|---|
| 1.1 | [x] | RED fixture + pinned hex in Node reducer test |
| 1.2 | [x] | `legacyV267PayloadHash` + dual-accept; advances store canonical only |
| 1.3 | [x] | Go test pins same hex `05c6a85b…f15273` |
| 1.4 | [x] | Go frozen key-order legacy serialize + dual-accept |
| 1.5 | [x] | Node + Go: unrelated Q not noop |
| 1.6 | [x] | `node --test …/phase-completion-reducer.test.js` pass; `go test ./internal/hooks/ -run PhaseCompletion` ok |
| 2.1 | [x] | `missing_actual_route` when `routeSectionPresent` without actual_route |
| 2.2 | [x] | Legacy whole-`route` absence still table-evals; not for policy-bound |
| 2.3 | [x] | `selectRoute` distinction implemented |
| 2.4 | [x] | `extractStateRouteInfo.routeSectionPresent` + dispatch options |
| 2.5 | [x] | route-dispatcher + route-dispatch-run + validate-phase policy tests green |
| 3.1 | [x] | Global Claude temp layout reads project openspec |
| 3.2 | [x] | Global Cursor layout same root split |
| 3.3 | [x] | Collapsed plugin-only openspec fail closed |
| 3.4 | [x] | `pluginRoot` / `projectRoot` (`--workspace` \| `OSPEC_PROJECT_ROOT` \| cwd) |
| 3.5 | [x] | In-repo coincident roots still pass; validate-phase suite green |
| 4.1 | [x] | `consumer-inventory.md` written |
| 4.2 | [x] | Phase 1–3 suites green; apply did **not** edit hooks launch files |

## Files changed (this apply)

| File | Action | What was done |
|---|---|---|
| `scripts/lib/lifecycle-kernel/phase-completion-reducer.js` | Modified | Dual-accept replay hashes; export helpers |
| `scripts/lib/lifecycle-kernel/phase-completion-reducer.test.js` | Modified | v2.67 noop, Q not noop, canonical-on-advance |
| `internal/hooks/phase-completion-reducer.go` | Modified | Frozen legacy serialize + dual-accept |
| `internal/hooks/phase-completion-reducer_test.go` | Modified | Pinned hex noop + unrelated Q |
| `scripts/lib/route-dispatcher.js` | Modified | `routeSectionPresent` → `missing_actual_route` |
| `scripts/lib/route-dispatcher.test.js` | Modified | Policy-bound / legacy exception cases |
| `scripts/route-dispatch-run.js` | Modified | Propagate `routeSectionPresent` from state |
| `scripts/route-dispatch-run.test.js` | Modified | extractStateRouteInfo section presence |
| `scripts/validate-phase.js` | Modified | Split roots; collapsed fail closed; policy actual_route |
| `scripts/configure/validate-phase.js` | Modified | Call exported `main()` |
| `scripts/configure/validate-phase.test.js` | Modified | Claude/Cursor/collapsed/in-repo/policy tests |
| `openspec/changes/…/consumer-inventory.md` | Created | Approvals / lineage / recovery confirmation |
| `openspec/changes/…/tasks.md` | Modified | All tasks marked `[x]` |
| `openspec/changes/…/apply-progress.md` | Created | This file |

## Verification evidence (final)

```text
node --test scripts/lib/lifecycle-kernel/phase-completion-reducer.test.js \
  scripts/lib/route-dispatcher.test.js \
  scripts/route-dispatch-run.test.js \
  scripts/configure/validate-phase.test.js
→ tests 158, pass 158, fail 0

go test ./internal/hooks/ -run PhaseCompletion -count=1
→ ok
```

## Hooks exclusion check

Apply session did not Write/StrReplace `scripts/hooks/ospec-hooks-launch.js` or `ospec-hooks-launch.test.js`. Pre-existing working-tree diffs on those paths (mtime earlier than apply edits) were left untouched.

## Deviations from design

None — implementation matches design. `--workspace` and `OSPEC_PROJECT_ROOT` both supported (parity with route-dispatch-run workspace flag + env).

## Issues found

None.

## Workload / PR boundary

- Mode: single PR on `fix/pp2-cx1-preflight-remediation`
- Current work unit: full Unit 1
- Estimated review budget: within Medium forecast (~300–380 lines)

## Status

18/18 tasks complete. Ready for verify.
