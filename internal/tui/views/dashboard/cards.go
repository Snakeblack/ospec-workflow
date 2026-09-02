package dashboard

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/snakeblack/ospec-workflow/internal/tui/art"
	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
)

func renderOctopusHero(activePreset string, targetsCount int, version string, width int) string {
	octo := art.RenderOctopus()

	title := lipgloss.NewStyle().
		Bold(true).
		Foreground(theme.ColorPrimary).
		Render("🐙 OSPEC WORKFLOW")

	tagline := theme.StyleLabel.Render("Instala el harness y configura los modelos de cada agente")

	badgePreset := theme.RenderBadge("Preset", activePreset, lipgloss.NewStyle().Bold(true).Foreground(theme.ColorAccent))
	badgeTargets := theme.RenderBadge("Targets", fmt.Sprintf("%d detectados", targetsCount), theme.StyleValueSuccess)
	badgeVer := theme.RenderBadge("Versión", version, theme.StyleBadgeVal)

	badges := lipgloss.JoinHorizontal(lipgloss.Top, badgePreset, " ", badgeTargets, " ", badgeVer)

	infoBlock := lipgloss.JoinVertical(lipgloss.Left,
		title,
		tagline,
		"\n",
		badges,
	)

	content := lipgloss.JoinHorizontal(lipgloss.Center, octo, "   ", infoBlock)

	cardWidth := width
	if cardWidth < 30 {
		cardWidth = 30
	}

	return theme.StyleCard.Width(cardWidth).Padding(1, 2).Render(content)
}

func renderMainMenu(selectedAction int, width int) (string, []dashHit) {
	header := theme.StyleCardHeader.Render("¿Qué quieres hacer?")

	actions := []struct {
		num  string
		name string
		desc string
	}{
		{"1", "Instalar ospec", "Elige clientes, el modelo de cada agente e instala el harness"},
		{"2", "Configurar modelos", "Presets (qué nivel usa cada agente) y modelos/esfuerzo por cliente"},
		{"3", "Actualizar instalación", "Resincroniza clientes ya instalados"},
		{"4", "Desinstalar", "Quita los archivos de harness de este repo"},
	}

	var rows []string
	rows = append(rows, header, "")

	for i, a := range actions {
		isSel := i == selectedAction
		prefix := "  "
		tag := theme.StyleIndexTag.Render(fmt.Sprintf("[%s]", a.num))
		title := theme.StyleValue.Render(a.name)
		desc := theme.StyleLabel.Render("— " + a.desc)

		if isSel {
			prefix = theme.StyleKeyHint.Render("▶ ")
			title = theme.StyleValuePrimary.Bold(true).Render(a.name)
		}

		line := fmt.Sprintf("%s%s %s %s", prefix, tag, title, desc)
		if isSel {
			line = lipgloss.NewStyle().
				Background(lipgloss.Color("#262626")).
				Width(width - 4).
				Render(line)
		}
		rows = append(rows, line)
	}

	hint := theme.StyleLabel.Render("\n↑/↓ elige  ·  Enter, 1-4 o clic ejecuta  ·  ?: ayuda  ·  q: salir")
	rows = append(rows, hint)

	cardWidth := width
	if cardWidth < 30 {
		cardWidth = 30
	}

	var hits []dashHit
	for i := range actions {
		hits = append(hits, dashHit{Index: i, Y: 2 + i, H: 1})
	}

	return theme.StyleCard.Width(cardWidth).Padding(0, 1).Render(strings.Join(rows, "\n")), hits
}

func renderModelProfileCard(summary ModelProfileSummary, width int) string {
	var presetColor lipgloss.Color
	switch strings.ToLower(summary.PresetName) {
	case "cheap":
		presetColor = theme.ColorSuccess
	case "premium":
		presetColor = theme.ColorAccent
	case "default":
		presetColor = theme.ColorPrimary
	default:
		presetColor = theme.ColorWarning
	}

	presetBadge := theme.RenderBadge("Preset", summary.PresetName, lipgloss.NewStyle().Bold(true).Foreground(presetColor))
	header := lipgloss.JoinHorizontal(lipgloss.Top,
		theme.StyleCardHeader.Render("🧠 MODEL PROFILE"),
		"  ",
		presetBadge,
	)

	// Target Models section
	var modelsList []string
	if summary.ClaudeModel != "" {
		modelsList = append(modelsList, fmt.Sprintf("Claude: %s", theme.StyleValueAccent.Render(summary.ClaudeModel)))
	}
	if summary.CodexModel != "" {
		modelsList = append(modelsList, fmt.Sprintf("Codex: %s", theme.StyleValue.Render(summary.CodexModel)))
	}
	if summary.OpenCodeModel != "" {
		modelsList = append(modelsList, fmt.Sprintf("OpenCode: %s", theme.StyleValue.Render(summary.OpenCodeModel)))
	}
	if summary.VSCodeModel != "" {
		modelsList = append(modelsList, fmt.Sprintf("VSCode: %s", theme.StyleValue.Render(summary.VSCodeModel)))
	}
	if summary.CursorModel != "" {
		modelsList = append(modelsList, fmt.Sprintf("Cursor: %s", theme.StyleValue.Render(summary.CursorModel)))
	}

	modelsLine := fmt.Sprintf("%s %s", theme.StyleLabel.Render("• Modelos:"), strings.Join(modelsList, " • "))

	// Key SDD agents in one line
	keyAgents := []struct {
		name  string
		label string
	}{
		{"sdd-propose", "propose"},
		{"sdd-design", "design"},
		{"sdd-apply", "apply"},
		{"sdd-verify", "verify"},
	}

	var agentParts []string
	for _, a := range keyAgents {
		tier := summary.AgentTiers[a.name]
		if tier == "" {
			tier = summary.AgentTiers["_default"]
		}
		if tier == "" {
			tier = "default"
		}
		agentParts = append(agentParts, fmt.Sprintf("%s: %s", a.label, tier))
	}
	agentsLine := fmt.Sprintf("%s %s", theme.StyleLabel.Render("• Agentes:"), strings.Join(agentParts, " • "))

	content := strings.Join([]string{
		header,
		modelsLine,
		agentsLine,
	}, "\n")

	cardWidth := width
	if cardWidth < 20 {
		cardWidth = 20
	}

	return theme.StyleCard.Width(cardWidth).Padding(0, 1).Render(content)
}

func renderTargetsCard(targets []TargetInfo, width int) string {
	configuredCount := 0
	for _, t := range targets {
		if t.Status == StatusConfigured {
			configuredCount++
		}
	}

	countBadge := theme.RenderBadge("Listos", fmt.Sprintf("%d/%d", configuredCount, len(targets)), theme.StyleValueSuccess)
	header := lipgloss.JoinHorizontal(lipgloss.Top,
		theme.StyleCardHeaderAccent.Render("🎯 AI TARGETS"),
		"  ",
		countBadge,
	)

	var targetRows []string
	for _, t := range targets {
		evidenceStr := ""
		if t.Evidence != "" {
			evidenceStr = theme.StyleLabel.Render(fmt.Sprintf(" (%s)", t.Evidence))
		}

		nameLabel := fmt.Sprintf("%-18s", t.DisplayName)
		row := fmt.Sprintf("  %s %s%s",
			theme.StyleValue.Render(nameLabel),
			t.Status.Badge(),
			evidenceStr,
		)
		targetRows = append(targetRows, row)
	}

	content := strings.Join(append([]string{header}, targetRows...), "\n")

	cardWidth := width
	if cardWidth < 20 {
		cardWidth = 20
	}

	return theme.StyleCard.Width(cardWidth).Padding(0, 1).Render(content)
}

func renderOpenSpecCard(summary OpenSpecSummary, width int) string {
	statusStyle := theme.StyleValueSuccess
	if summary.Status != "active" && summary.Status != "done" {
		statusStyle = theme.StyleValueWarning
	}

	statusBadge := theme.RenderBadge("Estado", summary.Status, statusStyle)
	header := lipgloss.JoinHorizontal(lipgloss.Top,
		theme.StyleCardHeaderSuccess.Render("📋 OPENSPEC CONTEXT"),
		"  ",
		statusBadge,
	)

	renderLayer := func(name string, enabled bool) string {
		if enabled {
			return fmt.Sprintf("%s: %s", name, theme.StyleValueSuccess.Render("✓"))
		}
		return fmt.Sprintf("%s: %s", name, theme.StyleValueMuted.Render("✗"))
	}

	layersStr := fmt.Sprintf("%s  •  %s  •  %s",
		renderLayer("Unit", summary.UnitEnabled),
		renderLayer("Integration", summary.IntEnabled),
		renderLayer("E2E", summary.E2EEnabled),
	)

	baselineBadge := theme.StyleValueSuccess.Render(summary.BaselineStatus)
	if summary.DomainsPending > 0 {
		baselineBadge = theme.StyleValueWarning.Render(summary.BaselineStatus)
	}
	baselineDetail := fmt.Sprintf("%s (%d listos, %d pendientes)", baselineBadge, summary.DomainsDone, summary.DomainsPending)

	lines := []string{
		header,
		fmt.Sprintf("%s %s (%s)  •  %s %s (%s)",
			theme.StyleLabel.Render("• Proyecto :"),
			theme.StyleValueAccent.Render(summary.ProjectName),
			theme.StyleValue.Render(summary.Version),
			theme.StyleLabel.Render("TDD:"),
			theme.StyleValuePrimary.Render(summary.TDDMode),
			theme.StyleValue.Render(fmt.Sprintf("%s - %s", summary.Runner, summary.TestCommand)),
		),
		fmt.Sprintf("%s %s",
			theme.StyleLabel.Render("• Capas    :"),
			layersStr,
		),
		fmt.Sprintf("%s %s  •  %s %d",
			theme.StyleLabel.Render("• Baseline :"),
			baselineDetail,
			theme.StyleLabel.Render("Reglas SDD:"),
			summary.RulesCount,
		),
	}

	content := strings.Join(lines, "\n")

	cardWidth := width
	if cardWidth < 20 {
		cardWidth = 20
	}

	return theme.StyleCard.Width(cardWidth).Padding(0, 1).Render(content)
}
