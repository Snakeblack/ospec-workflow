package models

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/snakeblack/ospec-workflow/internal/config"
	"github.com/snakeblack/ospec-workflow/internal/tui/theme"
)

var defaultAgentDefinitions = []struct {
	name        string
	category    string
	description string
}{
	{"sdd-orchestrator", "Core & Orquestación", "Orquestación del flujo y control de estado"},
	{"sdd-foundation", "Core & Orquestación", "Arranque de proyectos y scaffolding inicial"},
	{"sdd-workspace", "Core & Orquestación", "Federación y exploración multi-repo"},
	{"sdd-onboard", "Core & Orquestación", "Guía interactiva paso a paso para nuevos repos"},
	{"sdd-propose", "Fases de Especificación y Diseño", "Propuesta técnica y análisis de impacto"},
	{"sdd-spec", "Fases de Especificación y Diseño", "Especificación formal de requisitos OpenSpec"},
	{"sdd-clarify", "Fases de Especificación y Diseño", "Resolución interactiva de ambigüedades"},
	{"sdd-design", "Fases de Especificación y Diseño", "Diseño técnico, decisiones y diagramas"},
	{"sdd-tasks", "Fases de Especificación y Diseño", "Desglose jerárquico de tareas de código"},
	{"sdd-apply", "Implementación y Verificación", "Implementación TDD y ejecución de tareas"},
	{"sdd-verify", "Implementación y Verificación", "Verificación estricta de tests y calidad"},
	{"sdd-reconcile", "Implementación y Verificación", "Reconciliación retroactiva de código"},
	{"sdd-baseline", "Implementación y Verificación", "Generación de línea base de dominios"},
	{"sdd-archive", "Implementación y Verificación", "Cierre, versionado y archivado de cambios"},
	{"sdd-document", "Implementación y Verificación", "Documentación viva y sincronización OpenWiki"},
	{"sdd-init", "Implementación y Verificación", "Inicialización del entorno de desarrollo"},
	{"sdd-explore", "Implementación y Verificación", "Investigación exploratoria sin mutaciones"},
	{"review-change", "Comité Revisor (4R Gate)", "Evaluador generalista del cambio"},
	{"review-correction", "Comité Revisor (4R Gate)", "Validador de hallazgos corregidos"},
	{"review-readability", "Comité Revisor (4R Gate)", "Especialista en legibilidad y limpieza"},
	{"review-reliability", "Comité Revisor (4R Gate)", "Especialista en fiabilidad y casos límite"},
	{"review-resilience", "Comité Revisor (4R Gate)", "Especialista en resiliencia y recuperación"},
	{"review-risk", "Comité Revisor (4R Gate)", "Especialista en seguridad y riesgo"},
	{"_default", "Fallback Global", "Tier por defecto para agentes no declarados"},
}

var defaultTargetConfigs = []struct {
	id            string
	displayName   string
	description   string
	isSingleModel bool
}{
	{"claude", "Claude Code", "Aliases nativos: sonnet, opus, haiku, fable. Frontmatter: model + effort.", false},
	{"codex", "OpenAI Codex CLI", "TOML: model, model_reasoning_effort y model_verbosity.", false},
	{"antigravity", "Google Antigravity", "Solo model: inherit, flash, flash_lite o pro. Sin effort.", true},
	{"cursor", "Cursor", "Frontmatter model, con [effort=…] o [fast=true/false].", false},
	{"vscode", "VS Code (Copilot Chat)", "Frontmatter model (nombre o lista). Sin effort.", false},
	{"opencode", "OpenCode", "model provider/id con variante opcional #low|#medium|#high.", false},
}

type Model struct {
	repoRoot          string
	modelsMgr         *config.ModelsManager
	mode              SubMode
	focusedPreset     int
	presetZone        int
	presetTargetIdx   int
	presetPicks       []config.AgentAssignment
	presetAgentFocus  int
	presetAgentCol    int
	presetAgentPage   int
	activePreset      string
	presets           []PresetItem
	targetConfigs     []TargetConfigItem
	selectedTargetIdx int
	focusedRow        int
	focusedCol        int
	agents            []AgentRow
	selectedAgentIdx  int
	agentPage         int
	agentsPerPage     int
	picker            PickerState
	statusMessage     string
	width             int
	height            int
	hitStore          *[]Hit
}

func New(repoRoot string, mm *config.ModelsManager) Model {
	m := Model{
		repoRoot:          repoRoot,
		modelsMgr:         mm,
		mode:              ModePresets,
		focusedPreset:     1,
		selectedTargetIdx: 0,
		focusedCol:        colDefault,
		selectedAgentIdx:  0,
		agentsPerPage:     8,
		width:             80,
		hitStore:          &[]Hit{},
	}
	m.Refresh()
	return m
}

func (m Model) Init() tea.Cmd { return nil }

func (m *Model) SetSize(w, h int) {
	m.width = w
	m.height = h
}

func (m Model) Mode() SubMode         { return m.mode }
func (m Model) ActivePreset() string  { return m.activePreset }
func (m Model) FocusedPreset() int    { return m.focusedPreset }
func (m Model) Presets() []PresetItem { return m.presets }
func (m Model) TargetConfigs() []TargetConfigItem {
	return m.targetConfigs
}
func (m Model) SelectedTargetIndex() int { return m.selectedTargetIdx }
func (m Model) Agents() []AgentRow       { return m.agents }
func (m Model) AgentPage() int           { return m.agentPage }
func (m Model) SelectedAgentIndex() int  { return m.selectedAgentIdx }
func (m Model) StatusMessage() string    { return m.statusMessage }
func (m Model) IsPickerOpen() bool       { return m.picker.IsOpen }
func (m Model) ConsumesEsc() bool {
	return m.picker.IsOpen || (m.mode == ModePresets && m.presetZone != presetZoneCards)
}

func (m Model) PresetZone() int { return m.presetZone }

func (m *Model) Refresh() {
	activeP := "default"
	if p, err := m.modelsMgr.GetActivePreset(); err == nil && p != "" {
		activeP = strings.ToLower(p)
	}
	m.activePreset = activeP

	cfg, _ := m.modelsMgr.GetConfig()

	m.presets = []PresetItem{
		{
			ID:           "cheap",
			Title:        "Económico",
			Tagline:      "Velocidad y coste bajo",
			AgentSummary: "Casi todos bajan de nivel.",
			IsActive:     activeP == "cheap",
		},
		{
			ID:           "default",
			Title:        "Equilibrado",
			Tagline:      "El de cada día",
			AgentSummary: "Diseño y 4R en máximo; tasks en económico.",
			IsActive:     activeP == "default",
		},
		{
			ID:           "premium",
			Title:        "Máximo",
			Tagline:      "Más razonamiento",
			AgentSummary: "Arquitectura y review en máximo.",
			IsActive:     activeP == "premium",
		},
	}

	if cfg != nil {
		for i, p := range m.presets {
			if tier, ok := cfg.Tiers[p.ID]; ok {
				m.presets[i].ClaudeModel = tier.GetClaudeModel()
				m.presets[i].ClaudeEffort = tier.GetClaudeEffort()
				if tier.Codex != nil {
					m.presets[i].CodexModel = tier.Codex.Model
					m.presets[i].CodexEffort = tier.Codex.ModelReasoningEffort
				}
				baseOC, varOC := config.SplitOpenCodeModel(tier.OpenCode)
				m.presets[i].OpenCodeModel = baseOC
				m.presets[i].OpenCodeEffort = varOC
				baseCur, optCur := config.SplitCursorModel(tier.Cursor)
				m.presets[i].CursorModel = baseCur
				m.presets[i].CursorEffort = optCur
				m.presets[i].AntigravityModel = tier.Antigravity
				vsModels := tier.GetVSCodeModels()
				if len(vsModels) > 0 {
					m.presets[i].VSCodeModel = vsModels[0]
				}
			}
		}
	}

	m.targetConfigs = make([]TargetConfigItem, 0, len(defaultTargetConfigs))
	for _, tc := range defaultTargetConfigs {
		item := TargetConfigItem{
			ID:                tc.id,
			DisplayName:       tc.displayName,
			Description:       tc.description,
			IsSingleModel:     tc.isSingleModel,
			AvailableModels:   config.TargetAvailableModels[tc.id],
			SupportsEffort:    config.TargetSupportsEffort(tc.id),
			SupportsVerbosity: config.TargetSupportsVerbosity(tc.id),
			EffortValues:      config.EffortValues(tc.id),
			HasAssignments:    config.HasTargetAssignments(cfg, tc.id),
		}
		if cfg != nil {
			if cheapTier, ok := cfg.Tiers["cheap"]; ok {
				item.CheapModel, item.CheapEffort, item.CheapVerbosity = assignmentFor(cheapTier, tc.id)
			}
			if defTier, ok := cfg.Tiers["default"]; ok {
				item.DefaultModel, item.DefaultEffort, item.DefaultVerbosity = assignmentFor(defTier, tc.id)
			}
			if premTier, ok := cfg.Tiers["premium"]; ok {
				item.PremiumModel, item.PremiumEffort, item.PremiumVerbosity = assignmentFor(premTier, tc.id)
			}
		}
		m.targetConfigs = append(m.targetConfigs, item)
	}

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

func assignmentFor(tier config.TierConfig, targetID string) (model, effort, verbosity string) {
	switch targetID {
	case "claude":
		return tier.GetClaudeModel(), tier.GetClaudeEffort(), ""
	case "cursor":
		base, opt := config.SplitCursorModel(tier.Cursor)
		return base, opt, ""
	case "opencode":
		base, variant := config.SplitOpenCodeModel(tier.OpenCode)
		return base, variant, ""
	case "antigravity":
		return tier.Antigravity, "", ""
	case "codex":
		if tier.Codex == nil {
			return "", "", ""
		}
		return tier.Codex.Model, tier.Codex.ModelReasoningEffort, tier.Codex.ModelVerbosity
	case "vscode":
		models := tier.GetVSCodeModels()
		if len(models) > 0 {
			return models[0], "", ""
		}
		return "", "", ""
	default:
		return "", "", ""
	}
}

func (m *Model) ApplyPreset(preset string) (string, error) {
	if err := m.modelsMgr.ApplyPreset(preset); err != nil {
		return "", err
	}
	m.Refresh()
	presetCap := preset
	if len(preset) > 0 {
		presetCap = strings.ToUpper(preset[:1]) + strings.ToLower(preset[1:])
	}
	m.statusMessage = fmt.Sprintf("✓ Preset %s: los agentes SDD usarán este nivel. Los modelos de cada nivel no se tocan.", presetCap)
	return presetCap, nil
}

func (m *Model) SetAgentTier(agent string, tier string) error {
	if err := m.modelsMgr.SetAgentTier(agent, tier); err != nil {
		return err
	}
	if err := m.modelsMgr.Save(); err != nil {
		return err
	}
	m.Refresh()
	m.statusMessage = fmt.Sprintf("✓ %s → %s", agent, tier)
	return nil
}

func (m *Model) SetTargetModel(tierName string, targetID string, modelName string) error {
	if err := m.modelsMgr.SetTargetModel(tierName, targetID, modelName); err != nil {
		return err
	}
	if err := m.modelsMgr.Save(); err != nil {
		return err
	}
	m.Refresh()
	m.statusMessage = fmt.Sprintf("✓ %s [%s] modelo → %s", targetID, tierName, modelName)
	return nil
}

func (m *Model) setEffort(tierName, targetID, effort string) error {
	if err := m.modelsMgr.SetTargetEffort(tierName, targetID, effort); err != nil {
		return err
	}
	if err := m.modelsMgr.Save(); err != nil {
		return err
	}
	m.Refresh()
	m.statusMessage = fmt.Sprintf("✓ %s [%s] esfuerzo → %s", targetID, tierName, displayEffort(effort))
	return nil
}

func (m *Model) currentField() (targetID, tier, kind string) {
	if m.mode == ModePresets && m.presetZone == presetZoneAgents && len(m.targetConfigs) > 0 {
		tc := m.targetConfigs[m.presetTargetIdx]
		kind = "model"
		if m.presetAgentCol == 1 && tc.SupportsEffort {
			kind = "effort"
		}
		if m.presetAgentCol == 2 || (m.presetAgentCol == 1 && !tc.SupportsEffort && tc.SupportsVerbosity) {
			kind = "verbosity"
		}
		return tc.ID, m.presets[m.focusedPreset].ID, kind
	}
	if m.mode == ModeTargetModels && len(m.targetConfigs) > 0 {
		tc := m.targetConfigs[m.selectedTargetIdx]
		kind = "model"
		switch m.focusedRow {
		case rowEffort:
			kind = "effort"
		case rowVerbosity:
			kind = "verbosity"
		}
		return tc.ID, tierNameForCol(m.focusedCol), kind
	}
	return "", "", ""
}

func (m *Model) OpenPicker() {
	targetID, tier, kind := m.currentField()
	if targetID == "" || kind != "model" {
		return
	}
	current := ""
	agent := ""
	if m.mode == ModePresets && m.presetZone == presetZoneAgents {
		if m.presetAgentFocus >= 0 && m.presetAgentFocus < len(m.presetPicks) {
			current = m.presetPicks[m.presetAgentFocus].Model
		}
		names := config.AgentPickNames(targetID)
		if m.presetAgentFocus >= 0 && m.presetAgentFocus < len(names) {
			agent = names[m.presetAgentFocus]
		}
		m.picker = NewPickerState(targetID, tier, agent, current, nil)
		return
	}
	for _, t := range m.targetConfigs {
		if t.ID == targetID {
			current = t.ModelFor(colForTier(tier))
			break
		}
	}
	m.picker = NewPickerState(targetID, tier, "", current, nil)
}

func (m *Model) activateCurrent() error {
	targetID, tier, kind := m.currentField()
	switch kind {
	case "model":
		m.OpenPicker()
		return nil
	case "effort":
		return m.cycleEffort(tier, targetID, 1)
	case "verbosity":
		return m.cycleVerbosity(tier, 1)
	default:
		return nil
	}
}

func (m *Model) cycleModel(tier, targetID string, delta int) error {
	var avail []string
	var current string
	for _, t := range m.targetConfigs {
		if t.ID != targetID {
			continue
		}
		avail = t.AvailableModels
		current = t.ModelFor(colForTier(tier))
		break
	}
	if len(avail) == 0 {
		return nil
	}
	return m.SetTargetModel(tier, targetID, config.CycleValue(avail, current, delta))
}

func (m *Model) cycleEffort(tier, targetID string, delta int) error {
	values := config.EffortValues(targetID)
	if len(values) == 0 {
		return nil
	}
	current := ""
	for _, t := range m.targetConfigs {
		if t.ID == targetID {
			current = t.EffortFor(colForTier(tier))
			break
		}
	}
	return m.setEffort(tier, targetID, config.CycleValue(values, current, delta))
}

func (m *Model) cycleVerbosity(tier string, delta int) error {
	current := ""
	for _, t := range m.targetConfigs {
		if t.ID == "codex" {
			current = t.VerbosityFor(colForTier(tier))
			break
		}
	}
	next := config.CycleValue(config.VerbosityValues(), current, delta)
	if err := m.modelsMgr.SetCodexConfig(tier, "", "", next); err != nil {
		return err
	}
	if err := m.modelsMgr.Save(); err != nil {
		return err
	}
	m.Refresh()
	m.statusMessage = fmt.Sprintf("✓ Codex [%s] verbosity → %s", tier, next)
	return nil
}

func (m *Model) CycleSelectedAgentTier(delta int) error {
	if len(m.agents) == 0 || m.selectedAgentIdx < 0 || m.selectedAgentIdx >= len(m.agents) {
		return nil
	}
	agent := m.agents[m.selectedAgentIdx]
	tiers := []string{"cheap", "default", "premium"}
	return m.SetAgentTier(agent.Name, config.CycleValue(tiers, agent.CurrentTier, delta))
}

func (m Model) maxTargetRow() int {
	if m.selectedTargetIdx < 0 || m.selectedTargetIdx >= len(m.targetConfigs) {
		return rowModel
	}
	t := m.targetConfigs[m.selectedTargetIdx]
	if t.SupportsVerbosity {
		return rowVerbosity
	}
	if t.SupportsEffort {
		return rowEffort
	}
	return rowModel
}

func (m Model) Update(msg tea.Msg) (Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.MouseMsg:
		if msg.Action != tea.MouseActionPress || msg.Button != tea.MouseButtonLeft {
			return m, nil
		}
		return m.handleClick(msg.X, msg.Y)

	case tea.KeyMsg:
		if m.picker.IsOpen {
			closed, selectedModel, hasSelection := m.picker.Update(msg)
			if closed && hasSelection {
				if m.mode == ModePresets && m.presetZone == presetZoneAgents {
					if m.presetAgentFocus >= 0 && m.presetAgentFocus < len(m.presetPicks) {
						m.presetPicks[m.presetAgentFocus].Model = selectedModel
					}
				} else if m.picker.TargetID != "" {
					_ = m.SetTargetModel(m.picker.TierName, m.picker.TargetID, selectedModel)
				} else if m.picker.AgentName != "" {
					_ = m.SetAgentTier(m.picker.AgentName, selectedModel)
				}
			}
			return m, nil
		}

		switch msg.String() {
		case "1":
			m.mode = ModePresets
			return m, nil
		case "2":
			m.mode = ModeGranular
			return m, nil
		case "3":
			m.mode = ModeTargetModels
			return m, nil
		}

		if m.mode == ModePresets {
			return m.updatePresets(msg)
		}
		if m.mode == ModeTargetModels {
			return m.updateTargets(msg)
		}
		return m.updateAgents(msg)

	case tea.WindowSizeMsg:
		m.SetSize(msg.Width, msg.Height)
	}

	return m, nil
}

func (m Model) updatePresets(msg tea.KeyMsg) (Model, tea.Cmd) {
	if len(m.presets) == 0 {
		return m, nil
	}
	switch m.presetZone {
	case presetZoneTargets:
		return m.updatePresetTargets(msg)
	case presetZoneAgents:
		return m.updatePresetAgents(msg)
	}

	switch msg.String() {
	case "left", "h":
		m.focusedPreset = (m.focusedPreset + len(m.presets) - 1) % len(m.presets)
		return m, nil
	case "right", "l":
		m.focusedPreset = (m.focusedPreset + 1) % len(m.presets)
		return m, nil
	case "down", "j", "enter", " ":
		m.presetZone = presetZoneTargets
		m.presetTargetIdx = 0
		m.statusMessage = ""
		return m, nil
	}
	return m, nil
}

func (m Model) updatePresetTargets(msg tea.KeyMsg) (Model, tea.Cmd) {
	if len(m.targetConfigs) == 0 {
		return m, nil
	}
	switch msg.String() {
	case "esc", "b":
		m.presetZone = presetZoneCards
		return m, nil
	case "up", "k":
		if m.presetTargetIdx > 0 {
			m.presetTargetIdx--
		}
		return m, nil
	case "down", "j":
		if m.presetTargetIdx < len(m.targetConfigs)-1 {
			m.presetTargetIdx++
		}
		return m, nil
	case "a":
		return m.applyPresetToFocusedTarget()
	case "enter", " ":
		return m.enterPresetAgents()
	}
	return m, nil
}

func (m Model) enterPresetAgents() (Model, tea.Cmd) {
	if m.presetTargetIdx < 0 || m.presetTargetIdx >= len(m.targetConfigs) {
		return m, nil
	}
	tc := m.targetConfigs[m.presetTargetIdx]
	cfg, _ := m.modelsMgr.GetConfig()
	preset := ""
	if m.focusedPreset >= 0 && m.focusedPreset < len(m.presets) {
		preset = m.presets[m.focusedPreset].ID
	}
	m.presetPicks = config.BuildAgentPicks(cfg, tc.ID, preset)
	m.presetAgentFocus = 0
	m.presetAgentCol = 0
	m.presetAgentPage = 0
	m.presetZone = presetZoneAgents
	m.statusMessage = ""
	return m, nil
}

func (m Model) applyPresetToFocusedTarget() (Model, tea.Cmd) {
	if m.presetTargetIdx < 0 || m.presetTargetIdx >= len(m.targetConfigs) {
		return m, nil
	}
	tc := m.targetConfigs[m.presetTargetIdx]
	if !tc.HasAssignments {
		m.statusMessage = "Este cliente aún no está configurado. Enter abre los agentes para elegir modelos."
		return m, nil
	}
	preset := m.presets[m.focusedPreset]
	if err := m.modelsMgr.ApplyPresetToTarget(preset.ID, tc.ID); err != nil {
		m.statusMessage = fmt.Sprintf("✗ %v", err)
		return m, nil
	}
	m.Refresh()
	m.presetZone = presetZoneTargets
	m.statusMessage = fmt.Sprintf("✓ Preset %s aplicado a %s", preset.Title, tc.DisplayName)
	return m, func() tea.Msg { return PresetAppliedMsg{Preset: preset.Title} }
}

func (m Model) updatePresetAgents(msg tea.KeyMsg) (Model, tea.Cmd) {
	if m.presetTargetIdx < 0 || m.presetTargetIdx >= len(m.targetConfigs) {
		return m, nil
	}
	tc := m.targetConfigs[m.presetTargetIdx]
	n := len(m.presetPicks)
	cols := config.AssignmentColumnCount(tc.ID)
	pageSize := assignmentPageSize

	switch msg.String() {
	case "esc", "b":
		m.presetZone = presetZoneTargets
		return m, nil
	case "up", "k":
		if m.presetAgentFocus > 0 {
			m.presetAgentFocus--
			m.presetAgentPage = m.presetAgentFocus / pageSize
		}
	case "down", "j":
		if m.presetAgentFocus < n-1 {
			m.presetAgentFocus++
			m.presetAgentPage = m.presetAgentFocus / pageSize
		}
	case "left", "h":
		if m.presetAgentCol > 0 {
			m.presetAgentCol--
		} else {
			m.cyclePresetAssignment(-1)
		}
	case "right", "l":
		if m.presetAgentCol < cols-1 {
			m.presetAgentCol++
		} else {
			m.cyclePresetAssignment(1)
		}
	case " ":
		m.cyclePresetAssignment(1)
	case "/":
		m.OpenPicker()
	case "pgdown":
		if (m.presetAgentPage+1)*pageSize < n {
			m.presetAgentPage++
			m.presetAgentFocus = m.presetAgentPage * pageSize
		}
	case "pgup":
		if m.presetAgentPage > 0 {
			m.presetAgentPage--
			m.presetAgentFocus = m.presetAgentPage * pageSize
		}
	case "enter":
		if err := m.modelsMgr.SaveTargetAssignments(tc.ID, m.presetPicks); err != nil {
			m.statusMessage = fmt.Sprintf("✗ %v", err)
			return m, nil
		}
		m.Refresh()
		m.presetZone = presetZoneTargets
		m.statusMessage = fmt.Sprintf("✓ Modelos de %s guardados (%s)", tc.DisplayName, m.presets[m.focusedPreset].Title)
		return m, func() tea.Msg { return PresetAppliedMsg{Preset: m.presets[m.focusedPreset].Title} }
	}
	return m, nil
}

func (m *Model) cyclePresetAssignment(delta int) {
	if m.presetTargetIdx < 0 || m.presetTargetIdx >= len(m.targetConfigs) {
		return
	}
	if m.presetAgentFocus < 0 || m.presetAgentFocus >= len(m.presetPicks) {
		return
	}
	id := m.targetConfigs[m.presetTargetIdx].ID
	m.presetPicks[m.presetAgentFocus] = config.CycleAssignmentField(id, m.presetPicks[m.presetAgentFocus], m.presetAgentCol, delta)
}

func (m Model) updateTargets(msg tea.KeyMsg) (Model, tea.Cmd) {
	if len(m.targetConfigs) == 0 {
		return m, nil
	}
	switch msg.String() {
	case "pgdown", "]":
		m.selectedTargetIdx = (m.selectedTargetIdx + 1) % len(m.targetConfigs)
		m.focusedRow = rowModel
		return m, nil
	case "pgup", "[":
		m.selectedTargetIdx = (m.selectedTargetIdx + len(m.targetConfigs) - 1) % len(m.targetConfigs)
		m.focusedRow = rowModel
		return m, nil
	case "up", "k":
		if m.focusedRow > 0 {
			m.focusedRow--
		}
		return m, nil
	case "down", "j":
		if m.focusedRow < m.maxTargetRow() {
			m.focusedRow++
		}
		return m, nil
	case "left", "h":
		if m.focusedCol > 0 {
			m.focusedCol--
		}
		return m, nil
	case "right", "l":
		if m.focusedCol < colPremium {
			m.focusedCol++
		}
		return m, nil
	case "enter", " ":
		if err := m.activateCurrent(); err != nil {
			m.statusMessage = fmt.Sprintf("✗ %v", err)
		}
		return m, nil
	}
	return m, nil
}

func (m Model) updateAgents(msg tea.KeyMsg) (Model, tea.Cmd) {
	if len(m.agents) == 0 {
		return m, nil
	}
	pageSize := m.agentsPerPage
	if pageSize <= 0 {
		pageSize = 8
	}
	totalPages := (len(m.agents) + pageSize - 1) / pageSize

	switch msg.String() {
	case "pgdown":
		if m.agentPage < totalPages-1 {
			m.agentPage++
			m.selectedAgentIdx = m.agentPage * pageSize
		}
		return m, nil
	case "pgup":
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
			m.statusMessage = fmt.Sprintf("✗ %v", err)
			return m, nil
		}
		cur := m.agents[m.selectedAgentIdx]
		return m, func() tea.Msg { return AgentTierUpdatedMsg{Agent: cur.Name, Tier: cur.CurrentTier} }
	case "right", "l", "enter", " ":
		if err := m.CycleSelectedAgentTier(1); err != nil {
			m.statusMessage = fmt.Sprintf("✗ %v", err)
			return m, nil
		}
		cur := m.agents[m.selectedAgentIdx]
		return m, func() tea.Msg { return AgentTierUpdatedMsg{Agent: cur.Name, Tier: cur.CurrentTier} }
	}
	return m, nil
}

func (m Model) handleClick(x, y int) (Model, tea.Cmd) {
	if m.picker.IsOpen {
		for _, h := range m.hitList() {
			if h.Kind == "picker" && h.Contains(x, y) && h.Index >= 0 && h.Index < len(m.picker.FilteredItems) {
				selected := m.picker.FilteredItems[h.Index].ID
				m.picker.IsOpen = false
				if m.mode == ModePresets && m.presetZone == presetZoneAgents {
					if m.presetAgentFocus >= 0 && m.presetAgentFocus < len(m.presetPicks) {
						m.presetPicks[m.presetAgentFocus].Model = selected
					}
				} else {
					_ = m.SetTargetModel(m.picker.TierName, m.picker.TargetID, selected)
				}
				return m, nil
			}
		}
		return m, nil
	}

	for _, h := range m.hitList() {
		if !h.Contains(x, y) {
			continue
		}
		switch h.Kind {
		case "subnav":
			m.mode = SubMode(h.Index)
			return m, nil
		case "preset":
			alreadyFocused := m.focusedPreset == h.Index && m.presetZone == presetZoneCards
			m.focusedPreset = h.Index
			if alreadyFocused || m.presetZone == presetZoneCards {
				m.presetZone = presetZoneTargets
				m.presetTargetIdx = 0
			}
			return m, nil
		case "ptarget":
			m.presetZone = presetZoneTargets
			m.presetTargetIdx = h.Index
			if h.Extra == 1 {
				return m.applyPresetToFocusedTarget()
			}
			return m.enterPresetAgents()
		case "target":
			if m.mode == ModePresets {
				m.presetTargetIdx = h.Index
				return m.enterPresetAgents()
			}
			m.selectedTargetIdx = h.Index
			m.focusedRow = rowModel
			return m, nil
		case "tcell":
			m.focusedRow = h.Index
			m.focusedCol = h.Extra
			if err := m.activateCurrent(); err != nil {
				m.statusMessage = fmt.Sprintf("✗ %v", err)
			}
			return m, nil
		case "agent":
			if m.mode == ModePresets && m.presetZone == presetZoneAgents {
				m.presetAgentFocus = h.Index
				m.presetAgentCol = h.Extra
				m.presetAgentPage = m.presetAgentFocus / assignmentPageSize
				if h.Extra == 0 {
					m.OpenPicker()
				} else {
					m.cyclePresetAssignment(1)
				}
				return m, nil
			}
			if m.selectedAgentIdx == h.Index {
				_ = m.CycleSelectedAgentTier(1)
				cur := m.agents[m.selectedAgentIdx]
				return m, func() tea.Msg { return AgentTierUpdatedMsg{Agent: cur.Name, Tier: cur.CurrentTier} }
			}
			m.selectedAgentIdx = h.Index
			if m.agentsPerPage > 0 {
				m.agentPage = h.Index / m.agentsPerPage
			}
			return m, nil
		case "page":
			if m.mode == ModePresets && m.presetZone == presetZoneAgents {
				n := len(m.presetPicks)
				if h.Extra > 0 && (m.presetAgentPage+1)*assignmentPageSize < n {
					m.presetAgentPage++
					m.presetAgentFocus = m.presetAgentPage * assignmentPageSize
				} else if h.Extra < 0 && m.presetAgentPage > 0 {
					m.presetAgentPage--
					m.presetAgentFocus = m.presetAgentPage * assignmentPageSize
				}
				return m, nil
			}
			pageSize := m.agentsPerPage
			if pageSize <= 0 {
				pageSize = 8
			}
			totalPages := (len(m.agents) + pageSize - 1) / pageSize
			if h.Extra > 0 && m.agentPage < totalPages-1 {
				m.agentPage++
				m.selectedAgentIdx = m.agentPage * pageSize
			} else if h.Extra < 0 && m.agentPage > 0 {
				m.agentPage--
				m.selectedAgentIdx = m.agentPage * pageSize
			}
			return m, nil
		}
	}
	return m, nil
}

func (m Model) hitList() []Hit {
	if m.hitStore == nil {
		return nil
	}
	return *m.hitStore
}

func (m Model) View() string {
	boxWidth := m.width - 4
	if boxWidth < 30 {
		boxWidth = 30
	}

	if m.picker.IsOpen {
		view, hits := m.picker.Render(boxWidth)
		if m.hitStore != nil {
			*m.hitStore = hits
		}
		return view
	}

	nav, navHits := renderSubNav(m.mode, boxWidth)
	navH := lipgloss.Height(nav)

	var mainContent string
	var contentHits []Hit
	if m.mode == ModePresets {
		mainContent, contentHits = renderPresetsView(m.presets, m.focusedPreset, m.presetZone, m.presetTargetIdx, m.presetPicks, m.presetAgentFocus, m.presetAgentCol, m.presetAgentPage, m.targetConfigs, boxWidth)
	} else if m.mode == ModeTargetModels {
		mainContent, contentHits = renderTargetModelsView(m.targetConfigs, m.selectedTargetIdx, m.focusedRow, m.focusedCol, boxWidth)
	} else {
		mainContent, contentHits = renderGranularView(m.agents, m.selectedAgentIdx, m.agentPage, m.agentsPerPage, boxWidth)
	}

	offsetHits := make([]Hit, 0, len(navHits)+len(contentHits))
	offsetHits = append(offsetHits, navHits...)
	for _, h := range contentHits {
		h.Y += navH + 1
		offsetHits = append(offsetHits, h)
	}
	if m.hitStore != nil {
		*m.hitStore = offsetHits
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
	return lipgloss.JoinVertical(lipgloss.Left, elements...)
}
