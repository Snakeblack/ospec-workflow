package tui_test

import (
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
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
