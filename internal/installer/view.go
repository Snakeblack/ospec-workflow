package installer

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

var (
	titleStyle = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("#4C89A8"))
	focusStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#4C89A8"))
	mutedStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#7A7A7A"))
)

func (m Model) View() string {
	switch m.screen {
	case targetsScreen:
		return m.targetsView()
	case modelsScreen:
		return m.modelsView()
	case customModelScreen:
		return m.customModelView()
	case reviewScreen:
		return m.reviewView()
	case installingScreen:
		return titleStyle.Render("Instalando…") + "\n\n" + mutedStyle.Render("La instalación está en curso.") + "\n"
	default:
		return m.menuView()
	}
}

func (m Model) menuView() string {
	if len(m.plan.Targets) == 0 {
		return titleStyle.Render("Instalador de OSpec") + "\n\n" + mutedStyle.Render("No hay destinos disponibles.") + "\n\n" + help("q salir")
	}
	return titleStyle.Render("Instalador de OSpec") + "\n\n" + focusStyle.Render("› Configurar un destino") + "\n\n" + help("Enter continuar · q salir")
}

func (m Model) targetsView() string {
	lines := []string{titleStyle.Render("Elige un destino"), ""}
	end := min(len(m.plan.Targets), m.targetOffset+m.visibleRows())
	for index := m.targetOffset; index < end; index++ {
		target := m.plan.Targets[index]
		prefix := "  "
		if index == m.targetIndex {
			prefix = focusStyle.Render("› ")
		}
		line := target.Label
		if target.InstallDescription != "" {
			line += "  " + target.InstallDescription
		}
		lines = append(lines, prefix+m.truncate(line))
	}
	return strings.Join(lines, "\n") + "\n\n" + help("↑/↓ mover · Enter continuar · Esc atrás · q salir")
}

func (m Model) modelsView() string {
	target, ok := m.target()
	if !ok {
		return m.targetsView()
	}
	lines := []string{titleStyle.Render("Modelos para " + target.Label), ""}
	end := min(len(target.Agents), m.agentOffset+m.visibleRows())
	for index := m.agentOffset; index < end; index++ {
		agent := target.Agents[index]
		prefix := "  "
		if index == m.agentIndex {
			prefix = focusStyle.Render("› ")
		}
		lines = append(lines, prefix+m.truncate(agent.ID+"  "+m.agentLabel(target, agent)))
	}
	helpText := "↑/↓ mover · ←/→ modelo"
	if target.AllowCustom {
		helpText += " · c personalizar"
	}
	if target.ID == "codex" {
		helpText += " · e esfuerzo"
	}
	helpText += " · Enter revisar · Esc atrás · q salir"
	return strings.Join(lines, "\n") + "\n\n" + help(helpText)
}

func (m Model) customModelView() string {
	target, _ := m.target()
	lines := []string{
		titleStyle.Render("Modelo personalizado para " + m.customAgentID),
		"",
		mutedStyle.Render("Destino: " + target.Label),
		mutedStyle.Render("Escribe el nombre del modelo y pulsa Enter:"),
		"",
		focusStyle.Render("› ") + m.customInput + focusStyle.Render("█"),
	}
	return strings.Join(lines, "\n") + "\n\n" + help("Enter confirmar · Esc cancelar · Ctrl+U borrar")
}

func (m Model) reviewView() string {
	target, ok := m.target()
	if !ok {
		return m.targetsView()
	}
	lines := []string{titleStyle.Render("Revisar instalación"), mutedStyle.Render(target.Label), ""}
	end := min(len(target.Agents), m.reviewOffset+m.visibleRows())
	for index := m.reviewOffset; index < end; index++ {
		agent := target.Agents[index]
		lines = append(lines, m.truncate(agent.ID+"  "+m.agentLabel(target, agent)))
	}
	back, install := "  Volver", "  Instalar"
	if m.reviewBackFocused {
		back = focusStyle.Render("› Volver")
	} else {
		install = focusStyle.Render("› Instalar")
	}
	lines = append(lines, "", back+"    "+install)
	return strings.Join(lines, "\n") + "\n\n" + help("←/→ elegir · Enter confirmar · Esc atrás · q salir")
}

func (m Model) agentLabel(target Target, agent Agent) string {
	if agent.Inherited || !agent.Selectable {
		return "Heredado"
	}
	selected := m.selections[target.ID][agent.ID]
	for _, choice := range agent.Choices {
		if choice.ID == selected {
			return choice.Label
		}
	}
	return "Sin opción"
}

func help(text string) string { return mutedStyle.Render(text) }

func min(left, right int) int {
	if left < right {
		return left
	}
	return right
}

func (m Model) truncate(text string) string {
	if m.width <= 0 || lipgloss.Width(text) <= m.width {
		return text
	}
	limit := max(1, m.width-1)
	var kept []rune
	for _, character := range text {
		if lipgloss.Width(string(append(kept, character))) > limit {
			break
		}
		kept = append(kept, character)
	}
	return string(kept) + "…"
}

func (m Model) String() string { return fmt.Sprintf("installer screen %d", m.screen) }
