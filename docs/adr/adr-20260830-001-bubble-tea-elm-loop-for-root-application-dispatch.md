# ADR-001: Bubble Tea Elm Loop for Root Application Dispatch

- Status: proposed
- Change: 2026-08-30-tui-scaffolding-and-visual-shell
- Date: 2026-08-30

## Context
The `ospec` CLI needs an interactive terminal user interface to configure models, profiles, targets, and diagnostics. We require a robust, maintainable architecture for terminal I/O, event dispatching, and state management.

## Decision
Adopt Charmbracelet's Bubble Tea (`bubbletea`) implementing the functional Elm Architecture (Model-Update-View) as the root application loop in `internal/tui/app.go`.

## Alternatives
- **tview / cview**: Imperative widget mutation makes deterministic unit testing and reactive recalculation harder.
- **Direct ANSI Terminal I/O**: High development overhead and fragile cross-platform maintenance.

## Consequences
- **Easier**: Deterministic testing via direct `Model.Update()` calls, clean terminal buffer restoration, and standard event handling.
- **Harder**: Requires immutable model state transitions and pure functional view rendering.
- **Reversibility**: Moderate; changing TUI frameworks would require rewriting view dispatchers.
