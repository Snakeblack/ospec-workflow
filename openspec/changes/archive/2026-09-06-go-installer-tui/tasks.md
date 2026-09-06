# Tasks: Go Installer TUI

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|---|---|---|---|---|
| REQ-install-019: single target and Back retention | MUST | `cmd/ospec-install/main.go`, local Bubble Tea model | covered-by-design | State stores target-local selections and explicit forward/back transitions. |
| REQ-install-020: capability-gated choices and inheritance | MUST | `scripts/configure/installer-adapter.js`, Go model/view | covered-by-design | Allowlist and canonical values drive finite choices; Antigravity inherits. |
| REQ-install-021: review before write | MUST | Go review state, `internal/installer/client.go` | covered-by-design | Only Install starts the child process; cancel/back remain pre-write. |
| REQ-install-022: read-only plan and delegated install | MUST | Node adapter, resolver override seam, compatible installer mains | covered-by-design | Fresh plan validation precedes one selected `main([], deps)` call. |
| REQ-install-023: automated contract coverage | MUST | Go and Node focused/integration tests | covered-by-design | Tests cover navigation, capabilities, no-write boundary, delegation and diagnostics. |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 650–850 lines across Go, Node, tests, dependency metadata and docs |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1: adapter/override protocol and installer seams; PR 2: usable Bubble Tea TUI, wiring and docs |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

## Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Establish versioned plan/install protocol, ephemeral model overrides, and compatible installer seams | PR 1 | Autonomous Node tests plus focused Go client process tests; rollback by removing adapter/seams. |
| 2 | Deliver the guided TUI and connect it to the protocol | PR 2 | Base on PR 1; includes Bubble Tea dependency, state/view/update tests, and no-write confirmation behavior. |
| 3 | Publish launch guidance and run full regression checks | PR 2 | `package.json` script and `README.md`; verify `npm test` and `go test ./...`. |

## Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Protocol and Installer Seams (PR 1)

- [x] 1.1 Add `scripts/configure/installer-adapter.js` with versioned `plan` JSON, target/profile enumeration, capability allowlist, deterministic choice IDs, inherited states, and `install` stdin schema validation [REQ-install-020, REQ-install-022]
- [x] 1.2 Extend `scripts/configure/cli.js` and `scripts/lib/model-resolver.js` with validated per-run `modelOverrides` applied only to an in-memory configuration; preserve existing calls and tier behavior [REQ-install-022]
- [x] 1.3 Update `scripts/configure/install-claude.js` and `scripts/configure/claude-marketplace.js` to accept injected `deps.runConfigure` while retaining direct CLI/build-only behavior [REQ-install-022]
- [x] 1.4 Add Node tests beside adapter, resolver, and Claude seam code for read-only planning, stale/invalid selections, scalar/array/Codex object shapes, inheritance, and exactly-once selected-main dispatch [REQ-install-020, REQ-install-022, REQ-install-023]
- [x] 1.5 Add `internal/installer/client.go` process boundary with argument-vector spawning, repository cwd, JSON stdin, stdout/stderr/exit propagation, and test seams; verify no shell interpolation [REQ-install-022, REQ-install-023]

## Phase 2: Guided TUI (PR 2)

- [x] 2.1 Pin Bubble Tea v1.3.4 and Lip Gloss in `go.mod`/`go.sum`; add `cmd/ospec-install/main.go` and `internal/installer/model.go` for menu → target → models → review → installing states [REQ-install-019, REQ-install-021]
- [x] 2.2 Implement target-local selection maps, capability-aware model editing, inherited display, scrolling, focus markers, Back/Escape/q/Ctrl-C handling, and review default focus on Back [REQ-install-019, REQ-install-020, REQ-install-021]
- [x] 2.3 Wire plan loading and explicit Install to the adapter client; suspend rendering during installation, restore terminal, and return native installer status/diagnostics without retry [REQ-install-021, REQ-install-022]
- [x] 2.4 Add table-driven Go Update/View tests for target switching, Back retention, inherited Antigravity, summary edits, cancel, repeated Enter suppression, and zero invocations before Install [REQ-install-019, REQ-install-020, REQ-install-021, REQ-install-023]
- [x] 2.5 Add `npm run setup:tui` in `package.json` and concise prerequisites/flow/rollback guidance in `README.md` [REQ-install-019, REQ-install-022]

## Phase 3: Verification

- [x] 3.1 Run focused Node and Go tests, then `npm test` and `go test ./...`; confirm all seven target dispatch entries and existing setup commands remain green [REQ-install-022, REQ-install-023]
- [x] 3.2 Manually exercise one interactive session for clipping, focus, Back retention, cancellation, terminal restoration, and diagnostics; record limitations around host authentication/model availability [REQ-install-019, REQ-install-021]
