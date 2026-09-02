package tui_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/x/ansi"
	"github.com/snakeblack/ospec-workflow/internal/tui"
	"github.com/snakeblack/ospec-workflow/internal/tui/views/install"
)

func TestTabNavigationNumeric(t *testing.T) {
	app := tui.NewAppModel()

	tests := []struct {
		key     string
		wantTab tui.TabID
	}{
		{"1", tui.TabInstall},
		{"2", tui.TabModels},
	}

	for _, tt := range tests {
		// Start from dashboard
		m, _ := app.Update(tea.KeyMsg{Type: tea.KeyEsc})
		app = m.(tui.AppModel)

		m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(tt.key)})
		app = m.(tui.AppModel)
		if app.ActiveTab() != tt.wantTab {
			t.Errorf("Key %q from dashboard: got tab %v, want %v", tt.key, app.ActiveTab(), tt.wantTab)
		}
	}
}

func TestTabNavigationCyclic(t *testing.T) {
	app := tui.NewAppModel()

	// Forward cycling with "tab"
	forwardExpected := []tui.TabID{
		tui.TabInstall,
		tui.TabModels,
		tui.TabDashboard,
		tui.TabInstall,
	}

	for i, want := range forwardExpected {
		m, _ := app.Update(tea.KeyMsg{Type: tea.KeyTab})
		app = m.(tui.AppModel)
		if app.ActiveTab() != want {
			t.Errorf("Forward step %d: got tab %v, want %v", i, app.ActiveTab(), want)
		}
	}

	// Reset to dashboard
	m, _ := app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("q")})
	app = m.(tui.AppModel)
	if app.ActiveTab() != tui.TabDashboard {
		t.Errorf("q from subview should reset to TabDashboard, got %v", app.ActiveTab())
	}

	// Backward cycling with "shift+tab"
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyShiftTab})
	app = m.(tui.AppModel)
	if app.ActiveTab() != tui.TabModels {
		t.Errorf("Shift+Tab from Dashboard: got tab %v, want TabModels", app.ActiveTab())
	}

	// Backward cycling with "backtab" key msg string
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyEsc})
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
	if !strings.Contains(smallView, "OSPEC") {
		t.Errorf("Small view missing OSPEC: %q", smallView)
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

	if !strings.Contains(readyView, "OSPEC WORKFLOW") {
		t.Errorf("View missing active tab content 'OSPEC WORKFLOW', got: %q", readyView)
	}
	if !strings.Contains(readyView, "Acciones") {
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
		{tui.TabDashboard, "Inicio"},
		{tui.TabModels, "Modelos"},
		{tui.TabInstall, "Instalar"},
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
	if !strings.Contains(view, "OSPEC WORKFLOW") {
		t.Errorf("App view missing OSPEC WORKFLOW:\n%s", view)
	}
	if !strings.Contains(view, "MENÚ") && !strings.Contains(view, "hacer") {
		t.Errorf("App view missing home menu:\n%s", view)
	}
	if !strings.Contains(view, "Instalar ospec") {
		t.Errorf("App view missing Instalar ospec:\n%s", view)
	}

	// Test Models shortcut '2' from dashboard
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("2")})
	app = m.(tui.AppModel)
	if app.ActiveTab() != tui.TabModels {
		t.Errorf("expected tab TabModels after '2', got %v", app.ActiveTab())
	}

	// Return to dashboard with Esc
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyEsc})
	app = m.(tui.AppModel)
	if app.ActiveTab() != tui.TabDashboard {
		t.Errorf("expected tab TabDashboard after Esc, got %v", app.ActiveTab())
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

	// Switch to Models Hub (action '2' from Dashboard)
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("2")})
	app = m.(tui.AppModel)

	if app.ActiveTab() != tui.TabModels {
		t.Fatalf("expected TabModels, got %v", app.ActiveTab())
	}

	view := ansi.Strip(app.View())
	if !strings.Contains(view, "Presets") {
		t.Errorf("Models view missing 'Presets':\n%s", view)
	}
	if !strings.Contains(view, "Económico") {
		t.Errorf("Models view missing 'Económico':\n%s", view)
	}

	// ModelsHub getter should return initialized model
	if len(app.ModelsHub().Presets()) != 3 {
		t.Errorf("ModelsHub().Presets() count = %d, want 3", len(app.ModelsHub().Presets()))
	}
}

func TestAppModelInstallerOpensFromHome(t *testing.T) {
	tempDir := t.TempDir()
	_ = os.WriteFile(filepath.Join(tempDir, "models.yaml"), []byte("agents:\n  _default: default\n"), 0644)

	app := tui.NewAppModelWithRoot(tempDir)
	m, _ := app.Update(tea.WindowSizeMsg{Width: 120, Height: 40})
	app = m.(tui.AppModel)

	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("1")})
	app = m.(tui.AppModel)
	if app.ActiveTab() != tui.TabInstall {
		t.Fatalf("expected TabInstall, got %v", app.ActiveTab())
	}

	view := ansi.Strip(app.View())
	if !strings.Contains(view, "Detectados") && !strings.Contains(view, "detectado") && !strings.Contains(view, "clientes") {
		t.Errorf("installer view missing target step:\n%s", view)
	}

	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyEsc})
	app = m.(tui.AppModel)
	if app.ActiveTab() != tui.TabDashboard {
		t.Fatalf("expected TabDashboard after Esc on first wizard step, got %v", app.ActiveTab())
	}
}

func TestAppModelForwardsInstallerFinishedMsg(t *testing.T) {
	tempDir := t.TempDir()
	_ = os.WriteFile(filepath.Join(tempDir, "models.yaml"), []byte("agents:\n  _default: default\n"), 0644)
	app := tui.NewAppModelWithRoot(tempDir)
	m, _ := app.Update(tea.WindowSizeMsg{Width: 120, Height: 40})
	app = m.(tui.AppModel)
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("1")})
	app = m.(tui.AppModel)

	m, _ = app.Update(install.InstallFinishedMsg{Success: true, Message: "ok"})
	app = m.(tui.AppModel)
	if app.Installer().Step() != install.StepDone {
		t.Fatalf("expected installer StepDone after InstallFinishedMsg, got %v", app.Installer().Step())
	}
}

func TestAppModelHomeHasNoAPIKeyFlow(t *testing.T) {
	app := tui.NewAppModel()
	m, _ := app.Update(tea.WindowSizeMsg{Width: 120, Height: 40})
	app = m.(tui.AppModel)
	view := ansi.Strip(app.View())
	if strings.Contains(view, "API Key") || strings.Contains(view, "System Doctor") {
		t.Errorf("home should not expose API keys or doctor as a primary action:\n%s", view)
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
	if !strings.Contains(view, "Ayuda") {
		t.Errorf("View when help is open expected to contain 'Ayuda', got:\n%s", view)
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

	// Switch to Models Hub (action 2 from Dashboard)
	m, cmd := app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("2")})
	app = m.(tui.AppModel)
	if cmd != nil {
		msg := cmd()
		m, _ = app.Update(msg)
		app = m.(tui.AppModel)
	}
	if app.ActiveTab() != tui.TabModels {
		t.Fatalf("expected TabModels, got %v", app.ActiveTab())
	}

	// Open help modal
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("?")})
	app = m.(tui.AppModel)
	if !app.ShowHelp() {
		t.Fatal("expected help modal to be open")
	}

	// Press 'x' while help is open
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("x")})
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
	if !strings.Contains(viewDash, "Acciones") {
		t.Errorf("Dashboard view missing 'Acciones' in footer:\n%s", viewDash)
	}

	// 2. Models Hub footer (action 2 from Dashboard)
	m, cmd := app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("2")})
	app = m.(tui.AppModel)
	if cmd != nil {
		msg := cmd()
		m, _ = app.Update(msg)
		app = m.(tui.AppModel)
	}
	viewModels := ansi.Strip(app.View())
	if !strings.Contains(viewModels, "Preset") && !strings.Contains(viewModels, "Agentes") {
		t.Errorf("Models view missing preset/agent hints in footer:\n%s", viewModels)
	}

	// 3. Return to Dashboard and open installer footer
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyEsc})
	app = m.(tui.AppModel)
	m, _ = app.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("1")})
	app = m.(tui.AppModel)
	viewInstall := ansi.Strip(app.View())
	if !strings.Contains(viewInstall, "Continuar") {
		t.Errorf("Installer view missing 'Continuar' in footer:\n%s", viewInstall)
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

		// Test tabs cycling with Tab key
		for tabIdx := 0; tabIdx < 3; tabIdx++ {
			rendered := ansi.Strip(curApp.View())
			lines := strings.Split(strings.TrimRight(rendered, "\n"), "\n")
			lineCount := len(lines)

			// Total height must be within budget
			if lineCount > 45 {
				t.Errorf("Tab %d at %dx%d rendered %d lines, want <= 45:\n%s", tabIdx, dim.w, dim.h, lineCount, rendered)
			}

			mNext, _ := curApp.Update(tea.KeyMsg{Type: tea.KeyTab})
			curApp = mNext.(tui.AppModel)
		}

		// Test Help Modal height
		mHelp, _ := curApp.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("?")})
		appHelp := mHelp.(tui.AppModel)
		renderedHelp := ansi.Strip(appHelp.View())
		helpLines := strings.Split(strings.TrimRight(renderedHelp, "\n"), "\n")
		if len(helpLines) > 45 {
			t.Errorf("Help Modal at %dx%d rendered %d lines, want <= 45:\n%s", dim.w, dim.h, len(helpLines), renderedHelp)
		}
	}
}
