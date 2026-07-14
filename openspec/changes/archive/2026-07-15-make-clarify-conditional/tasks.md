# Tasks: Make Clarify Truly Conditional

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| `REQ-skills-003`: successful spec emits four typed signals | MUST | `skills/sdd-spec/SKILL.md`, `skills/_shared/sdd-phase-common.md` | covered-by-design | Prose and strict envelope. |
| Well-defined spec emits skip signal | MUST | `skills/sdd-spec/SKILL.md`; contract test | covered-by-design | Requires `false` plus three empty arrays. |
| Any ambiguity category triggers predicate | MUST | `skills/_shared/clarify-routing.md` | covered-by-design | Boolean and each array get truth-table cases. |
| Validator rejects missing signal | MUST | `scripts/lib/result-envelope.*`, `internal/resultenvelope/*` | covered-by-design | Deterministic errors. |
| Validator rejects malformed signal | MUST | JS/Go validators and mirrored tests | covered-by-design | Flag, array and elements. |
| `REQ-agents-011`: standard change skips clarify | MUST | Orchestrator post-spec dispatch; clarify handler | covered-by-design | Handler records `skipped`, then design runs. |
| Non-empty signal runs clarify | MUST | Existing handler run branch | covered-by-design | Clarify remains outside phase validation. |
| Invalid signals halt downstream dispatch | MUST | Fail-closed orchestrator branch | covered-by-design | Records blocked spec-contract remediation. |
| Generated targets preserve decision | MUST | Configure pipeline; `scripts/configure/real-repo.test.js` | covered-by-design | Five profiles. |
| Agents 6.1a: valid fence is authoritative | MUST | Phase-aware envelope handoff | covered-by-design | Extracts phase-specific fields directly. |
| Agents 6.1a: non-spec fallback remains | MUST | Generic validator compatibility | covered-by-design | Preserves prose fallback. |
| Agents 6.1a: invalid successful spec overrides fallback | MUST | Fail-closed branch and contract assertions | covered-by-design | No clarify/design fallback path. |

### Reconciliation Verdict

- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 650-900 across 14-16 files |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | Unit 1 validators -> Unit 2 signal gate -> Unit 3 targets/full gate |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Phase-aware JS/Go envelope parity | Single PR, commit 1 | Validator contract and unit tests. |
| 2 | Signal gate and fail-closed orchestration | Single PR, commit 2 | Depends on Unit 1; contract/hook tests. |
| 3 | Five-target parity and full verification | Single PR, commit 3 | Depends on Unit 2; exclude `dist/**`. |

## Phase 1: Phase-Aware Validator Contract

- [x] 1.1 RED: extend `scripts/lib/result-envelope.test.js` with successful `sdd-spec` missing/type failures, generic compatibility, status scope and field ordering; run `node --test scripts/lib/result-envelope.test.js` expecting failure. [REQ-skills-003]
- [x] 1.2 RED: mirror cases in `internal/resultenvelope/resultenvelope_test.go`; run `go test ./internal/resultenvelope` expecting failure. [REQ-skills-003]
- [x] 1.3 GREEN: add phase context, signal ordering and string-array validation to `scripts/lib/result-envelope.js` while preserving `validateEnvelope(envelope)`. [REQ-skills-003]
- [x] 1.4 GREEN: add `ValidateForPhase` and matching ordered validation to `internal/resultenvelope/resultenvelope.go` while preserving `Validate`. [REQ-skills-003]
- [x] 1.5 TRIANGULATE: cover positive signals, malformed containers/elements, successful non-spec phases and blocked/partial specs in both suites; require equivalent outcomes. [REQ-skills-003]
- [x] 1.6 REFACTOR: extract shared signal constants/helpers without changing errors; rerun both focused validator suites. [REQ-skills-003]

## Phase 2: Signal Emission and Conditional Gate

- [x] 2.1 RED: create `scripts/clarify-signal-contract.test.js` pinning emission, truth table, fail-closed halt, state wording, `residual_ambiguity` anchor and clarify's phase-validation bypass; run it expecting failure. [REQ-skills-003, REQ-agents-011]
- [x] 2.2 GREEN: update `skills/sdd-spec/SKILL.md` and `skills/_shared/sdd-phase-common.md` so successful specs emit all four typed fields in prose and JSON. [REQ-skills-003]
- [x] 2.3 GREEN: update `skills/_shared/clarify-routing.md` with the pure signal predicate, explicit skipped-state write and unchanged run/blocked/user-skip handling. [REQ-skills-003, REQ-agents-011]
- [x] 2.4 GREEN: replace route/classification rules in `agents/sdd-orchestrator.agent.md` with phase-aware validation, fail-closed remediation and handler pointer; dispatch neither downstream phase when invalid. [REQ-agents-011]
- [x] 2.5 TRIANGULATE: expand the contract test for every positive signal independently, false/empty skip, missing/malformed inputs and non-spec prose fallback. [REQ-skills-003, REQ-agents-011]
- [x] 2.6 REFACTOR: remove duplicated predicate prose while keeping the orchestrator under its line guard and retaining clarify as a gate outside route phases. [REQ-agents-011]

## Phase 3: Runtime Hook Propagation

- [x] 3.1 RED: extend `scripts/hooks/subagent-stop.test.js` and `internal/hooks/subagentstop_test.go` to prove both validation call sites pass the phase, including generic non-spec behavior. [REQ-skills-003]
- [x] 3.2 GREEN: update both validation call sites in `scripts/hooks/subagent-stop.js` to pass the resolved phase. [REQ-skills-003]
- [x] 3.3 GREEN: update matching call sites in `internal/hooks/subagentstop.go` to use `ValidateForPhase`. [REQ-skills-003]
- [x] 3.4 TRIANGULATE/REFACTOR: run `node --test scripts/hooks/subagent-stop.test.js` and `go test ./internal/hooks`; consolidate phase derivation without altering telemetry fallback behavior. [REQ-skills-003]

## Phase 4: Generated-Target Parity and Full Verification

- [x] 4.1 RED: extend `scripts/configure/real-repo.test.js` across five profiles for identical predicate, state, fail-closed halt and clarify phase-validation bypass. [REQ-agents-011]
- [x] 4.2 GREEN: adjust only canonical agent/shared-skill sources or configure transforms needed for the five generated profiles; keep generated `dist/**` uncommitted. [REQ-agents-011]
- [x] 4.3 TRIANGULATE: run `node --test scripts/clarify-signal-contract.test.js scripts/configure/real-repo.test.js` and fix cross-target drift without weakening assertions. [REQ-skills-003, REQ-agents-011]
- [x] 4.4 REFACTOR/VERIFY: run `npm test` and `go test ./...`; inspect the final diff for deterministic JS/Go errors, unchanged generic envelopes and no generated artifacts. [REQ-skills-003, REQ-agents-011]
