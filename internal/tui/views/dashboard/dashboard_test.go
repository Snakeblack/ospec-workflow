package dashboard_test

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
	"github.com/muesli/termenv"
	"github.com/snakeblack/ospec-workflow/internal/config"
	"github.com/snakeblack/ospec-workflow/internal/tui/views/dashboard"
)

func init() {
	lipgloss.SetColorProfile(termenv.Ascii)
}

func setupTestWorkspace(t *testing.T) (string, *config.ModelsManager, *config.OpenSpecManager) {
	t.Helper()
	tempDir := t.TempDir()

	modelsContent := `agents:
  sdd-propose: premium
  sdd-design: premium
  sdd-apply: default
  sdd-verify: premium
  review-change: premium
  _default: default
tiers:
  premium:
    claude: opus
    codex:
      model: gpt-5.6-sol
    opencode: openai/gpt-5.6-sol
    vscode:
      - "GPT-5.6 Sol (copilot)"
    cursor: gpt-5.6-sol
  default:
    claude: sonnet
    codex:
      model: gpt-5.6-terra
    opencode: openai/gpt-5.6-terra
    vscode:
      - "GPT-5.6 Terra (copilot)"
    cursor: grok-4.6
  cheap:
    claude: haiku
    codex:
      model: gpt-5.6-luna
    opencode: openai/gpt-5.6-luna
    vscode:
      - "GPT-5.6 Luna (copilot)"
    cursor: composer-2.5
`
	if err := os.WriteFile(filepath.Join(tempDir, "models.yaml"), []byte(modelsContent), 0644); err != nil {
		t.Fatalf("failed to write models.yaml: %v", err)
	}

	openspecDir := filepath.Join(tempDir, "openspec")
	if err := os.MkdirAll(openspecDir, 0755); err != nil {
		t.Fatalf("failed to create openspec dir: %v", err)
	}

	openspecContent := `project:
  name: test-workflow
  version: 2.60.0
  status: active
testing:
  tdd_mode: strict
  runner: node
  test_command: "npm test"
  layers:
    unit: true
    integration: true
    e2e: false
baseline:
  status: done
  domains_done:
    - generator
    - hooks
  domains_pending: []
rules:
  apply:
    tdd: true
`
	if err := os.WriteFile(filepath.Join(openspecDir, "config.yaml"), []byte(openspecContent), 0644); err != nil {
		t.Fatalf("failed to write openspec/config.yaml: %v", err)
	}

	// Create sample target markers
	_ = os.WriteFile(filepath.Join(tempDir, "AGENTS.md"), []byte("# Agents"), 0644)
	_ = os.MkdirAll(filepath.Join(tempDir, ".vscode"), 0755)

	mm := config.NewModelsManager(tempDir)
	om := config.NewOpenSpecManager(tempDir)
	return tempDir, mm, om
}

func TestDashboardInitialization(t *testing.T) {
	tempDir, mm, om := setupTestWorkspace(t)
	model := dashboard.New(tempDir, mm, om)

	profile := model.ModelProfile()
	if profile.PresetName != "Default" && profile.PresetName != "Custom" {
		t.Logf("Profile preset name: %s", profile.PresetName)
	}

	osSummary := model.OpenSpec()
	if osSummary.ProjectName != "test-workflow" {
		t.Errorf("ProjectName = %q, want 'test-workflow'", osSummary.ProjectName)
	}
	if osSummary.Version != "v2.60.0" {
		t.Errorf("Version = %q, want 'v2.60.0'", osSummary.Version)
	}
	if osSummary.TDDMode != "strict" {
		t.Errorf("TDDMode = %q, want 'strict'", osSummary.TDDMode)
	}

	targets := model.Targets()
	if len(targets) != 6 {
		t.Fatalf("expected 6 targets, got %d", len(targets))
	}
}

func TestDashboardRenderStandardWidth(t *testing.T) {
	tempDir, mm, om := setupTestWorkspace(t)
	model := dashboard.New(tempDir, mm, om)
	model.SetWidth(120)

	// Section 0 (default: OpenSpec Overview)
	view := ansi.Strip(model.View())
	expectedSection0 := []string{
		"ÍNDICE DE SECCIONES",
		"OPENSPEC CONTEXT",
		"ACCIONES RÁPIDAS",
		"test-workflow",
		"v2.60.0",
		"strict",
	}
	for _, s := range expectedSection0 {
		if !strings.Contains(view, s) {
			t.Errorf("Dashboard Section 0 missing substring %q\nGot:\n%s", s, view)
		}
	}

	// Move to Section 1 (Targets)
	m, _ := model.Update(tea.KeyMsg{Type: tea.KeyDown})
	model = m
	viewSec1 := ansi.Strip(model.View())
	expectedSection1 := []string{
		"AI TARGETS",
		"Claude Code",
		"Antigravity",
		"VS Code / Copilot",
	}
	for _, s := range expectedSection1 {
		if !strings.Contains(viewSec1, s) {
			t.Errorf("Dashboard Section 1 missing substring %q\nGot:\n%s", s, viewSec1)
		}
	}

	// Move to Section 2 (Model Profile)
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyDown})
	model = m
	viewSec2 := ansi.Strip(model.View())
	if !strings.Contains(viewSec2, "MODEL PROFILE") {
		t.Errorf("Dashboard Section 2 missing 'MODEL PROFILE'\nGot:\n%s", viewSec2)
	}
}

func TestDashboardRenderCompactWidth(t *testing.T) {
	tempDir, mm, om := setupTestWorkspace(t)
	model := dashboard.New(tempDir, mm, om)
	model.SetWidth(60)

	view := ansi.Strip(model.View())

	expectedSubstrings := []string{
		"ÍNDICE DE SECCIONES",
		"OPENSPEC CONTEXT",
		"ACCIONES RÁPIDAS",
		"test-workflow",
	}

	for _, s := range expectedSubstrings {
		if !strings.Contains(view, s) {
			t.Errorf("Compact dashboard view missing expected substring %q\nGot:\n%s", s, view)
		}
	}
}

func TestDashboardTargetDetection(t *testing.T) {
	tempDir := t.TempDir()

	// 1. Clean dir -> all targets NotConfigured
	results := dashboard.DetectTargets(tempDir)
	for _, res := range results {
		if res.Status != dashboard.StatusNotConfigured {
			t.Errorf("target %s should be NotConfigured in clean dir, got %v", res.ID, res.Status)
		}
	}

	// 2. Add Claude files
	_ = os.WriteFile(filepath.Join(tempDir, ".claude-plugin"), []byte("{}"), 0644)
	// 3. Add Antigravity files
	_ = os.WriteFile(filepath.Join(tempDir, "AGENTS.md"), []byte("agents"), 0644)
	// 4. Add OpenCode detection marker
	_ = os.MkdirAll(filepath.Join(tempDir, "dist", "opencode"), 0755)
	// 5. Add Codex config
	_ = os.WriteFile(filepath.Join(tempDir, "codex.toml"), []byte(""), 0644)
	// 6. Add Cursor rules
	_ = os.WriteFile(filepath.Join(tempDir, ".cursorrules"), []byte(""), 0644)

	results = dashboard.DetectTargets(tempDir)
	for _, res := range results {
		switch res.ID {
		case "claude":
			if res.Status != dashboard.StatusConfigured || res.Evidence != ".claude-plugin" {
				t.Errorf("claude status = %v (evidence: %s), want Configured with .claude-plugin", res.Status, res.Evidence)
			}
		case "antigravity":
			if res.Status != dashboard.StatusConfigured || res.Evidence != "AGENTS.md" {
				t.Errorf("antigravity status = %v, want Configured", res.Status)
			}
		case "opencode":
			if res.Status != dashboard.StatusDetected || res.Evidence != "dist/opencode" {
				t.Errorf("opencode status = %v (evidence: %s), want Detected", res.Status, res.Evidence)
			}
		case "codex":
			if res.Status != dashboard.StatusConfigured || res.Evidence != "codex.toml" {
				t.Errorf("codex status = %v, want Configured", res.Status)
			}
		case "cursor":
			if res.Status != dashboard.StatusConfigured || res.Evidence != ".cursorrules" {
				t.Errorf("cursor status = %v, want Configured", res.Status)
			}
		}
	}
}

func TestDashboardCyclePreset(t *testing.T) {
	tempDir, mm, om := setupTestWorkspace(t)
	model := dashboard.New(tempDir, mm, om)

	// Cycle to Cheap
	_ = mm.ApplyPreset("premium")
	model.Refresh()

	next, err := model.CyclePreset()
	if err != nil {
		t.Fatalf("CyclePreset() failed: %v", err)
	}
	if next != "Cheap" {
		t.Errorf("CyclePreset from Premium -> %q, want Cheap", next)
	}

	// Cycle from Cheap -> Default
	next, err = model.CyclePreset()
	if err != nil {
		t.Fatalf("CyclePreset() failed: %v", err)
	}
	if next != "Default" {
		t.Errorf("CyclePreset from Cheap -> %q, want Default", next)
	}

	// Cycle from Default -> Premium
	next, err = model.CyclePreset()
	if err != nil {
		t.Fatalf("CyclePreset() failed: %v", err)
	}
	if next != "Premium" {
		t.Errorf("CyclePreset from Default -> %q, want Premium", next)
	}
}

func TestDashboardKeyShortcuts(t *testing.T) {
	tempDir, mm, om := setupTestWorkspace(t)
	model := dashboard.New(tempDir, mm, om)

	// Test 'p' shortcut (preset cycle)
	m, cmd := model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("p")})
	model = m
	if cmd == nil {
		t.Fatal("expected non-nil cmd on 'p'")
	}
	msg := cmd()
	if presetMsg, ok := msg.(dashboard.PresetChangedMsg); !ok || presetMsg.Preset == "" {
		t.Errorf("expected PresetChangedMsg, got %T: %v", msg, msg)
	}
	if !strings.Contains(model.StatusMessage(), "✓ Preset conmutado") {
		t.Errorf("StatusMessage = %q, expected confirmation toast", model.StatusMessage())
	}

	// Test 'd' shortcut (Doctor)
	_, cmd = model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("d")})
	if cmd == nil {
		t.Fatal("expected non-nil cmd on 'd'")
	}
	msg = cmd()
	if switchMsg, ok := msg.(dashboard.SwitchTabMsg); !ok || switchMsg.Tab != 3 {
		t.Errorf("expected SwitchTabMsg{Tab: 3}, got %v", msg)
	}

	// Test 'm' shortcut (Models Hub)
	_, cmd = model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("m")})
	if cmd == nil {
		t.Fatal("expected non-nil cmd on 'm'")
	}
	msg = cmd()
	if switchMsg, ok := msg.(dashboard.SwitchTabMsg); !ok || switchMsg.Tab != 1 {
		t.Errorf("expected SwitchTabMsg{Tab: 1}, got %v", msg)
	}

	// Test 't' shortcut (Targets Manager)
	_, cmd = model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("t")})
	if cmd == nil {
		t.Fatal("expected non-nil cmd on 't'")
	}
	msg = cmd()
	if switchMsg, ok := msg.(dashboard.SwitchTabMsg); !ok || switchMsg.Tab != 2 {
		t.Errorf("expected SwitchTabMsg{Tab: 2}, got %v", msg)
	}
}

func TestDashboardActionNavigationAndEnter(t *testing.T) {
	tempDir, mm, om := setupTestWorkspace(t)
	model := dashboard.New(tempDir, mm, om)

	if model.SelectedAction() != 0 {
		t.Errorf("initial SelectedAction = %d, want 0", model.SelectedAction())
	}

	// Navigate right
	m, _ := model.Update(tea.KeyMsg{Type: tea.KeyRight})
	model = m
	if model.SelectedAction() != 1 {
		t.Errorf("SelectedAction after right = %d, want 1", model.SelectedAction())
	}

	// Navigate right again
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyRight})
	model = m
	if model.SelectedAction() != 2 {
		t.Errorf("SelectedAction after right = %d, want 2", model.SelectedAction())
	}

	// Navigate left
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyLeft})
	model = m
	if model.SelectedAction() != 1 {
		t.Errorf("SelectedAction after left = %d, want 1", model.SelectedAction())
	}

	// Press Enter on action 1 (Doctor)
	_, cmd := model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("expected cmd on Enter")
	}
	msg := cmd()
	if switchMsg, ok := msg.(dashboard.SwitchTabMsg); !ok || switchMsg.Tab != 3 {
		t.Errorf("expected SwitchTabMsg{Tab: 3} on action 1 Enter, got %v", msg)
	}

	// Navigate to action 3 (Targets) and Enter
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyRight})
	m, _ = m.Update(tea.KeyMsg{Type: tea.KeyRight})
	model = m
	_, cmd = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("expected cmd on Enter")
	}
	msg = cmd()
	if switchMsg, ok := msg.(dashboard.SwitchTabMsg); !ok || switchMsg.Tab != 2 {
		t.Errorf("expected SwitchTabMsg{Tab: 2} on action 3 Enter, got %v", msg)
	}
}

func TestDashboardEmptyConfigFallback(t *testing.T) {
	tempDir := t.TempDir()
	mm := config.NewModelsManager(tempDir)
	om := config.NewOpenSpecManager(tempDir)

	model := dashboard.New(tempDir, mm, om)
	model.SetWidth(100)

	view := ansi.Strip(model.View())
	if !strings.Contains(view, "ÍNDICE DE SECCIONES") {
		t.Error("Dashboard should render index even without existing config files")
	}
	if !strings.Contains(view, "OPENSPEC CONTEXT") {
		t.Error("Dashboard should render OpenSpec context even with defaults")
	}
}
