package art

import (
	"os"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// Grayscale Lip Gloss styles for shaded octopus pixel-art
var (
	StyleOctoDark      = lipgloss.NewStyle().Foreground(lipgloss.Color("238")) // Deep Gray (#444444)
	StyleOctoMid       = lipgloss.NewStyle().Foreground(lipgloss.Color("244")) // Mid Slate Gray (#808080)
	StyleOctoLight     = lipgloss.NewStyle().Foreground(lipgloss.Color("250")) // Light Gray (#BCBCBC)
	StyleOctoWhite     = lipgloss.NewStyle().Foreground(lipgloss.Color("255")).Bold(true) // Bright White (#EEEEEE)
	StyleOctoEye       = lipgloss.NewStyle().Foreground(lipgloss.Color("#00D7D7")).Bold(true) // Cyan Eye (#00D7D7)
	StyleOctoCyanGlow  = lipgloss.NewStyle().Foreground(lipgloss.Color("#00D7D7"))
)

// IsNoColor returns true if the environment forbids ANSI color or uses a dumb terminal.
func IsNoColor() bool {
	if os.Getenv("NO_COLOR") != "" {
		return true
	}
	if os.Getenv("TERM") == "dumb" {
		return true
	}
	return false
}

// RenderOctopus renders the compact shaded octopus pixel-art.
// If NO_COLOR is active, it degrades cleanly to ASCII/text fallback.
func RenderOctopus() string {
	if IsNoColor() {
		return RenderOctopusNoColor()
	}
	return RenderOctopusShaded()
}

// RenderOctopusShaded renders the multi-tone grayscale shaded octopus with cyan eye highlights.
func RenderOctopusShaded() string {
	l1 := lipgloss.JoinHorizontal(lipgloss.Top,
		StyleOctoDark.Render("   ▄▄"),
		StyleOctoLight.Render("████"),
		StyleOctoDark.Render("▄▄   "),
	)
	l2 := lipgloss.JoinHorizontal(lipgloss.Top,
		StyleOctoMid.Render("  █▓▓"),
		StyleOctoWhite.Render("▀██▀"),
		StyleOctoMid.Render("▓▓█  "),
	)
	l3 := lipgloss.JoinHorizontal(lipgloss.Top,
		StyleOctoMid.Render(" █▒ "),
		StyleOctoEye.Render("●"),
		StyleOctoLight.Render("  "),
		StyleOctoEye.Render("●"),
		StyleOctoMid.Render(" ▒█ "),
	)
	l4 := lipgloss.JoinHorizontal(lipgloss.Top,
		StyleOctoDark.Render("  ▀█▄▄"),
		StyleOctoCyanGlow.Render("  "),
		StyleOctoDark.Render("▄▄█▀  "),
	)
	l5 := lipgloss.JoinHorizontal(lipgloss.Top,
		StyleOctoMid.Render("   █ █"),
		StyleOctoLight.Render("  "),
		StyleOctoMid.Render("█ █   "),
	)

	return lipgloss.JoinVertical(lipgloss.Left, l1, l2, l3, l4, l5)
}

// RenderOctopusNoColor renders the plain ASCII/text fallback.
func RenderOctopusNoColor() string {
	lines := []string{
		"  .---.  ",
		" ( o o ) ",
		"  ) : (  ",
		" / \\ / \\ ",
	}
	return strings.Join(lines, "\n")
}
