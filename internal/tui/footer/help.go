package footer

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
)

// RenderHelpModal renders the popup help modal dialog with formatted sections and keybindings.
func RenderHelpModal(width, height int) string {
	boxWidth := width - 6
	if boxWidth > 84 {
		boxWidth = 84
	}
	if boxWidth < 36 {
		boxWidth = 36
	}

	title := lipgloss.NewStyle().
		Bold(true).
		Foreground(theme.ColorPrimary).
		Render("📖 Help & Keybindings (ospec TUI)")

	secGlobal := fmt.Sprintf(
		"%s: %s | %s | %s | %s",
		theme.StyleCardHeaderAccent.Render("◆ Global Navigation"),
		fmt.Sprintf("%s Pestañas 1-4", theme.StyleKeyHint.Render("1-4")),
		fmt.Sprintf("%s Ciclar", theme.StyleKeyHint.Render("Tab/Shift+Tab")),
		fmt.Sprintf("%s Ayuda", theme.StyleKeyHint.Render("?")),
		fmt.Sprintf("%s Salir", theme.StyleKeyHint.Render("q")),
	)

	secViewsHeader := theme.StyleCardHeaderAccent.Render("◆ View Shortcuts:")
	secDashboard := fmt.Sprintf("  • %s: Resumen general, preset activo, targets y doctor.", theme.StyleValuePrimary.Render("Dashboard"))
	secModels := fmt.Sprintf("  • %s: %s Presets, %s Aplicar, %s Navegar/Afinar agentes.", theme.StyleValuePrimary.Render("Models Hub"), theme.StyleKeyHint.Render("1-3"), theme.StyleKeyHint.Render("Enter"), theme.StyleKeyHint.Render("↑/↓/c/d/p"))
	secTargets := fmt.Sprintf("  • %s: %s Seleccionar, %s Sincronizar target, %s Recargar.", theme.StyleValuePrimary.Render("Targets Manager"), theme.StyleKeyHint.Render("1-6/↑/↓"), theme.StyleKeyHint.Render("s/Enter"), theme.StyleKeyHint.Render("r"))
	secDoctor := fmt.Sprintf("  • %s: %s Seleccionar chequeo, %s Re-escanear diagnóstico.", theme.StyleValuePrimary.Render("System Doctor"), theme.StyleKeyHint.Render("1-9/↑/↓"), theme.StyleKeyHint.Render("r/Enter"))

	dismissTip := lipgloss.NewStyle().
		Foreground(theme.ColorSuccess).
		Bold(true).
		Render("Presiona [?], [Esc], [q] o [Enter] para Close / Cerrar.")

	modalBody := strings.Join([]string{
		title,
		secGlobal,
		secViewsHeader,
		secDashboard,
		secModels,
		secTargets,
		secDoctor,
		dismissTip,
	}, "\n")

	return theme.StyleCard.
		BorderForeground(theme.ColorPrimary).
		Width(boxWidth).
		Padding(0, 1).
		Render(modalBody)
}

