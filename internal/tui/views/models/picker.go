package models

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/snakeblack/ospec-workflow/internal/config"
	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
)

// ModelCatalogEntry represents a standardized model item in the picker.
type ModelCatalogEntry struct {
	ID          string
	DisplayName string
	Provider    string // "anthropic", "openai", "google", "cursor", "local"
	Tier        string // "premium", "default", "cheap"
	Category    string // "Frontier Reasoning", "Balanced Coding", "Fast / Economy", "Local Daemon"
	Context     string // "200k", "1M", "128k", "32k"
	Description string
	Targets     []string // Supported targets: "claude", "codex", "antigravity", "cursor", "vscode", "opencode"
}

// MasterModelCatalog contains the curated modern 2026 model database.
var MasterModelCatalog = []ModelCatalogEntry{
	// --- Anthropic Claude 5 Family ---
	{
		ID:          "claude-opus-5",
		DisplayName: "Claude Opus 5",
		Provider:    "anthropic",
		Tier:        "premium",
		Category:    "Frontier Reasoning",
		Context:     "1M",
		Description: "Flagship frontier de máxima capacidad, auditoría 4R y arquitectura.",
		Targets:     []string{"claude", "opencode", "vscode", "cursor"},
	},
	{
		ID:          "claude-sonnet-5",
		DisplayName: "Claude Sonnet 5",
		Provider:    "anthropic",
		Tier:        "default",
		Category:    "Balanced Coding",
		Context:     "1M",
		Description: "Workhorse de alta precisión en refactorización y lógica TDD.",
		Targets:     []string{"claude", "opencode", "vscode", "cursor"},
	},
	{
		ID:          "claude-haiku-4-5",
		DisplayName: "Claude Haiku 4.5",
		Provider:    "anthropic",
		Tier:        "cheap",
		Category:    "Fast / Economy",
		Context:     "200k",
		Description: "Latencia ultrabaja para tareas mecánicas, tareas y archivo.",
		Targets:     []string{"claude", "opencode", "vscode", "cursor"},
	},
	{
		ID:          "claude-fable-5",
		DisplayName: "Claude Fable 5",
		Provider:    "anthropic",
		Tier:        "premium",
		Category:    "Frontier Creative & Spec",
		Context:     "1M",
		Description: "Modelado conceptual profundo y redacción de especificaciones.",
		Targets:     []string{"claude", "opencode", "vscode", "cursor"},
	},

	// --- Anthropic Aliases (Claude Code CLI Native) ---
	{
		ID:          "opus",
		DisplayName: "opus (Claude Code Alias)",
		Provider:    "anthropic",
		Tier:        "premium",
		Category:    "Claude Code Native",
		Context:     "1M",
		Description: "Alias oficial de Claude Code que resuelve siempre al último modelo Opus.",
		Targets:     []string{"claude"},
	},
	{
		ID:          "sonnet",
		DisplayName: "sonnet (Claude Code Alias)",
		Provider:    "anthropic",
		Tier:        "default",
		Category:    "Claude Code Native",
		Context:     "1M",
		Description: "Alias oficial de Claude Code que resuelve al último modelo Sonnet.",
		Targets:     []string{"claude"},
	},
	{
		ID:          "haiku",
		DisplayName: "haiku (Claude Code Alias)",
		Provider:    "anthropic",
		Tier:        "cheap",
		Category:    "Claude Code Native",
		Context:     "200k",
		Description: "Alias oficial de Claude Code que resuelve al último modelo Haiku.",
		Targets:     []string{"claude"},
	},

	{
		ID:          "fable",
		DisplayName: "fable",
		Provider:    "anthropic",
		Tier:        "premium",
		Category:    "Claude Code Native",
		Context:     "1M",
		Description: "Alias oficial de Claude Code para Fable.",
		Targets:     []string{"claude"},
	},

	// --- OpenAI GPT-5.6 Family (Codex CLI & Copilot) ---
	{
		ID:          "gpt-5.6-sol",
		DisplayName: "GPT-5.6 Sol",
		Provider:    "openai",
		Tier:        "premium",
		Category:    "Frontier Reasoning",
		Context:     "512k",
		Description: "Razonamiento matemático riguroso, depuración profunda y decisiones complejas.",
		Targets:     []string{"codex", "opencode", "vscode", "cursor"},
	},
	{
		ID:          "gpt-5.6-terra",
		DisplayName: "GPT-5.6 Terra",
		Provider:    "openai",
		Tier:        "default",
		Category:    "Balanced Coding",
		Context:     "256k",
		Description: "Generación de código balanceada y optimizada para pipelines interactivos.",
		Targets:     []string{"codex", "opencode", "vscode", "cursor"},
	},
	{
		ID:          "gpt-5.6-luna",
		DisplayName: "GPT-5.6 Luna",
		Provider:    "openai",
		Tier:        "cheap",
		Category:    "Fast / Economy",
		Context:     "128k",
		Description: "Velocidad de token extrema y bajo consumo para documentación y escaneos.",
		Targets:     []string{"codex", "opencode", "vscode", "cursor"},
	},
	{
		ID:          "gpt-5.5",
		DisplayName: "GPT-5.5",
		Provider:    "openai",
		Tier:        "default",
		Category:    "Codex",
		Context:     "—",
		Description: "Modelo Codex GPT-5.5.",
		Targets:     []string{"codex"},
	},
	{
		ID:          "gpt-5.4",
		DisplayName: "GPT-5.4",
		Provider:    "openai",
		Tier:        "default",
		Category:    "Codex",
		Context:     "—",
		Description: "Modelo Codex GPT-5.4.",
		Targets:     []string{"codex"},
	},
	{
		ID:          "gpt-5.4-mini",
		DisplayName: "GPT-5.4 Mini",
		Provider:    "openai",
		Tier:        "cheap",
		Category:    "Codex",
		Context:     "—",
		Description: "Modelo Codex GPT-5.4 mini.",
		Targets:     []string{"codex"},
	},

	// --- Google Gemini 3 Family (Antigravity & Copilot) ---
	{
		ID:          "gemini-3.1-pro",
		DisplayName: "Gemini 3.1 Pro (pro)",
		Provider:    "google",
		Tier:        "premium",
		Category:    "Frontier Multimodal & Math",
		Context:     "2M",
		Description: "Ventana de contexto masiva y análisis exhaustivo de repositorios enteros.",
		Targets:     []string{"antigravity", "opencode", "vscode", "cursor"},
	},
	{
		ID:          "gemini-3.7-flash",
		DisplayName: "Gemini 3.7 Flash (flash)",
		Provider:    "google",
		Tier:        "default",
		Category:    "Agentic Workhorse",
		Context:     "1M",
		Description: "Workhorse de alta velocidad optimizado para bucles agénticos y tests.",
		Targets:     []string{"antigravity", "opencode", "vscode", "cursor"},
	},
	{
		ID:          "gemini-3.5-flash-lite",
		DisplayName: "Gemini 3.5 Flash-Lite (flash_lite)",
		Provider:    "google",
		Tier:        "cheap",
		Category:    "Fast / Economy",
		Context:     "512k",
		Description: "Máxima eficiencia de tokens y ejecución ligera en segundo plano.",
		Targets:     []string{"antigravity", "opencode", "vscode", "cursor"},
	},

	// --- Antigravity Unified Harness Tiers ---
	{
		ID:          "inherit",
		DisplayName: "inherit (Heredar Host / Sesión)",
		Provider:    "google",
		Tier:        "default",
		Category:    "Antigravity / Universal",
		Context:     "—",
		Description: "Hereda el modelo base seleccionado en la sesión activa del host.",
		Targets:     []string{"antigravity", "claude", "codex", "cursor", "vscode", "opencode"},
	},
	{
		ID:          "pro",
		DisplayName: "pro (Antigravity Tier: Gemini Pro)",
		Provider:    "google",
		Tier:        "premium",
		Category:    "Antigravity Native",
		Context:     "2M",
		Description: "Asigna el tier pro a todos los subagentes en Antigravity.",
		Targets:     []string{"antigravity"},
	},
	{
		ID:          "flash",
		DisplayName: "flash (Antigravity Tier: Gemini Flash)",
		Provider:    "google",
		Tier:        "default",
		Category:    "Antigravity Native",
		Context:     "1M",
		Description: "Asigna el tier flash a todos los subagentes en Antigravity.",
		Targets:     []string{"antigravity"},
	},
	{
		ID:          "flash_lite",
		DisplayName: "flash_lite (Antigravity Tier: Flash-Lite)",
		Provider:    "google",
		Tier:        "cheap",
		Category:    "Antigravity Native",
		Context:     "512k",
		Description: "Asigna el tier flash_lite a todos los subagentes en Antigravity.",
		Targets:     []string{"antigravity"},
	},

	// --- Cursor Proprietary & Integrations ---
	{
		ID:          "grok-4.6",
		DisplayName: "Grok 4.6",
		Provider:    "cursor",
		Tier:        "default",
		Category:    "Cursor Native",
		Context:     "256k",
		Description: "Modelo insignia nativo de Cursor optimizado para edición inline.",
		Targets:     []string{"cursor"},
	},
	{
		ID:          "composer-2.5",
		DisplayName: "Composer 2.5",
		Provider:    "cursor",
		Tier:        "cheap",
		Category:    "Cursor Native",
		Context:     "128k",
		Description: "Especializado en generación multi-archivo interactiva y veloz.",
		Targets:     []string{"cursor"},
	},
	{
		ID:          "auto",
		DisplayName: "auto (Cursor Router)",
		Provider:    "cursor",
		Tier:        "default",
		Category:    "Cursor Smart Router",
		Context:     "—",
		Description: "El router de Cursor elige dinámicamente según coste y complejidad.",
		Targets:     []string{"cursor"},
	},
}

// PickerState manages state when the interactive model picker modal is active.
type PickerState struct {
	IsOpen           bool
	TargetID         string // Target being configured: "claude", "codex", "antigravity", "cursor", "vscode", "opencode"
	TierName         string // "default", "cheap", "premium"
	AgentName        string // If modifying an individual agent
	CurrentModel     string
	Items            []ModelCatalogEntry
	FilteredItems    []ModelCatalogEntry
	SelectedIndex    int
	SearchQuery      string
	IsSearching      bool
	IsCustomInput    bool
	CustomInputValue string
	Width            int
	Height           int
}

// NewPickerState creates a fresh picker state for a target and tier.
func NewPickerState(targetID string, tierName string, agentName string, currentModel string, localModels []string) PickerState {
	var items []ModelCatalogEntry
	allowed := config.TargetAvailableModels[targetID]
	if len(allowed) == 0 {
		for _, entry := range MasterModelCatalog {
			if targetID == "" || contains(entry.Targets, targetID) {
				items = append(items, entry)
			}
		}
	} else {
		byID := map[string]ModelCatalogEntry{}
		for _, entry := range MasterModelCatalog {
			byID[entry.ID] = entry
		}
		for _, id := range allowed {
			if entry, ok := byID[id]; ok {
				items = append(items, entry)
				continue
			}
			items = append(items, ModelCatalogEntry{
				ID:          id,
				DisplayName: id,
				Provider:    targetID,
				Tier:        "default",
				Category:    targetID,
				Description: "Modelo admitido por este cliente.",
				Targets:     []string{targetID},
			})
		}
	}

	// Add local Ollama models if any
	for _, lm := range localModels {
		items = append(items, ModelCatalogEntry{
			ID:          "ollama/" + lm,
			DisplayName: "Ollama: " + lm,
			Provider:    "local",
			Tier:        "default",
			Category:    "Local Ollama Daemon",
			Context:     "Local",
			Description: "Modelo local ejecutado en tu máquina sin costo de tokens.",
			Targets:     []string{"opencode", "cursor", "codex", "claude"},
		})
	}

	if currentModel != "" {
		found := false
		for _, it := range items {
			if strings.EqualFold(it.ID, currentModel) {
				found = true
				break
			}
		}
		if !found {
			items = append([]ModelCatalogEntry{{
				ID:          currentModel,
				DisplayName: currentModel + " (actual)",
				Provider:    targetID,
				Tier:        "default",
				Category:    targetID,
				Description: "Valor actual en models.yaml; no está en el catálogo de este cliente.",
				Targets:     []string{targetID},
			}}, items...)
		}
	}

	initSelected := 0
	for i, it := range items {
		if strings.EqualFold(it.ID, currentModel) {
			initSelected = i
			break
		}
	}

	return PickerState{
		IsOpen:        true,
		TargetID:      targetID,
		TierName:      tierName,
		AgentName:     agentName,
		CurrentModel:  currentModel,
		Items:         items,
		FilteredItems: items,
		SelectedIndex: initSelected,
		Width:         80,
		Height:        24,
	}
}

func contains(slice []string, val string) bool {
	for _, s := range slice {
		if strings.EqualFold(s, val) {
			return true
		}
	}
	return false
}

// Filter updates FilteredItems based on search query.
func (p *PickerState) Filter() {
	if p.SearchQuery == "" {
		p.FilteredItems = p.Items
		if p.SelectedIndex >= len(p.FilteredItems) {
			p.SelectedIndex = 0
		}
		return
	}

	q := strings.ToLower(p.SearchQuery)
	var filtered []ModelCatalogEntry
	for _, it := range p.Items {
		if strings.Contains(strings.ToLower(it.ID), q) ||
			strings.Contains(strings.ToLower(it.DisplayName), q) ||
			strings.Contains(strings.ToLower(it.Provider), q) ||
			strings.Contains(strings.ToLower(it.Category), q) {
			filtered = append(filtered, it)
		}
	}
	p.FilteredItems = filtered
	p.SelectedIndex = 0
}

// Update handles keyboard events inside the modal.
func (p *PickerState) Update(msg tea.KeyMsg) (bool, string, bool) {
	// Returns (shouldClose, selectedModel, hasSelection)
	switch msg.String() {
	case "esc":
		if p.IsSearching {
			p.IsSearching = false
			p.SearchQuery = ""
			p.Filter()
			return false, "", false
		}
		p.IsOpen = false
		return true, "", false

	case "/":
		if !p.IsSearching {
			p.IsSearching = true
			return false, "", false
		}

	case "backspace":
		if p.IsSearching {
			if len(p.SearchQuery) > 0 {
				p.SearchQuery = p.SearchQuery[:len(p.SearchQuery)-1]
				p.Filter()
			} else {
				p.IsSearching = false
			}
			return false, "", false
		}

	case "enter":
		if len(p.FilteredItems) > 0 && p.SelectedIndex >= 0 && p.SelectedIndex < len(p.FilteredItems) {
			selected := p.FilteredItems[p.SelectedIndex].ID
			p.IsOpen = false
			return true, selected, true
		}
		p.IsOpen = false
		return true, "", false

	case "up", "k":
		if p.SelectedIndex > 0 {
			p.SelectedIndex--
		} else if len(p.FilteredItems) > 0 {
			p.SelectedIndex = len(p.FilteredItems) - 1
		}
		return false, "", false

	case "down", "j":
		if p.SelectedIndex < len(p.FilteredItems)-1 {
			p.SelectedIndex++
		} else {
			p.SelectedIndex = 0
		}
		return false, "", false

	default:
		if p.IsSearching {
			if len(msg.String()) == 1 {
				p.SearchQuery += msg.String()
				p.Filter()
			}
			return false, "", false
		}
	}

	return false, "", false
}

// Render renders the floating model picker modal dialog.
func (p PickerState) Render(width int) (string, []Hit) {
	modalWidth := width - 8
	if modalWidth < 60 {
		modalWidth = 60
	}
	if modalWidth > 90 {
		modalWidth = 90
	}

	titleText := "SELECTOR DE MODELOS"
	if p.TargetID != "" {
		titleText = fmt.Sprintf("ELEGIR MODELO PARA: %s [%s]", strings.ToUpper(p.TargetID), strings.ToUpper(p.TierName))
	} else if p.AgentName != "" {
		titleText = fmt.Sprintf("ELEGIR MODELO PARA AGENTE: %s", p.AgentName)
	}
	header := theme.StyleCardHeaderAccent.Render(titleText)

	searchBar := theme.StyleLabel.Render("Buscar: ")
	if p.IsSearching {
		searchBar += theme.StyleValuePrimary.Bold(true).Render(p.SearchQuery + "█")
		searchBar += theme.StyleLabel.Render(" (Esc para salir de búsqueda)")
	} else if p.SearchQuery != "" {
		searchBar += theme.StyleValue.Render(p.SearchQuery)
		searchBar += theme.StyleLabel.Render(" (presiona '/' para filtrar)")
	} else {
		searchBar += theme.StyleLabel.Render("presiona ") + theme.StyleKeyHint.Render("[/]") + theme.StyleLabel.Render(" para filtrar modelos...")
	}

	var rows []string
	if len(p.FilteredItems) == 0 {
		rows = append(rows, theme.StyleValueWarning.Render("  No se encontraron modelos que coincidan con la búsqueda."))
	} else {
		for i, it := range p.FilteredItems {
			isSel := i == p.SelectedIndex
			isCurrent := it.ID == p.CurrentModel

			prefix := "  "
			if isSel {
				prefix = theme.StyleKeyHint.Render("▶ ")
			}

			var provBadge string
			switch it.Provider {
			case "anthropic":
				provBadge = theme.RenderBadge("Anthropic", it.Category, theme.StyleValueAccent)
			case "openai":
				provBadge = theme.RenderBadge("OpenAI", it.Category, theme.StyleValuePrimary)
			case "google":
				provBadge = theme.RenderBadge("Google", it.Category, theme.StyleValueSuccess)
			case "cursor":
				provBadge = theme.RenderBadge("Cursor", it.Category, theme.StyleValueWarning)
			case "local":
				provBadge = theme.RenderBadge("Local", it.Category, theme.StyleValueMuted)
			default:
				provBadge = theme.RenderBadge("Universal", it.Category, theme.StyleLabel)
			}

			currentMarker := ""
			if isCurrent {
				currentMarker = " " + theme.StyleValueSuccess.Render("[✓ ACTIVO]")
			}

			modelNameStr := theme.StyleValue.Render(it.DisplayName)
			if isSel {
				modelNameStr = theme.StyleValuePrimary.Bold(true).Render(it.DisplayName)
			}

			line1 := fmt.Sprintf("%s%-24s %s%s", prefix, modelNameStr, provBadge, currentMarker)
			line2 := fmt.Sprintf("    %s (Contexto: %s)", theme.StyleLabel.Render(it.Description), theme.StyleValueMuted.Render(it.Context))

			rowBlock := lipgloss.JoinVertical(lipgloss.Left, line1, line2)
			if isSel {
				rowBlock = lipgloss.NewStyle().
					Background(lipgloss.Color("#262626")).
					Width(modalWidth-4).
					Border(lipgloss.NormalBorder(), false, false, false, true).
					BorderForeground(theme.ColorPrimary).
					Padding(0, 1).
					Render(rowBlock)
			} else {
				rowBlock = lipgloss.NewStyle().Padding(0, 1).Render(rowBlock)
			}
			rows = append(rows, rowBlock)
		}
	}

	visibleLimit := 7
	startIdx := 0
	if p.SelectedIndex >= visibleLimit {
		startIdx = p.SelectedIndex - visibleLimit + 1
	}
	endIdx := startIdx + visibleLimit
	if endIdx > len(rows) {
		endIdx = len(rows)
	}
	visibleRows := rows[startIdx:endIdx]

	controls := theme.StyleLabel.Render("↑/↓ elige  ·  Enter confirma  ·  / filtra  ·  Esc cancela  ·  clic selecciona")

	modalContent := lipgloss.JoinVertical(
		lipgloss.Left,
		header,
		"\n",
		searchBar,
		theme.StyleValueMuted.Render(strings.Repeat("─", modalWidth-4)),
		strings.Join(visibleRows, "\n\n"),
		theme.StyleValueMuted.Render(strings.Repeat("─", modalWidth-4)),
		controls,
	)

	view := theme.StyleBox.
		BorderForeground(theme.ColorPrimary).
		Width(modalWidth).
		Padding(1, 2).
		Render(modalContent)

	var hits []Hit
	y := 5
	for vis := 0; vis < len(visibleRows); vis++ {
		abs := startIdx + vis
		h := 2
		hits = append(hits, Hit{Kind: "picker", Index: abs, X: 2, Y: y, W: modalWidth, H: h})
		y += 3
	}
	return view, hits
}
