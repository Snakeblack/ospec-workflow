package models

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/snakeblack/ospec-workflow/internal/config"
	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
)

const assignmentPageSize = 9

// RenderAssignmentList draws the per-agent model table used by install and presets.
func RenderAssignmentList(
	targetID string,
	title string,
	subtitle string,
	picks []config.AgentAssignment,
	focus int,
	col int,
	page int,
	width int,
	originY int,
) (string, []Hit) {
	names := config.AgentPickNames(targetID)
	supportsEffort := config.TargetSupportsEffort(targetID)
	supportsVerb := config.TargetSupportsVerbosity(targetID)
	cols := config.AssignmentColumnCount(targetID)

	header := theme.StyleCardHeader.Render(title)
	sub := theme.StyleLabel.Render(subtitle)

	colModel := 28
	colExtra := 16
	head := fmt.Sprintf("  %-22s  %-*s", theme.StyleCardHeader.Render("Agente"), colModel, theme.StyleCardHeader.Render("Modelo"))
	if supportsEffort {
		head += fmt.Sprintf("  %s", theme.StyleCardHeader.Render("Esfuerzo"))
	}
	if supportsVerb {
		head += fmt.Sprintf("  %s", theme.StyleCardHeader.Render("Verbosity"))
	}

	pageSize := assignmentPageSize
	total := len(names)
	if total == 0 {
		total = len(picks)
	}
	totalPages := 1
	if pageSize > 0 && total > 0 {
		totalPages = (total + pageSize - 1) / pageSize
	}
	if page < 0 {
		page = 0
	}
	if page >= totalPages {
		page = totalPages - 1
	}
	start := page * pageSize
	end := start + pageSize
	if end > total {
		end = total
	}

	var hits []Hit
	var rows []string
	y := originY + 4
	for i := start; i < end; i++ {
		name := fmt.Sprintf("agente-%d", i)
		if i < len(names) {
			name = config.AgentLabel(names[i])
		}
		pick := config.AgentAssignment{}
		if i < len(picks) {
			pick = picks[i]
		}
		isFocus := i == focus
		prefix := "  "
		nameStyle := theme.StyleValue
		if isFocus {
			prefix = theme.StyleKeyHint.Render("▶ ")
			nameStyle = theme.StyleValuePrimary.Bold(true)
		}

		modelStr := theme.StyleValue.Render(pick.Model)
		if pick.Model == "" {
			modelStr = theme.StyleValueMuted.Render("—")
		}
		if isFocus && col == 0 {
			modelStr = theme.StyleValuePrimary.Bold(true).Render("‹ " + displayEffort(pick.Model) + " ›")
		}

		row := fmt.Sprintf("%s%-22s  %-*s", prefix, nameStyle.Render(name), colModel, modelStr)
		if supportsEffort {
			eff := displayEffort(pick.Effort)
			effStr := theme.StyleValue.Render(eff)
			if isFocus && col == 1 {
				effStr = theme.StyleValuePrimary.Bold(true).Render("‹ " + eff + " ›")
			}
			row += fmt.Sprintf("  %-*s", colExtra, effStr)
		}
		if supportsVerb {
			verbCol := 1
			if supportsEffort {
				verbCol = 2
			}
			v := displayEffort(pick.Verbosity)
			vStr := theme.StyleValue.Render(v)
			if isFocus && col == verbCol {
				vStr = theme.StyleValuePrimary.Bold(true).Render("‹ " + v + " ›")
			}
			row += "  " + vStr
		}
		if isFocus {
			row = lipgloss.NewStyle().Background(lipgloss.Color("#262626")).Width(width - 4).Render(row)
		}
		rows = append(rows, row)
		hits = append(hits, Hit{Kind: "agent", Index: i, Extra: 0, X: 24, Y: y, W: colModel, H: 1})
		if supportsEffort {
			hits = append(hits, Hit{Kind: "agent", Index: i, Extra: 1, X: 24 + colModel + 2, Y: y, W: colExtra, H: 1})
		}
		y++
	}

	_ = cols
	pager := ""
	if totalPages > 1 {
		pager = theme.StyleLabel.Render(fmt.Sprintf("PÁGINA [%d de %d]  ·  AvPág / RePág", page+1, totalPages))
		hits = append(hits, Hit{Kind: "page", Extra: -1, X: 0, Y: y, W: 12, H: 1})
		hits = append(hits, Hit{Kind: "page", Extra: 1, X: 14, Y: y, W: 12, H: 1})
	}

	parts := []string{header, sub, "", head, theme.StyleValueMuted.Render(strings.Repeat("─", width-4)), strings.Join(rows, "\n")}
	if pager != "" {
		parts = append(parts, pager)
	}
	return lipgloss.JoinVertical(lipgloss.Left, parts...), hits
}
