package doctor

import (
	"fmt"

	"github.com/charmbracelet/lipgloss"
	"github.com/snakeblack/ospec-workflow/internal/system"
	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
)

// DoctorRefreshedMsg is dispatched upon completion of diagnostics execution.
type DoctorRefreshedMsg struct {
	Report system.DoctorReport
}

// DoctorSelectedMsg is dispatched when the user moves the selection cursor.
type DoctorSelectedMsg struct {
	Index int
	Check system.DoctorCheck
}

// SeverityBadge returns a styled Lip Gloss badge representation for check severity.
func SeverityBadge(severity system.CheckSeverity) string {
	switch severity {
	case system.SeverityOK:
		return theme.StyleValueSuccess.Render("✓ OK")
	case system.SeverityWarning:
		return theme.StyleValueWarning.Render("⚠ AVISO")
	case system.SeverityError:
		return lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#FF5555")).Render("✗ ERROR")
	default:
		return string(severity)
	}
}

// CategoryBadge returns a formatted label for the diagnostic check category.
func CategoryBadge(cat system.CheckCategory) string {
	return theme.StyleBadgeLabel.Render(fmt.Sprintf("[%s]", string(cat)))
}
