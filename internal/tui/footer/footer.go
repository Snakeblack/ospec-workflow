package footer

import (
	"fmt"
	"strings"

	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
)

type Hint struct {
	Key  string
	Desc string
}

func GetTabHints(activeTab int, compact bool) []Hint {
	if compact {
		switch activeTab {
		case 1:
			return []Hint{
				{Key: "↑/↓", Desc: "Mover"},
				{Key: "Enter", Desc: "Continuar"},
				{Key: "Esc", Desc: "Atrás"},
			}
		case 2:
			return []Hint{
				{Key: "1-3", Desc: "Vista"},
				{Key: "Enter", Desc: "Configurar"},
				{Key: "clic", Desc: "Elegir"},
			}
		default:
			return []Hint{
				{Key: "1-4", Desc: "Menú"},
				{Key: "?", Desc: "Ayuda"},
				{Key: "q", Desc: "Salir"},
			}
		}
	}

	switch activeTab {
	case 0:
		return []Hint{
			{Key: "1-4/Enter/clic", Desc: "Acciones"},
			{Key: "Tab", Desc: "Pestaña"},
			{Key: "?", Desc: "Ayuda"},
			{Key: "q", Desc: "Salir"},
		}
	case 1:
		return []Hint{
			{Key: "↑/↓", Desc: "Elegir"},
			{Key: "Enter/clic", Desc: "Continuar"},
			{Key: "Espacio", Desc: "Marcar"},
			{Key: "Esc", Desc: "Atrás"},
			{Key: "?", Desc: "Ayuda"},
		}
	case 2:
		return []Hint{
			{Key: "1", Desc: "Presets"},
			{Key: "2", Desc: "Agentes"},
			{Key: "3", Desc: "Clientes"},
			{Key: "Enter", Desc: "Configurar"},
			{Key: "a", Desc: "Aplicar"},
			{Key: "?", Desc: "Ayuda"},
		}
	default:
		return []Hint{
			{Key: "Esc", Desc: "Inicio"},
			{Key: "?", Desc: "Ayuda"},
			{Key: "q", Desc: "Salir"},
		}
	}
}

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
