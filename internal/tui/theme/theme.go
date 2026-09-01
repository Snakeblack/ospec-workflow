package theme

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

var (
	StyleActiveTab         = lipgloss.NewStyle().Bold(true).Foreground(ColorPrimary).Padding(0, 1)
	StyleInactiveTab       = lipgloss.NewStyle().Foreground(ColorSubdued).Padding(0, 1)
	StyleBox               = lipgloss.NewStyle().BorderStyle(lipgloss.RoundedBorder()).BorderForeground(ColorSubdued)
	StyleBadgeLabel        = lipgloss.NewStyle().Foreground(ColorFgMuted)
	StyleBadgeVal          = lipgloss.NewStyle().Bold(true).Foreground(ColorAccent)
	StyleFooter            = lipgloss.NewStyle().Foreground(ColorFgMuted).Padding(0, 1)
	StyleKeyHint           = lipgloss.NewStyle().Bold(true).Foreground(ColorPrimary)
	StyleCard              = lipgloss.NewStyle().BorderStyle(lipgloss.RoundedBorder()).BorderForeground(ColorSubdued)
	StyleCardHeader        = lipgloss.NewStyle().Bold(true).Foreground(ColorPrimary)
	StyleCardHeaderAccent  = lipgloss.NewStyle().Bold(true).Foreground(ColorAccent)
	StyleCardHeaderSuccess = lipgloss.NewStyle().Bold(true).Foreground(ColorSuccess)
	StyleCardHeaderWarning = lipgloss.NewStyle().Bold(true).Foreground(ColorWarning)
	StyleLabel             = lipgloss.NewStyle().Foreground(ColorFgMuted)
	StyleValue             = lipgloss.NewStyle().Foreground(ColorFg)
	StyleValueAccent       = lipgloss.NewStyle().Bold(true).Foreground(ColorAccent)
	StyleValueSuccess      = lipgloss.NewStyle().Bold(true).Foreground(ColorSuccess)
	StyleValueWarning      = lipgloss.NewStyle().Bold(true).Foreground(ColorWarning)
	StyleValuePrimary      = lipgloss.NewStyle().Bold(true).Foreground(ColorPrimary)
	StyleValueMuted        = lipgloss.NewStyle().Foreground(ColorSubdued)
	StyleActionBtn         = lipgloss.NewStyle().Foreground(ColorFg).Background(lipgloss.Color("#262626")).Padding(0, 1)
	StyleActionBtnActive   = lipgloss.NewStyle().Background(ColorPrimary).Foreground(ColorBg).Bold(true).Padding(0, 1)
	StylePagination        = lipgloss.NewStyle().Foreground(ColorFgMuted)
	StylePageCurrent       = lipgloss.NewStyle().Bold(true).Foreground(ColorAccent)
	StylePageControls      = lipgloss.NewStyle().Foreground(ColorPrimary)
	StyleListItemSelected  = lipgloss.NewStyle().Bold(true).Foreground(ColorPrimary).Background(lipgloss.Color("#241e38")).Padding(0, 1)
	StyleListItemNormal    = lipgloss.NewStyle().Foreground(ColorFg).Padding(0, 1)
	StyleIndexTag          = lipgloss.NewStyle().Foreground(ColorAccent).Bold(true)
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
