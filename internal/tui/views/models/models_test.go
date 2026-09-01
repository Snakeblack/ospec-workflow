package models_test

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
	"github.com/snakeblack/ospec-workflow/internal/tui/views/models"
)

func init() {
	lipgloss.SetColorProfile(termenv.Ascii)
}

func setupTestWorkspace(t *testing.T) (string, *config.ModelsManager) {
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

	mm := config.NewModelsManager(tempDir)
	return tempDir, mm
}

func TestModelsHubInitialization(t *testing.T) {
	tempDir, mm := setupTestWorkspace(t)
	model := models.New(tempDir, mm)

	if model.Mode() != models.ModePresets {
		t.Errorf("initial Mode = %v, want ModePresets", model.Mode())
	}

	presets := model.Presets()
	if len(presets) != 3 {
		t.Fatalf("expected 3 presets, got %d", len(presets))
	}

	agents := model.Agents()
	if len(agents) < 20 {
		t.Fatalf("expected at least 20 agents, got %d", len(agents))
	}
}

func TestModelsHubRenderPresetsView(t *testing.T) {
	tempDir, mm := setupTestWorkspace(t)
	model := models.New(tempDir, mm)

	// Standard wide screen
	model.SetSize(130, 40)
	viewWide := ansi.Strip(model.View())

	expectedSubstrings := []string{
		"Presets Globales",
		"Afinamiento por Agente",
		"Cheap / Económico",
		"Default / Estándar",
		"Premium / Razonamiento",
		"opus",
		"sonnet",
		"haiku",
	}

	for _, s := range expectedSubstrings {
		if !strings.Contains(viewWide, s) {
			t.Errorf("Wide Presets view missing expected substring %q\nGot:\n%s", s, viewWide)
		}
	}

	// Compact screen
	model.SetSize(80, 40)
	viewCompact := ansi.Strip(model.View())
	for _, s := range []string{"Cheap / Económico", "Default / Estándar", "Premium / Razonamiento"} {
		if !strings.Contains(viewCompact, s) {
			t.Errorf("Compact Presets view missing expected substring %q", s)
		}
	}
}

func TestModelsHubRenderGranularView(t *testing.T) {
	tempDir, mm := setupTestWorkspace(t)
	model := models.New(tempDir, mm)

	// Switch to Granular mode via '3'
	m, _ := model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("3")})
	model = m

	if model.Mode() != models.ModeGranular {
		t.Fatalf("Mode after '3' = %v, want ModeGranular", model.Mode())
	}

	model.SetSize(100, 40)
	viewPage1 := ansi.Strip(model.View())

	expectedPage1 := []string{
		"Agente / Subagente",
		"Tier Asignado",
		"sdd-orchestrator",
		"sdd-propose",
		"sdd-spec",
		"PÁGINA [1 de 4]",
	}

	for _, s := range expectedPage1 {
		if !strings.Contains(viewPage1, s) {
			t.Errorf("Page 1 view missing expected substring %q\nGot:\n%s", s, viewPage1)
		}
	}

	// Move to Page 2 with 'n'
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("n")})
	model = m
	viewPage2 := ansi.Strip(model.View())

	expectedPage2 := []string{
		"sdd-design",
		"sdd-tasks",
		"sdd-apply",
		"sdd-verify",
		"PÁGINA [2 de 4]",
	}

	for _, s := range expectedPage2 {
		if !strings.Contains(viewPage2, s) {
			t.Errorf("Page 2 view missing expected substring %q\nGot:\n%s", s, viewPage2)
		}
	}
}

func TestModelsHubRenderProvidersView(t *testing.T) {
	tempDir, mm := setupTestWorkspace(t)
	model := models.New(tempDir, mm)

	// Switch to Providers mode via '2'
	m, _ := model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("2")})
	model = m

	if model.Mode() != models.ModeProviders {
		t.Fatalf("Mode after '2' = %v, want ModeProviders", model.Mode())
	}

	model.SetSize(100, 40)
	view := ansi.Strip(model.View())

	expectedSubstrings := []string{
		"PROVEEDORES LOCALES",
		"PROVEEDORES CLOUD",
		"Ollama",
		"Anthropic",
		"OpenAI",
	}

	for _, s := range expectedSubstrings {
		if !strings.Contains(view, s) {
			t.Errorf("Providers view missing expected substring %q\nGot:\n%s", s, view)
		}
	}
}

func TestModelsHubApplyPresetInteraction(t *testing.T) {
	tempDir, mm := setupTestWorkspace(t)
	model := models.New(tempDir, mm)

	// Focus is initially Default (index 1). Move left to Cheap (index 0).
	m, _ := model.Update(tea.KeyMsg{Type: tea.KeyLeft})
	model = m

	if model.FocusedPreset() != 0 {
		t.Errorf("FocusedPreset after left = %d, want 0 (cheap)", model.FocusedPreset())
	}

	// Press Enter to apply Cheap preset
	m, cmd := model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	model = m

	if cmd == nil {
		t.Fatal("expected non-nil tea.Cmd after applying preset")
	}

	msg := cmd()
	if appliedMsg, ok := msg.(models.PresetAppliedMsg); !ok || appliedMsg.Preset != "Cheap" {
		t.Errorf("expected PresetAppliedMsg with 'Cheap', got %v", msg)
	}

	// Verify persistence in models.yaml
	active, err := mm.GetActivePreset()
	if err != nil || active != "cheap" {
		t.Errorf("Active preset in manager = %q, want 'cheap'", active)
	}

	if !strings.Contains(model.StatusMessage(), "✓ Preset 'Cheap' aplicado") {
		t.Errorf("StatusMessage = %q, expected success confirmation", model.StatusMessage())
	}
}

func TestModelsHubGranularTuningInteraction(t *testing.T) {
	tempDir, mm := setupTestWorkspace(t)
	model := models.New(tempDir, mm)

	// Switch to Granular mode via '3'
	m, _ := model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("3")})
	model = m

	initialIdx := model.SelectedAgentIndex()

	// Move down
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyDown})
	model = m
	if model.SelectedAgentIndex() != initialIdx+1 {
		t.Errorf("SelectedAgentIndex after down = %d, want %d", model.SelectedAgentIndex(), initialIdx+1)
	}

	selectedAgent := model.Agents()[model.SelectedAgentIndex()].Name

	// Set tier directly to Premium using 'P'
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("P")})
	model = m

	tier, err := mm.GetAgentTier(selectedAgent)
	if err != nil || tier != "premium" {
		t.Errorf("Agent %q tier after 'P' = %q, want 'premium'", selectedAgent, tier)
	}

	// Set tier directly to Cheap using 'c'
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("c")})
	model = m

	tier, err = mm.GetAgentTier(selectedAgent)
	if err != nil || tier != "cheap" {
		t.Errorf("Agent %q tier after 'c' = %q, want 'cheap'", selectedAgent, tier)
	}

	// Cycle tier to Default using right arrow
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyRight})
	model = m

	tier, err = mm.GetAgentTier(selectedAgent)
	if err != nil || tier != "default" {
		t.Errorf("Agent %q tier after right arrow = %q, want 'default'", selectedAgent, tier)
	}
}

func TestModelsHubModeSwitching(t *testing.T) {
	tempDir, mm := setupTestWorkspace(t)
	model := models.New(tempDir, mm)

	if model.Mode() != models.ModePresets {
		t.Errorf("initial Mode = %v, want ModePresets", model.Mode())
	}

	// Switch to Providers with '2'
	m, _ := model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("2")})
	model = m
	if model.Mode() != models.ModeProviders {
		t.Errorf("Mode after '2' = %v, want ModeProviders", model.Mode())
	}

	// Switch to Granular with '3'
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("3")})
	model = m
	if model.Mode() != models.ModeGranular {
		t.Errorf("Mode after '3' = %v, want ModeGranular", model.Mode())
	}

	// Toggle back with '1'
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("1")})
	model = m
	if model.Mode() != models.ModePresets {
		t.Errorf("Mode after '1' = %v, want ModePresets", model.Mode())
	}

	// Cycle with 'v'
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("v")})
	model = m
	if model.Mode() != models.ModeProviders {
		t.Errorf("Mode after 'v' = %v, want ModeProviders", model.Mode())
	}
}
