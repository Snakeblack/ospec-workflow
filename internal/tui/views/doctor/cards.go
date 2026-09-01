package doctor

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/snakeblack/ospec-workflow/internal/system"
	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
)

func renderHealthBanner(report system.DoctorReport, width int) string {
	if width < 20 {
		width = 20
	}

	var statusBadge string
	switch report.Status() {
	case "Healthy":
		statusBadge = lipgloss.NewStyle().
			Bold(true).
			Foreground(theme.ColorBg).
			Background(theme.ColorSuccess).
			Padding(0, 1).
			Render("✓ ALL SYSTEMS HEALTHY")
	case "Degraded":
		statusBadge = lipgloss.NewStyle().
			Bold(true).
			Foreground(theme.ColorBg).
			Background(theme.ColorWarning).
			Padding(0, 1).
			Render("⚠ ENVIRONMENT DEGRADED")
	case "Critical":
		statusBadge = lipgloss.NewStyle().
			Bold(true).
			Foreground(theme.ColorBg).
			Background(lipgloss.Color("#FF5555")).
			Padding(0, 1).
			Render("✗ CRITICAL ISSUES DETECTED")
	default:
		statusBadge = report.Status()
	}

	title := theme.StyleCardHeader.Render("SYSTEM DOCTOR & DIAGNÓSTICO")
	headerLine := fmt.Sprintf("%s   %s", title, statusBadge)

	// Metric Badges
	badgeTotal := theme.RenderBadge("Total", fmt.Sprintf("%d", len(report.Checks)), theme.StyleValueAccent)
	badgePassed := theme.RenderBadge("Passed", fmt.Sprintf("%d", report.TotalPassed), theme.StyleValueSuccess)
	badgeWarn := theme.RenderBadge("Warnings", fmt.Sprintf("%d", report.TotalWarnings), theme.StyleValueWarning)
	badgeErr := theme.RenderBadge("Errors", fmt.Sprintf("%d", report.TotalErrors), lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#FF5555")))
	badgeTime := theme.RenderBadge("Escaneo", report.Timestamp.Format("15:04:05"), theme.StyleValueMuted)

	metricsLine := fmt.Sprintf("%s  %s  %s  %s  %s", badgeTotal, badgePassed, badgeWarn, badgeErr, badgeTime)

	content := strings.Join([]string{headerLine, metricsLine}, "\n")
	return theme.StyleCard.
		Width(width - 2).
		Padding(0, 1).
		Render(content)
}

func renderChecklist(checks []system.DoctorCheck, selectedIdx int, width int) string {
	if width < 10 {
		width = 10
	}

	header := theme.StyleCardHeader.Render("CHEQUEOS DEL SISTEMA")

	var rows []string
	rows = append(rows, header)

	maxNameLen := width - 15
	if maxNameLen < 12 {
		maxNameLen = 12
	}

	for i, c := range checks {
		numStr := fmt.Sprintf("[%d]", i+1)
		badge := SeverityBadge(c.Severity)

		cursor := "  "
		isSel := i == selectedIdx
		if isSel {
			cursor = theme.StyleKeyHint.Render("▶ ")
		}

		displayName := c.Name
		if len(displayName) > maxNameLen {
			displayName = displayName[:maxNameLen-1] + "…"
		}

		line := fmt.Sprintf("%s%s %-*s %s", cursor, theme.StyleLabel.Render(numStr), maxNameLen, displayName, badge)
		if isSel {
			line = lipgloss.NewStyle().
				Bold(true).
				Foreground(theme.ColorPrimary).
				Render(fmt.Sprintf("%s%s %-*s %s", cursor, numStr, maxNameLen, displayName, badge))
		}

		rows = append(rows, line)
	}

	return theme.StyleCard.
		Width(width - 2).
		Padding(0, 1).
		Render(strings.Join(rows, "\n"))
}

func renderCheckDetail(check *system.DoctorCheck, width int) string {
	if check == nil {
		return ""
	}
	if width < 15 {
		width = 15
	}

	// 1. Header Line
	headerTitle := theme.StyleCardHeaderAccent.Render("DIAGNÓSTICO: " + check.Name)
	headerMeta := theme.StyleLabel.Render(fmt.Sprintf("(ID: %s)", check.ID))
	badge := SeverityBadge(check.Severity)
	catBadge := CategoryBadge(check.Category)
	headerLine := fmt.Sprintf("%s %s  %s %s", headerTitle, headerMeta, catBadge, badge)

	// 2. Summary Message
	msgBlock := fmt.Sprintf("%s %s", theme.StyleLabel.Render("Estado:"), theme.StyleValue.Render(check.Message))

	// 3. Technical Details / Evidence
	detailsText := check.Details
	if detailsText == "" {
		detailsText = "(sin detalles adicionales)"
	}
	detailsBlock := fmt.Sprintf("%s %s", theme.StyleLabel.Render("Evidencia técnica:"), theme.StyleValue.Render(detailsText))

	// 4. Remediation Advice
	remedyText := check.Remediation
	if remedyText == "" || remedyText == "None" {
		remedyText = "Ninguna acción requerida. El componente opera dentro de los parámetros esperados."
	}
	remedyBlock := fmt.Sprintf("%s %s", theme.StyleCardHeaderWarning.Render("💡 Recomendación de remediación:"), theme.StyleValuePrimary.Render(remedyText))

	content := strings.Join([]string{
		headerLine,
		msgBlock,
		detailsBlock,
		remedyBlock,
	}, "\n")

	return theme.StyleCard.
		Width(width - 2).
		Padding(0, 1).
		Render(content)
}

func renderHelpBar(width int) string {
	sep := theme.StyleBadgeLabel.Render(" • ")
	hints := []string{
		fmt.Sprintf("%s %s", theme.StyleKeyHint.Render("↑/↓ / j/k"), "Navegar"),
		fmt.Sprintf("%s %s", theme.StyleKeyHint.Render("1-9"), "Selección"),
		fmt.Sprintf("%s %s", theme.StyleKeyHint.Render("r / Enter"), "Re-escanear"),
		fmt.Sprintf("%s %s", theme.StyleKeyHint.Render("1-4 / Tab"), "Vistas"),
	}
	content := strings.Join(hints, sep)
	if width > 0 {
		return theme.StyleFooter.Width(width).Render(content)
	}
	return theme.StyleFooter.Render(content)
}

