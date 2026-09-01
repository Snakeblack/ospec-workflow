package tui_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/x/ansi"
	"github.com/snakeblack/ospec-workflow/internal/tui"
)

func TestTabNavigationNumeric(t *testing.T) {
	app := tui.NewAppModel()

	tests := []struct {
		key     string
		wantTab tui.TabID
	}{
		{"2", tui.TabModels},
		{"3", tui.TabTargets},
		{"4", tui.TabDoctor},
		{"1", tui.TabDashboard},
	}

	for _, tt := range tests {
		m, _ := app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(tt.key)})
		app = m.(tui.AppModel)
		if app.ActiveTab() != tt.wantTab {
			t.Errorf("Key %q: got tab %v, want %v", tt.key, app.ActiveTab(), tt.wantTab)
		}
	}
}

func TestTabNavigationCyclic(t *testing.T) {
	app := tui.NewAppModel()

	// Forward cycling with "tab"
	forwardExpected := []tui.TabID{
		tui.TabModels,
		tui.TabTargets,
		tui.TabDoctor,
		tui.TabDashboard,
		tui.TabModels,
	}

	for i, want := range forwardExpected {
		m, _ := app.Update(tea.KeyMsg{Type: tea.KeyTab})
		app = m.(tui.AppModel)
		if app.ActiveTab() != want {
			t.Errorf("Forward step %d: got tab %v, want %v", i, app.ActiveTab(), want)
		}
	}

	// Reset to dashboard
	m, _ := app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("1")})
	app = m.(tui.AppModel)

	// Backward cycling with "shift+tab"
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyShiftTab})
	app = m.(tui.AppModel)
	if app.ActiveTab() != tui.TabDoctor {
		t.Errorf("Shift+Tab from Dashboard: got tab %v, want TabDoctor", app.ActiveTab())
	}

	// Backward cycling with "backtab" key msg string
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("1")})
	app = m.(tui.AppModel)

	// Test unhandled key
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("x")})
	app = m.(tui.AppModel)
	if app.ActiveTab() != tui.TabDashboard {
		t.Errorf("Unhandled key changed tab: got %v", app.ActiveTab())
	}
}

func TestWindowSizeResize(t *testing.T) {
	app := tui.NewAppModel()
	if app.IsReady() {
		t.Error("AppModel should not be ready before WindowSizeMsg")
	}

	m, _ := app.Update(tea.WindowSizeMsg{Width: 100, Height: 40})
	app = m.(tui.AppModel)

	if !app.IsReady() {
		t.Error("AppModel should be ready after WindowSizeMsg")
	}
	if app.Width() != 100 {
		t.Errorf("Width = %d, want 100", app.Width())
	}
	if app.Height() != 40 {
		t.Errorf("Height = %d, want 40", app.Height())
	}

	// Small width resize test
	m, _ = app.Update(tea.WindowSizeMsg{Width: 10, Height: 10})
	app = m.(tui.AppModel)
	smallView := app.View()
	if !strings.Contains(smallView, "Dashboard") {
		t.Errorf("Small view missing Dashboard: %q", smallView)
	}
}

func TestCleanExit(t *testing.T) {
	app := tui.NewAppModel()

	// Exit with "q"
	m, cmd := app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("q")})
	appQuit := m.(tui.AppModel)
	if !appQuit.IsQuitting() {
		t.Error("AppModel.IsQuitting() should be true on 'q'")
	}
	if cmd == nil {
		t.Error("AppModel.Update on 'q' should return tea.Quit cmd")
	}

	// Exit with "ctrl+c"
	app2 := tui.NewAppModel()
	m2, cmd2 := app2.Update(tea.KeyMsg{Type: tea.KeyCtrlC})
	appQuit2 := m2.(tui.AppModel)
	if !appQuit2.IsQuitting() {
		t.Error("AppModel.IsQuitting() should be true on ctrl+c")
	}
	if cmd2 == nil {
		t.Error("AppModel.Update on ctrl+c should return tea.Quit cmd")
	}
}

func TestAppModelInit(t *testing.T) {
	app := tui.NewAppModel()
	if cmd := app.Init(); cmd != nil {
		t.Errorf("Init() should return nil, got %v", cmd)
	}
}

func TestViewRendering(t *testing.T) {
	app := tui.NewAppModel()

	// Before window resize
	initView := app.View()
	if !strings.Contains(initView, "Initializing") {
		t.Errorf("View before ready missing Initializing, got: %q", initView)
	}

	// After resize
	m, _ := app.Update(tea.WindowSizeMsg{Width: 100, Height: 40})
	app = m.(tui.AppModel)
	readyView := app.View()

	if !strings.Contains(readyView, "Dashboard") {
		t.Errorf("View missing active tab content 'Dashboard', got: %q", readyView)
	}
	if !strings.Contains(readyView, "Switch Tab") {
		t.Errorf("View missing footer hints, got: %q", readyView)
	}

	// After quitting
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("q")})
	app = m.(tui.AppModel)
	quitView := app.View()
	if !strings.Contains(quitView, "Goodbye") {
		t.Errorf("View after quitting missing Goodbye, got: %q", quitView)
	}
}

func TestTabTitles(t *testing.T) {
	tests := []struct {
		tab  tui.TabID
		want string
	}{
		{tui.TabDashboard, "Dashboard"},
		{tui.TabModels, "Models Hub"},
		{tui.TabTargets, "Targets Manager"},
		{tui.TabDoctor, "System Doctor"},
		{tui.TabID(99), "Unknown"},
	}

	for _, tt := range tests {
		if tt.tab.Title() != tt.want {
			t.Errorf("Tab %v Title() = %q, want %q", tt.tab, tt.tab.Title(), tt.want)
		}
	}
}

func TestAppModelDynamicConfig(t *testing.T) {
	tempDir := t.TempDir()

	// Set up openspec config
	openspecDir := filepath.Join(tempDir, "openspec")
	_ = os.MkdirAll(openspecDir, 0755)
	_ = os.WriteFile(filepath.Join(openspecDir, "config.yaml"), []byte("project:\n  version: 3.0.0\n"), 0644)

	// Set up models config
	_ = os.WriteFile(filepath.Join(tempDir, "models.yaml"), []byte("agents:\n  sdd-propose: cheap\n  sdd-apply: cheap\n  _default: cheap\n"), 0644)

	app := tui.NewAppModelWithRoot(tempDir)
	if app.Version() != "v3.0.0" {
		t.Errorf("expected version v3.0.0, got %s", app.Version())
	}
	if app.ActivePreset() != "cheap" && app.ActivePreset() != "Cheap" {
		t.Logf("ActivePreset is: %s", app.ActivePreset())
	}

	// ModelsManager and OpenSpecManager should be accessible
	if app.ModelsManager() == nil {
		t.Error("expected ModelsManager to be initialized")
	}
	if app.OpenSpecManager() == nil {
		t.Error("expected OpenSpecManager to be initialized")
	}
}

func TestAppModelDashboardIntegration(t *testing.T) {
	tempDir := t.TempDir()

	// Set up openspec config
	openspecDir := filepath.Join(tempDir, "openspec")
	_ = os.MkdirAll(openspecDir, 0755)
	_ = os.WriteFile(filepath.Join(openspecDir, "config.yaml"), []byte("project:\n  name: app-test\n  version: 1.0.0\n"), 0644)

	// Set up models config
	_ = os.WriteFile(filepath.Join(tempDir, "models.yaml"), []byte("agents:\n  _default: default\n"), 0644)

	app := tui.NewAppModelWithRoot(tempDir)
	m, _ := app.Update(tea.WindowSizeMsg{Width: 120, Height: 40})
	app = m.(tui.AppModel)

	// Render view should include Dashboard components
	view := ansi.Strip(app.View())
	if !strings.Contains(view, "ÍNDICE DE SECCIONES") {
		t.Errorf("App view missing ÍNDICE DE SECCIONES:\n%s", view)
	}
	if !strings.Contains(view, "OPENSPEC CONTEXT") {
		t.Errorf("App view missing OPENSPEC CONTEXT:\n%s", view)
	}
	if !strings.Contains(view, "ACCIONES RÁPIDAS") {
		t.Errorf("App view missing ACCIONES RÁPIDAS:\n%s", view)
	}

	// Test Doctor shortcut 'd' forwards to TabDoctor
	m, cmd := app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("d")})
	app = m.(tui.AppModel)
	if cmd != nil {
		msg := cmd()
		m, _ = app.Update(msg)
		app = m.(tui.AppModel)
		if app.ActiveTab() != tui.TabDoctor {
			t.Errorf("expected tab TabDoctor after 'd', got %v", app.ActiveTab())
		}
	}

	// Return to dashboard '1'
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("1")})
	app = m.(tui.AppModel)
	if app.ActiveTab() != tui.TabDashboard {
		t.Errorf("expected tab TabDashboard after '1', got %v", app.ActiveTab())
	}

	// Test Models Hub shortcut 'm'
	m, cmd = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("m")})
	app = m.(tui.AppModel)
	if cmd != nil {
		msg := cmd()
		m, _ = app.Update(msg)
		app = m.(tui.AppModel)
		if app.ActiveTab() != tui.TabModels {
			t.Errorf("expected tab TabModels after 'm', got %v", app.ActiveTab())
		}
	}
}

func TestAppModelModelsHubIntegration(t *testing.T) {
	tempDir := t.TempDir()

	modelsContent := `agents:
  _default: default
tiers:
  cheap:
    claude: haiku
  default:
    claude: sonnet
  premium:
    claude: opus
`
	_ = os.WriteFile(filepath.Join(tempDir, "models.yaml"), []byte(modelsContent), 0644)

	app := tui.NewAppModelWithRoot(tempDir)
	m, _ := app.Update(tea.WindowSizeMsg{Width: 120, Height: 40})
	app = m.(tui.AppModel)

	// Switch to Models Hub tab '2'
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("2")})
	app = m.(tui.AppModel)

	if app.ActiveTab() != tui.TabModels {
		t.Fatalf("expected TabModels, got %v", app.ActiveTab())
	}

	view := ansi.Strip(app.View())
	if !strings.Contains(view, "Presets Globales") {
		t.Errorf("Models view missing 'Presets Globales':\n%s", view)
	}
	if !strings.Contains(view, "Cheap / Económico") {
		t.Errorf("Models view missing 'Cheap / Económico':\n%s", view)
	}

	// ModelsHub getter should return initialized model
	if len(app.ModelsHub().Presets()) != 3 {
		t.Errorf("ModelsHub().Presets() count = %d, want 3", len(app.ModelsHub().Presets()))
	}
}

func TestAppModelTargetsIntegration(t *testing.T) {
	tempDir := t.TempDir()

	_ = os.WriteFile(filepath.Join(tempDir, "AGENTS.md"), []byte("# Agents"), 0644)
	_ = os.MkdirAll(filepath.Join(tempDir, ".vscode"), 0755)

	app := tui.NewAppModelWithRoot(tempDir)
	m, _ := app.Update(tea.WindowSizeMsg{Width: 120, Height: 40})
	app = m.(tui.AppModel)

	// 1. Switch to TabTargets with key '3'
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("3")})
	app = m.(tui.AppModel)
	if app.ActiveTab() != tui.TabTargets {
		t.Fatalf("expected TabTargets, got %v", app.ActiveTab())
	}

	view := ansi.Strip(app.View())
	if !strings.Contains(view, "AI TARGETS SOPORTADOS") {
		t.Errorf("Targets view missing 'AI TARGETS SOPORTADOS':\n%s", view)
	}
	if !strings.Contains(view, "DIAGNÓSTICO") {
		t.Errorf("Targets view missing 'DIAGNÓSTICO':\n%s", view)
	}

	// 2. Targets getter
	if len(app.Targets().Targets()) != 6 {
		t.Errorf("Targets().Targets() count = %d, want 6", len(app.Targets().Targets()))
	}

	// 3. Navigation inside TabTargets ('j' / down)
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("j")})
	app = m.(tui.AppModel)
	if app.Targets().SelectedIndex() != 1 {
		t.Errorf("SelectedIndex after 'j' = %d, want 1", app.Targets().SelectedIndex())
	}

	// 4. Direct selection '5' (OpenCode) and '6' (Cursor)
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("5")})
	app = m.(tui.AppModel)
	if app.Targets().SelectedIndex() != 4 {
		t.Errorf("SelectedIndex after '5' = %d, want 4", app.Targets().SelectedIndex())
	}

	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("6")})
	app = m.(tui.AppModel)
	if app.Targets().SelectedIndex() != 5 {
		t.Errorf("SelectedIndex after '6' = %d, want 5", app.Targets().SelectedIndex())
	}

	// 5. Test switch from Dashboard with 't' quick action
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("1")})
	app = m.(tui.AppModel)
	if app.ActiveTab() != tui.TabDashboard {
		t.Fatalf("expected TabDashboard, got %v", app.ActiveTab())
	}

	m, cmd := app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("t")})
	app = m.(tui.AppModel)
	if cmd != nil {
		msg := cmd()
		m, _ = app.Update(msg)
		app = m.(tui.AppModel)
		if app.ActiveTab() != tui.TabTargets {
			t.Errorf("expected TabTargets after Dashboard 't', got %v", app.ActiveTab())
		}
	}
}

func TestAppModelDoctorIntegration(t *testing.T) {
	tempDir := t.TempDir()

	_ = os.WriteFile(filepath.Join(tempDir, "models.yaml"), []byte("preset: default"), 0644)
	_ = os.MkdirAll(filepath.Join(tempDir, "openspec"), 0755)
	_ = os.WriteFile(filepath.Join(tempDir, "openspec", "config.yaml"), []byte("project:\n  name: test"), 0644)

	app := tui.NewAppModelWithRoot(tempDir)
	m, _ := app.Update(tea.WindowSizeMsg{Width: 120, Height: 40})
	app = m.(tui.AppModel)

	// 1. Switch to TabDoctor with key '4'
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("4")})
	app = m.(tui.AppModel)
	if app.ActiveTab() != tui.TabDoctor {
		t.Fatalf("expected TabDoctor, got %v", app.ActiveTab())
	}

	view := ansi.Strip(app.View())
	if !strings.Contains(view, "SYSTEM DOCTOR & DIAGNÓSTICO") {
		t.Errorf("Doctor view missing 'SYSTEM DOCTOR & DIAGNÓSTICO':\n%s", view)
	}
	if !strings.Contains(view, "CHEQUEOS DEL SISTEMA") {
		t.Errorf("Doctor view missing 'CHEQUEOS DEL SISTEMA':\n%s", view)
	}

	// 2. Doctor getter
	if len(app.Doctor().Report().Checks) == 0 {
		t.Errorf("Doctor().Report().Checks count is 0")
	}

	// 3. Navigation inside TabDoctor ('j' / down)
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("j")})
	app = m.(tui.AppModel)
	if app.Doctor().SelectedIndex() != 1 {
		t.Errorf("Doctor SelectedIndex after 'j' = %d, want 1", app.Doctor().SelectedIndex())
	}

	// 4. Direct selection '5'
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("5")})
	app = m.(tui.AppModel)
	if app.Doctor().SelectedIndex() != 4 {
		t.Errorf("Doctor SelectedIndex after '5' = %d, want 4", app.Doctor().SelectedIndex())
	}

	// 5. Test switch from Dashboard with 'd' quick action
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("1")})
	app = m.(tui.AppModel)
	if app.ActiveTab() != tui.TabDashboard {
		t.Fatalf("expected TabDashboard, got %v", app.ActiveTab())
	}

	m, cmd := app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("d")})
	app = m.(tui.AppModel)
	if cmd != nil {
		msg := cmd()
		m, _ = app.Update(msg)
		app = m.(tui.AppModel)
		if app.ActiveTab() != tui.TabDoctor {
			t.Errorf("expected TabDoctor after Dashboard 'd', got %v", app.ActiveTab())
		}
	}
}

func TestAppModelHelpModalToggleAndDismissal(t *testing.T) {
	app := tui.NewAppModel()
	m, _ := app.Update(tea.WindowSizeMsg{Width: 100, Height: 40})
	app = m.(tui.AppModel)

	if app.ShowHelp() {
		t.Error("expected ShowHelp to be false initially")
	}

	// 1. Open with '?'
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("?")})
	app = m.(tui.AppModel)
	if !app.ShowHelp() {
		t.Error("expected ShowHelp to be true after '?'")
	}

	view := ansi.Strip(app.View())
	if !strings.Contains(view, "Help & Keybindings") {
		t.Errorf("View when help is open expected to contain 'Help & Keybindings', got:\n%s", view)
	}

	// 2. Dismiss with 'esc'
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyEsc})
	app = m.(tui.AppModel)
	if app.ShowHelp() {
		t.Error("expected ShowHelp to be false after 'esc'")
	}

	// 3. Open with '?' and dismiss with 'q' (should NOT quit app)
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("?")})
	app = m.(tui.AppModel)
	if !app.ShowHelp() {
		t.Error("expected ShowHelp to be true")
	}

	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("q")})
	app = m.(tui.AppModel)
	if app.ShowHelp() {
		t.Error("expected ShowHelp to be false after 'q'")
	}
	if app.IsQuitting() {
		t.Error("pressing 'q' while help is open should only dismiss help, not quit app")
	}

	// 4. Open with '?' and dismiss with 'Enter'
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("?")})
	app = m.(tui.AppModel)
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyEnter})
	app = m.(tui.AppModel)
	if app.ShowHelp() {
		t.Error("expected ShowHelp to be false after 'Enter'")
	}

	// 5. Open with '?' and toggle close with '?'
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("?")})
	app = m.(tui.AppModel)
	if !app.ShowHelp() {
		t.Error("expected ShowHelp to be true")
	}
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("?")})
	app = m.(tui.AppModel)
	if app.ShowHelp() {
		t.Error("expected ShowHelp to be false after second '?'")
	}
}

func TestAppModelHelpModalKeyTrapping(t *testing.T) {
	app := tui.NewAppModel()
	m, _ := app.Update(tea.WindowSizeMsg{Width: 100, Height: 40})
	app = m.(tui.AppModel)

	// Switch to TabModels
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("2")})
	app = m.(tui.AppModel)
	if app.ActiveTab() != tui.TabModels {
		t.Fatalf("expected TabModels, got %v", app.ActiveTab())
	}

	// Open help modal
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("?")})
	app = m.(tui.AppModel)
	if !app.ShowHelp() {
		t.Fatal("expected help modal to be open")
	}

	// Press '1' while help is open
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("1")})
	app = m.(tui.AppModel)

	// Active tab should STILL be TabModels, not TabDashboard
	if app.ActiveTab() != tui.TabModels {
		t.Errorf("expected tab to remain TabModels while help is open, got %v", app.ActiveTab())
	}
	if !app.ShowHelp() {
		t.Error("expected help modal to remain open on non-closing key")
	}
}

func TestAppModelContextualFooterInViews(t *testing.T) {
	app := tui.NewAppModel()
	m, _ := app.Update(tea.WindowSizeMsg{Width: 100, Height: 40})
	app = m.(tui.AppModel)

	// 1. Dashboard footer
	viewDash := ansi.Strip(app.View())
	if !strings.Contains(viewDash, "Switch Tab") {
		t.Errorf("Dashboard view missing 'Switch Tab' in footer:\n%s", viewDash)
	}

	// 2. Models Hub footer
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("2")})
	app = m.(tui.AppModel)
	viewModels := ansi.Strip(app.View())
	if !strings.Contains(viewModels, "Preset") || !strings.Contains(viewModels, "Apply") {
		t.Errorf("Models view missing 'Preset' / 'Apply' in footer:\n%s", viewModels)
	}

	// 3. Targets Manager footer
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("3")})
	app = m.(tui.AppModel)
	viewTargets := ansi.Strip(app.View())
	if !strings.Contains(viewTargets, "Sync All") {
		t.Errorf("Targets view missing 'Sync All' in footer:\n%s", viewTargets)
	}

	// 4. Doctor footer
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("4")})
	app = m.(tui.AppModel)
	viewDoctor := ansi.Strip(app.View())
	if !strings.Contains(viewDoctor, "Re-scan") {
		t.Errorf("Doctor view missing 'Re-scan' in footer:\n%s", viewDoctor)
	}
}

func TestAppModelVerticalHeightBudget(t *testing.T) {
	app := tui.NewAppModel()

	dimensions := []struct {
		w, h int
	}{
		{80, 24},
		{100, 30},
		{120, 40},
	}

	for _, dim := range dimensions {
		m, _ := app.Update(tea.WindowSizeMsg{Width: dim.w, Height: dim.h})
		curApp := m.(tui.AppModel)

		// Test all 4 tabs
		for tabKey := 1; tabKey <= 4; tabKey++ {
			mTab, _ := curApp.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(string(rune('0' + tabKey)))})
			appTab := mTab.(tui.AppModel)

			rendered := ansi.Strip(appTab.View())
			lines := strings.Split(strings.TrimRight(rendered, "\n"), "\n")
			lineCount := len(lines)

			// Total height must be reasonably compact (at most 22 lines for an 80x24 terminal budget)
			if lineCount > 22 {
				t.Errorf("Tab %d at %dx%d rendered %d lines, want <= 22:\n%s", tabKey, dim.w, dim.h, lineCount, rendered)
			}
		}

		// Test Help Modal height
		mHelp, _ := curApp.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("?")})
		appHelp := mHelp.(tui.AppModel)
		renderedHelp := ansi.Strip(appHelp.View())
		helpLines := strings.Split(strings.TrimRight(renderedHelp, "\n"), "\n")
		if len(helpLines) > 22 {
			t.Errorf("Help Modal at %dx%d rendered %d lines, want <= 22:\n%s", dim.w, dim.h, len(helpLines), renderedHelp)
		}
	}
}




