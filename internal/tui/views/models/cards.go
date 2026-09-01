package models

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/snakeblack/ospec-workflow/internal/system"
	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
)

func renderSubNav(currentMode SubMode, width int) string {
	var tabs []string

	compact := width > 0 && width < 80
	var modes []struct {
		mode  SubMode
		label string
	}
	if compact {
		modes = []struct {
			mode  SubMode
			label string
		}{
			{ModePresets, "[1] Presets"},
			{ModeProviders, "[2] Proveedores"},
			{ModeGranular, "[3] Agentes"},
		}
	} else {
		modes = []struct {
			mode  SubMode
			label string
		}{
			{ModePresets, "[1] Presets Globales"},
			{ModeProviders, "[2] Proveedores & Local"},
			{ModeGranular, "[3] Afinamiento por Agente"},
		}
	}

	for _, m := range modes {
		if m.mode == currentMode {
			tabText := theme.StyleActiveTab.
				Border(lipgloss.NormalBorder(), false, false, true, false).
				BorderForeground(theme.ColorPrimary).
				Render(m.label)
			tabs = append(tabs, tabText)
		} else {
			tabText := theme.StyleInactiveTab.Render(m.label)
			tabs = append(tabs, tabText)
		}
	}

	hint := theme.StyleLabel.Render(" (1-3/Tab)")
	return lipgloss.JoinHorizontal(lipgloss.Top, tabs[0], "  ", tabs[1], "  ", tabs[2], hint)
}

func renderPresetCard(p PresetItem, isFocused bool, cardWidth int) string {
	var headerStyle lipgloss.Style
	var tagColor lipgloss.Color

	switch p.ID {
	case "cheap":
		headerStyle = theme.StyleCardHeaderSuccess
		tagColor = theme.ColorSuccess
	case "premium":
		headerStyle = theme.StyleCardHeaderAccent
		tagColor = theme.ColorAccent
	default:
		headerStyle = theme.StyleCardHeader
		tagColor = theme.ColorPrimary
	}

	titleText := headerStyle.Render(p.Title)
	var activeBadge string
	if p.IsActive {
		activeBadge = theme.RenderBadge("Estado", "ACTIVO", lipgloss.NewStyle().Bold(true).Foreground(tagColor))
	} else {
		activeBadge = theme.RenderBadge("Estado", "Disponible", theme.StyleLabel)
	}

	var headerSection string
	if cardWidth >= 36 {
		headerSection = lipgloss.JoinHorizontal(lipgloss.Top, titleText, " ", activeBadge)
	} else {
		headerSection = lipgloss.JoinVertical(lipgloss.Left, titleText, activeBadge)
	}

	// Compact models summary
	var modelLines []string
	if p.ClaudeModel != "" {
		modelLines = append(modelLines, fmt.Sprintf("• Claude  : %s", theme.StyleValueAccent.Render(p.ClaudeModel)))
	}
	if p.CodexModel != "" {
		modelLines = append(modelLines, fmt.Sprintf("• Codex   : %s", theme.StyleValue.Render(p.CodexModel)))
	}
	if p.OpenCodeModel != "" {
		modelLines = append(modelLines, fmt.Sprintf("• OpenCode: %s", theme.StyleValue.Render(p.OpenCodeModel)))
	}
	if p.VSCodeModel != "" {
		modelLines = append(modelLines, fmt.Sprintf("• VS Code : %s", theme.StyleValue.Render(p.VSCodeModel)))
	}
	if p.CursorModel != "" {
		modelLines = append(modelLines, fmt.Sprintf("• Cursor  : %s", theme.StyleValue.Render(p.CursorModel)))
	}

	// Footer Action
	var actionPrompt string
	if p.IsActive {
		actionPrompt = theme.StyleValueSuccess.Render("✓ Perfil actualmente activo")
	} else if isFocused {
		actionPrompt = theme.StyleActionBtnActive.Render("Presiona [Enter] o [Espacio] para activar")
	} else {
		actionPrompt = theme.StyleLabel.Render("Selecciona para activar")
	}

	var elements []string
	elements = append(elements, headerSection, theme.StyleLabel.Render(p.Tagline))
	if len(modelLines) > 0 {
		elements = append(elements, strings.Join(modelLines, "\n"))
	}
	elements = append(elements, actionPrompt)

	cardBox := theme.StyleCard
	if isFocused {
		cardBox = cardBox.BorderForeground(theme.ColorPrimary)
	}

	w := cardWidth
	if w < 24 {
		w = 24
	}

	return cardBox.Width(w).Padding(0, 1).Render(strings.Join(elements, "\n"))
}

func renderPresetsView(presets []PresetItem, focusedIdx int, width int) string {
	if len(presets) == 0 {
		return theme.StyleLabel.Render("No hay presets disponibles.")
	}

	boxWidth := width
	if boxWidth < 30 {
		boxWidth = 30
	}

	help := theme.StyleLabel.Render("Navegación: ") +
		theme.StyleKeyHint.Render("←/→/h/l") +
		theme.StyleLabel.Render(" elegir, ") +
		theme.StyleKeyHint.Render("Enter/Espacio") +
		theme.StyleLabel.Render(" aplicar, ") +
		theme.StyleKeyHint.Render("[2]") +
		theme.StyleLabel.Render(" Proveedores, ") +
		theme.StyleKeyHint.Render("[3]") +
		theme.StyleLabel.Render(" Agentes.")

	// Wide screen: multi-column layout
	if boxWidth >= 90 && len(presets) >= 3 {
		cardWidth := (boxWidth - (len(presets)-1)*2) / len(presets)
		var cardsWithSpacers []string
		for i, p := range presets {
			if i > 0 {
				cardsWithSpacers = append(cardsWithSpacers, "  ")
			}
			cardsWithSpacers = append(cardsWithSpacers, renderPresetCard(p, i == focusedIdx, cardWidth))
		}
		cardsRow := lipgloss.JoinHorizontal(lipgloss.Top, cardsWithSpacers...)

		return lipgloss.JoinVertical(lipgloss.Left, cardsRow, help)
	}

	// Compact screen: stacked vertically
	var elements []string
	for i, p := range presets {
		elements = append(elements, renderPresetCard(p, i == focusedIdx, boxWidth))
	}
	elements = append(elements, help)

	return lipgloss.JoinVertical(lipgloss.Left, strings.Join(elements, "\n"))
}

func renderProvidersView(providers []system.ProviderSpec, localModels []system.LocalModelInfo, width int) string {
	boxWidth := width
	if boxWidth < 30 {
		boxWidth = 30
	}

	var sections []string

	// Section 1: Local Daemons
	localHeader := theme.StyleCardHeaderSuccess.Render("💻 PROVEEDORES LOCALES (DAEMONS & RENDERERS)")
	var localLines []string
	localLines = append(localLines, localHeader)

	hasLocalOnline := false
	for _, p := range providers {
		if p.Type == "local" {
			statusBadge := theme.StyleValueWarning.Render("[Offline]")
			if p.IsAvailable {
				statusBadge = theme.StyleValueSuccess.Render("[Online]")
				hasLocalOnline = true
			}
			localLines = append(localLines, fmt.Sprintf("  • %-18s %s  %s",
				theme.StyleValueAccent.Render(p.DisplayName),
				statusBadge,
				theme.StyleLabel.Render(p.Evidence),
			))
		}
	}

	if hasLocalOnline && len(localModels) > 0 {
		localLines = append(localLines, theme.StyleCardHeaderAccent.Render("  Modelos Locales Instalados en Ollama:"))
		for _, m := range localModels {
			localLines = append(localLines, fmt.Sprintf("    ✓ %-20s  %-8s  (%s)",
				theme.StyleValuePrimary.Render(m.Name),
				theme.StyleValue.Render(m.Size),
				theme.StyleLabel.Render(m.Family),
			))
		}
	} else if !hasLocalOnline {
		localLines = append(localLines, theme.StyleLabel.Render("  💡 Inicia Ollama: ")+theme.StyleKeyHint.Render("ollama serve && ollama run qwen2.5-coder:32b"))
	}

	localCard := theme.StyleCard.Width(boxWidth).Padding(0, 1).Render(strings.Join(localLines, "\n"))
	sections = append(sections, localCard)

	// Section 2: Cloud Providers
	cloudHeader := theme.StyleCardHeader.Render("☁️ PROVEEDORES CLOUD & LLM APIs")
	var cloudLines []string
	cloudLines = append(cloudLines, cloudHeader)

	for _, p := range providers {
		if p.Type == "cloud" {
			statusBadge := theme.StyleValueMuted.Render("[Sin API Key]")
			if p.IsAvailable {
				statusBadge = theme.StyleValueSuccess.Render("[✓ Configurada]")
			}
			modelsSample := ""
			if len(p.Models) > 0 {
				modelsSample = fmt.Sprintf("  Modelos: %s", strings.Join(p.Models[:min(3, len(p.Models))], ", "))
			}
			cloudLines = append(cloudLines, fmt.Sprintf("  • %-18s %s  %s%s",
				theme.StyleValue.Render(p.DisplayName),
				statusBadge,
				theme.StyleLabel.Render(p.Evidence),
				theme.StyleLabel.Render(modelsSample),
			))
		}
	}

	cloudCard := theme.StyleCard.Width(boxWidth).Padding(0, 1).Render(strings.Join(cloudLines, "\n"))
	sections = append(sections, cloudCard)

	help := theme.StyleLabel.Render("Acciones: ") +
		theme.StyleKeyHint.Render("[r]") +
		theme.StyleLabel.Render(" Re-escanear | ") +
		theme.StyleKeyHint.Render("[1]") +
		theme.StyleLabel.Render(" Presets | ") +
		theme.StyleKeyHint.Render("[3]") +
		theme.StyleLabel.Render(" Agentes")

	sections = append(sections, help)
	return lipgloss.JoinVertical(lipgloss.Left, sections...)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func renderGranularView(agents []AgentRow, selectedIdx int, page int, pageSize int, width int) string {
	boxWidth := width
	if boxWidth < 30 {
		boxWidth = 30
	}

	if pageSize <= 0 {
		pageSize = 6
	}

	totalAgents := len(agents)
	totalPages := (totalAgents + pageSize - 1) / pageSize
	if totalPages == 0 {
		totalPages = 1
	}

	if page < 0 {
		page = 0
	}
	if page >= totalPages {
		page = totalPages - 1
	}

	startIdx := page * pageSize
	endIdx := startIdx + pageSize
	if endIdx > totalAgents {
		endIdx = totalAgents
	}

	pageAgents := agents[startIdx:endIdx]

	var rows []string

	// Top Pagination Bar
	pageBar := fmt.Sprintf("  %s %s  (Mostrando %d-%d de %d)   %s",
		theme.StyleBadgeLabel.Render("PÁGINA"),
		theme.StylePageCurrent.Render(fmt.Sprintf("[%d de %d]", page+1, totalPages)),
		startIdx+1, endIdx, totalAgents,
		theme.StylePageControls.Render("← [h/p] Anterior | [l/n] Siguiente →"),
	)
	rows = append(rows, pageBar)

	headerLine := fmt.Sprintf("  %-20s  %-18s  %s",
		theme.StyleCardHeader.Render("Agente / Subagente"),
		theme.StyleCardHeaderAccent.Render("Tier Asignado"),
		theme.StyleCardHeader.Render("Propósito / Responsabilidad"),
	)
	separator := theme.StyleValueMuted.Render(strings.Repeat("─", boxWidth-4))
	rows = append(rows, headerLine, separator)

	for i, a := range pageAgents {
		globalIdx := startIdx + i
		isSelected := globalIdx == selectedIdx

		var tierSelector string
		switch a.CurrentTier {
		case "premium":
			tierSelector = theme.StyleValueAccent.Render("[ ‹ PREMIUM › ]")
		case "cheap":
			tierSelector = theme.StyleValueSuccess.Render("[ ‹  CHEAP  › ]")
		default:
			tierSelector = theme.StyleValuePrimary.Render("[ ‹ DEFAULT › ]")
		}

		prefix := "  "
		nameStyle := theme.StyleValue
		if isSelected {
			prefix = theme.StyleKeyHint.Render("▶ ")
			nameStyle = theme.StyleValuePrimary.Bold(true)
		}

		rowText := fmt.Sprintf("%s%-18s  %-16s  %s",
			prefix,
			nameStyle.Render(a.Name),
			tierSelector,
			theme.StyleLabel.Render(a.Description),
		)

		if isSelected {
			rowText = lipgloss.NewStyle().
				Background(lipgloss.Color("#262626")).
				Width(boxWidth - 4).
				Render(rowText)
		}

		rows = append(rows, rowText)
	}

	help := theme.StyleLabel.Render("Atajos: ") +
		theme.StyleKeyHint.Render("↑/↓/j/k") +
		theme.StyleLabel.Render(" Seleccionar | ") +
		theme.StyleKeyHint.Render("n/p") +
		theme.StyleLabel.Render(" Pág | ") +
		theme.StyleKeyHint.Render("[c]") +
		theme.StyleLabel.Render(" Cheap | ") +
		theme.StyleKeyHint.Render("[d]") +
		theme.StyleLabel.Render(" Default | ") +
		theme.StyleKeyHint.Render("[p]") +
		theme.StyleLabel.Render(" Premium | ") +
		theme.StyleKeyHint.Render("[1]") +
		theme.StyleLabel.Render(" Presets")

	tableBox := theme.StyleCard.Width(boxWidth).Padding(0, 1).Render(strings.Join(rows, "\n"))

	return lipgloss.JoinVertical(lipgloss.Left, tableBox, help)
}


