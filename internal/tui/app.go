package tui

import (
	"fmt"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/snakeblack/ospec-workflow/internal/tui/header"
	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
)

type TabID int

const (
	TabDashboard TabID = iota
	TabModels
	TabTargets
	TabDoctor
	tabCount // 4
)

func (t TabID) Title() string {
	switch t {
	case TabDashboard:
		return "Dashboard"
	case TabModels:
		return "Models Hub"
	case TabTargets:
		return "Targets Manager"
	case TabDoctor:
		return "System Doctor"
	default:
		return "Unknown"
	}
}

type AppModel struct {
	activeTab TabID
	width     int
	height    int
	header    header.Model
	quitting  bool
	ready     bool
}

// NewAppModel creates a new root Elm AppModel initialized to the Dashboard tab.
func NewAppModel() AppModel {
	return AppModel{
		activeTab: TabDashboard,
		header:    header.New("v2.56.0", "Default", "main"),
	}
}

func (m AppModel) Init() tea.Cmd {
	return nil
}

func (m AppModel) ActiveTab() TabID {
	return m.activeTab
}

func (m AppModel) Width() int {
	return m.width
}

func (m AppModel) Height() int {
	return m.height
}

func (m AppModel) IsQuitting() bool {
	return m.quitting
}

func (m AppModel) IsReady() bool {
	return m.ready
}

func (m AppModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "q", "ctrl+c":
			m.quitting = true
			return m, tea.Quit
		case "1":
			m.activeTab = TabDashboard
		case "2":
			m.activeTab = TabModels
		case "3":
			m.activeTab = TabTargets
		case "4":
			m.activeTab = TabDoctor
		case "tab":
			m.activeTab = (m.activeTab + 1) % tabCount
		case "shift+tab", "backtab":
			m.activeTab = (m.activeTab + tabCount - 1) % tabCount
		}
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		m.header.SetWidth(msg.Width)
		m.ready = true
	}
	return m, nil
}

func (m AppModel) renderViewContent() string {
	title := lipgloss.NewStyle().
		Bold(true).
		Foreground(theme.ColorPrimary).
		Render(m.activeTab.Title())

	desc := lipgloss.NewStyle().
		Foreground(theme.ColorFgMuted).
		Render(fmt.Sprintf("Interactive view for %s (Milestone 1 Scaffolding)", m.activeTab.Title()))

	content := lipgloss.JoinVertical(lipgloss.Left, title, "\n", desc)

	boxWidth := m.width - 4
	if boxWidth < 20 {
		boxWidth = 20
	}

	return theme.StyleBox.
		Width(boxWidth).
		Padding(1, 2).
		Render(content)
}

func (m AppModel) View() string {
	if m.quitting {
		return "Goodbye!\n"
	}
	if !m.ready {
		return "Initializing...\n"
	}

	headerView := m.header.View()
	tabBar := theme.RenderTabBar(int(m.activeTab), m.width)
	body := m.renderViewContent()
	footer := theme.RenderFooter(int(m.activeTab), m.width)

	return lipgloss.JoinVertical(
		lipgloss.Left,
		headerView,
		"\n",
		tabBar,
		"\n",
		body,
		"\n",
		footer,
	)
}
