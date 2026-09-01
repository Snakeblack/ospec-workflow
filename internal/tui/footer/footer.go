package footer

import (
	"fmt"
	"strings"

	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
)

// Hint represents a keybinding hint in the footer bar.
type Hint struct {
	Key  string
	Desc string
}

// GetTabHints returns the contextual shortcut hints for the specified active tab.
func GetTabHints(activeTab int, compact bool) []Hint {
	if compact {
		switch activeTab {
		case 1: // Models Hub
			return []Hint{
				{Key: "1-4", Desc: "Tabs"},
				{Key: "1-3", Desc: "Preset"},
				{Key: "Enter", Desc: "Apply"},
				{Key: "?", Desc: "Help"},
				{Key: "q", Desc: "Quit"},
			}
		case 2: // Targets Manager
			return []Hint{
				{Key: "1-4", Desc: "Tabs"},
				{Key: "s", Desc: "Sync"},
				{Key: "r", Desc: "Reload"},
				{Key: "?", Desc: "Help"},
				{Key: "q", Desc: "Quit"},
			}
		case 3: // System Doctor
			return []Hint{
				{Key: "1-4", Desc: "Tabs"},
				{Key: "r/Enter", Desc: "Re-scan"},
				{Key: "?", Desc: "Help"},
				{Key: "q", Desc: "Quit"},
			}
		default: // Dashboard or unknown
			return []Hint{
				{Key: "1-4", Desc: "Tabs"},
				{Key: "?", Desc: "Help"},
				{Key: "q", Desc: "Quit"},
			}
		}
	}

	switch activeTab {
	case 0: // Dashboard
		return []Hint{
			{Key: "1-4/Tab", Desc: "Switch Tab"},
			{Key: "?", Desc: "Help"},
			{Key: "q", Desc: "Quit"},
		}
	case 1: // Models Hub
		return []Hint{
			{Key: "1-4/Tab", Desc: "Switch Tab"},
			{Key: "↑/↓", Desc: "Navigate"},
			{Key: "1-3", Desc: "Preset"},
			{Key: "Enter", Desc: "Apply"},
			{Key: "r", Desc: "Refresh"},
			{Key: "?", Desc: "Help"},
			{Key: "q", Desc: "Quit"},
		}
	case 2: // Targets Manager
		return []Hint{
			{Key: "1-4/Tab", Desc: "Switch Tab"},
			{Key: "↑/↓", Desc: "Select"},
			{Key: "s", Desc: "Sync All"},
			{Key: "r", Desc: "Reload"},
			{Key: "?", Desc: "Help"},
			{Key: "q", Desc: "Quit"},
		}
	case 3: // System Doctor
		return []Hint{
			{Key: "1-4/Tab", Desc: "Switch Tab"},
			{Key: "↑/↓", Desc: "Select"},
			{Key: "r/Enter", Desc: "Re-scan"},
			{Key: "?", Desc: "Help"},
			{Key: "q", Desc: "Quit"},
		}
	default:
		return []Hint{
			{Key: "1-4/Tab", Desc: "Switch Tab"},
			{Key: "?", Desc: "Help"},
			{Key: "q", Desc: "Quit"},
		}
	}
}

// RenderContextualFooter renders the bottom bar with keybinding hints adapted to the active tab.
func RenderContextualFooter(activeTab int, width int) string {
	compact := width > 0 && width <= 80
	hints := GetTabHints(activeTab, compact)

	sep := theme.StyleBadgeLabel.Render(" • ")
	var renderedHints []string
	for _, h := range hints {
		renderedHints = append(renderedHints, fmt.Sprintf("%s %s", theme.StyleKeyHint.Render(h.Key), h.Desc))
	}

	content := strings.Join(renderedHints, sep)
	if width > 0 {
		return theme.StyleFooter.Width(width).Render(content)
	}
	return theme.StyleFooter.Render(content)
}
