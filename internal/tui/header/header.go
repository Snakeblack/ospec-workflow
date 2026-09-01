package header

import (
	"github.com/charmbracelet/lipgloss"
	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
)

const MinStandardWidth = 75

type Model struct {
	width        int
	version      string
	activePreset string
	gitBranch    string
}

// New creates a new Header Model with version, preset, and git branch metadata.
func New(version, activePreset, gitBranch string) Model {
	return Model{
		version:      version,
		activePreset: activePreset,
		gitBranch:    gitBranch,
		width:        80,
	}
}

// SetWidth updates the viewport width for responsive rendering.
func (m *Model) SetWidth(w int) {
	m.width = w
}

// SetPreset updates the active preset displayed in the header badge.
func (m *Model) SetPreset(preset string) {
	m.activePreset = preset
}

// Width returns the current stored viewport width.
func (m Model) Width() int {
	return m.width
}

// RenderBanner renders the sleek minimalist title banner.
func (m Model) RenderBanner() string {
	if m.width < MinStandardWidth {
		return lipgloss.NewStyle().
			Bold(true).
			Foreground(theme.ColorPrimary).
			Render("🐙 OSPEC")
	}
	return lipgloss.NewStyle().
		Bold(true).
		Foreground(theme.ColorPrimary).
		Render("🐙 OSPEC WORKFLOW  •  SDD")
}

// RenderBadges renders dynamic metadata badges for version, preset, and branch.
func (m Model) RenderBadges() string {
	bVersion := theme.RenderBadge("ver", m.version, theme.StyleBadgeVal)
	bPreset := theme.RenderBadge("preset", m.activePreset, lipgloss.NewStyle().Bold(true).Foreground(theme.ColorAccent))
	bBranch := theme.RenderBadge("branch", m.gitBranch, lipgloss.NewStyle().Bold(true).Foreground(theme.ColorSuccess))

	return lipgloss.JoinHorizontal(lipgloss.Top, bVersion, " ", bPreset, " ", bBranch)
}

// View renders the complete minimalist header component in a single clean line.
func (m Model) View() string {
	banner := m.RenderBanner()
	badges := m.RenderBadges()

	return lipgloss.JoinHorizontal(lipgloss.Center, banner, "  ", badges)
}


