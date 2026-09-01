package targets

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/snakeblack/ospec-workflow/internal/system"
	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
)

func renderTargetList(targets []system.TargetSpec, selectedIdx int, width int) string {
	if width < 10 {
		width = 10
	}

	header := theme.StyleCardHeader.Render("AI TARGETS SOPORTADOS")

	var rows []string
	rows = append(rows, header)

	for i, t := range targets {
		numStr := fmt.Sprintf("[%d]", i+1)
		nameStr := t.DisplayName
		badge := StatusBadge(t.Status)

		cursor := "  "
		isSel := i == selectedIdx
		if isSel {
			cursor = theme.StyleKeyHint.Render("▶ ")
		}

		line := fmt.Sprintf("%s%s %-16s %s", cursor, theme.StyleLabel.Render(numStr), nameStr, badge)
		if isSel {
			line = lipgloss.NewStyle().
				Bold(true).
				Foreground(theme.ColorPrimary).
				Render(fmt.Sprintf("%s%s %-16s %s", cursor, numStr, nameStr, badge))
		}

		rows = append(rows, line)
	}

	return theme.StyleCard.
		Width(width - 2).
		Padding(0, 1).
		Render(strings.Join(rows, "\n"))
}

func renderTargetDetail(target *system.TargetSpec, width int) string {
	if target == nil {
		return ""
	}
	if width < 15 {
		width = 15
	}

	// 1. Header Line
	headerTitle := theme.StyleCardHeaderAccent.Render("DIAGNÓSTICO: " + target.DisplayName)
	headerMeta := theme.StyleLabel.Render(fmt.Sprintf("(ID: %s)", target.ID))
	badge := StatusBadge(target.Status)
	headerLine := fmt.Sprintf("%s %s  %s", headerTitle, headerMeta, badge)

	// 2. Evidence summary
	evidenceText := target.Evidence
	if evidenceText == "" {
		evidenceText = "(ninguna)"
	}
	evidenceBlock := fmt.Sprintf("%s %s", theme.StyleLabel.Render("Evidencia detectada:"), theme.StyleValue.Render(evidenceText))

	// 3. Configuration Files Summary
	var configParts []string
	for _, cf := range target.ConfigFiles {
		if cf.Exists {
			configParts = append(configParts, fmt.Sprintf("%s %s", theme.StyleValueSuccess.Render("✓ [Encontrado]"), theme.StyleValue.Render(cf.Path)))
		} else {
			configParts = append(configParts, fmt.Sprintf("%s %s", theme.StyleValueMuted.Render("✗ [Faltante]"), theme.StyleValueMuted.Render(cf.Path)))
		}
	}
	if len(configParts) == 0 {
		configParts = append(configParts, theme.StyleValueMuted.Render("(sin rutas declaradas)"))
	}
	configBlock := fmt.Sprintf("%s\n  %s", theme.StyleCardHeader.Render("ARCHIVOS DE CONFIGURACIÓN:"), strings.Join(configParts, "  "))

	// 4. Capability Matrix (compact)
	caps := target.Capabilities
	formatCap := func(name string, supported bool) string {
		if supported {
			return fmt.Sprintf("%s: %s", name, theme.StyleValueSuccess.Render("✓"))
		}
		return fmt.Sprintf("%s: %s", name, theme.StyleValueMuted.Render("-"))
	}

	capLine1 := fmt.Sprintf("  %s  •  %s  •  %s",
		formatCap("Sub-agentes", caps.Subagents),
		formatCap("Paralelismo", caps.Parallelism),
		formatCap("Hooks", caps.Hooks),
	)
	capLine2 := fmt.Sprintf("  %s  •  %s  •  %s",
		formatCap("Background Tasks", caps.BackgroundTasks),
		formatCap("MCP", caps.MCP),
		formatCap("Dynamic Tools", caps.DynamicTools),
	)
	capBlock := fmt.Sprintf("%s\n%s\n%s", theme.StyleCardHeader.Render("MATRIZ DE CAPACIDADES:"), capLine1, capLine2)

	content := strings.Join([]string{
		headerLine,
		evidenceBlock,
		configBlock,
		capBlock,
	}, "\n")

	return theme.StyleCard.
		Width(width - 2).
		Padding(0, 1).
		Render(content)
}

func renderHelpBar(width int) string {
	sep := theme.StyleBadgeLabel.Render(" • ")
	hints := []string{
		fmt.Sprintf("%s %s", theme.StyleKeyHint.Render("↑/↓/j/k"), "Navegar"),
		fmt.Sprintf("%s %s", theme.StyleKeyHint.Render("1-6"), "Selección"),
		fmt.Sprintf("%s %s", theme.StyleKeyHint.Render("s/Enter"), "Sincronizar"),
		fmt.Sprintf("%s %s", theme.StyleKeyHint.Render("r"), "Refrescar"),
	}
	content := strings.Join(hints, sep)
	if width > 0 {
		return theme.StyleFooter.Width(width).Render(content)
	}
	return theme.StyleFooter.Render(content)
}

