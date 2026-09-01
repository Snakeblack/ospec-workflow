package models

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/snakeblack/ospec-workflow/internal/config"
	"github.com/snakeblack/ospec-workflow/internal/system"
	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
)

var defaultAgentDefinitions = []struct {
	name        string
	category    string
	description string
}{
	// Core & Orquestación
	{"sdd-orchestrator", "Core & Orquestación", "Orquestación del flujo y control de estado"},
	{"sdd-foundation", "Core & Orquestación", "Arranque de proyectos y scaffolding inicial"},
	{"sdd-workspace", "Core & Orquestación", "Federación y exploración multi-repo"},
	{"sdd-onboard", "Core & Orquestación", "Guía interactiva paso a paso para nuevos repos"},

	// Fases SDD
	{"sdd-propose", "Fases de Especificación y Diseño", "Propuesta técnica y análisis de impacto"},
	{"sdd-spec", "Fases de Especificación y Diseño", "Especificación formal de requisitos OpenSpec"},
	{"sdd-clarify", "Fases de Especificación y Diseño", "Resolución interactiva de ambigüedades"},
	{"sdd-design", "Fases de Especificación y Diseño", "Diseño técnico, decisiones y diagramas"},
	{"sdd-tasks", "Fases de Especificación y Diseño", "Desglose jerárquico de tareas de código"},

	// Fases de Implementación y Verificación
	{"sdd-apply", "Implementación y Verificación", "Implementación TDD y ejecución de tareas"},
	{"sdd-verify", "Implementación y Verificación", "Verificación estricta de tests y calidad"},
	{"sdd-reconcile", "Implementación y Verificación", "Reconciliación retroactiva de código"},
	{"sdd-baseline", "Implementación y Verificación", "Generación de línea base de dominios"},
	{"sdd-archive", "Implementación y Verificación", "Cierre, versionado y archivado de cambios"},
	{"sdd-document", "Implementación y Verificación", "Documentación viva y sincronización OpenWiki"},
	{"sdd-init", "Implementación y Verificación", "Inicialización del entorno de desarrollo"},
	{"sdd-explore", "Implementación y Verificación", "Investigación exploratoria sin mutaciones"},

	// Comité Revisor (4R)
	{"review-change", "Comité Revisor (4R Gate)", "Evaluador generalista del cambio"},
	{"review-correction", "Comité Revisor (4R Gate)", "Validador de hallazgos corregidos"},
	{"review-readability", "Comité Revisor (4R Gate)", "Especialista en legibilidad y limpieza"},
	{"review-reliability", "Comité Revisor (4R Gate)", "Especialista en fiabilidad y casos límite"},
	{"review-resilience", "Comité Revisor (4R Gate)", "Especialista en resiliencia y recuperación"},
	{"review-risk", "Comité Revisor (4R Gate)", "Especialista en seguridad y riesgo"},

	// Fallback
	{"_default", "Fallback Global", "Tier por defecto para agentes no declarados"},
}

// Model represents the Bubbletea UI model for the Models Hub view.
type Model struct {
	repoRoot         string
	modelsMgr        *config.ModelsManager
	mode             SubMode
	focusedPreset    int
	activePreset     string
	presets          []PresetItem
	agents           []AgentRow
	selectedAgentIdx int
	agentPage        int
	agentsPerPage    int
	providers        []system.ProviderSpec
	localModels      []system.LocalModelInfo
	statusMessage    string
	width            int
	height           int
}

// New creates a new Models Hub Model.
func New(repoRoot string, mm *config.ModelsManager) Model {
	m := Model{
		repoRoot:         repoRoot,
		modelsMgr:        mm,
		mode:             ModePresets,
		focusedPreset:    1, // Default preset focused by default
		selectedAgentIdx: 0,
		agentPage:        0,
		agentsPerPage:    6,
		width:            80,
	}
	m.Refresh()
	return m
}

// Init initializes the model.
func (m Model) Init() tea.Cmd {
	return nil
}

// SetSize updates the viewport dimensions.
func (m *Model) SetSize(w, h int) {
	m.width = w
	m.height = h
}

// Mode returns the active subview mode (Presets, Providers, or Granular).
func (m Model) Mode() SubMode {
	return m.mode
}

// ActivePreset returns the name of the currently active preset.
func (m Model) ActivePreset() string {
	return m.activePreset
}

// FocusedPreset returns the index of the currently focused preset card.
func (m Model) FocusedPreset() int {
	return m.focusedPreset
}

// Presets returns the list of preset items.
func (m Model) Presets() []PresetItem {
	return m.presets
}

// Agents returns the list of agents and their current assigned tiers.
func (m Model) Agents() []AgentRow {
	return m.agents
}

// Providers returns detected providers.
func (m Model) Providers() []system.ProviderSpec {
	return m.providers
}

// LocalModels returns detected local models.
func (m Model) LocalModels() []system.LocalModelInfo {
	return m.localModels
}

// AgentPage returns current agent pagination page.
func (m Model) AgentPage() int {
	return m.agentPage
}

// SelectedAgentIndex returns the currently selected agent index in the granular table.
func (m Model) SelectedAgentIndex() int {
	return m.selectedAgentIdx
}

// StatusMessage returns the current status toast message.
func (m Model) StatusMessage() string {
	return m.statusMessage
}

// Refresh reloads configuration from disk and updates view data structures.
func (m *Model) Refresh() {
	activeP := "default"
	if p, err := m.modelsMgr.GetActivePreset(); err == nil && p != "" {
		activeP = strings.ToLower(p)
	}
	m.activePreset = activeP

	cfg, _ := m.modelsMgr.GetConfig()

	// 0. Discover Providers and Local LLMs
	rep := system.InspectModelsFull(m.repoRoot)
	m.providers = rep.Providers
	m.localModels = rep.LocalModels

	// 1. Build Presets
	m.presets = []PresetItem{
		{
			ID:          "cheap",
			Title:       "⚡ Cheap / Económico",
			Tagline:     "Máxima velocidad y mínimo costo de tokens.",
			Description: "Modelos ligeros ideales para iteraciones rápidas y tareas acotadas.",
			Characteristics: []string{
				"Ahorro de ~80% en costos de API",
				"Latencia ultrabaja en respuestas",
				"Óptimo para tareas mecánicas (tasks, archive, doc)",
			},
			IsActive: activeP == "cheap",
		},
		{
			ID:          "default",
			Title:       "⚖️ Default / Estándar",
			Tagline:     "Equilibrio óptimo entre razonamiento y velocidad.",
			Description: "Configuración recomendada para desarrollo activo y revisión equilibrada.",
			Characteristics: []string{
				"Excelente precisión en diseño y código",
				"Balance costo/rendimiento optimizado",
				"Reviewers 4R con modelos confiables",
			},
			IsActive: activeP == "default",
		},
		{
			ID:          "premium",
			Title:       "🧠 Premium / Razonamiento",
			Tagline:     "Máxima profundidad de análisis y precisión.",
			Description: "Modelos de frontera para decisiones arquitectónicas de alto impacto.",
			Characteristics: []string{
				"Razonamiento exhaustivo (Opus, GPT-5.6 Sol)",
				"Ideal para propuestas complejas y auditoría 4R",
				"Máxima cobertura en verificación de casos límite",
			},
			IsActive: activeP == "premium",
		},
	}

	// Enrich Presets with target model names from tiers config
	if cfg != nil {
		for i, p := range m.presets {
			if tier, ok := cfg.Tiers[p.ID]; ok {
				m.presets[i].ClaudeModel = tier.Claude
				if tier.Codex != nil {
					m.presets[i].CodexModel = tier.Codex.Model
				}
				m.presets[i].OpenCodeModel = tier.OpenCode
				m.presets[i].CursorModel = tier.Cursor
				vsModels := tier.GetVSCodeModels()
				if len(vsModels) > 0 {
					m.presets[i].VSCodeModel = vsModels[0]
				}
			}
		}
	}

	// 2. Build Agent Rows
	m.agents = make([]AgentRow, 0, len(defaultAgentDefinitions))
	for _, def := range defaultAgentDefinitions {
		tier := "default"
		if cfg != nil {
			if t, ok := cfg.Agents[def.name]; ok && t != "" {
				tier = t
			} else if fb, ok := cfg.Agents["_default"]; ok && fb != "" {
				tier = fb
			}
		}
		m.agents = append(m.agents, AgentRow{
			Name:        def.name,
			CurrentTier: tier,
			Category:    def.category,
			Description: def.description,
		})
	}
}

// ApplyPreset applies preset and persists to disk.
func (m *Model) ApplyPreset(preset string) (string, error) {
	if err := m.modelsMgr.ApplyPreset(preset); err != nil {
		return "", err
	}
	m.Refresh()
	presetCap := preset
	if len(preset) > 0 {
		presetCap = strings.ToUpper(preset[:1]) + strings.ToLower(preset[1:])
	}
	m.statusMessage = fmt.Sprintf("✓ Preset '%s' aplicado y guardado en models.yaml", presetCap)
	return presetCap, nil
}

// SetAgentTier sets the tier for a specific agent and persists to disk.
func (m *Model) SetAgentTier(agent string, tier string) error {
	if err := m.modelsMgr.SetAgentTier(agent, tier); err != nil {
		return err
	}
	if err := m.modelsMgr.Save(); err != nil {
		return err
	}
	m.Refresh()
	tierCap := tier
	if len(tier) > 0 {
		tierCap = strings.ToUpper(tier[:1]) + strings.ToLower(tier[1:])
	}
	m.statusMessage = fmt.Sprintf("✓ Agente '%s' asignado a [%s] en models.yaml", agent, tierCap)
	return nil
}

// CycleSelectedAgentTier shifts current agent tier forward or backward.
func (m *Model) CycleSelectedAgentTier(delta int) error {
	if len(m.agents) == 0 || m.selectedAgentIdx < 0 || m.selectedAgentIdx >= len(m.agents) {
		return nil
	}

	agent := m.agents[m.selectedAgentIdx]
	tiers := []string{"cheap", "default", "premium"}
	curIdx := 1
	for i, t := range tiers {
		if t == agent.CurrentTier {
			curIdx = i
			break
		}
	}

	newIdx := (curIdx + delta + len(tiers)) % len(tiers)
	return m.SetAgentTier(agent.Name, tiers[newIdx])
}

// Update handles user interactions in the Models Hub view.
func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "tab", "v", "V":
			m.mode = (m.mode + 1) % 3
			return m, nil

		case "1":
			m.mode = ModePresets
			return m, nil

		case "2":
			m.mode = ModeProviders
			return m, nil

		case "3":
			m.mode = ModeGranular
			return m, nil

		case "r", "R":
			if m.mode == ModeProviders {
				m.Refresh()
				m.statusMessage = "✓ Proveedores y modelos re-escaneados"
				return m, nil
			}
		}

		if m.mode == ModePresets {
			if len(m.presets) == 0 {
				return m, nil
			}

			switch msg.String() {
			case "left", "h":
				m.focusedPreset = (m.focusedPreset + len(m.presets) - 1) % len(m.presets)
				return m, nil

			case "right", "l":
				m.focusedPreset = (m.focusedPreset + 1) % len(m.presets)
				return m, nil

			case "up", "k":
				m.focusedPreset = (m.focusedPreset + len(m.presets) - 1) % len(m.presets)
				return m, nil

			case "down", "j":
				m.focusedPreset = (m.focusedPreset + 1) % len(m.presets)
				return m, nil

			case "enter", " ":
				targetPreset := m.presets[m.focusedPreset].ID
				presetCap, err := m.ApplyPreset(targetPreset)
				if err != nil {
					m.statusMessage = fmt.Sprintf("✗ Error al aplicar preset: %v", err)
					return m, nil
				}
				return m, func() tea.Msg {
					return PresetAppliedMsg{Preset: presetCap}
				}
			}
		} else if m.mode == ModeProviders {
			switch msg.String() {
			case "r", "R", "enter":
				m.Refresh()
				m.statusMessage = "✓ Proveedores y modelos actualizados"
				return m, nil
			}
		} else {
			// ModeGranular (Paginated)
			if len(m.agents) == 0 {
				return m, nil
			}

			pageSize := m.agentsPerPage
			if pageSize <= 0 {
				pageSize = 7
			}
			totalPages := (len(m.agents) + pageSize - 1) / pageSize

			switch msg.String() {
			case "n", "pgdown", "]":
				if m.agentPage < totalPages-1 {
					m.agentPage++
					m.selectedAgentIdx = m.agentPage * pageSize
				}
				return m, nil

			case "p", "pgup", "[":
				if m.agentPage > 0 {
					m.agentPage--
					m.selectedAgentIdx = m.agentPage * pageSize
				}
				return m, nil

			case "up", "k":
				if m.selectedAgentIdx > 0 {
					m.selectedAgentIdx--
					m.agentPage = m.selectedAgentIdx / pageSize
				}
				return m, nil

			case "down", "j":
				if m.selectedAgentIdx < len(m.agents)-1 {
					m.selectedAgentIdx++
					m.agentPage = m.selectedAgentIdx / pageSize
				}
				return m, nil

			case "left", "h":
				if err := m.CycleSelectedAgentTier(-1); err != nil {
					m.statusMessage = fmt.Sprintf("✗ Error: %v", err)
					return m, nil
				}
				curAgent := m.agents[m.selectedAgentIdx]
				return m, func() tea.Msg {
					return AgentTierUpdatedMsg{Agent: curAgent.Name, Tier: curAgent.CurrentTier}
				}

			case "right", "l", "enter", " ":
				if err := m.CycleSelectedAgentTier(1); err != nil {
					m.statusMessage = fmt.Sprintf("✗ Error: %v", err)
					return m, nil
				}
				curAgent := m.agents[m.selectedAgentIdx]
				return m, func() tea.Msg {
					return AgentTierUpdatedMsg{Agent: curAgent.Name, Tier: curAgent.CurrentTier}
				}

			case "c", "C":
				if m.selectedAgentIdx >= 0 && m.selectedAgentIdx < len(m.agents) {
					agentName := m.agents[m.selectedAgentIdx].Name
					if err := m.SetAgentTier(agentName, "cheap"); err != nil {
						m.statusMessage = fmt.Sprintf("✗ Error: %v", err)
						return m, nil
					}
					return m, func() tea.Msg {
						return AgentTierUpdatedMsg{Agent: agentName, Tier: "cheap"}
					}
				}
				return m, nil

			case "d", "D":
				if m.selectedAgentIdx >= 0 && m.selectedAgentIdx < len(m.agents) {
					agentName := m.agents[m.selectedAgentIdx].Name
					if err := m.SetAgentTier(agentName, "default"); err != nil {
						m.statusMessage = fmt.Sprintf("✗ Error: %v", err)
						return m, nil
					}
					return m, func() tea.Msg {
						return AgentTierUpdatedMsg{Agent: agentName, Tier: "default"}
					}
				}
				return m, nil

			case "P":
				if m.selectedAgentIdx >= 0 && m.selectedAgentIdx < len(m.agents) {
					agentName := m.agents[m.selectedAgentIdx].Name
					if err := m.SetAgentTier(agentName, "premium"); err != nil {
						m.statusMessage = fmt.Sprintf("✗ Error: %v", err)
						return m, nil
					}
					return m, func() tea.Msg {
						return AgentTierUpdatedMsg{Agent: agentName, Tier: "premium"}
					}
				}
				return m, nil
			}
		}

	case tea.WindowSizeMsg:
		m.SetSize(msg.Width, msg.Height)
	}

	return m, nil
}

// View renders the Models Hub view.
func (m Model) View() string {
	boxWidth := m.width - 4
	if boxWidth < 30 {
		boxWidth = 30
	}

	nav := renderSubNav(m.mode, boxWidth)

	var mainContent string
	if m.mode == ModePresets {
		mainContent = renderPresetsView(m.presets, m.focusedPreset, boxWidth)
	} else if m.mode == ModeProviders {
		mainContent = renderProvidersView(m.providers, m.localModels, boxWidth)
	} else {
		mainContent = renderGranularView(m.agents, m.selectedAgentIdx, m.agentPage, m.agentsPerPage, boxWidth)
	}

	var toast string
	if m.statusMessage != "" {
		toastStyle := theme.StyleValueSuccess
		if strings.HasPrefix(m.statusMessage, "✗") {
			toastStyle = theme.StyleValueWarning
		}
		toast = toastStyle.Render(m.statusMessage)
	}

	elements := []string{nav, mainContent}
	if toast != "" {
		elements = append(elements, toast)
	}

	return lipgloss.JoinVertical(
		lipgloss.Left,
		elements...,
	)
}
