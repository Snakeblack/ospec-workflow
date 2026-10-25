package installer

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
)

var (
	titleStyle = lipgloss.NewStyle().Bold(true)
	focusStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.AdaptiveColor{Light: "#007C83", Dark: "#69D5D0"})
	mutedStyle = lipgloss.NewStyle().Foreground(lipgloss.AdaptiveColor{Light: "#626975", Dark: "#9CA6B5"})
	stepStyle  = lipgloss.NewStyle().Foreground(lipgloss.AdaptiveColor{Light: "#946000", Dark: "#E8B86D"})
)

const modelHelp = "↑/↓ tier · Escribir modelo · Retroceso borrar · Ctrl+U vaciar · Enter revisar · Esc atrás · Ctrl+C salir"

func wrappedHelpLines(hint string, width int) []string {
	lines := []string{}
	current := ""
	for _, shortcut := range strings.Split(hint, " · ") {
		if current != "" && lipgloss.Width(current+" · "+shortcut) > width {
			lines = append(lines, current)
			current = ""
		}
		if current != "" {
			current += " · "
		}
		current += shortcut
	}
	return append(lines, current)
}

func (m Model) View() string {
	switch m.screen {
	case targetsScreen:
		return m.targetsView()
	case modelsScreen:
		return m.modelsView()
	case reviewScreen:
		return m.reviewView()
	case installingScreen:
		return m.frame("Instalando…", "Tu configuración está en camino.", []string{focusStyle.Render("◌ Instalación en curso")}, "", 3)
	default:
		body := []string{m.option("Configurar un destino", "", true)}
		hint := "Enter continuar · q salir"
		if len(m.plan.Targets) == 0 {
			body = []string{"No hay destinos disponibles."}
			hint = "q salir"
		}
		return m.frame("Tu flujo, a tu manera.", "Configura el entorno de tus agentes.", body, hint, 0)
	}
}

// frame keeps the same quiet visual rhythm across the entire setup flow.
// ANSI-aware truncation preserves both terminal cell widths and color resets.
func (m Model) frame(title, subtitle string, body []string, hint string, step int) string {
	width := m.width
	if width <= 0 {
		width = 80
	}
	width = min(width, 88)
	inset := 2
	if width < 40 {
		inset = 1
	}
	available := max(1, width-2*inset)
	brand := focusStyle.Render("╰┬╯ ospec") + mutedStyle.Render(" / setup")
	progress := []string{"Inicio", "01 Destino", "02 Configuración", "03 Instalación"}[step]
	if width < 40 {
		brand = focusStyle.Render("╰┬╯ ospec")
		progress = []string{"Inicio", "01 Destino", "02 Config.", "03 Instalar"}[step]
	}
	lines := []string{brand + "  " + stepStyle.Render(progress), mutedStyle.Render(strings.Repeat("─", available)), titleStyle.Render(title)}
	if subtitle != "" {
		lines = append(lines, mutedStyle.Render(subtitle))
	}
	lines = append(lines, "")
	lines = append(lines, body...)
	if hint != "" {
		lines = append(lines, "", mutedStyle.Render(strings.Repeat("─", available)))
		// Wrap at complete shortcut boundaries so a narrow terminal keeps all keys.
		for _, line := range wrappedHelpLines(hint, available) {
			lines = append(lines, help(line))
		}
	}
	for i, line := range lines {
		lines[i] = strings.Repeat(" ", inset) + ansi.Truncate(line, available, "…")
	}
	return strings.Join(lines, "\n") + "\n"
}

func (m Model) option(label, detail string, selected bool) string {
	prefix := "  "
	if selected {
		prefix = "› "
	}
	text := prefix + label
	if selected {
		text = focusStyle.Render(text)
	}
	if detail != "" {
		text += "  " + mutedStyle.Render(detail)
	}
	return text
}

// Derive the visible window from focus rather than maintaining a second cursor.
func (m Model) window(total, focus int) (int, int) {
	rows := max(1, m.height-12)
	if m.screen == modelsScreen {
		// Reserve the wrapped help, the file note and an optional warning.
		width := max(1, min(m.width, 88)-4)
		if m.width < 40 {
			width = max(1, m.width-2)
		}
		rows = max(1, m.height-10-len(wrappedHelpLines(modelHelp, width)))
	}
	if m.height <= 0 {
		rows = 12
	}
	start := max(0, focus-rows+1)
	return start, min(total, start+rows)
}
func windowNote(start, end, total int) string {
	return mutedStyle.Render(fmt.Sprintf("  %d–%d de %d", start+1, end, total))
}

func (m Model) targetsView() string {
	lines := []string{}
	start, end := m.window(len(m.plan.Targets), m.targetIndex)
	for i := start; i < end; i++ {
		t := m.plan.Targets[i]
		lines = append(lines, m.option(t.Label, t.InstallDescription, i == m.targetIndex))
	}
	if end-start < len(m.plan.Targets) {
		lines = append(lines, windowNote(start, end, len(m.plan.Targets)))
	}
	return m.frame("Elige un destino", "Donde empieza tu flujo de trabajo.", lines, "↑/↓ mover · Enter continuar · Esc atrás · q salir", 1)
}
func (m Model) modelsView() string {
	target, ok := m.target()
	if !ok {
		return m.targetsView()
	}
	lines := []string{}
	start, end := m.window(len(target.Tiers), m.tierIndex)
	for i := start; i < end; i++ {
		tier := target.Tiers[i]
		value := m.values[target.ID][tier.ID]
		if i == m.tierIndex {
			value += "▏"
		}
		if strings.TrimSpace(value) == "" || value == "▏" {
			value += mutedStyle.Render(emptyLabel(tier))
		}
		lines = append(lines, m.option(fmt.Sprintf("%-8s", tier.ID), value, i == m.tierIndex))
		lines = append(lines, "    "+mutedStyle.Render(agentsNote(tier)))
	}
	if end-start < len(target.Tiers) {
		lines = append(lines, windowNote(start, end, len(target.Tiers)))
	}
	if m.plan.Warning != "" {
		lines = append(lines, "", stepStyle.Render("aviso: "+m.plan.Warning))
	}
	if m.plan.ModelsFile != "" {
		lines = append(lines, "", mutedStyle.Render("Se guarda en "+m.plan.ModelsFile))
	}
	return m.frame("Modelos para "+target.Label, "Escribe el modelo de cada tier, tal como lo nombra "+target.Label+".", lines, modelHelp, 2)
}
func (m Model) reviewView() string {
	target, ok := m.target()
	if !ok {
		return m.targetsView()
	}
	lines := []string{}
	if target.Inherited || len(target.Tiers) == 0 {
		lines = append(lines, mutedStyle.Render("Heredado del host"))
	}
	width := max(1, min(m.width, 88)-6)
	if m.width < 40 {
		width = max(1, m.width-4)
	}
	models := m.Models()
	for _, tier := range target.Tiers {
		value := models[tier.ID]
		if value == "" {
			value = strings.TrimSpace(emptyLabel(tier))
		}
		for _, line := range strings.Split(ansi.Wrap(fmt.Sprintf("%-8s %s · %s", tier.ID, value, agentsNote(tier)), width, ""), "\n") {
			lines = append(lines, "  "+line)
		}
	}
	hint := "←/→ elegir · Enter confirmar · Esc atrás · q salir"
	if len(m.plan.Packages) > 0 {
		lines = append(lines, "", mutedStyle.Render("Paquetes opcionales"))
		for i, item := range m.plan.Packages {
			mark := "[ ]"
			if m.packages[item.ID] {
				mark = "[x]"
			}
			lines = append(lines, fmt.Sprintf("  %s %d %s", mark, i+1, item.Label))
			if item.Description != "" {
				lines = append(lines, "      "+mutedStyle.Render(item.Description))
			}
		}
		hint = fmt.Sprintf("1-%d paquetes · ", len(m.plan.Packages)) + hint
	}
	lines = append(lines, "", m.option("Volver", "", m.reviewBackFocused)+"    "+m.option("Instalar", "", !m.reviewBackFocused))
	return m.frame("Revisar instalación", target.Label, lines, hint, 3)
}

// emptyLabel says what an unassigned tier does: Claude's alias, or inherit.
func emptyLabel(tier Tier) string {
	if tier.Fallback != "" {
		return " " + tier.Fallback + " (alias por defecto)"
	}
	return " hereda el modelo de la sesión"
}
func agentsNote(tier Tier) string {
	if len(tier.Agents) == 1 {
		return "1 agente"
	}
	return fmt.Sprintf("%d agentes", len(tier.Agents))
}
func help(text string) string  { return mutedStyle.Render(text) }
func (m Model) String() string { return fmt.Sprintf("installer screen %d", m.screen) }
