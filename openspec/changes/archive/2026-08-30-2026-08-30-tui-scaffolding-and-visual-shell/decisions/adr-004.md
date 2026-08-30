# ADR-004: Tab Navigation Route Dispatch Model

- Status: proposed
- Change: 2026-08-30-tui-scaffolding-and-visual-shell
- Date: 2026-08-30

## Context
The TUI organizes capabilities into 4 primary views: Dashboard, Models Hub, Targets Manager, and System Doctor. Users need fast, intuitive keyboard navigation across these views.

## Decision
Implement a flat 4-tab enum index model (`TabDashboard`, `TabModels`, `TabTargets`, `TabDoctor`) in `internal/tui/app.go` supporting direct numeric keys `1-4`, forward cyclical traversal on `Tab`, and backward cyclical traversal on `Shift+Tab`/`backtab`.

## Alternatives
- **Hierarchical router**: Unnecessary nesting complexity for a fixed 4-view application shell.
- **Menu/Modal selection**: Slower interaction flow requiring extra keypresses.

## Consequences
- **Easier**: Instant view switching, predictable cyclical wrapping, and simple deterministic state testing.
- **Harder**: Adding sub-views within a tab will require local nested state management within the active view model.
- **Reversibility**: High; navigation state is isolated in `AppModel`.
