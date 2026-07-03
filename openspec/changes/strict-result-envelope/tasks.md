# Tasks: Strict Result Envelope (C5)

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-skills-001 (fence format §D) | MUST | `skills/_shared/sdd-phase-common.md` §D update | covered-by-design | Prose-only edit, no code |
| REQ-agents-001 (orchestrator consumes fence, fallback) | MUST | `agents/sdd-orchestrator.agent.md` Result Contract update | covered-by-design | Prose-only edit |
| REQ-agents-001 MODIFIED (SDD Phase Agent Envelope table) | MUST | Same file, table + scenario update | covered-by-design | |
| REQ-hooks-001 (extract/validate/persist, fail-safe) | MUST | `scripts/lib/result-envelope.js`, `scripts/lib/ospec-state.js#setPhaseSummary`, `scripts/hooks/subagent-stop.js` | covered-by-design | Fill-gap merge per ADR-002 |
| REQ-hooks-001 MODIFIED (E1 parity, SubagentStop fixture family) | MUST | `internal/resultenvelope`, `internal/yamllite`, `internal/hooks/subagentstop.go`, new fixtures, `parity-contract.test.js` | covered-by-design | Fixture floor 2 |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

| Field | Value |
|-------|-------|
| Estimated changed lines | ~650-780 (new JS validator ~90 + tests ~120; ospec-state surgical writer + lock rename ~60 + tests ~70; subagent-stop.js integration ~50; Go mirror: resultenvelope ~90 + tests ~110, yamllite writer ~50 + tests ~60, subagentstop.go ~40 + tests ~40; 2 fixtures + README ~40; parity-contract.test.js param. ~30; skills/agents doc deltas ~40) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (JS core: validator + ospec-state writer + subagent-stop wiring + tests) → PR 2 (Go mirror + fixtures + parity contract) → PR 3 (doc-only: skills/agents spec prose) |
| Delivery strategy | exception-ok |
| Chain strategy | size-exception |

Approval context: execution mode automatic, delivery strategy exception-ok — user has pre-accepted `size:exception` for this change; no gate question needed before apply.

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | JS validator + emission doc + orchestrator consumption doc | PR 1 | `result-envelope.js`(+test), §D and orchestrator Result Contract prose; self-contained, testable alone |
| 2 | JS persistence path: `ospec-state.js#setPhaseSummary` + lock rename + `subagent-stop.js` wiring | PR 2 | Depends on Unit 1's validator; own tests |
| 3 | Go mirror: `internal/resultenvelope`, `internal/yamllite#SetPhaseSummary`, `internal/hooks/subagentstop.go` | PR 3 | Depends on Unit 2 behavior being final (mirrors it byte-for-byte) |
| 4 | Parity fixtures + `parity-contract.test.js` param. + README | PR 4 | Depends on Units 2 and 3 both landing |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Emission & Consumption Contract (docs)

- [x] 1.1 Update `skills/_shared/sdd-phase-common.md` §D: add strict `json:result-envelope` fence requirement, canonical schema note, omission convention for optional fields [REQ-skills-001]
- [x] 1.2 Update `agents/sdd-orchestrator.agent.md` Result Contract: fence-first extraction, fallback to prose, SDD Phase Agent Envelope table note on dual emission [REQ-agents-001]

## Phase 2: JS Validator (RED → GREEN)

- [x] 2.1 RED: write `scripts/lib/result-envelope.test.js` covering valid envelope, each missing required field, bad `status` enum, malformed JSON, absent fence, invalid `assumptions[]` entry [REQ-hooks-001, REQ-skills-001]
- [x] 2.2 GREEN: create `scripts/lib/result-envelope.js` with `extractEnvelope(text)` (fence regex + JSON.parse, never throws) and `validateEnvelope(obj) → {valid, errors}` per §D schema [REQ-hooks-001, REQ-skills-001]

## Phase 3: JS Persistence Path (RED → GREEN)

- [x] 3.1 RED: extend `scripts/lib/ospec-state.test.js` with `setPhaseSummary` cases — gap-fill write, non-empty-guard no-op, quote/backslash escaping, `key_decisions` list rendering [REQ-hooks-001]
- [x] 3.2 GREEN: add `setPhaseSummary(content, phase, {summary, keyDecisions})` to `scripts/lib/ospec-state.js`; generalize `withAppendLock` → `withFileLock`, export both, keep existing callers working [REQ-hooks-001]
- [x] 3.3 RED: add integration tests in `scripts/hooks/subagent-stop.test.js` (or equivalent) — valid fence persists to a scratch `state.yaml`, missing/malformed fence skips write and stdout unchanged, pre-existing non-empty summary is not overwritten [REQ-hooks-001]
- [x] 3.4 GREEN: wire `scripts/hooks/subagent-stop.js` — before existing `skill_resolution` logic, extract+validate fence (reuse §5.2 field order), resolve active change/phase via `findActiveChanges`, lock+atomic fill-gap write, fully fail-safe on any failure [REQ-hooks-001]

## Phase 4: Go Mirror (parity)

- [x] 4.1 RED: write `internal/resultenvelope/resultenvelope_test.go` mirroring 2.1's cases byte-for-byte in intent [REQ-hooks-001]
- [x] 4.2 GREEN: create `internal/resultenvelope/resultenvelope.go` with `Extract(text) (map[string]any, bool)` and `Validate(v) (bool, []string)` [REQ-hooks-001]
- [x] 4.3 RED: extend `internal/yamllite/yamllite_test.go` with `SetPhaseSummary` cases mirroring 3.1 [REQ-hooks-001]
- [x] 4.4 GREEN: add `SetPhaseSummary(content, phase, summary string, keyDecisions []string) string` to `internal/yamllite/yamllite.go`, mirroring the JS fill-gap/escaping behavior [REQ-hooks-001]
- [x] 4.5 RED: extend `internal/hooks/subagentstop_test.go` with the persist-path cases mirroring 3.3 [REQ-hooks-001]
- [x] 4.6 GREEN: wire `internal/hooks/subagentstop.go` to extract/validate/persist before its existing resolution logic, using a Go `withLock` mirror of `withFileLock` [REQ-hooks-001]

## Phase 5: Parity Fixtures & Contract

- [ ] 5.1 Create `internal/testdata/parity/subagent-stop-valid-envelope.json` — valid fence, byte-for-byte `expectedStdout` including any `systemMessage` [REQ-hooks-001 MODIFIED]
- [ ] 5.2 Create `internal/testdata/parity/subagent-stop-malformed-envelope.json` — fail-open fixture, `continue:true`, documented prefix-only comparison rule [REQ-hooks-001 MODIFIED]
- [ ] 5.3 Update `internal/testdata/parity/README` documenting the second hook, its fixture prefix/floor (2), and the fail-open comparison rule [REQ-hooks-001 MODIFIED]
- [ ] 5.4 GREEN: parameterize `scripts/hooks/parity-contract.test.js` over the fixture-family table (add `SubagentStop` row, floor assertion ≥2, spawn `subagent-stop.js`, byte-for-byte except fail-open fixture) [REQ-hooks-001 MODIFIED]
- [ ] 5.5 Add Go-side `TestSubagentStop_ParityFixtures` reading the same fixture directory, matching the floor and fail-open rule [REQ-hooks-001 MODIFIED]

## Phase 6: Verification

- [ ] 6.1 Run `npm test` / `node --test` for all new/modified JS suites; confirm no regression in existing `PreToolUse` parity or `ospec-state` tests
- [ ] 6.2 Run `go test ./...`; confirm `resultenvelope`, `yamllite`, `hooks` packages pass and parity suite matches JS byte-for-byte (except the documented fail-open fixture)
- [ ] 6.3 Manually trace one `sdd-design` sample return through fence → hook persistence → `state.yaml` diff, confirming fill-gap guard did not clobber an existing summary
