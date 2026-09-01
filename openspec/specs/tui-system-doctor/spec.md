# Spec: tui-system-doctor

## Purpose

Define the formal specification for the System Doctor & Diagnostics subsystem and interactive TUI view (`TabDoctor` / Tab 4) in `ospec`, including the decoupled diagnostic engine (`internal/system/doctor.go`), severity evaluation, technical evidence gathering, remediation recommendations, responsive Elm view (`internal/tui/views/doctor/`), and root `AppModel` integration (`internal/tui/app.go`).

## Requirements

### Requirement: System Diagnostics Engine {#REQ-tui-doctor-001}

The system MUST provide a decoupled diagnostics engine in `internal/system/doctor.go` that inspects the health of the host development environment across 4 core categories:

1. **Runtimes & Toolchain (`CategoryRuntime`)**:
   - Node.js runtime: MUST verify `node` executable and parse version. Version >= 22.0.0 is evaluated as `SeverityOK`. Lower version (< 22.0.0) or missing binary MUST be evaluated as `SeverityError` with remediation instruction.
   - Go toolchain: MUST verify `go` executable and parse version. Version >= 1.23.0 is evaluated as `SeverityOK`. Lower version (< 1.23.0) or missing binary MUST be evaluated as `SeverityError` with remediation instruction.
2. **Repository & Git (`CategoryRepo`)**:
   - Git CLI: MUST verify `git` executable. Missing binary MUST be evaluated as `SeverityError`.
   - Git Working Tree: MUST check working tree cleanliness (`git status --porcelain`). Clean tree MUST return `SeverityOK`. Dirty tree (modified/untracked files) MUST return `SeverityWarning` (advisory) with remediation instruction.
3. **Project Configuration (`CategoryConfig`)**:
   - Key configuration files: MUST inspect existence of `models.yaml`, `openspec/config.yaml`, and `hooks/hooks.json` (or `.hooks.json`).
   - If all required configuration files exist, it MUST return `SeverityOK`. If any file is missing, it MUST return `SeverityWarning` or `SeverityError` with list of missing files and remediation.
4. **API Keys & Credentials (`CategoryAuth`)**:
   - Environment variables: MUST inspect presence of standard AI provider keys (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `GITHUB_TOKEN`).
   - Presence of at least one provider key MUST return `SeverityOK` listing detected provider keys. Absence of any provider key MUST return `SeverityWarning` (advisory, non-blocking) with setup instructions.
5. The engine MUST return a structured `DoctorReport` containing:
   - `Timestamp` (`time.Time`)
   - `RepoRoot` (string)
   - `Checks` (`[]DoctorCheck` with `ID`, `Name`, `Category`, `Severity`, `Message`, `Details`, `Remediation`)
   - `TotalPassed`, `TotalWarnings`, `TotalErrors` (int)
   - `Status()` returning `Healthy` (0 errors, 0 warnings), `Degraded` (0 errors, >0 warnings), or `Critical` (>0 errors).

#### Scenario: Run diagnostics in compliant workspace
- GIVEN a system with Node.js >= 22, Go >= 1.23, Git available, clean repository, valid configuration files, and active API keys
- WHEN `RunDiagnostics(repoRoot)` is executed
- THEN all checks MUST return `SeverityOK`
- AND `report.Status()` MUST return `"Healthy"` with `TotalErrors == 0` and `TotalWarnings == 0`.

#### Scenario: Run diagnostics with missing Node.js or outdated version
- GIVEN a system where `node` is absent or version is `v20.10.0`
- WHEN `RunDiagnostics(repoRoot)` is executed
- THEN the Node.js check MUST return `SeverityError` with actionable remediation (`"Install Node.js >= 22 (https://nodejs.org)"`)
- AND `report.Status()` MUST return `"Critical"`.

---

### Requirement: System Doctor TUI View & Navigation {#REQ-tui-doctor-002}

The system MUST provide an interactive Bubble Tea Elm view in `internal/tui/views/doctor/` displaying the diagnostic report with full keyboard navigation and detail inspection.

1. The view MUST maintain a selectable list of diagnostic checks supporting navigation keys (`Up`, `Down`, `j`, `k`, `Home`, `End`, direct numeric keys `1` through `9`).
2. Selection index MUST clamp within valid bounds `[0, len(checks)-1]` without panicking.
3. The UI layout MUST render:
   - **Health Summary Banner**: Overall status badge (`[✓ All Systems Healthy]`, `[⚠ Environment Degraded]`, `[✗ Critical Issues Detected]`) with counts of passed, warnings, and errors.
   - **Checklist Pane**: Selectable list with colored badges (`✓ OK` green, `⚠ AVISO` yellow, `✗ ERROR` red), category tags, check names, and brief status messages.
   - **Diagnostic Detail Pane**: Detailed card for the selected check, showing category, severity badge, description, technical evidence details box, and a highlighted remediation box (`💡 Remediación: ...`).
   - **Help / Shortcuts Bar**: Navigation hints (`↑/↓: Navegar | j/k: Mover | r: Re-escanear | 1-4: Vistas`).

#### Scenario: Keyboard navigation in Doctor view
- GIVEN the Doctor view with check index 0 selected
- WHEN the user presses `Down` or `j`
- THEN the selected check index MUST update to 1 and the detail pane MUST immediately render details and remediation for check index 1.

#### Scenario: Boundary safety on keyboard navigation
- GIVEN the Doctor view with the last check selected
- WHEN the user presses `Down`
- THEN the selection MUST remain clamped to the last check index without error.

---

### Requirement: Diagnostic Re-run Action & Real-time Refresh {#REQ-tui-doctor-003}

The system MUST provide an interactive trigger in the Doctor view to re-run diagnostics on demand.

1. When the user presses `r` or `Enter`, the view MUST trigger a re-execution of `RunDiagnostics(repoRoot)`.
2. The view MUST update its checks list, counters, and selected item details reactively.
3. The selection index MUST be preserved or clamped to valid bounds if the checks count changes.
4. The view MUST emit `DoctorRefreshedMsg` upon completion of diagnostics re-run.

#### Scenario: Re-run diagnostics via keyboard shortcut
- GIVEN the Doctor view displaying previously loaded checks
- WHEN the user presses `r`
- THEN `RunDiagnostics` MUST execute, the checks list and health summary MUST refresh immediately, and the view MUST remain responsive.

---

### Requirement: Responsive Rendering & Layout Adaptation {#REQ-tui-doctor-004}

The Doctor view MUST dynamically adapt its layout based on terminal dimensions and handle resize events safely.

1. On wide viewports (width $\ge 96$ columns):
   - The view MUST render a side-by-side horizontal split layout (Checklist on left, Diagnostic Details on right).
2. On compact viewports (width $< 96$ columns):
   - The view MUST render a vertically stacked layout (Checklist on top, Diagnostic Details below).
3. The view MUST apply width and height clamps to avoid ANSI text wrapping defects, negative dimension calculations, or rendering panics.
4. When terminal height is constrained ($< 15$ lines), the detail pane MUST truncate secondary descriptions while keeping primary status badges and remediation visible.

#### Scenario: Resize from compact to wide terminal
- GIVEN the Doctor view rendered in 80 columns (vertical stacked layout)
- WHEN a `tea.WindowSizeMsg` with width 120 and height 40 is received
- THEN the view MUST transition to side-by-side split layout with proportional box widths and heights.

---

### Requirement: Root Shell Elm Integration {#REQ-tui-doctor-005}

The root application model (`internal/tui/app.go`) MUST integrate `doctor.Model` under `TabDoctor` (ID 3 / Tab 4).

1. Pressing `4` or cycling with `tab` / `shift+tab` to TabDoctor MUST activate the Doctor view and refresh diagnostic checks.
2. When `TabDoctor` is active, key events MUST be forwarded to `doctor.Model.Update()`.
3. `tea.WindowSizeMsg` MUST propagate dimensions to `doctor.Model.SetSize(w, h)`.
4. `TabDoctor.Title()` MUST return `"System Doctor"`.

#### Scenario: Switch to TabDoctor and verify integration
- GIVEN the root application on `TabDashboard`
- WHEN the user presses `4`
- THEN `activeTab` MUST equal `TabDoctor`
- AND `AppModel.View()` MUST render the Doctor checklist and health summary banner.
