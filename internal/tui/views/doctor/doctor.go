package doctor

import (
	"fmt"
	"strconv"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/snakeblack/ospec-workflow/internal/system"
	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
)

// Model represents the Elm component model for the System Doctor view.
type Model struct {
	repoRoot      string
	report        system.DoctorReport
	selectedIdx   int
	width         int
	height        int
	statusMessage string
	isScanning    bool
}

// New creates a new System Doctor Elm Model.
func New(repoRoot string) Model {
	m := Model{
		repoRoot:    repoRoot,
		selectedIdx: 0,
		width:       100,
		height:      30,
	}
	m.report = system.RunDiagnostics(repoRoot)
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

// SelectedIndex returns the index of the currently selected diagnostic check.
func (m Model) SelectedIndex() int {
	return m.selectedIdx
}

// SelectedCheck returns a pointer to the currently selected DoctorCheck, or nil if none.
func (m Model) SelectedCheck() *system.DoctorCheck {
	if m.selectedIdx >= 0 && m.selectedIdx < len(m.report.Checks) {
		return &m.report.Checks[m.selectedIdx]
	}
	return nil
}

// Report returns the current diagnostic report.
func (m Model) Report() system.DoctorReport {
	return m.report
}

// StatusMessage returns the current transient status message/toast.
func (m Model) StatusMessage() string {
	return m.statusMessage
}

// Refresh re-runs the diagnostics engine asynchronously.
func (m *Model) Refresh() tea.Cmd {
	repoRoot := m.repoRoot
	m.isScanning = true

	return func() tea.Msg {
		rep := system.RunDiagnostics(repoRoot)
		return DoctorRefreshedMsg{
			Report: rep,
		}
	}
}

// Update handles messages and updates the model state.
func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case DoctorRefreshedMsg:
		m.isScanning = false
		m.report = msg.Report
		if m.selectedIdx >= len(m.report.Checks) && len(m.report.Checks) > 0 {
			m.selectedIdx = len(m.report.Checks) - 1
		}
		m.statusMessage = fmt.Sprintf("✓ Diagnósticos actualizados (%s: %d OK, %d avisos, %d errores)",
			m.report.Status(), m.report.TotalPassed, m.report.TotalWarnings, m.report.TotalErrors)
		return m, nil

	case tea.KeyMsg:
		switch msg.String() {
		case "up", "k":
			if m.selectedIdx > 0 {
				m.selectedIdx--
				m.statusMessage = ""
			}
			return m, nil

		case "down", "j":
			if m.selectedIdx < len(m.report.Checks)-1 {
				m.selectedIdx++
				m.statusMessage = ""
			}
			return m, nil

		case "home", "g":
			m.selectedIdx = 0
			m.statusMessage = ""
			return m, nil

		case "end", "G":
			if len(m.report.Checks) > 0 {
				m.selectedIdx = len(m.report.Checks) - 1
				m.statusMessage = ""
			}
			return m, nil

		case "1", "2", "3", "4", "5", "6", "7", "8", "9":
			num, err := strconv.Atoi(msg.String())
			if err == nil {
				targetIdx := num - 1
				if targetIdx >= 0 && targetIdx < len(m.report.Checks) {
					m.selectedIdx = targetIdx
					m.statusMessage = ""
				} else if targetIdx >= len(m.report.Checks) && len(m.report.Checks) > 0 {
					m.selectedIdx = len(m.report.Checks) - 1
					m.statusMessage = ""
				}
			}
			return m, nil

		case "r", "enter":
			return m, m.Refresh()
		}
	}

	return m, nil
}

// View renders the Elm view for the System Doctor tab.
func (m Model) View() string {
	boxWidth := m.width - 4
	if boxWidth < 30 {
		boxWidth = 30
	}

	// 1. Health Summary Banner
	banner := renderHealthBanner(m.report, boxWidth)

	// 2. Responsive Split Layout (Checklist + Detail Card)
	var mainLayout string
	if boxWidth >= 70 {
		listWidth := 40
		if boxWidth >= 100 {
			listWidth = 44
		}
		detailWidth := boxWidth - listWidth - 2

		listCard := renderChecklist(m.report.Checks, m.selectedIdx, listWidth)
		detailCard := renderCheckDetail(m.SelectedCheck(), detailWidth)

		mainLayout = lipgloss.JoinHorizontal(lipgloss.Top, listCard, " ", detailCard)
	} else {
		listCard := renderChecklist(m.report.Checks, m.selectedIdx, boxWidth)
		detailCard := renderCheckDetail(m.SelectedCheck(), boxWidth)

		mainLayout = lipgloss.JoinVertical(lipgloss.Left, listCard, detailCard)
	}

	elements := []string{banner, mainLayout}
	if m.statusMessage != "" {
		toastStyle := lipgloss.NewStyle().
			Foreground(theme.ColorSuccess).
			Bold(true).
			Padding(0, 1)
		elements = append(elements, toastStyle.Render(m.statusMessage))
	}

	return lipgloss.JoinVertical(lipgloss.Left, elements...)
}
