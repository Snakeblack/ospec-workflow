package theme

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

var (
	StyleActiveTab   = lipgloss.NewStyle().Bold(true).Foreground(ColorPrimary).Padding(0, 1)
	StyleInactiveTab = lipgloss.NewStyle().Foreground(ColorSubdued).Padding(0, 1)
	StyleBox         = lipgloss.NewStyle().BorderStyle(lipgloss.RoundedBorder()).BorderForeground(ColorSubdued)
	StyleBadgeLabel  = lipgloss.NewStyle().Foreground(ColorFgMuted)
	StyleBadgeVal    = lipgloss.NewStyle().Bold(true).Foreground(ColorAccent)
	StyleFooter      = lipgloss.NewStyle().Foreground(ColorFgMuted).Padding(0, 1)
	StyleKeyHint     = lipgloss.NewStyle().Bold(true).Foreground(ColorPrimary)
)

var TabTitles = []string{
	"Dashboard",
	"Models Hub",
	"Targets Manager",
	"System Doctor",
}

// RenderBadge renders a metadata badge with a label and styled value.
func RenderBadge(label, val string, valStyle lipgloss.Style) string {
	lbl := StyleBadgeLabel.Render(label + ":")
	v := valStyle.Render(val)
	return fmt.Sprintf("[%s %s]", lbl, v)
}

// RenderTabBar renders the horizontal tab bar with active tab highlighted.
func RenderTabBar(activeTab int, width int) string {
	var tabs []string
	for i, title := range TabTitles {
		num := fmt.Sprintf("%d", i+1)
		tabText := fmt.Sprintf("%s %s", num, title)
		if i == activeTab {
			renderedTab := StyleActiveTab.
				Border(lipgloss.NormalBorder(), false, false, true, false).
				BorderForeground(ColorPrimary).
				Render(tabText)
			tabs = append(tabs, renderedTab)
		} else {
			renderedTab := StyleInactiveTab.Render(tabText)
			tabs = append(tabs, renderedTab)
		}
	}
	return lipgloss.JoinHorizontal(lipgloss.Top, tabs...)
}

// RenderFooter renders the bottom bar with keybinding hints.
func RenderFooter(activeTab int, width int) string {
	sep := StyleBadgeLabel.Render(" • ")
	hints := []string{
		fmt.Sprintf("%s %s", StyleKeyHint.Render("1-4/Tab"), "Switch Tab"),
		fmt.Sprintf("%s %s", StyleKeyHint.Render("?"), "Help"),
		fmt.Sprintf("%s %s", StyleKeyHint.Render("q"), "Quit"),
	}
	content := strings.Join(hints, sep)
	if width > 0 {
		return StyleFooter.Width(width).Render(content)
	}
	return StyleFooter.Render(content)
}
