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
      model: o3
      model_reasoning_effort: high
      model_verbosity: medium
    opencode: anthropic/claude-3-7-sonnet-20250219
    vscode:
      - "Claude 3.7 Sonnet (copilot)"
    cursor: claude-3.7-sonnet-thinking
    antigravity: pro
  default:
    claude: sonnet
    codex:
      model: o3-mini
      model_reasoning_effort: medium
      model_verbosity: medium
    opencode: anthropic/claude-3-7-sonnet-20250219
    vscode:
      - "Claude 3.7 Sonnet (copilot)"
    cursor: claude-3.7-sonnet
    antigravity: flash
  cheap:
    claude: haiku
    codex:
      model: gpt-4o-mini
      model_reasoning_effort: low
      model_verbosity: low
    opencode: anthropic/claude-3-5-haiku-20241022
    vscode:
      - "Claude 3.5 Haiku (copilot)"
    cursor: claude-3.5-haiku
    antigravity: flash_lite
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

	targets := model.TargetConfigs()
	if len(targets) != 6 {
		t.Fatalf("expected 6 targets, got %d", len(targets))
	}
}

func TestModelsHubRenderPresetsView(t *testing.T) {
	tempDir, mm := setupTestWorkspace(t)
	model := models.New(tempDir, mm)

	// Standard wide screen
	model.SetSize(130, 40)
	viewWide := ansi.Strip(model.View())

	expectedSubstrings := []string{
		"[1] Presets",
		"Económico",
		"Equilibrado",
		"Máximo",
		"Qué es un preset",
		"cliente",
	}

	for _, s := range expectedSubstrings {
		if !strings.Contains(viewWide, s) {
			t.Errorf("Wide Presets view missing expected substring %q\nGot:\n%s", s, viewWide)
		}
	}

	// Compact screen
	model.SetSize(80, 40)
	viewCompact := ansi.Strip(model.View())
	for _, s := range []string{"Económico", "Equilibrado", "Máximo"} {
		if !strings.Contains(viewCompact, s) {
			t.Errorf("Compact Presets view missing expected substring %q", s)
		}
	}
}

func TestModelsHubRenderTargetModelsView(t *testing.T) {
	tempDir, mm := setupTestWorkspace(t)
	model := models.New(tempDir, mm)

	// Switch to Target Models mode via '3'
	m, _ := model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("3")})
	model = m

	if model.Mode() != models.ModeTargetModels {
		t.Fatalf("Mode after '2' = %v, want ModeTargetModels", model.Mode())
	}

	model.SetSize(100, 40)
	view := ansi.Strip(model.View())

	expectedSubstrings := []string{
		"Claude Code",
		"OpenAI Codex CLI",
		"Google Antigravity",
		"Cursor",
		"VS Code (Copilot Chat)",
		"OpenCode",
		"Esfuerzo",
	}

	for _, s := range expectedSubstrings {
		if !strings.Contains(view, s) {
			t.Errorf("Target Models view missing expected substring %q\nGot:\n%s", s, view)
		}
	}
}

func TestModelsHubRenderGranularView(t *testing.T) {
	tempDir, mm := setupTestWorkspace(t)
	model := models.New(tempDir, mm)

	// Switch to Granular mode via '2'
	m, _ := model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("2")})
	model = m

	if model.Mode() != models.ModeGranular {
		t.Fatalf("Mode after '2' = %v, want ModeGranular", model.Mode())
	}

	model.SetSize(100, 40)
	viewPage1 := ansi.Strip(model.View())

	expectedPage1 := []string{
		"Agente",
		"Nivel",
		"sdd-orchestrator",
		"sdd-propose",
		"sdd-spec",
		"PÁGINA [1 de 3]",
	}

	for _, s := range expectedPage1 {
		if !strings.Contains(viewPage1, s) {
			t.Errorf("Page 1 view missing expected substring %q\nGot:\n%s", s, viewPage1)
		}
	}

	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyPgDown})
	model = m
	viewPage2 := ansi.Strip(model.View())

	expectedPage2 := []string{
		"sdd-tasks",
		"sdd-apply",
		"sdd-verify",
		"PÁGINA [2 de 3]",
	}

	for _, s := range expectedPage2 {
		if !strings.Contains(viewPage2, s) {
			t.Errorf("Page 2 view missing expected substring %q\nGot:\n%s", s, viewPage2)
		}
	}
}

func TestModelsHubDoesNotExposeAPIKeys(t *testing.T) {
	tempDir, mm := setupTestWorkspace(t)
	model := models.New(tempDir, mm)
	model.SetSize(100, 40)

	view := ansi.Strip(model.View())
	if strings.Contains(view, "API Key") || strings.Contains(view, "Proveedores CLOUD") {
		t.Errorf("models hub should not ask for API keys, got:\n%s", view)
	}

	m, _ := model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("4")})
	model = m
	if model.Mode() != models.ModePresets {
		t.Errorf("key 4 should not open a providers/API-key view, mode=%v", model.Mode())
	}
}

func TestModelsHubApplyPresetInteraction(t *testing.T) {
	tempDir, mm := setupTestWorkspace(t)
	model := models.New(tempDir, mm)
	model.SetSize(120, 40)

	m, _ := model.Update(tea.KeyMsg{Type: tea.KeyLeft})
	model = m
	if model.FocusedPreset() != 0 {
		t.Errorf("FocusedPreset after left = %d, want 0 (cheap)", model.FocusedPreset())
	}

	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	model = m
	if model.PresetZone() != 1 {
		t.Fatalf("Enter on card should open client list, zone=%d", model.PresetZone())
	}
	view := ansi.Strip(model.View())
	if !strings.Contains(view, "cliente") && !strings.Contains(view, "Claude") {
		t.Errorf("preset target list missing clients:\n%s", view)
	}

	m, cmd := model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	model = m
	if model.PresetZone() != 2 {
		t.Fatalf("Enter on client should open agents, zone=%d", model.PresetZone())
	}
	view = ansi.Strip(model.View())
	if !strings.Contains(view, "sdd-orchestrator") && !strings.Contains(view, "sdd-propose") && !strings.Contains(view, "Todos los agentes") {
		t.Errorf("agent editor missing roster:\n%s", view)
	}

	m, cmd = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	model = m
	if cmd == nil {
		t.Fatal("expected tea.Cmd after saving target assignments")
	}
	msg := cmd()
	if appliedMsg, ok := msg.(models.PresetAppliedMsg); !ok || appliedMsg.Preset == "" {
		t.Errorf("expected PresetAppliedMsg, got %v", msg)
	}

	cfg, err := mm.GetConfig()
	if err != nil {
		t.Fatal(err)
	}
	if !config.HasTargetAssignments(cfg, "claude") {
		t.Fatal("expected claude assignments after save")
	}

	if !strings.Contains(model.StatusMessage(), "guardados") {
		t.Errorf("StatusMessage = %q, expected save confirmation", model.StatusMessage())
	}

	m, cmd = model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{'a'}})
	model = m
	if cmd == nil {
		t.Fatal("expected cmd after applying preset to a configured client")
	}
	if !strings.Contains(model.StatusMessage(), "aplicado") {
		t.Errorf("StatusMessage after a = %q", model.StatusMessage())
	}
}

func TestModelsHubGranularTuningInteraction(t *testing.T) {
	tempDir, mm := setupTestWorkspace(t)
	model := models.New(tempDir, mm)

	// Switch to Granular mode via '2'
	m, _ := model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("2")})
	model = m

	initialIdx := model.SelectedAgentIndex()

	// Move down
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyDown})
	model = m
	if model.SelectedAgentIndex() != initialIdx+1 {
		t.Errorf("SelectedAgentIndex after down = %d, want %d", model.SelectedAgentIndex(), initialIdx+1)
	}

	selectedAgent := model.Agents()[model.SelectedAgentIndex()].Name

	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyRight})
	model = m

	tier, err := mm.GetAgentTier(selectedAgent)
	if err != nil || tier != "premium" {
		t.Errorf("Agent %q tier after right arrow = %q, want 'premium'", selectedAgent, tier)
	}

	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyLeft})
	model = m
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyLeft})
	model = m

	tier, err = mm.GetAgentTier(selectedAgent)
	if err != nil || tier != "cheap" {
		t.Errorf("Agent %q tier after two left arrows = %q, want 'cheap'", selectedAgent, tier)
	}

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

	// Switch to agents with '2'
	m, _ := model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("2")})
	model = m
	if model.Mode() != models.ModeGranular {
		t.Errorf("Mode after '2' = %v, want ModeGranular", model.Mode())
	}

	// Switch to clients with '3'
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("3")})
	model = m
	if model.Mode() != models.ModeTargetModels {
		t.Errorf("Mode after '3' = %v, want ModeTargetModels", model.Mode())
	}

	// Toggle back with '1'
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("1")})
	model = m
	if model.Mode() != models.ModePresets {
		t.Errorf("Mode after '1' = %v, want ModePresets", model.Mode())
	}
}

func TestModelPicker_OpenFilterSelect(t *testing.T) {
	tempDir, mm := setupTestWorkspace(t)
	model := models.New(tempDir, mm)

	// 1. Switch to Target Models mode ('3')
	m, _ := model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("3")})
	model = m

	if model.IsPickerOpen() {
		t.Fatal("picker should initially be closed")
	}

	// 2. Press Enter to open Interactive Model Picker
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	model = m

	if !model.IsPickerOpen() {
		t.Fatal("picker should be open after Enter")
	}

	// 3. View should render the modal
	model.SetSize(100, 40)
	modalView := ansi.Strip(model.View())
	if !strings.Contains(modalView, "ELEGIR MODELO PARA: CLAUDE") {
		t.Errorf("modal view missing expected header, got:\n%s", modalView)
	}

	// 4. Trigger search with '/' and type 'opus'
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("/")})
	model = m
	for _, r := range "opus" {
		m, _ = model.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune{r}})
		model = m
	}

	// 5. Select filtered item with Enter
	m, _ = model.Update(tea.KeyMsg{Type: tea.KeyEnter})
	model = m

	if model.IsPickerOpen() {
		t.Fatal("picker should be closed after selecting model")
	}

	// 6. Verify Claude target model was updated in models.yaml
	cfg, err := mm.GetConfig()
	if err != nil {
		t.Fatalf("failed to get config: %v", err)
	}
	if cfg.Tiers["default"].GetClaudeModel() != "opus" {
		t.Errorf("expected default tier Claude model to be updated with opus, got: %s", cfg.Tiers["default"].GetClaudeModel())
	}
}

func TestModelsHubCatalogAndEffortCopy(t *testing.T) {
	tempDir, mm := setupTestWorkspace(t)
	model := models.New(tempDir, mm)
	model.SetSize(120, 40)

	view := ansi.Strip(model.View())
	if strings.Contains(view, "t/n/p") || strings.Contains(view, "n/p") {
		t.Fatalf("presets view should not advertise n/p shortcuts:\n%s", view)
	}

	claude := model.TargetConfigs()[0]
	if claude.ID != "claude" {
		t.Fatalf("first target = %s", claude.ID)
	}
	joined := strings.Join(claude.AvailableModels, ",")
	if strings.Contains(joined, "claude-opus-5") || strings.Contains(joined, "inherit") {
		t.Fatalf("claude catalog should be aliases only, got %v", claude.AvailableModels)
	}
	if !claude.SupportsEffort {
		t.Fatal("claude should support effort")
	}

	var codex models.TargetConfigItem
	for _, tcfg := range model.TargetConfigs() {
		if tcfg.ID == "codex" {
			codex = tcfg
		}
	}
	if strings.Contains(strings.Join(codex.AvailableModels, ","), "o3") {
		t.Fatalf("codex catalog still has o3: %v", codex.AvailableModels)
	}
	if !codex.SupportsEffort || !codex.SupportsVerbosity {
		t.Fatal("codex should support effort and verbosity")
	}

	var vscode models.TargetConfigItem
	for _, tcfg := range model.TargetConfigs() {
		if tcfg.ID == "vscode" {
			vscode = tcfg
		}
	}
	if vscode.SupportsEffort {
		t.Fatal("vscode custom agents should not expose effort")
	}
}
