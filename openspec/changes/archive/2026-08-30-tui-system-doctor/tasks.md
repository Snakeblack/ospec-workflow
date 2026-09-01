# Tasks: TUI System Doctor & Diagnostics (Milestone 6)

## Implementation Plan

### Phase 1: Diagnostic Domain Engine (`internal/system/`)
- [x] **Task 1.1: Test Suite for System Doctor Engine** `internal/system/doctor_test.go`
  - Write unit tests for `RunDiagnostics` covering:
    - Node.js runtime check (>= 22 vs < 22 vs missing)
    - Go toolchain check (>= 1.23 vs < 1.23 vs missing)
    - Git CLI and working tree status (clean vs dirty)
    - Project configuration files presence (`models.yaml`, `openspec/config.yaml`, `hooks/hooks.json`)
    - AI provider API keys environment variables inspection
    - `DoctorReport` status evaluation (`Healthy`, `Degraded`, `Critical`)
  - *Requirements: REQ-tui-doctor-001*

- [x] **Task 1.2: Implement Diagnostic Engine** `internal/system/doctor.go`
  - Define `CheckSeverity`, `CheckCategory`, `DoctorCheck`, `DoctorReport`
  - Implement `RunDiagnostics(repoRoot string) DoctorReport`
  - Implement sub-check functions with `context.WithTimeout`
  - Implement detailed evidence formatting and actionable remediation strings
  - Run `go test -v ./internal/system` and ensure 100% green
  - *Requirements: REQ-tui-doctor-001*

---

### Phase 2: System Doctor TUI View (`internal/tui/views/doctor/`)
- [x] **Task 2.1: Types & Message Definitions** `internal/tui/views/doctor/types.go`
  - Define `DoctorReloadMsg`, `DoctorRefreshedMsg`, view state `Model`
  - Define UI constants and layout dimension constraints
  - *Requirements: REQ-tui-doctor-002, REQ-tui-doctor-003*

- [x] **Task 2.2: Test Suite for Doctor View** `internal/tui/views/doctor/doctor_test.go`
  - Write tests for:
    - Model initialization and report loading
    - Keyboard navigation (`Up`/`Down`, `j`/`k`, `Home`/`End`, direct numbers)
    - Index bounds clamping and edge cases
    - Re-run diagnostics action on `r` / `Enter`
    - Responsive layout adaptation on `WindowSizeMsg`
  - *Requirements: REQ-tui-doctor-002, REQ-tui-doctor-003, REQ-tui-doctor-004*

- [x] **Task 2.3: Implement Elm Model & Handlers** `internal/tui/views/doctor/doctor.go`
  - Implement `New(repoRoot string) Model`
  - Implement `Init()`, `Update(tea.Msg)`, `Refresh()`, and `SetSize(w, h)`
  - Handle keyboard messages, trigger diagnostics reload, and clamp selections
  - *Requirements: REQ-tui-doctor-002, REQ-tui-doctor-003*

- [x] **Task 2.4: Implement Responsive View Rendering** `internal/tui/views/doctor/cards.go`
  - Implement Lip Gloss styled components:
    - Health summary header banner with dynamic status badge and counters
    - Master list of checks with colored severity badges (`✓ OK`, `⚠ AVISO`, `✗ ERROR`)
    - Detail diagnostic card with technical details and highlighted remediation box
    - Shortcuts help bar
  - Implement adaptive Split vs Stacked layout with safe dimension clamping
  - Run `go test -v ./internal/tui/views/doctor` and ensure 100% green
  - *Requirements: REQ-tui-doctor-002, REQ-tui-doctor-004*

---

### Phase 3: Root Elm Shell Integration (`internal/tui/`)
- [x] **Task 3.1: Connect TabDoctor in AppModel** `internal/tui/app.go`
  - Add `doctor doctor.Model` to `AppModel`
  - Initialize `doctor.New(repoRoot)` in `NewAppModelWithRoot`
  - Route Tab 4 keypresses (`4`), cycling (`tab`/`shift+tab`), and `SwitchTabMsg`
  - Forward `tea.WindowSizeMsg` to `doctor.SetSize(w, h)`
  - Forward events to `m.doctor.Update` when `activeTab == TabDoctor`
  - Render `m.doctor.View()` in `renderViewContent` for `TabDoctor`
  - *Requirements: REQ-tui-doctor-005*

- [x] **Task 3.2: Integration Tests in AppModel** `internal/tui/app_test.go`
  - Test switching to `TabDoctor` with key `4`
  - Test rendering of Doctor checklist in root view
  - Run `go test -v ./internal/tui/...`
  - *Requirements: REQ-tui-doctor-005*

---

### Phase 4: Full Suite Verification & Documentation
- [x] **Task 4.1: Comprehensive Verification Suite**
  - Run full test suite: `go test -race ./...`
  - Verify zero regressions and check coverage
  - Update `docs/tui/roadmap.md` marking Milestone 6 as completed
  - *Requirements: REQ-tui-doctor-001..005*
