# Spec: tui-targets-manager

## Purpose

Define the specification for the AI Targets Manager subsystem and interactive TUI view (`TabTargets` / Tab 3) in `ospec`, including the target inspection engine (`internal/system/targets.go`), capability matrix diagnostics, declarative synchronization trigger, responsive Elm view (`internal/tui/views/targets/`), and root `AppModel` integration (`internal/tui/app.go`).

## Requirements

### Requirement: Target Inspection & Capability Matrix {#REQ-tui-targets-001}

The system MUST provide a target inspection engine in `internal/system/targets.go` that inspects the 6 supported AI targets (`claude`, `antigravity`, `vscode`, `codex`, `opencode`, `cursor`) and evaluates their state, configuration paths, and capability matrix.

1. Each target definition MUST be modeled with:
   - `ID` (string): canonical identifier (`"claude"`, `"antigravity"`, `"vscode"`, `"codex"`, `"opencode"`, `"cursor"`).
   - `DisplayName` (string): human-readable display name.
   - `Status` (enum): status level evaluated hierarchically:
     - `Active`: target is active in the current runtime/session context.
     - `Configured`: primary repository configuration files are present in the workspace.
     - `Detected`: secondary artifacts or distribution directories are present.
     - `Inactive`: no configuration or artifacts detected.
   - `ConfigFiles` (slice): list of checked configuration paths with existence status.
   - `Capabilities` (matrix): boolean flags for native features (`subagents`, `parallelism`, `hooks`, `background_tasks`, `mcp`, `dynamic_tools`).
   - `Evidence` (string): matched file path or diagnostic reason explaining the resolved status.
2. The engine MUST provide `InspectTargets(repoRoot string) []TargetSpec` and `InspectTarget(repoRoot string, targetID string) (TargetSpec, error)`.
3. If an unknown `targetID` is provided to `InspectTarget`, the function MUST return an error.

#### Scenario: Inspect all supported AI targets in configured workspace
- GIVEN a repository containing `.claude-plugin` and `AGENTS.md`
- WHEN `InspectTargets(repoRoot)` is executed
- THEN `claude` and `antigravity` MUST return status `Configured` with evidence pointing to their respective files
- AND all 6 target specs MUST include non-empty capability matrices and configuration file lists.

#### Scenario: Target status fallback to Inactive
- GIVEN an empty workspace without AI target configuration files or distribution artifacts
- WHEN `InspectTargets(repoRoot)` is executed
- THEN all 6 targets MUST return status `Inactive` with empty evidence and valid default capability matrices.

---

### Requirement: Targets Manager UI & Navigation {#REQ-tui-targets-002}

The system MUST provide an interactive Bubble Tea Elm view in `internal/tui/views/targets/` displaying the supported AI targets with full keyboard navigation and diagnostic detail inspection.

1. The view MUST maintain a selectable list of targets supporting cursor navigation keys (`Up`, `Down`, `j`, `k`), home/end keys, and direct numeric selection keys (`1` through `6`).
2. Target index selection MUST clamp within valid bounds `[0, 5]` and never panic on boundary overflow.
3. The UI layout MUST render:
   - Target list pane: item index, target display name, and styled status badge (`[Active]`, `[Configured]`, `[Detected]`, `[Inactive]`).
   - Target detail diagnostic pane:
     - Header card with display name, ID, and primary status badge.
     - Configuration files card showing checked paths with status indicators (`✓ Found`, `✗ Missing`).
     - Capabilities card showing feature support flags (`sub-agents`, `parallelism`, `hooks`, `background tasks`, `MCP`).
     - Diagnostic evidence summary.
4. Navigation keys MUST update the selected target view state reactively without altering persistent files.

#### Scenario: Navigate target list with keyboard
- GIVEN the Targets Manager view with target index 0 (`claude`) selected
- WHEN the user presses `Down` or `j`
- THEN the selected target index MUST update to 1 (`antigravity`) and the detail pane MUST immediately render Antigravity diagnostics.

#### Scenario: Direct numeric jump
- GIVEN the Targets Manager view with target index 0 selected
- WHEN the user presses `4`
- THEN the selected target index MUST jump directly to 3 (`codex`) and display Codex's configuration files (`codex.toml`) and capability matrix.

---

### Requirement: Declarative Target Synchronization Trigger {#REQ-tui-targets-003}

The system MUST provide an interactive trigger in the Targets Manager to synchronize or generate declarative target configurations on demand.

1. When the user presses `s` or `Enter` on the selected target, the view MUST trigger `SyncTarget(repoRoot, targetID)`.
2. The synchronization function MUST generate or update the declarative configuration files for the selected target.
3. The UI MUST provide immediate feedback via a transient toast notification:
   - Success toast (green / theme success) when synchronization succeeds.
   - Error toast (red / theme error) when synchronization fails.
4. The view MUST emit `TargetSyncedMsg` and refresh target inspection data upon completion.

#### Scenario: Synchronize selected target successfully
- GIVEN the Targets Manager view with `antigravity` selected
- WHEN the user presses `s`
- THEN `SyncTarget` MUST execute, the target inspection state MUST refresh, and a success toast notification MUST be displayed.

#### Scenario: Handle synchronization failure gracefully
- GIVEN a target synchronization action that encounters a filesystem write failure
- WHEN the user presses `Enter` to synchronize
- THEN the view MUST NOT panic, MUST remain fully interactive, and MUST display an error toast with the failure description.

---

### Requirement: Responsive Rendering & Edge-case Handling {#REQ-tui-targets-004}

The Targets Manager view MUST dynamically adapt its layout based on terminal dimensions and handle resize events safely.

1. On wide viewports (width $\ge 96$ columns):
   - The view MUST render a side-by-side horizontal split layout (Target List on left, Target Detail Diagnostics on right).
2. On compact viewports (width $< 96$ columns):
   - The view MUST render a vertically stacked layout (Target List on top, Target Detail Diagnostics below).
3. The view MUST apply width and height clamps to avoid ANSI text wrapping defects, negative dimension calculations, or rendering panics.
4. When terminal height is constrained ($< 15$ lines), the detail pane MUST truncate secondary descriptions while keeping primary status badges and paths visible.

#### Scenario: Layout adaptation on terminal resize
- GIVEN the Targets Manager rendered on a terminal with width 120 columns in split layout
- WHEN a `tea.WindowSizeMsg` with width 80 is received
- THEN the view MUST recalculate dimensions and render in stacked vertical layout without ANSI line overflow.

#### Scenario: Minimum dimension safety
- GIVEN a terminal resize event with extreme small dimensions (width 30, height 10)
- WHEN the view renders
- THEN minimum dimension clamps MUST be enforced and the rendered string MUST not cause runtime panics.

---

### Requirement: Root AppModel Integration {#REQ-tui-targets-005}

The system MUST integrate the Targets Manager view into the root Elm architecture `AppModel` in `internal/tui/app.go` under `TabTargets` (Tab ID 2 / Tab 3).

1. `TabTargets` MUST be fully wired into `AppModel`:
   - Field `targets targets.Model` maintained within `AppModel`.
   - Forwarding of `tea.WindowSizeMsg` to `m.targets.SetSize(width, height)`.
   - Forwarding of `tea.KeyMsg` to `m.targets.Update(msg)` when `m.activeTab == TabTargets`.
   - Calling `m.targets.View()` in `renderViewContent()` when `m.activeTab == TabTargets`.
2. Tab switching to `TabTargets` MUST be supported via:
   - Direct numeric shortcut `'3'`.
   - Global cycling via `'tab'` and `'shift+tab'` / `'backtab'`.
   - Quick action key `'t'` from the Dashboard view (`dashboard.SwitchTabMsg`).
3. Switching to `TabTargets` MUST trigger a refresh of target inspection data (`m.targets.Refresh()`).
4. Tab transitions MUST preserve state across Dashboard, Models Hub, and Targets Manager without regressions.

#### Scenario: Switch to TabTargets via numeric key '3'
- GIVEN the TUI on `TabDashboard` (Tab 1)
- WHEN the user presses `'3'`
- THEN `m.activeTab` MUST switch to `TabTargets`, `m.targets.Refresh()` MUST be invoked, and the Targets Manager view MUST be rendered.

#### Scenario: Switch to TabTargets via dashboard quick action 't'
- GIVEN the TUI on `TabDashboard`
- WHEN the user presses `'t'`
- THEN a `SwitchTabMsg{Tab: int(TabTargets)}` MUST be emitted and handled by `AppModel`, setting active tab to `TabTargets`.
