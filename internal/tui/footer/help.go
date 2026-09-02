package footer

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
)

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
		Render("Ayuda — ospec")

	secGlobal := fmt.Sprintf(
		"%s: %s | %s | %s | %s",
		theme.StyleCardHeaderAccent.Render("Navegación"),
		fmt.Sprintf("%s pestañas", theme.StyleKeyHint.Render("Tab")),
		fmt.Sprintf("%s Inicio / Instalar / Modelos", theme.StyleKeyHint.Render("1-3")),
		fmt.Sprintf("%s esta ayuda", theme.StyleKeyHint.Render("?")),
		fmt.Sprintf("%s salir", theme.StyleKeyHint.Render("q")),
	)

	secHome := fmt.Sprintf("  • %s: instalar el harness, configurar modelos, actualizar.", theme.StyleValuePrimary.Render("Inicio"))
	secInstall := fmt.Sprintf("  • %s: clientes detectados → modelo de cada agente → resumen. Esc es el paso anterior. El progreso y el log se ven en pantalla.", theme.StyleValuePrimary.Render("Instalar"))
	secModels := fmt.Sprintf("  • %s: un preset es una plantilla. Eliges el cliente y el modelo de cada agente; %s aplica el preset si ese cliente ya está configurado. Subvistas: %s agentes, %s clientes.", theme.StyleValuePrimary.Render("Modelos"), theme.StyleKeyHint.Render("a"), theme.StyleKeyHint.Render("2"), theme.StyleKeyHint.Render("3"))
	secKeys := theme.StyleLabel.Render("  ospec no pide API keys. Cada cliente (VS Code, Claude, Cursor…) usa las suyas.")

	dismissTip := lipgloss.NewStyle().
		Foreground(theme.ColorSuccess).
		Bold(true).
		Render("Esc, q o Enter cierran esta ayuda.")

	modalBody := strings.Join([]string{
		title,
		secGlobal,
		secHome,
		secInstall,
		secModels,
		secKeys,
		dismissTip,
	}, "\n")

	return theme.StyleCard.
		BorderForeground(theme.ColorPrimary).
		Width(boxWidth).
		Padding(0, 1).
		Render(modalBody)
}
