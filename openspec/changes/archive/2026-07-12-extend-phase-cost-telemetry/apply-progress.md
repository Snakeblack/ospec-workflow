# Apply Progress: extend-phase-cost-telemetry

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 1.1 | `scripts/hooks/subagent-stop.test.js`, `internal/modelconfig/models_test.go`, `internal/hooks/subagentstop_test.go` | Unit | ✅ 28/28 JS, 13/13 Go | ✅ Written | ✅ Passed | ✅ 5 JS cases, 4 Go cases | ✅ Clean | JS/Go model tier readers and context normalizers fully implemented and verified. |
| 1.2 | `scripts/configure/cli.test.js`, `scripts/hooks/ospec-hooks-launch.test.js` | Unit/Integration | ✅ 24/24 JS, 12/12 JS | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Bundled models.yaml in target configure trees and passed OSPEC_PLUGIN_ROOT in launcher. |
| 1.3 | `scripts/configure/cli.test.js`, `internal/modelconfig/models_test.go` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Verified matched JS/Go context suites and launcher fallback. |
| 2.1 | `scripts/lib/ospec-state.test.js` | Unit | ✅ 59/59 JS | ✅ Written | ✅ Passed | ✅ 3 sub-cases | ✅ Clean | Atomic relaunch flag check & write under advisory lock implemented. |
| 2.2 | `scripts/hooks/subagent-stop.test.js` | Unit | ✅ 30/30 JS | ✅ Written | ✅ Passed | ✅ 2 O1 cases | ✅ Clean | JS persistPhaseCost normalizes and resolves tier and writes O1 row. |
| 2.3 | `scripts/hooks/subagent-stop.test.js` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Fail-safe handling for serialization/filesystem errors confirmed. |
| 3.1 | `internal/store/store_test.go` | Unit | ✅ 15/15 Go | ✅ Written | ✅ Passed | ✅ 3 sub-cases | ✅ Clean | Go AppendPhaseCost transaction & relaunch flag check under withLock. |
| 3.2 | `internal/hooks/subagentstop_test.go` | Unit | ✅ 14/14 Go | ✅ Written | ✅ Passed | ✅ 2 Go cases | ✅ Clean | Go subagent stop hook calls NormalizeDispatchCostContext and writes O1 row. |
| 3.3 | `internal/hooks/subagentstop_test.go` | Unit | ✅ Passed | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Matches JS fields, fail-safe behavior, and ISO 8601 UTC timestamps. |
| 4.1 | `scripts/hooks/parity-contract.test.js`, `internal/hooks/subagentstop_test.go` | Integration | ✅ 9/9 JS, 13/13 Go | ✅ Written | ✅ Passed | ✅ 2 parity cases | ✅ Clean | Verifies cost records side-effects and parity in both JS and Go hook implementations. |
| 4.2 | `scripts/hooks/parity-contract.test.js`, `internal/hooks/subagentstop_test.go` | Integration | ✅ Passed | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Cleaned up temporary test artifacts; asserts parsed fields exactly. |
| 5.1 | `scripts/cost-block-contract.test.js` | Static/Unit | ✅ 7/7 JS | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Cost Block contract tests updated first; sdd-archive/SKILL.md updated to specify invocations, duration, tiers, statuses, sum of each token category and gates.*.questions_asked. |
| 5.2 | `scripts/cost-block-contract.test.js` | Static/Unit | ✅ Passed | ✅ Written | ✅ Passed | ➖ Single | ✅ Clean | Legacy C3 compatibility, empty fallback, and non-blocking archive behavior documented. |
| 6.1 | `scripts/check.js`, `go test ./...` | Suite | ✅ Passed | ➖ N/A | ✅ Passed | ➖ N/A | ✅ Clean | Full execution of JS/Go tests verifies zero regressions. |
| 6.2 | N/A | Spec | ✅ Passed | ➖ N/A | ✅ Passed | ➖ N/A | ✅ Clean | Confirmed implementation matches design.md and all requirements are met. |

## Reliability CRITICAL Remediation — 2026-07-11

Scope: E1 parity evidence only. No production writer, scanner, lock, or archive behavior changed; the accepted `size:exception` remains in force.

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|------|-----------|-------|------------|-----|-------|-------------|----------|-------------------|
| 4R-Reliability-E1 | `scripts/hooks/parity-contract.test.js`, `internal/hooks/subagentstop_test.go`, `internal/testdata/parity/subagent-stop-phase-cost-active-change.json` | Integration | ✅ JS parity 9/9; Go parity fixture family passed before edits | ✅ Go active fixture failed: `model_tier: got unknown, want premium` after complete-field assertions and UTF-8 fixture were introduced | ✅ JS parity 9/9; Go targeted parity passed after setting `OSPEC_PLUGIN_ROOT` to the same bundled-model root used by JS | ✅ Active UTF-8 row plus no-active-change path; JS SubagentStop/parity 40/40 and full `internal/hooks` Go package passed | ✅ Expected normalized fields are centralized per harness; timestamps are validated independently as ISO 8601 UTC | Both runtimes now assert phase, agent, four token estimates, duration, tier, status, relaunch, and UTC `ts`; JSON order remains non-contractual. |

### Remediation Test Summary

- **Parity harnesses strengthened**: 2 (JS and Go)
- **Shared fixtures strengthened**: 1 active-change UTF-8 fixture; existing no-active fixture retained as the alternate path
- **Focused verification**: `node --test scripts/hooks/parity-contract.test.js scripts/hooks/subagent-stop.test.js` → 40/40 passed; `go test ./internal/hooks -count=1` → passed
- **Production files changed by this remediation**: 0
- **Warnings intentionally not addressed**: scanner and lock WARNINGs remain out of scope
