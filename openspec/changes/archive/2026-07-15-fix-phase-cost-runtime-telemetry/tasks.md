# Tasks: Repair Codex phase-cost runtime telemetry

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-hooks-001: normalized phase-cost row, fail-safe append, no sensitive payload capture | MUST | `scripts/hooks/subagent-stop.js`, `internal/hooks/subagentstop.go`, parity/unit tests | covered-by-design | Existing source and Go mirror already define the canonical row and fallback shape; characterize the real Codex adapter before changing it. |
| REQ-hooks-006: Codex transcript/payload adaptation | MUST | `scripts/hooks/subagent-stop.js`, `internal/hooks/subagentstop.go`, Codex fixtures | covered-by-design | Use only observed field names and metadata; never persist transcript/content. |
| REQ-install-001: fresh, idempotent native runtime installation | MUST | `scripts/configure/install-codex.js` and installer tests | covered-by-design | Verify the managed runtime at `C:/Users/sn4ke/.codex/ospec-workflow`; machine-local files are test evidence, not commit targets. |
| REQ-agents-001: archive consumes JSONL, including incomplete rows | MUST | `skills/sdd-archive/SKILL.md`, archive flow and report evidence | covered-by-design | The archive report must show the Cost block from the real JSONL row. |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: the real Codex payload fields and whether zero/unknown values are host absence or adapter drift; resolve during RED before production edits.

## Review Workload Forecast

Estimated changed lines: 430-600 (JS/Go parity, focused tests/fixtures, installer guard, and evidence)
Delivery strategy: exception-ok
Suggested split: one coupled size-exception PR, reviewed as the work units below
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Verification |
|---|---|---|---|
| 1 | Characterize real Codex payload/adapter and add red tests with sanitized fixtures | PR 1 | JS/Go parity assertions fail for the demonstrated gap |
| 2 | Apply only evidenced adapter/diagnostic and installation fixes | PR 1 | `npm test`, Go parity, source/installed byte and idempotency checks |
| 3 | Prove fresh-host append and archive consumption | PR 1 | Real `sdd-*` SubagentStop row plus populated archive Cost block |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: RED — characterize the real Codex contract

- [x] 1.1 Capture one controlled fresh `sdd-*` `SubagentStop` input after Codex restart and reduce it to a committed fixture containing only field names, types, presence flags, host binding, and expected canonical values; exclude transcript text, prompts, outputs, secrets, and raw payloads. [REQ-hooks-006]
- [x] 1.2 Add focused failing-then-green JS tests for the observed phase-cost no-op/fallback diagnostics and required fail-safe behavior. [REQ-hooks-001, REQ-hooks-006]
- [x] 1.3 Add the focused Go mirror test for the redacted diagnostic and update the sanitized parity fixture. [REQ-hooks-001]
- [x] 1.4 Add failing-then-green installer coverage proving changed runtime bytes reach the managed runtime and a third sync is byte-stable. [REQ-install-001]

## Phase 2: GREEN — fix only demonstrated gaps

- [x] 2.1 Update `scripts/hooks/subagent-stop.js` with bounded field-presence diagnostics, explicit no-op reasons, and redacted `cost_observability` metadata while retaining `continue:true` fail-safe behavior. [REQ-hooks-001, REQ-hooks-006]
- [x] 2.2 Mirror fallback field-presence semantics in `internal/hooks/subagentstop.go` and add a redacted no-op diagnostic API; no payload or transcript content is included. [REQ-hooks-001]
- [x] 2.3 Repair `scripts/configure/install-codex.js` after the RED test proved the runtime sync contract lacked observable content-aware/idempotent behavior; supported installation refreshed the managed bytes. [REQ-install-001]
- [x] 2.4 Keep `docs/roadmap.md` untouched by this batch; redaction is asserted in focused hook tests. [REQ-hooks-001]

## Phase 3: TRIANGULATE — prove behavior and delivery

- [x] 3.1 Focused JS and Go tests pass (89 JS tests; `go test ./internal/hooks ./internal/store`); full `npm test` remains a verify-phase gate. [REQ-hooks-001, REQ-hooks-006]
- [x] 3.2 Ran the supported Codex install once and an effective direct dry-run once; source/installed `subagent-stop.js` SHA-256 matched and focused idempotency coverage passed. Machine-local files are not commit targets. [REQ-install-001]
- [ ] 3.3 After a fresh Codex restart, execute a real new `sdd-*` SubagentStop and persist sanitized evidence in the change/archive evidence; assert a newly appended, host-attested non-fabricated row in `.ospec/session/fix-phase-cost-runtime-telemetry/phase-costs.jsonl`. [REQ-hooks-001]
- [ ] 3.4 Run archive for this change and assert `archive-report.md` consumes that JSONL, emits the Cost block with observed values/fallbacks and estimated labels, and completes without treating incomplete cost data as a close-gate failure. [REQ-agents-001]

## Phase 4: REFACTOR / handoff

- [x] 4.1 No temporary payload-capture code was added; only bounded diagnostics and focused assertions remain.
- [ ] 4.2 Confirm `git diff -- docs/roadmap.md` is empty and record final test/install/real-host/archive evidence in the phase progress and archive report.

## Phase 2 remediation from verify (code-bug route)

- [x] 2.5 Parse the observed nested Codex `token_count` event shape with strict numeric validation and a sanitized fixture. [REQ-hooks-006]
- [x] 2.6 Align the producer and canonical O1/archive consumer so redacted `cost_observability` metadata is accepted without breaking legacy rows. [REQ-hooks-001, REQ-agents-001]
- [x] 2.7 Isolate test cleanup from the repository-root `.ospec` directory so full-suite tests cannot erase live phase-cost evidence. [REQ-hooks-001]
- [x] 2.8 Cover append preservation, duplicate-event idempotency, and JS/Go parity for the repaired row shape. [REQ-hooks-001]
- [x] 2.9 Isolate the Go PreToolUse cumulative-token fixture with `t.TempDir()`/`t.Chdir()` and assert a phase-cost sentinel survives the test. [REQ-hooks-001]
- [x] 2.10 Read root `OSPEC_CODEX_EVENTS_PATH` token counts in Go under the same workspace/run-id guard as JS, with a non-zero regression test. [REQ-hooks-006]
- [x] 2.11 Scan all existing phase-cost rows before assigning `row_index` in JS and Go, including apply-after-later-phase relaunch coverage. [REQ-hooks-001]
- [x] 2.12 Fail closed when Go lock acquisition exhausts retries and prove the callback is never invoked under contention. [REQ-hooks-001]
