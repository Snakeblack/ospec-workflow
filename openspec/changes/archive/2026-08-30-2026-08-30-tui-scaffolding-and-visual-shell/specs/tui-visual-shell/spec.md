# Spec: tui-visual-shell

## Purpose

Define the foundational interactive terminal visual shell, Elm application model lifecycle, design tokens, responsive header, and tab routing for the `ospec` Go TUI.

## Requirements

### Requirement: TUI Entrypoint and Application Lifecycle {#REQ-tui-visual-shell-001}

The `ospec` standalone binary MUST initialize and run the Bubble Tea (TEA) application event loop implementing the Elm Model-Update-View architecture.

1. The application MUST support standard TEA lifecycle phases (`Init`, `Update`, `View`).
2. The event dispatcher MUST handle global exit keystrokes (`q` outside text input, `ctrl+c`) to cleanly restore the terminal alternate screen buffer and exit with status code 0.
3. The TUI execution loop MUST run independently without invoking or requiring the Node.js runtime.

#### Scenario: Standalone TUI initialization
- GIVEN the `ospec` binary is executed in a terminal
- WHEN the application starts
- THEN it MUST enter the terminal alternate screen buffer and render the visual shell

#### Scenario: Clean termination on exit command
- GIVEN the TUI application is active
- WHEN the user inputs `q` or `ctrl+c`
- THEN the application MUST cleanly restore terminal state and exit with code 0

### Requirement: Lipgloss Design System and Palette Tokens {#REQ-tui-visual-shell-002}

The theme subsystem MUST define standardized Lipgloss styling tokens adhering to the Gentle-AI / Scandinavian design palette.

| Token | Color Role | Usage |
|---|---|---|
| Primary | Cyan (`#00D7D7` / Bright Cyan) | Active titles, focused borders, active tab highlight |
| Accent | Magenta (`#D75FD7` / Soft Purple) | Badges, key indicators, accessory highlights |
| Success | Emerald (`#00AF87`) | Healthy state indicators, success badges |
| Warning | Amber (`#FF8700`) | Warnings, advisory notifications |
| Subdued | Dark Slate / Neutral Gray (`#626262`) | Inactive tabs, subtle borders, helper text |

1. The theme subsystem MUST provide reusable box styles with rounded borders, active/inactive tab styles, and badge formatting.
2. Styling tokens MUST adapt to terminal capabilities with automatic ANSI/TrueColor detection and fallback.

#### Scenario: Applying theme tokens to visual elements
- GIVEN a terminal rendering TUI components
- WHEN Lipgloss theme styles are applied to boxes, tabs, or badges
- THEN borders, padding, and foreground/background colors MUST render using the defined palette tokens

#### Scenario: Color capability fallback
- GIVEN a terminal environment without TrueColor support
- WHEN themed elements are rendered
- THEN the theme subsystem MUST fall back to compatible ANSI color codes without error or visual corruption

### Requirement: Responsive Header with ASCII Logo and Badges {#REQ-tui-visual-shell-003}

The header component MUST render a stylized `OSPEC` ASCII logo banner along with dynamic environment metadata badges.

1. The header badges MUST display the current project version, active model preset profile, and active Git branch.
2. When the terminal viewport width is 80 columns or greater (≥ 80 cols), the header MUST render the multi-line ASCII art logo.
3. When the terminal viewport width is under 80 columns (< 80 cols), the header MUST switch to a compact single-line title to prevent line wrapping and layout distortion.

#### Scenario: Standard width header rendering
- GIVEN a terminal viewport width of 80 columns or greater
- WHEN the header component renders
- THEN it MUST render the full multi-line ASCII banner and dynamic metadata badges

#### Scenario: Compact header fallback on narrow terminals
- GIVEN a terminal viewport width less than 80 columns
- WHEN the header component renders
- THEN it MUST render a compact single-line banner without clipping or line wrapping

### Requirement: Tab Navigation and Route Dispatching {#REQ-tui-visual-shell-004}
The root application model MUST manage navigation across 4 top-level view tabs:
- Tab 1: Dashboard
- Tab 2: Models Hub
- Tab 3: Targets Manager
- Tab 4: System Doctor

1. The dispatcher MUST switch active tabs on numeric keys `1`, `2`, `3`, and `4`.
2. The dispatcher MUST advance forward cyclically through tabs on `Tab` keypress, wrapping from Tab 4 to Tab 1.
3. The dispatcher MUST move backward cyclically through tabs on `Shift+Tab` (or `backtab`) keypress, wrapping from Tab 1 to Tab 4.
4. The active tab MUST be styled with active highlight tokens, while inactive tabs use subdued styling tokens.

#### Scenario: Numeric direct tab switching
- GIVEN the application is on Tab 1 (Dashboard)
- WHEN the user presses key `2`
- THEN the active view index MUST switch to Tab 2 (Models Hub) and render its view container

#### Scenario: Cyclical tab traversal
- GIVEN the application is on Tab 4 (System Doctor)
- WHEN the user presses `Tab`
- THEN the active view index MUST wrap around to Tab 1 (Dashboard)
- WHEN the user subsequently presses `Shift+Tab`
- THEN the active view index MUST wrap back to Tab 4 (System Doctor)

### Requirement: Viewport Resizing and Layout Management {#REQ-tui-visual-shell-005}

The root model MUST handle `tea.WindowSizeMsg` events and dynamically adapt the layout to terminal dimension changes.

1. The model MUST update its stored viewport width and height upon receiving `tea.WindowSizeMsg`.
2. Dimension updates MUST propagate to header, body, and navigation components.
3. The layout MUST render stably across viewport changes without panic or unconstrained buffer growth.

#### Scenario: Dynamic terminal resizing
- GIVEN the TUI application is active
- WHEN a terminal resize event generates `tea.WindowSizeMsg` with new dimensions
- THEN the application MUST update its viewport state and re-render header and views to fit the new boundaries

### Requirement: Decoupled Go Dependency and Build Architecture {#REQ-tui-visual-shell-006}

The TUI visual shell MUST be implemented as a modular Go component in `internal/tui/` and `cmd/ospec/`.

1. Go dependencies MUST be pinned in `go.mod` (`bubbletea`, `lipgloss`, `bubbles`, `huh`, `yaml.v3`).
2. The binary MUST compile via `go build -o ospec ./cmd/ospec` without external CGo or runtime scripting requirements.
3. The Go TUI codebase MUST remain decoupled from the Node.js test harness, ensuring `npm test` runs with zero regressions.

#### Scenario: Standalone compilation
- GIVEN the pinned `go.mod` and source files under `cmd/ospec` and `internal/tui`
- WHEN running `go build -o ospec ./cmd/ospec`
- THEN the compiler MUST produce a standalone executable binary

#### Scenario: Harness isolation verification
- GIVEN the TUI scaffolding and Go configuration additions
- WHEN running the Node.js test harness via `npm test`
- THEN all existing harness test suites MUST pass with zero failures
