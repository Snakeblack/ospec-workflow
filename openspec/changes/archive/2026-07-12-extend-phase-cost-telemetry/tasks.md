# Tasks: Per-dispatch Phase Cost Telemetry (O1)

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-hooks-001: normalized per-dispatch shape and fallbacks | MUST | `scripts/hooks/subagent-stop.js`, `internal/hooks/subagentstop.go`, model readers | covered-by-design | Covers shape, status, duration, tier, and fail-safe records. |
| REQ-hooks-001: active-change selection and atomic relaunch | MUST | `scripts/lib/ospec-state.js`, `internal/store/store.go`, both writers | covered-by-design | Read/classify/append stays under the advisory lock. |
| E1: JS/Go semantic parity and four-fixture floor | MUST | `scripts/hooks/parity-contract.test.js`, `internal/hooks/subagentstop_test.go`, `internal/testdata/parity/` | covered-by-design | Compare fields semantically; validate UTC `ts`. |
| REQ-agents-001: Cost aggregation, C3 fallback, no-data, non-gating archive | MUST | `skills/sdd-archive/SKILL.md`, `scripts/cost-block-contract.test.js` | covered-by-design | Observed phases; questions from `gates.*.questions_asked`. |

### Reconciliation Verdict

- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none; clarify-001 through clarify-004 are reflected in the design.

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 700–900 (runtime code, Go mirror, tests, fixtures, packaging, and archive instructions) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes; internal work units preserve review boundaries |
| Suggested split | U1 runtime context/config → U2 locked writers → U3 parity/packaging → U4 Cost/archive verification |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception; one approved PR with the units applied in order |

Exception approval: `delivery-strategy-001`; no new gate. Units are bounded and test-coupled.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| U1 | Canonical context, tier readers, runtime packaging | Approved size-exception PR | Shared JS/Go vectors; bundled `models.yaml`. |
| U2 | Atomic writers and complete JS/Go records | Same PR, after U1 | Lock, failure, fallback, and precedence coverage. |
| U3 | Shared fixtures and executable parity | Same PR, after U2 | UTF-8, side effects, semantic rows, UTC timestamps. |
| U4 | Archive Cost and full verification | Same PR, after U3 | C3, no-data, questions, and non-gating behavior. |

### Checklist Status Legend

- `[ ]` Pending
- `[~]` Implemented, unverified
- `[x]` Implemented and verified

## Phase 1: Canonical Context, Tier Resolution, and Packaging

- [x] 1.1 **RED → GREEN:** Add JS/Go vectors for alias precedence, valid host integers, UTF-8 `ceil(bytes/4)`, invalid segments, duration, and envelope → dispatch → `unknown` status; implement them in `scripts/hooks/subagent-stop.test.js`, `internal/hooks/subagentstop_test.go`, `scripts/hooks/lib/model-tier.js`, and `internal/modelconfig/models.go` [REQ-hooks-001]
- [x] 1.2 **RED → GREEN:** Test agent → `_default` → `unknown` lookup, malformed/missing config, then package `models.yaml` via `scripts/configure/cli.js` and pass `OSPEC_PLUGIN_ROOT` in `scripts/hooks/ospec-hooks-launch.js`; update `scripts/configure/cli.test.js` and goldens [REQ-hooks-001, E1]
- [x] 1.3 **TRIANGULATE → REFACTOR:** Run matched JS/Go context suites, verify launcher fallback and generated targets use the bundled file, and keep readers dependency-free/fail-soft [REQ-hooks-001, E1]

## Phase 2: JS Normalization and Atomic Writer

- [x] 2.1 **RED → GREEN:** Extend `scripts/lib/ospec-state.test.js` with same-phase relaunch, concurrent append, malformed-line, and failed-append cases; update `scripts/lib/ospec-state.js` and `scripts/lib/artifact-store.js` so read/classify/append and `relaunch` assignment occur under one advisory lock [REQ-hooks-001]
- [x] 2.2 **RED → GREEN:** Add focused cases in `scripts/hooks/subagent-stop.test.js` for the complete normalized row, no active change, zero/unknown fallbacks, envelope status precedence, and unchanged stdout; update `scripts/hooks/subagent-stop.js` to normalize context, resolve tier, emit four `estimated_*` fields plus duration/status/boolean relaunch, and retain fail-safe ordering [REQ-hooks-001]
- [x] 2.3 **TRIANGULATE → REFACTOR:** Exercise injected filesystem/estimation failures and parallel same-phase dispatches, confirm one persisted `relaunch: false`, confirm failed writes do not consume it, and preserve Result Envelope and `skill_resolution` behavior [REQ-hooks-001]

## Phase 3: Go Mirror and Store Semantics

- [x] 3.1 **RED → GREEN:** Add table-driven and goroutine tests in `internal/store/store_test.go` for locked phase-cost classification, one first row, later relaunches, malformed prior rows, and failed writes; implement the equivalent transaction in `internal/store/store.go` [REQ-hooks-001]
- [x] 3.2 **RED → GREEN:** Extend `internal/hooks/subagentstop_test.go` for canonical payload normalization, tier/status fallbacks, complete shape, no-active-change, and fail-safe errors; mirror the JS writer in `internal/hooks/subagentstop.go` using `internal/modelconfig/models.go` [REQ-hooks-001]
- [x] 3.3 **TRIANGULATE → REFACTOR:** Run matched ASCII/multibyte vectors, verify every field except `ts` is equal, validate UTC timestamps, and refactor without changing envelope stdout [REQ-hooks-001, E1]

## Phase 4: Executable Parity Fixtures

- [x] 4.1 **RED → GREEN:** Make `subagent-stop-phase-cost-active-change.json` deterministic with UTF-8/context, preserve the no-active fixture, and extend `scripts/hooks/parity-contract.test.js` plus `internal/hooks/subagentstop_test.go` to inspect rows, side effects, fallbacks, and the four-fixture floor [E1]
- [x] 4.2 **TRIANGULATE → REFACTOR:** Clean disposable fixture output, compare parsed fields not JSON order, retain stdout/fail-open checks, and reject parity drift [E1]

## Phase 5: Archive Cost Contract

- [x] 5.1 **RED → GREEN:** Expand `scripts/cost-block-contract.test.js` first, then update `skills/sdd-archive/SKILL.md` to aggregate invocations, relaunches, duration, tier/status sets, four independently labelled estimated token sums, and `gates.*.questions_asked` [REQ-agents-001]
- [x] 5.2 **TRIANGULATE → REFACTOR:** Pin C3 `est_tokens` → estimated output fallback, incomplete/malformed rows, observed-phases-only rendering, explicit no-data output, and the rule that Cost never gates close-gates/spec-sync/archive move [REQ-agents-001]

## Phase 6: Complete Verification and Handoff

- [x] 6.1 Run `npm test` and `go test ./...` for generator, launcher, hook, store, parity, and Cost suites; capture RED/GREEN/TRIANGULATE/REFACTOR evidence in `apply-progress.md` [REQ-hooks-001, E1, REQ-agents-001]
- [x] 6.2 Reconcile MUST scenarios and `design.md`, confirm no out-of-scope production change, and record warnings before `sdd-verify` [REQ-hooks-001, E1, REQ-agents-001]
