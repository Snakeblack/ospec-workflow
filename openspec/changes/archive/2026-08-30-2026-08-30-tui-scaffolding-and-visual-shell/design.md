# Design: TUI Scaffolding and Visual Shell

## Technical Approach

This design establishes Milestone 1 of the `ospec` TUI roadmap by implementing a standalone, modular Go interactive terminal application using Charmbracelet's Bubble Tea (`bubbletea`), Lipgloss (`lipgloss`), and Bubbles (`bubbles`).

The design decouples the interactive terminal experience entirely from the existing Node.js test and hook harness. The entrypoint `cmd/ospec/main.go` instantiates the root Elm Model-Update-View application model (`internal/tui/app.go`), configures the alternate screen buffer, and runs the TEA event loop. Visual components are styled through a unified Gentle-AI / Scandinavian design token subsystem (`internal/tui/theme/`), and the header component (`internal/tui/header/`) dynamically adapts between a multi-line ASCII banner and a compact single-line header based on the terminal viewport width.

This design satisfies all requirements specified in `openspec/changes/2026-08-30-tui-scaffolding-and-visual-shell/specs/tui-visual-shell/spec.md` (REQ-tui-visual-shell-001 through REQ-tui-visual-shell-006).

```
┌─────────────────────────────────────────────────────────────┐
│ cmd/ospec/main.go (Entrypoint & Program Runner)             │
│   └── internal/tui/app.go (Root AppModel & TEA Dispatcher)  │
│         ├── internal/tui/theme/ (Lipgloss Tokens & Styles)  │
│         ├── internal/tui/header/ (Responsive ASCII Banner)  │
│         └── View Containers (Dashboard, Models, Targets, Dr)│
└─────────────────────────────────────────────────────────────┘
```

---

## Architecture Decisions

### Decision: Bubble Tea (TEA) Elm Loop for Root Application Dispatch

| Option | Trade-off | Decision |
|---|---|---|
| **Charmbracelet Bubble Tea (TEA)** | Unidirectional data flow, functional purity, robust terminal event handling; requires immutable state transitions. | **Selected**: Idiomatic in modern Go CLI/TUI tools, high performance, excellent testing ergonomics (`Model.Update`). |
| **tview / cview (Imperative TUI)** | Widget-centric state mutation; harder to unit test deterministically, prone to race conditions. | **Rejected**: Poor fit for test-driven state verification and responsive layout recalculation. |
| **Direct ANSI / Raw Terminal IO** | Zero external dependencies; extreme development overhead and fragile cross-platform support. | **Rejected**: Unnecessary complexity and high maintenance cost. |

**Rationale**: Bubble Tea enforces predictable unidirectional state updates via the Elm architecture (`Init`, `Update`, `View`). All user keypresses and window resizes flow through a single `Update(tea.Msg)` dispatcher, making testing straightforward through deterministic message injection.

---

### Decision: Lipgloss Gentle-AI / Scandinavian Design Token Hierarchy

| Option | Trade-off | Decision |
|---|---|---|
| **Centralized Lipgloss Token Module (`internal/tui/theme/`)** | Structured palette tokens (Cyan, Magenta, Emerald, Amber, Slate) with automatic ANSI fallback; slight abstraction overhead. | **Selected**: Consistent visual identity across all views and components, centralized styling changes. |
| **Ad-hoc Lipgloss Styles per Component** | Direct styling in each view; high duplication, inconsistent padding and borders, color drift. | **Rejected**: Violates design consistency and makes theming fragile. |
| **External ANSI/CSS Parser** | Complex configuration files; runtime overhead and unnecessary dependency footprint. | **Rejected**: Overkill for CLI/TUI tool requirements. |

**Rationale**: Centralizing colors (`Primary = #00D7D7`, `Accent = #D75FD7`, `Success = #00AF87`, `Warning = #FF8700`, `Subdued = #626262`) and style builders (boxes, tabs, badges) in `internal/tui/theme/` guarantees visual coherence and enables automatic ANSI/TrueColor adaptation across diverse terminal emulators.

---

### Decision: Responsive Viewport Header with Width Breakpoint (80 Cols)

| Option | Trade-off | Decision |
|---|---|---|
| **Dynamic Viewport Breakpoint (≥80 Standard / <80 Compact)** | Multi-line ASCII banner on standard viewports; graceful fallback to single-line banner on narrow viewports. | **Selected**: Eliminates line wrapping and buffer corruption on small terminals while providing distinctive branding on standard terminals. |
| **Fixed Multi-Line ASCII Banner Only** | Rich visual banner; clips or wraps destructively on terminal widths below 80 columns. | **Rejected**: Degrades user experience on split panes or mobile/narrow terminal windows. |
| **Plain Text Header Only** | Minimal width footprint; lacks visual identity and Polish. | **Rejected**: Fails project UX and visual identity objectives. |

**Rationale**: A width threshold at 80 columns (`MinStandardWidth = 80`) allows the header component to render the full stylized multi-line `OSPEC` ASCII logo banner and metadata ribbon when space permits, while falling back cleanly to a single-line title on constrained displays.

---

### Decision: Tab Navigation Route Dispatch Model

| Option | Trade-off | Decision |
|---|---|---|
| **4-Tab Enum State Model with Cyclic Wrap** | Enum index (`TabDashboard`, `TabModels`, `TabTargets`, `TabDoctor`), direct numeric indexing (`1-4`), and wrap-around `Tab` / `Shift+Tab`. | **Selected**: Intuitive keyboard navigation matching terminal user muscle memory; fully deterministic in state unit tests. |
| **Stack-Based Hierarchical Router** | Supports deep nested navigation; over-engineered for 4 top-level views. | **Rejected**: Adds unnecessary routing complexity to Milestone 1. |
| **Menu-Driven Modal Navigation** | Requires opening/closing menus; slower navigation workflow. | **Rejected**: Hampers developer efficiency. |

**Rationale**: A flat 4-tab model directly indexed by integers `0..3` maps cleanly to hotkeys `1`, `2`, `3`, `4` and cyclical navigation keys (`Tab`, `Shift+Tab`, `backtab`), providing instant switching between views.

---

## Data Flow

The runtime data flow follows the unidirectional Elm loop:

```
                  ┌──────────────────────────────┐
                  │ Terminal Input / Window Size │
                  └──────────────┬───────────────┘
                                 │
                                 ▼
                     tea.Msg (KeyMsg / WindowSizeMsg)
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │  internal/tui/app.go         │
                  │  AppModel.Update(tea.Msg)    │
                  └──────────────┬───────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
          ▼                      ▼                      ▼
  [Key: '1'..'4' / Tab]   [WindowSizeMsg]          [Key: 'q' / Ctrl+C]
  Update activeTab         Update width/height     Set quitting = true
  (0..3)                   header.SetWidth(w)      Return tea.Quit
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │  AppModel.View()             │
                  │  ├── header.View()           │
                  │  ├── theme.RenderTabBar()    │
                  │  ├── renderActiveView()      │
                  │  └── theme.RenderFooter()    │
                  └──────────────┬───────────────┘
                                 │
                                 ▼
                    Rendered Terminal String
```

---

## File Changes

| File | Action | Description |
|---|---|---|
| `cmd/ospec/main.go` | Create | Application entrypoint; initializes `tea.NewProgram` with alternate screen buffer and runs the event loop. |
| `internal/tui/app.go` | Create | Root `AppModel` definition, TEA `Init`, `Update`, `View` methods, tab routing, and placeholder view rendering. |
| `internal/tui/app_test.go` | Create | Unit tests for `AppModel.Update()` verifying tab cycling, numeric shortcuts, window resizing, and clean exit. |
| `internal/tui/theme/colors.go` | Create | Color palette tokens (Primary, Accent, Success, Warning, Subdued, Text, Background) with Lipgloss colors. |
| `internal/tui/theme/theme.go` | Create | Lipgloss reusable styles (box, rounded border, active/inactive tab, badge, footer) and helper layout renderers. |
| `internal/tui/theme/theme_test.go` | Create | Unit tests for theme styling helpers and color formatting. |
| `internal/tui/header/header.go` | Create | Responsive Header model, ASCII banner renderer (multi-line ≥80 cols, single-line <80 cols), and dynamic metadata badges. |
| `internal/tui/header/header_test.go` | Create | Unit tests and golden-file comparison tests for standard and compact header rendering. |
| `internal/tui/header/testdata/header_standard.golden` | Create | Golden file fixture for standard width (≥ 80 cols) header rendering. |
| `internal/tui/header/testdata/header_compact.golden` | Create | Golden file fixture for compact width (< 80 cols) header rendering. |

---

## Interfaces / Contracts

### Tab Routing Model

```go
package tui

type TabID int

const (
    TabDashboard TabID = iota
    TabModels
    TabTargets
    TabDoctor
    tabCount // 4
)

func (t TabID) Title() string {
    switch t {
    case TabDashboard:
        return "Dashboard"
    case TabModels:
        return "Models Hub"
    case TabTargets:
        return "Targets Manager"
    case TabDoctor:
        return "System Doctor"
    default:
        return "Unknown"
    }
}
```

### Root Application Model (`internal/tui/app.go`)

```go
package tui

import (
    tea "github.com/charmbracelet/bubbletea"
    "github.com/snakeblack/ospec-workflow/internal/tui/header"
)

type AppModel struct {
    activeTab TabID
    width     int
    height    int
    header    header.Model
    quitting  bool
    ready     bool
}

func NewAppModel() AppModel {
    return AppModel{
        activeTab: TabDashboard,
        header:    header.New("v2.56.0", "Default", "main"),
    }
}

func (m AppModel) Init() tea.Cmd {
    return nil
}

func (m AppModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
    switch msg := msg.(type) {
    case tea.KeyMsg:
        switch msg.String() {
        case "q", "ctrl+c":
            m.quitting = true
            return m, tea.Quit
        case "1":
            m.activeTab = TabDashboard
        case "2":
            m.activeTab = TabModels
        case "3":
            m.activeTab = TabTargets
        case "4":
            m.activeTab = TabDoctor
        case "tab":
            m.activeTab = (m.activeTab + 1) % tabCount
        case "shift+tab", "backtab":
            m.activeTab = (m.activeTab + tabCount - 1) % tabCount
        }
    case tea.WindowSizeMsg:
        m.width = msg.Width
        m.height = msg.Height
        m.header.SetWidth(msg.Width)
        m.ready = true
    }
    return m, nil
}

func (m AppModel) View() string
```

### Header Component Model (`internal/tui/header/header.go`)

```go
package header

const MinStandardWidth = 80

type Model struct {
    width        int
    version      string
    activePreset string
    gitBranch    string
}

func New(version, activePreset, gitBranch string) Model {
    return Model{
        version:      version,
        activePreset: activePreset,
        gitBranch:    gitBranch,
        width:        MinStandardWidth,
    }
}

func (m *Model) SetWidth(w int) {
    m.width = w
}

func (m Model) View() string
func (m Model) RenderBanner() string
func (m Model) RenderBadges() string
```

### Design Tokens Subsystem (`internal/tui/theme/colors.go`, `theme.go`)

```go
package theme

import "github.com/charmbracelet/lipgloss"

var (
    ColorPrimary  = lipgloss.Color("#00D7D7") // Cyan
    ColorAccent   = lipgloss.Color("#D75FD7") // Magenta / Purple
    ColorSuccess  = lipgloss.Color("#00AF87") // Emerald
    ColorWarning  = lipgloss.Color("#FF8700") // Amber
    ColorSubdued  = lipgloss.Color("#626262") // Slate Gray
    ColorBg       = lipgloss.Color("#1C1C1C") // Charcoal
    ColorFg       = lipgloss.Color("#FFFFFF") // White
    ColorFgMuted  = lipgloss.Color("#8A8A8A") // Muted Text
)

var (
    StyleActiveTab   = lipgloss.NewStyle().Bold(true).Foreground(ColorPrimary)
    StyleInactiveTab = lipgloss.NewStyle().Foreground(ColorSubdued)
    StyleBox         = lipgloss.NewStyle().BorderStyle(lipgloss.RoundedBorder()).BorderForeground(ColorSubdued)
    StyleBadgeLabel  = lipgloss.NewStyle().Foreground(ColorFgMuted)
    StyleBadgeVal    = lipgloss.NewStyle().Bold(true).Foreground(ColorAccent)
)

func RenderBadge(label, val string, valStyle lipgloss.Style) string
func RenderTabBar(activeTab int, width int) string
func RenderFooter(activeTab int, width int) string
```

---

## Testing Strategy

Following the `stack-go-testing` skill rules:

| Layer | What to Test | Approach |
|---|---|---|
| **Unit** (`internal/tui/app_test.go`) | Tab switching (`1-4`, `Tab`, `Shift+Tab`, cyclic wrap) | Direct `Model.Update(tea.KeyMsg)` invocation and state assertion. |
| **Unit** (`internal/tui/app_test.go`) | Exit keystrokes (`q`, `ctrl+c`) | Direct `Model.Update(tea.KeyMsg)` asserting `quitting == true` and `tea.Quit` command. |
| **Unit** (`internal/tui/app_test.go`) | Window resizing (`tea.WindowSizeMsg`) | Direct `Model.Update(tea.WindowSizeMsg)` asserting stored width/height and header width propagation. |
| **Unit / Golden** (`internal/tui/header/header_test.go`) | Responsive header layout (≥80 cols standard ASCII, <80 cols compact) | Direct rendering assertions + golden file comparison (`-update` flag support). |
| **Unit** (`internal/tui/theme/theme_test.go`) | Design token formatting and tab bar rendering | Assert rendered badge and tab strings contain expected tokens and labels. |
| **Integration** (Build verification) | Standalone binary compilation | `go build -o ospec ./cmd/ospec` executes cleanly with zero errors. |
| **Regression** (Harness verification) | Decoupled Node.js harness isolation | `npm test` executes the complete existing test suite with 0 regressions. |

### Golden Test Pattern for Header

```go
var update = flag.Bool("update", false, "update golden files")

func assertGolden(t *testing.T, goldenPath, got string) {
    t.Helper()
    if *update {
        _ = os.MkdirAll(filepath.Dir(goldenPath), 0o755)
        if err := os.WriteFile(goldenPath, []byte(got), 0o644); err != nil {
            t.Fatalf("failed to update golden file: %v", err)
        }
    }
    want, err := os.ReadFile(goldenPath)
    if err != nil {
        t.Fatalf("failed to read golden file %s: %v", goldenPath, err)
    }
    if got != string(want) {
        t.Fatalf("golden mismatch for %s\ngot:\n%s\nwant:\n%s", goldenPath, got, string(want))
    }
}
```

---

## Migration / Rollout

- **Migration**: None. This is a greenfield TUI implementation in `cmd/ospec/` and `internal/tui/`. No existing files are modified aside from dependencies already configured in `go.mod`.
- **Feature Flags**: None required. The standalone binary `ospec` runs independently when invoked.
- **Rollout**: Milestone 1 establishes the visual shell. Subsequent milestones (2 through 7) will build on top of this scaffolding to add YAML persistence and full view controllers.
- **Rollback**: Delete `cmd/ospec/` and `internal/tui/` and restore `go.mod`/`go.sum` if necessary. Existing Node.js harness tests and scripts are 100% unaffected.

---

## Open Questions

None. All architectural requirements and interfaces for Milestone 1 are defined and verified against `tui-visual-shell` specifications.
