package dashboard

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/snakeblack/ospec-workflow/internal/config"
)

const quickActionsCount = 4

// Model represents the Bubbletea UI model for the Dashboard view.
type Model struct {
	repoRoot        string
	modelsMgr       *config.ModelsManager
	openspecMgr     *config.OpenSpecManager
	width           int
	height          int
	selectedSection int
	selectedAction  int
	statusMessage   string
	modelProfile    ModelProfileSummary
	targets         []TargetInfo
	openspec        OpenSpecSummary
}

// New creates a new Dashboard Model for the given repository.
func New(repoRoot string, mm *config.ModelsManager, om *config.OpenSpecManager) Model {
	m := Model{
		repoRoot:        repoRoot,
		modelsMgr:       mm,
		openspecMgr:     om,
		width:           80,
		selectedSection: 0,
		selectedAction:  0,
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

// SelectedAction returns the currently focused quick action index.
func (m Model) SelectedAction() int {
	return m.selectedAction
}

// SelectedSection returns the currently highlighted section index in the dashboard index.
func (m Model) SelectedSection() int {
	return m.selectedSection
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
			claudeModel = tier.Claude
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
			claudeModel = tier.Claude
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

// CyclePreset switches between Cheap -> Default -> Premium -> Cheap presets and saves.
func (m *Model) CyclePreset() (string, error) {
	current := strings.ToLower(m.modelProfile.PresetName)
	var next string
	switch current {
	case "cheap":
		next = "default"
	case "default":
		next = "premium"
	case "premium":
		next = "cheap"
	default:
		next = "default"
	}

	if err := m.modelsMgr.ApplyPreset(next); err != nil {
		return "", err
	}

	m.Refresh()
	nextCap := strings.ToUpper(next[:1]) + strings.ToLower(next[1:])
	return nextCap, nil
}

// Update processes incoming messages and keyboard navigation.
func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "p", "P":
			nextCap, err := m.CyclePreset()
			if err != nil {
				m.statusMessage = fmt.Sprintf("✗ Error al conmutar preset: %v", err)
				return m, nil
			}
			m.statusMessage = fmt.Sprintf("✓ Preset conmutado a '%s' y guardado en models.yaml", nextCap)
			return m, func() tea.Msg {
				return PresetChangedMsg{Preset: nextCap}
			}

		case "d", "D":
			return m, func() tea.Msg {
				return SwitchTabMsg{Tab: 3} // TabDoctor
			}

		case "m", "M":
			return m, func() tea.Msg {
				return SwitchTabMsg{Tab: 1} // TabModels
			}

		case "t", "T":
			return m, func() tea.Msg {
				return SwitchTabMsg{Tab: 2} // TabTargets
			}

		case "up", "k":
			m.selectedSection = (m.selectedSection + 4 - 1) % 4
			return m, nil

		case "down", "j":
			m.selectedSection = (m.selectedSection + 1) % 4
			return m, nil

		case "left", "h":
			m.selectedAction = (m.selectedAction + quickActionsCount - 1) % quickActionsCount
			return m, nil

		case "right", "l":
			m.selectedAction = (m.selectedAction + 1) % quickActionsCount
			return m, nil

		case "enter":
			switch m.selectedAction {
			case 0: // Conmutar preset
				nextCap, err := m.CyclePreset()
				if err != nil {
					m.statusMessage = fmt.Sprintf("✗ Error al conmutar preset: %v", err)
					return m, nil
				}
				m.statusMessage = fmt.Sprintf("✓ Preset conmutado a '%s' y guardado en models.yaml", nextCap)
				return m, func() tea.Msg {
					return PresetChangedMsg{Preset: nextCap}
				}
			case 1: // System Doctor
				return m, func() tea.Msg {
					return SwitchTabMsg{Tab: 3}
				}
			case 2: // Models Hub
				return m, func() tea.Msg {
					return SwitchTabMsg{Tab: 1}
				}
			case 3: // Targets Manager
				return m, func() tea.Msg {
					return SwitchTabMsg{Tab: 2}
				}
			}
		}

	case tea.WindowSizeMsg:
		m.SetSize(msg.Width, msg.Height)
	}

	return m, nil
}

// View renders the complete Dashboard view with an indexed minimalist master-detail layout.
func (m Model) View() string {
	boxWidth := m.width - 4
	if boxWidth < 20 {
		boxWidth = 20
	}

	quickActions := renderQuickActions(m.selectedAction, m.statusMessage, boxWidth)

	// Responsive 2-column layout: Index on left, focused Detail on right
	if boxWidth >= 74 {
		leftWidth := 30
		rightWidth := boxWidth - leftWidth - 2
		if rightWidth < 38 {
			rightWidth = 38
		}

		indexCard := renderDashboardIndex(m.selectedSection, m.modelProfile.PresetName, len(m.targets), leftWidth)

		var detailCard string
		switch m.selectedSection {
		case 1:
			detailCard = renderTargetsCard(m.targets, rightWidth)
		case 2:
			detailCard = renderModelProfileCard(m.modelProfile, rightWidth)
		default:
			detailCard = renderOpenSpecCard(m.openspec, rightWidth)
		}

		topRow := lipgloss.JoinHorizontal(lipgloss.Top, indexCard, " ", detailCard)

		return lipgloss.JoinVertical(
			lipgloss.Left,
			topRow,
			quickActions,
		)
	}

	// Compact stacked layout
	indexCard := renderDashboardIndex(m.selectedSection, m.modelProfile.PresetName, len(m.targets), boxWidth)
	var detailCard string
	switch m.selectedSection {
	case 1:
		detailCard = renderTargetsCard(m.targets, boxWidth)
	case 2:
		detailCard = renderModelProfileCard(m.modelProfile, boxWidth)
	default:
		detailCard = renderOpenSpecCard(m.openspec, boxWidth)
	}

	return lipgloss.JoinVertical(
		lipgloss.Left,
		indexCard,
		detailCard,
		quickActions,
	)
}
