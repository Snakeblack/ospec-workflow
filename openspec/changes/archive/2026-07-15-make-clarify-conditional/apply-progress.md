# Apply Progress: Make Clarify Truly Conditional

## Status

- Result: complete
- Delivery: single cohesive `size:exception` apply
- Work units: validators; signal gate and hooks; generated-target parity
- Tasks completed: 20/20 (1.1 through 4.4)

## Implementation Summary

Successful `sdd-spec` envelopes now require four ordered, typed ambiguity
signals when validated with phase context. Generic validator entry points remain
backward compatible, while the JS and Go SubagentStop call sites pass the
resolved phase and reject incomplete successful spec envelopes.

The orchestrator now fails closed on an invalid successful spec result and
delegates valid skip/run evaluation to the clarify handler. False plus three
empty arrays records `skipped`; any positive signal runs the existing handler.
Clarify remains outside route phases and is never sent through
`validate-phase.js`. All five generated profiles preserve the same contract.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| 1.1 | `scripts/lib/result-envelope.test.js` | Unit | 26/26 PASS | 3 new failures observed | 32/32 PASS | Missing/type/order cases | Shared constants retained | New JS contract failed before implementation. |
| 1.2 | `internal/resultenvelope/resultenvelope_test.go` | Unit | package PASS | Compile failed: `ValidateForPhase` undefined | package PASS | Mirrored JS cases | Table-oriented parity | Go entry point did not exist at RED. |
| 1.3 | `scripts/lib/result-envelope.test.js` | Unit | 26/26 PASS | Covered by 1.1 | 32/32 PASS | Generic and phase-aware paths | `validateStringArrayField` extracted | `validateEnvelope(obj)` remains valid. |
| 1.4 | `internal/resultenvelope/resultenvelope_test.go` | Unit | package PASS | Covered by 1.2 | package PASS | Generic and phase-aware paths | `Validate` delegates to `ValidateForPhase` | Public compatibility preserved. |
| 1.5 | JS and Go validator suites | Unit | Both baseline-green | Malformed flag/container/element failed | Both PASS | Positive, partial, blocked, non-spec | Deterministic field order | Equivalent validity outcomes proven. |
| 1.6 | JS and Go validator suites | Unit | Both baseline-green | N/A, refactor after GREEN | Both PASS | Canonical signal lists | Helpers/constants extracted | Error text unchanged across refactor. |
| 2.1 | `scripts/clarify-signal-contract.test.js` | Contract | N/A (new) | Initial 0/4 PASS | Final 5/5 PASS | Four independent positive signals | Source loader centralized | Pins emission, predicate, halt and bypass. |
| 2.2 | `scripts/clarify-signal-contract.test.js` | Contract | Initial RED captured | Emission/schema assertions failed; strict JSON example later failed 1/5 | 5/5 PASS | Prose and parsed strict fence | One canonical field order | Successful specs cannot omit signals. |
| 2.3 | `scripts/clarify-signal-contract.test.js` | Contract | Existing handler inspected | Predicate extraction failed | 5/5 PASS | False/empty plus four positive paths | Predicate documented once | Test executes the documented pure predicate. |
| 2.4 | `scripts/clarify-signal-contract.test.js` | Contract | Orchestrator baseline preserved | Fail-closed assertions failed | 5/5 PASS | Halt and valid-handler branches | Old route/classification prose removed | Orchestrator remains 495 lines. |
| 2.5 | `scripts/clarify-signal-contract.test.js` | Contract | N/A | Covered by 2.1/2.2 | 5/5 PASS | Each ambiguity category and strict JSON types | Assertions target behavior | Includes generic non-spec compatibility via validators. |
| 2.6 | Contract plus real-repo guard | Contract | Existing <500 guard PASS | N/A, refactor after GREEN | PASS | Handler owns both outcomes | Duplicate predicate prose removed | `residual_ambiguity` anchor retained. |
| 3.1 | JS/Go SubagentStop suites | Integration | JS 36/36; Go package PASS | JS 2 failures; Go 2 failures | JS 38/38; Go package PASS | Persistence and status call sites | Shared phase derivation retained | Invalid successful spec no longer wins. |
| 3.2 | `scripts/hooks/subagent-stop.test.js` | Integration | 36/36 PASS | Covered by 3.1 | 38/38 PASS | Spec and non-spec agents | Resolved agent phase passed directly | Telemetry fallback unchanged. |
| 3.3 | `internal/hooks/subagentstop_test.go` | Integration | package PASS | Covered by 3.1 | package PASS | Persistence and cost status | `ValidateForPhase` at both sites | Mirrors JS behavior. |
| 3.4 | JS/Go hook suites | Integration | Both baseline-green | Covered by 3.1 | Both PASS | Invalid spec vs generic envelope | No telemetry rewrite | Existing fail-safe behavior preserved. |
| 4.1 | `scripts/configure/real-repo.test.js` | Integration | 30/30 PASS | 29/30 PASS; outcome table absent | 30/30 PASS | Five profiles | Shared outcome table added | Failure was observed first on Claude. |
| 4.2 | Real-repo plus contract suites | Integration | 30/30 baseline | Covered by 4.1 | Combined 35/35 PASS | Claude, VS Code, Copilot, OpenCode, Codex | Canonical sources only | No configure transform or `dist/**` edit needed. |
| 4.3 | Contract + real-repo suites | Integration | Prior focal gates PASS | Covered by 4.1 | 35/35 PASS | Predicate/state/halt/bypass per target | Assertions kept strict | Cross-target drift is zero. |
| 4.4 | `npm test`; `go test ./...` | Full gate | All focused suites green | N/A, final verification | 1301 pass / 0 fail; 9 Go packages PASS | Full generated profiles and hooks | `git diff --check` clean | Node reports 1303 tests with 2 expected skips; validators report 0 errors/0 warnings. |

## Test Summary

- Total new Node test cases: 13 (6 validator, 5 clarify contract, 2 hook), plus one existing integration case expanded from one target to five
- Total new Go test functions: 8 (6 validator, 2 hook)
- Focused final results: validator JS 32/32; clarify contract 5/5; JS hooks 38/38; combined contract/real-repo 35/35; Go validator/hooks PASS
- Full gate: `npm test` 1303 total, 1301 pass, 0 fail, 2 expected skips; all target validators 0 errors/0 warnings
- Go gate: `go test ./...` PASS across 9 packages
- Layers used: Unit, contract, integration, full generation/validation
- Approval tests: existing generic validator and non-spec hook cases retained as compatibility safety nets
- Pure functions/helpers created: 3 (`validateStringArrayField` in JS and Go; documented `shouldRunClarify` predicate)

## Changed Implementation Paths

- `agents/sdd-orchestrator.agent.md`
- `skills/sdd-spec/SKILL.md`
- `skills/_shared/sdd-phase-common.md`
- `skills/_shared/clarify-routing.md`
- `scripts/lib/result-envelope.js`
- `scripts/lib/result-envelope.test.js`
- `internal/resultenvelope/resultenvelope.go`
- `internal/resultenvelope/resultenvelope_test.go`
- `scripts/hooks/subagent-stop.js`
- `scripts/hooks/subagent-stop.test.js`
- `internal/hooks/subagentstop.go`
- `internal/hooks/subagentstop_test.go`
- `scripts/clarify-signal-contract.test.js`
- `scripts/configure/real-repo.test.js`

## Workload Reality

- Implementation/test contract: 630 changed lines across 14 paths
  when the new contract test is included; the unrelated pre-existing
  `docs/roadmap.md` change and OpenSpec audit artifacts are excluded.
- Forecast: 650-900 lines across 14-16 files. Actual implementation stayed
  within the approved `size:exception` shape and preserved all three work units.
- Generated outputs: no `dist/**` files modified or added.
- Unrelated work: `docs/roadmap.md` was not edited by this apply.

## Risks / Deviations

None. No spec/design contradiction was found, and no assumption was required.

## 4R Remediation Batch

Status: implemented-pending-reverify

### Remediation Summary

- R1 Reliability: JavaScript now trims the canonical agent phase before both
  phase-aware validator call sites, matching Go for metadata such as
  `agent_type: "sdd-spec "`.
- R2 Resilience: a parsed successful `sdd-spec` envelope that fails phase-aware
  validation now resolves dispatch and phase-cost status to `blocked`; it never
  falls back to a top-level `success` status.
- R3 Readability: hook locals now distinguish `canonicalAgentPhase` (`sdd-spec`)
  from `statePhaseKey` (`spec`) without broad refactoring.

### Remediation TDD Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR | Notes / Rationale |
|---|---|---|---|---|---|---|---|---|
| R1 | JS/Go SubagentStop suites | Integration | JS 38/38; Go PASS | JS valid spaced metadata did not persist; invalid metadata bypassed phase validation | JS 41/41; Go PASS | Valid and invalid successful specs with spaced metadata | Canonical phase normalized once | Go approval case confirms existing trim parity. |
| R2 | JS/Go SubagentStop suites | Integration | Existing status tests PASS | JS and Go recorded `success` for an invalid successful spec when top-level status was success | JS 41/41; Go PASS | Invalid spec blocked; valid spec success; generic non-spec unchanged | Fail-closed branch localized in status resolver | Phase-cost records inherit the corrected resolver status. |
| R3 | JS/Go hook implementations | Readability | Hook suites green | N/A, naming-only refactor after GREEN | JS 41/41; Go PASS | Persistence and telemetry paths | `canonicalAgentPhase` / `statePhaseKey` | No public API or broad structural change. |

### Remediation Verification

- `node --test scripts/hooks/subagent-stop.test.js`: 41/41 PASS.
- `go test ./internal/hooks`: PASS.
- `node --test scripts/lib/result-envelope.test.js`: 32/32 PASS.
- `go test ./internal/resultenvelope`: PASS.
- Full suites: intentionally deferred to the required `sdd-verify` rerun.

## R4 Selective Reliability Remediation

Status: second-remediation-implemented-pending-reverify

- Safety net: JS hooks 41/41 PASS; Go hooks PASS.
- RED: JS 41/43 PASS; blank `agent_type` neither persisted through
  `agent_name` nor produced fail-closed `blocked` status.
- GREEN: JavaScript trims each metadata candidate before choosing precedence.
- TRIANGULATE: blank `agent_type` falls back to `agent_name: sdd-spec`, while a
  non-empty trimmed `agent_type: sdd-design` retains precedence.
- Go approval: persistence and fail-closed status cases passed without a Go
  production change.
- Final: JS hooks 43/43 PASS; Go hooks PASS; JS validators 32/32 PASS; Go
  validators PASS.
