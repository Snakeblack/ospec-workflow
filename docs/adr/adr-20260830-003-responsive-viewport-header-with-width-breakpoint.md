# ADR-003: Responsive Viewport Header with Width Breakpoint

- Status: proposed
- Change: 2026-08-30-tui-scaffolding-and-visual-shell
- Date: 2026-08-30

## Context
The header displays an ASCII art `OSPEC` banner and dynamic metadata badges (version, active preset, git branch). Narrow terminal windows (< 80 columns) cause multi-line ASCII art to wrap destructively.

## Decision
Implement a responsive breakpoint at 80 columns in `internal/tui/header/`. Render the full multi-line ASCII banner when `width >= 80`, and fall back to a single-line stylized title banner when `width < 80`.

## Alternatives
- **Fixed multi-line banner**: Corrupts layout and wraps lines on split panes or narrow terminals.
- **Plain text only banner**: Sacrifices branding identity and visual ergonomics on standard terminals.

## Consequences
- **Easier**: Clean display across all terminal sizes without text clipping or wrapping artifacts.
- **Harder**: Header component must maintain two rendering modes and respond dynamically to `tea.WindowSizeMsg`.
- **Reversibility**: High; rendering logic is self-contained in `internal/tui/header/header.go`.
