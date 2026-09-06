# Apply Progress: Go Installer TUI

## PR1a: Ephemeral Overrides and Claude Seams

- [x] 1.2 — Added validated `modelOverrides` to `runConfigure`. The public input is an agent-to-native-value map; the active target scopes it in a fresh in-memory model configuration. `models.yaml` remains unchanged.
- [x] 1.3 — Added `deps.runConfigure` forwarding through the Claude marketplace builder and a compatible numeric-returning Claude installer `main(argv, deps)` while preserving direct CLI and build-only flows.
- [~] 1.4 — Added focused tests for scalar, array, and Codex-object override validation, in-memory output behavior, marketplace forwarding, and Claude build-only injection. Adapter plan/selection coverage belongs to its pending portion.

### Focused TDD Evidence

- RED: Added targeted resolver, generator, marketplace, and Claude seam behavior tests; the initial run failed because overrides and injection seams were absent.
- GREEN: Implemented the narrow override normalization and dependency seams; `node --test scripts/lib/model-resolver.test.js scripts/configure/cli.test.js scripts/configure/claude-marketplace.test.js scripts/configure/install-claude.test.js` passed 57/57 on 2026-09-05.

### Workload and Boundary

- Delivery: `auto-chain`, `stacked-to-main`.
- Work unit: PR1a, a coherent subslice of planned PR1.
- Review impact: 228 changed lines across owned source and tests, below the 400-line budget.
- Rollback: remove the optional `modelOverrides` path and Claude dependency seams; canonical models and existing direct calls are unaffected.

### Remaining

- [ ] Phase 2 TUI and integration work.

## Merged PR1 Completion

- [x] 1.1 — The adapter supplies the versioned, read-only seven-target plan, deterministic native-value choice IDs, inheritance, fresh installation validation, and one selected installer dispatch. Its focused tests cover catalog, stale input, native shapes, inheritance, diagnostics, and all target mappings.
- [x] 1.4 — The combined adapter, resolver, generator, marketplace, and installer suite covers the planned Node behaviors. The combined focused command passed 62/62 tests.
- [x] 1.5 — The Go client uses argument-vector spawning, repository working directory, JSON stdin, streamed native diagnostics, and exit/error propagation. `go test ./internal/installer` passed after the streaming correction.

Committed PR1 slices: `113cc66` (ephemeral overrides and installer seams), `7b875db` (adapter), and `1753caf` (Go process client). The separate adapter and client progress records remain as detailed batch evidence.

## PR1 Adapter Correction

- [x] The adapter rechecks all seven real installer mains with a temporary source and injected generator failure code `23`; each receives its override wrapper once and returns before destination writes. Promise/object installer results fail with exit `1` rather than appearing successful.
- Focused adapter and installer coverage passed 64/64. The correction is committed as `d1f8b84`.

## PR2: Guided TUI and Client Handoff

- [x] 2.1 — Pinned Bubble Tea `v1.3.4` and Lip Gloss `v1.0.0`; added the menu, target, model, review, and installing state model plus the command entry point.
- [x] 2.2 — Selections are isolated by target, start by semantic JSON equality with `Agent.Effective`, retain fallback arrays, cycle any declared choice count, bypass inherited-only targets, preserve state on Back/Escape, and keep the active row visible. The view truncates long labels at terminal width and keeps controls readable at 80 columns.
- [x] 2.3 — The entry point loads the read-only plan from the repository cwd. Explicit Install transitions once to the terminal-restoring quit path; after Bubble Tea exits, it passes the reviewed target and every selectable default/choice to `Client.Install` with native stdout/stderr, returning the child's non-zero exit status without retry. Exit/Back/Ctrl-C return before that boundary.
- [x] 2.4 — Focused table-driven navigation tests cover menu/target/model/review/install transitions, target-local retention, inheritance, semantic default selection, review Back default, repeated Enter suppression, visible scroll focus, narrow labels, and no request before Install.

### Focused TDD Evidence

- RED: `go test ./internal/installer` initially failed because Bubble Tea and the model were absent. A regression then failed when `NewModel` used the first catalog choice instead of the semantically equal `effective` value.
- GREEN: pinned dependencies and implemented the local model, bounded view, and restored-terminal client handoff. `go test ./internal/installer` and `go test ./...` passed; a read-only adapter plan check confirmed protocol v1 and seven targets. `git diff --check` passed.

### Workload and Boundary

- Delivery: `auto-chain`, `stacked-to-main`.
- PR2 is split into independently compiling work units under the review limit: `4d650ac` contains dependencies (61 changed lines), `b87c476` contains the pure local state core and tests (388 additions), and `23657f9` contains the Bubble Tea adapter, bounded view, entry point, and integration tests (303 additions). OpenSpec and documentation artifacts remain uncommitted.
- Rollback: remove the command and local model/view files, then remove the two direct dependencies; the existing Node adapter and installer behavior remain intact.

### Remaining

- [ ] 3.2 Manual interactive terminal exercise remains necessary for host-specific clipping, terminal restoration, and installer diagnostics.

## PR2 Closure and Regression Evidence

- [x] 2.5 — Added `npm run setup:tui` (`go run ./cmd/ospec-install`) and concise README guidance for Node.js 22+, Go 1.23+, navigation, existing destinations, ephemeral model choices, cancellation boundary, and MVP scope.
- [x] 3.1 — Final regression evidence at candidate `e5dc5cb17529e3798464cf0a2a8676076ed1e7a3`: `npm test` passed 3243 assertions and `go test ./...` passed 11 packages. See `test-evidence.md` and the complete logs referenced there.
- [x] 3.2 — Real PTY smoke passed target navigation, Back retention, inherited Antigravity, clean cancellation/terminal restoration, and fixture diagnostics with native exit code 17. See `terminal-smoke.md`.

### Closure Status

- Apply work is complete and ready for verification.
- Candidate commit: `e5dc5cb17529e3798464cf0a2a8676076ed1e7a3`.
- No live installer or user-home write was performed; model availability and host authentication remain outside the smoke scope.
