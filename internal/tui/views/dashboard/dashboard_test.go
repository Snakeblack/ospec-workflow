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
	if profile.PresetName == "" {
		t.Error("expected non-empty PresetName")
	}

	osSummary := model.OpenSpec()
	if osSummary.ProjectName != "test-workflow" {
		t.Errorf("ProjectName = %q, want 'test-workflow'", osSummary.ProjectName)
	}
	if osSummary.Version != "v2.60.0" {
		t.Errorf("Version = %q, want 'v2.60.0'", osSummary.Version)
	}

	targets := model.Targets()
	if len(targets) != 7 {
		t.Fatalf("expected 7 targets, got %d", len(targets))
	}
}

func TestDashboardMainMenuNavigation(t *testing.T) {
	tempDir, mm, om := setupTestWorkspace(t)
	model := dashboard.New(tempDir, mm, om)
	model.SetWidth(100)

	view := ansi.Strip(model.View())
	if !strings.Contains(view, "OSPEC WORKFLOW") {
		t.Errorf("expected view to contain 'OSPEC WORKFLOW', got:\n%s", view)
	}
	if !strings.Contains(view, "Instalar ospec") {
		t.Errorf("expected view to contain 'Instalar ospec', got:\n%s", view)
	}
	if !strings.Contains(view, "Desinstalar") {
		t.Errorf("expected view to contain 'Desinstalar', got:\n%s", view)
	}

	// 1. Move down with 'j'
	m, _ := model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'j'}})
	model = m
	if model.SelectedAction() != 1 {
		t.Errorf("SelectedAction after 'j' = %d, want 1", model.SelectedAction())
	}

	// 2. Select action '2' (Configurar modelos)
	m, cmd := model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'2'}})
	model = m
	if model.SelectedAction() != int(dashboard.ActionConfigureModels) {
		t.Errorf("SelectedAction after '2' = %d, want %d", model.SelectedAction(), dashboard.ActionConfigureModels)
	}
	if cmd == nil {
		t.Fatal("expected command on action '2'")
	}
	msg := cmd()
	if actMsg, ok := msg.(dashboard.ActionTriggeredMsg); !ok || actMsg.Action != dashboard.ActionConfigureModels {
		t.Errorf("expected ActionTriggeredMsg with ActionConfigureModels, got %T: %v", msg, msg)
	}

	// 3. Press Enter to trigger current selection
	m, cmd = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	model = m
	if cmd == nil {
		t.Fatal("expected command on Enter")
	}
	msg = cmd()
	if actMsg, ok := msg.(dashboard.ActionTriggeredMsg); !ok || actMsg.Action != dashboard.ActionConfigureModels {
		t.Errorf("expected ActionTriggeredMsg with ActionConfigureModels, got %T: %v", msg, msg)
	}
}

func TestDashboardTargetDetection(t *testing.T) {
	tempDir := t.TempDir()

	results := dashboard.DetectTargets(tempDir)
	for _, res := range results {
		if res.Status != dashboard.StatusNotConfigured {
			t.Errorf("target %s should be NotConfigured in clean dir, got %v", res.ID, res.Status)
		}
	}

	// Add Claude files
	_ = os.WriteFile(filepath.Join(tempDir, ".claude-plugin"), []byte("{}"), 0644)
	_ = os.WriteFile(filepath.Join(tempDir, "AGENTS.md"), []byte("agents"), 0644)

	results = dashboard.DetectTargets(tempDir)
	for _, res := range results {
		switch res.ID {
		case "claude":
			if res.Status != dashboard.StatusConfigured {
				t.Errorf("claude status = %v, want Configured", res.Status)
			}
		case "antigravity":
			if res.Status != dashboard.StatusConfigured {
				t.Errorf("antigravity status = %v, want Configured", res.Status)
			}
		}
	}
}
