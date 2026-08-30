# ADR-002: Lipgloss Gentle-AI / Scandinavian Design Token Hierarchy

- Status: proposed
- Change: 2026-08-30-tui-scaffolding-and-visual-shell
- Date: 2026-08-30

## Context
Visual consistency across the TUI is essential for developer experience. Colors, padding, borders, and badges must follow unified design principles and gracefully degrade across diverse terminal color profiles.

## Decision
Establish a centralized Lipgloss styling subsystem in `internal/tui/theme/` based on the Gentle-AI / Scandinavian palette (Primary Cyan `#00D7D7`, Accent Magenta `#D75FD7`, Success Emerald `#00AF87`, Warning Amber `#FF8700`, Subdued Slate `#626262`).

## Alternatives
- **Ad-hoc component styles**: Causes color drift, duplicated border definitions, and inconsistent spacing across views.
- **External CSS/ANSI parser**: Introduces runtime parsing overhead and unnecessary external dependencies.

## Consequences
- **Easier**: Uniform layout, rounded borders, reusable badge and tab renderers, and automatic ANSI/TrueColor detection.
- **Harder**: Styling changes require routing through theme tokens rather than raw inline ANSI escape codes.
- **Reversibility**: High; palette and tokens are isolated in `internal/tui/theme/`.
