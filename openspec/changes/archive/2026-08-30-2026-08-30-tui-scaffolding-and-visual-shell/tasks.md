# Tasks: TUI Scaffolding and Visual Shell

## Spec/Design Reconciliation

| Requirement / Scenario | Priority | Design Allocation | Status | Notes |
|------------------------|----------|-------------------|--------|-------|
| REQ-tui-visual-shell-001 / Standalone TUI initialization | MUST | `cmd/ospec/main.go`, `internal/tui/app.go` | covered-by-design | TEA program setup with alternate screen buffer |
| REQ-tui-visual-shell-001 / Clean termination on exit command | MUST | `internal/tui/app.go` (`Update` loop `q`, `ctrl+c`) | covered-by-design | Returns `tea.Quit` command and sets quitting flag |
| REQ-tui-visual-shell-002 / Applying theme tokens to visual elements | MUST | `internal/tui/theme/colors.go`, `theme.go` | covered-by-design | Lipgloss styles for boxes, tabs, and badges |
| REQ-tui-visual-shell-002 / Color capability fallback | MUST | `internal/tui/theme/colors.go` | covered-by-design | Handled natively by Lipgloss color profiles |
| REQ-tui-visual-shell-003 / Standard width header rendering | MUST | `internal/tui/header/header.go` | covered-by-design | Multi-line ASCII banner for width ≥ 80 cols |
| REQ-tui-visual-shell-003 / Compact header fallback on narrow terminals | MUST | `internal/tui/header/header.go` | covered-by-design | Single-line header fallback for width < 80 cols |
| REQ-tui-visual-shell-004 / Numeric direct tab switching | MUST | `internal/tui/app.go` (KeyMsg '1'..'4') | covered-by-design | Direct index assignment to activeTab |
| REQ-tui-visual-shell-004 / Cyclical tab traversal | MUST | `internal/tui/app.go` (KeyMsg 'tab', 'shift+tab') | covered-by-design | Modulo arithmetic wrap-around across 4 tabs |
| REQ-tui-visual-shell-005 / Dynamic terminal resizing | MUST | `internal/tui/app.go` (tea.WindowSizeMsg) | covered-by-design | Stored dimension update and header propagation |
| REQ-tui-visual-shell-006 / Standalone compilation | MUST | `cmd/ospec/main.go`, `go.mod` | covered-by-design | Pure Go build without CGo or external runtimes |
| REQ-tui-visual-shell-006 / Harness isolation verification | MUST | `go.mod`, `npm test` test suite | covered-by-design | Completely decoupled from Node.js scripts |

### Reconciliation Verdict
- MUST coverage: complete
- SHOULD/MAY gaps: none
- Ambiguities to track: none

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~320 lines |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Standalone Go TUI visual shell, theme tokens, responsive header, and Elm model | Single PR | Greenfield Go implementation under `cmd/ospec/` and `internal/tui/`; includes unit and golden tests |

### Checklist Status Legend

- `[ ]` Not implemented yet
- `[~]` Implemented but not yet verified locally
- `[x]` Implemented and verified locally

## Phase 1: Design System and Palette Tokens (`internal/tui/theme`)

- [x] 1.1 [RED] Create failing unit tests in `internal/tui/theme/theme_test.go` asserting Lipgloss palette tokens, badge rendering, and tab styling [REQ-tui-visual-shell-002]
- [x] 1.2 [GREEN] Implement Gentle-AI / Scandinavian color constants in `internal/tui/theme/colors.go` and styling helpers in `internal/tui/theme/theme.go` [REQ-tui-visual-shell-002]
- [x] 1.3 [REFACTOR] Verify Lipgloss ANSI fallback behavior and clean up exported style constructors [REQ-tui-visual-shell-002]

## Phase 2: Responsive Header Component (`internal/tui/header`)

- [x] 2.1 [RED] Create failing unit and golden-file comparison tests in `internal/tui/header/header_test.go` with fixtures `testdata/header_standard.golden` and `testdata/header_compact.golden` [REQ-tui-visual-shell-003]
- [x] 2.2 [GREEN] Implement Header model, ASCII logo banner (multi-line vs compact single-line at 80 cols), and dynamic metadata badges in `internal/tui/header/header.go` [REQ-tui-visual-shell-003]
- [x] 2.3 [REFACTOR] Refactor header width adaptation and optimize badge string concatenation [REQ-tui-visual-shell-003]

## Phase 3: Root Elm Application Model and Tab Dispatcher (`internal/tui`)

- [x] 3.1 [RED] Create failing unit tests in `internal/tui/app_test.go` verifying 4-tab cyclic navigation (`1-4`, `Tab`, `Shift+Tab`), window resize propagation, and clean exit (`q`, `ctrl+c`) [REQ-tui-visual-shell-001, REQ-tui-visual-shell-004, REQ-tui-visual-shell-005]
- [x] 3.2 [GREEN] Implement `AppModel`, `TabID` enum, TEA lifecycle (`Init`, `Update`, `View`), and tab routing dispatcher in `internal/tui/app.go` [REQ-tui-visual-shell-001, REQ-tui-visual-shell-004, REQ-tui-visual-shell-005]
- [x] 3.3 [REFACTOR] Clean up viewport height calculations and tab view container layout boundaries [REQ-tui-visual-shell-004, REQ-tui-visual-shell-005]

## Phase 4: CLI Entrypoint, Build Verification, and Harness Isolation (`cmd/ospec`, validation)

- [x] 4.1 [RED] Define entrypoint initialization and binary compilation test assertion for `cmd/ospec/main.go` [REQ-tui-visual-shell-001, REQ-tui-visual-shell-006]
- [x] 4.2 [GREEN] Implement standalone binary entrypoint in `cmd/ospec/main.go` initializing `tea.NewProgram` with alternate screen buffer [REQ-tui-visual-shell-001, REQ-tui-visual-shell-006]
- [x] 4.3 [REFACTOR] Verify `go build -o ospec ./cmd/ospec`, execute all Go unit tests via `go test ./...`, and run `npm test` to verify zero harness regressions [REQ-tui-visual-shell-006]
