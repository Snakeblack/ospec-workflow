package models

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/snakeblack/ospec-workflow/internal/config"
	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
)

func renderSubNav(currentMode SubMode, width int) (string, []Hit) {
	var tabs []string
	labels := []string{"[1] Presets", "[2] Por agente", "[3] Por cliente"}
	modes := []SubMode{ModePresets, ModeGranular, ModeTargetModels}

	x := 0
	var hits []Hit
	for i, label := range labels {
		w := lipgloss.Width(label)
		hits = append(hits, Hit{Kind: "subnav", Index: i, X: x, Y: 0, W: w, H: 1})
		if modes[i] == currentMode {
			tabs = append(tabs, theme.StyleActiveTab.
				Border(lipgloss.NormalBorder(), false, false, true, false).
				BorderForeground(theme.ColorPrimary).
				Render(label))
		} else {
			tabs = append(tabs, theme.StyleInactiveTab.Render(label))
		}
		x += w + 2
	}

	hint := theme.StyleLabel.Render("  (clic o 1-3)")
	_ = width
	return lipgloss.JoinHorizontal(lipgloss.Top, tabs[0], "  ", tabs[1], "  ", tabs[2], hint), hits
}

func renderPresetCard(p PresetItem, isFocused bool, inCards bool, cardWidth int) string {
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

	headerSection := lipgloss.JoinHorizontal(lipgloss.Top, titleText, " ", activeBadge)

	var actionPrompt string
	if isFocused && inCards {
		actionPrompt = theme.StyleActionBtnActive.Render("Enter elige un cliente")
	} else {
		actionPrompt = theme.StyleLabel.Render("Clic o ←/→")
	}

	w := cardWidth
	if w < 24 {
		w = 24
	}
	body := strings.Join([]string{
		headerSection,
		theme.StyleLabel.Render(p.Tagline),
		theme.StyleValue.Render(p.AgentSummary),
		actionPrompt,
	}, "\n")

	cardBox := theme.StyleCard
	if isFocused {
		cardBox = cardBox.BorderForeground(theme.ColorPrimary)
	}
	return cardBox.Width(w).Padding(0, 1).Render(body)
}

func renderPresetsView(
	presets []PresetItem,
	focusedIdx int,
	zone int,
	presetTargetIdx int,
	picks []config.AgentAssignment,
	agentFocus, agentCol, agentPage int,
	targets []TargetConfigItem,
	width int,
) (string, []Hit) {
	if len(presets) == 0 {
		return theme.StyleLabel.Render("No hay presets disponibles."), nil
	}

	boxWidth := width
	if boxWidth < 30 {
		boxWidth = 30
	}

	focused := presets[focusedIdx]
	if zone == presetZoneTargets {
		return renderPresetTargetList(focused, targets, presetTargetIdx, boxWidth)
	}
	if zone == presetZoneAgents {
		tc := TargetConfigItem{DisplayName: "cliente"}
		if presetTargetIdx >= 0 && presetTargetIdx < len(targets) {
			tc = targets[presetTargetIdx]
		}
		title := fmt.Sprintf("%s · %s — modelo por agente", focused.Title, tc.DisplayName)
		sub := "Espacio cicla  ·  / lista  ·  Enter guarda y vuelve  ·  Esc atrás"
		if tc.IsSingleModel {
			sub = "Un modelo para todos los agentes. Espacio cicla  ·  Enter guarda  ·  Esc atrás"
		}
		return RenderAssignmentList(tc.ID, title, sub, picks, agentFocus, agentCol, agentPage, boxWidth, 0)
	}

	banner := theme.StyleCard.Width(boxWidth).Padding(0, 1).Render(strings.Join([]string{
		theme.StyleCardHeader.Render("Qué es un preset"),
		theme.StyleLabel.Render("Económico, Equilibrado o Máximo es una plantilla. Enter elige el cliente; luego asignas el modelo de cada agente. Si el cliente ya está configurado, a aplica el preset de golpe."),
	}, "\n"))

	var hits []Hit
	y := lipgloss.Height(banner)
	helpCards := theme.StyleLabel.Render("←/→ elige preset  ·  Enter o clic abre los clientes  ·  Esc vuelve al inicio")

	var cardsRow string
	cardHeight := 1
	if boxWidth >= 72 && len(presets) >= 3 {
		cardWidth := (boxWidth - (len(presets)-1)*2) / len(presets)
		var parts []string
		x := 0
		for i, p := range presets {
			if i > 0 {
				parts = append(parts, "  ")
				x += 2
			}
			card := renderPresetCard(p, i == focusedIdx, zone == presetZoneCards, cardWidth)
			cardHeight = lipgloss.Height(card)
			hits = append(hits, Hit{Kind: "preset", Index: i, X: x, Y: y, W: lipgloss.Width(card), H: cardHeight})
			parts = append(parts, card)
			x += lipgloss.Width(card)
		}
		cardsRow = lipgloss.JoinHorizontal(lipgloss.Top, parts...)
	} else {
		var stacked []string
		cy := y
		for i, p := range presets {
			card := renderPresetCard(p, i == focusedIdx, zone == presetZoneCards, boxWidth)
			h := lipgloss.Height(card)
			hits = append(hits, Hit{Kind: "preset", Index: i, X: 0, Y: cy, W: boxWidth, H: h})
			stacked = append(stacked, card)
			cy += h
			cardHeight = h
		}
		cardsRow = strings.Join(stacked, "\n")
	}

	return lipgloss.JoinVertical(lipgloss.Left, banner, cardsRow, helpCards), hits
}

func renderPresetTargetList(preset PresetItem, targets []TargetConfigItem, focusedIdx, width int) (string, []Hit) {
	header := theme.StyleCardHeader.Render(fmt.Sprintf("Preset %s — elige un cliente", preset.Title))
	sub := theme.StyleLabel.Render("Enter configura agentes. a aplica el preset si ese cliente ya tiene modelos guardados. Esc vuelve a las tarjetas.")

	var hits []Hit
	var rows []string
	y := 4
	for i, t := range targets {
		isFocus := i == focusedIdx
		prefix := "  "
		nameStyle := theme.StyleValue
		if isFocus {
			prefix = theme.StyleKeyHint.Render("▶ ")
			nameStyle = theme.StyleValuePrimary.Bold(true)
		}
		state := theme.StyleValueMuted.Render("sin configurar")
		applyHint := ""
		if t.HasAssignments {
			state = theme.StyleValueSuccess.Render("configurado")
			applyHint = theme.StyleLabel.Render("  ·  a aplica preset")
		}
		multi := "multiagente"
		if t.IsSingleModel {
			multi = "un modelo"
		}
		row := fmt.Sprintf("%s%s  %s  %s%s", prefix, nameStyle.Render(t.DisplayName), theme.StyleLabel.Render(multi), state, applyHint)
		if isFocus {
			row = lipgloss.NewStyle().Background(lipgloss.Color("#262626")).Width(width - 4).Render(row)
		}
		rows = append(rows, row)
		hits = append(hits, Hit{Kind: "ptarget", Index: i, Extra: 0, X: 0, Y: y, W: width - 20, H: 1})
		if t.HasAssignments {
			hits = append(hits, Hit{Kind: "ptarget", Index: i, Extra: 1, X: width - 18, Y: y, W: 16, H: 1})
		}
		y++
	}

	hint := theme.StyleLabel.Render("↑/↓ cliente  ·  Enter configura  ·  a aplica (si configurado)  ·  Esc atrás")
	body := lipgloss.JoinVertical(lipgloss.Left, header, "", sub, "", strings.Join(rows, "\n"), "", hint)
	return body, hits
}

func renderTargetModelsView(targets []TargetConfigItem, selectedTargetIdx int, focusedRow, focusedCol int, width int) (string, []Hit) {
	boxWidth := width
	if boxWidth < 30 {
		boxWidth = 30
	}
	if len(targets) == 0 {
		return theme.StyleLabel.Render("No hay clientes configurables."), nil
	}
	if selectedTargetIdx < 0 || selectedTargetIdx >= len(targets) {
		selectedTargetIdx = 0
	}
	cur := targets[selectedTargetIdx]

	var hits []Hit
	var leftLines []string
	leftLines = append(leftLines, theme.StyleCardHeader.Render("Clientes"))
	y := 1
	for i, t := range targets {
		prefix := "  "
		nameStyle := theme.StyleValue
		if i == selectedTargetIdx {
			prefix = theme.StyleKeyHint.Render("▶ ")
			nameStyle = theme.StyleValuePrimary.Bold(true)
		}
		row := fmt.Sprintf("%s%s", prefix, nameStyle.Render(t.DisplayName))
		if i == selectedTargetIdx {
			row = lipgloss.NewStyle().Background(lipgloss.Color("#262626")).Width(24).Render(row)
		}
		leftLines = append(leftLines, row)
		hits = append(hits, Hit{Kind: "target", Index: i, X: 1, Y: y, W: 24, H: 1})
		y++
	}
	leftCard := theme.StyleCard.Width(26).Padding(0, 1).Render(strings.Join(leftLines, "\n"))

	rightWidth := boxWidth - 28
	if rightWidth < 40 {
		rightWidth = 40
	}

	capLine := theme.StyleLabel.Render("Modelo: sí.")
	if cur.SupportsEffort {
		capLine = theme.StyleValueSuccess.Render("Modelo y esfuerzo: sí (agentes custom).")
	} else {
		capLine = theme.StyleLabel.Render("Modelo: sí. Esfuerzo: este cliente no lo admite en agentes custom.")
	}

	var rightLines []string
	rightLines = append(rightLines,
		theme.StyleCardHeaderAccent.Render(cur.DisplayName),
		theme.StyleLabel.Render(cur.Description),
		capLine,
		"",
		fmt.Sprintf("  %-12s  %-22s  %-22s  %s",
			"",
			theme.StyleValueSuccess.Render("Económico"),
			theme.StyleValuePrimary.Render("Equilibrado"),
			theme.StyleValueAccent.Render("Máximo"),
		),
	)

	renderRow := func(rowIdx int, label string, getter func(TargetConfigItem, int) string, enabled bool) string {
		cells := make([]string, 3)
		for col := 0; col < 3; col++ {
			val := displayEffort(getter(cur, col))
			if rowIdx > 0 && !enabled {
				val = "—"
			}
			cell := val
			if rowIdx == focusedRow && col == focusedCol && enabled {
				cell = theme.StyleValuePrimary.Bold(true).Render("‹ " + val + " ›")
			}
			cells[col] = fmt.Sprintf("%-22s", cell)
		}
		prefix := "  "
		if rowIdx == focusedRow {
			prefix = theme.StyleKeyHint.Render("▶ ")
		}
		return fmt.Sprintf("%s%-10s  %s  %s  %s", prefix, label, cells[0], cells[1], cells[2])
	}

	rightLines = append(rightLines, renderRow(rowModel, "Modelo", func(t TargetConfigItem, col int) string { return t.ModelFor(col) }, true))
	if cur.SupportsEffort {
		rightLines = append(rightLines, renderRow(rowEffort, "Esfuerzo", func(t TargetConfigItem, col int) string { return t.EffortFor(col) }, true))
	}
	if cur.SupportsVerbosity {
		rightLines = append(rightLines, renderRow(rowVerbosity, "Verbosity", func(t TargetConfigItem, col int) string { return t.VerbosityFor(col) }, true))
	}

	rightLines = append(rightLines, "", theme.StyleLabel.Render("Catálogo: "+strings.Join(cur.AvailableModels, " · ")))

	rightCard := theme.StyleCard.Width(rightWidth).Padding(0, 1).Render(strings.Join(rightLines, "\n"))

	var topRow string
	rightX := 27
	rowY := 6
	if boxWidth >= 70 {
		topRow = lipgloss.JoinHorizontal(lipgloss.Top, leftCard, " ", rightCard)
	} else {
		topRow = lipgloss.JoinVertical(lipgloss.Left, leftCard, rightCard)
		rightX = 0
		rowY = lipgloss.Height(leftCard) + 6
	}
	maxRow := rowModel
	if cur.SupportsEffort {
		maxRow = rowEffort
	}
	if cur.SupportsVerbosity {
		maxRow = rowVerbosity
	}
	for row := 0; row <= maxRow; row++ {
		for col := 0; col < 3; col++ {
			hits = append(hits, Hit{
				Kind:  "tcell",
				Index: row,
				Extra: col,
				X:     rightX + 12 + col*24,
				Y:     rowY + row,
				W:     22,
				H:     1,
			})
		}
	}

	help := theme.StyleLabel.Render("↑/↓ fila  ·  ←/→ celda  ·  [ ] cliente  ·  Enter cambia  ·  clic selecciona")
	return lipgloss.JoinVertical(lipgloss.Left, topRow, help), hits
}

func renderGranularView(agents []AgentRow, selectedIdx int, page int, pageSize int, width int) (string, []Hit) {
	boxWidth := width
	if boxWidth < 30 {
		boxWidth = 30
	}
	if pageSize <= 0 {
		pageSize = 8
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

	var hits []Hit
	pageBar := fmt.Sprintf("  %s %s  (%d-%d de %d)   %s",
		theme.StyleBadgeLabel.Render("PÁGINA"),
		theme.StylePageCurrent.Render(fmt.Sprintf("[%d de %d]", page+1, totalPages)),
		startIdx+1, endIdx, totalAgents,
		theme.StylePageControls.Render("AvPág / RePág  ·  clic en la fila"),
	)
	hits = append(hits, Hit{Kind: "page", Extra: -1, X: 2, Y: 0, W: 12, H: 1})
	hits = append(hits, Hit{Kind: "page", Extra: 1, X: 16, Y: 0, W: 12, H: 1})

	headerLine := fmt.Sprintf("  %-20s  %-18s  %s",
		theme.StyleCardHeader.Render("Agente"),
		theme.StyleCardHeaderAccent.Render("Nivel"),
		theme.StyleCardHeader.Render("Para qué"),
	)
	separator := theme.StyleValueMuted.Render(strings.Repeat("─", boxWidth-4))

	var rows []string
	rows = append(rows, pageBar, headerLine, separator)
	y := 3
	for i, a := range pageAgents {
		globalIdx := startIdx + i
		isSelected := globalIdx == selectedIdx

		var tierSelector string
		switch a.CurrentTier {
		case "premium":
			tierSelector = theme.StyleValueAccent.Render("[ ‹ MÁXIMO › ]")
		case "cheap":
			tierSelector = theme.StyleValueSuccess.Render("[ ‹ ECONÓMICO › ]")
		default:
			tierSelector = theme.StyleValuePrimary.Render("[ ‹ EQUILIBRADO › ]")
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
			rowText = lipgloss.NewStyle().Background(lipgloss.Color("#262626")).Width(boxWidth - 4).Render(rowText)
		}
		rows = append(rows, rowText)
		hits = append(hits, Hit{Kind: "agent", Index: globalIdx, X: 0, Y: y, W: boxWidth, H: 1})
		y++
	}

	help := theme.StyleLabel.Render("↑/↓ elige  ·  ←/→ cambia nivel  ·  AvPág/RePág  ·  clic selecciona o cicla")
	tableBox := theme.StyleCard.Width(boxWidth).Padding(0, 1).Render(strings.Join(rows, "\n"))
	return lipgloss.JoinVertical(lipgloss.Left, tableBox, help), hits
}
