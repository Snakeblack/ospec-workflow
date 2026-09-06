## Verification Report

**Change**: go-installer-tui  
**Version**: 2.64.0  
**Candidate**: `e5dc5cb17529e3798464cf0a2a8676076ed1e7a3`  
**Base**: `f3c37c8`  
**Mode**: Focused TDD

### Completeness

| Metric | Value |
|--------|-------|
| Tasks total | 12 |
| Tasks complete | 12 |
| Tasks incomplete | 0 |

All tasks in `tasks.md` are checked complete. `apply-progress.md`, `test-evidence.md`, and `terminal-smoke.md` bind their closure evidence to the candidate above.

### Build & Tests Execution

**Build**: ✅ Passed through the configured test/build paths

```text
git diff --check f3c37c8..e5dc5cb17529e3798464cf0a2a8676076ed1e7a3
exit 0

go test ./...
exit 0; all 11 packages passed, with cmd/ospec-install reporting [no test files]
```

**Tests**: ✅ Passed

```text
npm test
exit 0; 3243 passing checkmark assertions; 0 failure markers; All checks passed.
Evidence: final-node-regression.log (96.577 s)

go test ./...
exit 0; 11 packages passed; 1 package had no test files; 0 failed packages.
Evidence: final-go-regression.log (111.931 s)
```

The final regression logs were produced on 2026-09-06 for the same candidate HEAD. Source inspection found no tracked source drift after that candidate; only the change's OpenSpec evidence directory is untracked.

**Manual verification**: performed

```text
Real PTY catalog session: menu, Claude model change, review, Back retention,
Antigravity inherited flow, q cancellation, and terminal cleanup passed.

Controlled fixture: Install emitted stdout/stderr sentinels, restored the terminal,
and propagated native process exit code 17. No real installer or user-home write ran.
```

**Coverage**: ➖ Not available; `openspec/config.yaml` declares no coverage command or threshold above zero.

### Spec Compliance Matrix

| Requirement | Scenario | Evidence Level | Source | Result | Notes |
|-------------|----------|----------------|--------|--------|-------|
| REQ-install-019 | Select one target | `runtime-test` | `internal/installer/model_test.go > TestModelUpdateNavigation`, `TestModelOnlyRequestsInstallFromReviewInstallAction` | PASS | Navigation selects one active target and the resulting request contains only that target. |
| REQ-install-019 | Back retains selections | `runtime-test` | `internal/installer/model_test.go > TestModelRetainsSelectionsPerTarget`; `terminal-smoke.md` | PASS | Target-local selections survive Back and target switching; the PTY confirmed the changed Claude label remained visible after Back. |
| REQ-install-020 | Select a supported model | `runtime-test` | `internal/installer/model_test.go > TestModelUsesEffectiveChoiceAsDefault`, `TestModelRetainsSelectionsPerTarget`; `scripts/configure/installer-adapter.test.js > install accepts every reviewed default once and injects only native overrides` | PASS | The selected opaque choice resolves to one agent's native value, while other stored selections remain intact; review labels are derived from the selected choice. |
| REQ-install-020 | Bypass inherited models | `runtime-test` | `internal/installer/view_test.go > TestViewIdentifiesInheritedAgentInReview`; `scripts/configure/installer-adapter.test.js > plan is read-only and exposes seven profiles with native model forms` | PASS | Antigravity is non-selectable, skips the model editor, and displays inherited behavior. |
| REQ-install-021 | Summary waits for Install | `runtime-test` | `internal/installer/model_test.go > TestModelOnlyRequestsInstallFromReviewInstallAction`; `internal/installer/ui_test.go > TestTeaUpdateQuitsForCancelOrExplicitInstall` | PASS | Review defaults to Back; no install request exists until the explicit Install action. Repeated Enter cannot create a second request. |
| REQ-install-021 | Edit from summary | `runtime-test` | `internal/installer/model_test.go > TestModelUpdateNavigation`, `TestModelRetainsSelectionsPerTarget`; `terminal-smoke.md` | PASS | Back returns to the editor without clearing target-local selections; selection mutation is scoped to the active agent and the revised value is rendered in review. |
| REQ-install-022 | Planning is read-only | `runtime-test` | `scripts/configure/installer-adapter.test.js > plan is read-only and exposes seven profiles with native model forms` | PASS | The fixture's canonical `models.yaml` stays byte-identical; inspection confirms the plan path performs reads and constructs an in-memory document only. |
| REQ-install-022 | Confirmed plan delegates once | `runtime-test` | `scripts/configure/installer-adapter.test.js > install accepts every reviewed default once and injects only native overrides`, `each target dispatches only its own injected main`, `real installer mains synchronously receive the source and override wrapper`; `internal/installer/client_test.go > TestClientInstallWritesJSONStdinAndPropagatesStreamsAndExitCode` | PASS | A fresh plan resolves opaque IDs, calls only the selected main once, and propagates diagnostics and native exit status. All seven target mappings are exercised. |
| REQ-install-022 | Invalid plan is refused | `runtime-test` | `scripts/configure/installer-adapter.test.js > install rejects stale, inherited, unknown, and incomplete selections before dispatch`, `CLI plan emits only JSON and invalid install returns status two` | PASS | Invalid schema, stale choice, inherited override, unknown agent, and incomplete selections are rejected before dispatch; observed call count remains zero. |
| REQ-install-023 | Contract tests pass | `runtime-test` | `npm test`; `go test ./...`; focused Go and Node tests listed above | PASS | Automated seams cover navigation retention, capability gating, the pre-Install request boundary, selected-target dispatch, and diagnostics. |

**Compliance summary**: 10/10 scenarios satisfy their required behavioral evidence level.

### Correctness (Static Evidence)

| Requirement | Status | Notes |
|------------|--------|-------|
| Guided Single-Target Installer TUI | ✅ Implemented | Bubble Tea state transitions carry one active target and preserve per-target selection maps. |
| Capability-Evidenced Per-Agent Model Choices | ✅ Implemented | Adapter choices come from configured native values; GitHub Copilot and Antigravity inherit, with no free-form input path. |
| Review Before Explicit Installation | ✅ Implemented | `main.go` invokes `Client.Install` only when the final model exposes an explicit reviewed request. |
| Adapter Plan and Delegated Installation | ✅ Implemented | Protocol v1 revalidates against a fresh plan, wraps `runConfigure` with in-memory overrides, and calls one existing installer main. |
| Installer TUI Contract Coverage | ✅ Implemented | Focused tests plus both full suites and the controlled PTY fixture exercise the contract boundaries. |

### Coherence (Design)

| Decision | Followed? | Notes |
|----------|-----------|-------|
| Bubble Tea v1.3.4 with Go 1.23 minimum | ✅ Yes | `go.mod` pins Bubble Tea v1.3.4 and Lip Gloss v1.0.0 while retaining `go 1.23`. |
| Private versioned JSON process boundary | ✅ Yes | Go uses argument-vector `os/exec`, repository cwd, JSON stdin, and streamed output; Node exposes protocol version 1. |
| Ephemeral model overrides | ✅ Yes | Overrides are validated and attached to a fresh in-memory configuration; canonical `models.yaml` is not mutated. |
| Explicit capability allowlist | ✅ Yes | Claude, VS Code, OpenCode, Codex, and Cursor are selectable; GitHub Copilot and Antigravity inherit. |
| Existing installer ownership | ✅ Yes | The adapter maps all seven profiles to existing `main(argv, deps)` seams and does not duplicate destination-write or rollback logic. |
| Restore terminal and preserve native outcome | ✅ Yes | The TUI exits before spawning the adapter; diagnostics remain visible and the controlled fixture observed native exit code 17 after restoration. |

No design deviation was found.

### Issues Found

**CRITICAL**: None.

**WARNING**:

- `[tasks-gap]` Test-side stable-ID traceability is missing. REQ-install-019 through REQ-install-023 have task links and adequate behavioral tests, but no changed test file or test name cites any of these stable IDs. This prevents mechanical REQ-to-test linkage; focused mode keeps it advisory. Follow-up: add each ID to the corresponding Go/Node test name or file comment using the mappings below, then rerun `go test ./internal/installer` and `node --test scripts/configure/installer-adapter.test.js`.

**SUGGESTION**: None.

### Traceability Matrix

| REQ | Tasks | Commits | Tests | Status |
|-----|-------|---------|-------|--------|
| REQ-install-019 | 2.1, 2.2, 2.4, 2.5, 3.2 | No `Ospec-Task` trailer | Go model/UI/view tests; PTY smoke (no exact REQ citation) | WARNING — behavioral coverage passes, test-side ID absent |
| REQ-install-020 | 1.1, 1.4, 2.2, 2.4 | No `Ospec-Task` trailer | Adapter plan/install tests and Go model/view tests (no exact REQ citation) | WARNING — behavioral coverage passes, test-side ID absent |
| REQ-install-021 | 2.1, 2.2, 2.3, 2.4, 3.2 | No `Ospec-Task` trailer | Go model/UI tests and PTY smoke (no exact REQ citation) | WARNING — behavioral coverage passes, test-side ID absent |
| REQ-install-022 | 1.1–1.5, 2.3, 2.5, 3.1 | `113cc66` via tasks 1.2/1.3 | Adapter, client, resolver, CLI, and Claude seam tests (no exact REQ citation) | WARNING — behavioral coverage passes, test-side ID absent |
| REQ-install-023 | 1.4, 1.5, 2.4, 3.1 | No `Ospec-Task` trailer | Full Node/Go suites plus focused adapter/client/model tests (no exact REQ citation) | WARNING — behavioral coverage passes, test-side ID absent |

Commit trailers are advisory because `openspec/config.yaml` has no active `traceability.trailers: required` policy. The warning is based on the report contract's explicit test-side linkage rule.

### Assumption Reconciliation

| id | statement | reversibility | outcome |
|----|-----------|---------------|---------|
| sdd-design-001 | Use Bubble Tea v1.3.4 with a local state model and a private versioned Node process boundary. | high | unresolved (explicit `leave-unresolved`; no escalation) |

### Verdict

PASS WITH WARNINGS

All 10 MUST scenarios and all 12 tasks have adequate behavioral evidence on the frozen candidate. Archive remains subject to resolving or accepting the advisory test-side traceability gap.
