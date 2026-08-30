# Proposal: TUI Scaffolding and Visual Shell

## Intent

Provide the foundational interactive terminal visual shell and application lifecycle for `ospec`, establishing a modern, standalone Go TUI fully decoupled from the Node.js test and hook harness. This implements Milestone 1 of the TUI roadmap.

## Scope

### In Scope
- Add and pin Go dependencies (`bubbletea`, `lipgloss`, `bubbles`, `huh`, `yaml.v3`) in `go.mod`.
- Lipgloss design system and palette tokens (`internal/tui/theme/`).
- Header component with `OSPEC` ASCII logo banner and dynamic environment badges (`internal/tui/header/`).
- Elm App Model skeleton (`cmd/ospec/main.go`, `internal/tui/app.go`) supporting TEA lifecycle (`Init`, `Update`, `View`), window resizing, 4-tab navigation (`Tab`, `Shift+Tab`, `1-4`), and global shortcuts (`q`, `ctrl+c`, `?`).

### Out of Scope
- Milestones 2–7: Declarative YAML persistence engine, individual view implementations (Dashboard, Models Hub, Targets Manager, System Doctor), footer modals, and binary release packaging.
- Calling or embedding Node.js runtime scripts from the TUI.

## Capabilities

> This section is the CONTRACT between proposal and specs phases.
> The sdd-spec agent reads this to know exactly which spec files to create or update.
> Research `openspec/specs/` before filling this in.

### New Capabilities
- `tui-visual-shell`: Standalone TUI entrypoint, Lipgloss design tokens, dynamic ASCII banner and badge header, and Elm architecture event dispatcher with tab routing.

### Modified Capabilities
None

## Approach

- Implement Charmbracelet's `bubbletea` Model-Update-View architecture in `internal/tui/app.go` with `cmd/ospec/main.go` as the standalone entrypoint.
- Define a unified Scandinavian/Gentle-AI design system in `internal/tui/theme/` (Primary Cyan, Accent Magenta, Success Emerald, Warning Amber, Subdued Slate).
- Build a modular `Header` component in `internal/tui/header/` rendering ASCII art and real-time environment tags (version, active model preset, git branch).
- Handle terminal resize (`tea.WindowSizeMsg`) and global hotkeys cleanly at the top-level TEA dispatcher.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `go.mod` / `go.sum` | Modified | Require Charmbracelet (`bubbletea`, `lipgloss`, `bubbles`, `huh`) and `yaml.v3` |
| `cmd/ospec/main.go` | New | Entrypoint for the `ospec` TUI binary |
| `internal/tui/app.go` | New | Root Elm App Model and event dispatcher |
| `internal/tui/theme/` | New | Lipgloss theme, color tokens, and box/tab/badge styles |
| `internal/tui/header/` | New | ASCII logo banner and dynamic metadata badge component |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Narrow terminal widths (<80 cols) distort ASCII banner | Low | Responsive fallback to compact text header when width is below threshold |
| Terminal ANSI color limitations | Low | Lipgloss automatic ANSI/TrueColor detection and fallback |

## Rollback Plan

Delete `cmd/ospec/` and `internal/tui/` directories and restore `go.mod`/`go.sum` via `git checkout -- go.mod go.sum`. No runtime or test harness code is affected.

## Dependencies

- Go 1.24+ toolchain
- `github.com/charmbracelet/bubbletea`
- `github.com/charmbracelet/lipgloss`
- `github.com/charmbracelet/bubbles`
- `github.com/charmbracelet/huh`
- `gopkg.in/yaml.v3`

## Success Criteria

- [ ] `go build -o ospec ./cmd/ospec` succeeds and outputs a runnable binary.
- [ ] Executing `./ospec` displays the stylized ASCII logo, dynamic badges, tab headers, and shell layout.
- [ ] Window resizing (`tea.WindowSizeMsg`) dynamically adjusts layout without panics or clipping.
- [ ] Tab navigation (`1-4`, `Tab`, `Shift+Tab`) and global exit keys (`q`, `ctrl+c`) function as expected.
- [ ] Existing harness test suite (`npm test`) passes with zero regressions.
