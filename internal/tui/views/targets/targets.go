package targets

import (
	"fmt"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/snakeblack/ospec-workflow/internal/system"
	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
)

// Model represents the Elm component model for the Targets Manager view.
type Model struct {
	repoRoot      string
	targets       []system.TargetSpec
	selectedIdx   int
	width         int
	height        int
	statusMessage string
	isSyncing     bool
}

// New creates a new Targets Manager Elm Model.
func New(repoRoot string) Model {
	m := Model{
		repoRoot:    repoRoot,
		selectedIdx: 0,
		width:       100,
		height:      30,
	}
	m.Refresh()
	return m
}

// Init initializes the model.
func (m Model) Init() tea.Cmd {
	return nil
}

// SetSize updates the viewport dimensions.
func (m *Model) SetSize(w, h int) {
	m.width = w
	m.height = h
}

// SelectedIndex returns the index of the currently selected target.
func (m Model) SelectedIndex() int {
	return m.selectedIdx
}

// SelectedTarget returns a pointer to the currently selected TargetSpec, or nil if none.
func (m Model) SelectedTarget() *system.TargetSpec {
	if m.selectedIdx >= 0 && m.selectedIdx < len(m.targets) {
		return &m.targets[m.selectedIdx]
	}
	return nil
}

// Targets returns the slice of inspected target specifications.
func (m Model) Targets() []system.TargetSpec {
	return m.targets
}

// StatusMessage returns the current transient status message/toast.
func (m Model) StatusMessage() string {
	return m.statusMessage
}

// Refresh re-inspects targets in the workspace.
func (m *Model) Refresh() {
	m.targets = system.InspectTargets(m.repoRoot)
	if m.selectedIdx >= len(m.targets) && len(m.targets) > 0 {
		m.selectedIdx = len(m.targets) - 1
	}
}

// SyncSelectedTarget dispatches an asynchronous command to synchronize the active target.
func (m *Model) SyncSelectedTarget() tea.Cmd {
	target := m.SelectedTarget()
	if target == nil {
		return nil
	}

	targetID := target.ID
	repoRoot := m.repoRoot
	m.isSyncing = true

	return func() tea.Msg {
		err := system.SyncTarget(repoRoot, targetID)
		if err != nil {
			return TargetSyncedMsg{
				TargetID: targetID,
				Success:  false,
				Message:  err.Error(),
			}
		}
		return TargetSyncedMsg{
			TargetID: targetID,
			Success:  true,
			Message:  fmt.Sprintf("✓ Configuración de %s sincronizada", targetID),
		}
	}
}

// Update handles messages and updates the model state.
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case TargetSyncedMsg:
		m.isSyncing = false
		m.Refresh()
		targetName := msg.TargetID
		for _, t := range m.targets {
			if t.ID == msg.TargetID {
				targetName = t.DisplayName
				break
			}
		}
		if msg.Success {
			m.statusMessage = fmt.Sprintf("✓ %s sincronizado correctamente", targetName)
		} else {
			m.statusMessage = fmt.Sprintf("✗ Error al sincronizar %s: %s", targetName, msg.Message)
		}
		return m, nil

	case tea.WindowSizeMsg:
		m.SetSize(msg.Width, msg.Height)
		return m, nil

	case tea.KeyMsg:
		switch msg.String() {
		case "up", "k":
			if m.selectedIdx > 0 {
				m.selectedIdx--
			}
			return m, nil

		case "down", "j":
			if m.selectedIdx < len(m.targets)-1 {
				m.selectedIdx++
			}
			return m, nil

		case "home", "g":
			m.selectedIdx = 0
			return m, nil

		case "end", "G":
			if len(m.targets) > 0 {
				m.selectedIdx = len(m.targets) - 1
			}
			return m, nil

		case "1", "2", "3", "4", "5", "6":
			idx := int(msg.Runes[0] - '1')
			if idx >= 0 && idx < len(m.targets) {
				m.selectedIdx = idx
			}
			return m, nil

		case "s", "enter":
			return m, m.SyncSelectedTarget()

		case "r":
			m.Refresh()
			m.statusMessage = "✓ Inspección actualizada"
			return m, nil
		}
	}

	return m, nil
}

// View renders the Targets Manager view.
func (m Model) View() string {
	if len(m.targets) == 0 {
		return theme.StyleCard.Render("No se detectaron targets.")
	}

	target := m.SelectedTarget()

	var body string
	if m.width >= 70 {
		// Split layout: 34 cols list, remainder detail
		listWidth := 32
		detailWidth := m.width - listWidth - 2
		if detailWidth < 36 {
			detailWidth = 36
		}

		leftPane := renderTargetList(m.targets, m.selectedIdx, listWidth)
		rightPane := renderTargetDetail(target, detailWidth)
		body = lipgloss.JoinHorizontal(lipgloss.Top, leftPane, " ", rightPane)
	} else {
		// Stacked layout
		paneWidth := m.width - 2
		if paneWidth < 20 {
			paneWidth = 20
		}
		topPane := renderTargetList(m.targets, m.selectedIdx, paneWidth)
		bottomPane := renderTargetDetail(target, paneWidth)
		body = lipgloss.JoinVertical(lipgloss.Left, topPane, bottomPane)
	}

	elements := []string{body}
	if m.statusMessage != "" {
		elements = append(elements, theme.StyleValueAccent.Render(m.statusMessage))
	}

	return lipgloss.JoinVertical(lipgloss.Left, elements...)
}
