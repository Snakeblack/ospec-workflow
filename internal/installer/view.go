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

const modelHelp = "↑/↓ fase · ←/→ modelo · Escribir buscar · Enter control/revisar · Esc atrás · Ctrl+C salir"

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
	case presetsScreen:
		return m.presetsView()
	case modelsScreen:
		return m.modelsView()
	case controlsScreen:
		return m.controlsView()
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
		// Reserve wrapped help, the selected model and an optional search query.
		width := max(1, min(m.width, 88)-4)
		if m.width < 40 {
			width = max(1, m.width-2)
		}
		footer := wrappedHelpLines(modelHelp, width)
		reserved := 8 + len(footer)
		if target, ok := m.target(); ok && m.agentIndex < len(target.Agents) {
			agent := target.Agents[m.agentIndex]
			reserved += len(strings.Split(ansi.Wrap(m.agentLabel(target, agent), max(1, width-2), ""), "\n"))
			if m.queries[target.ID][agent.ID] != "" {
				reserved++
			}
		}
		rows = max(1, m.height-reserved)
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
func (m Model) presetsView() string {
	target, _ := m.target()
	lines := []string{}
	total := len(target.Presets) + 1
	start, end := m.window(total, m.choiceIndex)
	for i := start; i < end; i++ {
		label := "Personalizar por fase"
		if i < len(target.Presets) {
			label = target.Presets[i].Label
		}
		lines = append(lines, m.option(label, "", i == m.choiceIndex))
	}
	if end-start < total {
		lines = append(lines, windowNote(start, end, total))
	}
	return m.frame("Configuración para "+target.Label, "Un punto de partida. Tú eliges el detalle.", lines, "↑/↓ mover · Enter continuar · Esc atrás", 2)
}
func (m Model) modelsView() string {
	target, ok := m.target()
	if !ok {
		return m.targetsView()
	}
	lines := []string{}
	start, end := m.window(len(target.Agents), m.agentIndex)
	for i := start; i < end; i++ {
		agent := target.Agents[i]
		lines = append(lines, m.option(agent.ID, m.agentLabel(target, agent), i == m.agentIndex))
	}
	if end-start < len(target.Agents) {
		lines = append(lines, windowNote(start, end, len(target.Agents)))
	}
	if m.agentIndex < len(target.Agents) {
		agent := target.Agents[m.agentIndex]
		width := max(1, min(m.width, 88)-6)
		if m.width < 40 {
			width = max(1, m.width-4)
		}
		for _, line := range strings.Split(ansi.Wrap(m.agentLabel(target, agent), width, ""), "\n") {
			lines = append(lines, "  "+focusStyle.Render(line))
		}
		if query := m.queries[target.ID][agent.ID]; query != "" {
			lines = append(lines, mutedStyle.Render("  buscar: "+query))
		}
	}
	return m.frame("Fases para "+target.Label, "Un modelo para cada momento.", lines, modelHelp, 2)
}
func (m Model) controlsView() string {
	target, _ := m.target()
	agent := target.Agents[m.agentIndex]
	control := m.controlFor(target, agent)
	selected := m.selections[target.ID][agent.ID].Controls[m.activeControl]
	focus := 0
	for i, value := range control.Values {
		if value == selected {
			focus = i
		}
	}
	start, end := m.window(len(control.Values), focus)
	lines := []string{}
	for _, value := range control.Values[start:end] {
		lines = append(lines, m.option(value, "", value == selected))
	}
	if end-start < len(control.Values) {
		lines = append(lines, windowNote(start, end, len(control.Values)))
	}
	return m.frame("Control compatible", agent.ID+" · "+m.activeControl, lines, "↑/↓ mover · Enter volver · Esc atrás", 2)
}
func (m Model) reviewView() string {
	target, ok := m.target()
	if !ok {
		return m.targetsView()
	}
	lines := []string{}
	if target.Inherited {
		lines = append(lines, mutedStyle.Render("Heredado del host"))
	}
	for _, agent := range target.Agents {
		width := max(1, min(m.width, 88)-6)
		if m.width < 40 {
			width = max(1, m.width-4)
		}
		for _, line := range strings.Split(ansi.Wrap(agent.ID+"  "+m.agentLabel(target, agent), width, ""), "\n") {
			lines = append(lines, "  "+line)
		}
	}
	lines = append(lines, "", m.option("Volver", "", m.reviewBackFocused)+"    "+m.option("Instalar", "", !m.reviewBackFocused))
	return m.frame("Revisar instalación", target.Label+" · "+m.mode, lines, "←/→ elegir · Enter confirmar · Esc atrás · q salir", 3)
}
func (m Model) agentLabel(target Target, agent Agent) string {
	if agent.Inherited || !agent.Selectable {
		return "Heredado"
	}
	selection := m.selections[target.ID][agent.ID]
	for _, choice := range agent.Choices {
		if choice.ID == selection.ChoiceID {
			parts := []string{choice.Label}
			for name, value := range selection.Controls {
				parts = append(parts, fmt.Sprintf("%s=%s", name, value))
			}
			return strings.Join(parts, " · ")
		}
	}
	return "Sin opción"
}
func help(text string) string  { return mutedStyle.Render(text) }
func (m Model) String() string { return fmt.Sprintf("installer screen %d", m.screen) }
