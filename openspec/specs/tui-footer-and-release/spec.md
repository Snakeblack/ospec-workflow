# Spec: tui-footer-and-release

## Purpose

Define the formal specification for the TUI Contextual Footer, Interactive Help Modal (`?`), Standalone Binary Build Pipeline, and Global Acceptance Verification for `ospec` (Milestone 7).

## Requirements

### Requirement: Contextual Footer Component {#REQ-tui-footer-001}

The system MUST provide a contextual footer component in `internal/tui/footer/` that dynamically renders relevant keybinding hints based on the active tab and available terminal width.

1. The footer MUST support all 4 application tabs:
   - **Tab 0 (Dashboard)**: MUST display tab switching hints (`1-4/Tab`), help hint (`?`), and quit hint (`q`).
   - **Tab 1 (Models Hub)**: MUST display navigation (`↑/↓`), preset switching (`1-3`), apply (`Enter`), refresh (`r`), help (`?`), and quit (`q`).
   - **Tab 2 (Targets Manager)**: MUST display target selection (`↑/↓`), sync all (`s`), reload (`r`), help (`?`), and quit (`q`).
   - **Tab 3 (System Doctor)**: MUST display check selection (`↑/↓`), re-run diagnostics (`r/Enter`), help (`?`), and quit (`q`).
2. The footer MUST style key combinations prominently (using theme primary highlight) separated by subtle dividers.
3. On compact viewports (width $< 80$ columns), the footer MUST prioritize essential shortcuts (`1-4`, `?`, `q`) and compact text descriptions to prevent visual wrapping or overflow.

#### Scenario: Footer renders contextual shortcuts for Models Hub
- GIVEN the user is on Tab 1 (Models Hub)
- WHEN the footer is rendered
- THEN the output MUST include hints for `↑/↓`, `1-3`, `Enter`, `?`, and `q`.

#### Scenario: Footer renders contextual shortcuts for System Doctor
- GIVEN the user is on Tab 3 (System Doctor)
- WHEN the footer is rendered
- THEN the output MUST include hints for `↑/↓`, `r/Enter`, `?`, and `q`.

---

### Requirement: Interactive Help Modal (`?`) {#REQ-tui-footer-002}

The system MUST provide an interactive help modal component in `internal/tui/footer/` or `internal/tui/` displaying comprehensive usage instructions and keybinding tables.

1. The help modal MUST be toggleable from any tab by pressing `?`.
2. The modal MUST present a structured Lip Gloss card featuring:
   - **Title Header**: `"📖 Ayuda & Atajos de Teclado (ospec TUI)"` with styled badge.
   - **Global Navigation Section**: Explaining `1-4` (direct tab jump), `Tab` / `Shift+Tab` (cycle tabs), `?` (toggle help), `q` / `Ctrl+C` (quit).
   - **Tab-specific Shortcuts Section**:
     - *Dashboard*: Resumen ejecutivo, perfiles activos y estadísticas globales.
     - *Models Hub*: `↑`/`↓` para navegar modelos, `1`/`2`/`3` para elegir perfil (`Cheap`, `Default`, `Premium`), `Enter` para aplicar cambios atómicamente a `models.yaml`.
     - *Targets Manager*: `↑`/`↓` para inspeccionar targets (Claude, Copilot, OpenCode, Codex, VSCode, Cursor, Antigravity), `s` para sincronizar configuración.
     - *System Doctor*: `↑`/`↓` para navegar diagnósticos, `r` o `Enter` para re-ejecutar auditoría de salud (Node.js, Go, Git, config, API keys) y ver sugerencias de remediación.
   - **Footer Dismissal Notice**: `"Presiona [?], [Esc], [q] o [Enter] para volver a la vista anterior"`.
3. Pressing `?`, `esc`, `q`, or `Enter` while the help modal is active MUST close the modal and restore full interaction with the underlying tab view without unwanted side effects.
4. The modal MUST adapt to terminal dimensions, applying width and height clamps and centering within the application screen.

#### Scenario: Open help modal via `?`
- GIVEN any active tab in the TUI
- WHEN the user presses `?`
- THEN `showHelp` MUST become `true` and the rendered output MUST contain the help modal content.

#### Scenario: Dismiss help modal via `Esc`
- GIVEN the help modal is currently visible
- WHEN the user presses `esc`
- THEN `showHelp` MUST become `false` and the underlying tab view MUST be restored.

---

### Requirement: Root Shell Integration & Overlay Dispatch {#REQ-tui-footer-003}

The root application model (`internal/tui/app.go`) MUST integrate the contextual footer and help modal into the Elm update and view lifecycle.

1. `AppModel` MUST store the `showHelp bool` state.
2. In `Update`:
   - If `showHelp` is `true`, key events MUST be trapped by the help modal handler. Closing keys (`?`, `esc`, `q`, `Enter`) MUST dismiss the modal. Other keys MUST NOT trigger underlying tab actions (such as quitting the entire app or modifying presets).
   - If `showHelp` is `false`, pressing `?` MUST toggle `showHelp = true`.
3. In `View`:
   - When `showHelp` is `true`, the application MUST render the help modal centered over the layout or in place of the view body, framed by the global header and footer.
   - When `showHelp` is `false`, the contextual footer from `footer.RenderContextualFooter(activeTab, width)` MUST be displayed at the bottom.
4. Window resizing (`tea.WindowSizeMsg`) MUST properly update width and height across all child models and the footer/modal components.

#### Scenario: Key trapping during active help modal
- GIVEN `showHelp == true` on Tab 1 (Models Hub)
- WHEN the user presses `1` (which normally selects Cheap preset)
- THEN the preset MUST NOT change and the modal MUST remain or handle the key safely without mutating configuration.

---

### Requirement: Standalone Binary Build Pipeline {#REQ-tui-footer-004}

The repository MUST provide automated build targets and scripts for compiling the standalone `ospec` binary.

1. `package.json` MUST define:
   - `"build:tui": "go build -o ospec ./cmd/ospec"`
   - `"build:ospec": "go build -o ospec ./cmd/ospec"`
2. Compiling `./cmd/ospec` via `go build -o ospec ./cmd/ospec` MUST produce a standalone, static-capable binary `ospec`.
3. The generated binary MUST start up in $<50\text{ ms}$ and run cleanly without requiring any external runtime packages.

#### Scenario: Build standalone binary via script
- GIVEN the repository root
- WHEN `npm run build:tui` or `go build -o ospec ./cmd/ospec` is executed
- THEN a valid executable binary `./ospec` MUST be created
- AND running `./ospec --help` or executing tests against `cmd/ospec` MUST succeed.

---

### Requirement: Global Non-Regression & Acceptance Verification {#REQ-tui-footer-005}

The complete system MUST pass all regression tests and fulfill all global acceptance criteria.

1. `npm test` MUST execute and pass 100% of Node.js harness test suites without errors.
2. `go test -race ./...` MUST execute and pass 100% of Go tests across all internal and cmd packages.
3. `docs/tui/roadmap.md` MUST be updated to mark Hito 7 and all associated sub-tasks as completed (`[x]`).

#### Scenario: Full suite test execution
- GIVEN all changes applied for Milestone 7
- WHEN `go test -race ./...` and `npm test` are executed
- THEN both test runners MUST exit with code 0 and 0 failures.
