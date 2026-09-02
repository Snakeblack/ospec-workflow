package dashboard

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/snakeblack/ospec-workflow/internal/config"
)

// Model represents the Bubbletea UI model for the Dashboard / Home view.
type Model struct {
	repoRoot        string
	modelsMgr       *config.ModelsManager
	openspecMgr     *config.OpenSpecManager
	width           int
	height          int
	selectedAction  int
	statusMessage   string
	modelProfile    ModelProfileSummary
	targets         []TargetInfo
	openspec        OpenSpecSummary
	hitStore        *[]dashHit
}

type dashHit struct {
	Index int
	Y     int
	H     int
}

// New creates a new Dashboard Model for the given repository.
func New(repoRoot string, mm *config.ModelsManager, om *config.OpenSpecManager) Model {
	m := Model{
		repoRoot:       repoRoot,
		modelsMgr:      mm,
		openspecMgr:    om,
		width:          80,
		selectedAction: 0,
		hitStore:       &[]dashHit{},
	}
	m.Refresh()
	return m
}

// Init initializes the Dashboard model.
func (m Model) Init() tea.Cmd {
	return nil
}

// SetSize updates the viewport dimensions for responsive layout.
func (m *Model) SetSize(w, h int) {
	m.width = w
	m.height = h
}

// SetWidth updates viewport width.
func (m *Model) SetWidth(w int) {
	m.width = w
}

// SetHeight updates viewport height.
func (m *Model) SetHeight(h int) {
	m.height = h
}

// SelectedAction returns the currently focused main menu action index.
func (m Model) SelectedAction() int {
	return m.selectedAction
}

// StatusMessage returns the current toast notification text.
func (m Model) StatusMessage() string {
	return m.statusMessage
}

// Targets returns detected targets info.
func (m Model) Targets() []TargetInfo {
	return m.targets
}

// ModelProfile returns the current model profile summary.
func (m Model) ModelProfile() ModelProfileSummary {
	return m.modelProfile
}

// OpenSpec returns the current OpenSpec summary.
func (m Model) OpenSpec() OpenSpecSummary {
	return m.openspec
}

// Refresh reloads configuration and updates internal cached view data.
func (m *Model) Refresh() {
	// 1. Load Model Profile Summary
	presetName := "Default"
	if p, err := m.modelsMgr.GetActivePreset(); err == nil && p != "" {
		presetName = strings.ToUpper(p[:1]) + strings.ToLower(p[1:])
	}

	agentTiers := make(map[string]string)
	var claudeModel, vscodeModel, codexModel, opencodeModel, cursorModel string

	if cfg, err := m.modelsMgr.GetConfig(); err == nil && cfg != nil {
		for k, v := range cfg.Agents {
			agentTiers[k] = v
		}

		tierKey := strings.ToLower(presetName)
		if tier, ok := cfg.Tiers[tierKey]; ok {
			claudeModel = tier.GetClaudeModel()
			if tier.Codex != nil {
				codexModel = tier.Codex.Model
			}
			opencodeModel = tier.OpenCode
			cursorModel = tier.Cursor
			vsModels := tier.GetVSCodeModels()
			if len(vsModels) > 0 {
				vscodeModel = vsModels[0]
			}
		} else if tier, ok := cfg.Tiers["default"]; ok {
			claudeModel = tier.GetClaudeModel()
			if tier.Codex != nil {
				codexModel = tier.Codex.Model
			}
			opencodeModel = tier.OpenCode
			cursorModel = tier.Cursor
			vsModels := tier.GetVSCodeModels()
			if len(vsModels) > 0 {
				vscodeModel = vsModels[0]
			}
		}
	}

	m.modelProfile = ModelProfileSummary{
		PresetName:    presetName,
		ClaudeModel:   claudeModel,
		VSCodeModel:   vscodeModel,
		CodexModel:    codexModel,
		OpenCodeModel: opencodeModel,
		CursorModel:   cursorModel,
		AgentTiers:    agentTiers,
	}

	// 2. Load OpenSpec Summary
	var osSummary OpenSpecSummary
	if oscfg, err := m.openspecMgr.LoadConfig(); err == nil && oscfg != nil {
		osSummary = OpenSpecSummary{
			ProjectName:    oscfg.Project.Name,
			Version:        oscfg.Project.Version,
			Status:         oscfg.Project.Status,
			TDDMode:        oscfg.Testing.TDDMode,
			Runner:         oscfg.Testing.Runner,
			Framework:      oscfg.Testing.Framework,
			TestCommand:    oscfg.Testing.TestCommand,
			UnitEnabled:    oscfg.Testing.Layers.Unit,
			IntEnabled:     oscfg.Testing.Layers.Integration,
			E2EEnabled:     oscfg.Testing.Layers.E2E,
			BaselineStatus: oscfg.Baseline.Status,
			DomainsDone:    len(oscfg.Baseline.DomainsDone),
			DomainsPending: len(oscfg.Baseline.DomainsPending),
			RulesCount:     len(oscfg.Rules),
		}
		if !strings.HasPrefix(osSummary.Version, "v") && osSummary.Version != "" {
			osSummary.Version = "v" + osSummary.Version
		}
	} else {
		osSummary = OpenSpecSummary{
			ProjectName:    "ospec-workflow",
			Version:        "v2.58.0",
			Status:         "active",
			TDDMode:        "focused",
			Runner:         "node",
			TestCommand:    "npm test",
			BaselineStatus: "done",
		}
	}
	m.openspec = osSummary

	// 3. Detect Targets
	m.targets = DetectTargets(m.repoRoot)
}

// Update processes incoming messages and keyboard navigation.
func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "up", "k":
			if m.selectedAction > 0 {
				m.selectedAction--
			} else {
				m.selectedAction = int(MainMenuActionCount) - 1
			}
			return m, nil

		case "down", "j":
			if m.selectedAction < int(MainMenuActionCount)-1 {
				m.selectedAction++
			} else {
				m.selectedAction = 0
			}
			return m, nil

		case "1":
			m.selectedAction = int(ActionInstall)
			return m, func() tea.Msg { return ActionTriggeredMsg{Action: ActionInstall} }
		case "2":
			m.selectedAction = int(ActionConfigureModels)
			return m, func() tea.Msg { return ActionTriggeredMsg{Action: ActionConfigureModels} }
		case "3":
			m.selectedAction = int(ActionUpdate)
			return m, func() tea.Msg { return ActionTriggeredMsg{Action: ActionUpdate} }
		case "4":
			m.selectedAction = int(ActionUninstall)
			return m, func() tea.Msg { return ActionTriggeredMsg{Action: ActionUninstall} }

		case "enter":
			act := MainMenuActionID(m.selectedAction)
			return m, func() tea.Msg {
				return ActionTriggeredMsg{Action: act}
			}
		}

	case tea.MouseMsg:
		if msg.Action != tea.MouseActionPress || msg.Button != tea.MouseButtonLeft {
			return m, nil
		}
		if m.hitStore != nil {
			for _, h := range *m.hitStore {
				if msg.Y >= h.Y && msg.Y < h.Y+h.H {
					m.selectedAction = h.Index
					act := MainMenuActionID(h.Index)
					return m, func() tea.Msg { return ActionTriggeredMsg{Action: act} }
				}
			}
		}
		return m, nil

	case tea.WindowSizeMsg:
		m.SetSize(msg.Width, msg.Height)
	}

	return m, nil
}

// View renders the home screen: hero, status and the installer/models actions.
func (m Model) View() string {
	boxWidth := m.width - 4
	if boxWidth < 30 {
		boxWidth = 30
	}

	heroBanner := renderOctopusHero(m.modelProfile.PresetName, len(m.targets), m.openspec.Version, boxWidth)
	mainMenu, menuHits := renderMainMenu(m.selectedAction, boxWidth)
	heroH := lipgloss.Height(heroBanner)
	if m.hitStore != nil {
		offset := make([]dashHit, len(menuHits))
		for i, h := range menuHits {
			h.Y += heroH
			offset[i] = h
		}
		*m.hitStore = offset
	}

	var statusRow string
	if m.statusMessage != "" {
		statusRow = fmt.Sprintf("\n%s", m.statusMessage)
	}

	return lipgloss.JoinVertical(
		lipgloss.Left,
		heroBanner,
		mainMenu,
		statusRow,
	)
}
