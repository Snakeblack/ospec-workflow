package theme

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// Lipgloss styles based on the color palette.
var (
	StyleBox = lipgloss.NewStyle().
			BorderStyle(lipgloss.RoundedBorder()).
			BorderForeground(ColorSubdued).
			Background(ColorBg).
			Padding(1, 2)

	StyleCard = lipgloss.NewStyle().
			BorderStyle(lipgloss.RoundedBorder()).
			BorderForeground(ColorSubdued).
			Background(ColorBg).
			Padding(0, 1)

	StyleActiveTab = lipgloss.NewStyle().
			Bold(true).
			Foreground(ColorPrimary)

	StyleInactiveTab = lipgloss.NewStyle().
				Foreground(ColorFgMuted)

	StyleCardHeader = lipgloss.NewStyle().
			Bold(true).
			Foreground(ColorPrimary)

	StyleCardHeaderAccent = lipgloss.NewStyle().
				Bold(true).
				Foreground(ColorAccent)

	StyleCardHeaderSuccess = lipgloss.NewStyle().
				Bold(true).
				Foreground(ColorSuccess)

	StyleCardHeaderWarning = lipgloss.NewStyle().
				Bold(true).
				Foreground(ColorWarning)

	StyleLabel = lipgloss.NewStyle().
			Foreground(ColorFgMuted)

	StyleValue = lipgloss.NewStyle().
			Foreground(ColorFg)

	StyleValuePrimary = lipgloss.NewStyle().
				Foreground(ColorPrimary)

	StyleValueSuccess = lipgloss.NewStyle().
				Foreground(ColorSuccess)

	StyleValueWarning = lipgloss.NewStyle().
				Foreground(ColorWarning)

	StyleValueAccent = lipgloss.NewStyle().
				Foreground(ColorAccent)

	StyleValueMuted = lipgloss.NewStyle().
			Foreground(ColorFgMuted)

	StyleIndexTag = lipgloss.NewStyle().
			Bold(true).
			Foreground(ColorSubdued)

	StyleSelectedRow = lipgloss.NewStyle().
				Background(ColorSelected).
				Foreground(ColorFg)

	StyleBadgeLabel = lipgloss.NewStyle().
			Foreground(ColorFgMuted)

	StyleBadgeVal = lipgloss.NewStyle().
			Bold(true).
			Foreground(ColorPrimary)

	StyleKeyHint = lipgloss.NewStyle().
			Bold(true).
			Foreground(ColorPrimary)

	StyleFooter = lipgloss.NewStyle().
			Foreground(ColorFgMuted).
			Padding(0, 1)

	StyleActionBtn = lipgloss.NewStyle().
			Foreground(ColorFg).
			Background(ColorSelected).
			Padding(0, 1)

	StyleActionBtnActive = lipgloss.NewStyle().
				Bold(true).
				Foreground(ColorBg).
				Background(ColorPrimary).
				Padding(0, 1)

	StylePageCurrent = lipgloss.NewStyle().
				Bold(true).
				Foreground(ColorPrimary)

	StylePageControls = lipgloss.NewStyle().
				Foreground(ColorFgMuted)
)

var TabTitles = []string{
	"Inicio",
	"Instalar",
	"Modelos",
}

// RenderBadge formats a compact metadata badge like "[label: value]".
func RenderBadge(label, val string, valStyle lipgloss.Style) string {
	lbl := StyleBadgeLabel.Render(label + ":")
	v := valStyle.Render(val)
	return fmt.Sprintf("[%s %s]", lbl, v)
}

// RenderTabBar renders the horizontal navigation bar with an underline active indicator.
func RenderTabBar(activeTab int, width int) string {
	var tabs []string
	var underlines []string

	for i, title := range TabTitles {
		numTag := fmt.Sprintf("%d ", i+1)
		fullTitle := numTag + title

		if i == activeTab {
			tabs = append(tabs, StyleActiveTab.Render(fullTitle))
			underlines = append(underlines, StyleActiveTab.Render(strings.Repeat("─", lipgloss.Width(fullTitle))))
		} else {
			tabs = append(tabs, StyleInactiveTab.Render(fullTitle))
			underlines = append(underlines, strings.Repeat(" ", lipgloss.Width(fullTitle)))
		}
	}

	tabRow := strings.Join(tabs, "  ")
	underlineRow := strings.Join(underlines, "  ")

	tabBarContent := fmt.Sprintf(" %s\n %s", tabRow, underlineRow)

	if width > 0 {
		return lipgloss.NewStyle().Width(width).Render(tabBarContent)
	}
	return tabBarContent
}

// HitTabIndex returns the tab under (x,y) relative to the tab bar origin, or -1.
func HitTabIndex(x, y int) int {
	if y < 0 || y > 1 {
		return -1
	}
	pos := 1
	for i, title := range TabTitles {
		full := fmt.Sprintf("%d %s", i+1, title)
		w := lipgloss.Width(full)
		if x >= pos && x < pos+w {
			return i
		}
		pos += w + 2
	}
	return -1
}

// RenderFooter renders the bottom bar with global keyboard shortcuts.
func RenderFooter(activeTab int, width int) string {
	hints := []string{
		fmt.Sprintf("%s %s", StyleKeyHint.Render("1-3/Tab"), "Pestaña"),
		fmt.Sprintf("%s %s", StyleKeyHint.Render("?"), "Help"),
		fmt.Sprintf("%s %s", StyleKeyHint.Render("q"), "Quit"),
	}

	sep := StyleBadgeLabel.Render(" • ")
	content := strings.Join(hints, sep)

	if width > 0 {
		return StyleFooter.Width(width).Render(content)
	}
	return StyleFooter.Render(content)
}
