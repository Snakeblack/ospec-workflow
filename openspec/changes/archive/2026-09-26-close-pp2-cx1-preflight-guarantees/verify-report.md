## Verification Report

**Change**: close-pp2-cx1-preflight-guarantees
**Version**: 2.68.3
**Mode**: Focused TDD (not strict)

### Completeness
| Metric | Value |
|--------|-------|
| Tasks total | 10 |
| Tasks complete | 10 |
| Tasks incomplete | 0 |

### Build & Tests Execution
**Build**: ➖ Not required (Node scripts + Go hooks package; no separate build step)

**Tests**: ✅ Fresh re-run of apply-claimed suites (do not trust apply-progress alone)

```text
# 1) Focused Node suites (apply claim: 55 pass)
node --test scripts/configure/validate-phase.test.js scripts/route-dispatch-run.test.js scripts/lib/lifecycle-kernel/phase-completion-reducer.test.js
→ tests 55 | pass 55 | fail 0 | skipped 0 | duration_ms ~1487

# 2) Real-repo command pin (separate file; name pattern)
node --test --test-name-pattern "generated phase validator" scripts/configure/real-repo.test.js
→ tests 1 | pass 1 | fail 0 | duration_ms ~7483

# 3) Go frozen-order / status-first (apply-aligned filter)
go test ./internal/hooks/ -count=1 -run "V267|LegacyV267|StatusFirst" -v
→ PASS TestProjectPhaseCompletion_V267InsertionOrderHashIsNoopReplay
→ PASS TestProjectPhaseCompletion_V267NestedQuestionGateHashMatchesNodeAndNoops
→ PASS TestLegacyV267StatusFirstDigestDiffersFromFrozenOrder
→ ok github.com/snakeblack/ospec-workflow/internal/hooks (3 pass, 0 fail)

# Supplemental (REQ-lifecycle-kernel-029 recovery carryover)
go test ./internal/hooks/ -count=1 -run "Recover|Backup|\.bak|Orphan" -v
→ 3 pass (orphan .bak recovery + panic recovery paths)
```

**Totals recorded**: Node focused 55+1 = **56 pass / 0 fail**; Go V267 filter **3 pass / 0 fail**; supplemental recovery **3 pass / 0 fail**.

**Manual verification**: not performed (automated evidence sufficient)

**Coverage**: ➖ Not available (no coverage gate active; `quality_gates:` commented out in `openspec/config.yaml`)

### Spec Compliance Matrix

| Requirement | Scenario | Evidence Level | Source | Result | Notes |
|-------------|----------|----------------|--------|--------|-------|
| REQ-agents-030 | Pre-delegation invokes validate-phase via plugin install path with --workspace | `runtime-test` | `real-repo.test.js` > generated phase validator; `agents/sdd-orchestrator.agent.md` L234 | PASS | Pin: `node <pluginInstallRoot>/scripts/validate-phase.js … --workspace <projectRoot>` |
| REQ-agents-030 | Relative project-local command is insufficient for global install | `runtime-test` | `real-repo.test.js` `doesNotMatch` relative form without `--workspace` | PASS | |
| REQ-agents-030 | Failed validate-phase still blocks delegation | `static-lint` | `agents/sdd-orchestrator.agent.md` L235–236 (halt on exit 1) | PASS | Declarative agent contract co-located with command form |
| REQ-install-027 | Globally installed Claude Code validates project openspec | `runtime-test` | `validate-phase.test.js` > global Claude layout | PASS | |
| REQ-install-027 | At least one other globally installed target keeps the same root split | `runtime-test` | `validate-phase.test.js` > global Cursor layout | PASS | |
| REQ-install-027 | Collapsed roots on global install fail closed | `runtime-test` | `validate-phase.test.js` > collapsed global openspec | PASS | |
| REQ-install-027 | In-repo invocation remains valid when roots coincide | `runtime-test` | `validate-phase.test.js` > in-repo coincident roots | PASS | |
| REQ-install-027 | Independent Node process with foreign cwd proves root separation | `runtime-test` | `validate-phase.test.js` > independent Node process (`spawnSync`, cwd without script) | PASS | Sole acceptance is independent process, not in-process `main` |
| REQ-routing-016 | New change persists actual_route before continuation | `static-lint` | Orchestrator route stamp contract + policy fail-closed if missing | PASS | Unchanged persistence obligation; absence fails closed |
| REQ-routing-016 | New change without actual_route fails closed | `runtime-test` | `validate-phase.test.js` policy-bound; `route-dispatcher.test.js` missing_actual_route | PASS | |
| REQ-routing-016 | Pre-policy legacy absence remains explicit testable exception | `runtime-test` | `route-dispatcher.test.js` legacy exception; parser fixtures without `route:` | PASS | |
| REQ-routing-016 | --persisted-route does not override a different persisted actual_route | `runtime-test` | `route-dispatch-run.test.js` > authority over `--persisted-route` (`persisted_route_authority_conflict`) | PASS | |
| REQ-routing-016 | actual_route outside route block is not authoritative | `runtime-test` | `validate-phase.test.js` + `route-dispatch-run.test.js` out-of-block fixtures | PASS | Global fallback removed from `readPersistedRouteInfo` |
| REQ-routing-016 | Dispatcher and validate-phase parsers match on route block authority | `runtime-test` | `validate-phase.test.js` same fixtures → `readPersistedRouteInfo` ≡ `extractStateRouteInfo` | PASS | Closes F-66efe8421b856f34 |
| REQ-lifecycle-kernel-029 | Concurrent projection conflict triggers CAS conflict rejection | `runtime-test` | `phase-completion-reducer.test.js` > CAS conflict | PASS | |
| REQ-lifecycle-kernel-029 | Replaying identical phase completion payload produces zero-delta idempotent convergence | `runtime-test` | `phase-completion-reducer.test.js` > identical replay | PASS | |
| REQ-lifecycle-kernel-029 | v2.67 frozen-key-order hash replay is a zero-delta noop in Node and Go | `runtime-test` | Node insertion-order + nested tests; Go `V267InsertionOrder` + `V267Nested` | PASS | |
| REQ-lifecycle-kernel-029 | Semantically equal envelope with different key order is not a promised legacy noop | `runtime-test` | Node status-first test; Go `TestLegacyV267StatusFirstDigestDiffersFromFrozenOrder` | PASS | Bytes originals not required |
| REQ-lifecycle-kernel-029 | Unrelated payload hash is not treated as prior completion replay | `runtime-test` | `phase-completion-reducer.test.js` > unrelated Q | PASS | |
| REQ-lifecycle-kernel-029 | Recovery from interrupted write restores valid state without corruption | `runtime-test` | Go `TestProjectPhaseCompletion_RecoversOrphanBackupBeforeRead` (+ related) | PASS | Carryover; re-ran recovery filter |

**Compliance summary**: 20/20 scenarios satisfied at acceptable evidence levels

### Correctness (Static Evidence)
| Requirement | Status | Notes |
|------------|--------|-------|
| REQ-agents-030 | ✅ Implemented | Plugin path + `--workspace` in agent source; configure pin rejects relative form |
| REQ-install-027 | ✅ Implemented | `resolveRoots` + foreign-cwd `spawnSync` acceptance |
| REQ-routing-016 | ✅ Implemented | Authority fail-closed; no out-of-block fallback; parser parity |
| REQ-lifecycle-kernel-029 | ✅ Implemented | Legacy hash = frozen key order only; status-first ≠ noop |

### Coherence (Design)
| Decision | Followed? | Notes |
|----------|-----------|-------|
| D1 Plugin path + `--workspace` (no new resolver) | ✅ Yes | Reuses existing `--workspace` / `resolveRoots` |
| D2 Persisted `route.actual_route` authority + parser parity | ✅ Yes | Fail-closed disagreement; fallback removed |
| D3 Frozen-key-order v2.67 noop only | ✅ Yes | Node + Go; no original-byte preservation |

### Issues Found
**CRITICAL**: None
**WARNING**: None
**SUGGESTION**: None

### Traceability Matrix

| REQ | Tasks | Commits | Tests | Status |
|-----|-------|---------|-------|--------|
| REQ-agents-030 | 1.1, 1.2 | (uncommitted apply batch) | `real-repo.test.js` > generated phase validator | OK |
| REQ-install-027 | 1.3 | (uncommitted apply batch) | `validate-phase.test.js` > independent Node process / Claude / Cursor / collapsed / in-repo | OK |
| REQ-routing-016 | 2.1, 2.2, 2.3 | (uncommitted apply batch) | `route-dispatch-run.test.js` authority; `validate-phase.test.js` parser parity | OK |
| REQ-lifecycle-kernel-029 | 3.1, 3.2, 3.3 | (uncommitted apply batch) | Node reducer status-first + v2.67; Go `V267*` / `LegacyV267StatusFirst` | OK |

### Verdict
**PASS**

All MUST scenarios for the three leftover PP2/CX1 guarantees are met with fresh runtime evidence: plugin-path pre-delegation pin, foreign-cwd independent process, persisted-route authority with parser parity (F-66efe8421b856f34), and v2.67 noop limited to frozen key order (status-first not promised; original JSON bytes not preserved).
